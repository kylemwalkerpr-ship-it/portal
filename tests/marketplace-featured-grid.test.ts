/**
 * FeaturedBriefsGrid paging contract — TRUE PAGINATION (2026-09-21).
 *
 * Replaces the cumulative Load-more/pager hybrid this suite used to pin. The
 * landing browses page by page now:
 *
 *  1. Pure window math (lib/marketplaceDisplay.ts): 48 cards/page; a window is
 *     a page-LOCAL range — page 2 is cards 49-96, never the first 96 — and the
 *     status line is computed from the cards actually rendered.
 *  2. The window transition (lib/marketplaceLandingPaging.applyLandingWindow)
 *     REPLACES the rendered cards; no cumulative state can survive a page
 *     change.
 *  3. The client grid renders one window, caches windows client-side, resolves
 *     deep links from window.location after hydration, and writes the URL with
 *     the History API (push on click, popstate on Back/Forward).
 *  4. `Load more briefs` no longer exists anywhere on the surface.
 *
 * Background: the featured grid was first capped at 6 cards, then paginated
 * server-side, then became a Load-more/pager hybrid whose "page 2" appended to
 * page 1. This suite pins the final page-window contract so a refactor cannot
 * silently regress it back to cumulative browsing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEATURED_PAGE_SIZE,
  clampPage,
  landingPageStatus,
  pageStartIndex,
  pageWindowFor,
  totalPagesFor,
  type LandingCardGig,
} from '@/lib/marketplaceDisplay'
import {
  applyLandingWindow,
  landingCardsPath,
  type LandingWindowState,
} from '@/lib/marketplaceLandingPaging'

const GRID_SRC = readFileSync(join(__dirname, '../components/marketplace/FeaturedBriefsGrid.tsx'), 'utf8')
const LANDING_SRC = readFileSync(join(__dirname, '../app/marketplace/PublicMarketplaceLanding.tsx'), 'utf8')

/** Ranked fixture: `page`'s own window, ids stable across windows. */
function cardWindow(page: number, size = FEATURED_PAGE_SIZE): LandingCardGig[] {
  return Array.from({ length: size }, (_, i) => {
    const n = (page - 1) * FEATURED_PAGE_SIZE + i
    return {
      id: `gig-${n}`,
      slug: `brief-${n}`,
      title: `Brief ${n}`,
      category: 'green_card',
      provider_type: 'attorney',
      avg_rating: 4.8,
      review_count: 3,
      starting_price: 25000,
      delivery_days: 5,
      providerName: `Provider ${n}`,
      providerHeadshot: null,
      jx: 'us',
      cover_image_url: null,
    }
  })
}

describe('pure page-window math (lib/marketplaceDisplay)', () => {
  it('uses 48 cards per page', () => {
    expect(FEATURED_PAGE_SIZE).toBe(48)
  })

  it('computes page counts for the live inventory shape', () => {
    expect(totalPagesFor(217)).toBe(5) // 4x48 + 25
    expect(totalPagesFor(138)).toBe(3) // 2x48 + 42 (Canada slice)
    expect(totalPagesFor(9)).toBe(1) // Australia slice — pager hidden
    expect(totalPagesFor(0)).toBe(1) // empty inventory still has one page
    expect(totalPagesFor(48)).toBe(1)
    expect(totalPagesFor(49)).toBe(2)
  })

  it('clamps out-of-range and garbage pages into [1, totalPages]', () => {
    expect(clampPage(0, 217)).toBe(1)
    expect(clampPage(-3, 217)).toBe(1)
    expect(clampPage(6, 217)).toBe(5) // beyond last -> last
    expect(clampPage(999, 9)).toBe(1)
    expect(clampPage(Number.NaN, 217)).toBe(1)
    expect(clampPage(Number.POSITIVE_INFINITY, 217)).toBe(1)
    expect(clampPage(2.9, 217)).toBe(2) // truncates, never rounds up
  })

  it('describes a page-local window (page 2 starts at card 49)', () => {
    expect(pageWindowFor(1, 217)).toEqual({ page: 1, totalPages: 5, firstIndex: 0, hasPrev: false, hasNext: true })
    expect(pageWindowFor(2, 217)).toEqual({ page: 2, totalPages: 5, firstIndex: 48, hasPrev: true, hasNext: true })
    expect(pageWindowFor(5, 217)).toEqual({ page: 5, totalPages: 5, firstIndex: 192, hasPrev: true, hasNext: false })
    // Out-of-range / garbage pointers clamp instead of opening an empty window.
    expect(pageWindowFor(9, 217).page).toBe(5)
    expect(pageWindowFor(0, 217).page).toBe(1)
    expect(pageWindowFor(Number.NaN, 217).page).toBe(1)
    // Single-page and tiny slices never claim a next window.
    expect(pageWindowFor(1, 48).hasNext).toBe(false)
    expect(pageWindowFor(1, 9).hasNext).toBe(false)
  })

  it('scroll target is the first card index of the page', () => {
    expect(pageStartIndex(1, 217)).toBe(0)
    expect(pageStartIndex(2, 217)).toBe(48)
    expect(pageStartIndex(5, 217)).toBe(192)
    expect(pageStartIndex(6, 217)).toBe(192) // clamped to last page
  })

  it('reports the range of the cards actually rendered', () => {
    expect(landingPageStatus(1, 48, 217)).toBe('Showing 1-48 of 217 · Page 1 of 5')
    expect(landingPageStatus(2, 48, 217)).toBe('Showing 49-96 of 217 · Page 2 of 5')
    expect(landingPageStatus(5, 25, 217)).toBe('Showing 193-217 of 217 · Page 5 of 5')
    // A short window (live drift) never claims cards it did not render.
    expect(landingPageStatus(2, 44, 217)).toBe('Showing 49-92 of 217 · Page 2 of 5')
    expect(landingPageStatus(1, 0, 217)).toBe('No briefs to show · Page 1 of 5')
    expect(landingPageStatus(3, 42, 138)).toBe('Showing 97-138 of 138 · Page 3 of 3')
  })
})

