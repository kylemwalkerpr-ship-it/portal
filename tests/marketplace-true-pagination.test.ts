/**
 * MARKETPLACE-TRUE-PAGINATION — URL/history contract, query gate and the
 * rendered page window.
 *
 * The market root is build-static and never parses the query string on the
 * server, so page-by-page browsing is a client contract:
 *
 *  · `/?page=N` is the landing's own numbered pagination and must keep the
 *    landing — it is NOT a discovery deep link (that was the old defect: the
 *    query gate swapped the landing for GigDiscoveryPage);
 *  · every true filter/search key (country included) still opens discovery, so
 *    existing `/?country=uk` and `/?country=uk&page=2` deep links are unchanged;
 *  · the pager writes `/` for page 1 and `/?page=N` for N >= 2, pushes on an
 *    explicit click, replaces for normalization and never creates an entry for
 *    Back/Forward;
 *  · a navigation renders exactly the requested window — proven here by running
 *    the shipped pipeline (href -> parse -> clamp -> request path -> response
 *    parse -> window reducer -> status) over five 48/48/48/48/25-card windows.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FeaturedBriefsGrid } from '@/components/marketplace/FeaturedBriefsGrid'
import {
  FEATURED_PAGE_SIZE,
  clampPage,
  landingPageStatus,
  pageWindowFor,
  type LandingCardGig,
} from '@/lib/marketplaceDisplay'
import { isDiscoveryVariantRequest } from '@/lib/marketplaceDiscoveryQuery'
import {
  applyLandingWindow,
  landingCardsPath,
  parseLandingCardsPage,
  type LandingWindowState,
} from '@/lib/marketplaceLandingPaging'
import {
  LANDING_BROWSING_KEYS,
  LANDING_PAGE_PARAM,
  isLandingBrowsingQuery,
  isLandingPageOnlyQuery,
  landingPageHref,
  parseLandingPage,
} from '@/lib/marketplaceLandingUrl'

const readRepo = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const gateSource = readRepo('components/marketplace/GigsDiscoveryQueryGate.tsx')
const gridSource = readRepo('components/marketplace/FeaturedBriefsGrid.tsx')

/** Ranked fixture window: `page`'s own 48 cards (last page has the remainder). */
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

/** The `view=card` projection the listing API returns for one window. */
function apiRows(page: number, size = FEATURED_PAGE_SIZE) {
  return cardWindow(page, size).map((card) => ({
    id: card.id,
    slug: card.slug,
    title: card.title,
    category: card.category,
    provider_type: card.provider_type,
    avg_rating: card.avg_rating,
    review_count: card.review_count,
    starting_price: card.starting_price,
    delivery_days: card.delivery_days,
    provider_name: card.providerName,
    jx: card.jx,
    cover_image_url: card.cover_image_url,
  }))
}

describe('landing page URL contract (lib/marketplaceLandingUrl)', () => {
  it('parses ?page=N with the retired parsePage semantics', () => {
    expect(parseLandingPage('?page=2')).toBe(2)
    expect(parseLandingPage('page=3')).toBe(3)
    expect(parseLandingPage('?country=uk&page=4')).toBe(4)
    expect(parseLandingPage(new URLSearchParams('page=5'))).toBe(5)
    // Absent / malformed / zero / negative all fall back to the canonical page 1.
    for (const search of ['', '?', '?page=', '?page=abc', '?page=0', '?page=-2', '?country=uk', null, undefined]) {
      expect(parseLandingPage(search)).toBe(1)
    }
    // Truncation, never rounding.
    expect(parseLandingPage('?page=2.9')).toBe(2)
  })

  it('canonicalizes page 1 away and keeps the country state on later pages', () => {
    expect(landingPageHref(1)).toBe('/')
    expect(landingPageHref(2)).toBe('/?page=2')
    expect(landingPageHref(5, 'all')).toBe('/?page=5')
    expect(landingPageHref(2, 'uk')).toBe('/?page=2&country=uk')
    // Page 1 for a country slice keeps the country but still drops the pointer.
    expect(landingPageHref(1, 'uk')).toBe('/?country=uk')
    // Garbage in the builder never produces a page-0 address.
    expect(landingPageHref(0)).toBe('/')
    expect(landingPageHref(Number.NaN)).toBe('/')
  })

  it('only rewrites URLs the landing itself owns', () => {
    expect(LANDING_BROWSING_KEYS).toEqual([LANDING_PAGE_PARAM, 'country'])
    for (const own of ['', '?page=2', '?country=uk', '?page=2&country=uk', '?country=uk&page=3']) {
      expect(isLandingBrowsingQuery(own)).toBe(true)
    }
    // Another consumer's key is never dropped by a page change.
    for (const foreign of ['?lang=es', '?q=visa', '?page=2&q=visa', '?utm_source=news']) {
      expect(isLandingBrowsingQuery(foreign)).toBe(false)
    }
  })

  it('recognizes a bare page pointer as landing pagination', () => {
    expect(isLandingPageOnlyQuery('?page=2')).toBe(true)
    expect(isLandingPageOnlyQuery('?page=1')).toBe(true)
    expect(isLandingPageOnlyQuery('?page=99')).toBe(true)
    expect(isLandingPageOnlyQuery('?page=abc')).toBe(true)
    // No pointer / empty pointer / anything else is not landing pagination.
    for (const other of ['', '?page=', '?country=uk', '?country=uk&page=2', '?page=2&q=visa', '?page=2&lang=es']) {
      expect(isLandingPageOnlyQuery(other)).toBe(false)
    }
  })
})

