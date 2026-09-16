#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BASE_ORDER, INDEX_ORDER, MIGRATIONS_DIR, migrationOrder } from './migration-order.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const MANIFEST_VERSION = 1
export const FROZEN_BASELINE_COUNT = 69
export const MANIFEST_PATH = join(__dirname, '..', 'supabase', 'migration-baseline.json')
export const LEGACY_TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/
export const FUTURE_MIGRATION_RE = /^\d{14}_[a-z0-9_]+\.sql$/
export const ORDERING_TIMESTAMPED_RE = /^(?:\d{8}|\d{14})_[A-Za-z0-9_]+\.sql$/

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function hashFile(path, { readFile = readFileSync } = {}) {
  return sha256Hex(readFile(path))
}

export function loadManifest(path = MANIFEST_PATH, { readFile = readFileSync } = {}) {
  try {
    return JSON.parse(readFile(path, 'utf8'))
  } catch (err) {
    throw new Error(`manifest: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function isValidUtcTimestampDigits(digits) {
  if (!/^\d{14}$/.test(digits)) return false
  const year = Number(digits.slice(0, 4))
  const month = Number(digits.slice(4, 6))
  const day = Number(digits.slice(6, 8))
  const hour = Number(digits.slice(8, 10))
  const minute = Number(digits.slice(10, 12))
  const second = Number(digits.slice(12, 14))
  if (month < 1 || month > 12) return false
  if (hour > 23 || minute > 59 || second > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateManifest(manifest, { order, dir = MIGRATIONS_DIR, readFile = readFileSync, requireExactEstate = false } = {}) {
  const violations = []
  const push = (rule, filename, message) => violations.push({ rule, filename, message })
  if (!order) order = migrationOrder({ dir })

  if (manifest?.manifestVersion !== MANIFEST_VERSION) {
    push('MANIFEST_VERSION_MISMATCH', null, `manifestVersion must be ${MANIFEST_VERSION}`)
  }
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  if (files.length !== FROZEN_BASELINE_COUNT) {
    push('MANIFEST_COUNT_MISMATCH', null, `expected ${FROZEN_BASELINE_COUNT} files, found ${files.length}`)
  }
  if (manifest?.generatedFrom?.migrationCount !== files.length) {
    push('MANIFEST_COUNT_MISMATCH', null, 'generatedFrom.migrationCount does not match files length')
  }
  const names = files.map((f) => f.filename)
  const seen = new Set()
  for (const name of names) {
    if (seen.has(name)) push('MANIFEST_DUPLICATE_FILENAME', name, 'filename appears more than once')
    seen.add(name)
  }
  const manifestNames = new Set(names)
  const baselineOrder = order.filter((f) => !(/^\d{14}_/.test(f) && !manifestNames.has(f)))
  if (baselineOrder.length !== names.length || baselineOrder.some((f, i) => f !== names[i])) {
    push('MANIFEST_ORDER_MISMATCH', null, `manifest order != baseline migrationOrder() (${baselineOrder.length} baseline files)`)
  }
  if (requireExactEstate && (order.length !== FROZEN_BASELINE_COUNT || order.some((f, i) => f !== names[i]))) {
    push('MANIFEST_ESTATE_CHANGED', null, `requireExactEstate: migrationOrder() must be exactly the ${FROZEN_BASELINE_COUNT} manifest filenames (found ${order.length})`)
  }

  const base = new Set(BASE_ORDER)
  const indexes = new Set(INDEX_ORDER)
  for (const entry of files) {
    if (/^\d{14}_/.test(entry.filename)) {
      push('MANIFEST_FUTURE_FILE', entry.filename, 'future files must never appear in the manifest')
    }
    const expectedTier = base.has(entry.filename) ? 'base' : indexes.has(entry.filename) ? 'index' : 'timestamped'
    if (entry.tier !== expectedTier) push('MANIFEST_TIER_MISMATCH', entry.filename, `tier ${entry.tier} != ${expectedTier}`)
    if (entry.legacy !== true) push('MANIFEST_LEGACY_FLAG_MISMATCH', entry.filename, 'legacy must be true')
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
      push('MANIFEST_INVALID_HASH', entry.filename, 'sha256 must be 64 lowercase hex')
      continue
    }
    let disk
    try {
      disk = hashFile(join(dir, entry.filename), { readFile })
    } catch {
      push('BASELINE_FILE_MISSING', entry.filename, `missing on disk: ${entry.filename}`)
      continue
    }
    if (disk !== entry.sha256) push('BASELINE_HASH_DRIFT', entry.filename, `disk ${disk} != manifest ${entry.sha256}`)
  }
  return { ok: violations.length === 0, violations }
}

const DOLLAR_QUOTED_BODY_RE = /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g
const TOP_LEVEL_TXN_CONTROL_RE = /\b(?:BEGIN|COMMIT|ROLLBACK)\b/
const DENIED_STATEMENT_PATTERNS = [
  { re: /\bCREATE\s+INDEX\s+CONCURRENTLY\b/, label: 'CREATE INDEX CONCURRENTLY' },
  { re: /\bREINDEX\b/, label: 'REINDEX' },
  { re: /\bVACUUM\b/, label: 'VACUUM' },
  { re: /\bCREATE\s+DATABASE\b/, label: 'CREATE DATABASE' },
  { re: /\bALTER\s+SYSTEM\b/, label: 'ALTER SYSTEM' },
]

export function ddlOnly(sql) {
  return sql
    .replace(DOLLAR_QUOTED_BODY_RE, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

export function scanTransactionSafety(filename, sql) {
  const violations = []
  const stripped = ddlOnly(sql)
  const txnControl = stripped.match(TOP_LEVEL_TXN_CONTROL_RE)
  if (txnControl) {
    violations.push({
      rule: 'TOP_LEVEL_TXN_CONTROL',
      filename,
      message: `top-level ${txnControl[0]} is not allowed in migrations`,
    })
  }
  for (const { re, label } of DENIED_STATEMENT_PATTERNS) {
    if (re.test(stripped)) {
      violations.push({ rule: 'DENIED_STATEMENT', filename, message: `${label} is not allowed in migrations` })
    }
  }
  if (!/;\s*$/.test(sql)) {
    violations.push({ rule: 'MISSING_TRAILING_SEMICOLON', filename, message: 'migration must end with ;' })
  }
  return violations
}

export function validateMigrationSet({ order, manifest }) {
  const violations = []
  const baselineNames = new Set((manifest?.files ?? []).map((f) => f.filename))
  const prefixes = new Map()
  for (const filename of order) {
    if (baselineNames.has(filename)) continue
    if (LEGACY_TIMESTAMPED_RE.test(filename)) {
      violations.push({ rule: 'REJECT_NEW_LEGACY_NAME', filename, message: '8-digit name is not in the frozen baseline' })
      continue
    }
    if (/^\d{14}_/.test(filename)) {
      if (!FUTURE_MIGRATION_RE.test(filename)) {
        violations.push({ rule: 'REJECT_FUTURE_NAME', filename, message: 'must match YYYYMMDDHHmmss_lowercase.sql' })
        continue
      }
      const digits = filename.slice(0, 14)
      if (!isValidUtcTimestampDigits(digits)) {
        violations.push({ rule: 'REJECT_FUTURE_NAME', filename, message: `invalid UTC timestamp ${digits}` })
        continue
      }
      const previous = prefixes.get(digits)
      if (previous) {
        violations.push({ rule: 'REJECT_DUPLICATE_TIMESTAMP', filename, message: `timestamp ${digits} already used by ${previous}` })
      } else {
        prefixes.set(digits, filename)
      }
      continue
    }
    violations.push({ rule: 'REJECT_UNKNOWN_PINNED_NAME', filename, message: 'non-timestamped name is not a pinned baseline file' })
  }
  return { ok: violations.length === 0, violations }
}

// CLI (extended in Task 1.4 with transaction safety)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--check')) {
    console.error('usage: node scripts/migration-ledger-policy.mjs --check')
    process.exit(1)
  }
  const order = migrationOrder()
  const manifest = loadManifest()
  const manifestCheck = validateManifest(manifest, { order })
  const namingCheck = validateMigrationSet({ order, manifest })
  const safetyViolations = []
  for (const filename of order) {
    safetyViolations.push(...scanTransactionSafety(filename, readFileSync(join(MIGRATIONS_DIR, filename), 'utf8')))
  }
  const violations = [...manifestCheck.violations, ...namingCheck.violations, ...safetyViolations]
  for (const v of violations) {
    console.error(`::error file=${v.filename ?? 'supabase/migration-baseline.json'}::${v.rule} ${v.message}`)
  }
  if (!manifestCheck.ok || !namingCheck.ok || safetyViolations.length > 0) {
    console.error(`migration-ledger-policy: FAILED (${violations.length} violations)`)
    process.exit(1)
  }
  console.error(`migration-ledger-policy: manifest OK (69 files: 8 base, 57 timestamped, 4 index)`)
  console.error('migration-ledger-policy: naming policy OK')
  console.error('migration-ledger-policy: transaction safety OK')
}
