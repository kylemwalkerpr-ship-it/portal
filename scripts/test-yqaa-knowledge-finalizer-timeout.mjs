#!/usr/bin/env node

// Parent-run integration check for the production finalizer call. This must
// target a disposable local PostgreSQL database with the YQAA migrations
// already applied; no production or remote database URL is accepted.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.YQAA_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/yqaa_test'
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !/(test|local|yqaa)/i.test(databaseName)) {
  throw new Error('Refusing database test: URL must use a loopback host and a database name containing test, local, or yqaa.')
}

function psql(sql, { expectFailure = false } = {}) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl], {
    input: sql,
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (expectFailure) {
    if (result.status === 0) throw new Error('Expected the bounded finalizer call to time out.')
    return output
  }
  if (result.status !== 0) throw new Error(output || `psql exited ${result.status}`)
  return result.stdout.trim()
}

const suffix = randomBytes(8).toString('hex')
const runId = `yqaa_timeout_test_${suffix}`
const sourceKey = `yqaa_timeout_test_source_${suffix}`
const triggerName = `yqaa_timeout_test_trg_${suffix}`
const functionName = `yqaa_timeout_test_fn_${suffix}`

const liveSignature = () => psql(`
  select json_build_object(
    'sources', (select count(*) from public.yqaa_knowledge_sources),
    'chunks', (select count(*) from public.yqaa_knowledge_chunks),
    'source_keys', (select md5(coalesce(string_agg(source_key, ',' order by source_key), '')) from public.yqaa_knowledge_sources),
    'chunk_keys', (select md5(coalesce(string_agg(chunk_key || ':' || source_key, ',' order by chunk_key), '')) from public.yqaa_knowledge_chunks)
  );
`)

const finalizerCall = `select public.finalize_yqaa_knowledge_ingestion('${runId}') as result;`

const ready = psql(`
  select
    to_regclass('public.yqaa_knowledge_chunks_staging') is not null
    and to_regclass('public.yqaa_knowledge_sources_staging') is not null
    and to_regprocedure('public.finalize_yqaa_knowledge_ingestion(text)') is not null;
`)
if (ready !== 't') throw new Error('YQAA tables/finalizer are missing; apply the migrations to the isolated database first.')
const timeoutContext = psql(`select context from pg_settings where name = 'statement_timeout';`)
if (timeoutContext !== 'user') {
  throw new Error(`Expected statement_timeout to be USERSET (pg_settings context=user), got: ${timeoutContext}`)
}

const baseline = liveSignature()
const baselineJson = JSON.parse(baseline)
if (baselineJson.sources < 1 || baselineJson.chunks < 1) {
  throw new Error(`Refusing to run without a populated previous live index: ${baseline}`)
}

const rejectedCte = psql(`
  set statement_timeout = '20ms';
  with local_timeout as materialized (
    select set_config('statement_timeout', '120s', true)
  )
  select pg_sleep(0.08) from local_timeout;
`, { expectFailure: true })
if (!/57014|statement timeout|canceling statement due to statement timeout/i.test(rejectedCte)) {
  throw new Error(`Expected the in-statement timeout adjustment to remain subject to the initial 20ms limit, got: ${rejectedCte}`)
}
const separateSetting = psql(`
  set statement_timeout = '20ms';
  begin;
  set local statement_timeout = '120s';
  select pg_sleep(0.08);
  rollback;
`)
void separateSetting

let fixtureInstalled = false
let timeoutTriggerInstalled = false
try {
  psql(`
    begin;
    insert into public.yqaa_knowledge_ingestion_runs
      (run_id, started_at, status, source_count, chunk_count, metadata)
    values ('${runId}', now() + interval '10 years', 'running', 1, 25000, '{"test":"atomic-timeout"}'::jsonb);

    insert into public.yqaa_knowledge_sources_staging (
      ingestion_run_id, source_key, site, repository, base_url, source_url,
      path, title, source_kind, authority_tier, content_hash, fetched_at,
      last_seen_at, metadata
    ) values (
      '${runId}', '${sourceKey}', 'test', 'isolated', 'https://example.invalid',
      'https://example.invalid/${suffix}', '/', 'Timeout test source',
      'live_html', 3, 'test-hash', now(), now(), '{"test":true}'::jsonb
    );

    insert into public.yqaa_knowledge_chunks_staging (
      ingestion_run_id, chunk_key, source_key, site, repository, source_url,
      title, section_title, chunk_index, topic_tags, body, content_hash,
      authority_tier, fetched_at, metadata
    )
    select
      '${runId}', '${runId}_chunk_' || n, '${sourceKey}', 'test', 'isolated',
      'https://example.invalid/${suffix}', 'Timeout test chunk ' || n,
      'Atomic replacement', n, array['timeout','atomic'],
      'Synthetic body row ' || n, md5(n::text), 3, now(), '{"test":true}'::jsonb
    from generate_series(1, 25000) as n;
    commit;
  `)
  fixtureInstalled = true

  // Pause a replacement insert long enough to exceed the forced 20ms timeout.
  psql(`
    create function public.${functionName}() returns trigger language plpgsql as $$
    begin
      if new.ingestion_run_id = '${runId}' and new.chunk_index = 1 then perform pg_sleep(0.08); end if;
      return new;
    end;
    $$;
    create trigger ${triggerName}
      before insert on public.yqaa_knowledge_chunks
      for each row execute function public.${functionName}();
  `)
  timeoutTriggerInstalled = true

  // The initial 20ms setting is ineffective until changed in its own
  // statement; the finalizer's 80ms trigger delay must then complete.
  const successful = psql(`
    begin;
    set local statement_timeout = '20ms';
    set local statement_timeout = '120s';
    ${finalizerCall}
    rollback;
  `)
  if (!successful.includes('25000')) throw new Error(`Expected the finalizer result to report 25,000 chunks, got: ${successful}`)
  const afterSuccessRollback = liveSignature()
  if (afterSuccessRollback !== baseline) throw new Error('The successful rollback changed the previous live index.')

  const failure = psql(`
    begin;
    set local statement_timeout = '20ms';
    ${finalizerCall}
  `, { expectFailure: true })
  if (!/57014|statement timeout|canceling statement due to statement timeout/i.test(failure)) {
    throw new Error(`Expected SQLSTATE 57014 from the bounded transaction-local timeout, got: ${failure}`)
  }
  const afterTimeoutRollback = liveSignature()
  if (afterTimeoutRollback !== baseline) {
    throw new Error(`Timeout failure changed the previous live index. Before=${baseline}; after=${afterTimeoutRollback}`)
  }

  console.log('PASS: The 20ms initial timeout canceled the in-statement adjustment; separate SET LOCAL allowed 80ms work and 25,000 staged chunks to finalize. The successful test transaction rolled back cleanly.')
  console.log('PASS: SQLSTATE 57014 during live replacement rolled back and preserved the previous live source/chunk signatures.')
} finally {
  if (timeoutTriggerInstalled) {
    psql(`drop trigger if exists ${triggerName} on public.yqaa_knowledge_chunks; drop function if exists public.${functionName}();`)
  }
  if (fixtureInstalled) {
    psql(`
      delete from public.yqaa_knowledge_chunks_staging where ingestion_run_id = '${runId}';
      delete from public.yqaa_knowledge_sources_staging where ingestion_run_id = '${runId}';
      delete from public.yqaa_knowledge_ingestion_runs where run_id = '${runId}';
    `)
  }
}
