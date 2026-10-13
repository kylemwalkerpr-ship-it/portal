#!/usr/bin/env node

// Transactional integration test for the production YQAA incremental finalizer.
// It deliberately targets only disposable loopback PostgreSQL and rolls back
// every fixture, finalization, trigger, and migration-independent data change.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.YQAA_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/yqaa_retrieval_test'
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !/(test|local|yqaa)/i.test(databaseName)) {
  throw new Error('Refusing database test: URL must use a loopback host and a database name containing test, local, or yqaa.')
}

function psql(sql) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], {
    input: sql,
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0) throw new Error(output || `psql exited ${result.status}`)
  return result.stdout.trim()
}

const suffix = randomBytes(8).toString('hex')
const runId = `yqaa_incremental_${suffix}`
const rollbackRunId = `yqaa_rollback_${suffix}`
const olderRunId = `yqaa_older_${suffix}`
const newerRunId = `yqaa_newer_${suffix}`
const seedRunId = `yqaa_seed_${suffix}`
const countTrigger = `yqaa_incremental_count_${suffix}`
const countFunction = `yqaa_incremental_count_fn_${suffix}`
const failureTrigger = `yqaa_incremental_failure_${suffix}`
const failureFunction = `yqaa_incremental_failure_fn_${suffix}`

const ready = psql(`
  select
    to_regclass('public.yqaa_knowledge_chunks_staging') is not null
    and to_regclass('public.yqaa_knowledge_sources_staging') is not null
    and to_regclass('public.yqaa_knowledge_chunks_search_gin') is not null
    and to_regclass('public.yqaa_knowledge_chunks_title_trgm') is not null
    and to_regclass('public.yqaa_knowledge_chunks_section_trgm') is not null
    and to_regprocedure('public.finalize_yqaa_knowledge_ingestion(text)') is not null;
`)
if (ready !== 't') throw new Error('YQAA staging tables, retrieval indexes, or finalizer are missing; apply the isolated migrations first.')

