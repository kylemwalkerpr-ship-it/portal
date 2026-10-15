-- A serverless isolate may receive the same client-message event more than
-- once. Claim each trigger under the conversation row lock so duplicate
-- deliveries cannot run YQAA concurrently across isolates. Failed/skipped
-- runs may retry after a short backoff; abandoned running claims expire after
-- the bounded Worker runtime plus diagnostic reserve.
create or replace function public.patch_yqaa_runtime_diagnostic(
  p_conversation_id uuid,
  p_expected_trigger_message_id uuid,
  p_patch jsonb,
  p_start_run boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_client_id uuid;
  v_previous_status text;
  v_previous_started_at timestamptz;
  v_previous_finished_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_conversation_id is null or jsonb_typeof(p_patch) <> 'object'
     or p_patch ? 'ai_mode' or p_patch ? 'ai_last_run_trigger_message_id'
     or p_patch ? 'ai_last_trigger_message_id' then
    raise exception 'invalid YQAA diagnostic patch' using errcode = '22023';
  end if;

  select * into v_conversation from public.conversations c
   where c.id = p_conversation_id for update;
  if not found then return false; end if;

  select p.id into v_client_id from public.profiles p
   where p.id in (v_conversation.participant_a, v_conversation.participant_b)
     and lower(p.role) in ('client', 'student');

  if p_start_run then
    if p_expected_trigger_message_id is null
       or p_patch->>'ai_last_run_status' <> 'running'
       or not exists (
         select 1 from public.conversation_messages m
          where m.id = p_expected_trigger_message_id
            and m.conversation_id = p_conversation_id
            and m.sender_id = v_client_id
            and not exists (
              select 1 from public.conversation_messages later
               where later.conversation_id = p_conversation_id
                 and later.sender_id = v_client_id
                 and (later.created_at, later.id) > (m.created_at, m.id)
            )
       ) then
      return false;
    end if;

    if v_conversation.metadata->>'ai_last_run_trigger_message_id' = p_expected_trigger_message_id::text then
      v_previous_status := v_conversation.metadata->>'ai_last_run_status';
      if v_previous_status = 'completed' then
        return false;
      elsif v_previous_status = 'running' then
        v_previous_started_at := nullif(v_conversation.metadata->>'ai_last_run_started_at', '')::timestamptz;
        if v_previous_started_at > v_now - interval '32 seconds' then
          return false;
        end if;
      elsif v_previous_status in ('failed', 'skipped') then
        v_previous_finished_at := nullif(v_conversation.metadata->>'ai_last_run_finished_at', '')::timestamptz;
        if v_previous_finished_at > v_now - interval '60 seconds' then
          return false;
        end if;
      end if;
    end if;

    update public.conversations set
      metadata = coalesce(metadata, '{}'::jsonb) || p_patch || jsonb_build_object(
        'ai_last_run_trigger_message_id', p_expected_trigger_message_id,
        'ai_last_run_started_at', v_now
      ),
      updated_at = v_now
    where id = p_conversation_id;
    return true;
  end if;

  if p_expected_trigger_message_id is null then
    update public.conversations set
      metadata = coalesce(metadata, '{}'::jsonb) || p_patch,
      updated_at = clock_timestamp()
    where id = p_conversation_id;
    return true;
  end if;

  update public.conversations set
    metadata = coalesce(metadata, '{}'::jsonb) || p_patch,
    updated_at = clock_timestamp()
  where id = p_conversation_id
    and metadata->>'ai_last_run_trigger_message_id' = p_expected_trigger_message_id::text
    and metadata->>'ai_last_run_status' = 'running';
  return found;
end;
$$;
revoke all on function public.patch_yqaa_runtime_diagnostic(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.patch_yqaa_runtime_diagnostic(uuid, uuid, jsonb, boolean)
  to service_role;

-- An already-expired operation is an expected no-op. Returning a classified
-- JSON result avoids turning a routine deadline into a high-volume PostgreSQL
-- ERROR while preserving the final ledger trigger for a deadline that expires
-- during the atomic commit itself.
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
    return jsonb_build_object(
      'runtime_deadline_exceeded', true,
      'reply_message_id', null,
      'offer_id', null
    );
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

-- These are permanent business rejections, not serialization conflicts.
-- PostgREST/hasql may retry SQLSTATE 40001 indefinitely, including after the
-- HTTP caller aborts. Preserve every validation and atomic rollback while
-- making those rejections non-retryable. Replace only the four named existing
-- function bodies; ownership, signatures and execute grants remain unchanged.
do $non_retryable_rejections$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    'public.commit_yqaa_reply(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.commit_yqaa_reply_with_pricing_approval(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.resolve_yqaa_pricing_approval(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.enforce_yqaa_reply_runtime_deadline()'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_definition := replace(v_definition, 'errcode = ''40001''', 'errcode = ''P0001''');
    if position('''40001''' in v_definition) > 0 then
      raise exception 'unrecognized retryable rejection in %', v_function;
    end if;
    execute v_definition;
  end loop;
end;
$non_retryable_rejections$;
