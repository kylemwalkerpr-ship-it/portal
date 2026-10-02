import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMAGE = 'postgres:17.11@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f'
const FIXTURE = 'tests/sql/studio-authority-locks.sql'
const trackedSources = [
  'lib/studioAuthority/contracts.ts',
  'lib/studioAuthority/repository.ts',
  'tests/content-studio-v3/authorityContracts.test.ts',
  FIXTURE,
  'scripts/test-studio-authority-locks.mjs',
  'lib/contentStudioV3/contracts/registry.ts',
  'lib/contentStudioV3/contracts/schema.ts',
  'lib/contentStudioV3/contracts/hashes.ts',
]
const children = new Set()
const cleanupFailures = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function safeRunPart(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value)
}

function expectedDb(env) {
  return `studio_authority_test_${env.GITHUB_RUN_ID}_${env.GITHUB_RUN_ATTEMPT}`
}

function fixtureConfig(env) {
  const required = [
    'STUDIO_AUTHORITY_FIXTURE_HOST', 'STUDIO_AUTHORITY_FIXTURE_PORT',
    'STUDIO_AUTHORITY_FIXTURE_USER', 'STUDIO_AUTHORITY_FIXTURE_PASSWORD',
    'STUDIO_AUTHORITY_FIXTURE_DB', 'STUDIO_AUTHORITY_FIXTURE_ACK',
    'STUDIO_AUTHORITY_FIXTURE_IMAGE', 'STUDIO_AUTHORITY_CANDIDATE_SHA',
    'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_WORKSPACE',
  ]
  if (required.some((key) => !env[key])) throw new Error('BLOCKED_TEST_ENV')
  if (!safeRunPart(env.GITHUB_RUN_ID) || !safeRunPart(env.GITHUB_RUN_ATTEMPT)
      || !/^[0-9a-f]{40}$/.test(env.STUDIO_AUTHORITY_CANDIDATE_SHA)) throw new Error('BLOCKED_TEST_ENV')
  if (!['127.0.0.1', '::1', 'localhost'].includes(env.STUDIO_AUTHORITY_FIXTURE_HOST)) throw new Error('BLOCKED_TEST_ENV')
  if (!/^[0-9]{1,5}$/.test(env.STUDIO_AUTHORITY_FIXTURE_PORT)
      || Number(env.STUDIO_AUTHORITY_FIXTURE_PORT) < 1 || Number(env.STUDIO_AUTHORITY_FIXTURE_PORT) > 65535) {
    throw new Error('BLOCKED_TEST_ENV')
  }
  if (env.STUDIO_AUTHORITY_FIXTURE_DB !== expectedDb(env)
      || env.STUDIO_AUTHORITY_FIXTURE_ACK !== 'DISPOSABLE_FIXTURE_ONLY'
      || env.STUDIO_AUTHORITY_FIXTURE_IMAGE !== IMAGE) throw new Error('BLOCKED_TEST_ENV')
  if (Object.keys(env).some((key) => /^(SUPABASE_|DATABASE_URL$|SERVICE_ROLE|PRODUCTION_)/.test(key))) {
    throw new Error('BLOCKED_TEST_ENV')
  }
  const workspace = path.resolve(env.GITHUB_WORKSPACE)
  if (workspace !== ROOT) throw new Error('BLOCKED_TEST_ENV')
  return {
    host: env.STUDIO_AUTHORITY_FIXTURE_HOST,
    port: env.STUDIO_AUTHORITY_FIXTURE_PORT,
    user: env.STUDIO_AUTHORITY_FIXTURE_USER,
    password: env.STUDIO_AUTHORITY_FIXTURE_PASSWORD,
    database: env.STUDIO_AUTHORITY_FIXTURE_DB,
    candidateSha: env.STUDIO_AUTHORITY_CANDIDATE_SHA,
    runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    image: IMAGE,
    receiptPath: path.join(workspace, '.studio-authority-locks', `${env.GITHUB_RUN_ID}_${env.GITHUB_RUN_ATTEMPT}`, 'receipt.json'),
  }
}

