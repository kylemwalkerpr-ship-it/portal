#!/usr/bin/env node
/**
 * Apply Content Studio Supabase migrations (content_jobs + gsc_tokens).
 *
 * Usage (one of):
 *   DATABASE_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \
 *     node scripts/apply-content-studio-migrations.mjs
 *
 *   SUPABASE_DB_PASSWORD='...' node scripts/apply-content-studio-migrations.mjs
 *     (uses project ref krggzrxxnqfsbbklatxl by default)
 *
 *   SUPABASE_ACCESS_TOKEN='sbp_...' node scripts/apply-content-studio-migrations.mjs
 *     (Management API — requires a valid personal access token with project access)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'

const sql =
  readFileSync(join(root, 'supabase/migrations/content_jobs.sql'), 'utf8') +
  '\n\n' +
  readFileSync(join(root, 'supabase/migrations/gsc_tokens.sql'), 'utf8') +
  '\n\n' +
  readFileSync(join(root, 'supabase/migrations/seo_factory_columns.sql'), 'utf8')

async function viaManagementApi(token) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`)
  console.log('Migrations applied via Management API.')
  console.log(text.slice(0, 500))
}

async function viaPostgres(connectionString) {
  let pg
  try {
    pg = await import('pg')
  } catch {
    throw new Error('Install pg first: npm i -D pg')
  }
  const client = new pg.default.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await client.query(sql)
    console.log('Migrations applied via Postgres connection.')
  } finally {
    await client.end()
  }
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (accessToken) {
    await viaManagementApi(accessToken)
    return
  }

  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!dbUrl && process.env.SUPABASE_DB_PASSWORD) {
    const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)
    dbUrl = `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
  }
  if (dbUrl) {
    await viaPostgres(dbUrl)
    return
  }

  console.error(`No credentials for migration apply.

Option A — SQL Editor (fastest):
  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new
  Paste supabase/migrations/content_jobs.sql then gsc_tokens.sql

Option B — Management API:
  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-content-studio-migrations.mjs

Option C — Direct Postgres:
  DATABASE_URL='postgresql://...' node scripts/apply-content-studio-migrations.mjs
  # or
  SUPABASE_DB_PASSWORD='...' node scripts/apply-content-studio-migrations.mjs
`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
