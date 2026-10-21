#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const checks = Object.fromEntries(['fixtureMigrationAndDenyOnlyBinding','validatedPrivateCryptoNamespace','candidateTypeScriptAndSqlHashGolden',
  'serviceRoleRpcExecuteSuccess','independentProjectIssuerSubjectIsolation','sameKeyObservedAuthorityThenAdmissionLockChain','sameKeyScopedDedupe',
  'commitDurableBeforeResponseSuppression','lostResponseReconnect','currentStatusReplay','precommitConnectionTerminationRollback',
  'fiveRelationAtomicRollback','revocationObservedWaitingForAdmissionLock','revokedReplayDeniedAfterCommit','changedHashConflictAfterAuthority',
  'authorityVersionAndRevocationDenials','actualRoleOperationDenials','actualFunctionExecuteDenials','publicInheritanceAndServiceFunctionAcl',
  'hostileSearchPathServiceRole','postgresFixtureOperations'].map(name=>[name,'NOT_RUN']))
const ownedChildren = new Set()
const childClosures = new Map()
const ownedOperationOutcomes = []
const sessionEvents = []
const startedAt = new Date().toISOString()
const receiptPath = join(process.env.RUNNER_TEMP || tmpdir(), 'studio-command-admission-receipt.json')
const imagePin = process.env.STUDIO_TEST_IMAGE_PIN || ''
const expectedImagePin = 'postgres:17.11@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f'
let urlText = process.env.STUDIO_TEST_DATABASE_URL || ''
let dbName = null
let serverVersion = null
let clientVersion = null
let checkedOutSha = null
let runFailure = null
let activeCheck = null
const forbiddenEnv = ['DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'PGHOST','PGHOSTADDR','PGDATABASE','PGUSER','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPORT','PGSSLMODE','PGAPPNAME']

function safeReceipt() {
  const rawFailure=runFailure ? String(runFailure.message || runFailure) : null
  const safeFailure=rawFailure ? rawFailure.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi,'[database-url-redacted]')
    .replaceAll('studio_fixture_only_password','[fixture-password-redacted]').slice(0,900) : null
  return {
    kind: 'studio-command-admission-isolated-evidence', observedAt: new Date().toISOString(), startedAt,
    candidateSha: /^[0-9a-f]{40}$/.test(process.env.STUDIO_CANDIDATE_SHA || '') ? process.env.STUDIO_CANDIDATE_SHA : null, checkedOutSha,
    checkedOutShaMatchesCandidate: /^[0-9a-f]{40}$/.test(process.env.STUDIO_CANDIDATE_SHA || '') && checkedOutSha === process.env.STUDIO_CANDIDATE_SHA,
    githubRunId: /^\d+$/.test(process.env.GITHUB_RUN_ID || '') ? process.env.GITHUB_RUN_ID : null,
    githubRunAttempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT || '') ? process.env.GITHUB_RUN_ATTEMPT : null,
    databaseName: dbName, serverVersion, clientVersion,
    postgresImage: { pin: imagePin === expectedImagePin ? imagePin : null, indexDigest: 'sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f',
      linuxAmd64Manifest: 'sha256:e31e3d5327d1806f6177827c9710643e4f35f7ab3f14d26d05332753d3e95ee0' },
    checks: { ...checks }, sessionEvents: [...sessionEvents],
    failure: runFailure ? { class: runFailure.name || 'Error', message:safeFailure } : null,
    limitations: ['fixture-only authority and locks; not production approval', 'no production A1 binding', 'no Supabase/PostgREST activation proof',
      'TypeScript module hash invocation under Node strip-types is not TypeScript project validation'],
  }
}
function writeReceipt() {
  mkdirSync(resolve(receiptPath, '..'), { recursive: true })
  writeFileSync(receiptPath, `${JSON.stringify(safeReceipt(), null, 2)}\n`, { mode: 0o600 })
}
function assert(value, message) { if (!value) throw new Error(message) }
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'` }
function jsonSql(value) { return `${sqlLiteral(JSON.stringify(value))}::jsonb` }
function numericOne(value) { return typeof value === 'string' && /^1$/.test(value.trim()) }
function parseSqlState(stderr) {
  if (typeof stderr !== 'string' || stderr.length > 32_000) return null
  const match = stderr.match(/(?:^|\n)(?:psql:[^\n]*?:\d+:\s*)?ERROR:\s*([0-9A-Z]{5}):/m)
  return match?.[1] ?? null
}
function isDeniedSqlState(result, expectedState = '42501') {
  return Boolean(result && Number.isInteger(result.status) && result.status !== 0 && parseSqlState(result.stderr) === expectedState)
}
async function runSelfTest() {
  const countOne = numericOne('1')
  const countZero = numericOne('0')
  const malformedCount = numericOne('not-a-count')
  assert(!(Number('1') === '1'), 'red probe did not reproduce the original numeric/string comparison failure')
  assert(countOne && !countZero && !malformedCount, 'numeric count predicate did not fail closed')
  const permissionFormats = [
    'ERROR:  42501: permission denied for table studio_runs\n',
    'psql:/tmp/probe.sql:17: ERROR:  42501: permission denied for function command_request_hash\n',
  ]
  for (const stderr of permissionFormats) assert(isDeniedSqlState({ status: 1, stderr }), 'actual-format SQLSTATE 42501 was not parsed')
  for (const result of [
    { status: 1, stderr: 'ERROR:  42601: syntax error at or near "FROM"\n' },
    { status: 1, stderr: 'some text mentions 42501 but has no SQLSTATE field\n' },
    { status: 1, stderr: 'ERROR: permission denied without a state\n' },
    { status: 0, stderr: 'ERROR:  42501: permission denied\n' },
    { status: 1, stderr: 'ERROR:  42501 permission denied (malformed state field)\n' },
    { status: 1, stderr: 'x'.repeat(32_001) },
  ]) assert(!isDeniedSqlState(result), 'malformed, wrong-state, or successful operation was classified as permission denial')
  const unhandled = []
  const onUnhandled = reason => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  let originalFailure = runFailure
  let failureOutcome
  try {
    const failedChild = spawn(process.execPath, ['-e', 'process.exit(17)'], { stdio: 'ignore' })
    const closed = track(failedChild, 'selftest-owned-failed-child')
    const childOperation = observeOwnedOperation(closed.then(result => {
      if (result.code !== 0) throw new Error(`psql selftest-owned-failed-child failed (${result.code}/${result.signal})`)
      return result
    }))
    await closed
    const cleanupChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    track(cleanupChild, 'selftest-owned-cleanup-child')
    let barrierFailed = false
    try {
      await waitForCondition(() => Promise.reject(new Error('Database barrier deadline expired: selftest barrier failure')),
        () => false, 'selftest barrier failure', 1000, 0)
    } catch (error) {
      barrierFailed = /barrier failure/.test(error.message)
      runFailure = error
    }
    assert(barrierFailed, 'barrier failure helper did not preserve failure')
    const cleanupResult = await cleanupOwnedWork()
    let childFailure
    try { await childOperation } catch (error) { childFailure = error }
    assert(childFailure && /failed \(17\//.test(childFailure.message), `owned failed-child rejection did not survive later await: ${childFailure?.message || 'missing'}`)
    assert(cleanupResult.childrenTerminatedForCleanup, 'cleanup termination outcome was not observed')
    assert(ownedChildren.size === 0 && childClosures.size === 0, 'owned failed and cleanup children were not fully closed')
    failureOutcome = safeReceipt().failure
    assert(failureOutcome?.class === 'Error' && /barrier failure/.test(failureOutcome.message), 'failed barrier did not produce a sanitized FAIL receipt')
    assert(failureOutcome.message.length <= 900, 'failure receipt message exceeded its bound')
    await new Promise(resolveTurn => setImmediate(resolveTurn))
    assert(unhandled.length === 0, 'self-test observed an unhandled rejection')
    writeFileSync('/tmp/cs-command-admission-independent-review-correction-20261002-v5.failure-path-evidence.json', `${JSON.stringify({
      node: process.version,
      red: { ownedChildExitCode: 17, rejectionPreservedForLaterAwait: Boolean(childFailure), failureClass: childFailure?.name || null },
      green: { barrierFailureCaptured: barrierFailed, sanitizedFailReceipt: failureOutcome, ownedChildrenClosed: cleanupResult.allChildrenClosed, cleanupTerminationObserved: cleanupResult.childrenTerminatedForCleanup,
        operationOutcomesDrained: cleanupResult.allOperationsSettled, unhandledRejections: unhandled.length },
    }, null, 2)}\n`, { mode: 0o600 })
  } finally {
    process.removeListener('unhandledRejection', onUnhandled)
    runFailure = originalFailure
  }
  return { originalCountPredicate: 'RED_EXPECTED', correctedCounts: { one: 'PASS', zero: 'PASS', malformed: 'PASS' },
    sqlStateParser: { permissionFormats: 'PASS', syntaxAndMalformedCasesRejected: 'PASS' },
    ownedFailurePath: { failedChild: 'PASS', errorSurvivesLaterAwait: 'PASS', barrierFailReceipt: 'PASS', ownedCleanup: 'PASS', unhandledRejections: 'NONE' } }
}
if (process.argv.includes('--self-test')) {
  try { console.log(JSON.stringify(await runSelfTest())) } catch (error) { console.error(String(error?.message || error)); process.exitCode = 1 }
  process.exit()
}
function psqlArgs(args, targetUrl = urlText) { return ['-X','--no-psqlrc','--set=ON_ERROR_STOP=1','--set=VERBOSITY=verbose','--dbname',targetUrl,...args] }
function controlledEnv(applicationName) {
  const env = { ...process.env, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=5000' }
  for (const name of forbiddenEnv) delete env[name]
  delete env.PGAPPNAME
  if (applicationName) env.PGAPPNAME = applicationName
  env.PGPASSWORD = 'studio_fixture_only_password'
  return env
}
function run(sql, { allowError = false, applicationName = 'studio-admission-sync' } = {}) {
  const result = spawnSync('psql', psqlArgs(['--quiet','--tuples-only','--no-align','--command',sql]), {
    encoding: 'utf8', env: controlledEnv(applicationName), maxBuffer: 2 * 1024 * 1024, timeout: 15000,
  })
  sessionEvents.push({ kind:'psql-command', applicationName, outcome:result.status===0?'COMMAND_SUCCESS':'COMMAND_FAILED', exitCode:result.status })
  if (result.error || (!allowError && result.status !== 0)) {
    throw new Error(`psql session failed (exit ${result.status}; timeout=${result.error?.code === 'ETIMEDOUT'}): ${String(result.stderr || result.error?.message).slice(-1200)}`)
  }
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' }
}
function file(path) {
  const result = spawnSync('psql', psqlArgs(['--quiet','--file',path]), {
    encoding: 'utf8', env: controlledEnv('studio-admission-fixture'), maxBuffer: 2 * 1024 * 1024, timeout: 30000,
  })
  sessionEvents.push({ kind:'psql-fixture', applicationName:'studio-admission-fixture', outcome:result.status===0?'PASS':'FAIL', exitCode:result.status })
  if (result.error || result.status !== 0) throw new Error(`psql fixture failed (exit ${result.status}; timeout=${result.error?.code === 'ETIMEDOUT'}): ${String(result.stderr || result.error?.message).slice(-1600)}`)
  return result.stdout || ''
}
function observeOwnedOperation(operation) {
  const outcome = Promise.resolve(operation).then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  )
  ownedOperationOutcomes.push(outcome)
  return operation
}
function track(child, applicationName) {
  ownedChildren.add(child)
  const event={kind:'owned-psql-child',applicationName,outcome:'RUNNING'}
  sessionEvents.push(event)
  const closed = new Promise(resolveClose => child.once('close', (code, signal) => {
    event.outcome=code===0?'EXIT_0':'TERMINATED_OR_FAILED'; event.exitCode=code; event.signal=signal || null
    ownedChildren.delete(child); childClosures.delete(child); resolveClose({ code, signal })
  }))
  childClosures.set(child, closed)
  return closed
}
function asyncPsql(sql, applicationName, timeoutMs = 20000) {
  const operation = new Promise((resolvePromise, rejectPromise) => {
    const target = new URL(urlText); target.searchParams.set('application_name', applicationName)
    const child = spawn('psql', psqlArgs(['--quiet','--tuples-only','--no-align','--command',sql], target.toString()), {
      env: controlledEnv(applicationName), stdio: ['ignore','pipe','pipe'],
    })
    const closed = track(child,applicationName)
    let stdout = ''; let stderr = ''; let settled = false
    child.stdout.setEncoding('utf8').on('data', part => { stdout += part; if (stdout.length > 2_000_000) child.kill('SIGKILL') })
    child.stderr.setEncoding('utf8').on('data', part => { stderr += part; if (stderr.length > 2_000_000) child.kill('SIGKILL') })
    const finish = async error => {
      if (settled) return
      settled = true; clearTimeout(timer)
      const close = await closed
      if (error) rejectPromise(error)
      else if (close.code !== 0) rejectPromise(new Error(`psql ${applicationName} failed (${close.code}/${close.signal}): ${stderr.slice(-1200)}`))
      else resolvePromise(stdout.trim())
    }
    child.once('error', error => { void finish(error) })
    child.once('close', () => { void finish(null) })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      const escalation = setTimeout(() => child.kill('SIGKILL'), 1500)
      void closed.finally(() => clearTimeout(escalation))
      void finish(new Error(`psql ${applicationName} exceeded ${timeoutMs}ms deadline`))
    }, timeoutMs)
  })
  return observeOwnedOperation(operation)
}
function interactivePsql(applicationName, timeoutMs = 30000) {
  const target = new URL(urlText); target.searchParams.set('application_name', applicationName)
  const child = spawn('psql', psqlArgs(['--quiet','--tuples-only','--no-align'], target.toString()), {
    env: controlledEnv(applicationName), stdio: ['pipe','pipe','pipe'],
  })
  const closed = track(child,applicationName)
  let stdout = ''; let stderr = ''; const waiters = []
  child.stdout.setEncoding('utf8').on('data', part => {
    stdout += part
    if (stdout.length>2_000_000) child.kill('SIGKILL')
    for (const waiter of [...waiters]) if (stdout.includes(waiter.marker)) { waiters.splice(waiters.indexOf(waiter),1); clearTimeout(waiter.timer); waiter.resolve(stdout) }
  })
  child.stderr.setEncoding('utf8').on('data', part => { stderr += part; if (stderr.length>2_000_000) child.kill('SIGKILL') })
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  void closed.finally(() => clearTimeout(timer))
  child.once('error', error => { for (const waiter of waiters.splice(0)) waiter.reject(error) })
  return {
    child, closed, get stdout() { return stdout }, get stderr() { return stderr },
    send(sql) { child.stdin.write(`${sql}\n`) },
    waitFor(marker, waitMs = 15000) {
      if (stdout.includes(marker)) return Promise.resolve(stdout)
      return new Promise((resolveWait, rejectWait) => {
        const waiter = { marker, resolve: resolveWait, reject: rejectWait, timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter),1); rejectWait(new Error(`session ${applicationName} did not report ${marker}`))
        }, waitMs) }
        waiters.push(waiter)
      })
    },
  }
}
async function waitForCondition(read, predicate, description, deadlineMs = 12000, intervalMs = 100) {
  const end = Date.now() + deadlineMs
  while (Date.now() < end) {
    const value = await read()
    if (predicate(value)) return value
    await new Promise(resolveSleep => setTimeout(resolveSleep, intervalMs))
  }
  throw new Error(`Database barrier deadline expired: ${description}`)
}
function waitForDbCondition(sql, predicate, description, deadlineMs = 12000) {
  return waitForCondition(() => run(sql).stdout.trim().split(/\r?\n/).at(-1), predicate, description, deadlineMs)
}
async function cleanupOwnedWork() {
  const closeSnapshot = [...childClosures.values()]
  const outcomeSnapshot = [...ownedOperationOutcomes]
  const childrenTerminatedForCleanup = ownedChildren.size > 0
  for (const child of [...ownedChildren]) child.kill('SIGTERM')
  let escalation
  const closeDrain = Promise.allSettled(closeSnapshot)
  const closedInTime = await Promise.race([closeDrain.then(() => true), new Promise(resolveTimeout => {
    escalation = setTimeout(() => resolveTimeout(false), 1000)
  })])
  if (!closedInTime) {
    for (const child of [...ownedChildren]) child.kill('SIGKILL')
    await Promise.race([closeDrain, new Promise(resolveTimeout => setTimeout(() => resolveTimeout(false), 1500))])
  }
  if (escalation) clearTimeout(escalation)
  const operationDrain = await Promise.race([Promise.allSettled(outcomeSnapshot).then(() => true),
    new Promise(resolveTimeout => setTimeout(() => resolveTimeout(false), 1500))])
  return { childrenTerminatedForCleanup, allChildrenClosed: ownedChildren.size === 0 && childClosures.size === 0, allOperationsSettled: operationDrain }
}
function commandFor(key, overrides = {}) {
  return { actionKind:'PLAN',subjectId:'subject',inputRef:'sealed:input',idempotencyKey:key,
    expectedOwnerVersion:'owner-1',expectedPolicyVersion:'policy-1',expectedAuthorityEpoch:3,...overrides }
}
function contextFor(overrides = {}) {
  return { projectId:'00000000-0000-4000-8000-000000000001',
    actor:{issuer:'issuer',subject:'actor',authorizationEvidenceId:'evidence'},
    decisionId:'decision',policyVersion:'policy-1',ownerVersion:'owner-1',authorityEpoch:3,snapshotRef:'snapshot',...overrides }
}
function admissionSql(command, context, appName = 'studio-admission-call', requestHashSql = null) {
  const c = jsonSql(command); const x = jsonSql(context)
  return `SELECT studio_core.admit_run(${c},${x},${requestHashSql || `studio_core.command_request_hash(${c})`},gen_random_uuid(),gen_random_uuid(),gen_random_uuid())::text`
}
function candidateHash(command) {
  const moduleUrl = pathToFileURL(resolve('lib/studioRuntime/contracts.ts')).href
  const source = `import {hashRunCommand,decodeRunCommand} from ${JSON.stringify(moduleUrl)}; let s=''; for await (const c of process.stdin) s+=c; process.stdout.write(hashRunCommand(decodeRunCommand(JSON.parse(s))));`
  const result = spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',source],{
    input:JSON.stringify(command),encoding:'utf8',env:controlledEnv(),timeout:10000,
  })
  assert(result.status===0 && /^[0-9a-f]{64}$/.test(result.stdout.trim()),`Candidate hash export failed before role change (${String(result.stderr).slice(-500)})`)
  return result.stdout.trim()
}
function lastJson(output) {
  const lines=output.trim().split(/\r?\n/).filter(Boolean)
  for (const line of lines.reverse()) { try { return JSON.parse(line) } catch {} }
  throw new Error('SQL RPC returned no valid receipt')
}
function counts() {
  return run(`SELECT json_build_array((SELECT count(*) FROM studio_core.studio_runs),(SELECT count(*) FROM studio_core.studio_run_stages),
    (SELECT count(*) FROM studio_core.studio_outbox),(SELECT count(*) FROM studio_core.studio_run_events),
    (SELECT count(*) FROM studio_core.studio_run_admissions))::text`).stdout.trim().split(/\r?\n/).at(-1)
}
function call(command, context = contextFor(), appName = 'studio-admission-call') { return lastJson(run(admissionSql(command, context, appName), { applicationName: appName }).stdout) }
function requireDenied(result, what) {
  assert(isDeniedSqlState(result), `${what} did not fail with permission SQLSTATE 42501 (${parseSqlState(result.stderr) || 'missing SQLSTATE'})`)
}

