/**
 * Task 2.1 — management SQL client + adoption core (plan T9.1–T9.17, including
 * T16 runtime-role gate and T15 native-history read-only assertion).
 *
 * The production modules are ESM and are exercised through child subprocesses
 * (same pattern as tests/migration-ledger-policy.test.ts) so what CI runs is
 * what is tested. The fake client mirrors the exact shape
 * scripts/migration-ledger-adoption.mjs consumes.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ADOPTION = join(ROOT, 'scripts', 'migration-ledger-adoption.mjs')
const MGMT = join(ROOT, 'scripts', 'supabase-management-sql.mjs')
const POLICY = join(ROOT, 'scripts', 'migration-ledger-policy.mjs')
const ORDER = join(ROOT, 'scripts', 'migration-order.mjs')
const MANIFEST = join(ROOT, 'supabase', 'migration-baseline.json')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'adopt-migration-ledger.yml')
const manifestJson = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
  generatedFrom: { gitSha: string }
  files: Array<{ filename: string; sha256: string }>
}
const BASELINE_SHA = manifestJson.generatedFrom.gitSha

// Adoption is dispatched against a checkout pinned to expected_main_sha and
// requires an estate of exactly the frozen 69 baseline files; the live branch
// may already carry valid future 14-digit migrations, so the tests run against
// a baseline-only copy (production policy stays exact-estate).
const BASELINE_ESTATE_DIR = mkdtempSync(join(tmpdir(), 'ledger-adoption-baseline-'))
for (const file of manifestJson.files) {
  copyFileSync(join(MIGRATIONS, file.filename), join(BASELINE_ESTATE_DIR, file.filename))
}
afterAll(() => rmSync(BASELINE_ESTATE_DIR, { recursive: true, force: true }))

function evalAdoption<T>(body: string): T {
  const code = `
    const adoption = await import(${JSON.stringify(ADOPTION)})
    const mgmt = await import(${JSON.stringify(MGMT)})
    const policy = await import(${JSON.stringify(POLICY)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    ${body}
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}

const FIXTURES = `
  const manifest = policy.loadManifest(${JSON.stringify(MANIFEST)})
  const rowsFor = (override = () => undefined) =>
    manifest.files.map((f) => ({
      filename: f.filename,
      sha256: override(f) ?? f.sha256,
      applied_by: 'adoption-baseline',
      source_git_sha: manifest.generatedFrom.gitSha,
    }))
  function fakeClient({ ledger = { exists: false, rows: [] }, role = { current_user: 'postgres', session_user: 'postgres', role: null }, native = [], onInsert, events } = {}) {
    const queries = []
    const executes = []
    const inserts = []
    const client = {
      async query(sql) {
        queries.push(sql)
        if (sql.includes('current_user')) return [role]
        if (sql.includes('to_regclass')) {
          return [{ ledger_reg: ledger.exists ? 'supabase_migrations.yousafe_migration_ledger' : null }]
        }
        if (sql.includes('FROM supabase_migrations.yousafe_migration_ledger')) return ledger.rows
        if (sql.includes('schema_migrations')) return native
        throw new Error('unexpected query: ' + sql)
      },
      async execute(sql) {
        events?.push('execute')
        executes.push(sql)
        return { ok: true, status: 200, body: '[]' }
      },
      async runSql(sql) {
        events?.push('runSql')
        inserts.push(sql)
        if (onInsert) return onInsert({ ledger, inserts })
        return { ok: true, status: 200, body: '[]' }
      },
    }
    return { client, queries, executes, inserts }
  }
  const commitRows = ({ ledger }) => {
    ledger.exists = true
    ledger.rows = rowsFor()
    return { ok: true, status: 200, body: '[]' }
  }
  const run = async (overrides = {}) => {
    try {
      const result = await adoption.runAdoption({
        client: overrides.client,
        manifestPath: overrides.manifestPath,
        migrationsDir: overrides.migrationsDir ?? ${JSON.stringify(BASELINE_ESTATE_DIR)},
        expectedMainSha: overrides.expectedMainSha ?? manifest.generatedFrom.gitSha,
        assertAncestor: overrides.assertAncestor ?? (async () => true),
        log: overrides.log,
      })
      return { result }
    } catch (err) {
      return { error: String((err && err.message) || err) }
    }
  }
`

describe('migration ledger adoption core', () => {
  it('T9.1 sends zero historical migration SQL (one DDL execute, one baseline INSERT)', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      executed: number
      inserted: number
      ddlHasTable: boolean
      ddlHasRevoke: boolean
      ddlHasAlterTable: boolean
      ddlHasInsertInto: boolean
      insertStartsWithBegin: boolean
      migrationProbe: boolean
    }>(`
      ${FIXTURES}
      const { client, executes, inserts } = fakeClient({ onInsert: commitRows })
      const outcome = await run({ client })
      const both = [...executes, ...inserts]
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        executed: executes.length,
        inserted: inserts.length,
        ddlHasTable: executes[0]?.includes('CREATE TABLE IF NOT EXISTS supabase_migrations.yousafe_migration_ledger'),
        ddlHasRevoke: executes[0]?.includes('REVOKE ALL'),
        ddlHasAlterTable: executes[0]?.includes('ALTER TABLE'),
        ddlHasInsertInto: /INSERT INTO/.test(executes[0] ?? ''),
        insertStartsWithBegin: inserts[0]?.startsWith('BEGIN;'),
        migrationProbe: both.some((sql) => /ALTER TABLE|CREATE TABLE content_jobs|INSERT INTO public\\./.test(sql)),
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.executed).toBe(1)
    expect(out.inserted).toBe(1)
    expect(out.ddlHasTable).toBe(true)
    expect(out.ddlHasRevoke).toBe(true)
    expect(out.ddlHasAlterTable).toBe(false)
    expect(out.ddlHasInsertInto).toBe(false)
    expect(out.insertStartsWithBegin).toBe(true)
    expect(out.migrationProbe).toBe(false)
  })

  it('T9.2 composes exactly one 69-row atomic baseline INSERT in manifest order', () => {
    const out = evalAdoption<{
      error?: string
      startsBegin: boolean
      endsCommit: boolean
      insertStatements: number
      doBlocks: number
      incompleteChecks: number
      hasOnConflict: boolean
      insertPartBaselineLiterals: number
      baselineTuples: number
      gitShaTuples: number
      filenameCounts: Record<string, number>
      ordered: boolean
    }>(`
      ${FIXTURES}
      const sql = adoption.composeBaselineInsert({
        rows: manifest.files,
        sourceGitSha: manifest.generatedFrom.gitSha,
      })
      const insertPart = sql.slice(0, sql.indexOf('DO $$'))
      const tupleFor = (row) =>
        "('" + row.filename + "', '" + row.sha256 + "', '" + manifest.generatedFrom.gitSha + "', 'adoption-baseline')"
      const positions = manifest.files.map((row) => sql.indexOf(tupleFor(row)))
      console.log(JSON.stringify({
        startsBegin: sql.startsWith('BEGIN;'),
        endsCommit: sql.trimEnd().endsWith('COMMIT;'),
        insertStatements: (sql.match(/INSERT INTO/g) ?? []).length,
        doBlocks: (sql.match(/DO \\$\\$/g) ?? []).length,
        incompleteChecks: (sql.match(/<> 69/g) ?? []).length,
        hasOnConflict: sql.includes('ON CONFLICT'),
        insertPartBaselineLiterals: (insertPart.match(/'adoption-baseline'/g) ?? []).length,
        baselineTuples: (sql.match(/'adoption-baseline'\\)/g) ?? []).length,
        gitShaTuples: sql.split("'" + manifest.generatedFrom.gitSha + "', 'adoption-baseline')").length - 1,
        filenameCounts: Object.fromEntries(
          manifest.files.map((row) => [row.filename, sql.split("'" + row.filename + "'").length - 1]),
        ),
        ordered: positions.every((position, index) => position !== -1 && (index === 0 || position > positions[index - 1])),
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.startsBegin).toBe(true)
    expect(out.endsCommit).toBe(true)
    expect(out.insertStatements).toBe(1)
    expect(out.doBlocks).toBe(1)
    expect(out.incompleteChecks).toBe(3)
    expect(out.hasOnConflict).toBe(false)
    expect(out.insertPartBaselineLiterals).toBe(69)
    expect(out.baselineTuples).toBe(69)
    expect(out.gitShaTuples).toBe(69)
    for (const file of manifestJson.files) {
      expect(out.filenameCounts[file.filename]).toBe(1)
    }
    expect(Object.keys(out.filenameCounts)).toHaveLength(69)
    expect(out.ordered).toBe(true)
  })

  it('T9.3 exact 69-row match is a no-write ALREADY_ADOPTED idempotent no-op', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      executed: number
      inserted: number
      summaryContainsWrites0: boolean
    }>(`
      ${FIXTURES}
      const { client, executes, inserts } = fakeClient({ ledger: { exists: true, rows: rowsFor() } })
      const outcome = await run({ client })
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        executed: executes.length,
        inserted: inserts.length,
        summaryContainsWrites0: (outcome.result?.summaryLine ?? '').includes('writes=0'),
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ALREADY_ADOPTED')
    expect(out.executed).toBe(0)
    expect(out.inserted).toBe(0)
    expect(out.summaryContainsWrites0).toBe(true)
  })

  it('T9.4 any partial/extra/hash/provenance mismatch fails closed before writes', () => {
    const out = evalAdoption<Record<string, { message?: string; executed: number; inserted: number }>>(`
      ${FIXTURES}
      const variants = {
        short68: () => rowsFor().slice(0, 68),
        extra70: () => [
          ...rowsFor(),
          {
            filename: '20990101_extra.sql',
            sha256: 'a'.repeat(64),
            applied_by: 'adoption-baseline',
            source_git_sha: manifest.generatedFrom.gitSha,
          },
        ],
        badHash: () => rowsFor().map((row, index) => (index === 0 ? { ...row, sha256: '0'.repeat(64) } : row)),
        badGit: () => rowsFor().map((row, index) => (index === 0 ? { ...row, source_git_sha: '1'.repeat(40) } : row)),
        badAppliedBy: () => rowsFor().map((row, index) => (index === 0 ? { ...row, applied_by: 'ci-runner' } : row)),
      }
      const results = {}
      for (const [name, rows] of Object.entries(variants)) {
        const { client, executes, inserts } = fakeClient({ ledger: { exists: true, rows: rows() } })
        const outcome = await run({ client })
        results[name] = { message: outcome.error, executed: executes.length, inserted: inserts.length }
      }
      console.log(JSON.stringify(results))
    `)
    for (const name of ['short68', 'extra70', 'badHash', 'badGit', 'badAppliedBy']) {
      expect(out[name].message).toMatch(/^ADOPTION FAILED/)
      expect(out[name].executed).toBe(0)
      expect(out[name].inserted).toBe(0)
    }
  })

  it('T9.5 manifest hash drift fails before any client call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ledger-adoption-manifest-'))
    try {
      const tampered = JSON.parse(readFileSync(MANIFEST, 'utf8'))
      tampered.files[0].sha256 = '0'.repeat(64)
      const tamperedPath = join(dir, 'tampered-baseline.json')
      writeFileSync(tamperedPath, JSON.stringify(tampered))
      const out = evalAdoption<{ message?: string; queries: number; executed: number; inserted: number }>(`
        ${FIXTURES}
        const { client, queries, executes, inserts } = fakeClient()
        const outcome = await run({ client, manifestPath: ${JSON.stringify(tamperedPath)} })
        console.log(JSON.stringify({
          message: outcome.error,
          queries: queries.length,
          executed: executes.length,
          inserted: inserts.length,
        }))
      `)
      expect(out.message).toMatch(/^ADOPTION FAILED: manifest invalid/)
      expect(out.queries).toBe(0)
      expect(out.executed).toBe(0)
      expect(out.inserted).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('T9.6 ancestry failure aborts before any write', () => {
    const out = evalAdoption<{ message?: string; executed: number; inserted: number }>(`
      ${FIXTURES}
      const { client, executes, inserts } = fakeClient()
      const outcome = await run({ client, assertAncestor: async () => false })
      console.log(JSON.stringify({
        message: outcome.error,
        executed: executes.length,
        inserted: inserts.length,
      }))
    `)
    expect(out.message).toContain('ADOPTION FAILED: manifest baseline sha is not an ancestor')
    expect(out.executed).toBe(0)
    expect(out.inserted).toBe(0)
  })

  it('T9.7 T16 runtime role gate: non-postgres fails closed with zero writes; postgres proceeds', () => {
    const out = evalAdoption<Record<string, { message?: string; status?: string; executed: number; inserted: number }>>(`
      ${FIXTURES}
      const results = {}
      for (const [name, role] of Object.entries({
        authenticated: { current_user: 'authenticated', session_user: 'authenticated', role: 'authenticated' },
        sessionAdmin: { current_user: 'postgres', session_user: 'supabase_admin', role: null },
      })) {
        const { client, executes, inserts } = fakeClient({ role, onInsert: commitRows })
        const outcome = await run({ client })
        results[name] = { message: outcome.error, executed: executes.length, inserted: inserts.length }
      }
      {
        const { client, executes, inserts } = fakeClient({ onInsert: commitRows })
        const outcome = await run({ client })
        results.postgres = { status: outcome.result?.status, executed: executes.length, inserted: inserts.length }
      }
      console.log(JSON.stringify(results))
    `)
    expect(out.authenticated.message).toContain('runtime role is not postgres')
    expect(out.authenticated.executed).toBe(0)
    expect(out.authenticated.inserted).toBe(0)
    expect(out.sessionAdmin.message).toContain('runtime role is not postgres')
    expect(out.sessionAdmin.executed).toBe(0)
    expect(out.sessionAdmin.inserted).toBe(0)
    expect(out.postgres.status).toBe('ADOPTED')
    expect(out.postgres.executed).toBe(1)
    expect(out.postgres.inserted).toBe(1)
  })

  it('T9.8 T15 native schema_migrations history is read-only (SELECT only)', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      nativeStrings: string[]
      nonSelectNative: number
      dmlAgainstNative: boolean
    }>(`
      ${FIXTURES}
      const NATIVE_SELECT = 'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version'
      const { client, queries, executes, inserts } = fakeClient({ onInsert: commitRows })
      const outcome = await run({ client })
      const all = [...queries, ...executes, ...inserts]
      const nativeStrings = all.filter((sql) => sql.includes('schema_migrations'))
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        nativeStrings,
        nonSelectNative: nativeStrings.filter((sql) => !(sql === NATIVE_SELECT || sql.trim().startsWith('SELECT'))).length,
        dmlAgainstNative: all.some(
          (sql) => sql.includes('schema_migrations') && /\\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\b/.test(sql),
        ),
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.nativeStrings.length).toBeGreaterThan(0)
    expect(out.nativeStrings).toContain('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version')
    expect(out.nonSelectNative).toBe(0)
    expect(out.dmlAgainstNative).toBe(false)
  })

  it('T9.9 adopt path returns the exact verified summary line', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      inserted?: number
      recovered?: boolean
      insertedRequests: number
      summaryLine?: string
    }>(`
      ${FIXTURES}
      const { client, inserts } = fakeClient({ onInsert: commitRows })
      const outcome = await run({ client })
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        inserted: outcome.result?.inserted,
        recovered: outcome.result?.recovered,
        insertedRequests: inserts.length,
        summaryLine: outcome.result?.summaryLine,
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.inserted).toBe(69)
    expect(out.recovered).toBe(false)
    expect(out.insertedRequests).toBe(1)
    expect(out.summaryLine).toBe(
      `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=${BASELINE_SHA}, native_history_unchanged=true, runtime_role_verified=true`,
    )
  })

  it('T9.9b logs the verified runtime role for diagnostics after the postgres gate and before any write', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      logs: string[]
      events: string[]
    }>(`
      ${FIXTURES}
      const logs = []
      const events = []
      const { client } = fakeClient({ onInsert: commitRows, events })
      const outcome = await run({ client, log: (line) => { logs.push(line); events.push('log') } })
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        logs,
        events,
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.logs[0]).toBe('RUNTIME ROLE VERIFIED: current_user=postgres, session_user=postgres, role=null')
    expect(out.events).toEqual(['log', 'execute', 'runSql', 'log'])
    expect(out.logs[out.logs.length - 1]).toBe(
      `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=${BASELINE_SHA}, native_history_unchanged=true, runtime_role_verified=true`,
    )
  })

  it('T9.13 lost response (status 0) reconciles to recovered adoption with exactly one baseline INSERT', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      recovered?: boolean
      inserted?: number
      insertedRequests: number
      executedRequests: number
      summaryLine?: string
    }>(`
      ${FIXTURES}
      const { client, executes, inserts } = fakeClient({
        onInsert: ({ ledger }) => {
          ledger.exists = true
          ledger.rows = rowsFor()
          return { ok: false, status: 0, body: 'socket hang up' }
        },
      })
      const outcome = await run({ client })
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        recovered: outcome.result?.recovered,
        inserted: outcome.result?.inserted,
        insertedRequests: inserts.length,
        executedRequests: executes.length,
        summaryLine: outcome.result?.summaryLine,
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.recovered).toBe(true)
    expect(out.inserted).toBe(69)
    expect(out.insertedRequests).toBe(1)
    expect(out.executedRequests).toBe(1)
    expect(out.summaryLine).toContain('lost-response recovered')
    expect(out.summaryLine).toContain('baseline_insert_requests=1')
  })

  it('T9.14 lost response (thrown) is normalized and reconciles the same way', () => {
    const out = evalAdoption<{
      status?: string
      error?: string
      recovered?: boolean
      inserted?: number
      insertedRequests: number
      summaryLine?: string
    }>(`
      ${FIXTURES}
      const { client, inserts } = fakeClient({
        onInsert: ({ ledger }) => {
          ledger.exists = true
          ledger.rows = rowsFor()
          throw new Error('ECONNRESET')
        },
      })
      const outcome = await run({ client })
      console.log(JSON.stringify({
        status: outcome.result?.status,
        error: outcome.error,
        recovered: outcome.result?.recovered,
        inserted: outcome.result?.inserted,
        insertedRequests: inserts.length,
        summaryLine: outcome.result?.summaryLine,
      }))
    `)
    expect(out.error).toBeUndefined()
    expect(out.status).toBe('ADOPTED')
    expect(out.recovered).toBe(true)
    expect(out.inserted).toBe(69)
    expect(out.insertedRequests).toBe(1)
    expect(out.summaryLine).toContain('lost-response recovered')
    expect(out.summaryLine).toContain('baseline_insert_requests=1')
  })

  it('T9.15 unknown response with absent/empty ledger requires supervised re-dispatch', () => {
    const out = evalAdoption<{ message?: string; insertedRequests: number }>(`
      ${FIXTURES}
      const { client, inserts } = fakeClient({
        onInsert: () => ({ ok: false, status: 0, body: 'timeout' }),
      })
      const outcome = await run({ client })
      console.log(JSON.stringify({ message: outcome.error, insertedRequests: inserts.length }))
    `)
    expect(out.message).toMatch(/^ADOPTION FAILED/)
    expect(out.message).toContain('supervised re-dispatch')
    expect(out.insertedRequests).toBe(1)
  })

  it('T9.16 unknown response with partial ledger is a production incident', () => {
    const out = evalAdoption<{ message?: string; insertedRequests: number }>(`
      ${FIXTURES}
      const { client, inserts } = fakeClient({
        onInsert: ({ ledger }) => {
          ledger.exists = true
          ledger.rows = rowsFor().slice(0, 68)
          return { ok: false, status: 0, body: 'timeout' }
        },
      })
      const outcome = await run({ client })
      console.log(JSON.stringify({ message: outcome.error, insertedRequests: inserts.length }))
    `)
    expect(out.message).toMatch(/^ADOPTION FAILED/)
    expect(out.message).toContain('production incident')
    expect(out.insertedRequests).toBe(1)
  })

  it('T9.17 adoption refuses a 70th migration (exact frozen 69-file estate)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ledger-adoption-estate-'))
    try {
      const estateDir = join(dir, 'migrations')
      const out = evalAdoption<{
        message?: string
        queries: number
        executed: number
        inserted: number
        estateRules: string[]
      }>(`
        ${FIXTURES}
        const { copyFileSync, mkdirSync, writeFileSync } = await import('node:fs')
        const { join: joinPath } = await import('node:path')
        mkdirSync(${JSON.stringify(estateDir)}, { recursive: true })
        for (const file of manifest.files) {
          copyFileSync(
            joinPath(${JSON.stringify(MIGRATIONS)}, file.filename),
            joinPath(${JSON.stringify(estateDir)}, file.filename),
          )
        }
        writeFileSync(joinPath(${JSON.stringify(estateDir)}, '20270101120000_brand_new_thing.sql'), 'SELECT 1;')
        const { client, queries, executes, inserts } = fakeClient()
        const outcome = await run({ client, migrationsDir: ${JSON.stringify(estateDir)} })
        const policyCheck = policy.validateManifest(manifest, {
          order: [...migrationOrder(), '20270101120000_brand_new_thing.sql'],
          requireExactEstate: true,
        })
        console.log(JSON.stringify({
          message: outcome.error,
          queries: queries.length,
          executed: executes.length,
          inserted: inserts.length,
          estateRules: policyCheck.violations.map((violation) => violation.rule),
        }))
      `)
      expect(out.message).toContain('ADOPTION FAILED: baseline-estate-changed')
      expect(out.queries).toBe(0)
      expect(out.executed).toBe(0)
      expect(out.inserted).toBe(0)
      expect(out.estateRules).toContain('MANIFEST_ESTATE_CHANGED')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('management sql client', () => {
  it('T9.10 retries transient results, fails permanent ones, and normalizes thrown errors', () => {
    const out = evalAdoption<{
      retry503: { rows: unknown[]; fetches: number; sleeps: number[] }
      perm400: { error: { name: string; status: number; message: string } | null; fetches: number; sleeps: number[] }
      networkThen200: { rows: unknown[]; fetches: number; sleeps: number[] }
      injectedRunSql: { rows: unknown[]; calls: number; sleeps: number[] }
      classify: Record<string, string>
    }>(`
      const jsonResponse = (status, body) => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
      })
      const scriptedFetch = (responses) => {
        const calls = { count: 0 }
        const fetchImpl = async () => {
          const response = responses[calls.count] ?? responses[responses.length - 1]
          calls.count += 1
          if (response instanceof Error) throw response
          return response
        }
        return { fetchImpl, calls }
      }
      const clientFor = (fetchImpl, sleeps) =>
        mgmt.createManagementSqlClient({
          projectRef: 'proj',
          accessToken: 'token',
          fetchImpl,
          sleepFn: async (ms) => { sleeps.push(ms) },
        })

      const retry503 = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([
          jsonResponse(503, 'busy'),
          jsonResponse(503, 'busy'),
          jsonResponse(200, '[{"n":1}]'),
        ])
        return clientFor(fetchImpl, sleeps).query('select 1').then((rows) => ({ rows, fetches: calls.count, sleeps }))
      })()

      const perm400 = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([jsonResponse(400, 'bad sql')])
        return clientFor(fetchImpl, sleeps)
          .query('select 1')
          .then(
            () => ({ error: null, fetches: calls.count, sleeps }),
            (err) => ({
              error: { name: err.name, status: err.status, message: err.message },
              fetches: calls.count,
              sleeps,
            }),
          )
      })()

      const networkThen200 = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([new Error('socket hang up'), jsonResponse(200, '[]')])
        return clientFor(fetchImpl, sleeps).query('select 1').then((rows) => ({ rows, fetches: calls.count, sleeps }))
      })()

      const injectedRunSql = (() => {
        let calls = 0
        const sleeps = []
        const runSql = async () => {
          calls += 1
          if (calls === 1) throw new Error('socket hang up')
          return { ok: true, status: 200, body: '[]' }
        }
        return mgmt
          .runQueryWithRetry('select 1', { runSql, sleepFn: async (ms) => { sleeps.push(ms) } })
          .then((rows) => ({ rows, calls, sleeps }))
      })()

      const [a, b, c, d] = await Promise.all([retry503, perm400, networkThen200, injectedRunSql])
      console.log(JSON.stringify({
        retry503: a,
        perm400: b,
        networkThen200: c,
        injectedRunSql: d,
        classify: {
          s200: mgmt.classifyResult({ ok: true, status: 200 }),
          t500: mgmt.classifyResult({ ok: false, status: 500 }),
          t429: mgmt.classifyResult({ ok: false, status: 429 }),
          t0: mgmt.classifyResult({ ok: false, status: 0 }),
          p400: mgmt.classifyResult({ ok: false, status: 400 }),
          p401: mgmt.classifyResult({ ok: false, status: 401 }),
          p404: mgmt.classifyResult({ ok: false, status: 404 }),
        },
      }))
    `)
    expect(out.retry503.rows).toEqual([{ n: 1 }])
    expect(out.retry503.fetches).toBe(3)
    expect(out.retry503.sleeps).toEqual([1000, 2000])
    expect(out.perm400.error?.name).toBe('ManagementSqlError')
    expect(out.perm400.error?.status).toBe(400)
    expect(out.perm400.error?.message).toContain('HTTP 400')
    expect(out.perm400.fetches).toBe(1)
    expect(out.perm400.sleeps).toEqual([])
    expect(out.networkThen200.rows).toEqual([])
    expect(out.networkThen200.fetches).toBe(2)
    expect(out.networkThen200.sleeps).toEqual([1000])
    expect(out.injectedRunSql.rows).toEqual([])
    expect(out.injectedRunSql.calls).toBe(2)
    expect(out.injectedRunSql.sleeps).toEqual([1000])
    expect(out.classify).toEqual({
      s200: 'success',
      t500: 'transient',
      t429: 'transient',
      t0: 'transient',
      p400: 'permanent',
      p401: 'permanent',
      p404: 'permanent',
    })
  })

  it('T9.11 verifyPostgresRuntimeRole echoes identity and fails closed for either non-postgres field', () => {
    const out = evalAdoption<{
      both: { ok: boolean; currentUser: string; sessionUser: string; role: string | null }
      badUser: { ok: boolean }
      badSession: { ok: boolean }
      queries: string[]
    }>(`
      const queries = []
      const clientFor = (row) => ({
        async query(sql) {
          queries.push(sql)
          return [row]
        },
      })
      const both = await mgmt.verifyPostgresRuntimeRole(
        clientFor({ current_user: 'postgres', session_user: 'postgres', role: null }),
      )
      const badUser = await mgmt.verifyPostgresRuntimeRole(
        clientFor({ current_user: 'authenticated', session_user: 'postgres', role: 'authenticated' }),
      )
      const badSession = await mgmt.verifyPostgresRuntimeRole(
        clientFor({ current_user: 'postgres', session_user: 'supabase_admin', role: null }),
      )
      console.log(JSON.stringify({ both, badUser, badSession, queries }))
    `)
    expect(out.both).toEqual({ ok: true, currentUser: 'postgres', sessionUser: 'postgres', role: null })
    expect(out.badUser.ok).toBe(false)
    expect(out.badSession.ok).toBe(false)
    for (const sql of out.queries) {
      expect(sql).toContain('current_user')
      expect(sql).toContain('session_user')
      expect(sql).toContain("current_setting('role', true)")
    }
  })

  it('T9.12 readLedgerRows reports absence and reads the four ledger columns when present', () => {
    const out = evalAdoption<{
      absent: { exists: boolean; rows: unknown[] }
      absentQueries: string[]
      present: { exists: boolean; rows: unknown[] }
      presentQueries: string[]
    }>(`
      const ledgerClient = ({ registered, rows }) => {
        const queries = []
        const client = {
          async query(sql) {
            queries.push(sql)
            if (sql.includes('to_regclass')) return [{ ledger_reg: registered ? 'supabase_migrations.yousafe_migration_ledger' : null }]
            return rows
          },
        }
        return { client, queries }
      }
      const rows = [
        {
          filename: 'content_jobs.sql',
          sha256: 'a'.repeat(64),
          applied_by: 'adoption-baseline',
          source_git_sha: 'b'.repeat(40),
        },
      ]
      const absentClient = ledgerClient({ registered: false, rows: [] })
      const absent = await mgmt.readLedgerRows(absentClient.client)
      const presentClient = ledgerClient({ registered: true, rows })
      const present = await mgmt.readLedgerRows(presentClient.client)
      console.log(JSON.stringify({
        absent,
        absentQueries: absentClient.queries,
        present,
        presentQueries: presentClient.queries,
      }))
    `)
    expect(out.absent).toEqual({ exists: false, rows: [] })
    expect(out.absentQueries).toHaveLength(1)
    expect(out.absentQueries[0]).toContain('to_regclass')
    expect(out.present.exists).toBe(true)
    expect(out.present.rows).toHaveLength(1)
    expect(out.presentQueries).toHaveLength(2)
    expect(out.presentQueries[1].trim().startsWith('SELECT')).toBe(true)
    for (const column of ['filename', 'sha256', 'applied_by', 'source_git_sha']) {
      expect(out.presentQueries[1]).toContain(column)
    }
  })

  it('T9.18 ledger DDL execute retries transient results, never retries permanent ones, and returns success after retry', () => {
    const out = evalAdoption<{
      transient: { result: { ok: boolean; status: number }; fetches: number; sleeps: number[] }
      permanent: { result: { ok: boolean; status: number }; fetches: number; sleeps: number[] }
      networkThen200: { result: { ok: boolean; status: number }; fetches: number; sleeps: number[] }
      exhausted: { result: { ok: boolean; status: number }; fetches: number; sleeps: number[] }
    }>(`
      const jsonResponse = (status, body) => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
      })
      const scriptedFetch = (responses) => {
        const calls = { count: 0 }
        const fetchImpl = async () => {
          const response = responses[calls.count] ?? responses[responses.length - 1]
          calls.count += 1
          if (response instanceof Error) throw response
          return response
        }
        return { fetchImpl, calls }
      }
      const clientFor = (fetchImpl, sleeps) =>
        mgmt.createManagementSqlClient({
          projectRef: 'proj',
          accessToken: 'token',
          fetchImpl,
          sleepFn: async (ms) => { sleeps.push(ms) },
        })
      const ddl = 'CREATE TABLE IF NOT EXISTS supabase_migrations.yousafe_migration_ledger (filename text)'

      const transient = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([
          jsonResponse(503, 'busy'),
          jsonResponse(503, 'busy'),
          jsonResponse(201, '[]'),
        ])
        return clientFor(fetchImpl, sleeps).execute(ddl).then((result) => ({ result, fetches: calls.count, sleeps }))
      })()

      const permanent = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([jsonResponse(400, 'bad ddl')])
        return clientFor(fetchImpl, sleeps).execute(ddl).then((result) => ({ result, fetches: calls.count, sleeps }))
      })()

      const networkThen200 = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([new Error('socket hang up'), jsonResponse(200, '[]')])
        return clientFor(fetchImpl, sleeps).execute(ddl).then((result) => ({ result, fetches: calls.count, sleeps }))
      })()

      const exhausted = (() => {
        const sleeps = []
        const { fetchImpl, calls } = scriptedFetch([jsonResponse(503, 'busy')])
        return clientFor(fetchImpl, sleeps).execute(ddl).then((result) => ({ result, fetches: calls.count, sleeps }))
      })()

      const [a, b, c, d] = await Promise.all([transient, permanent, networkThen200, exhausted])
      console.log(JSON.stringify({
        transient: a,
        permanent: b,
        networkThen200: c,
        exhausted: d,
      }))
    `)
    expect(out.transient.result).toMatchObject({ ok: true, status: 201 })
    expect(out.transient.fetches).toBe(3)
    expect(out.transient.sleeps).toEqual([1000, 2000])
    expect(out.permanent.result).toMatchObject({ ok: false, status: 400 })
    expect(out.permanent.fetches).toBe(1)
    expect(out.permanent.sleeps).toEqual([])
    expect(out.networkThen200.result).toMatchObject({ ok: true, status: 200 })
    expect(out.networkThen200.fetches).toBe(2)
    expect(out.networkThen200.sleeps).toEqual([1000])
    expect(out.exhausted.result.ok).toBe(false)
    expect(out.exhausted.result.status).toBe(503)
    expect(out.exhausted.fetches).toBe(3)
    expect(out.exhausted.sleeps).toEqual([1000, 2000])
  })
})

describe('adoption workflow contract (T14)', () => {
  let yaml = ''

  beforeAll(() => {
    yaml = readFileSync(WORKFLOW, 'utf8')
  })

  const stepBlocks = (source: string): string[] =>
    source
      .split(/\n(?= {6}- )/)
      .filter((block) => /^ {6}- (?:name|uses):/.test(block))

  const stepBlock = (matcher: string): string => stepBlocks(yaml).find((block) => block.includes(matcher)) ?? ''

  const runScripts = (source: string): string[] => {
    const lines = source.split('\n')
    const scripts: string[] = []
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^(\s*)run:\s*\|-?\s*$/)
      if (!match) continue
      const baseIndent = match[1].length
      const script: string[] = []
      for (let j = i + 1; j < lines.length; j += 1) {
        const line = lines[j]
        if (line.trim() !== '' && (line.match(/^\s*/)?.[0].length ?? 0) <= baseIndent) break
        script.push(line)
      }
      scripts.push(script.join('\n'))
    }
    return scripts
  }

  it('is dispatch-only: exactly one workflow_dispatch trigger and no push trigger', () => {
    expect(yaml).toMatch(/^\s*workflow_dispatch:/m)
    expect(yaml).not.toMatch(/^\s*push:/m)
  })

  it('requires the migration-ledger-adoption environment', () => {
    expect(yaml).toContain('environment: migration-ledger-adoption')
  })

  it('has no job-level if:, so an invalid dispatch fails instead of skipping silently', () => {
    expect(yaml).not.toMatch(/^ {4}if:/m)
  })

  it('runs the refusal guard as the first step, before checkout', () => {
    expect(yaml.indexOf('Refuse unless dispatched from main with exact confirmation')).toBeGreaterThanOrEqual(0)
    expect(yaml.indexOf('Refuse unless dispatched from main with exact confirmation')).toBeLessThan(
      yaml.indexOf('actions/checkout'),
    )
    const guard = stepBlock('Refuse unless dispatched from main with exact confirmation')
    expect(guard).toContain('GITHUB_REF: ${{ github.ref }}')
    expect(guard).toContain('CONFIRMATION: ${{ inputs.confirmation }}')
    expect(guard).toContain('test "${GITHUB_REF}" = "refs/heads/main"')
    expect(guard).toContain('test "${CONFIRMATION}" = "ADOPT-BASELINE-69"')
    expect(guard).toContain('ADOPT-BASELINE-69')
  })

  it('pins the checkout to expected_main_sha with full history (fetch-depth: 0)', () => {
    const checkout = stepBlock('actions/checkout@v4')
    expect(checkout).not.toBe('')
    expect(checkout).toContain('ref: ${{ inputs.expected_main_sha }}')
    expect(checkout).toMatch(/^\s*fetch-depth:\s*0\s*$/m)
  })

  it('maps dispatch expressions to step env and never interpolates them inside run: scripts', () => {
    const scripts = runScripts(yaml)
    expect(scripts.length).toBeGreaterThanOrEqual(3)
    for (const script of scripts) {
      expect(script).not.toContain('${{')
    }
    expect(yaml).not.toContain('test "${{ github.ref }}"')
    expect(yaml).not.toContain('test "${{ inputs.confirmation }}"')
    expect(yaml).not.toContain('test "$(git rev-parse HEAD)" = "${{ inputs.expected_main_sha }}"')
    expect(yaml).not.toContain('git merge-base --is-ancestor "${{ inputs.expected_main_sha }}"')
  })

  it('verifies the pinned checkout with env-backed values and leaves manifest-baseline ancestry to the CLI', () => {
    const verify = stepBlock('Verify pinned checkout')
    expect(verify).not.toBe('')
    const verifyName = verify.split('\n')[0] ?? ''
    expect(verifyName).not.toMatch(/ancestry/i)
    expect(verifyName).not.toMatch(/baseline/i)
    expect(verify).toContain('EXPECTED_MAIN_SHA: ${{ inputs.expected_main_sha }}')
    expect(verify).toContain('test "$(git rev-parse HEAD)" = "${EXPECTED_MAIN_SHA}"')
    expect(verify).toContain('git fetch --no-tags origin main')
    expect(verify).toContain('git merge-base --is-ancestor "${EXPECTED_MAIN_SHA}" origin/main')
  })

  it('serializes adoption in the migration concurrency group without cancelling', () => {
    expect(yaml).toContain('group: seo-factory-migrations-${{ github.ref }}')
    expect(yaml).toContain('cancel-in-progress: false')
  })

  it('grants contents: read only', () => {
    expect(yaml).toContain('permissions:\n  contents: read')
  })

  it('never echoes the token', () => {
    expect(yaml).not.toMatch(/echo\s+.*SUPABASE_ACCESS_TOKEN/i)
  })

  it('invokes the thin adoption CLI without apply-migrations or inline SQL file lists', () => {
    expect(yaml).toContain('node scripts/adopt-migration-ledger.mjs')
    expect(yaml).not.toContain('scripts/apply-migrations.mjs')
    expect(yaml.match(/supabase\/migrations\/[a-z0-9_]+\.sql/gi)).toBeNull()
  })
})
