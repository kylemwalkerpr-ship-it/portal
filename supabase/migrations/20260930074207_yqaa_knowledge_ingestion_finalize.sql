alter table public.yqaa_knowledge_sources
  add column if not exists ingestion_run_id text;

alter table public.yqaa_knowledge_chunks
  add column if not exists ingestion_run_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'yqaa_knowledge_sources_ingestion_run_fk'
      and conrelid = 'public.yqaa_knowledge_sources'::regclass
  ) then
    alter table public.yqaa_knowledge_sources
      add constraint yqaa_knowledge_sources_ingestion_run_fk
      foreign key (ingestion_run_id)
      references public.yqaa_knowledge_ingestion_runs(run_id)
      on delete restrict
      not valid;
    alter table public.yqaa_knowledge_sources
      validate constraint yqaa_knowledge_sources_ingestion_run_fk;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'yqaa_knowledge_chunks_ingestion_run_fk'
      and conrelid = 'public.yqaa_knowledge_chunks'::regclass
  ) then
    alter table public.yqaa_knowledge_chunks
      add constraint yqaa_knowledge_chunks_ingestion_run_fk
      foreign key (ingestion_run_id)
      references public.yqaa_knowledge_ingestion_runs(run_id)
      on delete restrict
      not valid;
    alter table public.yqaa_knowledge_chunks
      validate constraint yqaa_knowledge_chunks_ingestion_run_fk;
  end if;
end;
$$;

create index if not exists yqaa_knowledge_sources_run_idx
  on public.yqaa_knowledge_sources(ingestion_run_id);

create index if not exists yqaa_knowledge_chunks_run_idx
  on public.yqaa_knowledge_chunks(ingestion_run_id);

create table if not exists public.yqaa_knowledge_sources_staging (
  ingestion_run_id text not null
    references public.yqaa_knowledge_ingestion_runs(run_id)
    on delete cascade,
  source_key text not null,
  site text not null,
  repository text not null,
  base_url text not null,
  source_url text not null,
  path text not null default '/',
  title text,
  jurisdiction text,
  source_kind text not null default 'live_html',
  authority_tier smallint not null default 3 check (authority_tier between 1 and 5),
  http_status integer,
  content_hash text not null,
  fetched_at timestamptz not null,
  last_seen_at timestamptz not null,
  lastmod timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  primary key (ingestion_run_id, source_key),
  unique (ingestion_run_id, source_url)
);

create table if not exists public.yqaa_knowledge_chunks_staging (
  ingestion_run_id text not null,
  chunk_key text not null,
  source_key text not null,
  site text not null,
  repository text not null,
  source_url text not null,
  title text,
  section_title text,
  chunk_index integer not null,
  jurisdiction text,
  topic_tags text[] not null default '{}'::text[],
  body text not null,
  content_hash text not null,
  authority_tier smallint not null default 3 check (authority_tier between 1 and 5),
  fetched_at timestamptz not null,
  lastmod timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (ingestion_run_id, chunk_key),
  unique (ingestion_run_id, source_key, chunk_index),
  constraint yqaa_knowledge_chunks_staging_source_fk
    foreign key (ingestion_run_id, source_key)
    references public.yqaa_knowledge_sources_staging(ingestion_run_id, source_key)
    on delete cascade
);

create index if not exists yqaa_knowledge_sources_staging_run_idx
  on public.yqaa_knowledge_sources_staging(ingestion_run_id);

create index if not exists yqaa_knowledge_chunks_staging_run_idx
  on public.yqaa_knowledge_chunks_staging(ingestion_run_id);

alter table public.yqaa_knowledge_sources_staging enable row level security;
alter table public.yqaa_knowledge_chunks_staging enable row level security;

revoke all on public.yqaa_knowledge_sources_staging from anon, authenticated;
revoke all on public.yqaa_knowledge_chunks_staging from anon, authenticated;

grant select, insert, update, delete
  on public.yqaa_knowledge_sources_staging to service_role;
grant select, insert, update, delete
  on public.yqaa_knowledge_chunks_staging to service_role;

