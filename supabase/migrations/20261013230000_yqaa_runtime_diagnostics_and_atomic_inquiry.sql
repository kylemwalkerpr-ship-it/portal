-- Runtime diagnostics use a top-level JSONB patch with a current-trigger fence.
-- This preserves concurrent human mode changes and prevents an older run from
-- changing the visible run state after a newer client message takes over.
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
    update public.conversations set
      metadata = coalesce(metadata, '{}'::jsonb) || p_patch || jsonb_build_object(
        'ai_last_run_trigger_message_id', p_expected_trigger_message_id
      ),
      updated_at = clock_timestamp()
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

-- This helper is called only from an atomic YQAA reply RPC. A newly needed
-- inquiry therefore rolls back with a rejected/aborted reply and cannot leave
-- a durable orphan from model preparation.
create or replace function public.prepare_yqaa_offer_inquiry(
  p_conversation_id uuid,
  p_offer jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_provider_id uuid;
  v_provider_role text;
  v_client_id uuid;
  v_client_email text;
  v_client_name text;
  v_client_country text;
  v_inquiry_id uuid;
begin
  if jsonb_typeof(p_offer) <> 'object'
     or jsonb_typeof(p_offer->'inquiry_seed') <> 'object'
     or jsonb_typeof(p_offer->'row') <> 'object' then
    raise exception 'atomic inquiry seed required' using errcode = '22023';
  end if;
  select * into v_conversation from public.conversations c
   where c.id = p_conversation_id for update;
  if not found then raise exception 'conversation not found' using errcode = 'P0002'; end if;

  select p.id, lower(p.role) into v_provider_id, v_provider_role
    from public.profiles p
   where p.id in (v_conversation.participant_a, v_conversation.participant_b)
     and lower(p.role) in ('attorney', 'consultant');
  select p.id, p.email, p.full_name, p.country
    into v_client_id, v_client_email, v_client_name, v_client_country
    from public.profiles p
   where p.id in (v_conversation.participant_a, v_conversation.participant_b)
     and lower(p.role) in ('client', 'student');
  if v_provider_role <> 'attorney'
     or (p_offer->'inquiry_seed'->>'client_profile_id')::uuid is distinct from v_client_id
     or (p_offer->'inquiry_seed'->>'target_attorney_profile_id')::uuid is distinct from v_provider_id then
    raise exception 'atomic inquiry participant mismatch' using errcode = '42501';
  end if;

  select i.id into v_inquiry_id from public.inquiries i
   where i.client_profile_id = v_client_id
     and i.target_attorney_profile_id = v_provider_id
   order by i.created_at desc limit 1;
  if v_inquiry_id is null then
    insert into public.inquiries (
      client_profile_id, target_attorney_profile_id, email, full_name, country,
      case_type, case_type_label, urgency, answers, meta, source, status
    ) values (
      v_client_id, v_provider_id,
      coalesce(nullif(v_client_email, ''), 'client-' || v_client_id::text || '@yousafe.internal'),
      coalesce(nullif(v_client_name, ''), 'YouSafe client'),
      coalesce(nullif(v_client_country, ''), 'US'),
      'attorney_chat', 'Attorney conversation', 'normal', '{}'::jsonb,
      jsonb_build_object('started_from', 'messenger_ai_offer', 'pre_intake', true),
      'portal_messenger_ai', 'engaged'
    ) returning id into v_inquiry_id;
  end if;
  return jsonb_set(
    jsonb_set(
      jsonb_set(p_offer, '{row,chat_id}', to_jsonb(v_inquiry_id::text), true),
      '{message,ref_inquiry_id}', to_jsonb(v_inquiry_id::text), true
    ),
    '{inquiry_message,inquiry_id}', to_jsonb(v_inquiry_id::text), true
  );
end;
$$;
revoke all on function public.prepare_yqaa_offer_inquiry(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_yqaa_offer_inquiry(uuid, jsonb) to service_role;

create or replace function public.commit_yqaa_reply_with_atomic_inquiry(
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
  v_existing public.yqaa_reply_commits%rowtype;
  v_offer jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_existing from public.yqaa_reply_commits r
   where r.conversation_id = p_conversation_id and r.trigger_message_id = p_trigger_message_id;
  if found then
    return public.commit_yqaa_reply(p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata);
  end if;
  v_offer := public.prepare_yqaa_offer_inquiry(p_conversation_id, p_offer);
  return public.commit_yqaa_reply(p_conversation_id, p_trigger_message_id, p_reply, v_offer, p_conversation_metadata);
end;
$$;
revoke all on function public.commit_yqaa_reply_with_atomic_inquiry(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_yqaa_reply_with_atomic_inquiry(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval(
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
  v_existing public.yqaa_reply_commits%rowtype;
  v_offer jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_existing from public.yqaa_reply_commits r
   where r.conversation_id = p_conversation_id and r.trigger_message_id = p_trigger_message_id;
  if found then
    return public.commit_yqaa_reply_with_pricing_approval(p_conversation_id, p_trigger_message_id, p_reply, p_offer, p_conversation_metadata);
  end if;
  v_offer := public.prepare_yqaa_offer_inquiry(p_conversation_id, p_offer);
  return public.commit_yqaa_reply_with_pricing_approval(p_conversation_id, p_trigger_message_id, p_reply, v_offer, p_conversation_metadata);
end;
$$;
revoke all on function public.commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_yqaa_reply_with_atomic_inquiry_and_pricing_approval(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