function pgEnv(config) {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    PGHOST: config.host,
    PGPORT: config.port,
    PGUSER: config.user,
    PGPASSWORD: config.password,
    PGDATABASE: config.database,
    PGSSLMODE: 'disable',
  }
}

class PsqlSession {
  constructor(config, label) {
    this.label = label
    this.buffer = ''
    this.stderrBytes = 0
    this.closed = false
    this.child = spawn('psql', ['--no-psqlrc', '--quiet', '--no-align', '--tuples-only', '--set=ON_ERROR_STOP=1'], {
      cwd: ROOT, env: pgEnv(config), stdio: ['pipe', 'pipe', 'pipe'],
    })
    children.add(this.child)
    this.child.on('error', () => { this.spawnError = true })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => { this.buffer += chunk })
    this.child.stderr.on('data', (chunk) => { this.stderrBytes += Buffer.byteLength(chunk) })
    this.closedPromise = new Promise((resolve) => this.child.once('close', (code, signal) => {
      children.delete(this.child)
      this.closed = true
      resolve({ code, signal })
    }))
  }

  async waitFor(pattern, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const match = this.buffer.match(pattern)
      if (match) {
        this.buffer = this.buffer.slice(match.index + match[0].length)
        return match
      }
      if (this.closed) throw new Error('PSQL_CHILD_EXITED')
      await sleep(20)
    }
    throw new Error('PSQL_BARRIER_TIMEOUT')
  }

  send(sql) {
    if (this.closed) throw new Error('PSQL_CHILD_CLOSED')
    this.child.stdin.write(sql + '\n')
  }

  async stop() {
    if (this.closed) return { ...(await this.closedPromise), drained: true }
    this.child.stdin.write('\\q\n')
    const graceful = await Promise.race([this.closedPromise, sleep(750).then(() => null)])
    if (graceful) return { ...graceful, drained: true }
    this.child.kill('SIGTERM')
    const terminated = await Promise.race([this.closedPromise, sleep(750).then(() => null)])
    if (terminated) return { ...terminated, drained: true }
    this.child.kill('SIGKILL')
    const killed = await Promise.race([this.closedPromise, sleep(1000).then(() => null)])
    if (killed) return { ...killed, drained: true }
    this.child.stdin.destroy()
    this.child.stdout.destroy()
    this.child.stderr.destroy()
    this.child.unref()
    return { code: null, signal: 'SIGKILL_TIMEOUT', drained: false }
  }
}

async function runPsql(config, sql, timeoutMs = 15000) {
  const session = new PsqlSession(config, 'one-shot')
  try {
    session.send(sql)
    session.send('\\q')
    const result = await Promise.race([
      session.closedPromise,
      sleep(timeoutMs).then(() => null),
    ])
    if (!result) throw new Error('PSQL_TIMEOUT')
    if (result.code !== 0) throw new Error('PSQL_FAILED')
    return session.buffer.trim()
  } finally {
    const stopped = await session.stop()
    if (!stopped.drained) cleanupFailures.push(session.label)
  }
}

async function sourceHashes() {
  const hashes = {}
  for (const relative of trackedSources) {
    const bytes = await readFile(path.join(ROOT, relative))
    hashes[relative] = createHash('sha256').update(bytes).digest('hex')
  }
  return hashes
}

async function writeReceipt(receiptPath, receipt) {
  await mkdir(path.dirname(receiptPath), { recursive: true })
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
}

