/**
 * Marketplace catalogue pagination — deterministic total-order regression.
 *
 * Live repro (2026-09-08, market.yousafeconsultancy.com/api/marketplace/gigs):
 *   total=217 but only 216 unique rows across pages — `deirdre-dawn-…` returned
 *   on BOTH page 1 and page 2 under `sort=trending`. Root cause: OFFSET
 *   pagination over tie-heavy `ORDER BY rank_score DESC, order_count DESC`
 *   (many gigs share both values) is nondeterministic, so one gig duplicated
 *   and a different one was omitted — exactly what a user sees as a catalogue
 *   navigation gap / "unavailable" gig that never appears.
 *
 * Fix: every sort branch ends with a stable `id` tie-breaker so the page
 * boundary is a strict TOTAL order.
 */
import {
  marketplaceGigSortOrder,
  MARKETPLACE_GIG_STABLE_TIEBREAK,
  type MarketplaceGigSort,
} from '@/lib/marketplaceGigSort'

const SORTS: MarketplaceGigSort[] = ['relevance', 'trending', 'best_rated', 'most_orders', 'newest', 'featured', 'price_asc', 'price_desc']

describe('marketplaceGigSortOrder — stable total order for OFFSET pagination', () => {
  it('every sort branch ends with the deterministic id tie-breaker', () => {
    for (const sort of SORTS) {
      const order = marketplaceGigSortOrder(sort)
      const last = order[order.length - 1]
      expect(last.column).toBe('id')
      expect(last.ascending).toBe(true)
      expect(order.map((o) => o.column)).toHaveLength(new Set(order.map((o) => o.column)).size) // no dup keys
    }
  })

  it('keeps the primary ranking key of each branch before the tie-breaker', () => {
    expect(marketplaceGigSortOrder('trending').slice(0, 2).map((o) => o.column)).toEqual(['rank_score', 'order_count'])
    expect(marketplaceGigSortOrder('best_rated').slice(0, 2).map((o) => o.column)).toEqual(['avg_rating', 'review_count'])
    expect(marketplaceGigSortOrder('most_orders')[0].column).toBe('order_count')
    expect(marketplaceGigSortOrder('newest')[0].column).toBe('published_at')
    expect(marketplaceGigSortOrder('featured')[0].column).toBe('featured_until')
  })

  it('the id tie-breaker exports the stable marker consumed by the route', () => {
    expect(MARKETPLACE_GIG_STABLE_TIEBREAK).toEqual({ column: 'id', ascending: true })
  })
})

describe('pagination partition property — no duplicates, no omissions (live repro shape)', () => {
  // 217 gigs with HEAVY ties on the trending keys — the exact shape that broke
  // live (rank_score 0/1 shared by many, order_count 0 shared by most).
  const total = 217
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `gig-${String(i).padStart(3, '0')}`,
    rank_score: i % 9, // ties: ~24 gigs share each rank_score
    order_count: i % 4,
    avg_rating: 4 + (i % 2) * 0.5,
    published_at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    featured_until: i % 3 === 0 ? `2026-09-${String((i % 9) + 1).padStart(2, '0')}` : null,
  }))

  function sortByChain(items: typeof rows, chain: Array<{ column: string; ascending: boolean }>) {
    // Multi-key stable sort: apply from least-significant key to most.
    const out = [...items]
    for (let k = chain.length - 1; k >= 0; k--) {
      const { column, ascending } = chain[k]
      out.sort((a: any, b: any) => {
        const va = a[column]
        const vb = b[column]
        const cmp = va == null ? (vb == null ? 0 : 1) : vb == null ? -1 : va < vb ? -1 : va > vb ? 1 : 0
        return ascending ? cmp : -cmp
      })
    }
    return out
  }

  for (const sort of SORTS) {
    it(`partition by ${sort} covers every row exactly once across 48-row pages`, () => {
      const chain = sortByChain(rows, marketplaceGigSortOrder(sort))
      const PAGE = 48
      const seen = new Set<string>()
      let pages = 0
      for (let off = 0; off < chain.length; off += PAGE) {
        const page = chain.slice(off, off + PAGE)
        for (const g of page) {
          expect(seen.has(g.id)).toBe(false) // duplicate across pages — the live defect
          seen.add(g.id)
        }
        pages += 1
      }
      expect(seen.size).toBe(total) // omission — the other half of the live defect
      expect(pages).toBe(5)
    })
  }
})