describe('query gate — bare page browsing stays on the landing', () => {
  /** The shipped key list, read from the gate the same way its peers do. */
  const gateBlock = gateSource.slice(
    gateSource.indexOf('GIG_DISCOVERY_QUERY_KEYS = ['),
    gateSource.indexOf('] as const'),
  )
  const gateKeys = [...gateBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])

  /** The gate's decision, in the gate's own terms. */
  const opensDiscovery = (query: string) => {
    const params = new URLSearchParams(query)
    const hasKey = gateKeys.some((key) => Boolean(params.get(key)?.trim()))
    return hasKey && !isLandingPageOnlyQuery(params)
  }

  it('still recognizes every discovery key GigDiscoveryPage hydrates from', () => {
    for (const key of ['q', 'category', 'country', 'jurisdiction', 'provider_type', 'sort', 'min_price', 'max_price', 'min_rating', 'delivery_days', 'page']) {
      expect(gateKeys).toContain(key)
    }
  })

  it('keeps the landing for a bare page pointer and opens discovery for filters', () => {
    // The defect this patch fixes: /?page=3 used to swap the landing out.
    expect(opensDiscovery('?page=1')).toBe(false)
    expect(opensDiscovery('?page=3')).toBe(false)
    expect(opensDiscovery('?page=abc')).toBe(false)
    expect(opensDiscovery('')).toBe(false)
    // True filter/search keys are untouched.
    expect(opensDiscovery('?q=visa')).toBe(true)
    expect(opensDiscovery('?category=immigration')).toBe(true)
    expect(opensDiscovery('?sort=price_asc')).toBe(true)
    expect(opensDiscovery('?jurisdiction=uk')).toBe(true)
    expect(opensDiscovery('?provider_type=attorney')).toBe(true)
    expect(opensDiscovery('?min_price=50&max_price=200&min_rating=4&delivery_days=3')).toBe(true)
    expect(opensDiscovery('?q=visa&page=3')).toBe(true)
  })

  it('preserves the existing country/jurisdiction semantics', () => {
    // `country` was a discovery trigger before this patch and still is: the
    // country tabs and the discovery pagination deep links keep working.
    expect(opensDiscovery('?country=us')).toBe(true)
    expect(opensDiscovery('?country=all')).toBe(true)
    expect(opensDiscovery('?country=uk&page=2')).toBe(true)
    expect(opensDiscovery('?jurisdiction=ca&page=2')).toBe(true)
  })

  it('wires the shipped predicate into the gate', () => {
    expect(gateSource).toContain("from '@/lib/marketplaceLandingUrl'")
    expect(gateSource).toContain('isLandingPageOnlyQuery(searchParams)')
    // The key-presence check is unchanged (and pinned by the SSG estate test).
    expect(gateSource).toContain('GIG_DISCOVERY_QUERY_KEYS.some((key) => Boolean(searchParams?.get(key)?.trim()))')
  })

  it('leaves the edge noindex rule for paginated views exactly as it was', () => {
    // Browsable for users, still a duplicate document for crawlers.
    expect(isDiscoveryVariantRequest('/', new URLSearchParams('page=2'))).toBe(true)
    expect(isDiscoveryVariantRequest('/', new URLSearchParams('page=99'))).toBe(true)
    expect(isDiscoveryVariantRequest('/', new URLSearchParams(''))).toBe(false)
    expect(isDiscoveryVariantRequest('/', new URLSearchParams('page=1'))).toBe(false)
    expect(isDiscoveryVariantRequest('/', new URLSearchParams('country=uk'))).toBe(false)
  })
})