describe('page windows replace, never accumulate (applyLandingWindow)', () => {
  const first = cardWindow(1)
  const second = cardWindow(2)

  it('renders exactly the requested page — page 2 is not the first 96', () => {
    let state: LandingWindowState = { page: 1, cards: first, total: 217 }
    state = applyLandingWindow(state, { page: 2, cards: second, total: 217 })

    expect(state.page).toBe(2)
    expect(state.total).toBe(217)
    expect(state.cards.map((c) => c.id)).toEqual(second.map((c) => c.id))
    expect(state.cards).toHaveLength(FEATURED_PAGE_SIZE)
    // No page-1 card survives the navigation, and the window is not a prefix.
    const firstIds = new Set(first.map((c) => c.id))
    expect(state.cards.some((c) => firstIds.has(c.id))).toBe(false)
    expect(state.cards).not.toContain(first[0])

    // ...and going back is a replacement too.
    state = applyLandingWindow(state, { page: 1, cards: first, total: 217 })
    expect(state.page).toBe(1)
    expect(state.cards.map((c) => c.id)).toEqual(first.map((c) => c.id))
  })

  it('keeps the last honest total and clamps to the pages that exist', () => {
    const fivePages: LandingWindowState = { page: 1, cards: first, total: 217 }
    // An empty/absent API total never blanks the count.
    expect(applyLandingWindow(fivePages, { page: 2, cards: second }).total).toBe(217)
    // A smaller live total clamps the pointer to a page that exists.
    expect(applyLandingWindow(fivePages, { page: 5, cards: second, total: 100 }).page).toBe(3)
    expect(applyLandingWindow(fivePages, { page: 0, cards: second, total: 217 }).page).toBe(1)
  })

  it('de-duplicates inside the window only', () => {
    const duplicated = [second[0], second[1], second[1], second[2]]
    const windowIds = applyLandingWindow(
      { page: 1, cards: first, total: 217 },
      { page: 2, cards: duplicated, total: 217 },
    ).cards.map((c) => c.id)
    expect(windowIds).toEqual([second[0].id, second[1].id, second[2].id])
  })

  it('requests exactly the page-N window from the listing API', () => {
    const url = new URL(landingCardsPath('all', 2), 'https://market.example')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('limit')).toBe(String(FEATURED_PAGE_SIZE))
    // The window is page-local, so the status it renders is too.
    expect(pageWindowFor(2, 217).firstIndex).toBe(FEATURED_PAGE_SIZE)
    expect(landingPageStatus(2, second.length, 217)).toBe('Showing 49-96 of 217 · Page 2 of 5')
  })
})

