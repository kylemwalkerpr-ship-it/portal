\set ON_ERROR_STOP on

-- Run against the disposable local yqaa_test database. All fixtures and the
-- applied successor migration roll back at the end.
begin;
alter table public.profiles add column if not exists country text;
alter table public.inquiries alter column id set default gen_random_uuid();
alter table public.inquiries add column if not exists created_at timestamptz default now();
alter table public.inquiries add column if not exists email text;
alter table public.inquiries add column if not exists full_name text;
alter table public.inquiries add column if not exists country text;
alter table public.inquiries add column if not exists case_type text;
alter table public.inquiries add column if not exists case_type_label text;
alter table public.inquiries add column if not exists urgency text;
alter table public.inquiries add column if not exists answers jsonb;
alter table public.inquiries add column if not exists meta jsonb;
alter table public.inquiries add column if not exists source text;
alter table public.inquiries add column if not exists status text;
\ir ../../supabase/migrations/20261013120000_yqaa_offer_idempotency.sql
\ir ../../supabase/migrations/20261013150000_yqaa_provider_controls.sql
\ir ../../supabase/migrations/20261013170000_yqaa_provider_controls_offer_authority.sql
\ir ../../supabase/migrations/20261013230000_yqaa_runtime_diagnostics_and_atomic_inquiry.sql
\ir ../../supabase/migrations/20261014090000_yqaa_reply_runtime_deadline.sql