describe('a page click renders exactly that page window (shipped pipeline)', () => {
  const windows = [cardWindow(1), cardWindow(2), cardWindow(3), cardWindow(4), cardWindow(5, 25)]
  const TOTAL = 217
  const idsOf = (cards: LandingCardGig[]) => cards.map((card) => card.id)

  it('page 2 is the page-2 window, not the first 96 cards', () => {
    // 1. the anchor the user clicks / the deep link they paste
    const href = landingPageHref(2, 'all')
    expect(href).toBe('/?page=2')
    // 2. what the client parses back out of that URL
    expect(parseLandingPage(href.slice(href.indexOf('?')))).toBe(2)
    // 3. the clamped page and its page-local window (cards 49-96)
    const target = clampPage(2, TOTAL)
    expect(pageWindowFor(target, TOTAL).firstIndex).toBe(48)
    // 4. one request, for that window only
    const url = new URL(landingCardsPath('all', target), 'https://market.example')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('limit')).toBe('48')
    // 5. the response window
    const parsed = parseLandingCardsPage({ ok: true, data: { gigs: apiRows(2), total: TOTAL, hasMore: true } })
    expect(idsOf(parsed.cards)).toEqual(idsOf(windows[1]))
    // 6. the rendered window REPLACES page 1 — never 96 cards, never a prefix
    const state = applyLandingWindow(
      { page: 1, cards: windows[0], total: TOTAL },
      { page: target, cards: parsed.cards, total: parsed.total },
    )
    expect(idsOf(state.cards)).toEqual(idsOf(windows[1]))
    expect(state.cards).toHaveLength(FEATURED_PAGE_SIZE)
    const pageOneIds = new Set(idsOf(windows[0]))
    expect(state.cards.some((card) => pageOneIds.has(card.id))).toBe(false)
    expect(landingPageStatus(state.page, state.cards.length, state.total)).toBe('Showing 49-96 of 217 · Page 2 of 5')
  })

  it('the final page renders only its remainder and says so', () => {
    const parsed = parseLandingCardsPage({ ok: true, data: { gigs: apiRows(5, 25), total: TOTAL, hasMore: false } })
    const state: LandingWindowState = applyLandingWindow(
      { page: 1, cards: windows[0], total: TOTAL },
      { page: 5, cards: parsed.cards, total: parsed.total },
    )
    expect(idsOf(state.cards)).toEqual(idsOf(windows[4]))
    expect(state.cards).toHaveLength(25)
    expect(landingPageStatus(state.page, state.cards.length, state.total)).toBe('Showing 193-217 of 217 · Page 5 of 5')
    expect(pageWindowFor(5, TOTAL).hasNext).toBe(false)
  })

  it('never requests the whole inventory, whatever page is opened', () => {
    for (const page of [1, 2, 3, 4, 5]) {
      const url = new URL(landingCardsPath('uk', page), 'https://market.example')
      expect(url.searchParams.get('limit')).toBe('48')
      expect(url.searchParams.get('page')).toBe(String(page))
      expect(url.searchParams.get('view')).toBe('card')
      expect(url.searchParams.get('country')).toBe('uk')
    }
  })
})

describe('server-rendered document is exactly the page-1 window', () => {
  const html = renderToStaticMarkup(
    createElement(FeaturedBriefsGrid, {
      cards: cardWindow(1),
      total: 217,
      categoryCounts: {},
      country: 'all',
      currency: 'USD',
    }),
  )

  it('renders one page of cards and none of page 2', () => {
    expect(html.match(/class="gig-link"/g) ?? []).toHaveLength(FEATURED_PAGE_SIZE)
    expect(html).toContain('Brief 47') // last card of page 1
    expect(html).not.toContain('Brief 48') // first card of page 2
    expect(html.match(/data-idx="\d+"/g) ?? []).toHaveLength(FEATURED_PAGE_SIZE)
  })

  it('has no Load more control and announces the real range', () => {
    expect(html).not.toContain('Load more')
    expect(html).toContain('Showing 1-48 of 217 · Page 1 of 5')
  })

  it('renders an accessible pager whose links are the canonical page URLs', () => {
    expect(html).toContain('aria-label="Featured briefs pagination"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/?page=2"')
    expect(html).toContain('href="/?page=5"')
    expect(html).toContain('aria-label="Next page"')
    // Page 1 is already the window on screen, so there is no Previous link.
    expect(html).not.toContain('aria-label="Previous page"')
  })
})

describe('History API contract (source)', () => {
  it('pushes for clicks, replaces for normalization and never pushes on popstate', () => {
    expect(gridSource).toContain('window.history.pushState')
    expect(gridSource).toContain('window.history.replaceState')
    // Both writers live behind one mode switch that skips 'none'.
    expect(gridSource).toContain("if (mode === 'none' || typeof window === 'undefined') return")
    expect(gridSource).toContain("window.addEventListener('popstate', onPopState)")
    expect(gridSource).toContain("void goToPage(parseLandingPage(window.location.search), 'none')")
    // A clamped Back/Forward target repairs the URL with replaceState, not a push.
    expect(gridSource).toContain("mode === 'none' ? (finalPage === requested ? 'none' : 'replace') : mode")
  })

  it('never rewrites a URL the landing does not own', () => {
    expect(gridSource).toContain('if (isLandingBrowsingQuery(search))')
  })
})
