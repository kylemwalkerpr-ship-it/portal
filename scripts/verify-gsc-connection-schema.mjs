#!/usr/bin/env node
/**
 * verify-gsc-connection-schema.mjs
 *
 * Read-only check: confirms the production gsc_connection table has the
 * service_account_key column the Service-account connect tab depends on.
 *
 * Usage: SUPABASE_ACCESS_TOKEN='sbp_...' node scripts/verify-gsc-connection-schema.mjs
 */
const ref = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const query = `select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'gsc_connection'
  order by ordinal_position`

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await res.text()
console.log('HTTP', res.status)
if (!res.ok) {
  console.error(text)
  process.exit(1)
}

const rows = JSON.parse(text)
console.log('gsc_connection columns:', rows.map((r) => r.column_name).join(', '))
const hasKey = rows.some((r) => r.column_name === 'service_account_key')
console.log(hasKey ? '✅ service_account_key present' : '❌ service_account_key MISSING')
process.exit(hasKey ? 0 : 1)