insert into public.profiles(id,role,status,full_name) values ('00000000-0000-4000-8000-000000000001','client','active','Local runtime client'),('00000000-0000-4000-8000-000000000002','attorney','active','Local runtime provider') on conflict(id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  v_client uuid;
  v_provider uuid;
  v_conversation uuid := gen_random_uuid();
  v_trigger_old uuid := gen_random_uuid();
  v_trigger_new uuid := gen_random_uuid();
  v_started boolean;
  v_count_before integer;
  v_count_after integer;
  v_reply_count_before integer;
  v_reply_count_after integer;
  v_offer jsonb;
begin
  select c.id into v_client from public.profiles c
   where lower(c.role) in ('client','student')
   order by c.id limit 1;
  select p.id into v_provider from public.profiles p
   where lower(p.role) = 'attorney'
     and p.id <> v_client
     and not exists (
       select 1 from public.conversations c
        where c.participant_a = least(v_client, p.id)
          and c.participant_b = greatest(v_client, p.id)
     )
     and not exists (
       select 1 from public.inquiries i
        where i.client_profile_id = v_client and i.target_attorney_profile_id = p.id
     )
   order by p.id limit 1;
  if v_client is null or v_provider is null then
    raise exception 'runtime concurrency test requires an unused client/attorney fixture pair';
  end if;

  insert into public.conversations (id, participant_a, participant_b, context_kind, metadata)
  values (v_conversation, least(v_client, v_provider), greatest(v_client, v_provider), 'general', '{"ai_mode":"auto"}');
  insert into public.conversation_messages (id, conversation_id, sender_id, body, created_at)
  values (v_trigger_old, v_conversation, v_client, 'older trigger', clock_timestamp() - interval '2 seconds');

  select public.patch_yqaa_runtime_diagnostic(
    v_conversation, v_trigger_old,
    '{"ai_last_run_status":"running","ai_last_run_stage":"queued"}', true
  ) into v_started;
  if v_started is distinct from true then raise exception 'first scheduled run did not acquire its trigger'; end if;

  -- Human pause races after the run starts. The diagnostic patch must merge
  -- against the locked current row and cannot write the stale `auto` snapshot.
  update public.conversations set metadata = metadata || '{"ai_mode":"paused","ai_mode_set_by":"provider"}'
   where id = v_conversation;
  perform public.patch_yqaa_runtime_diagnostic(
    v_conversation, v_trigger_old,
    '{"ai_last_run_stage":"model_generation"}', false
  );
  if (select metadata->>'ai_mode' from public.conversations where id = v_conversation) <> 'paused' then
    raise exception 'runtime stage patch overwrote a concurrent human pause';
  end if;

  insert into public.conversation_messages (id, conversation_id, sender_id, body, created_at)
  values (v_trigger_new, v_conversation, v_client, 'newer trigger', clock_timestamp());
  select public.patch_yqaa_runtime_diagnostic(
    v_conversation, v_trigger_new,
    '{"ai_last_run_status":"running","ai_last_run_stage":"queued"}', true
  ) into v_started;
  if v_started is distinct from true then raise exception 'new trigger did not supersede the old run'; end if;

  select public.patch_yqaa_runtime_diagnostic(
    v_conversation, v_trigger_old,
    '{"ai_last_run_status":"failed","ai_last_run_stage":"late_old_run"}', false
  ) into v_started;
  if v_started is distinct from false then raise exception 'old run was allowed to update current status'; end if;
  if (select metadata->>'ai_last_run_trigger_message_id' from public.conversations where id = v_conversation) <> v_trigger_new::text
     or (select metadata->>'ai_last_run_status' from public.conversations where id = v_conversation) <> 'running'
     or (select metadata->>'ai_mode' from public.conversations where id = v_conversation) <> 'paused'
     or (select metadata ? 'ai_last_trigger_message_id' from public.conversations where id = v_conversation) then
    raise exception 'new run identity, status, or human pause was overwritten';
  end if;

  select count(*) into v_count_before from public.inquiries
   where client_profile_id = v_client and target_attorney_profile_id = v_provider;
  v_offer := jsonb_build_object(
    'inquiry_seed', jsonb_build_object(
      'client_profile_id', v_client, 'target_attorney_profile_id', v_provider
    ),
    'row', jsonb_build_object('chat_id', null),
    'message', jsonb_build_object('ref_inquiry_id', null),
    'inquiry_message', jsonb_build_object(
      'inquiry_id', null, 'sender_role', 'system', 'sender_profile_id', v_provider, 'body', 'test'
    )
  );
  begin
    perform public.commit_yqaa_reply_with_atomic_inquiry(
      v_conversation, v_trigger_new,
      jsonb_build_object('sender_id', v_provider, 'body', 'must not commit'),
      v_offer,
      '{"ai_last_run_status":"completed"}'::jsonb
    );
    raise exception 'paused reply RPC unexpectedly committed';
  exception when sqlstate '40001' then
    null;
  end;
  select count(*) into v_count_after from public.inquiries
   where client_profile_id = v_client and target_attorney_profile_id = v_provider;
  if v_count_after <> v_count_before then
    raise exception 'rejected reply left a durable inquiry outside the atomic commit';
  end if;

  -- Simulate PostgREST cancellation after the SQL transaction has begun: the
  -- transaction-local deadline is already past when the final ledger insert
  -- runs. The trigger must roll back the reply and transaction state; the
  -- paused-path assertion above separately verifies inquiry rollback.
  update public.conversations set metadata = metadata || '{"ai_mode":"auto"}'
   where id = v_conversation;
  v_offer := null;
  select count(*) into v_reply_count_before from public.yqaa_reply_commits
   where conversation_id = v_conversation and trigger_message_id = v_trigger_new;
  begin
    perform set_config('yqaa.runtime_deadline', (clock_timestamp() - interval '1 second')::text, true);
    perform public.commit_yqaa_reply(
      v_conversation, v_trigger_new,
      jsonb_build_object('sender_id', v_provider, 'body', 'late reply'),
      v_offer,
      '{"ai_last_run_status":"completed"}'::jsonb
    );
    raise exception 'expired reply transaction unexpectedly committed';
  exception when sqlstate '40001' then
    null;
  end;
  select count(*) into v_count_after from public.inquiries
   where client_profile_id = v_client and target_attorney_profile_id = v_provider;
  select count(*) into v_reply_count_after from public.yqaa_reply_commits
   where conversation_id = v_conversation and trigger_message_id = v_trigger_new;
  if v_count_after <> v_count_before or v_reply_count_after <> v_reply_count_before then
    raise exception 'expired reply left a durable inquiry or reply commit';
  end if;
end
$test$;

rollback;
