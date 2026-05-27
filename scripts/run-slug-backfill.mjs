/**
 * run-slug-backfill.mjs
 *
 * Combined runner: applies the SQL migration if needed, then runs the
 * gig slug backfill against Supabase production/staging.
 *
 * Usage:
 *   node -r dotenv/config scripts/run-slug-backfill.mjs
 *
 * Expects in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import * as crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env.local so Supabase creds are available
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
  console.log(`Loaded ${envPath}`)
}

// ────────────────────────────────────────────────────────────────────────────
// Inlined buildSlug — matches lib/fiverr.ts exactly
// ────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'by', 'with', 'is', 'are', 'be', 'was', 'were',
  'i', 'you', 'we', 'my', 'your', 'our',
  'will', 'can', 'do', 'help', 'get',
])

function buildSlug(input) {
  const normalised = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''"]/g, '')

  const tokens = normalised
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))

  let slug = tokens.join('-')
  if (slug.length > 70) {
    const trimmed = slug.slice(0, 70)
    const cut = trimmed.lastIndexOf('-')
    slug = cut > 30 ? trimmed.slice(0, cut) : trimmed
  }
  slug = slug.replace(/^-+|-+$/g, '')
  return slug || crypto.randomUUID()
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function tableExists(db, tableName) {
  try {
    const { data, error } = await db
      .from(tableName)
      .select('id')
      .limit(1)
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) return false
    if (error) {
      console.warn(`Warning checking table ${tableName}: ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(`Warning checking table ${tableName}: ${err.message}`)
    return false
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing Supabase credentials.')
    console.error('Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  // dotenv/config loads variables but doesn't set NODE_ENV properly
  // for Next.js; we just need the raw URL and key at this point.
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Connected to Supabase.\n')

  // ── Step 1: Apply migration if needed ──────────────────────────────
  console.log('── Step 1: Check if migration is needed ─────────────────')
  const migrationNeeded = !(await tableExists(db, 'gig_slug_redirects'))
  if (migrationNeeded) {
    console.log('gig_slug_redirects table does not exist.')
    console.log('')
    console.log('⚠  Please run the following SQL in your Supabase Dashboard SQL Editor:')
    console.log('   (Or use psql: psql \`$DATABASE_URL\` -f supabase/gig_slug_backfill.sql)')
    console.log('')
    const sql = fs.readFileSync('supabase/gig_slug_backfill.sql', 'utf8')
    // Print the SQL with each line prefixed so it stands out
    const lines = sql.split('\n')
    for (const line of lines) {
      console.log(`  ${line}`)
    }
    console.log('')
    console.log('After applying the migration, re-run this script.')
    process.exit(0)
  } else {
    console.log('gig_slug_redirects table already exists. Proceeding with backfill.\n')
  }

  // ── Step 2: Fetch all gigs ────────────────────────────────────────
  console.log('── Step 2: Fetch all gigs ──────────────────────────────')
  const { data: gigs, error } = await db
    .from('gigs')
    .select('id, title, slug')
    .neq('status', 'deleted')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch gigs:', error.message)
    process.exit(1)
  }
  console.log(`Found ${gigs.length} gigs to process.\n`)

  // ── Step 3: Generate clean slugs ──────────────────────────────────
  console.log('── Step 3: Generate clean slugs ────────────────────────')
  const updates = []
  const slugCounts = new Map()

  for (const gig of gigs) {
    const clean = buildSlug(gig.title || '')
    slugCounts.set(clean, (slugCounts.get(clean) || 0) + 1)
    updates.push({ ...gig, cleanSlug: clean })
  }

  const usedSlugs = new Map()
  const assigned = []

  for (const gig of updates) {
    const base = gig.cleanSlug
    const alreadyUsed = usedSlugs.get(base) || 0

    let finalSlug
    if (alreadyUsed === 0) {
      finalSlug = base
    } else {
      finalSlug = `${base}-${alreadyUsed + 1}`
    }
    usedSlugs.set(base, alreadyUsed + 1)
    assigned.push({ ...gig, finalSlug })
  }

  // ── Step 4: Apply updates ─────────────────────────────────────────
  console.log('── Step 4: Apply updates ───────────────────────────────')
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const gig of assigned) {
    if (gig.slug === gig.finalSlug) {
      skipped++
      continue
    }

    console.log(`  ${gig.id.slice(0, 8)}… "${gig.title?.slice(0, 50)}"`)
    console.log(`    ${gig.slug}  →  ${gig.finalSlug}`)

    const { error: updateError } = await db
      .from('gigs')
      .update({ slug: gig.finalSlug, updated_at: new Date().toISOString() })
      .eq('id', gig.id)

    if (updateError) {
      console.error(`    ✗ Update failed: ${updateError.message}`)
      errors++
      continue
    }

    if (gig.slug && gig.slug !== gig.finalSlug) {
      const { error: redirectError } = await db
        .from('gig_slug_redirects')
        .upsert(
          { gig_id: gig.id, old_slug: gig.slug, new_slug: gig.finalSlug },
          { onConflict: 'gig_id,old_slug', ignoreDuplicates: true },
        )
      if (redirectError) {
        console.error(`    ⚠ Redirect record failed: ${redirectError.message}`)
      }
    }
    updated++
  }

  console.log('\n── Summary ──────────────────────────────────────────────')
  console.log(`  Total gigs:        ${gigs.length}`)
  console.log(`  Updated:           ${updated}`)
  console.log(`  Skipped (clean):   ${skipped}`)
  console.log(`  Errors:            ${errors}`)

  if (updated > 0) {
    console.log('\n✅ Slug backfill complete.')
    console.log('Old slugs are tracked in gig_slug_redirects for 301 redirects.')
  } else {
    console.log('\n✅ No slugs needed updating — all gigs already have clean slugs.')
  }

  process.exit(errors > 0 ? 1 : 0)
}

main()
