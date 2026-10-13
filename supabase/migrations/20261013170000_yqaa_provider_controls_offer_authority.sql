-- Approval authority is explicit in the offer payload and is consumed by the
-- same transaction that commits the reply and offer. The legacy insert trigger
-- inferred authority from conversation metadata and could silently fail open.

-- Preferences are written only through the Clerk-authenticated service client.
-- auth.uid() is not the application's profile identity.
drop policy if exists provider_pricing_preferences_own_row on public.provider_pricing_preferences;
revoke all on public.provider_pricing_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.provider_pricing_preferences to service_role;
drop policy if exists provider_pricing_preferences_service_only on public.provider_pricing_preferences;
create policy provider_pricing_preferences_service_only on public.provider_pricing_preferences
  for all to service_role using (true) with check (true);

drop trigger if exists offers_consume_yqaa_pricing_approval on public.offers;

create or replace function public.commit_yqaa_reply_with_pricing_approval(
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
  v_approval public.yqaa_pricing_approvals%rowtype;
  v_request_id uuid;
  v_version integer;
  v_provider_id uuid;
  v_price_cents integer;
  v_scope_hash text;
  v_gig_id uuid;
  v_committed public.yqaa_reply_commits%rowtype;
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_offer) <> 'object' or jsonb_typeof(p_offer->'approval') <> 'object' then
    raise exception 'approval-backed offer requires explicit approval authority' using errcode = '22023';
  end if;
  begin
    v_request_id := (p_offer->'approval'->>'request_id')::uuid;
    v_version := (p_offer->'approval'->>'version')::integer;
    v_provider_id := (p_offer->'approval'->>'provider_id')::uuid;
    v_price_cents := (p_offer->'approval'->>'price_cents')::integer;
    v_scope_hash := p_offer->'approval'->>'scope_hash';
    v_gig_id := nullif(p_offer->'approval'->>'gig_id', '')::uuid;
  exception when others then
    raise exception 'invalid approval authority payload' using errcode = '22023';
  end;
  if (p_offer->'approval'->>'conversation_id')::uuid is distinct from p_conversation_id
     or v_request_id is null or v_version < 1 or v_provider_id is null
     or v_price_cents < 100 or nullif(v_scope_hash, '') is null
     or p_offer->'audit'->'approval_authority' is distinct from p_offer->'approval'
     or (p_offer->'row'->>'price')::integer is distinct from v_price_cents
     or nullif(p_offer->'row'->>'gig_id', '')::uuid is distinct from v_gig_id then
    raise exception 'approval authority does not match the offer' using errcode = '42501';
  end if;

  -- Serialize approval-backed commits per conversation. A retry for an already
  -- committed trigger returns the winner without trying to consume twice.
  select * into v_conversation from public.conversations c
   where c.id = p_conversation_id for update;
  if not found then raise exception 'conversation not found' using errcode = 'P0002'; end if;
  select * into v_committed from public.yqaa_reply_commits r
   where r.conversation_id = p_conversation_id and r.trigger_message_id = p_trigger_message_id;
  if found then
    return public.commit_yqaa_reply(
      p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
    );
  end if;

  if coalesce(v_conversation.metadata->>'ai_pricing_approval_status', '') <> 'approved'
     or v_conversation.metadata->>'ai_pricing_approval_request_id' <> v_request_id::text
     or coalesce((v_conversation.metadata->>'ai_pricing_approval_version')::integer, 1) <> v_version
     or coalesce((v_conversation.metadata->>'ai_pricing_approval_price_cents')::integer, 0) <> v_price_cents
     or v_conversation.metadata->>'ai_pricing_approval_scope_hash' is distinct from v_scope_hash
     or nullif(v_conversation.metadata->>'ai_pricing_approval_gig_id', '')::uuid is distinct from v_gig_id
     or p_conversation_metadata->>'ai_last_scope_hash' is distinct from v_scope_hash then
    raise exception 'approval request is no longer current' using errcode = '40001';
  end if;

  select * into v_approval from public.yqaa_pricing_approvals a
   where a.conversation_id = p_conversation_id and a.request_id = v_request_id
     and a.version = v_version and a.provider_id = v_provider_id for update;
  if not found or v_approval.status <> 'approved' or v_approval.consumed_at is not null
     or v_approval.price_cents <> v_price_cents or v_approval.scope_hash is distinct from v_scope_hash
     or v_approval.gig_id is distinct from v_gig_id
     or v_provider_id not in (v_conversation.participant_a, v_conversation.participant_b)
     or (p_offer->'row'->>'sender_id')::uuid is distinct from v_provider_id then
    raise exception 'durable pricing approval is missing, changed, or already consumed' using errcode = '42501';
  end if;

  update public.yqaa_pricing_approvals set consumed_at = clock_timestamp()
   where conversation_id = p_conversation_id and request_id = v_request_id and version = v_version
     and provider_id = v_provider_id and status = 'approved' and consumed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'durable pricing approval has already been consumed' using errcode = '42501';
  end if;

  -- Any failure in the existing atomic commit rolls back the consume above.
  return public.commit_yqaa_reply(
    p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
  );
end;
$$;

revoke all on function public.commit_yqaa_reply_with_pricing_approval(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_yqaa_reply_with_pricing_approval(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
