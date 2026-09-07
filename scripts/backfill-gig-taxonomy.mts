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
 * Canonical invariant enforced (mirrors the gig builder + publish gate):
 *   category    = top-level taxonomy id        (immigration, education, …)
 *   subcategory = subcategory id when known    (study-permits, …)
 *   jurisdiction= lowercase us|uk|ca|au
 *
 * Resolution rules (per gig):
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
  CATEGORIES,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
  CATEGORY_SOURCE_LABELS,
} from '../lib/categories'

// ── Taxonomy lookup tables (derived from lib/categories.ts) ────────────────

const topLevelIds = new Set<string>(CATEGORIES.map((c) => c.id))
const subParent = new Map<string, string>() // subcategory id → parent category id
for (const cat of CATEGORIES) {
  for (const sub of cat.subcategories) subParent.set(sub.id, cat.id)
}

type Target = { kind: 'top' | 'sub'; value: string }
const lookup = new Map<string, Target>() // lowercase raw value → target
function indexLabel(raw: string, target: Target) {
  const key = raw.trim().toLowerCase()
  if (key && !lookup.has(key)) lookup.set(key, target)
}
for (const cat of CATEGORIES) {
  indexLabel(cat.name, { kind: 'top', value: cat.id })
  for (const sub of cat.subcategories) indexLabel(sub.name, { kind: 'sub', value: sub.id })
}
// LEGACY_CATEGORY_MAP is the curated per-value mapping — it wins over the
// bulk CATEGORY_SOURCE_LABELS imports when both contain the same string
// (e.g. 'USA Study' is a label of the whole immigration category but the
// legacy map deliberately pins it to the study-permits subcategory).
for (const [legacy, targetId] of Object.entries(LEGACY_CATEGORY_MAP)) {
  const kind = topLevelIds.has(targetId) ? 'top' : subParent.has(targetId) ? 'sub' : null
  if (kind) indexLabel(legacy, { kind, value: targetId } as Target)
}
for (const [id, labels] of Object.entries(CATEGORY_SOURCE_LABELS)) {
  const kind = topLevelIds.has(id) ? 'top' : subParent.has(id) ? 'sub' : null
  if (!kind) continue
  for (const label of labels) indexLabel(label, { kind, value: id } as Target)
}

/** Resolve a raw `category` column value to a canonical target, or null. */
export function resolveCategoryValue(raw: string | null | undefined): Target | null {
  if (!raw || !raw.trim()) return null
  const v = raw.trim()
  if (topLevelIds.has(v)) return { kind: 'top', value: v }
  if (subParent.has(v)) return { kind: 'sub', value: v }
  const hit = lookup.get(v.toLowerCase())
  if (hit) return hit
  const norm = normalizeCategory(v)
  if (topLevelIds.has(norm)) return { kind: 'top', value: norm }
  if (subParent.has(norm)) return { kind: 'sub', value: norm }
  return null
}

// ── Jurisdiction resolution (mirrors PublicMarketplaceLanding) ─────────────

const VALID_JX = new Set(['us', 'uk', 'ca', 'au'])
const COUNTRY_CODE_MAP: Record<string, string> = {
  US: 'us', USA: 'us', 'UNITED STATES': 'us',
  UK: 'uk', GB: 'uk', GBR: 'uk', 'UNITED KINGDOM': 'uk',
  CA: 'ca', CAN: 'ca', CANADA: 'ca',
  AU: 'au', AUS: 'au', AUSTRALIA: 'au',
}
export function resolveJurisdictionValue(raw: string | null | undefined, providerCountry?: string | null): string | null {
  const norm = (raw || '').trim().toLowerCase()
  if (VALID_JX.has(norm)) return norm
  const c = (providerCountry || '').toUpperCase().trim()
  return COUNTRY_CODE_MAP[c] || null
}

// ── Per-gig classification ──────────────────────────────────────────────────

