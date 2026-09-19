/**
 * marketplaceFacets — single source of truth for marketplace facet counts.
 *
 * The gig-facets API (/api/marketplace/gig-facets) and the landing chips
 * (PublicMarketplaceLanding) previously computed counts through two
 * different paths: the API ran real DB COUNT queries while the landing
 * partitioned its in-memory inventory pull. Those two agreed only while the
 * inventory pull saw every row (whole table under its 1000-row cap) and the
 * landing's cache was fresh. Any drift — a seller pausing a gig between the
 * landing's cached snapshot and a chip click — showed up as "All (216)"
 * chips over a 217-gig grid or vice versa.
 *
 * Both surfaces now call `computeFacetCounts()` here. The API serves the
 * result (coercing failed COUNTs to 0 for its numeric contract); the
 * landing merges only the *resolved* fields over its in-memory partition,
 * so a COUNT hiccup can never blank a chip that the in-memory data can
 * still populate.
 *
 * Counting contract (identical to the listing API):
 *  - jurisdiction counts use jurisdictionCountryOrFilter(): exact matches
 *    plus NULL/invalid-jurisdiction gigs, so a country-tab badge always
 *    equals what that tab lists.
 *  - category counts use buildCategoryOrFilter(): taxonomy membership only.
 *    Uncategorized legacy gigs remain in the unfiltered total, never in every
 *    category count.
 */

import { CATEGORIES, buildCategoryOrFilter } from '@/lib/categories'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { jurisdictionCountryOrFilter } from '@/lib/jurisdictionFilter'

export const FACET_JX_CODES = ['us', 'uk', 'ca', 'au'] as const
export type FacetJxCode = (typeof FACET_JX_CODES)[number]

/** `null` = the COUNT failed (DB error) — callers fall back per-field. */
export interface FacetCounts {
  categoryCounts: Record<string, number | null>
  jurisdictionCounts: Record<string, number | null>
  providerTypeCounts: Record<string, number | null>
  total: number | null
}

/** Numeric shape served by /api/marketplace/gig-facets (failed COUNTs → 0). */
export interface NumericFacetCounts {
  categoryCounts: Record<string, number>
  jurisdictionCounts: Record<string, number>
  providerTypeCounts: Record<string, number>
  total: number
}

/**
 * ── Shared facet cache ──────────────────────────────────────────────────
 * The landing chips and the gig-facets API must agree on inventory, and the
 * COUNT fan-out (~16 head-count queries) is one of the heavier marketplace
 * reads. Both surfaces therefore read through the SAME versioned KV entry
 * (namespace `gigs`, path `/api/marketplace/gig-facets`, unfiltered query).
 *
 * The cached value is the raw `FacetCounts` — `null` fields are preserved so
 * a failed COUNT can never be mistaken for a real 0 by the landing's
 * per-field in-memory fallback. The API normalizes to numbers only when
 * serializing its response (see normalizeFacetCounts).
 *
 * getCached/setCached are fail-open: a KV miss or error simply falls through
 * to a fresh compute, and a failed write never breaks the request.
 */
export const FACET_CACHE_TTL_SECONDS = 120
export const FACET_CACHE_PATH = '/api/marketplace/gig-facets'

function isFacetCountsShape(value: unknown): value is FacetCounts {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<FacetCounts>
  return Boolean(
    v.categoryCounts &&
      typeof v.categoryCounts === 'object' &&
      v.jurisdictionCounts &&
      typeof v.jurisdictionCounts === 'object' &&
      v.providerTypeCounts &&
      typeof v.providerTypeCounts === 'object' &&
      'total' in v,
  )
}

/** Read the shared facet entry. Returns null on miss, malformed data, or KV error. */
export async function getCachedFacetCounts(cacheQuery = ''): Promise<FacetCounts | null> {
  const cacheKey = await generateVersionedCacheKey('gigs', FACET_CACHE_PATH, cacheQuery)
  const cached = await getCached<FacetCounts>(cacheKey, FACET_CACHE_TTL_SECONDS)
  return isFacetCountsShape(cached) ? cached : null
}

/** Write the raw counts (nulls preserved) to the shared facet entry. */
export async function setCachedFacetCounts(counts: FacetCounts, cacheQuery = ''): Promise<void> {
  const cacheKey = await generateVersionedCacheKey('gigs', FACET_CACHE_PATH, cacheQuery)
  await setCached(cacheKey, counts, FACET_CACHE_TTL_SECONDS)
}

