import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.YQAA_TEST_DATABASE_URL
if (!baseUrl) throw new Error('Set YQAA_TEST_DATABASE_URL to an isolated local PostgreSQL database (for example yqaa_test).')

const base = new URL(baseUrl)
const host = base.hostname.toLowerCase()
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Refusing non-loopback PostgreSQL host.')
if (!/^\/(?:yqaa_test|postgres|template1)$/.test(base.pathname)) {
  throw new Error('YQAA_TEST_DATABASE_URL must target yqaa_test, postgres, or template1; scratch database names are fixed and guarded.')
}

const scratchNames = ['yqaa_retrieval_previous_test', 'yqaa_retrieval_successor_test']
const migrationPaths = [
  'supabase/migrations/20260930070000_create_yqaa_public_knowledge_index.sql',
  'supabase/migrations/20260930071500_tune_yqaa_knowledge_ranking.sql',
  'supabase/migrations/20260930180000_yqaa_intent_ranking.sql',
]
const activeMigration = 'supabase/migrations/20261013210000_yqaa_retrieval_performance.sql'
const successorMigration = 'supabase/migrations/20261013220000_yqaa_retrieval_late_body.sql'

function run(args, input, databaseUrl = baseUrl) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl, ...args], {
    input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`)
  return result.stdout.trim()
}

function dbUrl(name) {
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return url.toString()
}

const existing = run([], `select datname from pg_database where datname in ('${scratchNames.join("','")}')`)
if (existing) throw new Error(`Refusing to replace existing scratch database(s): ${existing}`)
const created = []
try {
  for (const name of scratchNames) {
    run([], `create database ${name} template template0`)
    created.push(name)
  }

  const seed = `
create extension if not exists pg_trgm;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
`
  const insertData = `
insert into public.yqaa_knowledge_sources
 (source_key,site,repository,base_url,source_url,path,title,jurisdiction,source_kind,authority_tier,content_hash,active,fetched_at)
select 'src-'||n, (array['support','caseworks','market','usa','canada'])[((n-1)%5)+1], 'benchmark/public-knowledge',
 'https://example.test', 'https://example.test/'||n, '/'||n,
 case when n%97=0 then 'Canadien immigraiton study permitt support'
      when n%31=0 then 'Canada immigration study permit support rules'
      when n%11=0 then 'Customer support contact and account help'
      else 'Public knowledge topic '||(n%400)||' source '||n end,
 case when n%7=0 then 'United States' when n%3=0 then 'Canada' else null end,
 'live_html', (n%5+1)::smallint, md5(n::text), n%19<>0, timestamptz '2026-10-13 00:00:00+00'-((n%90)||' hours')::interval
from generate_series(1,25000) n;

insert into public.yqaa_knowledge_chunks
 (chunk_key,source_key,site,repository,source_url,title,section_title,chunk_index,jurisdiction,topic_tags,body,content_hash,authority_tier,fetched_at)
select 'chunk-'||n, 'src-'||n,
 (array['support','caseworks','market','usa','canada'])[((n-1)%5)+1], 'benchmark/public-knowledge',
 'https://example.test/'||n,
 case when n%97=0 then 'Canadien immigraiton study permitt support'
      when n%31=0 then 'Canada immigration study permit support rules'
      when n%11=0 then 'Customer support contact and account help'
      else 'Public knowledge topic '||(n%400)||' source '||n end,
 case when n%43=0 then 'Study permit eligibility and immigration rules'
      when n%17=0 then 'Customer support and contact information'
      else 'Topic details '||(n%250) end,
 1, case when n%7=0 then 'United States' when n%3=0 then 'Canada' else null end,
 case when n%31=0 then array['immigration','study permit']::text[]
      when n%11=0 then array['support','account']::text[] else array['general']::text[] end,
 case when n%31=0 then 'Canada immigration study permit rules and application guidance. '
      when n%11=0 then 'Contact customer support for account assistance. '
      else 'General publicly available knowledge content for benchmark row '||n||'. ' end
      || repeat('Applicants preparing immigration applications should confirm the permit category, eligibility rules, and filing location before collecting records. ', 10)
      || repeat('A complete application includes supporting documents, accurate dates, translated records when required, and a clear explanation of the request. ', 10)
      || repeat('Review timelines vary by case and jurisdiction. Contact the support team for account access, document upload, case status, and next steps. ', 10),
 md5(n::text), (n%5+1)::smallint, timestamptz '2026-10-13 00:00:00+00'-((n%90)||' hours')::interval
from generate_series(1,25000) n;
analyze public.yqaa_knowledge_sources;
analyze public.yqaa_knowledge_chunks;
`

  for (let i = 0; i < scratchNames.length; i++) {
    const target = dbUrl(scratchNames[i])
    run([], seed, target)
    for (const migration of migrationPaths) {
      run(['-f', path.join(root, migration)], '', target)
    }
    run(['-f', path.join(root, activeMigration)], '', target)
    if (i === 1) run(['-f', path.join(root, successorMigration)], '', target)
    run([], insertData, target)
  }

  const queries = [
    ['Canada immigration study permit support', 'support', 'Canada'],
    ['immigration application permit support documents timeline', null, null],
    ['Canadien immigraiton study permitt', null, 'Canada'],
    ['customer support contact account help', 'support', null],
    ['find an immigration service provider', 'market', 'United States'],
    ['study permit eligibility and immigration rules', 'caseworks', 'Canada'],
    ['help me proofread my immigration support letter', 'support', 'Canada'],
    ['   ', null, null],
  ]
  const results = []
  const explainPlans = []
  for (const [query, site, jurisdiction] of queries) {
    const args = [query, site, jurisdiction, 24].map((value) => value === null ? 'null' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`).join(',')
    const call = `set role service_role; select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.authority_tier desc, r.fetched_at desc), '[]'::jsonb)::text from public.search_yqaa_knowledge(${args}) r; reset role;`
    const timings = []
    const pair = scratchNames.map((name) => {
      const started = performance.now()
      const output = run([], call, dbUrl(name))
      timings.push(Math.round(performance.now() - started))
      return output
    })
    if (pair[0] !== pair[1]) throw new Error(`RPC output mismatch for query ${JSON.stringify(query)}.`)
    results.push({ query, count: JSON.parse(pair[0]).length, previous_ms: timings[0], successor_ms: timings[1] })
    if (query === 'immigration application permit support documents timeline') {
      const planSql = `set role service_role; explain (analyze, buffers, format json) select * from public.search_yqaa_knowledge(${args}); reset role;`
      explainPlans.push(...scratchNames.map((name) => ({
        database: name,
        plan: JSON.parse(run([], planSql, dbUrl(name)))[0],
      })))
    }
  }

  for (const name of scratchNames) {
    const target = dbUrl(name)
    const privileges = run([], `select has_function_privilege('service_role','public.search_yqaa_knowledge(text,text,text,integer)','execute') || ':' || (not has_function_privilege('anon','public.search_yqaa_knowledge(text,text,text,integer)','execute')) || ':' || (not has_function_privilege('authenticated','public.search_yqaa_knowledge(text,text,text,integer)','execute'))`, target)
    if (privileges !== 'true:true:true') throw new Error(`Unexpected RPC grants in ${name}: ${privileges}`)
  }
  console.log(JSON.stringify({ pass: true, rows: 25000, body: 'roughly 4 KB each with repeated common terms', compared: '20261013210000 vs 20261013220000', equivalentQueries: results, functionExplainPlans: explainPlans }, null, 2))
} finally {
  for (const name of created.reverse()) run([], `drop database ${name} with (force)`)
}
