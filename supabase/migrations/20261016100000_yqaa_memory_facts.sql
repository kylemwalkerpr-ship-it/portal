-- Q02 mutable derived facts. Apply only with the matching privacy UI/runtime.
-- No grants are backfilled. Clerk-owned subjects arrive only from server auth.
alter table public.yqaa_consent add column owner_clerk_user_id text;
-- Older consent without an owner remains unusable until a fresh explicit grant.
create table public.yqaa_memory_facts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  subject_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  fact_key text not null check (length(fact_key) between 1 and 100),
  version bigint not null check (version > 0),
  value text check (length(value) between 1 and 1000),
  source_message_id uuid not null references public.conversation_messages(id),
  source_created_at timestamptz not null,
  consent_version bigint not null,
  superseded_epoch bigint,
  deleted_epoch bigint,
  corrected boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,fact_key,version),
  check ((superseded_epoch is null and deleted_epoch is null) = (value is not null))
);
create index yqaa_memory_fact_sources on public.yqaa_memory_facts(conversation_id,source_message_id);
create unique index yqaa_memory_facts_current on public.yqaa_memory_facts(conversation_id,fact_key)
  where superseded_epoch is null and deleted_epoch is null;
create table public.yqaa_fact_mutations (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid not null,
  subject_id uuid not null,
  fact_id uuid not null references public.yqaa_memory_facts(id),
  action text not null check (action in ('correct','delete')),
  expected_epoch bigint not null,
  expected_fact_version bigint not null,
  -- Fingerprint for exact retry equality; never copy correction text to audit.
  payload_digest bytea not null,
  result_epoch bigint not null,
  result_fact_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(conversation_id,request_id)
);
alter table public.yqaa_memory_facts enable row level security;
alter table public.yqaa_fact_mutations enable row level security;
create policy yqaa_facts_browser_deny on public.yqaa_memory_facts for all to anon,authenticated using(false) with check(false);
create policy yqaa_fact_receipts_browser_deny on public.yqaa_fact_mutations for all to anon,authenticated using(false) with check(false);
revoke all on public.yqaa_memory_facts,public.yqaa_fact_mutations from public,anon,authenticated;
grant select,insert,update,delete on public.yqaa_memory_facts,public.yqaa_fact_mutations to service_role;

