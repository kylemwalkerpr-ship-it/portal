-- A cancelled PostgREST request may already be executing in PostgreSQL. Carry
-- the absolute runtime cutoff into the transaction and check it at the durable
-- reply ledger insert, where an exception rolls back the whole reply/inquiry.
create or replace function public.enforce_yqaa_reply_runtime_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deadline text := current_setting('yqaa.runtime_deadline', true);
begin
  if nullif(v_deadline, '') is not null
     and clock_timestamp() >= v_deadline::timestamptz then
    raise exception 'YQAA reply runtime deadline exceeded' using errcode = '40001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_yqaa_reply_runtime_deadline() from public, anon, authenticated;

drop trigger if exists yqaa_reply_runtime_deadline on public.yqaa_reply_commits;
create trigger yqaa_reply_runtime_deadline
  before insert on public.yqaa_reply_commits
  for each row execute function public.enforce_yqaa_reply_runtime_deadline();

create or replace function public.commit_yqaa_reply_with_runtime_deadline(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_reply jsonb,
  p_offer jsonb,
  p_conversation_metadata jsonb,
  p_deadline_at timestamptz,
  p_commit_rpc text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_deadline_at is null or p_deadline_at <= clock_timestamp() then
    raise exception 'YQAA reply runtime deadline exceeded' using errcode = '40001';
  end if;
  if p_commit_rpc not in (
    'commit_yqaa_reply',
    'commit_yqaa_reply_with_pricing_approval',
    'commit_yqaa_reply_with_atomic_inquiry',
    'commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval'
  ) then
    raise exception 'invalid YQAA reply commit operation' using errcode = '22023';
  end if;

  perform set_config('yqaa.runtime_deadline', p_deadline_at::text, true);
  if p_commit_rpc = 'commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval' then
    return public.commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval(
      p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
    );
  elsif p_commit_rpc = 'commit_yqaa_reply_with_atomic_inquiry' then
    return public.commit_yqaa_reply_with_atomic_inquiry(
      p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
    );
  elsif p_commit_rpc = 'commit_yqaa_reply_with_pricing_approval' then
    return public.commit_yqaa_reply_with_pricing_approval(
      p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
    );
  end if;
  return public.commit_yqaa_reply(
    p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata
  );
end;
$$;
revoke all on function public.commit_yqaa_reply_with_runtime_deadline(uuid, uuid, jsonb, jsonb, jsonb, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.commit_yqaa_reply_with_runtime_deadline(uuid, uuid, jsonb, jsonb, jsonb, timestamptz, text)
  to service_role;