async function lockBarrier(config, record) {
  const first = new PsqlSession(config, 'root-lock-holder')
  const second = new PsqlSession(config, 'authority-resolver')
  try {
    first.send(`SELECT 'ROOT_PID:' || pg_backend_pid();`)
    const rootPid = Number((await first.waitFor(/ROOT_PID:([0-9]+)/))[1])
    first.send(`BEGIN; UPDATE studio_authority_fixture.project_authority SET authority_epoch = authority_epoch + 1 WHERE project_id = '3f5a9d10-65c8-4f82-9d0f-73953db82812'; UPDATE studio_authority_fixture.owner_subject SET expires_at = clock_timestamp() + interval '200 milliseconds' WHERE project_id = '3f5a9d10-65c8-4f82-9d0f-73953db82812' AND action_kind = 'PLAN' AND subject_id = 'page:expire'; SELECT 'ROOT_HELD';`)
    await first.waitFor(/ROOT_HELD/)
    second.send(`SELECT 'RESOLVER_PID:' || pg_backend_pid();`)
    const resolverPid = Number((await second.waitFor(/RESOLVER_PID:([0-9]+)/))[1])
    second.send(`BEGIN; SELECT studio_core.lock_current_command_authority('3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42','PLAN','page:expire','input:expire','snapshot:expire','evidence:expire'); COMMIT;`)
    const deadline = Date.now() + 5000
    let observed = false
    while (Date.now() < deadline) {
      const probe = await runPsql(config, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ${resolverPid} AND wait_event_type = 'Lock' AND ${rootPid} = ANY(pg_blocking_pids(pid)));`)
      if (probe === 't') { observed = true; break }
      await sleep(25)
    }
    if (!observed) throw new Error('LOCK_BARRIER_NOT_OBSERVED')
    record.tests.push({ name: 'resolver_waits_on_same_project_root_lock', result: 'PASS', rootBackend: rootPid, resolverBackend: resolverPid })
    await sleep(400)
    first.send('COMMIT; SELECT \'ROOT_RELEASED\';')
    await first.waitFor(/ROOT_RELEASED/)
    const result = await second.waitFor(/\{[^\n]*\}/, 10000)
    const observation = JSON.parse(result[0])
    if (observation.authorityEpoch !== 5 || observation.allowed !== false) throw new Error('LOCK_BARRIER_REREAD_FAILED')
    record.tests.push({ name: 'resolver_rereads_epoch_after_root_lock', result: 'PASS' })
    const expiredEffects = await runPsql(config, `SELECT count(*) FROM studio_authority_fixture.authority_event WHERE project_id = '3f5a9d10-65c8-4f82-9d0f-73953db82812' AND action_kind = 'PLAN' AND subject_id = 'page:expire';`)
    if (expiredEffects !== '0') throw new Error('EXPIRED_REQUEST_CREATED_EVENT')
    record.tests.push({ name: 'expiry_is_checked_after_root_lock_wait', result: 'PASS' })
  } finally {
    if (!(await stopSessions([first, second]))) throw new Error('CHILD_DRAIN_FAILED')
    record.childDrain = ['all_children_closed']
  }
}

async function waitForRootBlock(config, rootPid, resolverPid) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const blocked = await runPsql(config, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ${resolverPid} AND wait_event_type = 'Lock' AND ${rootPid} = ANY(pg_blocking_pids(pid)));`)
    if (blocked === 't') return true
    await sleep(25)
  }
  return false
}

async function stopSessions(sessions) {
  const results = await Promise.all(sessions.map((session) => session.stop()))
  for (let index = 0; index < results.length; index += 1) {
    if (!results[index].drained) cleanupFailures.push(sessions[index].label)
  }
  return results.every((result) => result.drained)
}

