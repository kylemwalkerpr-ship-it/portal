-- YQAA offer retry/race guard. Apply through the repository's normal migration
-- process before enabling this code; this migration is not applied here.
-- Existing offers retain NULL and are unaffected. One generated offer can be
-- associated with only one client trigger message, even across worker instances.
alter table public.offers
  add column if not exists yqaa_idempotency_key text;

create unique index if not exists offers_yqaa_idempotency_key_uidx
  on public.offers (yqaa_idempotency_key)
  where yqaa_idempotency_key is not null;

comment on column public.offers.yqaa_idempotency_key is
  'Atomic idempotency key for an AI-generated YQAA offer, derived from the conversation and triggering client message. NULL for human and legacy offers.';

-- One durable winner for the complete YQAA turn. This is deliberately a
-- service-only ledger: callers must use the RPC below so reply, offer, memory,
-- provider-attention state, and audit rows commit or roll back together.
create table if not exists public.yqaa_reply_commits (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger_message_id uuid not null references public.conversation_messages(id) on delete cascade,
  reply_message_id uuid not null references public.conversation_messages(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  committed_at timestamptz not null default now(),
  primary key (conversation_id, trigger_message_id)
);

alter table public.yqaa_reply_commits enable row level security;
revoke all on public.yqaa_reply_commits from public, anon, authenticated;
grant select, insert, update, delete on public.yqaa_reply_commits to service_role;
drop policy if exists yqaa_reply_commits_service_only on public.yqaa_reply_commits;
create policy yqaa_reply_commits_service_only on public.yqaa_reply_commits
  for all to service_role using (true) with check (true);

create or replace function public.commit_yqaa_reply(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_reply jsonb,
  p_offer jsonb,
  p_conversation_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_trigger public.conversation_messages%rowtype;
  v_provider_id uuid;
  v_client_id uuid;
  v_provider_role text;
  v_existing public.yqaa_reply_commits%rowtype;
  v_reply_id uuid;
  v_offer_id uuid;
  v_offer_row public.offers%rowtype;
  v_offer_message_id uuid;
  v_reply_metadata jsonb;
  v_conversation_metadata jsonb;
  v_offer_message jsonb;
  v_audit jsonb;
  v_inquiry_message jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_conversation_id is null or p_trigger_message_id is null
     or jsonb_typeof(p_reply) <> 'object'
     or jsonb_typeof(p_conversation_metadata) <> 'object' then
    raise exception 'invalid YQAA commit payload' using errcode = '22023';
  end if;

  -- Serialize commits for this thread and then return the durable winner for
  -- this trigger. The lock is cross-worker and held through the transaction.
  select * into v_conversation
    from public.conversations c
   where c.id = p_conversation_id
   for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  select * into v_trigger
    from public.conversation_messages m
   where m.id = p_trigger_message_id
     and m.conversation_id = p_conversation_id
   for share;
  if not found then
    raise exception 'trigger message does not belong to conversation' using errcode = '42501';
  end if;

  select p.id, lower(p.role) into v_provider_id, v_provider_role
    from public.profiles p
   where p.id in (v_conversation.participant_a, v_conversation.participant_b)
     and lower(p.role) in ('attorney', 'consultant');
  select p.id into v_client_id
    from public.profiles p
   where p.id in (v_conversation.participant_a, v_conversation.participant_b)
     and lower(p.role) in ('client', 'student');
  if v_provider_id is null or v_client_id is null
     or v_trigger.sender_id is distinct from v_client_id
     or (p_reply->>'sender_id')::uuid is distinct from v_provider_id then
    raise exception 'trigger or reply participant mismatch' using errcode = '42501';
  end if;

  select * into v_existing
    from public.yqaa_reply_commits r
   where r.conversation_id = p_conversation_id
     and r.trigger_message_id = p_trigger_message_id;
  if found then
    return jsonb_build_object('reply_message_id', v_existing.reply_message_id, 'offer_id', v_existing.offer_id);
  end if;
  if coalesce(v_conversation.metadata->>'ai_mode', 'auto') in ('paused', 'off')
     and p_conversation_metadata->>'ai_mode' = 'auto' then
    raise exception 'YQAA was paused before the reply commit' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.conversation_messages later
     where later.conversation_id = p_conversation_id
       and later.sender_id = v_client_id
       and (later.created_at, later.id) > (v_trigger.created_at, v_trigger.id)
  ) then
    raise exception 'trigger message is no longer the latest client message' using errcode = '40001';
  end if;

  v_reply_metadata := coalesce(p_reply->'metadata', '{}'::jsonb)
    || jsonb_build_object('yqaa_trigger_message_id', p_trigger_message_id);
  insert into public.conversation_messages (
    conversation_id, sender_id, type, body, metadata
  ) values (
    p_conversation_id, v_provider_id, 'text', p_reply->>'body', v_reply_metadata
  ) returning id into v_reply_id;

  if p_offer is not null then
    if jsonb_typeof(p_offer) <> 'object'
       or jsonb_typeof(p_offer->'row') <> 'object'
       or jsonb_typeof(p_offer->'message') <> 'object'
       or p_offer->>'idempotency_key' <> ('yqaa:' || p_conversation_id::text || ':' || p_trigger_message_id::text) then
      raise exception 'invalid YQAA offer payload' using errcode = '22023';
    end if;
    if (p_offer->'row'->>'sender_id')::uuid is distinct from v_provider_id
       or (p_offer->'row'->>'recipient_id')::uuid is distinct from v_client_id
       or p_offer->'row'->>'sender_type' is distinct from v_provider_role
       or p_offer->'row'->>'yqaa_idempotency_key' is distinct from p_offer->>'idempotency_key' then
      raise exception 'offer participant mismatch' using errcode = '42501';
    end if;
    if v_provider_role = 'consultant'
       and (p_offer->'row'->>'chat_id')::uuid is distinct from p_conversation_id then
      raise exception 'consultant offer conversation mismatch' using errcode = '42501';
    elsif v_provider_role = 'attorney' and not exists (
      select 1 from public.inquiries i
       where i.id = (p_offer->'row'->>'chat_id')::uuid
         and i.client_profile_id = v_client_id
         and i.target_attorney_profile_id = v_provider_id
    ) then
      raise exception 'attorney offer inquiry mismatch' using errcode = '42501';
    end if;
    if (v_provider_role = 'attorney'
        and (p_offer->'message'->>'ref_inquiry_id')::uuid is distinct from (p_offer->'row'->>'chat_id')::uuid)
       or (v_provider_role = 'consultant'
        and nullif(p_offer->'message'->>'ref_inquiry_id', '') is not null) then
      raise exception 'offer message inquiry mismatch' using errcode = '42501';
    end if;
    if jsonb_typeof(p_offer->'inquiry_message') = 'object'
       and ((p_offer->'inquiry_message'->>'inquiry_id')::uuid is distinct from (p_offer->'row'->>'chat_id')::uuid
         or (p_offer->'inquiry_message'->>'sender_profile_id')::uuid is distinct from v_provider_id) then
      raise exception 'legacy inquiry message participant mismatch' using errcode = '42501';
    end if;
    if nullif(p_offer->'row'->>'gig_id', '') is not null and not exists (
      select 1 from public.gigs g
       where g.id = (p_offer->'row'->>'gig_id')::uuid
         and g.provider_id = v_provider_id
         and g.status <> 'archived'
    ) then
      raise exception 'offer gig does not belong to provider' using errcode = '42501';
    end if;

    insert into public.offers (
      chat_id, sender_id, sender_type, recipient_id, title, description,
      price, currency, delivery_days, revisions, expires_at,
      yqaa_idempotency_key, gig_id
    ) values (
      (p_offer->'row'->>'chat_id')::uuid,
      (p_offer->'row'->>'sender_id')::uuid,
      p_offer->'row'->>'sender_type',
      (p_offer->'row'->>'recipient_id')::uuid,
      p_offer->'row'->>'title',
      p_offer->'row'->>'description',
      (p_offer->'row'->>'price')::integer,
      p_offer->'row'->>'currency',
      (p_offer->'row'->>'delivery_days')::integer,
      (p_offer->'row'->>'revisions')::integer,
      (p_offer->'row'->>'expires_at')::timestamptz,
      p_offer->>'idempotency_key',
      nullif(p_offer->'row'->>'gig_id', '')::uuid
    )
      on conflict (yqaa_idempotency_key) where yqaa_idempotency_key is not null do nothing
      returning id into v_offer_id;
    if v_offer_id is null then
      select o.id into v_offer_id from public.offers o
       where o.yqaa_idempotency_key = p_offer->>'idempotency_key';
    end if;
    if v_offer_id is null then
      raise exception 'YQAA offer persistence failed' using errcode = 'P0001';
    end if;
    select * into v_offer_row from public.offers o where o.id = v_offer_id;
    if v_offer_row.sender_id is distinct from v_provider_id
       or v_offer_row.recipient_id is distinct from v_client_id
       or v_offer_row.sender_type is distinct from v_provider_role
       or v_offer_row.chat_id is distinct from (p_offer->'row'->>'chat_id')::uuid
       or v_offer_row.title is distinct from p_offer->'row'->>'title'
       or v_offer_row.description is distinct from p_offer->'row'->>'description'
       or v_offer_row.price is distinct from (p_offer->'row'->>'price')::integer
       or v_offer_row.currency is distinct from p_offer->'row'->>'currency'
       or v_offer_row.delivery_days is distinct from (p_offer->'row'->>'delivery_days')::integer
       or v_offer_row.status <> 'pending' then
      raise exception 'existing idempotent offer payload mismatch' using errcode = '42501';
    end if;

    v_offer_message := p_offer->'message';
    select m.id into v_offer_message_id
      from public.conversation_messages m
     where m.conversation_id = p_conversation_id
       and m.ref_offer_id = v_offer_id and m.type = 'offer'
     limit 1;
    if v_offer_message_id is null then
      insert into public.conversation_messages (
        conversation_id, sender_id, type, body, ref_offer_id, ref_inquiry_id, metadata
      ) values (
        p_conversation_id, v_provider_id, 'offer', v_offer_message->>'body', v_offer_id,
        nullif(v_offer_message->>'ref_inquiry_id', '')::uuid,
        coalesce(v_offer_message->'metadata', '{}'::jsonb)
      ) returning id into v_offer_message_id;
    end if;

    v_inquiry_message := p_offer->'inquiry_message';
    if jsonb_typeof(v_inquiry_message) = 'object' then
      insert into public.inquiry_messages (inquiry_id, sender_role, sender_profile_id, body)
      values (
        (v_inquiry_message->>'inquiry_id')::uuid,
        v_inquiry_message->>'sender_role',
        (v_inquiry_message->>'sender_profile_id')::uuid,
        v_inquiry_message->>'body'
      );
    end if;

    v_audit := coalesce(p_offer->'audit', '{}'::jsonb);
    insert into public.admin_audit_log (
      admin_id, action_type, target_table, target_id, payload_snapshot, reason
    ) values (
      null, 'yqaa_offer_created', 'offers', v_offer_id, v_audit,
      'YQAA Messenger offer passed deterministic marketplace pricing authority.'
    );
  end if;

  -- Merge only the explicitly changed keys against the locked current row so
  -- concurrent provider/admin metadata updates survive generation latency.
  v_conversation_metadata := coalesce(v_conversation.metadata, '{}'::jsonb) || p_conversation_metadata;
  if v_offer_id is not null then
    v_conversation_metadata := jsonb_set(
      v_conversation_metadata,
      '{ai_memory,last_offer,offer_id}', to_jsonb(v_offer_id::text), true
    );
    v_conversation_metadata := jsonb_set(
      v_conversation_metadata,
      '{ai_memory,last_offer,created_at}', to_jsonb(clock_timestamp()), true
    );
  end if;
  v_conversation_metadata := v_conversation_metadata
    || jsonb_build_object('ai_last_message_id', v_reply_id, 'ai_last_offer_id', v_offer_id);
  update public.conversations
     set metadata = v_conversation_metadata, updated_at = clock_timestamp()
   where id = p_conversation_id;

  insert into public.yqaa_reply_commits (
    conversation_id, trigger_message_id, reply_message_id, offer_id
  ) values (p_conversation_id, p_trigger_message_id, v_reply_id, v_offer_id);

  return jsonb_build_object('reply_message_id', v_reply_id, 'offer_id', v_offer_id);
end;
$$;

revoke all on function public.commit_yqaa_reply(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_yqaa_reply(uuid, uuid, jsonb, jsonb, jsonb) to service_role;
