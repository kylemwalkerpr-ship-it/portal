-- Q02 DM vertical slice. No anonymous identity or cross-site linking is created.
-- Scope is the existing conversation's canonical client/provider pair.
create table public.yqaa_consent (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  subject_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  version bigint not null default 0 check (version >= 0),
  granted boolean not null default false,
  cross_site_linking boolean not null default false check (not cross_site_linking),
  memory_after timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (subject_id <> provider_id)
);
-- Narrative-free mutation receipts support exact duplicate retries, including
-- retries after later mutations. Never return an old receipt as current consent.
create table public.yqaa_privacy_mutations (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid not null,
  subject_id uuid not null references public.profiles(id),
  action text not null check (action in ('grant', 'forget', 'withdraw')),
  expected_version bigint not null,
  explicit_opt_in boolean not null,
  result_version bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, request_id)
);
alter table public.yqaa_consent enable row level security;
alter table public.yqaa_privacy_mutations enable row level security;
create policy yqaa_consent_browser_deny on public.yqaa_consent
  for all to anon, authenticated using (false) with check (false);
create policy yqaa_privacy_mutations_browser_deny on public.yqaa_privacy_mutations
  for all to anon, authenticated using (false) with check (false);
-- Clerk authenticates at the portal boundary, not auth.uid(). No browser role
-- has a policy; only the existing authenticated server service-role adapter acts.
revoke all on public.yqaa_consent, public.yqaa_privacy_mutations from public, anon, authenticated;
grant select, insert, update, delete on public.yqaa_consent, public.yqaa_privacy_mutations to service_role;

create function public.mutate_yqaa_privacy(
  p_conversation_id uuid, p_subject_id uuid, p_expected_version bigint,
  p_request_id uuid, p_action text, p_explicit_opt_in boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations%rowtype;
  s public.yqaa_consent%rowtype;
  r public.yqaa_privacy_mutations%rowtype;
  provider uuid;
  epoch bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_request_id is null or p_subject_id is null or p_expected_version is null
     or p_expected_version < 0 or p_action is null
     or p_action not in ('grant','forget','withdraw')
     or p_explicit_opt_in is null
     or (p_action = 'grant' and not p_explicit_opt_in) then
    raise exception 'invalid privacy mutation' using errcode = '22023';
  end if;
  -- Same lock and order as commit_yqaa_reply: withdrawal and reply linearize.
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or p_subject_id not in (c.participant_a, c.participant_b)
     or not exists (select 1 from public.profiles where id = p_subject_id and lower(role) in ('client','student')) then
    raise exception 'subject not authorized' using errcode = '42501';
  end if;
  select id into provider from public.profiles
    where id in (c.participant_a,c.participant_b) and lower(role) in ('attorney','consultant');
  if provider is null then raise exception 'invalid provider scope' using errcode = '42501'; end if;
  select * into r from public.yqaa_privacy_mutations
    where conversation_id = p_conversation_id and request_id = p_request_id;
  if found then
    if r.subject_id <> p_subject_id or r.action <> p_action
       or r.expected_version <> p_expected_version or r.explicit_opt_in <> p_explicit_opt_in then
      raise exception 'request id reused' using errcode = '22023';
    end if;
    return jsonb_build_object('version',r.result_version,'replayed',true);
  end if;
  select * into s from public.yqaa_consent where conversation_id = p_conversation_id;
  epoch := coalesce(s.version,0);
  if epoch <> p_expected_version then raise exception 'privacy version conflict' using errcode = '40001'; end if;
  if s.conversation_id is not null and (s.subject_id <> p_subject_id or s.provider_id <> provider) then
    raise exception 'privacy scope changed' using errcode = '42501';
  end if;
  insert into public.yqaa_consent(conversation_id,subject_id,provider_id,version,granted,memory_after)
    values(p_conversation_id,p_subject_id,provider,epoch+1,
      case p_action when 'grant' then true when 'withdraw' then false else coalesce(s.granted,false) end,
      clock_timestamp())
    on conflict(conversation_id) do update set version = excluded.version,
      granted = excluded.granted, memory_after = excluded.memory_after, updated_at = clock_timestamp();
  -- Remove derived memory only. Orders/messages/offers/payment/audit remain.
  -- Old workers cannot restore this snapshot: the trigger below requires epoch.
  update public.conversations set metadata = coalesce(metadata,'{}'::jsonb) - 'ai_memory',
    updated_at = clock_timestamp() where id = p_conversation_id;
  insert into public.yqaa_privacy_mutations
    (conversation_id,request_id,subject_id,action,expected_version,explicit_opt_in,result_version)
    values(p_conversation_id,p_request_id,p_subject_id,p_action,p_expected_version,p_explicit_opt_in,epoch+1);
  return jsonb_build_object('version',epoch+1,'replayed',false);
end;
$$;
revoke all on function public.mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean) to service_role;

create function public.fence_yqaa_memory_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.yqaa_consent%rowtype;
begin
  if new.metadata->'ai_memory' is distinct from old.metadata->'ai_memory'
     and new.metadata->'ai_memory' is not null and new.metadata->'ai_memory' <> 'null'::jsonb then
    select * into s from public.yqaa_consent where conversation_id = new.id;
    if not found or not s.granted or s.cross_site_linking
       or s.subject_id not in (new.participant_a, new.participant_b)
       or s.provider_id not in (new.participant_a, new.participant_b)
       or not exists (select 1 from public.profiles where id = s.subject_id and lower(role) in ('client','student'))
       or not exists (select 1 from public.profiles where id = s.provider_id and lower(role) in ('attorney','consultant'))
       or new.metadata->'ai_memory'->>'consent_version' is distinct from s.version::text then
      raise exception 'stale or unconsented derived memory' using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fence_yqaa_memory_write() from public, anon, authenticated;
create trigger yqaa_memory_privacy_fence before update of metadata on public.conversations
  for each row execute function public.fence_yqaa_memory_write();

-- Existing Q01 atomic commit body follows, with one consent gate after durable
-- replay lookup and before any effect. All callers/wrappers retain their owner.
-- Preserve Q01 non-retryable business rejection classification from
-- 20261014230000; stale consent is also permanent for this envelope.
-- Privacy mutation CAS conflicts above remain 40001 for the controls API.
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
  if not exists (
    select 1 from public.yqaa_consent s
    where s.conversation_id = p_conversation_id and s.subject_id = v_client_id
      and s.provider_id = v_provider_id and s.granted and not s.cross_site_linking
      and s.version::text = p_reply->'metadata'->>'yqaa_consent_version'
      and v_trigger.created_at > s.memory_after
  ) then
    raise exception 'consent changed before reply commit' using errcode = 'P0001';
  end if;
  if coalesce(v_conversation.metadata->>'ai_mode', 'auto') in ('paused', 'off') then
    raise exception 'YQAA was paused before the reply commit' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.conversation_messages later
     where later.conversation_id = p_conversation_id
       and later.sender_id = v_client_id
       and (later.created_at, later.id) > (v_trigger.created_at, v_trigger.id)
  ) then
    raise exception 'trigger message is no longer the latest client message' using errcode = 'P0001';
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
