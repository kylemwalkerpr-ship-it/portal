#!/usr/bin/env node
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { composeLedgerDdl } from './migration-ledger-adoption.mjs'

const PRODUCTION_REF = 'krggzrxxnqfsbbklatxl'
const REF = process.env.SCRATCH_SUPABASE_PROJECT_REF
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const CONFIRM = process.env.T13_SCRATCH_CONFIRM
const LEDGER = 'supabase_migrations.yousafe_migration_ledger'
const FILENAME = 't13_scratch_probe.sql'
const HASH = 'a'.repeat(64)
const GIT = 'b'.repeat(40)

function refuse(message) {
  console.error(`T13 REFUSED: ${message}`)
  process.exit(1)
}

if (process.env.GITHUB_ACTIONS === 'true') refuse('this scratch integration check must never run from a workflow')
if (!REF) refuse('SCRATCH_SUPABASE_PROJECT_REF is required (a clearly non-production scratch project)')
if (REF === PRODUCTION_REF) refuse(`refusing project ref ${PRODUCTION_REF} (production); a scratch project is required`)
if (CONFIRM !== 'RUN-T13-SCRATCH') refuse('T13_SCRATCH_CONFIRM must equal RUN-T13-SCRATCH')
if (!TOKEN) refuse('SUPABASE_ACCESS_TOKEN is required (scratch project token)')

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })
const step = async (label, sql) => {
  const result = await client.runSql(sql)
  if (!result.ok) {
    console.error(`T13 FAIL at ${label}: HTTP ${result.status} ${String(result.body).slice(0, 400)}`)
    process.exit(1)
  }
  return result
}

await step('ledger DDL', composeLedgerDdl())
console.error('T13 DDL APPLIED')

await step('probe INSERT', `INSERT INTO ${LEDGER} (filename, sha256, source_git_sha, applied_by) VALUES ('${FILENAME}', '${HASH}', '${GIT}', 'ci-runner');`)
console.error('T13 INSERT OK')

const updateRejected = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'c'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (updateRejected.ok || !String(updateRejected.body).includes('55000')) {
  console.error(`T13 FAIL: UPDATE was not rejected with SQLSTATE 55000 (HTTP ${updateRejected.status})`)
  process.exit(1)
}
console.error('T13 UPDATE REJECTED 55000')

const deleteRejected = await client.runSql(`DELETE FROM ${LEDGER} WHERE filename = '${FILENAME}';`)
if (deleteRejected.ok || !String(deleteRejected.body).includes('55000')) {
  console.error(`T13 FAIL: DELETE was not rejected with SQLSTATE 55000 (HTTP ${deleteRejected.status})`)
  process.exit(1)
}
console.error('T13 DELETE REJECTED 55000')

// RED negative control, scratch only: without the trigger the same UPDATE is accepted,
// proving the 55000 above is caused by the immutability trigger, not by an unrelated error.
await step('trigger drop (scratch control)', `DROP TRIGGER IF EXISTS yousafe_migration_ledger_immutable ON ${LEDGER};`)
const control = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'d'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (!control.ok) {
  console.error(`T13 FAIL: control UPDATE was rejected without the trigger (HTTP ${control.status})`)
  process.exit(1)
}
console.error('T13 RED CONFIRMED: UPDATE accepted without trigger')

await step('trigger restore', composeLedgerDdl())
const restored = await client.runSql(`UPDATE ${LEDGER} SET sha256 = '${'e'.repeat(64)}' WHERE filename = '${FILENAME}';`)
if (restored.ok || !String(restored.body).includes('55000')) {
  console.error('T13 FAIL: restored trigger did not reject UPDATE')
  process.exit(1)
}

await step('cleanup', `DROP TABLE IF EXISTS ${LEDGER};`)
console.error('T13 SCRATCH IMMUTABILITY GATE: PASS')
