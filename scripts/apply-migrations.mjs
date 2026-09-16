#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { migrationOrder } from './migration-order.mjs'
import { createManagementSqlClient } from './supabase-management-sql.mjs'
import { runMigrationLedger } from './migration-ledger-runner.mjs'

const MODE = process.argv.includes('--preflight')
  ? 'preflight'
  : process.argv.includes('--dry-run')
    ? 'dry-run'
    : 'apply'
const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const GITHUB_SHA = process.env.GITHUB_SHA

if (MODE === 'apply' && process.env.GITHUB_ACTIONS !== 'true') {
  console.error('Refusing local apply: the production apply path requires the GitHub Actions workflow context. Use --preflight or --dry-run locally.')
  process.exit(1)
}
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN.')
  process.exit(1)
}
if (MODE === 'apply' && !/^[0-9a-f]{40}$/.test(GITHUB_SHA ?? '')) {
  console.error('Missing or invalid GITHUB_SHA for apply mode.')
  process.exit(1)
}

const client = createManagementSqlClient({ projectRef: REF, accessToken: TOKEN })
const result = await runMigrationLedger({
  runSql: client.runSql,
  readFileFn: (path) => readFileSync(path),
  order: migrationOrder(),
  sourceGitSha: GITHUB_SHA ?? null,
  log: (line) => console.log(line),
  mode: MODE,
})
process.exit(result.ok ? 0 : 1)
