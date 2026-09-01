#!/usr/bin/env node
/**
 * Apply every Supabase migration in dependency order via the Management API.
 *
 * Order comes from scripts/migration-order.mjs — the single source of truth —
 * so a new migration is picked up automatically instead of having to be added
 * to a hardcoded list that someone will forget.
 *
 * Each file is sent as its own request. The previous approach concatenated all
 * of them into one query, so a failure reported a single error with no way to
 * tell which of 47 files caused it.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... [SUPABASE_PROJECT_REF=...] \
 *     node scripts/apply-migrations.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrationOrder, MIGRATIONS_DIR } from './migration-order.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!TOKEN && !DRY_RUN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN (or pass --dry-run).')
  process.exit(1)
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  return { ok: res.ok, status: res.status, body: await res.text() }
}

const order = migrationOrder()
console.log(`Applying ${order.length} migrations to ${REF}${DRY_RUN ? ' (dry run)' : ''}\n`)

const failures = []
for (const file of order) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  if (DRY_RUN) {
    console.log(`  ${file.padEnd(48)} SKIP (dry run)`)
    continue
  }
  let attempt = 0
  let result
  // Transient 5xx / network blips should not fail an otherwise clean apply.
  while (attempt < 3) {
    attempt += 1
    try {
      result = await runSql(sql)
    } catch (err) {
      result = { ok: false, status: 0, body: String(err) }
    }
    if (result.ok || (result.status && result.status < 500)) break
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
  if (result.ok) {
    console.log(`  ${file.padEnd(48)} OK`)
  } else {
    console.log(`  ${file.padEnd(48)} HTTP ${result.status}`)
    console.log(`      ${result.body.slice(0, 400)}`)
    failures.push(file)
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error file=supabase/migrations/${file}::Migration failed (HTTP ${result.status})`)
    }
  }
}

console.log()
if (failures.length) {
  console.error(`Failed (${failures.length}): ${failures.join(', ')}`)
  process.exit(1)
}
console.log(DRY_RUN ? 'Dry run complete — order resolved cleanly.' : 'All migrations applied successfully.')