async function concurrentDuplicateBarrier(config, record) {
  const first = new PsqlSession(config, 'duplicate-first')
  const second = new PsqlSession(config, 'duplicate-retry')
  try {
    first.send(`SELECT 'DUPLICATE_FIRST_PID:' || pg_backend_pid();`)
    const firstPid = Number((await first.waitFor(/DUPLICATE_FIRST_PID:([0-9]+)/))[1])
    first.send(`BEGIN; SELECT studio_core.lock_current_command_authority('3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42','GENERATE','page:duplicate','input:duplicate','snapshot:duplicate','evidence:duplicate');`)
    const firstResult = JSON.parse((await first.waitFor(/\\{[^\\n]*\\}/))[0])
    if (firstResult.allowed !== true) throw new Error('FIRST_DUPLICATE_FIXTURE_ADMISSION_FAILED')
    second.send(`SELECT 'DUPLICATE_RETRY_PID:' || pg_backend_pid();`)
    const retryPid = Number((await second.waitFor(/DUPLICATE_RETRY_PID:([0-9]+)/))[1])
    second.send(`BEGIN; SELECT studio_core.lock_current_command_authority('3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42','GENERATE','page:duplicate','input:duplicate','snapshot:duplicate','evidence:duplicate'); COMMIT;`)
    if (!(await waitForRootBlock(config, firstPid, retryPid))) throw new Error('DUPLICATE_LOCK_BARRIER_NOT_OBSERVED')
    first.send(`COMMIT; SELECT 'FIRST_DUPLICATE_COMMITTED';`)
    await first.waitFor(/FIRST_DUPLICATE_COMMITTED/)
    const secondResult = JSON.parse((await second.waitFor(/\\{[^\\n]*\\}/))[0])
    if (secondResult.allowed !== false) throw new Error('CONCURRENT_DUPLICATE_WAS_ACCEPTED')
    const effects = await runPsql(config, `SELECT count(*) FROM studio_authority_fixture.authority_event WHERE action_kind = 'GENERATE' AND subject_id = 'page:duplicate';`)
    if (effects !== '1') throw new Error('CONCURRENT_DUPLICATE_EFFECT_COUNT')
    record.tests.push({ name: 'concurrent_same_key_has_one_effect', result: 'PASS' })
  } finally {
    if (!(await stopSessions([first, second]))) throw new Error('CHILD_DRAIN_FAILED')
  }
}

async function revocationRaceBarrier(config, record) {
  const revoker = new PsqlSession(config, 'revocation-root-holder')
  const admission = new PsqlSession(config, 'revocation-admission')
  try {
    revoker.send(`SELECT 'REVOKER_PID:' || pg_backend_pid();`)
    const revokerPid = Number((await revoker.waitFor(/REVOKER_PID:([0-9]+)/))[1])
    revoker.send(`BEGIN; SELECT 1 FROM studio_authority_fixture.project_authority WHERE project_id = '3f5a9d10-65c8-4f82-9d0f-73953db82812' FOR UPDATE; SELECT 'REVOCATION_ROOT_HELD';`)
    await revoker.waitFor(/REVOCATION_ROOT_HELD/)
    admission.send(`SELECT 'REVOCATION_ADMISSION_PID:' || pg_backend_pid();`)
    const admissionPid = Number((await admission.waitFor(/REVOCATION_ADMISSION_PID:([0-9]+)/))[1])
    admission.send(`BEGIN; SELECT studio_core.lock_current_command_authority('3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42','GSC_SYNC','page:revoked','input:revoked','snapshot:revoked','evidence:revoked'); COMMIT;`)
    if (!(await waitForRootBlock(config, revokerPid, admissionPid))) throw new Error('REVOCATION_LOCK_BARRIER_NOT_OBSERVED')
    revoker.send(`SELECT studio_authority_fixture.revoke_owner('3f5a9d10-65c8-4f82-9d0f-73953db82812','GSC_SYNC','page:revoked'); COMMIT; SELECT 'OWNER_REVOKED';`)
    await revoker.waitFor(/OWNER_REVOKED/)
    const result = JSON.parse((await admission.waitFor(/\\{[^\\n]*\\}/))[0])
    if (result.available !== true || result.allowed !== false) throw new Error('REVOCATION_DID_NOT_WIN_ROOT_LOCK')
    const effects = await runPsql(config, `SELECT count(*) FROM studio_authority_fixture.authority_event WHERE action_kind = 'GSC_SYNC' AND subject_id = 'page:revoked';`)
    if (effects !== '0') throw new Error('REVOKED_ADMISSION_CREATED_EVENT')
    record.tests.push({ name: 'revocation_serializes_before_admission', result: 'PASS' })
  } finally {
    if (!(await stopSessions([revoker, admission]))) throw new Error('CHILD_DRAIN_FAILED')
  }
}

