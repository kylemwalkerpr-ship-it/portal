#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MANIFEST_PATH,
  loadManifest,
  validateManifest,
  validateMigrationSet,
  sha256Hex,
  FUTURE_MIGRATION_RE,
  LEGACY_TIMESTAMPED_RE,
} from './migration-ledger-policy.mjs'
import { MIGRATIONS_DIR } from './migration-order.mjs'
import {
  runQueryWithRetry,
  classifyResult,
  verifyPostgresRuntimeRole,
  readNativeMigrationHistory,
  readLedgerRows,
} from './supabase-management-sql.mjs'

const truncate = (body) => String(body ?? '').slice(0, 400)
const GIT_SHA_RE = /^[0-9a-f]{40}$/

export const RUN_MODES = ['preflight', 'dry-run', 'apply']

export function composeApplyRequest({ filename, sql, sha256, sourceGitSha }) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename)) throw new Error(`runner: refusing to compose request for ${filename}`)
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`runner: invalid sha256 for ${filename}`)
  if (!GIT_SHA_RE.test(sourceGitSha)) throw new Error('runner: invalid sourceGitSha')
  return [
    'BEGIN;',
    sql,
    'INSERT INTO supabase_migrations.yousafe_migration_ledger',
    '  (filename, sha256, source_git_sha, applied_by)',
    `VALUES ('${filename}', '${sha256}', '${sourceGitSha}', 'ci-runner');`,
    'COMMIT;',
  ].join('\n')
}