describe('client grid wiring (FeaturedBriefsGrid.tsx)', () => {
  it('imports the shared window helpers instead of local math', () => {
    expect(GRID_SRC).toContain("from '@/lib/marketplaceDisplay'")
    expect(GRID_SRC).toContain("from '@/lib/marketplaceLandingUrl'")
    expect(GRID_SRC).toContain("from '@/lib/marketplaceLandingPaging'")
    for (const helper of ['clampPage', 'totalPagesFor', 'pageWindowFor', 'landingPageStatus', 'applyLandingWindow']) {
      expect(GRID_SRC).toMatch(new RegExp(`\\b${helper}\\b`))
    }
  })

  it('has no cumulative rendering state left and no Load more control', () => {
    expect(GRID_SRC).not.toContain('Load more')
    expect(GRID_SRC).not.toContain('loadMore')
    expect(GRID_SRC).not.toContain('allCards')
    expect(GRID_SRC).not.toContain('visibleCount')
    expect(GRID_SRC).not.toContain('extraCards')
    // The grid renders the current window verbatim.
    expect(GRID_SRC).toContain('{cards.map((g, idx) =>')
    expect(GRID_SRC).toContain('const { page, cards, total } = windowState')
  })

  it('fetches exactly one page window per navigation, never the inventory', () => {
    expect(GRID_SRC).toContain('landingCardsPath(country, pageToLoad)')
    expect(GRID_SRC).toContain('parseLandingCardsPage(')
    // No fan-out loop: one navigation means one request for that page.
    expect(GRID_SRC).not.toContain('MAX_PAGE_REQUESTS_PER_ACTION')
    expect(GRID_SRC).not.toMatch(/\bfor\s*\(/)
  })

  it('caches windows client-side and serves repeats from the cache', () => {
    expect(GRID_SRC).toContain('new Map([[1, initialCards]])')
    expect(GRID_SRC).toContain('const cached = pages.get(target)')
    expect(GRID_SRC).toContain('pages.set(finalPage, finalCards)')
  })

  it('resolves deep links after hydration and clamps invalid pages', () => {
    expect(GRID_SRC).toContain('parseLandingPage(window.location.search)')
    expect(GRID_SRC).toContain('clampPage(requested, snapshot.total)')
    expect(GRID_SRC).toContain('window.history.replaceState')
    // The surface stays build-static: no server searchParams/headers anywhere.
    expect(GRID_SRC).not.toContain('useSearchParams')
    expect(LANDING_SRC).not.toContain('useSearchParams')
  })

  it('pushes on explicit clicks and uses popstate for Back/Forward', () => {
    expect(GRID_SRC).toContain('window.history.pushState')
    expect(GRID_SRC).toContain("window.addEventListener('popstate', onPopState)")
    expect(GRID_SRC).toContain("void goToPage(target, 'push')")
    expect(GRID_SRC).toContain("void goToPage(parseLandingPage(window.location.search), 'none')")
    expect(GRID_SRC).toContain('event.preventDefault()')
    // Modified clicks keep native behaviour (new tab/window).
    expect(GRID_SRC).toContain('event.metaKey')
  })

  it('holds the current page while loading and never appends', () => {
    expect(GRID_SRC).toContain('aria-busy={pending}')
    expect(GRID_SRC).toContain('Loading page ${pendingPage} of ${totalPages}…')
    expect(GRID_SRC).toContain('setPendingPage(target)')
    expect(GRID_SRC).toContain('const applied = applyLandingWindow(stateRef.current, next)')
  })

  it('keeps the current page and the URL honest when a fetch fails', () => {
    expect(GRID_SRC).toContain('setFailed({ page: target, mode })')
    expect(GRID_SRC).toContain('still showing page {page} of {totalPages}')
    expect(GRID_SRC).toContain('retryFailedPage')
    // The URL is only written after a successful window application.
    expect(GRID_SRC.indexOf('const applied = applyLandingWindow')).toBeLessThan(
      GRID_SRC.indexOf('writePageUrl(applied.page, mode)'),
    )
  })

  it('renders the pager with accessible state and a restrained scroll target', () => {
    expect(GRID_SRC).toContain('landingPageStatus(page, cards.length, total)')
    expect(GRID_SRC).toContain("aria-current={p === page ? 'page' : undefined}")
    expect(GRID_SRC).toContain('aria-label="Featured briefs pagination"')
    expect(GRID_SRC).toContain('aria-label="Previous page"')
    expect(GRID_SRC).toContain('aria-label="Next page"')
    expect(GRID_SRC).toContain('tabIndex={-1}')
    expect(GRID_SRC).toContain('scrollIntoView')
    expect(GRID_SRC).toContain('prefers-reduced-motion: reduce')
    // Scroll/focus clear the sticky shell header (scrollMarginTop on cards).
    expect(GRID_SRC).toContain('scrollMarginTop')
  })

  it('hides the pager for single-page slices', () => {
    expect(GRID_SRC).toContain('total > FEATURED_PAGE_SIZE')
  })
})

describe('landing wiring (PublicMarketplaceLanding.tsx)', () => {
  it('ships the first window plus real counts, with no cumulative visible count', () => {
    expect(LANDING_SRC).toContain('<FeaturedBriefsGrid')
    expect(LANDING_SRC).toContain('cards={firstPageCards}')
    expect(LANDING_SRC).toContain('total={totalRanked}')
    expect(LANDING_SRC).toContain('categoryCounts={categoryCounts}')
    expect(LANDING_SRC).not.toContain('initialVisible')
    expect(LANDING_SRC).not.toContain('deepLinkVisibleCount')
    expect(LANDING_SRC).not.toContain('serverVisible')
  })

  it('keeps the featured section anchored and marks the SSR window', () => {
    expect(LANDING_SRC).toContain('id="featured"')
    expect(LANDING_SRC).toContain('data-ssr-page={ssrPage}')
    expect(LANDING_SRC).toContain('const ssrPage = clampPage(page, totalRanked)')
  })
})
