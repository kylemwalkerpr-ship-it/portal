import { ok } from '@/lib/apiEnvelope'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { computeFacetCounts } from '@/lib/marketplaceFacets'
import { createSupabaseAdminClient } from '@/lib/supabase'

const CACHE_TTL_SECONDS = 120

/**
 * GET /api/marketplace/gig-facets
 *
 * Returns the per-category and per-jurisdiction counts of *active* gigs
 * currently live in the marketplace. The discovery page uses these to
 * populate filter-sidebar counts honestly — replacing the earlier
 * static `getCategorySourceLabels(cat.id).length` figure, which counted
 * label strings in the static taxonomy and had no relationship to real
 * inventory.
 *
 * The counting itself lives in lib/marketplaceFacets.ts so the landing
 * chips (PublicMarketplaceLanding) can consume the exact same numbers —
 * one source of truth for "how many gigs would this filter list".
 *
 * Cached at the edge for 120s — facets don't change minute-by-minute and
 * the COUNT queries are cheap but not free (~16 round-trips).
 *
 * Optional query params: same filter set as /api/marketplace/gigs. When
 * present, the returned counts reflect inventory matching those filters
 * (so e.g. picking jurisdiction=uk shrinks the category counts to "what
 * exists in the UK"). The caller decides which filters to apply.
 *
 * Response shape:
 *   {
 *     data: {
 *       categoryCounts: { immigration: 12, legal: 5, ... },
 *       jurisdictionCounts: { us: 8, uk: 4, ca: 5, au: 2 },
 *       providerTypeCounts: { attorney: 7, consultant: 10 },
 *       total: 17,
 *     },
 *     error: null
 *   }
 */
export async function GET(req: Request) {
  const db = createSupabaseAdminClient()
  const url = new URL(req.url)

  // Echo the filter params so callers can fetch counts that respect
  // their currently-applied filters. None of these are required.
  const country = (url.searchParams.get('country') || '').toLowerCase()
  const providerTypes = url.searchParams.getAll('provider_type').filter(Boolean)
  const minRating = url.searchParams.get('min_rating')

  // Identical for every caller with the same filters, so serve from KV
  // (filter counts tolerate 2 min of staleness).
  const cacheKey = await generateVersionedCacheKey('gigs', '/api/marketplace/gig-facets', url.searchParams.toString())
  const cached = await getCached<Record<string, unknown>>(cacheKey, CACHE_TTL_SECONDS)
  if (cached) return ok(cached, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })

  const counts = await computeFacetCounts(db, { country, providerTypes, minRating })

  // Numeric API contract: failed COUNTs surface as 0 (the lib's nulls are
  // for callers with their own fallback data — the landing).
  const payload = {
    categoryCounts: Object.fromEntries(Object.entries(counts.categoryCounts).map(([k, v]) => [k, v ?? 0])),
    jurisdictionCounts: Object.fromEntries(Object.entries(counts.jurisdictionCounts).map(([k, v]) => [k, v ?? 0])),
    providerTypeCounts: Object.fromEntries(Object.entries(counts.providerTypeCounts).map(([k, v]) => [k, v ?? 0])),
    total: counts.total ?? 0,
  }
  await setCached(cacheKey, payload, CACHE_TTL_SECONDS)
  return ok(payload, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
}
