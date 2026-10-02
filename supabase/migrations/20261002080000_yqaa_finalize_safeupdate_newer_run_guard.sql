-- Re-apply finalize_yqaa_knowledge_ingestion through the migration ledger.
--
-- Why this file exists:
--   1. 20260930074207_yqaa_knowledge_ingestion_finalize.sql was applied by the
--      CI runner from c92df382 (ledger sha 5c07a432…). It was edited in place
--      afterwards to tighten the newer-run supersede predicate. That edit never
--      reached production, and the ledger gate fails closed on the hash
--      mismatch, which blocks every later migration. The applied file is
--      restored byte-for-byte, and the tightened predicate ships here instead.
--   2. PostgREST requests run with pg_safeupdate, which rejects DELETE without
--      a WHERE clause ("DELETE requires a WHERE clause", SQLSTATE 21000). That
--      broke the nightly Sync YQAA Knowledge Index job at finalize. The two
--      full-table live replacements now say `where true`. Semantics are
--      unchanged: the whole snapshot is still replaced atomically in this
--      transaction.

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
  delete from public.yqaa_knowledge_chunks where true;
  delete from public.yqaa_knowledge_sources where true;

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