-- All fact operations lock the same conversation as consent and reply commit.
-- Reads use this RPC too, rather than a service-role SELECT with caller IDs.
create function public.lock_yqaa_privacy_scope(p_conversation_id uuid,p_subject_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; provider uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into c from public.conversations where id=p_conversation_id for update;
  if not found or p_subject_id is null or (p_subject_id is distinct from c.participant_a and p_subject_id is distinct from c.participant_b)
    or not exists(select 1 from public.profiles p where p.id=p_subject_id and lower(p.role) in('client','student')
      and coalesce(to_jsonb(p)->>'status','active')='active') then
    raise exception 'subject not authorized' using errcode='42501';
  end if;
  perform 1 from public.profiles p where p.id in(c.participant_a,c.participant_b) order by p.id for share;
  select p.id into provider from public.profiles p where p.id in(c.participant_a,c.participant_b)
    and p.id<>p_subject_id and lower(p.role) in('attorney','consultant')
    and coalesce(to_jsonb(p)->>'status','active')='active';
  if not exists(select 1 from public.profiles p where p.id=p_subject_id and lower(p.role) in('client','student') and coalesce(to_jsonb(p)->>'status','active')='active') then raise exception 'subject not authorized' using errcode='42501'; end if;
  if provider is null then raise exception 'provider not authorized' using errcode='42501'; end if;
  return provider;
end $$;
revoke all on function public.lock_yqaa_privacy_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_yqaa_privacy_scope(uuid,uuid) to service_role;

-- Clear derived pointers, not retained commercial approval/transaction rows.
create function public.invalidate_yqaa_derived_state(metadata jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select (coalesce(metadata,'{}'::jsonb) - array['ai_memory','ai_last_scope_hash','ai_last_counter_class',
    'ai_last_negotiation_action','ai_last_posture','ai_last_offer_id','ai_pricing_approval_request_id',
    'ai_pricing_approval_version','ai_pricing_approval_price_cents','ai_pricing_approval_scope_hash',
    'ai_pricing_approval_gig_id'])
    || jsonb_build_object('ai_pricing_approval_status','invalidated','ai_pricing_approval_pending',false)
$$;
revoke all on function public.invalidate_yqaa_derived_state(jsonb) from public,anon,authenticated;
grant execute on function public.invalidate_yqaa_derived_state(jsonb) to service_role;

-- Wrap the inherited epoch owner so whole-memory actions also tombstone facts.
-- Its replay semantics, scope/CAS checks and conversation lock remain intact.
alter function public.mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean) rename to mutate_yqaa_privacy_epoch;
revoke all on function public.mutate_yqaa_privacy_epoch(uuid,uuid,bigint,uuid,text,boolean) from service_role;
create function public.mutate_yqaa_privacy(p_conversation_id uuid,p_subject_id uuid,p_expected_version bigint,
  p_request_id uuid,p_action text,p_explicit_opt_in boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; owner text; s public.yqaa_consent%rowtype;
begin
  perform public.lock_yqaa_privacy_scope(p_conversation_id,p_subject_id);
  select p.clerk_user_id into owner from public.profiles p where p.id=p_subject_id;
  if owner is null or length(owner)=0 then raise exception 'verified owner required' using errcode='42501'; end if;
  select * into s from public.yqaa_consent where conversation_id=p_conversation_id;
  if p_action<>'grant' and s.conversation_id is not null and s.owner_clerk_user_id is distinct from owner then
    raise exception 'consent owner changed; explicit new grant required' using errcode='42501'; end if;
  result := public.mutate_yqaa_privacy_epoch(p_conversation_id,p_subject_id,p_expected_version,p_request_id,p_action,p_explicit_opt_in);
  if not (result->>'replayed')::boolean then
    update public.yqaa_consent set owner_clerk_user_id=owner where conversation_id=p_conversation_id;
    update public.conversations set metadata=public.invalidate_yqaa_derived_state(metadata) where id=p_conversation_id;
    update public.yqaa_memory_facts set value=null,deleted_epoch=(result->>'version')::bigint
      where conversation_id=p_conversation_id and superseded_epoch is null and deleted_epoch is null;
  end if;
  return result;
end $$;
revoke all on function public.mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.mutate_yqaa_privacy(uuid,uuid,bigint,uuid,text,boolean) to service_role;

create function public.read_yqaa_memory(p_conversation_id uuid,p_subject_id uuid,p_expected_version bigint default null,
  p_learn boolean default false,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
-- Keep the default variable_conflict=error: SQL aliases must never name local records.
declare provider uuid; s public.yqaa_consent%rowtype; m record; v_fact public.yqaa_memory_facts%rowtype;
  key text; val text; parts text[]; changed boolean:=false; reset_snapshot boolean:=false; epoch bigint;
begin
  provider:=public.lock_yqaa_privacy_scope(p_conversation_id,p_subject_id);
  if p_offset is null or p_offset<0 or p_offset>2147483447 then raise exception 'invalid memory page' using errcode='22023'; end if;
  select * into s from public.yqaa_consent where conversation_id=p_conversation_id;
  if s.conversation_id is not null and (s.subject_id<>p_subject_id or s.provider_id<>provider or s.cross_site_linking
    or s.owner_clerk_user_id is distinct from (select clerk_user_id from public.profiles where id=p_subject_id)) then
    raise exception 'scope changed' using errcode='42501';
  end if;
  if p_learn then
    if p_expected_version is null or not coalesce(s.granted,false) or s.version<>p_expected_version then
      raise exception 'consent changed' using errcode='40001';
    end if;
    epoch:=s.version+1;
    -- Canonical source only, latest bounded window, ascending deterministic order.
    for m in select * from (select id,body,created_at from public.conversation_messages
      where conversation_id=p_conversation_id and sender_id=p_subject_id and created_at>s.memory_after
        and type='text' and length(trim(body))>0
        and not coalesce((metadata->>'ai_generated')='true',false)
        and not coalesce((metadata->>'ai_assistant')='true',false)
        and not coalesce((metadata->>'ai_typing')='true',false)
      order by created_at desc,id desc limit 120) q order by created_at,id
    loop
      -- Only explicit named slots have contradiction semantics. Other statements
      -- are independent source facts; no model guesses that two facts conflict.
      parts:=regexp_match(m.body,'^Remember (goal|destination|budget|deadline|documents):[[:space:]]*(.+)$','i');
      key:=case when parts is null then 'statement:'||m.id::text else lower(parts[1]) end;
      val:=left(case when parts is null then trim(m.body) else trim(parts[2]) end,1000);
      if length(val)=0 then continue; end if;
      -- A source is processed once, including after tombstoning or correction.
      if exists(select 1 from public.yqaa_memory_facts where conversation_id=p_conversation_id and source_message_id=m.id) then continue; end if;
      select * into v_fact from public.yqaa_memory_facts where conversation_id=p_conversation_id and fact_key=key order by version desc limit 1;
      -- Deleted/corrected slots remain sealed until a later explicit source.
      if v_fact.id is not null and (m.created_at,m.id)<=(v_fact.source_created_at,v_fact.source_message_id) then continue; end if;
      if v_fact.id is not null then reset_snapshot:=true; end if;
      update public.yqaa_memory_facts set value=null,superseded_epoch=epoch
        where conversation_id=p_conversation_id and fact_key=key and superseded_epoch is null and deleted_epoch is null;
      insert into public.yqaa_memory_facts(conversation_id,subject_id,provider_id,fact_key,version,value,source_message_id,source_created_at,consent_version)
        values(p_conversation_id,p_subject_id,provider,key,coalesce(v_fact.version,0)+1,val,m.id,m.created_at,epoch);
      changed:=true;
    end loop;
    if changed then
      -- Epoch change invalidates already retrieved facts, diagnostics and replies.
      update public.yqaa_consent set version=epoch,updated_at=clock_timestamp() where conversation_id=p_conversation_id returning * into s;
      update public.conversations set metadata=case when reset_snapshot then public.invalidate_yqaa_derived_state(metadata) else coalesce(metadata,'{}')-'ai_memory' end where id=p_conversation_id;
    end if;
  end if;
  return jsonb_build_object('reset_snapshot',reset_snapshot,'consent',case when s.conversation_id is null then null else to_jsonb(s) end,
    'facts',coalesce((select jsonb_agg(to_jsonb(page_fact) order by page_fact.created_at desc,page_fact.id desc) from (
      select * from public.yqaa_memory_facts f where f.conversation_id=p_conversation_id
        and f.subject_id=p_subject_id and f.provider_id=provider and f.superseded_epoch is null and f.deleted_epoch is null
        and coalesce(s.granted,false) order by case when p_learn and f.fact_key not like 'statement:%' then 0 else 1 end, f.created_at desc,f.id desc limit 200 offset p_offset) page_fact),'[]'::jsonb),
    'has_more',exists(select 1 from public.yqaa_memory_facts f where f.conversation_id=p_conversation_id
      and f.subject_id=p_subject_id and f.provider_id=provider and f.superseded_epoch is null and f.deleted_epoch is null
      and coalesce(s.granted,false) offset (p_offset+200)),
    'excluded_source_ids',coalesce((select jsonb_agg(excluded_source.source_message_id) from (
      select distinct f.source_message_id,f.source_created_at from public.yqaa_memory_facts f
      where f.conversation_id=p_conversation_id and f.source_created_at>s.memory_after
        and (f.deleted_epoch is not null or f.superseded_epoch is not null)
        and not exists(select 1 from public.yqaa_memory_facts a where a.conversation_id=p_conversation_id
          and a.source_message_id=f.source_message_id and a.deleted_epoch is null and a.superseded_epoch is null)
      order by f.source_created_at desc,f.source_message_id desc limit 120) excluded_source),'[]'::jsonb));
end $$;
revoke all on function public.read_yqaa_memory(uuid,uuid,bigint,boolean,integer) from public,anon,authenticated;
grant execute on function public.read_yqaa_memory(uuid,uuid,bigint,boolean,integer) to service_role;

create function public.mutate_yqaa_fact(p_conversation_id uuid,p_subject_id uuid,p_expected_version bigint,
  p_request_id uuid,p_fact_id uuid,p_expected_fact_version bigint,p_action text,p_value text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare provider uuid; s public.yqaa_consent%rowtype; v_fact public.yqaa_memory_facts%rowtype;
  r public.yqaa_fact_mutations%rowtype; result_id uuid; fingerprint bytea; epoch bigint;
begin
  provider:=public.lock_yqaa_privacy_scope(p_conversation_id,p_subject_id);
  if p_request_id is null or p_fact_id is null or p_expected_version is null or p_expected_fact_version is null
    or p_action is null or p_action not in('correct','delete')
    or (p_action='correct' and (p_value is null or length(trim(p_value)) not between 1 and 1000))
    or (p_action='delete' and p_value is not null) then raise exception 'invalid fact mutation' using errcode='22023'; end if;
  fingerprint:=sha256(convert_to(coalesce(p_value,''),'UTF8'));
  select * into r from public.yqaa_fact_mutations where conversation_id=p_conversation_id and request_id=p_request_id;
  if found then
    if r.subject_id<>p_subject_id or r.fact_id<>p_fact_id or r.action<>p_action or r.expected_epoch<>p_expected_version
      or r.expected_fact_version<>p_expected_fact_version or r.payload_digest<>fingerprint then
      raise exception 'request id reused' using errcode='22023'; end if;
    return jsonb_build_object('version',r.result_epoch,'fact_id',r.result_fact_id,'replayed',true);
  end if;
  select * into s from public.yqaa_consent where conversation_id=p_conversation_id;
  if s.conversation_id is null or s.subject_id<>p_subject_id or s.provider_id<>provider or not s.granted or s.cross_site_linking
    or s.owner_clerk_user_id is distinct from (select clerk_user_id from public.profiles where id=p_subject_id) then
    raise exception 'consent required' using errcode='42501'; end if;
  if s.version<>p_expected_version then raise exception 'privacy version conflict' using errcode='40001'; end if;
  select * into v_fact from public.yqaa_memory_facts where id=p_fact_id and conversation_id=p_conversation_id
    and subject_id=p_subject_id and provider_id=provider;
  if not found then raise exception 'unknown fact' using errcode='42501'; end if;
  if v_fact.version<>p_expected_fact_version or v_fact.deleted_epoch is not null or v_fact.superseded_epoch is not null then
    raise exception 'fact version conflict' using errcode='40001'; end if;
  epoch:=s.version+1;
  update public.yqaa_memory_facts set value=null,
    superseded_epoch=case when p_action='correct' then epoch end,
    deleted_epoch=case when p_action='delete' then epoch end where id=v_fact.id;
  if p_action='correct' then
    insert into public.yqaa_memory_facts(conversation_id,subject_id,provider_id,fact_key,version,value,source_message_id,source_created_at,consent_version,corrected)
      values(p_conversation_id,p_subject_id,provider,v_fact.fact_key,v_fact.version+1,trim(p_value),v_fact.source_message_id,v_fact.source_created_at,epoch,true)
      returning id into result_id;
  end if;
  -- Conservative invalidation: retained messages/AI echoes cannot recreate a
  -- corrected/deleted fact. Other active facts survive; source history does not.
  update public.yqaa_consent set version=epoch,memory_after=clock_timestamp(),updated_at=clock_timestamp() where conversation_id=p_conversation_id;
  update public.conversations set metadata=public.invalidate_yqaa_derived_state(metadata) where id=p_conversation_id;
  insert into public.yqaa_fact_mutations(conversation_id,request_id,subject_id,fact_id,action,expected_epoch,expected_fact_version,payload_digest,result_epoch,result_fact_id)
    values(p_conversation_id,p_request_id,p_subject_id,p_fact_id,p_action,p_expected_version,p_expected_fact_version,fingerprint,epoch,result_id);
  return jsonb_build_object('version',epoch,'fact_id',result_id,'replayed',false);
end $$;
revoke all on function public.mutate_yqaa_fact(uuid,uuid,bigint,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.mutate_yqaa_fact(uuid,uuid,bigint,uuid,uuid,bigint,text,text) to service_role;

-- Permission/status changes are checked again at effect insertion, even if the
-- model saw valid consent before an account was suspended or participants moved.
create function public.fence_yqaa_reply_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.yqaa_consent%rowtype; provider uuid;
begin
  if new.metadata->>'yqaa_consent_version' is not null then
    -- Lock before reading consent, including direct inserts outside the commit RPC.
    -- A pre-lock snapshot must not survive a concurrent withdrawal/regrant.
    perform 1 from public.conversations where id=new.conversation_id for update;
    select * into s from public.yqaa_consent where conversation_id=new.conversation_id;
    provider:=public.lock_yqaa_privacy_scope(new.conversation_id,s.subject_id);
    if not coalesce(s.granted,false) or s.provider_id is distinct from provider or new.sender_id is distinct from provider
      or s.owner_clerk_user_id is distinct from (select clerk_user_id from public.profiles where id=s.subject_id)
      or new.metadata->>'yqaa_consent_version' is distinct from s.version::text then
      raise exception 'consent changed before reply insertion' using errcode='40001'; end if;
  end if;
  return new;
end $$;
revoke all on function public.fence_yqaa_reply_scope() from public,anon,authenticated;
create trigger yqaa_reply_scope_fence before insert on public.conversation_messages for each row execute function public.fence_yqaa_reply_scope();

-- Pending diagnostic snapshots have the same permission/status fence as effects.
create or replace function public.fence_yqaa_memory_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.yqaa_consent%rowtype; provider uuid;
begin
  if new.metadata->'ai_memory' is distinct from old.metadata->'ai_memory'
    and new.metadata->'ai_memory' is not null and new.metadata->'ai_memory'<>'null'::jsonb then
    select * into s from public.yqaa_consent where conversation_id=new.id;
    if not found or not s.granted or s.cross_site_linking
      or (s.subject_id is distinct from new.participant_a and s.subject_id is distinct from new.participant_b)
      or (s.provider_id is distinct from new.participant_a and s.provider_id is distinct from new.participant_b)
      or s.owner_clerk_user_id is distinct from (select clerk_user_id from public.profiles where id=s.subject_id)
      or new.metadata->'ai_memory'->>'consent_version' is distinct from s.version::text then
      raise exception 'stale or unconsented derived memory' using errcode='40001';
    end if;
    provider:=public.lock_yqaa_privacy_scope(new.id,s.subject_id);
    if provider<>s.provider_id then raise exception 'provider scope changed' using errcode='42501'; end if;
  end if;
  return new;
end $$;