try {
  assert(forbiddenEnv.every(name => !process.env[name]), 'Refusing production-like inherited database configuration')
  let target
  try { target = new URL(urlText) } catch { throw new Error('STUDIO_TEST_DATABASE_URL is required') }
  const candidateDbName = decodeURIComponent(target.pathname.slice(1))
  assert(['127.0.0.1','localhost','::1'].includes(target.hostname) && ['5432',''].includes(target.port) &&
    /^studio_admission_test_[0-9]+_[0-9]+$/.test(candidateDbName) && target.protocol === 'postgresql:' && target.username === 'postgres' &&
    target.password === 'studio_fixture_only_password' && !target.search && !target.hash, 'Refusing non-loopback, unmarked, or non-fixture database target')
  dbName=candidateDbName
  assert(!process.env.PGPASSWORD || process.env.PGPASSWORD === 'studio_fixture_only_password', 'Refusing non-fixture PostgreSQL credentials')
  assert(imagePin===expectedImagePin, 'PostgreSQL service image pin is not the reviewed official 17.11 image')
  activeCheck='fixtureMigrationAndDenyOnlyBinding'
  const client = spawnSync('psql',['--version'],{encoding:'utf8',env:controlledEnv(),timeout:5000})
  assert(client.status === 0, 'psql client is unavailable')
  clientVersion = client.stdout.trim()
  const checkedOut = spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:5000})
  assert(checkedOut.status === 0, 'checked-out git SHA is unavailable')
  checkedOutSha=checkedOut.stdout.trim()
  assert(/^[0-9a-f]{40}$/.test(process.env.STUDIO_CANDIDATE_SHA || '') && checkedOutSha===process.env.STUDIO_CANDIDATE_SHA,
    'PostgreSQL harness checkout does not match the selected approved candidate SHA')

  // Fixture creates studio_core and pgcrypto. Query extension metadata only after it completes.
  const fixtureOutput = file('tests/sql/studio-command-admission.sql')
  checks.fixtureMigrationAndDenyOnlyBinding = 'PASS'
  activeCheck='validatedPrivateCryptoNamespace'
  serverVersion = run('SHOW server_version').stdout.trim().split(/\r?\n/).at(-1)
  assert(/^17\./.test(serverVersion), `Expected PostgreSQL 17 server; received ${serverVersion}`)
  const extension = run(`SELECT e.extversion FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='studio_core'`).stdout.trim().split(/\r?\n/).at(-1)
  assert(/^\d+(?:\.\d+)+$/.test(extension), 'pgcrypto extension namespace/version validation failed')
  checks.validatedPrivateCryptoNamespace = 'PASS'

  // Execute the candidate's real TypeScript exports with Node's erasable TypeScript support.
  activeCheck='candidateTypeScriptAndSqlHashGolden'
  const goldenInputs = [
    commandFor('ascii-golden',{subjectId:'ascii',expectedAuthorityEpoch:9}),
    commandFor('unicode-golden',{subjectId:'café',inputRef:'sealed:α',expectedAuthorityEpoch:12}),
    commandFor('byte-boundary-golden',{subjectId:'é'.repeat(128),inputRef:'sealed:🧪',expectedAuthorityEpoch:12345}),
  ]
  const moduleUrl = pathToFileURL(resolve('lib/studioRuntime/contracts.ts')).href
  const source = `import {hashRunCommand,decodeRunCommand} from ${JSON.stringify(moduleUrl)}; let s=''; for await (const c of process.stdin) s+=c; const xs=JSON.parse(s); process.stdout.write(JSON.stringify(xs.map(x=>hashRunCommand(decodeRunCommand(x)))));`
  const tsHashes = spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',source],{
    input:JSON.stringify(goldenInputs),encoding:'utf8',env:controlledEnv(),timeout:10000,
  })
  assert(tsHashes.status === 0, `Candidate contract hash invocation under Node strip-types failed: ${String(tsHashes.stderr).slice(-900)}`)
  const actualHashes = JSON.parse(tsHashes.stdout)
  const sqlHashes = goldenInputs.map(input => run(`SELECT studio_core.command_request_hash(${jsonSql(input)})`).stdout.trim().split(/\r?\n/).at(-1))
  assert(JSON.stringify(actualHashes) === JSON.stringify(sqlHashes), 'Candidate TypeScript exports and SQL hash output differ for ASCII/Unicode/multi-digit epoch/byte boundaries')
  checks.candidateTypeScriptAndSqlHashGolden = 'PASS_NODE_STRIP_TYPES_RUNTIME_ONLY'

  activeCheck='serviceRoleRpcExecuteSuccess'
  const serviceMarker = fixtureOutput.match(/SERVICE_RPC_RECEIPT_BEGIN\s*([\s\S]*?)\s*SERVICE_RPC_RECEIPT_END/)
  assert(serviceMarker && lastJson(serviceMarker[1]).kind === 'accepted', 'service_role function EXECUTE success was not witnessed')
  checks.serviceRoleRpcExecuteSuccess = 'PASS_FIXTURE_ONLY'

  activeCheck='exactThirteenFieldAuthorityAdmitReplay'
  const exactResolver = JSON.parse(run(`SELECT studio_core.lock_current_command_authority('00000000-0000-4000-8000-000000000001','issuer','actor','PLAN','subject','sealed:input','snapshot','evidence')::text`).stdout.trim().split(/\r?\n/).at(-1))
  const expectedAuthorityKeys=['available','allowed','projectId','actorIssuer','actorSubject','actionKind','subjectId','inputRef','snapshotRef','authorizationEvidenceId','ownerVersion','policyVersion','authorityEpoch'].sort()
  assert(JSON.stringify(Object.keys(exactResolver).sort())===JSON.stringify(expectedAuthorityKeys),'fixture resolver did not return the exact frozen thirteen-field contract')
  assert(!Object.hasOwn(exactResolver,'decisionId'),'decisionId leaked into resolver result instead of trusted server context')
  const exactCommand=commandFor('exact-thirteen-field-resolver')
  const exactAccepted=call(exactCommand,contextFor(),'exact-authority-contract-first')
  const exactReplay=call(exactCommand,contextFor(),'exact-authority-contract-replay')
  assert(exactAccepted.kind==='accepted' && exactReplay.kind==='replayed' && exactAccepted.runId===exactReplay.runId,
    'thirteen-field authority contract did not support admission and replay')
  checks.exactThirteenFieldAuthorityAdmitReplay='PASS_FIXTURE_ONLY'

  // Project, issuer, and subject each vary independently for the same idempotency key.
  activeCheck='independentProjectIssuerSubjectIsolation'
  run(`INSERT INTO studio_test.authority_fixture VALUES
   ('00000000-0000-4000-8000-000000000002','issuer','actor','PLAN','subject','sealed:input','snapshot','evidence','decision','owner-1','policy-1',3,true),
   ('00000000-0000-4000-8000-000000000001','issuer-2','actor','PLAN','subject','sealed:input','snapshot','evidence-2','decision-2','owner-1','policy-1',3,true),
   ('00000000-0000-4000-8000-000000000001','issuer','actor-2','PLAN','subject','sealed:input','snapshot','evidence-3','decision-3','owner-1','policy-1',3,true)`)
  const independentScopes = [
    contextFor({projectId:'00000000-0000-4000-8000-000000000002'}),
    contextFor({actor:{issuer:'issuer-2',subject:'actor',authorizationEvidenceId:'evidence-2'},decisionId:'decision-2'}),
    contextFor({actor:{issuer:'issuer',subject:'actor-2',authorizationEvidenceId:'evidence-3'},decisionId:'decision-3'}),
  ]
  for (const [index, scope] of independentScopes.entries()) {
    const result = call(commandFor('independent-scope-key'),scope,`scope-isolation-${index}`)
    assert(result.kind === 'accepted', `same-key independent scope ${index} collided`)
  }
  checks.independentProjectIssuerSubjectIsolation = 'PASS'

  // The first admission locks current fixture authority before waiting on the scoped admission key.
  // The second therefore waits on the first authority-row owner. Preserve that production lock order.
  activeCheck='sameKeyObservedAuthorityThenAdmissionLockChain'
  const raceKey = 'concurrent-scoped-key'
  const beforeRace=JSON.parse(counts())
  const lockExpr = `hashtextextended('00000000-0000-4000-8000-000000000001:issuer:actor:${raceKey}',0)`
  const barrier = interactivePsql('studio-race-barrier')
  barrier.send(`SELECT pg_advisory_lock(${lockExpr}); SELECT 'RACE_BARRIER_HELD';`)
  await barrier.waitFor('RACE_BARRIER_HELD')
  const raceSql = admissionSql(commandFor(raceKey),contextFor())
  const raceA = asyncPsql(raceSql,'studio-race-a',30000)
  const raceB = asyncPsql(raceSql,'studio-race-b',30000)
  const barrierPid = Number(run(`SELECT pid FROM pg_catalog.pg_stat_activity WHERE application_name='studio-race-barrier'`).stdout.trim().split(/\r?\n/).at(-1))
  assert(Number.isInteger(barrierPid) && barrierPid > 0,'could not identify the owned scoped-advisory barrier backend')
  const observedText = await waitForDbCondition(`SELECT COALESCE(json_agg(json_build_object('applicationName',a.application_name,'pid',a.pid,
    'waitEvent',a.wait_event,'blockingPids',pg_catalog.pg_blocking_pids(a.pid)) ORDER BY a.application_name),'[]'::json)::text
    FROM pg_catalog.pg_stat_activity a WHERE a.application_name IN ('studio-race-a','studio-race-b')`,value=>{
      try {
        const rows=JSON.parse(value); const leader=rows.find(row=>row.waitEvent==='advisory' && row.blockingPids.includes(barrierPid))
        const follower=rows.find(row=>row.waitEvent==='transactionid' && leader && row.blockingPids.includes(leader.pid))
        return rows.length===2 && Boolean(leader && follower && leader.pid!==follower.pid)
      } catch { return false }
    },'first owned admission waits on barrier advisory lock while second waits on first authority-row transaction',15000)
  const observed = JSON.parse(observedText)
  const firstOwned = observed.find(row=>row.waitEvent==='advisory' && row.blockingPids.includes(barrierPid))
  const secondOwned = observed.find(row=>row.waitEvent==='transactionid' && row.blockingPids.includes(firstOwned.pid))
  checks.sameKeyObservedAuthorityThenAdmissionLockChain = 'PASS_ONE_ADVISORY_AND_ONE_AUTHORITY_ROW_WAITER'
  sessionEvents.push({kind:'database-barrier',name:'same-key-authority-before-admission-lock-chain',outcome:'WITNESSED',barrierApplicationName:'studio-race-barrier',
    barrierBackendPid:barrierPid,authorityRowOwnerAndAdvisoryWaiter:{applicationName:firstOwned.applicationName,backendPid:firstOwned.pid,
      waitEvent:firstOwned.waitEvent,blockingPids:firstOwned.blockingPids},authorityRowWaiter:{applicationName:secondOwned.applicationName,backendPid:secondOwned.pid,
      waitEvent:secondOwned.waitEvent,blockingPids:secondOwned.blockingPids},concurrentSessions:2})
  barrier.send(`SELECT pg_advisory_unlock(${lockExpr}); SELECT 'RACE_BARRIER_RELEASED';`)
  await barrier.waitFor('RACE_BARRIER_RELEASED'); barrier.child.stdin.end()
  const raceReceipts = [lastJson(await raceA),lastJson(await raceB)]
  const accepted = raceReceipts.filter(receipt=>receipt.kind==='accepted')
  const replayed = raceReceipts.filter(receipt=>receipt.kind==='replayed')
  assert(raceReceipts.every(receipt=>['accepted','replayed'].includes(receipt.kind)) && accepted.length===1 && replayed.length===1 &&
    raceReceipts[0].runId===raceReceipts[1].runId,'overlapped same-key submissions did not yield one accepted and one replayed receipt for one durable run')
  const afterRace=JSON.parse(counts())
  assert(afterRace.length===5 && beforeRace.length===5 && afterRace.every((count,index)=>count===beforeRace[index]+1),
    'overlapped same-key submissions did not write all five relations exactly once')
  checks.sameKeyScopedDedupe = 'PASS'

  // Lost acknowledgement: prove COMMIT is visible from a separate connection, then terminate
  // the original owned connection before a response is emitted, and reconnect with the same key.
  activeCheck='commitDurableBeforeResponseSuppression'
  const lostApp = 'studio-lost-response-owned'
  const lostKey = 'lost-response-replay'
  const lostSession = interactivePsql(lostApp)
  const lostCommand=jsonSql(commandFor(lostKey)); const lostContext=jsonSql(contextFor())
  lostSession.send(`BEGIN; DO $lost_response$ DECLARE ignored jsonb; BEGIN ignored := studio_core.admit_run(${lostCommand},${lostContext},studio_core.command_request_hash(${lostCommand}),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()); END $lost_response$; COMMIT; SELECT pg_sleep(30);`)
  await waitForDbCondition(`SELECT count(*) FROM studio_core.studio_runs WHERE idempotency_key=${sqlLiteral(lostKey)}`,numericOne,'committed run visible before suppressing acknowledgement')
  await waitForDbCondition(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${sqlLiteral(lostApp)} AND wait_event='PgSleep'`,numericOne,'owned response-suppression session reached post-commit pause')
  const independentlyCommittedRunId=run(`SELECT run_id::text FROM studio_core.studio_runs WHERE idempotency_key=${sqlLiteral(lostKey)}`).stdout.trim().split(/\r?\n/).at(-1)
  assert(/^[0-9a-f-]{36}$/.test(independentlyCommittedRunId),'independent connection did not expose the committed runId')
  const lostCountsBeforeTerminate=counts()
  checks.commitDurableBeforeResponseSuppression = 'PASS_INDEPENDENT_CONNECTION'
  sessionEvents.push({kind:'database-boundary',name:'commit-before-response-suppression',outcome:'WITNESSED',applicationName:lostApp,
    backendPid:Number(run(`SELECT pid FROM pg_catalog.pg_stat_activity WHERE application_name=${sqlLiteral(lostApp)}`).stdout.trim().split(/\r?\n/).at(-1)),
    committedRunId:independentlyCommittedRunId,commitVisibleOnIndependentConnection:true,allFiveCounts:JSON.parse(lostCountsBeforeTerminate),waitEvent:'PgSleep',submittedRpcReceiptObserved:false})
  const lostPid = run(`SELECT pid FROM pg_catalog.pg_stat_activity WHERE application_name=${sqlLiteral(lostApp)}`).stdout.trim().split(/\r?\n/).at(-1)
  assert(!lostSession.stdout.includes('"kind"'),'submission RPC receipt was emitted before the connection was terminated')
  activeCheck='lostResponseReconnect'
  run(`SELECT pg_terminate_backend(${Number(lostPid)})`)
  const lostClose = await lostSession.closed
  assert(lostClose.code!==0,'post-commit response-suppression connection was not terminated')
  const reconnect = call(commandFor(lostKey),contextFor(),'studio-lost-response-reconnect')
  assert(reconnect.kind==='replayed' && reconnect.runId===independentlyCommittedRunId,'reconnect did not replay the independently observed durable runId')
  assert(counts()===lostCountsBeforeTerminate,'lost-response replay changed one or more of the five committed relation counts')
  checks.lostResponseReconnect = 'PASS_COMMIT_WITNESSED_RECEIPT_SUPPRESSED_THEN_TERMINATED_AND_REPLAYED_SAME_RUN'
  activeCheck='currentStatusReplay'
  run(`UPDATE studio_core.studio_runs SET status='RUNNING' WHERE run_id=${sqlLiteral(reconnect.runId)}::uuid`)
  const truthful = call(commandFor(lostKey))
  assert(truthful.kind==='replayed' && truthful.status==='RUNNING' && truthful.lastEventSequence===1,'replay did not return current truthful status')
  checks.currentStatusReplay = 'PASS'

  // Kill the actual PostgreSQL backend after all five uncommitted inserts and before COMMIT.
  activeCheck='precommitConnectionTerminationRollback'
  const beforeCrash = counts()
  const crashApp = 'studio-precommit-kill-owned'
  const crashSession = interactivePsql(crashApp)
  crashSession.send(`BEGIN; ${admissionSql(commandFor('precommit-connection-kill'),contextFor())}; SELECT 'PRECOMMIT_READY';`)
  await crashSession.waitFor('PRECOMMIT_READY')
  sessionEvents.push({kind:'database-boundary',name:'precommit-connection-termination',outcome:'WITNESSED',applicationName:crashApp,uncommittedAdmissionReceiptReceived:true})
  const crashPid = run(`SELECT pid FROM pg_catalog.pg_stat_activity WHERE application_name=${sqlLiteral(crashApp)}`).stdout.trim().split(/\r?\n/).at(-1)
  assert(/^\d+$/.test(crashPid),'could not identify the exact owned precommit backend')
  run(`SELECT pg_terminate_backend(${Number(crashPid)})`)
  await crashSession.closed
  assert(counts()===beforeCrash,'terminating the precommit connection changed one or more of the five relations')
  checks.precommitConnectionTerminationRollback = 'PASS_CONNECTION_KILLED_THEN_RECONNECTED_COUNTS_UNCHANGED'
  activeCheck='fiveRelationAtomicRollback'

  // Trigger a deterministic failure on the fifth insert; transaction must leave all five unchanged.
  run(`CREATE OR REPLACE FUNCTION studio_test.fail_admission_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.command_json->>'idempotencyKey'='fail-atomic' THEN RAISE EXCEPTION 'fixture all-five rollback'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_admission_insert BEFORE INSERT ON studio_core.studio_run_admissions FOR EACH ROW EXECUTE FUNCTION studio_test.fail_admission_insert()`)
  const beforeFailure = counts()
  const failure = run(`BEGIN; ${admissionSql(commandFor('fail-atomic'),contextFor())}; COMMIT`,{allowError:true})
  assert(failure.status!==0 && /fixture all-five rollback/.test(failure.stderr),'atomic failure fixture did not fail for its intended constraint')
  run('DROP TRIGGER fail_admission_insert ON studio_core.studio_run_admissions')
  assert(counts()===beforeFailure,'fifth-relation failure did not roll back all five relations')
  checks.fiveRelationAtomicRollback = 'PASS'

  // Authority table row lock is the shared fixture lock. Admission owns it through outer COMMIT;
  // revocation must be observed waiting on a row lock, then commit before replay is retried.
  activeCheck='revocationObservedWaitingForAdmissionLock'
  const serializedKey='authority-lock-race'; const admissionApp='studio-authority-admission-held'
  const held=interactivePsql(admissionApp)
  held.send(`BEGIN; ${admissionSql(commandFor(serializedKey),contextFor())}; SELECT 'AUTHORITY_ADMISSION_HELD';`)
  await held.waitFor('AUTHORITY_ADMISSION_HELD')
  const revokeApp='studio-authority-revocation-waiter'
  const revoke=asyncPsql(`UPDATE studio_test.authority_fixture SET allowed=false WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`,revokeApp,30000)
  await waitForDbCondition(`SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name=${sqlLiteral(revokeApp)} AND wait_event_type='Lock'`,numericOne,'revocation blocked by admission shared authority row lock')
  checks.revocationObservedWaitingForAdmissionLock='PASS_DATABASE_LOCK_WAIT'
  sessionEvents.push({kind:'database-barrier',name:'authority-row-lock-revocation',outcome:'WITNESSED',applicationNames:[admissionApp,revokeApp],waiter:revokeApp,waitEventType:'Lock'})
  held.send('COMMIT; SELECT \'ADMISSION_COMMITTED\';')
  await held.waitFor('ADMISSION_COMMITTED'); held.child.stdin.end()
  const heldReceipt=lastJson(held.stdout)
  assert(heldReceipt.kind==='accepted','admission did not finish while holding fixture authority lock')
  await revoke
  const revoked=call(commandFor(serializedKey))
  assert(revoked.kind==='rejected' && revoked.reason==='COMMAND_FORBIDDEN','revoked current authority allowed replay after revocation commit')
  checks.revokedReplayDeniedAfterCommit='PASS'
  activeCheck='changedHashConflictAfterAuthority'
  run(`UPDATE studio_test.authority_fixture SET allowed=true WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)

  // Changed hash conflicts only under a matching current authority binding; other stale/revoked states deny first.
  run(`UPDATE studio_test.authority_fixture SET input_ref='sealed:changed' WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)
  const changed=call(commandFor(raceKey,{inputRef:'sealed:changed'}),contextFor())
  assert(changed.kind==='rejected' && changed.reason==='IDEMPOTENCY_CONFLICT','same scoped key/different hash did not conflict after current authority check')
  run(`UPDATE studio_test.authority_fixture SET input_ref='sealed:input' WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)
  checks.changedHashConflictAfterAuthority='PASS'

  const beforeStaleReplay=counts()
  run(`UPDATE studio_test.authority_fixture SET owner_version='owner-2' WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)
  const staleExisting=call(exactCommand)
  assert(staleExisting.kind==='rejected' && staleExisting.reason==='EXPECTED_VERSION_CONFLICT' && counts()===beforeStaleReplay,
    'current owner-version change replayed an existing key or wrote a relation')
  run(`UPDATE studio_test.authority_fixture SET owner_version='owner-1' WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)

  // Exact authority changes deny before writes and keep the five relation counts unchanged.
  activeCheck='authorityVersionAndRevocationDenials'
  const beforeMissing=counts()
  const missingBinding=call(exactCommand,contextFor({projectId:'00000000-0000-4000-8000-000000000099'}),'missing-authority-binding-existing-key')
  assert(missingBinding.kind==='rejected' && missingBinding.reason==='AUTHORITY_BINDING_UNAVAILABLE' && counts()===beforeMissing,
    'missing fixture authority binding did not deny without writes')
  checks.authorityVersionAndRevocationDenials='PASS_MISSING_BINDING_AND_FIXTURE_REVOKE_CASES'
  const authorityCases=[['owner_version','owner-2','owner-1','EXPECTED_VERSION_CONFLICT'],['policy_version','policy-2','policy-1','EXPECTED_VERSION_CONFLICT'],
    ['authority_epoch',5,3,'EXPECTED_VERSION_CONFLICT'],['input_ref','sealed:new','sealed:input','INPUT_SCOPE_MISMATCH'],
    ['authorization_evidence_id','revoked-evidence','evidence','COMMAND_FORBIDDEN'],['allowed',false,true,'COMMAND_FORBIDDEN']]
  for (const [field,value,restore,expected] of authorityCases) {
    const before=counts()
    run(`UPDATE studio_test.authority_fixture SET ${field}=${typeof value==='string'?sqlLiteral(value):value} WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)
    const denied=call(commandFor(`authority-change-${field}`))
    assert(denied.kind==='rejected' && denied.reason===expected && counts()===before,`current authority ${field} did not deny without writes`)
    run(`UPDATE studio_test.authority_fixture SET ${field}=${typeof restore==='string'?sqlLiteral(restore):restore} WHERE project_id='00000000-0000-4000-8000-000000000001' AND actor_issuer='issuer' AND actor_subject='actor' AND action_kind='PLAN' AND subject_id='subject'`)
  }
  for (const authorityMode of ['fixture-extra-authority-field','fixture-missing-authority-field']) {
    const before=counts()
    const invalidAuthority=call(commandFor(`invalid-resolver-${authorityMode}`),contextFor({snapshotRef:authorityMode}),`resolver-shape-${authorityMode}`)
    assert(invalidAuthority.kind==='rejected' && invalidAuthority.reason==='COMMAND_FORBIDDEN' && counts()===before,
      `malformed ${authorityMode} resolver result granted admission or wrote relations`)
  }
  checks.authorityVersionAndRevocationDenials='PASS_FIXTURE_ONLY'

  // Actual denied operations, with schema USAGE temporarily granted only inside this disposable fixture
  // for function EXECUTE probes. Each denial must have SQLSTATE 42501, not a syntax/setup error.
  activeCheck='actualRoleOperationDenials'
  run('GRANT USAGE ON SCHEMA studio_core TO anon,authenticated,service_role')
  const tables=['studio_runs','studio_run_stages','studio_outbox','studio_run_events','studio_run_admissions']
  const operations={SELECT:t=>`SELECT * FROM studio_core.${t} LIMIT 0`,INSERT:t=>`INSERT INTO studio_core.${t} DEFAULT VALUES`,
    UPDATE:t=>`UPDATE studio_core.${t} SET project_id=project_id WHERE false`,DELETE:t=>`DELETE FROM studio_core.${t} WHERE false`}
  for (const role of ['anon','authenticated','service_role']) for (const table of tables) for (const [operation,makeSql] of Object.entries(operations)) {
    const result=run(`SET ROLE ${role}; ${makeSql(table)}`,{allowError:true,applicationName:`acl-${role}-${table}-${operation}`})
    requireDenied(result,`${role} ${operation} ${table}`)
  }
  activeCheck='actualFunctionExecuteDenials'
  const functionCalls={hash:`studio_core.command_request_hash(${jsonSql(commandFor('acl-function'))})`,
    resolver:`studio_core.lock_current_command_authority(gen_random_uuid(),'issuer','actor','PLAN','subject','sealed:input','snapshot','evidence')`,
    admission:`studio_core.admit_run(${jsonSql(commandFor('acl-function'))},${jsonSql(contextFor())},repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid())`}
  for (const role of ['anon','authenticated','service_role']) for (const [name,expression] of Object.entries(functionCalls)) {
    if (role==='service_role' && name==='admission') continue
    const result=run(`SET ROLE ${role}; SELECT ${expression}`,{allowError:true,applicationName:`acl-${role}-function-${name}`})
    requireDenied(result,`${role} EXECUTE ${name}`)
  }
  run('REVOKE USAGE ON SCHEMA studio_core FROM anon,authenticated')
  checks.actualRoleOperationDenials='PASS_60_TABLE_OPERATIONS_SQLSTATE_42501'
  checks.actualFunctionExecuteDenials='PASS_ANON_AUTHENTICATED_AND_SERVICE_PRIVATE_HELPER_SQLSTATE_42501'
  activeCheck='publicInheritanceAndServiceFunctionAcl'

  const publicLeak=run(`SELECT count(*) FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace,
    LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a WHERE n.nspname='studio_core' AND a.grantee=0 AND a.privilege_type='EXECUTE'`).stdout.trim().split(/\r?\n/).at(-1)
  assert(publicLeak==='0','PUBLIC retains function EXECUTE via ACL inheritance')
  const serviceLeak=run(`SELECT count(*) FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
    WHERE n.nspname='studio_core' AND has_function_privilege('service_role',f.oid,'EXECUTE') AND f.proname<>'admit_run'`).stdout.trim().split(/\r?\n/).at(-1)
  assert(serviceLeak==='0','service_role can execute a non-admission private function')
  checks.publicInheritanceAndServiceFunctionAcl='PASS_ACL_AND_ACTUAL_ANON_AUTH_CALLS'

  // Hostile search_path invocation is made under service_role, with a shadow relation in pg_temp.
  activeCheck='hostileSearchPathServiceRole'
  const hostileCommand=commandFor('hostile-search-path')
  const hostileHash=candidateHash(hostileCommand)
  const hostileResult=lastJson(run(`CREATE TEMP TABLE studio_runs(run_id text); SET ROLE service_role; SET search_path=pg_temp,public; ${admissionSql(hostileCommand,contextFor(),'hostile-search-path',sqlLiteral(hostileHash))}; RESET ROLE`).stdout)
  assert(hostileResult.kind==='accepted','service_role RPC failed or was intercepted under hostile search_path')
  checks.hostileSearchPathServiceRole='PASS'
  checks.postgresFixtureOperations='PASS'
  activeCheck=null
} catch (error) {
  runFailure=error
  if (activeCheck) checks[activeCheck]='FAIL'
} finally {
  const cleanup = await cleanupOwnedWork()
  if ((!cleanup.allChildrenClosed || !cleanup.allOperationsSettled) && !runFailure) {
    runFailure = new Error(`Owned psql cleanup incomplete (childrenClosed=${cleanup.allChildrenClosed}; operationsSettled=${cleanup.allOperationsSettled})`)
  }
  if (!cleanup.allChildrenClosed || !cleanup.allOperationsSettled) checks[activeCheck || 'postgresFixtureOperations'] = 'FAIL'
  writeReceipt()
}
if (runFailure) throw runFailure
console.log(`Studio admission isolated PostgreSQL checks completed; sanitized receipt: ${receiptPath}`)
console.log(JSON.stringify(safeReceipt()))