const result = psql(`
begin;
set local statement_timeout = '120s';

create temporary table yqaa_incremental_state (
  run_id text not null,
  source_count integer not null,
  chunk_count integer not null,
  source_key text not null,
  first_chunk_index integer not null,
  freshness_chunk_key text not null
);
create temporary table yqaa_incremental_success_signature (signature text);
create temporary table yqaa_incremental_update_counter (updates integer not null default 0, insert_attempts integer not null default 0);
insert into yqaa_incremental_update_counter default values;

do $setup$
declare
  v_source_key text;
  v_source record;
  v_source_count integer;
  v_chunk_count integer;
  v_fill_count integer;
  v_first_chunk_index integer;
  v_freshness_chunk_key text;
begin
  select source_key into v_source_key
    from public.yqaa_knowledge_sources
   order by source_key
   limit 1;
  if v_source_key is null then raise exception 'test requires an existing live source'; end if;

  insert into public.yqaa_knowledge_ingestion_runs
    (run_id, started_at, completed_at, status, source_count, chunk_count, metadata)
  values ('${seedRunId}', now() - interval '100 years', now(), 'completed', 1, 1, '{"test":"incremental-seed"}');

  select * into v_source from public.yqaa_knowledge_sources where source_key = v_source_key;
  select coalesce(max(chunk_index), 0) + 1 into v_first_chunk_index
    from public.yqaa_knowledge_chunks where source_key = v_source_key;
  select greatest(0, 25000 - count(*))::integer into v_fill_count
    from public.yqaa_knowledge_chunks;

  if v_fill_count > 0 then
    insert into public.yqaa_knowledge_chunks (
      chunk_key, source_key, site, repository, source_url, title, section_title,
      chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
      fetched_at, lastmod, metadata, ingestion_run_id
    )
    select
      v_source_key || ':' || (v_first_chunk_index + n), v_source_key,
      v_source.site, v_source.repository, v_source.source_url,
      'Incremental fixture ' || n, 'Stable unchanged baseline',
      v_first_chunk_index + n, v_source.jurisdiction, array['incremental-test'],
      'Deterministic indexed baseline fixture ' || n, md5(n::text), 3,
      now() - interval '1 day', null, '{"test":"incremental-baseline"}'::jsonb, '${seedRunId}'
    from generate_series(1, v_fill_count) as n;
  end if;

  v_freshness_chunk_key := v_source_key || ':' || (v_first_chunk_index + v_fill_count + 1);
  insert into public.yqaa_knowledge_chunks (
    chunk_key, source_key, site, repository, source_url, title, section_title,
    chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
    fetched_at, lastmod, metadata, ingestion_run_id
  ) values (
    v_freshness_chunk_key, v_source_key, v_source.site, v_source.repository,
    v_source.source_url, 'Incremental freshness probe ${suffix}', 'Verified source freshness',
    v_first_chunk_index + v_fill_count + 1, v_source.jurisdiction,
    array['incremental-test','freshness'], 'Unique indexed freshness probe ${suffix}',
    md5('freshness:${suffix}'), 3, now() - interval '1 day', null,
    '{"test":"incremental-freshness"}'::jsonb, '${seedRunId}'
  );

  select count(*)::integer into v_source_count from public.yqaa_knowledge_sources;
  select count(*)::integer into v_chunk_count from public.yqaa_knowledge_chunks;
  if v_chunk_count < 25000 then raise exception 'expected at least 25,000 indexed baseline chunks, found %', v_chunk_count; end if;

  insert into public.yqaa_knowledge_ingestion_runs
    (run_id, started_at, status, source_count, chunk_count, metadata)
  values ('${runId}', now() + interval '100 years', 'running', v_source_count, v_chunk_count, '{"test":"incremental-success"}');

  insert into public.yqaa_knowledge_sources_staging (
    ingestion_run_id, source_key, site, repository, base_url, source_url, path,
    title, jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, active, metadata
  )
  select '${runId}', source_key, site, repository, base_url, source_url, path,
    title, jurisdiction, source_kind, authority_tier, http_status, content_hash,
    now(), now(), lastmod, true, metadata
  from public.yqaa_knowledge_sources;

  insert into public.yqaa_knowledge_chunks_staging (
    ingestion_run_id, chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, jurisdiction, topic_tags, body,
    content_hash, authority_tier, fetched_at, lastmod, metadata
  )
  select '${runId}', chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, jurisdiction, topic_tags, body,
    content_hash, authority_tier, now(), lastmod, metadata
  from public.yqaa_knowledge_chunks;

  -- Four updates, four additions, and four removals; the net snapshot stays
  -- 25,000+ chunks and every other stable chunk key remains byte-for-byte equal.
  with selected as (
    select chunk_key, row_number() over (order by chunk_key) as rn
      from public.yqaa_knowledge_chunks
  )
  update public.yqaa_knowledge_chunks_staging staged
     set body = staged.body || ' changed in this verified run',
         content_hash = md5(staged.content_hash || ':changed'),
         fetched_at = now(),
         metadata = staged.metadata || '{"test_changed":true}'::jsonb
    from selected
   where staged.ingestion_run_id = '${runId}'
     and staged.chunk_key = selected.chunk_key
     and selected.rn <= 4;

  with selected as (
    select chunk_key, row_number() over (order by chunk_key) as rn
      from public.yqaa_knowledge_chunks
  )
  delete from public.yqaa_knowledge_chunks_staging staged
   using selected
   where staged.ingestion_run_id = '${runId}'
     and staged.chunk_key = selected.chunk_key
     and selected.rn between 5 and 8;

  select * into v_source from public.yqaa_knowledge_sources where source_key = v_source_key;
  insert into public.yqaa_knowledge_chunks_staging (
    ingestion_run_id, chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, jurisdiction, topic_tags, body,
    content_hash, authority_tier, fetched_at, lastmod, metadata
  )
  select '${runId}', v_source_key || ':' || (v_first_chunk_index + v_fill_count + n + 1),
    v_source_key, v_source.site, v_source.repository, v_source.source_url,
    'New incremental fixture ' || n, 'New indexed chunk',
    v_first_chunk_index + v_fill_count + n + 1, v_source.jurisdiction,
    array['incremental-test','new'], 'New staged indexed fixture ' || n,
    md5('new:' || n::text), 3, now(), null, '{"test":"incremental-new"}'::jsonb
  from generate_series(1, 4) as n;

  select count(*)::integer into v_source_count from public.yqaa_knowledge_sources_staging where ingestion_run_id = '${runId}';
  select count(*)::integer into v_chunk_count from public.yqaa_knowledge_chunks_staging where ingestion_run_id = '${runId}';
  update public.yqaa_knowledge_ingestion_runs
     set source_count = v_source_count, chunk_count = v_chunk_count
   where run_id = '${runId}';
  insert into yqaa_incremental_state values ('${runId}', v_source_count, v_chunk_count, v_source_key, v_first_chunk_index, v_freshness_chunk_key);
end;
$setup$;

create temporary table yqaa_incremental_ctids as
  select chunk_key, ctid as row_tid from public.yqaa_knowledge_chunks;

create function public.${countFunction}() returns trigger
language plpgsql security definer set search_path = public as $counter$
begin
  update pg_temp.yqaa_incremental_update_counter
     set updates = updates + case when TG_OP = 'UPDATE' then 1 else 0 end,
         insert_attempts = insert_attempts + case when TG_OP = 'INSERT' then 1 else 0 end;
  return new;
end;
$counter$;
create trigger ${countTrigger}
  before insert or update on public.yqaa_knowledge_chunks
  for each row execute function public.${countFunction}();
grant update on yqaa_incremental_update_counter to service_role;

create function public.${failureFunction}() returns trigger language plpgsql as $failure$
begin
  if new.ingestion_run_id = '${rollbackRunId}' then raise exception 'injected incremental test failure'; end if;
  return new;
end;
$failure$;
create trigger ${failureTrigger}
  before update on public.yqaa_knowledge_chunks
  for each row execute function public.${failureFunction}();

set local role service_role;
select public.finalize_yqaa_knowledge_ingestion('${runId}');
reset role;

do $assert_incremental$
declare
  v_state record;
  v_unchanged_count integer;
  v_update_count integer;
  v_insert_attempts integer;
  v_run record;
  v_live_signature text;
begin
  select * into v_state from yqaa_incremental_state;
  select count(*)::integer into v_unchanged_count
    from yqaa_incremental_ctids before_rows
    join public.yqaa_knowledge_chunks live using (chunk_key)
   where before_rows.row_tid = live.ctid;
  select updates into v_update_count from yqaa_incremental_update_counter;
  select insert_attempts into v_insert_attempts from yqaa_incremental_update_counter;
  if v_unchanged_count <> v_state.chunk_count - 8 then
    raise exception 'unchanged chunk ctid count %, expected %', v_unchanged_count, v_state.chunk_count - 8;
  end if;
  if v_update_count <> 4 then raise exception 'chunk update trigger count %, expected 4', v_update_count; end if;
  if v_insert_attempts <> 8 then raise exception 'chunk insert trigger count %, expected 8 (new and changed rows only)', v_insert_attempts; end if;

  select * into v_run from public.yqaa_knowledge_ingestion_runs where run_id = '${runId}';
  if v_run.status <> 'completed' or v_run.source_count <> v_state.source_count or v_run.chunk_count <> v_state.chunk_count then
    raise exception 'completed run totals do not match verified staged snapshot';
  end if;
  if v_run.site_counts is distinct from (
    select coalesce(jsonb_object_agg(site_totals.site, site_totals.sources), '{}'::jsonb)
    from (
      select sources.site, count(distinct sources.source_key)::integer as sources,
        count(chunks.chunk_key)::integer as chunks
      from public.yqaa_knowledge_sources sources
      left join public.yqaa_knowledge_chunks chunks on chunks.source_key = sources.source_key
      where sources.ingestion_run_id = '${runId}'
      group by sources.site
    ) site_totals
  ) then raise exception 'run site counts do not match verified live snapshot'; end if;
  if not exists (
    select 1
    from public.search_yqaa_knowledge('Incremental freshness probe ${suffix}', null, null, 24) result
    join public.yqaa_knowledge_sources sources on sources.source_key = result.source_key
    where result.chunk_key = v_state.freshness_chunk_key
      and result.fetched_at = sources.fetched_at
  ) then raise exception 'retrieval RPC did not return the latest verified source freshness'; end if;
  if (select count(*) from public.yqaa_knowledge_sources where ingestion_run_id = '${runId}') <> v_state.source_count then
    raise exception 'not all verified sources have current-run provenance';
  end if;
  if (select count(*) from public.yqaa_knowledge_chunks where ingestion_run_id = '${runId}') <> 8 then
    raise exception 'expected only 4 changed and 4 new chunks to carry current-run provenance';
  end if;
  if (select count(*) from public.yqaa_knowledge_chunks_staging where ingestion_run_id = '${runId}') <> 0
     or (select count(*) from public.yqaa_knowledge_sources_staging where ingestion_run_id = '${runId}') <> 0 then
    raise exception 'successful finalization did not clean its staging rows';
  end if;
  if not has_function_privilege('service_role', 'public.finalize_yqaa_knowledge_ingestion(text)', 'execute')
     or has_function_privilege('anon', 'public.finalize_yqaa_knowledge_ingestion(text)', 'execute')
     or has_function_privilege('authenticated', 'public.finalize_yqaa_knowledge_ingestion(text)', 'execute') then
    raise exception 'finalizer execute privilege is not service-role only';
  end if;

  select
    (select md5(coalesce(string_agg(to_jsonb(s)::text, '' order by s.source_key), '')) from public.yqaa_knowledge_sources s)
      || ':' ||
    (select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.chunk_key), '')) from public.yqaa_knowledge_chunks c)
    into v_live_signature;
  insert into yqaa_incremental_success_signature values (v_live_signature);

  insert into public.yqaa_knowledge_ingestion_runs
    (run_id, started_at, status, source_count, chunk_count, metadata)
  values ('${rollbackRunId}', now() + interval '200 years', 'running', v_state.source_count, v_state.chunk_count, '{"test":"incremental-rollback"}');
  insert into public.yqaa_knowledge_sources_staging (
    ingestion_run_id, source_key, site, repository, base_url, source_url, path,
    title, jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, active, metadata
  )
  select '${rollbackRunId}', source_key, site, repository, base_url, source_url, path,
    title, jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, true, metadata
  from public.yqaa_knowledge_sources;
  insert into public.yqaa_knowledge_chunks_staging (
    ingestion_run_id, chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, jurisdiction, topic_tags, body,
    content_hash, authority_tier, fetched_at, lastmod, metadata
  )
  select '${rollbackRunId}', chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, jurisdiction, topic_tags, body,
    content_hash, authority_tier, fetched_at, lastmod, metadata
  from public.yqaa_knowledge_chunks;
  update public.yqaa_knowledge_chunks_staging
     set body = body || ' rollback failure', content_hash = md5(content_hash || ':rollback'),
         metadata = metadata || '{"test_rollback":true}'::jsonb
   where ingestion_run_id = '${rollbackRunId}'
     and chunk_key = (select min(chunk_key) from public.yqaa_knowledge_chunks);
  begin
    perform public.finalize_yqaa_knowledge_ingestion('${rollbackRunId}');
    raise exception 'expected injected incremental test failure was not raised';
  exception when others then
    if sqlerrm <> 'injected incremental test failure' then raise; end if;
  end;

  select
    (select md5(coalesce(string_agg(to_jsonb(s)::text, '' order by s.source_key), '')) from public.yqaa_knowledge_sources s)
      || ':' ||
    (select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.chunk_key), '')) from public.yqaa_knowledge_chunks c)
    into v_live_signature;
  if v_live_signature <> (select signature from yqaa_incremental_success_signature) then
    raise exception 'failed incremental finalization changed the live source/chunk signatures';
  end if;
  if (select status from public.yqaa_knowledge_ingestion_runs where run_id = '${rollbackRunId}') <> 'running'
     or (select count(*) from public.yqaa_knowledge_chunks_staging where ingestion_run_id = '${rollbackRunId}') <> v_state.chunk_count then
    raise exception 'failed incremental finalization did not roll back run and staging state';
  end if;

  -- Both runs carry complete valid staging, but the older one must be rejected
  -- before touching live data when the newer run becomes finalization-eligible.
  insert into public.yqaa_knowledge_ingestion_runs
    (run_id, started_at, status, source_count, chunk_count, metadata)
  values
    ('${olderRunId}', now() + interval '300 years', 'running', 1, 1, '{"test":"older-fence"}'),
    ('${newerRunId}', now() + interval '301 years', 'running', 1, 1, '{"test":"newer-fence"}');
  insert into public.yqaa_knowledge_sources_staging (
    ingestion_run_id, source_key, site, repository, base_url, source_url,
    path, title, source_kind, authority_tier, content_hash, fetched_at,
    last_seen_at, metadata
  ) values
    ('${olderRunId}', 'test-old-${suffix}', 'test', 'test', 'https://test.invalid', 'https://test.invalid/old-${suffix}', '/', 'old', 'live_html', 3, 'old', now(), now(), '{}'),
    ('${newerRunId}', 'test-new-${suffix}', 'test', 'test', 'https://test.invalid', 'https://test.invalid/new-${suffix}', '/', 'new', 'live_html', 3, 'new', now(), now(), '{}');
  insert into public.yqaa_knowledge_chunks_staging (
    ingestion_run_id, chunk_key, source_key, site, repository, source_url,
    title, section_title, chunk_index, body, content_hash, authority_tier,
    fetched_at, metadata
  ) values
    ('${olderRunId}', 'test-old-${suffix}:1', 'test-old-${suffix}', 'test', 'test', 'https://test.invalid/old-${suffix}', 'old', 'fence', 1, 'old', 'old', 3, now(), '{}'),
    ('${newerRunId}', 'test-new-${suffix}:1', 'test-new-${suffix}', 'test', 'test', 'https://test.invalid/new-${suffix}', 'new', 'fence', 1, 'new', 'new', 3, now(), '{}');
  if (select result->>'status' from (select public.finalize_yqaa_knowledge_ingestion('${olderRunId}') as result) q) <> 'rejected'
     or (select problems->0->>'code' from public.yqaa_knowledge_ingestion_runs where run_id = '${olderRunId}') <> 'superseded_by_newer_run' then
    raise exception 'eligible newer run failed to fence older finalization';
  end if;
  select
    (select md5(coalesce(string_agg(to_jsonb(s)::text, '' order by s.source_key), '')) from public.yqaa_knowledge_sources s)
      || ':' ||
    (select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by c.chunk_key), '')) from public.yqaa_knowledge_chunks c)
    into v_live_signature;
  if v_live_signature <> (select signature from yqaa_incremental_success_signature) then
    raise exception 'older-run fence changed live source/chunk signatures';
  end if;
end;
$assert_incremental$;

rollback;
select 'PASS: indexed incremental finalization preserved unchanged ctids, updated exactly four changed chunks, verified 25,000+ rows, and passed atomic rollback, newer-run fence, and service-only ACL checks';
`)

console.log(result)
