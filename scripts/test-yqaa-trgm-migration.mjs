#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.YQAA_TEST_DATABASE_URL
if (!baseUrl) throw new Error('Set YQAA_TEST_DATABASE_URL to an isolated local PostgreSQL database (for example yqaa_test).')

const base = new URL(baseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname.toLowerCase())) {
  throw new Error('Refusing non-loopback PostgreSQL host.')
}
if (!/^\/(?:yqaa_test|postgres|template1)$/.test(base.pathname)) {
  throw new Error('YQAA_TEST_DATABASE_URL must target yqaa_test, postgres, or template1; scratch database names are fixed and guarded.')
}

const suffix = randomBytes(5).toString('hex')
const databaseName = `yqaa_trgm_${suffix}_test`
const probeRole = `yqaa_trgm_${suffix}`
const probePassword = randomBytes(24).toString('hex')
const migration = path.join(root, 'supabase/migrations/20261013210000_yqaa_retrieval_performance.sql')
const baseline = path.join(root, 'supabase/migrations/20260930070000_create_yqaa_public_knowledge_index.sql')
const missingRoles = []
let databaseCreated = false

function run(args, input = '', databaseUrl = baseUrl, allowFailure = false) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', databaseUrl, ...args], {
    input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  })
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`)
  return { output: result.stdout.trim(), status: result.status, stderr: result.stderr.trim() }
}

function databaseUrlFor(name) {
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return url.toString()
}

function probeUrl() {
  const url = new URL(databaseUrlFor(databaseName))
  url.username = probeRole
  url.password = probePassword
  return url.toString()
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`
}

try {
  const existing = run([], `select datname from pg_database where datname=${sqlLiteral(databaseName)}`).output
  if (existing) throw new Error(`Refusing to replace existing scratch database: ${databaseName}`)

  const existingRoles = new Set(run([], `select rolname from pg_roles where rolname in ('anon','authenticated','service_role')`).output.split('\n').filter(Boolean))
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!existingRoles.has(role)) {
      run([], `create role ${role} nologin${role === 'service_role' ? ' bypassrls' : ''}`)
      missingRoles.push(role)
    }
  }

  run([], `create role ${probeRole} login password ${sqlLiteral(probePassword)}`)
  run([], `create database ${databaseName} template template0`)
  databaseCreated = true
  const target = databaseUrlFor(databaseName)
  run([], 'create extension pg_trgm', target)
  run(['-f', baseline], '', target)
  run([], `grant connect on database ${databaseName} to ${probeRole}; grant create on schema public to ${probeRole}; alter function public.search_yqaa_knowledge(text,text,text,integer) owner to ${probeRole}; grant select on all tables in schema public to ${probeRole};`, target)

  // This psql process is a fresh backend and runs as a non-superuser. The
  // assertion fails if pg_trgm's GUCs were loaded before the migration starts.
  const initial = run([], `
select current_user || ':' || (select rolsuper::text from pg_roles where rolname=current_user)
  || ':' || coalesce(current_setting('pg_trgm.similarity_threshold', true), 'NULL')
  || ':' || exists(select 1 from pg_settings where name='pg_trgm.similarity_threshold')::text;
`, probeUrl()).output
  if (initial !== `${probeRole}:false:NULL:false`) throw new Error(`Probe backend was not clean and non-superuser: ${initial}`)

  // A separate new backend executes the exact migration transaction as the
  // same unprivileged role. Without the preload, CREATE FUNCTION fails with
  // SQLSTATE 42704 because pg_trgm's custom GUC has not been registered.
  run(['-1', '-f', migration], '', probeUrl())

  const config = run([], `
select current_user || ':' || (select rolsuper::text from pg_roles where rolname=current_user)
  || ':' || (select array_to_string(proconfig, ',') from pg_proc
             where oid='public.search_yqaa_knowledge(text,text,text,integer)'::regprocedure);
`, probeUrl()).output
  if (!config.startsWith(`${probeRole}:false:`) || !config.includes('pg_trgm.similarity_threshold=0.08')) {
    throw new Error(`Migration function configuration mismatch: ${config}`)
  }

  const freshRpc = run([], `select count(*) from public.search_yqaa_knowledge('yqaa', null, null, 12);`, probeUrl()).output
  if (freshRpc !== '0') throw new Error(`Fresh non-superuser RPC execution failed: ${freshRpc}`)

  const loaded = run([], `
select similarity('yqaa','yqaa');
select current_setting('pg_trgm.similarity_threshold') || ':' ||
       (select context from pg_settings where name='pg_trgm.similarity_threshold');
`, probeUrl()).output.split('\n').at(-1)
  if (loaded !== '0.3:user') throw new Error(`Expected a registered USERSET threshold on function-free fresh backend after similarity call, got: ${loaded}`)

  console.log('PASS: fresh non-superuser backends start without pg_trgm GUCs; migration transaction registers them before CREATE FUNCTION; threshold remains 0.08 and USERSET.')
} finally {
  if (databaseCreated) run([], `drop database ${databaseName} with (force)`)
  run([], `drop role if exists ${probeRole}`)
  for (const role of missingRoles.reverse()) run([], `drop role if exists ${role}`)
}