async function verifyFixture(config, receipt) {
  const versionOutput = await runPsql(config, 'SHOW server_version_num;')
  const versionNumber = Number(versionOutput)
  if (!Number.isInteger(versionNumber) || versionNumber < 170000 || versionNumber >= 180000) {
    throw new Error('UNSUPPORTED_POSTGRES_VERSION')
  }
  receipt.postgresMajor = Math.floor(versionNumber / 10000)
  const dbOutput = await runPsql(config, 'SELECT current_database();')
  if (dbOutput !== config.database) throw new Error('FIXTURE_DATABASE_MISMATCH')
  const schemaState = await runPsql(config, `SELECT count(*) FROM pg_namespace WHERE nspname IN ('studio_authority_fixture','studio_core');`)
  if (schemaState !== '0') throw new Error('FIXTURE_SCHEMA_ALREADY_PRESENT')

  const fixtureSql = await readFile(path.join(ROOT, FIXTURE), 'utf8')
  await runPsql(config, fixtureSql)
  receipt.tests.push({ name: 'fixture_schema_created', result: 'PASS' })

  const assertions = `DO $assert$
DECLARE
  r jsonb;
  event_count integer;
BEGIN
  INSERT INTO studio_authority_fixture.project_authority VALUES ('3f5a9d10-65c8-4f82-9d0f-73953db82812', 4);
  INSERT INTO studio_authority_fixture.project_policy VALUES ('3f5a9d10-65c8-4f82-9d0f-73953db82812', 3, true);
  INSERT INTO studio_authority_fixture.owner_subject VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','INGEST','page:home',
    'https://issuer.example','user:42','input:01','snapshot:01','evidence:01',2,true,
    clock_timestamp() + interval '2 minutes'
  );
  INSERT INTO studio_authority_fixture.run_stage VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','INGEST','page:home','input:01','snapshot:01','fixture_admission'
  );
  INSERT INTO studio_authority_fixture.owner_subject VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','PLAN','page:expire',
    'https://issuer.example','user:42','input:expire','snapshot:expire','evidence:expire',1,true,
    clock_timestamp() + interval '5 minutes'
  );
  INSERT INTO studio_authority_fixture.run_stage VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','PLAN','page:expire','input:expire','snapshot:expire','fixture_admission'
  );
  INSERT INTO studio_authority_fixture.owner_subject VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','GENERATE','page:duplicate',
    'https://issuer.example','user:42','input:duplicate','snapshot:duplicate','evidence:duplicate',1,true,
    clock_timestamp() + interval '5 minutes'
  );
  INSERT INTO studio_authority_fixture.run_stage VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','GENERATE','page:duplicate','input:duplicate','snapshot:duplicate','fixture_admission'
  );
  INSERT INTO studio_authority_fixture.owner_subject VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','GSC_SYNC','page:revoked',
    'https://issuer.example','user:42','input:revoked','snapshot:revoked','evidence:revoked',1,true,
    clock_timestamp() + interval '5 minutes'
  );
  INSERT INTO studio_authority_fixture.run_stage VALUES (
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','GSC_SYNC','page:revoked','input:revoked','snapshot:revoked','fixture_admission'
  );

  r := studio_core.lock_current_command_authority(
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
    'INGEST','page:home','input:01','snapshot:01','evidence:01'
  );
  IF (SELECT count(*) FROM jsonb_object_keys(r)) <> 13
     OR r->>'available' <> 'true' OR r->>'allowed' <> 'true'
     OR r->>'ownerVersion' <> '2' OR r->>'policyVersion' <> '3'
     OR r->>'authorityEpoch' <> '4' THEN RAISE EXCEPTION 'fixture observation mismatch'; END IF;
  SELECT count(*) INTO event_count FROM studio_authority_fixture.authority_event;
  IF event_count <> 1 THEN RAISE EXCEPTION 'accepted event count mismatch'; END IF;

  r := studio_core.lock_current_command_authority(
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
    'INGEST','page:home','input:01','snapshot:01','evidence:01'
  );
  IF r->>'available' <> 'true' OR r->>'allowed' <> 'false' THEN RAISE EXCEPTION 'duplicate replay was accepted'; END IF;
  SELECT count(*) INTO event_count FROM studio_authority_fixture.authority_event;
  IF event_count <> 1 THEN RAISE EXCEPTION 'duplicate created a second event'; END IF;

  PERFORM studio_authority_fixture.revoke_owner('3f5a9d10-65c8-4f82-9d0f-73953db82812','INGEST','page:home');
  r := studio_core.lock_current_command_authority(
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
    'INGEST','page:home','input:01','snapshot:01','evidence:01'
  );
  IF r->>'available' <> 'true' OR r->>'allowed' <> 'false' THEN RAISE EXCEPTION 'revoked owner was accepted'; END IF;
  SELECT count(*) INTO event_count FROM studio_authority_fixture.authority_event;
  IF event_count <> 1 THEN RAISE EXCEPTION 'rejected request created an event'; END IF;

  r := studio_core.lock_current_command_authority(
    '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:other',
    'INGEST','page:home','input:01','snapshot:01','evidence:01'
  );
  IF r <> jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE') THEN
    RAISE EXCEPTION 'cross-actor mismatch was not unavailable';
  END IF;
  r := studio_core.lock_current_command_authority(
    '9f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
    'INGEST','page:home','input:01','snapshot:01','evidence:01'
  );
  IF r <> jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE') THEN
    RAISE EXCEPTION 'missing project was not unavailable';
  END IF;
END
$assert$;`
  await runPsql(config, assertions)
  receipt.tests.push(
    { name: 'exact_resolver_shape_and_single_accepted_event', result: 'PASS' },
    { name: 'duplicate_retry_and_revoke_fail_closed', result: 'PASS' },
    { name: 'actor_and_project_scope_isolation', result: 'PASS' },
  )

  const privilegeChecks = ['anon', 'authenticated', 'service_role'].map((role) => `
SET ROLE ${role};
DO $priv$
BEGIN
  BEGIN
    PERFORM studio_core.lock_current_command_authority(
      '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
      'INGEST','page:home','input:01','snapshot:01','evidence:01'
    );
    RAISE EXCEPTION 'fixture role unexpectedly executed resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO studio_authority_fixture.authority_event (
      project_id, actor_issuer, actor_subject, action_kind, subject_id,
      input_ref, snapshot_ref, authorization_evidence_id
    ) VALUES (
      '3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42',
      'INGEST','page:other','input:x','snapshot:x','evidence:x'
    );
    RAISE EXCEPTION 'fixture role unexpectedly wrote raw DML';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE studio_authority_fixture.unexpected_fixture_table(id integer)';
    RAISE EXCEPTION 'fixture role unexpectedly created a schema object';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$priv$;
RESET ROLE;`).join('\n')
  await runPsql(config, privilegeChecks)
  receipt.tests.push({ name: 'anon_authenticated_service_role_deny', result: 'PASS' })

  const functionSource = await runPsql(config, `SELECT position('SECURITY DEFINER' in pg_get_functiondef('studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text)'::regprocedure));`)
  if (functionSource !== '0') throw new Error('FIXTURE_FUNCTION_SECURITY_MODE_UNEXPECTED')
  receipt.tests.push({ name: 'resolver_is_not_security_definer', result: 'PASS' })

  const shadowed = await runPsql(config, `SET search_path = pg_temp, public; CREATE TEMP TABLE project_authority(project_id uuid, authority_epoch bigint); SELECT studio_core.lock_current_command_authority('3f5a9d10-65c8-4f82-9d0f-73953db82812','https://issuer.example','user:42','INGEST','page:home','input:01','snapshot:01','evidence:01'); RESET search_path;`)
  const searchPathObservation = JSON.parse(shadowed)
  if (searchPathObservation.available !== true || searchPathObservation.allowed !== false) throw new Error('HOSTILE_SEARCH_PATH_REDIRECTED')
  receipt.tests.push({ name: 'hostile_search_path_does_not_redirect_fixture_tables', result: 'PASS' })

  await lockBarrier(config, receipt)
  await concurrentDuplicateBarrier(config, receipt)
  await revocationRaceBarrier(config, receipt)
}

