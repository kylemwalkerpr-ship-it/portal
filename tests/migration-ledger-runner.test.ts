/**
 * Task 4.3 — ledger-aware runner core (plan T3–T8, T15 runner extension, T17).
 *
 * The production module is ESM and is exercised through child subprocesses
 * (same pattern as tests/migration-ledger-adoption.test.ts) so what CI runs is
 * what is tested. Every request the runner sends goes through the injected
 * `runSql`; apply bodies are identified by their `BEGIN;` prefix.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const RUNNER = join(ROOT, 'scripts', 'migration-ledger-runner.mjs')
const ORDER = join(ROOT, 'scripts', 'migration-order.mjs')
const MANIFEST = join(ROOT, 'supabase', 'migration-baseline.json')

const manifestJson = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
  generatedFrom: { gitSha: string }
  files: Array<{ filename: string; sha256: string }>
}
const BASELINE_ORDER = manifestJson.files.map((file) => file.filename)
const GIT_SHA = 'a'.repeat(40)
const PENDING = '20270101120000_new_thing.sql'
const PENDING_SQL = 'CREATE TABLE IF NOT EXISTS ledger_probe (id integer);\n'
const RECORDED = '20270101120000_already_recorded.sql'
const RECORDED_SQL = 'CREATE TABLE IF NOT EXISTS recorded_probe (id integer);\n'
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const FIXTURES = `
  function makeFakes(scenario) {
    const manifest = JSON.parse(readFileSync(${JSON.stringify(MANIFEST)}, 'utf8'))
    const requests = []
    const sleeps = []
    const logs = []
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key)
    let ledgerExists = !scenario.ledgerAbsent
    let ledgerRows = manifest.files.map((f) => ({
      filename: f.filename,
      sha256: f.sha256,
      applied_by: 'adoption-baseline',
      source_git_sha: manifest.generatedFrom.gitSha,
    }))
    if (scenario.missingBaselineRows) {
      ledgerRows = ledgerRows.slice(0, ledgerRows.length - scenario.missingBaselineRows)
    }
    if (scenario.ledgerRowOverrides) {
      ledgerRows = ledgerRows.map((row) => {
        const override = scenario.ledgerRowOverrides[row.filename]
        return override ? { ...row, ...override } : row
      })
    }
    if (scenario.extraLedgerRows) ledgerRows = [...ledgerRows, ...scenario.extraLedgerRows]
    let nativeReads = 0
    let applyCalls = 0
    let appliedOnce = false
    let extraRowsAdded = false
    const role = scenario.role ?? { current_user: 'postgres', session_user: 'postgres', role: null }
    const native = scenario.native ?? []
    const readFileFn = (p, ...args) => {
      const name = String(p).split('/').pop()
      if ((scenario.missingFiles ?? []).includes(name)) {
        const err = new Error('ENOENT: no such file or directory, open ' + p)
        err.code = 'ENOENT'
        throw err
      }
      if (appliedOnce && hasOwn(scenario.contentsAfter, name)) return Buffer.from(scenario.contentsAfter[name])
      if (hasOwn(scenario.contents, name)) return Buffer.from(scenario.contents[name])
      return readFileSync(p, ...args)
    }
    const commitRow = (body) => {
      const match = body.match(/VALUES \\('([^']+)', '([0-9a-f]{64})', '([0-9a-f]{40})', 'ci-runner'\\);/)
      if (!match) throw new Error('unparseable apply body')
      if (!extraRowsAdded && scenario.extraLedgerRowsAfterApply) {
        ledgerRows = [...ledgerRows, ...scenario.extraLedgerRowsAfterApply]
        extraRowsAdded = true
      }
      if (!ledgerRows.some((row) => row.filename === match[1])) {
        ledgerRows = [
          ...ledgerRows,
          { filename: match[1], sha256: match[2], applied_by: 'ci-runner', source_git_sha: match[3] },
        ]
      }
    }
    const handleApply = (body) => {
      applyCalls += 1
      appliedOnce = true
      const spec = (scenario.applyScript ?? [])[applyCalls - 1] ?? { status: 200 }
      if (spec.throwError) throw new Error('socket hang up')
      if (spec.commitOnThrow) {
        commitRow(body)
        throw new Error('socket hang up')
      }
      if (spec.dropRow) return { ok: true, status: 200, body: '[]' }
      const status = spec.status ?? 200
      if (status >= 200 && status < 300) {
        commitRow(body)
        return { ok: true, status, body: '[]' }
      }
      return { ok: false, status, body: 'upstream error' }
    }
    const jsonResult = (rows) => ({ ok: true, status: 200, body: JSON.stringify(rows) })
    const runSql = async (sql) => {
      requests.push(sql)
      if (sql.includes('current_user')) return jsonResult([role])
      if (sql.includes('to_regclass')) return jsonResult([{ ledger_reg: ledgerExists ? 'supabase_migrations.yousafe_migration_ledger' : null }])
      if (sql.includes('schema_migrations')) {
        nativeReads += 1
        return jsonResult(nativeReads === 1 ? native : (scenario.nativeAfter ?? native))
      }
      if (sql.includes('WHERE filename =')) {
        const match = sql.match(/WHERE filename = '([^']+)'/)
        if (scenario.freshRows && hasOwn(scenario.freshRows, match[1])) return jsonResult([scenario.freshRows[match[1]]])
        return jsonResult(ledgerRows.filter((row) => row.filename === match[1]))
      }
      if (sql.includes('FROM supabase_migrations.yousafe_migration_ledger') && sql.includes('ORDER BY filename')) return jsonResult(ledgerRows)
      if (sql.startsWith('BEGIN;')) return handleApply(sql)
      throw new Error('unexpected request: ' + sql)
    }
    return { readFileFn, runSql, requests, sleeps, logs }
  }
`

function runRunner(scenario: Record<string, unknown>): {
  result: any
  requests: string[]
  sleeps: number[]
  logs: string[]
} {
  const code = `
    const { runMigrationLedger } = await import(${JSON.stringify(RUNNER)})
    const { migrationOrder, MIGRATIONS_DIR } = await import(${JSON.stringify(ORDER)})
    const { readFileSync } = await import('node:fs')
    ${FIXTURES}
    const scenario = ${JSON.stringify(scenario)}
    const { readFileFn, runSql, requests, sleeps, logs } = makeFakes(scenario)
    const result = await runMigrationLedger({
      runSql,
      readFileFn,
      order: scenario.order ?? migrationOrder(),
      sourceGitSha: scenario.sourceGitSha ?? 'a'.repeat(40),
      sleepFn: async (ms) => { sleeps.push(ms) },
      log: (line) => { logs.push(line) },
      mode: scenario.mode ?? 'apply',
      manifestPath: ${JSON.stringify(MANIFEST)},
      migrationsDir: MIGRATIONS_DIR,
    })
    console.log(JSON.stringify({ result, requests, sleeps, logs }))
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}

function evalRunner<T>(body: string): T {
  const code = `
    const runner = await import(${JSON.stringify(RUNNER)})
    ${body}
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }))
}

const applyBodies = (requests: string[]) => requests.filter((sql) => sql.startsWith('BEGIN;'))

describe('ledger runner — cutover gates and classification (T3, T8)', () => {
  it('T3 skip: all 69 baseline rows recorded with equal hashes applies nothing and compares native pre/post', () => {
    const out = runRunner({})
    expect(out.result.ok).toBe(true)
    expect(out.result.status).toBe('OK')
    expect(out.result.applied).toEqual([])
    expect(out.result.skipped).toEqual([])
    expect(out.result.recovered).toEqual([])
    expect(out.result.pending).toEqual([])
    expect(out.result.summaryLine).toBe(
      `LEDGER APPLY OK: 0 applied, 69 skipped, source_git_sha=${GIT_SHA}, runtime_role_verified=true`,
    )
    expect(applyBodies(out.requests)).toHaveLength(0)
    expect(out.requests.filter((sql) => sql.includes('schema_migrations'))).toHaveLength(2)
  })

  it('T3/T17 fail closed baseline ledger hash drift with zero apply bodies', () => {
    const out = runRunner({ ledgerRowOverrides: { 'content_jobs.sql': { sha256: '0'.repeat(64) } } })
    expect(out.result.status).toBe('BLOCKED')
    expect(out.result.ok).toBe(false)
    expect(out.result.summaryLine).toContain('CUTOVER BLOCKED: baseline ledger hash mismatch for content_jobs.sql')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('T3/T17 fail closed baseline ledger provenance mismatch with zero apply bodies', () => {
    const badAppliedBy = runRunner({ ledgerRowOverrides: { 'content_jobs.sql': { applied_by: 'ci-runner' } } })
    expect(badAppliedBy.result.status).toBe('BLOCKED')
    expect(badAppliedBy.result.summaryLine).toContain(
      'CUTOVER BLOCKED: baseline ledger provenance mismatch for content_jobs.sql',
    )
    expect(applyBodies(badAppliedBy.requests)).toHaveLength(0)

    const badGitSha = runRunner({ ledgerRowOverrides: { 'content_jobs.sql': { source_git_sha: 'b'.repeat(40) } } })
    expect(badGitSha.result.status).toBe('BLOCKED')
    expect(badGitSha.result.summaryLine).toContain(
      'CUTOVER BLOCKED: baseline ledger provenance mismatch for content_jobs.sql',
    )
    expect(applyBodies(badGitSha.requests)).toHaveLength(0)
  })

  it('T3 recorded different hash discovered on the fresh per-attempt read stops without applying', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      freshRows: { [PENDING]: { filename: PENDING, sha256: '0'.repeat(64) } },
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toContain(`FAIL CLOSED: hash mismatch for ${PENDING}`)
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('T8 cutover precondition: a missing baseline row blocks with 68/69 and zero apply bodies', () => {
    const out = runRunner({ missingBaselineRows: 1 })
    expect(out.result.status).toBe('BLOCKED')
    expect(out.result.summaryLine).toContain('CUTOVER BLOCKED: baseline ledger incomplete (68/69)')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('T8 cutover precondition: an absent ledger blocks with 0/69', () => {
    const out = runRunner({ ledgerAbsent: true })
    expect(out.result.status).toBe('BLOCKED')
    expect(out.result.summaryLine).toContain('CUTOVER BLOCKED: baseline ledger incomplete (0/69)')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('orphan ledger row outside migrationOrder fails closed with zero apply bodies', () => {
    const out = runRunner({
      extraLedgerRows: [
        {
          filename: '20990101_orphan.sql',
          sha256: 'a'.repeat(64),
          applied_by: 'ci-runner',
          source_git_sha: 'b'.repeat(40),
        },
      ],
    })
    expect(out.result.status).toBe('BLOCKED')
    expect(out.result.summaryLine).toContain('FAIL CLOSED: orphan ledger row 20990101_orphan.sql')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('recorded non-baseline rows must still match disk (hash drift and missing file fail closed)', () => {
    const drift = runRunner({
      order: [...BASELINE_ORDER, RECORDED],
      contents: { [RECORDED]: RECORDED_SQL },
      extraLedgerRows: [
        { filename: RECORDED, sha256: '0'.repeat(64), applied_by: 'ci-runner', source_git_sha: 'b'.repeat(40) },
      ],
    })
    expect(drift.result.status).toBe('BLOCKED')
    expect(drift.result.summaryLine).toContain(`FAIL CLOSED: recorded file hash mismatch for ${RECORDED}`)
    expect(applyBodies(drift.requests)).toHaveLength(0)

    const missing = runRunner({
      order: [...BASELINE_ORDER, RECORDED],
      missingFiles: [RECORDED],
      extraLedgerRows: [
        {
          filename: RECORDED,
          sha256: sha256(RECORDED_SQL),
          applied_by: 'ci-runner',
          source_git_sha: 'b'.repeat(40),
        },
      ],
    })
    expect(missing.result.status).toBe('BLOCKED')
    expect(missing.result.summaryLine).toContain(`FAIL CLOSED: recorded file missing on disk ${RECORDED}`)
    expect(applyBodies(missing.requests)).toHaveLength(0)
  })

  it('previously-applied equal-hash future row inside order is accepted and counted as skipped', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, RECORDED],
      contents: { [RECORDED]: RECORDED_SQL },
      extraLedgerRows: [
        {
          filename: RECORDED,
          sha256: sha256(RECORDED_SQL),
          applied_by: 'ci-runner',
          source_git_sha: 'b'.repeat(40),
        },
      ],
    })
    expect(out.result.status).toBe('OK')
    expect(applyBodies(out.requests)).toHaveLength(0)
    expect(out.result.summaryLine).toBe(
      `LEDGER APPLY OK: 0 applied, 70 skipped, source_git_sha=${GIT_SHA}, runtime_role_verified=true`,
    )
  })
})

describe('ledger runner — atomic apply, stop-on-failure, retries (T4–T7)', () => {
  it('T3 unrecorded valid 14-digit file applies exactly once', () => {
    const out = runRunner({ order: [...BASELINE_ORDER, PENDING], contents: { [PENDING]: PENDING_SQL } })
    expect(out.result.ok).toBe(true)
    expect(out.result.status).toBe('OK')
    expect(out.result.applied).toEqual([PENDING])
    expect(out.result.recovered).toEqual([])
    expect(out.result.pending).toEqual([PENDING])
    expect(applyBodies(out.requests)).toHaveLength(1)
    expect(out.result.summaryLine).toBe(
      `LEDGER APPLY OK: 1 applied, 69 skipped, source_git_sha=${GIT_SHA}, runtime_role_verified=true`,
    )
  })

  it('T4 atomic request composition: BEGIN, verbatim bytes once, one ledger INSERT, COMMIT', () => {
    const out = runRunner({ order: [...BASELINE_ORDER, PENDING], contents: { [PENDING]: PENDING_SQL } })
    const bodies = applyBodies(out.requests)
    expect(bodies).toHaveLength(1)
    const body = bodies[0]
    const expected =
      'BEGIN;\n' +
      PENDING_SQL +
      '\nINSERT INTO supabase_migrations.yousafe_migration_ledger\n' +
      '  (filename, sha256, source_git_sha, applied_by)\n' +
      `VALUES ('${PENDING}', '${sha256(PENDING_SQL)}', '${GIT_SHA}', 'ci-runner');\n` +
      'COMMIT;'
    expect(body).toBe(expected)
    expect(body.indexOf(PENDING_SQL)).toBe('BEGIN;\n'.length)
    expect(body.split(PENDING_SQL)).toHaveLength(2)
    expect(body.match(/INSERT INTO/g) ?? []).toHaveLength(1)
    expect(body.match(/COMMIT;/g) ?? []).toHaveLength(1)
    expect(body.endsWith('COMMIT;')).toBe(true)
  })

  it('T5 stop-on-first-failure: first 400 stops and later files are never requested', () => {
    const first = '20270101120000_first_thing.sql'
    const second = '20270101130000_second_thing.sql'
    const third = '20270101140000_third_thing.sql'
    const out = runRunner({
      order: [...BASELINE_ORDER, first, second, third],
      contents: { [first]: 'SELECT 1;\n', [second]: 'SELECT 2;\n', [third]: 'SELECT 3;\n' },
      applyScript: [{ status: 400 }],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toContain(`STOPPED at ${first}`)
    expect(out.result.summaryLine).toContain('HTTP 400')
    expect(applyBodies(out.requests)).toHaveLength(1)
    expect(out.requests.some((sql) => sql.includes(second) || sql.includes(third))).toBe(false)
  })

  it('T6 transient retry: 503, 503, 200 succeeds with three attempts and 1s/2s backoff', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ status: 503 }, { status: 503 }, { status: 200 }],
    })
    expect(out.result.status).toBe('OK')
    expect(applyBodies(out.requests)).toHaveLength(3)
    expect(out.sleeps).toEqual([1000, 2000])
  })

  it('T6 thrown network error is normalized to status 0 and retried', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ throwError: true }, { status: 200 }],
    })
    expect(out.result.status).toBe('OK')
    expect(applyBodies(out.requests)).toHaveLength(2)
    expect(out.sleeps).toEqual([1000])
  })

  it('T6 permanent 400 fails immediately with one attempt and no sleeps', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ status: 400 }],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(applyBodies(out.requests)).toHaveLength(1)
    expect(out.sleeps).toEqual([])
  })

  it('T6 three transient failures stop the run after 1s/2s backoff', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ status: 503 }, { status: 503 }, { status: 503 }],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toContain('transient retries exhausted')
    expect(applyBodies(out.requests)).toHaveLength(3)
    expect(out.sleeps).toEqual([1000, 2000])
  })

  it('T7 lost-response recovery: equal-hash row seen on retry, no second SQL apply', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ commitOnThrow: true }, { status: 200 }],
    })
    expect(out.result.status).toBe('OK')
    expect(applyBodies(out.requests)).toHaveLength(1)
    expect(out.result.applied).toEqual([])
    expect(out.result.recovered).toEqual([PENDING])
    expect(out.logs).toContain(`SKIP (recorded after transient) ${PENDING}`)
    expect(out.result.summaryLine).toBe(
      `LEDGER APPLY OK: 1 applied, 69 skipped, source_git_sha=${GIT_SHA}, runtime_role_verified=true`,
    )
  })

  it('apply mode refuses a non-40-hex sourceGitSha before composing any request', () => {
    const out = runRunner({
      sourceGitSha: 'not-a-sha',
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toContain('sourceGitSha must be the 40-hex GITHUB_SHA')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })
})

describe('ledger runner — post-run verification (T3/T15/T17)', () => {
  it('post-run expected set: a successful apply whose ledger row is missing stops the run', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      applyScript: [{ dropRow: true }],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine.startsWith('POST-RUN VERIFY FAILED')).toBe(true)
    expect(out.result.summaryLine).toContain(`ledger row missing for ${PENDING}`)
  })

  it('post-run expected set: ledger hash must equal current disk bytes', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      contentsAfter: { [PENDING]: 'CREATE TABLE changed_after_apply (id integer);\n' },
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toBe(`POST-RUN VERIFY FAILED: ledger hash != current disk bytes for ${PENDING}`)
  })

  it('post-run native schema_migrations must be unchanged', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      nativeAfter: [{ version: '20260101000000', name: 'native_change' }],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toBe('POST-RUN VERIFY FAILED: native schema_migrations changed')
  })

  it('post-run no unexpected ledger rows outside order', () => {
    const out = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      extraLedgerRowsAfterApply: [
        {
          filename: '20990101_orphan_after.sql',
          sha256: 'a'.repeat(64),
          applied_by: 'ci-runner',
          source_git_sha: 'b'.repeat(40),
        },
      ],
    })
    expect(out.result.status).toBe('STOPPED')
    expect(out.result.summaryLine).toContain('POST-RUN VERIFY FAILED: unexpected ledger row 20990101_orphan_after.sql')
  })

  it('T15 every schema_migrations request is the canonical SELECT', () => {
    const out = runRunner({ order: [...BASELINE_ORDER, PENDING], contents: { [PENDING]: PENDING_SQL } })
    const nativeStrings = out.requests.filter((sql) => sql.includes('schema_migrations'))
    expect(nativeStrings.length).toBeGreaterThan(0)
    for (const sql of nativeStrings) {
      expect(sql).toBe('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version')
    }
    const writes = out.requests.filter(
      (sql) => sql.includes('schema_migrations') && /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(sql),
    )
    expect(writes).toEqual([])
    expect(applyBodies(out.requests)).toHaveLength(1)
  })
})

describe('ledger runner — naming, modes, interface (T3/T17)', () => {
  it('T17 INV-13 role gate fails closed before any write and runs even with nothing pending', () => {
    const badAuthenticated = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      role: { current_user: 'authenticated', session_user: 'authenticated', role: 'authenticated' },
    })
    expect(badAuthenticated.result.status).toBe('BLOCKED')
    expect(badAuthenticated.result.summaryLine).toContain('runtime role not postgres')
    expect(applyBodies(badAuthenticated.requests)).toHaveLength(0)

    const badSession = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      role: { current_user: 'postgres', session_user: 'supabase_admin', role: null },
    })
    expect(badSession.result.status).toBe('BLOCKED')
    expect(badSession.result.summaryLine).toContain('runtime role not postgres')
    expect(applyBodies(badSession.requests)).toHaveLength(0)

    const noPending = runRunner({ role: { current_user: 'postgres', session_user: 'postgres', role: 'none' } })
    expect(noPending.result.status).toBe('OK')
    expect(noPending.requests.some((sql) => sql.includes('current_user'))).toBe(true)
    expect(noPending.logs).toContain(
      'RUNTIME ROLE VERIFIED: current_user=postgres, session_user=postgres, role=none',
    )
    expect(applyBodies(noPending.requests)).toHaveLength(0)
  })

  it('new 8-digit names reject with REJECT_NEW_LEGACY_NAME before any write', () => {
    const out = runRunner({ order: [...BASELINE_ORDER, '20270101_brand_new_thing.sql'] })
    expect(out.result.status).toBe('BLOCKED')
    expect(out.result.summaryLine).toContain('REJECT_NEW_LEGACY_NAME')
    expect(out.result.summaryLine).toContain('20270101_brand_new_thing.sql')
    expect(applyBodies(out.requests)).toHaveLength(0)
  })

  it('invalid 14-digit future names reject with REJECT_FUTURE_NAME before any write', () => {
    const badCalendar = runRunner({ order: [...BASELINE_ORDER, '20270230120000_new_thing.sql'] })
    expect(badCalendar.result.status).toBe('BLOCKED')
    expect(badCalendar.result.summaryLine).toContain('REJECT_FUTURE_NAME')
    expect(applyBodies(badCalendar.requests)).toHaveLength(0)

    const badCase = runRunner({ order: [...BASELINE_ORDER, '20270101120000_New_Thing.sql'] })
    expect(badCase.result.status).toBe('BLOCKED')
    expect(badCase.result.summaryLine).toContain('REJECT_FUTURE_NAME')
    expect(applyBodies(badCase.requests)).toHaveLength(0)
  })

  it('dry-run and preflight are read-only with exact summaries', () => {
    const dryRun = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      mode: 'dry-run',
    })
    expect(dryRun.result.status).toBe('DRY_RUN')
    expect(dryRun.result.summaryLine).toBe('LEDGER DRY RUN OK: 69 skipped, 1 pending')
    expect(applyBodies(dryRun.requests)).toHaveLength(0)
    expect(dryRun.logs).toContain(`WOULD APPLY ${PENDING}`)

    const preflight = runRunner({
      order: [...BASELINE_ORDER, PENDING],
      contents: { [PENDING]: PENDING_SQL },
      mode: 'preflight',
    })
    expect(preflight.result.status).toBe('PREFLIGHT')
    expect(preflight.result.summaryLine).toBe('LEDGER PREFLIGHT OK: 69/69 baseline recorded, 1 pending')
    expect(applyBodies(preflight.requests)).toHaveLength(0)

    const blocked = runRunner({ mode: 'preflight', missingBaselineRows: 1 })
    expect(blocked.result.status).toBe('BLOCKED')
    expect(applyBodies(blocked.requests)).toHaveLength(0)
  })

  it('exports the locked mode list and refuses invalid runner inputs', () => {
    const out = evalRunner<{ modes: string[]; errors: string[] }>(`
      const errors = []
      const attempt = async (fn) => {
        try { await fn(); errors.push('NO ERROR') } catch (err) { errors.push(String((err && err.message) || err)) }
      }
      await attempt(() => runner.runMigrationLedger({ runSql: async () => ({ ok: true, status: 200, body: '[]' }), order: [], mode: 'bogus' }))
      await attempt(() => runner.runMigrationLedger({ runSql: async () => ({ ok: true, status: 200, body: '[]' }), order: null }))
      await attempt(() => runner.composeApplyRequest({ filename: '20270101_bad.sql', sql: 'SELECT 1;', sha256: 'a'.repeat(64), sourceGitSha: 'a'.repeat(40) }))
      await attempt(() => runner.composeApplyRequest({ filename: '20270101120000_ok.sql', sql: 'SELECT 1;', sha256: 'nope', sourceGitSha: 'a'.repeat(40) }))
      await attempt(() => runner.composeApplyRequest({ filename: '20270101120000_ok.sql', sql: 'SELECT 1;', sha256: 'a'.repeat(64), sourceGitSha: 'nope' }))
      console.log(JSON.stringify({ modes: runner.RUN_MODES, errors }))
    `)
    expect(out.modes).toEqual(['preflight', 'dry-run', 'apply'])
    expect(out.errors).toEqual([
      'runner: unknown mode bogus',
      'runner: order is required',
      'runner: refusing to compose request for 20270101_bad.sql',
      'runner: invalid sha256 for 20270101120000_ok.sql',
      'runner: invalid sourceGitSha',
    ])
  })
})