export async function runMigrationLedger({
  runSql,
  readFileFn = (p) => readFileSync(p),
  order,
  sourceGitSha,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
  mode = 'apply',
  manifestPath = MANIFEST_PATH,
  migrationsDir = MIGRATIONS_DIR,
  maxAttempts = 3,
  backoffMs = 1000,
}) {
  if (!RUN_MODES.includes(mode)) throw new Error(`runner: unknown mode ${mode}`)
  if (!Array.isArray(order)) throw new Error('runner: order is required')
  const client = {
    runSql,
    query: (sql) => runQueryWithRetry(sql, { runSql, sleepFn, maxAttempts, backoffMs }),
  }
  const blocked = (message, violations = []) => {
    log(message)
    return { ok: false, status: 'BLOCKED', applied: [], skipped: [], recovered: [], pending: [], summaryLine: message, violations }
  }
  const stopped = (message) => {
    log(message)
    return { ok: false, status: 'STOPPED', applied: [], skipped: [], recovered: [], pending: [], summaryLine: message, violations: [] }
  }

  const manifest = loadManifest(manifestPath, { readFile: readFileFn })
  // Both gates are evaluated before failing closed so an unrecorded 8-digit name
  // reports its exact naming rule (REJECT_NEW_LEGACY_NAME) rather than only the
  // manifest-order symptom it also causes.
  const manifestCheck = validateManifest(manifest, { order, dir: migrationsDir, readFile: readFileFn })
  const namingCheck = validateMigrationSet({ order, manifest })
  if (!manifestCheck.ok || !namingCheck.ok) {
    const violations = [...manifestCheck.violations, ...namingCheck.violations]
    return blocked(`FAIL CLOSED: ${violations.map((v) => `${v.rule} ${v.filename ?? ''}`).join('; ')}`, violations)
  }

  const ledger = await readLedgerRows(client)
  if (!ledger.exists) return blocked('CUTOVER BLOCKED: baseline ledger incomplete (0/69)')
  const byName = new Map(ledger.rows.map((row) => [row.filename, row]))
  let matched = 0
  for (const file of manifest.files) {
    const row = byName.get(file.filename)
    if (!row) continue
    if (row.sha256 !== file.sha256) {
      return blocked(`CUTOVER BLOCKED: baseline ledger hash mismatch for ${file.filename}`)
    }
    // Baseline rows additionally require manifest equality (above) and adoption provenance.
    if (row.applied_by !== 'adoption-baseline' || row.source_git_sha !== manifest.generatedFrom.gitSha) {
      return blocked(`CUTOVER BLOCKED: baseline ledger provenance mismatch for ${file.filename}`)
    }
    matched += 1
  }
  if (matched !== 69) return blocked(`CUTOVER BLOCKED: baseline ledger incomplete (${matched}/69)`)
  // Validate EVERY recorded ledger row, not only the frozen 69 baseline rows:
  // an existing 14-digit ci-runner row must still match its current disk bytes,
  // so a previously-applied migration cannot be edited after the fact.
  for (const row of ledger.rows) {
    if (!order.includes(row.filename)) return blocked(`FAIL CLOSED: orphan ledger row ${row.filename}`)
    let diskBytes
    try {
      diskBytes = readFileFn(join(migrationsDir, row.filename))
    } catch {
      return blocked(`FAIL CLOSED: recorded file missing on disk ${row.filename}`)
    }
    const diskSha = sha256Hex(diskBytes)
    if (diskSha !== row.sha256) {
      return blocked(`FAIL CLOSED: recorded file hash mismatch for ${row.filename} (ledger ${row.sha256}, disk ${diskSha})`)
    }
  }

  const nativePre = await readNativeMigrationHistory(client)
  const role = await verifyPostgresRuntimeRole(client)
  if (!role.ok) {
    return blocked(
      `FAIL CLOSED: runtime role not postgres (current_user=${role.currentUser}, session_user=${role.sessionUser}, role=${role.role}); no writes sent`,
    )
  }
  log(`RUNTIME ROLE VERIFIED: current_user=${role.currentUser}, session_user=${role.sessionUser}, role=${role.role}`)

  const pending = order.filter((file) => !byName.has(file))
  if (mode === 'preflight') {
    const summaryLine = `LEDGER PREFLIGHT OK: 69/69 baseline recorded, ${pending.length} pending`
    log(summaryLine)
    return { ok: true, status: 'PREFLIGHT', applied: [], skipped: [], recovered: [], pending, summaryLine, violations: [] }
  }
  if (mode === 'dry-run') {
    let skippedCount = 0
    for (const file of order) {
      if (byName.has(file)) {
        skippedCount += 1
        log(`SKIP (recorded) ${file}`)
      } else {
        log(`WOULD APPLY ${file}`)
      }
    }
    const summaryLine = `LEDGER DRY RUN OK: ${skippedCount} skipped, ${pending.length} pending`
    log(summaryLine)
    return { ok: true, status: 'DRY_RUN', applied: [], skipped: [], recovered: [], pending, summaryLine, violations: [] }
  }

  if (!GIT_SHA_RE.test(sourceGitSha ?? '')) return stopped('FAIL CLOSED: sourceGitSha must be the 40-hex GITHUB_SHA in apply mode')

  const applied = []
  const skipped = []
  const recovered = []
  for (const file of pending) {
    if (!FUTURE_MIGRATION_RE.test(file)) {
      if (LEGACY_TIMESTAMPED_RE.test(file)) return stopped(`FAIL CLOSED: REJECT_NEW_LEGACY_NAME ${file}`)
      return stopped(`FAIL CLOSED: REJECT_FUTURE_NAME ${file}`)
    }
    const bytes = readFileFn(join(migrationsDir, file))
    const sql = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes
    const diskSha = sha256Hex(bytes)
    let outcome = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const fresh = await client.query(
        `SELECT filename, sha256 FROM supabase_migrations.yousafe_migration_ledger WHERE filename = '${file}'`,
      )
      const existing = fresh[0]
      if (existing && existing.sha256 === diskSha) {
        outcome = attempt > 1 ? 'recovered' : 'skip'
        break
      }
      if (existing && existing.sha256 !== diskSha) {
        return stopped(`FAIL CLOSED: hash mismatch for ${file} (ledger ${existing.sha256}, disk ${diskSha})`)
      }
      const body = composeApplyRequest({ filename: file, sql, sha256: diskSha, sourceGitSha })
      let result
      try {
        result = await runSql(body)
      } catch (err) {
        // Explicit interface contract: a thrown network error is status 0 (transient),
        // never dependent on the concrete fetch wrapper swallowing it.
        result = { ok: false, status: 0, body: String(err) }
      }
      const cls = classifyResult(result)
      if (cls === 'success') {
        outcome = 'applied'
        break
      }
      if (cls === 'permanent') {
        return stopped(`STOPPED at ${file}: HTTP ${result.status} ${truncate(result.body)}`)
      }
      log(`TRANSIENT ${file}: HTTP ${result.status} (attempt ${attempt}/${maxAttempts})`)
      if (attempt < maxAttempts) await sleepFn(backoffMs * attempt)
    }
    if (outcome === null) return stopped(`STOPPED at ${file}: transient retries exhausted (${maxAttempts}/${maxAttempts})`)
    if (outcome === 'applied') {
      applied.push(file)
      log(`APPLIED ${file}`)
    } else {
      skipped.push(file)
      if (outcome === 'recovered') recovered.push(file)
      log(outcome === 'recovered' ? `SKIP (recorded after transient) ${file}` : `SKIP (recorded) ${file}`)
    }
  }

  const ledgerAfter = await readLedgerRows(client)
  if (!ledgerAfter.exists) return stopped('POST-RUN VERIFY FAILED: ledger missing after run')
  const afterByName = new Map((ledgerAfter.rows ?? []).map((row) => [row.filename, row]))
  // The successful post-run expected set is exactly the current `order`: every
  // order filename must have a ledger row whose hash equals its current disk bytes.
  for (const file of order) {
    const row = afterByName.get(file)
    let diskSha
    try {
      diskSha = sha256Hex(readFileFn(join(migrationsDir, file)))
    } catch {
      return stopped(`POST-RUN VERIFY FAILED: current file missing on disk for ${file}`)
    }
    if (!row) return stopped(`POST-RUN VERIFY FAILED: ledger row missing for ${file}`)
    if (row.sha256 !== diskSha) return stopped(`POST-RUN VERIFY FAILED: ledger hash != current disk bytes for ${file}`)
  }
  // No ledger row may exist outside `order`. Older previously-applied future rows
  // inside `order` are accepted even when this run neither applied nor recovered them.
  for (const row of ledgerAfter.rows ?? []) {
    if (!order.includes(row.filename)) return stopped(`POST-RUN VERIFY FAILED: unexpected ledger row ${row.filename}`)
  }
  const nativePost = await readNativeMigrationHistory(client)
  if (JSON.stringify(nativePre) !== JSON.stringify(nativePost)) {
    return stopped('POST-RUN VERIFY FAILED: native schema_migrations changed')
  }
  const effectiveApplied = applied.length + recovered.length
  const skippedTotal = order.length - effectiveApplied
  const summaryLine = `LEDGER APPLY OK: ${effectiveApplied} applied, ${skippedTotal} skipped, source_git_sha=${sourceGitSha}, runtime_role_verified=true`
  log(summaryLine)
  return { ok: true, status: 'OK', applied, skipped, recovered, pending, summaryLine, violations: [] }
}
