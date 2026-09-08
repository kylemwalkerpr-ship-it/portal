/**
 * backfill-gig-taxonomy.mts
 *
 * Canonicalizes `gigs.category`, `gigs.subcategory`, and `gigs.jurisdiction`
 * to the taxonomy ids the marketplace filters expect, so the NULL/legacy
 * OR-filters (buildCategoryOrFilter / jurisdictionCountryOrFilter) become
 * no-ops and every surface — drawer, discovery, facets, landing rails —
 * agrees with the admin active-gig count.
 *
 * Why: gigs were written over time with legacy service labels ("USA Study",
 * "Study Permits"), display names, and NULLs. The listing APIs now OR in
 * NULL/unmapped values so nothing is invisible, but backfilling real values
 * keeps category counts meaningful and re-enables exact index usage.
 *
 * Resolution rules live in lib/gigTaxonomy.ts (single source of truth, also
 * used by the CI gate scripts/check-gig-taxonomy.mts):
 *   1. subcategory valid (id or resolvable label)  → category = its parent
 *   2. else category resolves via LEGACY_CATEGORY_MAP / taxonomy names /
 *      CATEGORY_SOURCE_LABELS / normalizeCategory
 *        → top-level id            → category = id (subcategory untouched)
 *        → subcategory id          → category = parent; fill subcategory if empty
 *      Unresolvable / conflicting  → flagged for review, NOT written
 *   3. jurisdiction: trim+lowercase if already a valid code; else fall back
 *      to the provider's profiles.country (same map the landing uses)
 *   4. NULL category AND NULL/invalid subcategory → cannot infer; review list
 *
 * Flags:
 *   --dry-run   (default) report only, no writes
 *   --apply     write the planned updates
 *   --limit=N   cap rows processed
 *   --allow-au  also write jurisdiction='au'. The DB CHECK constraint
 *               (gigs_jurisdiction_check) only allows us|uk|ca|NULL until
 *               supabase/marketplace_gig_jurisdiction_au.sql is applied —
 *               without it those writes fail. Without this flag, 'au'
 *               writes are deferred to a separate report bucket.
 *   --selftest  run the resolver against sample rows, no DB / env needed
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/backfill-gig-taxonomy.mts [--apply]
 *
 * Idempotent: re-running after --apply reports zero updates.
 * Read-only unless --apply is passed; only touches the three columns above.
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
  classifyGig,
  resolveCategoryValue,
  resolveJurisdictionValue,
  DB_WRITABLE_JX,
  VALID_JX,
  type GigRow,
} from '../lib/gigTaxonomy'

// ── Selftest (no DB) ────────────────────────────────────────────────────────

function runSelftest(): boolean {
  const cases: Array<{ row: Partial<GigRow>; country?: string | null; expect: unknown }> = [
    { row: { category: 'immigration', subcategory: 'study-permits' }, expect: { action: 'none' } },
    { row: { category: 'USA Study', subcategory: null }, expect: { action: 'update', patch: { category: 'immigration', subcategory: 'study-permits' } } },
    { row: { category: 'Study Permits', subcategory: null }, expect: { action: 'update', patch: { category: 'immigration', subcategory: 'study-permits' } } },
    { row: { category: 'Study permits', subcategory: null }, expect: { action: 'update', patch: { category: 'immigration', subcategory: 'study-permits' } } },
    { row: { category: 'Immigration consultation', subcategory: null }, expect: { action: 'update', patch: { category: 'immigration' } } },
    { row: { category: 'University Admissions', subcategory: null }, expect: { action: 'update', patch: { category: 'education', subcategory: 'university-admissions' } } },
    { row: { category: null, subcategory: 'resume-cv' }, expect: { action: 'update', patch: { category: 'career' } } },
    { row: { category: 'Visa Consulting', subcategory: null }, expect: { action: 'review', reason: 'unmapped category value "Visa Consulting"' } },
    { row: { category: null, subcategory: null }, expect: { action: 'review', reason: 'category is NULL and subcategory is unset/unresolvable' } },
    { row: { category: 'immigration', subcategory: 'resume-cv' }, expect: { action: 'review', reason: 'subcategory "resume-cv" conflicts with category "immigration"' } },
    { row: { category: 'Legal Services', subcategory: null }, expect: { action: 'update', patch: { category: 'legal' } } },
  ]
  const jxCases: Array<{ raw: string | null; country?: string | null; expect: string | null }> = [
    { raw: 'US', expect: 'us' },
    { raw: ' uk ', expect: 'uk' },
    { raw: null, country: 'United States', expect: 'us' },
    { raw: null, country: 'GB', expect: 'uk' },
    { raw: 'eu', country: 'Canada', expect: 'ca' },
    { raw: 'Mars', country: 'Mars', expect: null },
  ]
  let ok = true
  for (const c of cases) {
    const got = classifyGig({ id: 'x', slug: null, title: '', status: 'active', jurisdiction: null, provider_id: null, ...c.row } as GigRow)
    const pass = JSON.stringify(got) === JSON.stringify(c.expect)
    if (!pass) { ok = false; console.error(`FAIL ${JSON.stringify(c.row)} → ${JSON.stringify(got)} (expected ${JSON.stringify(c.expect)})`) }
  }
  for (const c of jxCases) {
    const got = resolveJurisdictionValue(c.raw, c.country)
    if (got !== c.expect) { ok = false; console.error(`FAIL jx(${c.raw}, ${c.country}) → ${got} (expected ${c.expect})`) }
  }
  // Resolver spot-checks for values the CI gate reports on.
  if (!resolveCategoryValue('study-permits')) { ok = false; console.error('FAIL resolveCategoryValue("study-permits") should resolve') }
  if (resolveCategoryValue('usa study')?.value !== 'study-permits') { ok = false; console.error('FAIL resolveCategoryValue("usa study") should hit the legacy map') }
  console.log(ok ? 'selftest: all resolver cases pass' : 'selftest: FAILURES above')
  return ok
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--selftest')) process.exit(runSelftest() ? 0 : 1)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = resolveSupabaseKey()
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  const APPLY = args.has('--apply')
  const ALLOW_AU = args.has('--allow-au')
  const writableJx = ALLOW_AU ? VALID_JX : DB_WRITABLE_JX
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Fetch all gigs (paginated). Includes every status — taxonomy hygiene is
  // status-independent, and drafts get the same canonical values for when
  // they publish.
  const gigs: GigRow[] = []
  let from = 0
  while (true) {
    let q = supabase
      .from('gigs')
      .select('id, slug, title, status, category, subcategory, jurisdiction, provider_id')
      .range(from, from + 999)
    if (LIMIT) q = q.limit(LIMIT - gigs.length)
    const { data, error } = await q
    if (error) { console.error('gigs fetch failed:', error.message); process.exit(1) }
    gigs.push(...(data ?? []))
    if (!data || data.length < 1000 || (LIMIT && gigs.length >= LIMIT)) break
    from += 1000
  }

  // Provider countries for the jurisdiction fallback.
  const providerIds = Array.from(new Set(gigs.map((g) => g.provider_id).filter(Boolean) as string[]))
  const countryByProvider = new Map<string, string | null>()
  for (let i = 0; i < providerIds.length; i += 200) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, country')
      .in('id', providerIds.slice(i, i + 200))
    if (error) { console.error('profiles fetch failed:', error.message); process.exit(1) }
    for (const p of data ?? []) countryByProvider.set(p.id, p.country ?? null)
  }

  // Classify + aggregate report data.
  const updates: Array<{ gig: GigRow; patch: Record<string, string> }> = []
  const deferred: Array<{ gig: GigRow; patch: Record<string, string> }> = []
  const reviews: Array<{ gig: GigRow; reason: string }> = []
  const categoryValues = new Map<string, number>()
  const jurisdictionValues = new Map<string, number>()
  for (const g of gigs) {
    const catKey = g.category?.trim() ? g.category : '(NULL)'
    categoryValues.set(catKey, (categoryValues.get(catKey) ?? 0) + 1)
    const jxKey = g.jurisdiction?.trim() ? g.jurisdiction : '(NULL)'
    jurisdictionValues.set(jxKey, (jurisdictionValues.get(jxKey) ?? 0) + 1)

    const c = classifyGig(g, g.provider_id ? countryByProvider.get(g.provider_id) : null)
    if (c.action === 'update') {
      // Split off jurisdiction values the DB CHECK constraint rejects
      // (gigs_jurisdiction_check predates AU support) so the rest of the
      // patch still lands instead of the whole update failing.
      const writable: Record<string, string> = {}
      const blocked: Record<string, string> = {}
      for (const [k, v] of Object.entries(c.patch)) {
        if (k === 'jurisdiction' && !writableJx.has(v)) blocked[k] = v
        else writable[k] = v
      }
      if (Object.keys(writable).length > 0) updates.push({ gig: g, patch: writable })
      if (Object.keys(blocked).length > 0) deferred.push({ gig: g, patch: blocked })
    } else if (c.action === 'review') reviews.push({ gig: g, reason: c.reason })
  }

  console.log(`gigs fetched: ${gigs.length}`)
  const byStatus: Record<string, number> = {}
  for (const g of gigs) byStatus[g.status] = (byStatus[g.status] ?? 0) + 1
  console.log('by status:', JSON.stringify(byStatus))

  console.log('\n── category value breakdown ──')
  for (const [value, n] of [...categoryValues.entries()].sort((a, b) => b[1] - a[1])) {
    const target = resolveCategoryValue(value === '(NULL)' ? null : value)
    console.log(`  ${value.padEnd(45)} ${String(n).padStart(4)}  → ${target ? `${target.kind}:${target.value}` : 'UNMAPPED'}`)
  }
  console.log('\n── jurisdiction value breakdown ──')
  for (const [value, n] of [...jurisdictionValues.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${value.padEnd(45)} ${String(n).padStart(4)}`)
  }

  console.log(`\nplanned updates: ${updates.length}`)
  for (const { gig, patch } of updates) {
    const parts = Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify((gig as any)[k])} → ${JSON.stringify(v)}`)
    console.log(`  [${gig.status}] ${gig.slug || gig.id} — ${parts.join('; ')}`)
  }
  console.log(`\nflagged for review (NOT written): ${reviews.length}`)
  for (const { gig, reason } of reviews) {
    console.log(`  [${gig.status}] ${gig.slug || gig.id} — ${reason}`)
  }

  if (deferred.length > 0) {
    console.log(`\ndeferred jurisdiction writes (NOT ${APPLY ? 'applied' : 'written'}): ${deferred.length}`)
    console.log(`  DB constraint gigs_jurisdiction_check only allows us|uk|ca|NULL — 'au' is rejected.`)
    console.log(`  Fix: apply supabase/marketplace_gig_jurisdiction_au.sql, then re-run with --apply --allow-au.`)
    for (const { gig, patch } of deferred) {
      const parts = Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify((gig as any)[k])} → ${JSON.stringify(v)}`)
      console.log(`  [${gig.status}] ${gig.slug || gig.id} — ${parts.join('; ')}`)
    }
  }

  if (!APPLY) {
    console.log('\ndry-run only — re-run with --apply to write these updates.')
    return
  }

  console.log(`\napplying ${updates.length} updates…`)
  let done = 0
  let failed = 0
  for (const { gig, patch } of updates) {
    const { error } = await supabase.from('gigs').update(patch).eq('id', gig.id)
    if (error) { console.error(`  FAILED ${gig.id}: ${error.message}`); failed++; continue }
    done++
  }
  console.log(`applied: ${done}, failed: ${failed}. Re-run without --apply to verify zero remaining updates.`)
  if (deferred.length > 0) {
    console.log(`deferred jurisdiction writes (need constraint migration + --allow-au): ${deferred.length}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