export interface GigRow {
  id: string
  slug: string | null
  title: string
  status: string
  category: string | null
  subcategory: string | null
  jurisdiction: string | null
  provider_id: string | null
}

export type Classification =
  | { action: 'none' }
  | { action: 'update'; patch: Record<string, string> }
  | { action: 'review'; reason: string }

export function classifyGig(gig: GigRow, providerCountry?: string | null): Classification {
  const patch: Record<string, string> = {}

  const subHit = resolveCategoryValue(gig.subcategory)
  const catHit = resolveCategoryValue(gig.category)
  const validSub = subHit && subHit.kind === 'sub' ? subHit.value : null
  const validTop = catHit && catHit.kind === 'top' ? catHit.value : null

  // Contradictory data (top-level category and subcategory from different
  // parents) is a seller-data decision — flag it, never resolve silently.
  if (validSub && validTop && subParent.get(validSub) !== validTop) {
    return { action: 'review', reason: `subcategory "${gig.subcategory}" conflicts with category "${gig.category}"` }
  }

  if (validSub) {
    // A valid subcategory pins its parent category.
    const parent = subParent.get(validSub)!
    if (gig.category !== parent) patch.category = parent
    if (gig.subcategory !== validSub) patch.subcategory = validSub
  } else if (validTop) {
    if (gig.category !== validTop) patch.category = validTop
    // subcategory column stays untouched (nothing resolvable in it).
  } else if (catHit && catHit.kind === 'sub') {
    // Category column held a subcategory id/label → canonicalize to the
    // parent, and fill the empty subcategory column to keep granularity.
    const parent = subParent.get(catHit.value)!
    if (gig.category !== parent) patch.category = parent
    if (!gig.subcategory) patch.subcategory = catHit.value
  } else if (gig.category && gig.category.trim()) {
    return { action: 'review', reason: `unmapped category value "${gig.category}"` }
  } else {
    // Nothing to infer from — never guess from titles in an automated write.
    return { action: 'review', reason: 'category is NULL and subcategory is unset/unresolvable' }
  }

  // 2. Jurisdiction.
  const jx = resolveJurisdictionValue(gig.jurisdiction, providerCountry)
  if (jx) {
    if (gig.jurisdiction !== jx) patch.jurisdiction = jx
  } else if (!gig.jurisdiction || !VALID_JX.has(gig.jurisdiction.trim().toLowerCase())) {
    // Leave NULL/invalid as-is when neither column can resolve it — the
    // listing OR-filters already surface these under every country tab.
    // (Only report when we had a raw value we couldn't map.)
    if (gig.jurisdiction && gig.jurisdiction.trim()) {
      return { action: 'review', reason: `unmapped jurisdiction "${gig.jurisdiction}"` }
    }
  }

  if (Object.keys(patch).length === 0) return { action: 'none' }
  return { action: 'update', patch }
}

// ── Selftest (no DB) ────────────────────────────────────────────────────────

function runSelftest(): boolean {
  const cases: Array<{ row: Partial<GigRow>; country?: string | null; expect: Classification }> = [
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
  const reviews: Array<{ gig: GigRow; reason: string }> = []
  const categoryValues = new Map<string, number>()
  const jurisdictionValues = new Map<string, number>()
  for (const g of gigs) {
    const catKey = g.category?.trim() ? g.category : '(NULL)'
    categoryValues.set(catKey, (categoryValues.get(catKey) ?? 0) + 1)
    const jxKey = g.jurisdiction?.trim() ? g.jurisdiction : '(NULL)'
    jurisdictionValues.set(jxKey, (jurisdictionValues.get(jxKey) ?? 0) + 1)

    const c = classifyGig(g, g.provider_id ? countryByProvider.get(g.provider_id) : null)
    if (c.action === 'update') updates.push({ gig: g, patch: c.patch })
    else if (c.action === 'review') reviews.push({ gig: g, reason: c.reason })
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
}

main().catch((e) => { console.error(e); process.exit(1) })
