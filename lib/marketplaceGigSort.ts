/**
 * Deterministic marketplace catalogue ORDER BY (shared by the listing API).
 *
 * The page boundary (OFFSET pagination) must be a TOTAL order: tie-heavy
 * primary keys made PostgREST return a row on two adjacent pages and silently
 * omit another (live repro: total=217, 216 unique, `deirdre-dawn-…` on both
 * page 1 and 2 under `sort=trending`). Every branch ends with a stable `id`
 * tie-breaker so each gig appears in exactly one page no matter how many rows
 * share rank/rating/date values.
 *
 * Price sorts keep the deterministic base slice; their in-page reordering by
 * price is applied in memory afterwards (existing behaviour).
 */

export const MARKETPLACE_GIG_STABLE_TIEBREAK = { column: 'id', ascending: true } as const

export type MarketplaceGigSort =
  | 'relevance'
  | 'trending'
  | 'best_rated'
  | 'most_orders'
  | 'newest'
  | 'featured'
  | 'price_asc'
  | 'price_desc'

export type MarketplaceSortStep = { column: string; ascending: boolean }

export function marketplaceGigSortOrder(sort: string): MarketplaceSortStep[] {
  const stable: MarketplaceSortStep[] = [MARKETPLACE_GIG_STABLE_TIEBREAK]
  switch (sort) {
    case 'best_rated':
      return [{ column: 'avg_rating', ascending: false }, { column: 'review_count', ascending: false }, ...stable]
    case 'most_orders':
      return [{ column: 'order_count', ascending: false }, ...stable]
    case 'newest':
      return [{ column: 'published_at', ascending: false }, ...stable]
    case 'featured':
      return [{ column: 'featured_until', ascending: false }, ...stable]
    case 'trending':
      return [{ column: 'rank_score', ascending: false }, { column: 'order_count', ascending: false }, ...stable]
    default:
      // relevance + price_asc/price_desc use the same stable base slice.
      return [{ column: 'rank_score', ascending: false }, { column: 'published_at', ascending: false }, ...stable]
  }
}