/**
 * run-migration.mjs
 *
 * Applies a SQL migration file to Supabase using the JS client.
 * Usage: node -r dotenv/config scripts/run-migration.mjs <path-to-sql>
 *
 * Example:
 *   node -r dotenv/config scripts/run-migration.mjs supabase/gig_slug_backfill.sql
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

async function main() {
  const sqlPath = process.argv[2]
  if (!sqlPath) {
    console.error('Usage: node -r dotenv/config scripts/run-migration.mjs <path-to-sql>')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing Supabase credentials. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlPath, 'utf8')

  // We need to run raw SQL. Use Supabase's rpc() to call a function that
  // executes the migration, or query the `exec` function if available.
  // Since Supabase JS client doesn't support raw SQL directly, we use
  // the /rest/v1/rpc/ path with the pg_exec function or use the management API.
  //
  // The simplest approach is to use the Supabase Management API or to
  // split the SQL into statements and run each via the REST API.
  // However, a more practical approach for local dev is to print the SQL
  // for manual execution, OR to use the `psql` equivalent via a web request.
  //
  // Let's try executing via Supabase's SQL endpoint:
  console.log(`Applying migration: ${sqlPath}`)
  console.log('')

  // Use the Supabase management endpoint for raw SQL
  // POST /rest/v1/rpc/pg_exec is not standard. Instead, we'll use
  // a custom function or the database health check approach.
  //
  // The most reliable approach: use fetch to the Supabase REST API
  // with an `exec_sql` RPC function (if it exists), or use the
  // management API key approach.
  //
  // For this migration, let's try the simplest approach:
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Try to create a pg_exec function first (idempotent)
  const { error: fnError } = await db.rpc('exec_sql', { query: sql })

  if (fnError) {
    // The exec_sql function might not exist. Let's try to create it first.
    console.log('exec_sql RPC not found. Attempting to create it...')

    // Create the function via a stored procedure if it doesn't exist
    const createFnSql = `
      create or replace function exec_sql(query text)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        execute query;
      end;
      $$;
    `

    // Execute via a raw POST to the rest endpoint
    // This requires the `pg_exec` function to be defined as a SQL endpoint.
    // Instead, let's print instructions and try an alternative approach.
    console.log('⚠ Cannot execute raw SQL via the client without the exec_sql RPC function.')
    console.log('')
    console.log('Please run this SQL in the Supabase Dashboard SQL Editor:')
    console.log('')
    console.log(sql)
    console.log('')
    console.log('After that, re-run the backfill script:')
    console.log('  node -r dotenv/config scripts/backfill-gig-slugs.mjs')
    process.exit(0)
  }

  console.log('Migration applied successfully!')
}

main().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
