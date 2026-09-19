import { ok } from '@/lib/apiEnvelope'
import {
  computeFacetCounts,
  getCachedFacetCounts,
  normalizeFacetCounts,
  setCachedFacetCounts,
} from '@/lib/marketplaceFacets'
import { createSupabaseAdminClient } from '@/lib/supabase'

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
 * Cached in KV for 120s — facets don't change minute-by-minute and the COUNT
 * queries are cheap but not free (~16 round-trips). The exact same versioned
 * entry is shared with the landing chips (lib/marketplaceFacets cache
 * helpers), so a warm landing never pays for a second COUNT fan-out.
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
  const url = new URL(req.url)

  // Echo the filter params so callers can fetch counts that respect
  // their currently-applied filters. None of these are required.
  const country = (url.searchParams.get('country') || '').toLowerCase()
  const providerTypes = url.searchParams.getAll('provider_type').filter(Boolean)
  const minRating = url.searchParams.get('min_rating')

  // Identical for every caller with the same filters, so serve from KV
  // (filter counts tolerate 2 min of staleness). Read-through happens BEFORE
  // any Supabase client creation so a warm entry costs no DB setup at all.
  const cacheQuery = url.searchParams.toString()
  const cached = await getCachedFacetCounts(cacheQuery)
  if (cached) {
    return ok(normalizeFacetCounts(cached), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    })
  }

  const db = createSupabaseAdminClient()
  const counts = await computeFacetCounts(db, { country, providerTypes, minRating })

  // Raw counts (nulls preserved) go to the shared entry; the response keeps
  // the numeric API contract: failed COUNTs surface as 0 (the lib's nulls
  // are for callers with their own fallback data — the landing).
  await setCachedFacetCounts(counts, cacheQuery)
  return ok(normalizeFacetCounts(counts), {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  })
}