/** Coerce raw counts into the numeric API contract: failed COUNTs surface as 0. */
export function normalizeFacetCounts(counts: FacetCounts): NumericFacetCounts {
  const asNumbers = (record: Record<string, number | null>): Record<string, number> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value ?? 0]))
  return {
    categoryCounts: asNumbers(counts.categoryCounts),
    jurisdictionCounts: asNumbers(counts.jurisdictionCounts),
    providerTypeCounts: asNumbers(counts.providerTypeCounts),
    total: counts.total ?? 0,
  }
}

/**
 * The Supabase client is typed loosely here on purpose: the builder chain's
 * generics vary across supabase-js versions and call shapes (head-count
 * queries especially), and structural typing against
 * PostgrestQueryBuilder breaks on every minor bump. We only rely on the
 * runtime chain contract: from().select().eq().or()...  → awaited
 * { count, error }.
 */
type SupaDb = { from: (table: string) => any }

export function isValidFacetCountry(country: string | null | undefined): country is FacetJxCode {
  return !!country && (FACET_JX_CODES as readonly string[]).includes(country)
}

/**
 * Compute the facet counts against the live DB. Never throws — a failed
 * COUNT resolves to `null` for that field so callers can fall back to
 * their own locally-derived number instead of lying with a 0.
 */
export async function computeFacetCounts(
  db: SupaDb,
  opts: { country?: string | null; providerTypes?: string[]; minRating?: string | null } = {},
): Promise<FacetCounts> {
  const country = isValidFacetCountry(opts.country) ? opts.country : null
  const validTypes = (opts.providerTypes ?? []).filter((t) => ['attorney', 'consultant'].includes(t))
  const minRating = opts.minRating || null

  const applyBaseFilters = (q: any): any => {
    let query = q.eq('status', 'active')
    if (country) query = query.or(jurisdictionCountryOrFilter(country))
    if (validTypes.length === 1) query = query.eq('provider_type', validTypes[0])
    else if (validTypes.length > 1) query = query.in('provider_type', validTypes)
    if (minRating) query = query.gte('avg_rating', parseFloat(minRating))
    return query
  }

  const safeCount = async (q: any): Promise<number | null> => {
    try {
      const { count, error } = (await q) as { count: number | null; error: unknown }
      if (error) return null
      return count ?? 0
    } catch {
      return null
    }
  }

  const categoryCounts: Record<string, number | null> = {}
  await Promise.all(
    CATEGORIES.map(async (cat) => {
      const categoryOr = buildCategoryOrFilter([cat.id])
      if (!categoryOr) {
        categoryCounts[cat.id] = 0
        return
      }
      categoryCounts[cat.id] = await safeCount(
        applyBaseFilters(db.from('gigs').select('id', { count: 'exact', head: true })).or(categoryOr),
      )
    }),
  )

  const jurisdictionCounts: Record<string, number | null> = { us: null, uk: null, ca: null, au: null }
  await Promise.all(
    FACET_JX_CODES.map(async (j) => {
      // No double jurisdiction filter — the facet itself must always reflect
      // what that country tab would LIST (see lib/jurisdictionFilter.ts).
      let q: any = db.from('gigs').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (validTypes.length === 1) q = q.eq('provider_type', validTypes[0])
      else if (validTypes.length > 1) q = q.in('provider_type', validTypes)
      if (minRating) q = q.gte('avg_rating', parseFloat(minRating))
      jurisdictionCounts[j] = await safeCount(q.or(jurisdictionCountryOrFilter(j)))
    }),
  )

  const providerTypeCounts: Record<string, number | null> = { attorney: null, consultant: null }
  await Promise.all(
    (['attorney', 'consultant'] as const).map(async (t) => {
      let q: any = db
        .from('gigs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('provider_type', t)
      if (country) q = q.or(jurisdictionCountryOrFilter(country))
      if (minRating) q = q.gte('avg_rating', parseFloat(minRating))
      providerTypeCounts[t] = await safeCount(q)
    }),
  )

  const total = await safeCount(applyBaseFilters(db.from('gigs').select('id', { count: 'exact', head: true })))

  return { categoryCounts, jurisdictionCounts, providerTypeCounts, total }
}

/** The facet fields the DB path actually resolved (non-null). */
export function isResolved(v: number | null | undefined): v is number {
  return v != null
}