create or replace function public.finalize_yqaa_knowledge_ingestion(p_run_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_started_at timestamptz;
  v_newer_run_id text;
  v_expected_sources integer;
  v_expected_chunks integer;
  v_staged_sources integer;
  v_staged_chunks integer;
  v_site_counts jsonb;
begin
  if nullif(btrim(coalesce(p_run_id,'')), '') is null then
    raise exception 'run id required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0));

  select status, started_at, source_count, chunk_count
    into v_status, v_started_at, v_expected_sources, v_expected_chunks
    from public.yqaa_knowledge_ingestion_runs
   where run_id = p_run_id
   for update;

  if not found then
    raise exception 'unknown YQAA ingestion run %', p_run_id;
  end if;

  if v_status <> 'running' then
    raise exception 'YQAA ingestion run % is %, expected running', p_run_id, v_status;
  end if;

  -- The advisory transaction lock serializes competing finalizers. A newer
  -- running run may still be staging; it wins once it is eligible to finalize.
  -- Completed runs remain eligible in the comparison so a delayed older
  -- finalizer can never roll the live corpus backward.
  select newer.run_id
    into v_newer_run_id
    from public.yqaa_knowledge_ingestion_runs as newer
   where newer.run_id <> p_run_id
     and (newer.started_at, newer.run_id) > (v_started_at, p_run_id)
     and (
       newer.status = 'completed'
       or (
         newer.status = 'running'
         and coalesce(newer.source_count, 0) > 0
         and coalesce(newer.chunk_count, 0) > 0
         and (
           select count(*)
             from public.yqaa_knowledge_sources_staging as staged_sources
            where staged_sources.ingestion_run_id = newer.run_id
         ) = newer.source_count
         and (
           select count(*)
             from public.yqaa_knowledge_chunks_staging as staged_chunks
            where staged_chunks.ingestion_run_id = newer.run_id
         ) = newer.chunk_count
       )
     )
   order by newer.started_at desc, newer.run_id desc
   limit 1;

  if found then
    update public.yqaa_knowledge_ingestion_runs
       set completed_at = now(),
           status = 'rejected',
           problems = jsonb_build_array(jsonb_build_object(
             'code', 'superseded_by_newer_run',
             'run_id', left(v_newer_run_id, 200)
           ))
     where run_id = p_run_id
       and status = 'running';

    delete from public.yqaa_knowledge_chunks_staging
     where ingestion_run_id = p_run_id;
    delete from public.yqaa_knowledge_sources_staging
     where ingestion_run_id = p_run_id;

    return jsonb_build_object(
      'run_id', p_run_id,
      'status', 'rejected',
      'problem', jsonb_build_object(
        'code', 'superseded_by_newer_run',
        'run_id', left(v_newer_run_id, 200)
      )
    );
  end if;

  if coalesce(v_expected_sources, 0) <= 0 or coalesce(v_expected_chunks, 0) <= 0 then
    raise exception 'YQAA ingestion run % has empty expected counts', p_run_id;
  end if;

  select count(*) into v_staged_sources
    from public.yqaa_knowledge_sources_staging
   where ingestion_run_id = p_run_id;

  select count(*) into v_staged_chunks
    from public.yqaa_knowledge_chunks_staging
   where ingestion_run_id = p_run_id;

  if v_staged_sources <> v_expected_sources then
    raise exception
      'YQAA ingestion run % source count mismatch: staged %, expected %',
      p_run_id, v_staged_sources, v_expected_sources;
  end if;

  if v_staged_chunks <> v_expected_chunks then
    raise exception
      'YQAA ingestion run % chunk count mismatch: staged %, expected %',
      p_run_id, v_staged_chunks, v_expected_chunks;
  end if;

  -- Active readers continue seeing the previous complete snapshot until this
  -- transaction commits. Any failure below rolls the entire replacement back.
  delete from public.yqaa_knowledge_chunks;
  delete from public.yqaa_knowledge_sources;

  insert into public.yqaa_knowledge_sources (
    source_key, site, repository, base_url, source_url, path, title,
    jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, active, metadata, ingestion_run_id
  )
  select
    source_key, site, repository, base_url, source_url, path, title,
    jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, true, metadata, p_run_id
  from public.yqaa_knowledge_sources_staging
  where ingestion_run_id = p_run_id;

  insert into public.yqaa_knowledge_chunks (
    chunk_key, source_key, site, repository, source_url, title, section_title,
    chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
    fetched_at, lastmod, metadata, ingestion_run_id
  )
  select
    chunk_key, source_key, site, repository, source_url, title, section_title,
    chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
    fetched_at, lastmod, metadata, p_run_id
  from public.yqaa_knowledge_chunks_staging
  where ingestion_run_id = p_run_id;

  select coalesce(jsonb_object_agg(site, cnt), '{}'::jsonb)
    into v_site_counts
    from (
      select site, count(*)::integer as cnt
      from public.yqaa_knowledge_sources
      where ingestion_run_id = p_run_id
      group by site
      order by site
    ) q;

  update public.yqaa_knowledge_ingestion_runs
     set completed_at = now(),
         status = 'completed',
         source_count = v_staged_sources,
         chunk_count = v_staged_chunks,
         site_counts = v_site_counts
   where run_id = p_run_id
     and status = 'running';

  delete from public.yqaa_knowledge_chunks_staging
   where ingestion_run_id = p_run_id;
  delete from public.yqaa_knowledge_sources_staging
   where ingestion_run_id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'source_count', v_staged_sources,
    'chunk_count', v_staged_chunks,
    'site_counts', v_site_counts
  );
end;
$$;

revoke all on function public.finalize_yqaa_knowledge_ingestion(text)
  from public, anon, authenticated;

grant execute on function public.finalize_yqaa_knowledge_ingestion(text)
  to service_role;

notify pgrst, 'reload schema';
