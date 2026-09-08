/**
 * FeaturedBriefsGrid paging contract (2026-09-08):
 *
 * Locks the Load-more/pager behavior added to the marketplace landing:
 *  1. Pure paging math (lib/marketplaceDisplay.ts):
 *     - 48 cards/page; 217 → 5 pages (4×48 + 25)
 *     - out-of-range / garbage pages clamp to [1, totalPages]
 *     - deep links SSR pages 1..N cumulatively (SSR matches the URL)
 *     - pager/deep-link scroll target = first card index of the page
 *  2. The client grid actually uses those helpers (no divergent local math)
 *     and wires the SSR initial-visible count through.
 *  3. The landing passes the URL-driven page into the grid and keeps the
 *     featured section anchored (id="featured").
 *
 * Background: the featured grid was first capped at 6 cards, then paginated
 * server-side, then rebuilt as a Load-more/pager hybrid. This suite pins the
 * final contract so refactors can't silently regress any of the three.
 */
import {
  FEATURED_PAGE_SIZE,
  clampPage,
  deepLinkVisibleCount,
  pageStartIndex,
  totalPagesFor,
} from '@/lib/marketplaceDisplay'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GRID_SRC = readFileSync(join(__dirname, '../components/marketplace/FeaturedBriefsGrid.tsx'), 'utf8')
const LANDING_SRC = readFileSync(join(__dirname, '../app/marketplace/PublicMarketplaceLanding.tsx'), 'utf8')

describe('pure paging math (lib/marketplaceDisplay)', () => {
  it('uses 48 cards per page', () => {
    expect(FEATURED_PAGE_SIZE).toBe(48)
  })

  it('computes page counts for the live inventory shape', () => {
    expect(totalPagesFor(217)).toBe(5) // 4×48 + 25
    expect(totalPagesFor(138)).toBe(3) // 2×48 + 42 (Canada slice)
    expect(totalPagesFor(9)).toBe(1) // Australia slice — pager hidden
    expect(totalPagesFor(0)).toBe(1) // empty inventory still has one page
    expect(totalPagesFor(48)).toBe(1)
    expect(totalPagesFor(49)).toBe(2)
  })

  it('clamps out-of-range and garbage pages into [1, totalPages]', () => {
    expect(clampPage(0, 217)).toBe(1)
    expect(clampPage(-3, 217)).toBe(1)
    expect(clampPage(6, 217)).toBe(5) // beyond last → last
    expect(clampPage(999, 9)).toBe(1)
    expect(clampPage(Number.NaN, 217)).toBe(1)
    expect(clampPage(Number.POSITIVE_INFINITY, 217)).toBe(1)
    expect(clampPage(2.9, 217)).toBe(2) // truncates, never rounds up
  })

  it('SSRs pages 1..N cumulatively for deep links', () => {
    expect(deepLinkVisibleCount(1, 217)).toBe(48)
    expect(deepLinkVisibleCount(3, 217)).toBe(144) // pages 1–3
    expect(deepLinkVisibleCount(5, 217)).toBe(217) // last page → everything
    expect(deepLinkVisibleCount(6, 217)).toBe(217) // clamped
    expect(deepLinkVisibleCount(2, 9)).toBe(9) // tiny slice → all of it
  })

  it('scroll target is the first card index of the page', () => {
    expect(pageStartIndex(1, 217)).toBe(0)
    expect(pageStartIndex(2, 217)).toBe(48)
    expect(pageStartIndex(5, 217)).toBe(192)
    expect(pageStartIndex(6, 217)).toBe(192) // clamped to last page
  })
})

describe('client grid wiring (FeaturedBriefsGrid.tsx)', () => {
  it('imports the shared paging helpers instead of local math', () => {
    expect(GRID_SRC).toContain("from '@/lib/marketplaceDisplay'")
    for (const helper of ['clampPage', 'totalPagesFor', 'pageStartIndex', 'deepLinkVisibleCount']) {
      expect(GRID_SRC).toMatch(new RegExp(`\\b${helper}\\b`))
    }
  })

  it('appends via Load more and jumps via the pager without reload', () => {
    // Load more extends visibility by one page, clamped to total.
    expect(GRID_SRC).toContain('setVisibleCount((c) => Math.min(c + FEATURED_PAGE_SIZE, total))')
    // Pager jumps are intercepted (no full-page navigation)…
    expect(GRID_SRC).toContain('e.preventDefault()')
    // …and scroll to the first card of the target page.
    expect(GRID_SRC).toContain('setScrollToIdx(target === 1 ? 0 : pageStartIndex(target, total))')
  })

  it('deep-links auto-scroll to the first card of page N on mount', () => {
    expect(GRID_SRC).toContain('didMountRef')
    expect(GRID_SRC).toContain('scrollIntoView')
    // Cards must clear the 72px sticky shell header when scrolled to.
    expect(GRID_SRC).toContain('scrollMarginTop')
  })

  it('hides Load more / pager for single-page slices', () => {
    expect(GRID_SRC).toContain('total > FEATURED_PAGE_SIZE')
    expect(GRID_SRC).toContain('hasMore &&')
  })
})

describe('landing wiring (PublicMarketplaceLanding.tsx)', () => {
  it('passes the URL page through as the SSR initial-visible count', () => {
    expect(LANDING_SRC).toContain('deepLinkVisibleCount(page, fullList.length)')
    expect(LANDING_SRC).toContain('initialVisible={serverVisible}')
    expect(LANDING_SRC).toContain('<FeaturedBriefsGrid')
  })

  it('keeps the featured section anchored for scroll targets', () => {
    expect(LANDING_SRC).toContain('id="featured"')
  })
})
