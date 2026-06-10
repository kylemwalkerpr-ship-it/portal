import { ok, fail } from '@/lib/apiEnvelope'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { CATEGORIES, getCategoryFilterTerms } from '@/lib/categories'
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
 * Cached at the edge for 60s — facets don't change minute-by-minute and
 * the COUNT queries are cheap but not free.
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
 *       jurisdictionCounts: { us: 8, uk: 4, ca: 5 },
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

  // This route fans out into ~16 COUNT queries; identical for every caller
  // with the same filters, so serve from KV (filter counts tolerate 2 min
  // of staleness).
  const cacheKey = await generateVersionedCacheKey('gigs', '/api/marketplace/gig-facets', url.searchParams.toString())
  const cached = await getCached<Record<string, unknown>>(cacheKey, CACHE_TTL_SECONDS)
  if (cached) return ok(cached, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })

  // Build the base filter once and reuse for each per-category COUNT.
  // Supabase doesn't have a clean GROUP BY in the JS client, so we
  // issue one head-count query per category. ~9 round-trips, each
  // resolving to a single integer; cheap on the gigs table size.
  const applyBaseFilters = (q: any) => {
    let query = q.eq('status', 'active')
    if (['us', 'uk', 'ca', 'au'].includes(country)) query = query.eq('jurisdiction', country)
    const validTypes = providerTypes.filter((t) => ['attorney', 'consultant'].includes(t))
    if (validTypes.length === 1) query = query.eq('provider_type', validTypes[0])
    else if (validTypes.length > 1) query = query.in('provider_type', validTypes)
    if (minRating) query = query.gte('avg_rating', parseFloat(minRating))
    return query
  }

  const categoryCounts: Record<string, number> = {}
  await Promise.all(
    CATEGORIES.map(async (cat) => {
      const terms = getCategoryFilterTerms(cat.id)
      if (!terms || terms.length === 0) {
        categoryCounts[cat.id] = 0
        return
      }
      const { count } = await applyBaseFilters(
        db.from('gigs').select('id', { count: 'exact', head: true }),
      ).in('category', terms)
      categoryCounts[cat.id] = count ?? 0
    }),
  )

  const jurisdictionCounts: Record<string, number> = { us: 0, uk: 0, ca: 0, au: 0 }
  await Promise.all(
    (['us', 'uk', 'ca', 'au'] as const).map(async (j) => {
      // Don't double-filter on jurisdiction — the caller's jurisdiction
      // param is for context (e.g. "what category counts in the UK")
      // but the jurisdiction-facet itself should always reflect total
      // active inventory in that jurisdiction.
      let q = db.from('gigs').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('jurisdiction', j)
      const validTypes = providerTypes.filter((t) => ['attorney', 'consultant'].includes(t))
      if (validTypes.length === 1) q = q.eq('provider_type', validTypes[0])
      else if (validTypes.length > 1) q = q.in('provider_type', validTypes)
      if (minRating) q = q.gte('avg_rating', parseFloat(minRating))
      const { count } = await q
      jurisdictionCounts[j] = count ?? 0
    }),
  )

  const providerTypeCounts: Record<string, number> = { attorney: 0, consultant: 0 }
  await Promise.all(
    (['attorney', 'consultant'] as const).map(async (t) => {
      let q = db.from('gigs').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('provider_type', t)
      if (['us', 'uk', 'ca', 'au'].includes(country)) q = q.eq('jurisdiction', country)
      if (minRating) q = q.gte('avg_rating', parseFloat(minRating))
      const { count } = await q
      providerTypeCounts[t] = count ?? 0
    }),
  )

  const { count: total } = await applyBaseFilters(
    db.from('gigs').select('id', { count: 'exact', head: true }),
  )

  const payload = { categoryCounts, jurisdictionCounts, providerTypeCounts, total: total ?? 0 }
  await setCached(cacheKey, payload, CACHE_TTL_SECONDS)
  return ok(payload, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
}