function receiptBase(status, reason = null) {
  return {
    schemaVersion: 'studio-authority-lock-fixture-receipt/1',
    status,
    reason,
    createdAt: new Date().toISOString(),
    candidateSha: process.env.STUDIO_AUTHORITY_CANDIDATE_SHA ?? null,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    imageIdentity: IMAGE,
    imageIdentitySource: 'workflow_asserted_only',
    fixtureScope: 'DISPOSABLE_TEST_DATABASE_ONLY',
    productionAuthority: false,
    migrationApplied: false,
    tests: [],
    cleanup: 'ephemeral_workflow_service_lifecycle',
  }
}

async function selfTest() {
  let rejected = false
  try { fixtureConfig({}) } catch { rejected = true }
  if (!rejected) throw new Error('SELF_TEST_FAILED')
  if (expectedDb({ GITHUB_RUN_ID: '17', GITHUB_RUN_ATTEMPT: '2' }) !== 'studio_authority_test_17_2') {
    throw new Error('SELF_TEST_FAILED')
  }
  const receipt = receiptBase('SELF_TEST_PASS_NOT_DURABILITY_PROOF')
  receipt.tests.push({ name: 'missing_configuration_fails_closed', result: 'PASS' })
  return receipt
}

async function main() {
  let config = null
  let receiptPath = path.join(ROOT, '.studio-authority-locks', 'blocked-environment', 'receipt.json')
  let receipt = receiptBase('NOT_RUN', 'BLOCKED_TEST_ENV')
  try {
    if (process.argv.includes('--self-test')) {
      receipt = await selfTest()
      receiptPath = path.join(ROOT, '.studio-authority-locks', 'self-test', 'receipt.json')
    } else {
      config = fixtureConfig(process.env)
      receiptPath = config.receiptPath
      receipt = receiptBase('RUNNING')
      receipt.candidateSha = config.candidateSha
      receipt.runId = config.runId
      receipt.runAttempt = config.attempt
      receipt.database = config.database
      receipt.postgresImage = config.image
      receipt.sourceHashes = await sourceHashes()
      await verifyFixture(config, receipt)
      receipt.status = 'PASS_FIXTURE_ONLY'
      receipt.reason = null
    }
  } catch (error) {
    const code = typeof error?.message === 'string' && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'FIXTURE_RUN_FAILED'
    receipt.status = code === 'BLOCKED_TEST_ENV' ? 'NOT_RUN' : 'FAIL'
    receipt.reason = code
    receipt.sourceHashes = await sourceHashes().catch(() => null)
  } finally {
    const pendingAtCleanup = [...children]
    const closePromises = pendingAtCleanup.map((child) => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve('already_closed')
      child.once('close', () => resolve('closed'))
    }))
    for (const child of pendingAtCleanup) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    }
    await Promise.race([Promise.all(closePromises), sleep(1000)])
    const afterTerm = [...children]
    for (const child of afterTerm) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
    await Promise.race([Promise.all(closePromises), sleep(1000)])
    const undrained = [...children]
    for (const child of undrained) {
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
    }
    if (undrained.length > 0 || cleanupFailures.length > 0) {
      receipt.status = 'FAIL'
      receipt.reason = 'CHILD_DRAIN_FAILED'
    }
    receipt.pendingChildren = undrained.length
    receipt.cleanupFailureCount = cleanupFailures.length
    receipt.childDrainOutcomes = undrained.length === 0 ? ['all_children_closed'] : ['bounded_kill_failed']
    receipt.completedAt = new Date().toISOString()
    await writeReceipt(receiptPath, receipt)
  }
  process.stdout.write(`${receipt.status}: receipt ${path.relative(ROOT, receiptPath)}\n`)
  if (receipt.status === 'FAIL' || receipt.status === 'NOT_RUN') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
