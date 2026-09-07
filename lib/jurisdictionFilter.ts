/**
 * Jurisdiction filter shared by the marketplace listing API
 * (/api/marketplace/gigs) and the facet-count API (/api/marketplace/gig-facets).
 *
 * The landing page (PublicMarketplaceLanding.tsx) buckets country tabs as:
 *   1. gig.jurisdiction exactly us|uk|ca|au  → that tab
 *   2. else provider.country mappable        → that tab (DB can't see this
 *      in a gigs-only filter, so the listing can't replicate tier 2)
 *   3. else unresolvable                     → EVERY country tab
 *
 * A plain `.eq('jurisdiction', code)` silently dropped tier-3 gigs
 * (NULL, empty, or any value outside the four supported codes), so the
 * drawer + discovery country tabs undercounted relative to the landing
 * and to the admin's active-gig count. This filter ORs the unresolvable
 * cases into every country tab so all surfaces agree:
 *
 *   jurisdiction.eq.<code>            — the requested tab
 *   jurisdiction.is.null              — unset column
 *   jurisdiction.not.in.(four codes)  — empty string / garbage values
 *
 * Note PostgREST `not.in` never matches NULL (SQL three-valued logic),
 * which is exactly why the `is.null` term is spelled out separately.
 */
const VALID_CODES = ['us', 'uk', 'ca', 'au'] as const

export function jurisdictionCountryOrFilter(country: string): string {
  const inList = VALID_CODES.map((c) => `"${c}"`).join(',')
  return `jurisdiction.eq.${country},jurisdiction.is.null,jurisdiction.not.in.(${inList})`
}
