/**
 * backfill-gig-slugs.mjs
 *
 * One-time migration script that cleans up existing gig slugs by:
 *   1. Generating a clean SEO slug from each gig's title (using the same
 *      buildSlug logic from the app — inlined here to avoid TS dependency).
 *   2. Handling dedup collisions across all gigs.
 *   3. Updating the slug in the database.
 *   4. Recording old → new slug mappings in gig_slug_redirects for 301s.
 *
 * Usage:
 *   export SUPABASE_URL="https://xxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   node scripts/backfill-gig-slugs.mjs
 *
 * Or if using .env (dotenv):
 *   node -r dotenv/config scripts/backfill-gig-slugs.mjs
 *
 * This script is idempotent: re-running it only touches gigs whose current
 * slug still differs from the generated clean slug.
 */

import { createClient } from '@supabase/supabase-js'
import * as crypto from 'node:crypto'

// ────────────────────────────────────────────────────────────────────────────
// Inlined buildSlug — mirrors lib/fiverr.ts exactly so the backfill produces
// the same slugs the app would generate on new gig creation.
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
    .replace(/[̀-ͯ]/g, '')
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
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
    console.error('Usage: SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/backfill-gig-slugs.mjs')
    process.exit(1)
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Fetch all gigs
  console.log('Fetching all gigs…')
  const { data: gigs, error } = await db
    .from('gigs')
    .select('id, title, slug')
    .neq('status', 'deleted')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch gigs:', error.message)
    process.exit(1)
  }

  console.log(`Found ${gigs.length} gigs to process.`)

  // 2. Generate clean slugs and detect what needs updating
  const updates = []
  const slugCounts = new Map() // track how many gigs want a given clean slug

  // First pass: compute clean slug for every gig
  for (const gig of gigs) {
    const clean = buildSlug(gig.title || '')
    slugCounts.set(clean, (slugCounts.get(clean) || 0) + 1)
    updates.push({ ...gig, cleanSlug: clean })
  }

  // Second pass: assign dedup suffixes for collisions
  const usedSlugs = new Map() // slug → count of how many times it's been assigned
  const assigned = []

  for (const gig of updates) {
    const base = gig.cleanSlug
    const totalWanting = slugCounts.get(base)
    const alreadyUsed = usedSlugs.get(base) || 0

    let finalSlug
    if (alreadyUsed === 0) {
      // First gig gets the base slug
      finalSlug = base
    } else {
      // Subsequent gigs get -2, -3, etc.
      finalSlug = `${base}-${alreadyUsed + 1}`
    }
    usedSlugs.set(base, alreadyUsed + 1)

    assigned.push({ ...gig, finalSlug })
  }

  // 3. Process updates
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const gig of assigned) {
    if (gig.slug === gig.finalSlug) {
      skipped++
      continue // already has the clean slug — skip
    }

    console.log(`  ${gig.id.slice(0, 8)}… "${gig.title?.slice(0, 50)}"`)
    console.log(`    ${gig.slug}  →  ${gig.finalSlug}`)

    // Update the gig's slug
    const { error: updateError } = await db
      .from('gigs')
      .update({ slug: gig.finalSlug, updated_at: new Date().toISOString() })
      .eq('id', gig.id)

    if (updateError) {
      console.error(`    ✗ Update failed: ${updateError.message}`)
      errors++
      continue
    }

    // Record the redirect — skip if old slug is empty or same as new
    if (gig.slug && gig.slug !== gig.finalSlug) {
      const { error: redirectError } = await db
        .from('gig_slug_redirects')
        .upsert(
          {
            gig_id: gig.id,
            old_slug: gig.slug,
            new_slug: gig.finalSlug,
          },
          { onConflict: 'gig_id,old_slug', ignoreDuplicates: true },
        )

      if (redirectError) {
        console.error(`    ⚠ Redirect record failed: ${redirectError.message}`)
        // Non-fatal — slug was updated successfully
      }
    }

    updated++
  }

  console.log('\n── Summary ──────────────────────────────────────')
  console.log(`  Total gigs:       ${gigs.length}`)
  console.log(`  Updated:          ${updated}`)
  console.log(`  Skipped (clean):  ${skipped}`)
  console.log(`  Errors:           ${errors}`)

  if (updated > 0) {
    console.log('\n⚠  IMPORTANT: After running, apply the SQL migration and update')
    console.log('   the marketplace API to check gig_slug_redirects for 301 redirects.')
    console.log('   See: supabase/gig_slug_backfill.sql')
  }

  process.exit(errors > 0 ? 1 : 0)
}

main()
