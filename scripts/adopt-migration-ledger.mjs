#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { runAdoption, AdoptionError } from './migration-ledger-adoption.mjs'

const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const EXPECTED_MAIN_SHA = process.env.EXPECTED_MAIN_SHA
const GITHUB_REF = process.env.GITHUB_REF

function guard(condition, message) {
  if (!condition) {
    console.error(`ADOPTION REFUSED: ${message}`)
    process.exit(1)
  }
}

guard(GITHUB_REF === 'refs/heads/main', `dispatched ref is ${GITHUB_REF}; main is required`)
guard(/^[0-9a-f]{40}$/.test(EXPECTED_MAIN_SHA ?? ''), 'EXPECTED_MAIN_SHA must be 40 lowercase hex')
guard(Boolean(TOKEN), 'SUPABASE_ACCESS_TOKEN is required')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
guard(head === EXPECTED_MAIN_SHA, `checked-out HEAD ${head} != expected_main_sha ${EXPECTED_MAIN_SHA}`)

function assertAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })

try {
  const result = await runAdoption({
    client,
    expectedMainSha: EXPECTED_MAIN_SHA,
    assertAncestor,
    log: (line) => console.log(line),
  })
  console.log(result.summaryLine)
} catch (err) {
  console.error(err instanceof AdoptionError ? err.message : String(err))
  process.exit(1)
}
