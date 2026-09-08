/**
 * Gig taxonomy resolution — single source of truth shared by:
 *   - scripts/backfill-gig-taxonomy.mts (data backfill, dry-run first)
 *   - scripts/check-gig-taxonomy.mts    (CI gate: fails when an active gig
 *     has an unmapped category or jurisdiction)
 *
 * Canonical invariant (mirrors the gig builder + publish gate):
 *   category    = top-level taxonomy id        (immigration, education, …)
 *   subcategory = subcategory id when known    (study-permits, …)
 *   jurisdiction= lowercase us|uk|ca|au
 *
 * The marketplace listing ORs in NULL/legacy values so nothing is invisible
 * (buildCategoryOrFilter / jurisdictionCountryOrFilter), but canonical ids
 * keep counts precise and let these OR-filters become no-ops.
 */
import {
  CATEGORIES,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
  CATEGORY_SOURCE_LABELS,
} from './categories'

// ── Taxonomy lookup tables (derived from lib/categories.ts) ────────────────

const topLevelIds = new Set<string>(CATEGORIES.map((c) => c.id))
const subParent = new Map<string, string>() // subcategory id → parent category id
for (const cat of CATEGORIES) {
  for (const sub of cat.subcategories) subParent.set(sub.id, cat.id)
}

export type Target = { kind: 'top' | 'sub'; value: string }
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

export const VALID_JX = new Set(['us', 'uk', 'ca', 'au'])

/**
 * Jurisdiction codes the gigs table will currently accept. The DB CHECK
 * constraint gigs_jurisdiction_check (supabase/marketplace_gig_jurisdiction.sql)
 * predates AU support and allows only us|uk|ca|NULL — 'au' is app-valid
 * (landing AU tab, COUNTRY_CODE_MAP above) but the DB rejects writes of it
 * until supabase/migrations/20260908_marketplace_gig_jurisdiction_au.sql
 * is applied (now auto-applied by the apply-seo-factory-migrations workflow).
 */
export const DB_WRITABLE_JX = new Set(['us', 'uk', 'ca'])
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

  // Jurisdiction.
  const jx = resolveJurisdictionValue(gig.jurisdiction, providerCountry)
  if (jx) {
    if (gig.jurisdiction !== jx) patch.jurisdiction = jx
  } else if (gig.jurisdiction && gig.jurisdiction.trim()) {
    // Raw value present but neither it nor the provider country maps.
    return { action: 'review', reason: `unmapped jurisdiction "${gig.jurisdiction}"` }
  }

  if (Object.keys(patch).length === 0) return { action: 'none' }
  return { action: 'update', patch }
}
