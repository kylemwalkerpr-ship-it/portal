/**
 * MARKETPLACE LANDING — DISCOVERY-QUERY NOINDEX PARITY (edge level).
 *
 * `app/marketplace/page.tsx` is TRUE SSG with static metadata now, so it can no
 * longer emit query-sensitive robots metadata. The retired implementation
 * noindexed the landing for:
 *
 *   · any discovery filter key — q, category, sort, jurisdiction,
 *     provider_type, min_price, max_price, min_rating, delivery_days;
 *   · tracking variants (utm_*), which middleware 301-strips before the route
 *     is ever reached; and
 *   · paginated views `?page=N`, N >= 2.
 *
 * `?country=` was NOT in that set and stays indexable, as does the clean root.
 * The equivalent contract is therefore enforced at the market-host edge via
 * `X-Robots-Tag: noindex, follow`, backed by `lib/marketplaceDiscoveryQuery.ts`.
 * The same key set is applied to the equally build-static `/gigs` service
 * directory; the surface boundary (`/` + `/gigs` only) and the "no stripping"
 * guarantees are locked in tests/marketplace-discovery-variant-noindex.test.ts.
 *
 * The parity matrix below executes that shipped module (no copies, no source
 * string evaluation), so dropping a filter key, noindexing `?country=`, or
 * noindexing `?page=1` all fail here. The final assertions pin the wiring that
 * applies the predicate to the landing rewrite in `middleware.ts`.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  DISCOVERY_FILTER_KEYS,
  isDiscoveryQueryVariant,
  parseDiscoveryPage,
} from '@/lib/marketplaceDiscoveryQuery'

const readRepo = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const middleware = readRepo('middleware.ts')
const landing = readRepo('app/marketplace/page.tsx')

/** The exact list the retired landing metadata treated as noindex variants. */
const RETIRED_DISCOVERY_FILTER_KEYS = [
  'q',
  'category',
  'sort',
  'jurisdiction',
  'provider_type',
  'min_price',
  'max_price',
  'min_rating',
  'delivery_days',
]

/** Query strings that must stay indexable — clean root, country, page 1. */
const INDEXABLE_QUERY_STRINGS = [
  '',
  'country=uk',
  'country=us',
  'country=all',
  'page=1',
  'page=0',
  'page=-2',
  'page=abc',
  'page=',
  'lang=es',
]

const variant = (queryString: string) => isDiscoveryQueryVariant(new URLSearchParams(queryString))

describe('marketplace landing discovery-query noindex parity (market-host edge)', () => {
  it('keeps the retired filter key set exactly — no more, no less', () => {
    expect(DISCOVERY_FILTER_KEYS).toEqual(RETIRED_DISCOVERY_FILTER_KEYS)
    // `country` was never noindexed; page/lang are handled by other rules.
    expect(DISCOVERY_FILTER_KEYS).not.toContain('country')
    expect(DISCOVERY_FILTER_KEYS).not.toContain('page')
    expect(DISCOVERY_FILTER_KEYS).not.toContain('lang')
  })

  it('noindexes the legacy free-text q variant', () => {
    expect(variant('q=visa')).toBe(true)
    expect(variant('q=green%20card%20help')).toBe(true)
    // Presence, not a non-empty value: parity with `sp[key] !== undefined`.
    expect(variant('q=')).toBe(true)
  })

  it('noindexes every non-q discovery filter key', () => {
    for (const key of RETIRED_DISCOVERY_FILTER_KEYS.filter((k) => k !== 'q')) {
      expect(variant(`${key}=value`)).toBe(true)
    }
    // Named cases so a drift reads clearly in CI output.
    expect(variant('category=immigration')).toBe(true)
    expect(variant('sort=price_asc')).toBe(true)
    expect(variant('jurisdiction=uk&provider_type=attorney')).toBe(true)
    expect(variant('min_price=50&max_price=200&min_rating=4&delivery_days=3')).toBe(true)
  })

  it('noindexes paginated views with the retired parsePage semantics', () => {
    expect(variant('page=2')).toBe(true)
    expect(variant('page=99')).toBe(true)
    expect(variant('q=visa&page=3')).toBe(true)
    expect(parseDiscoveryPage('2')).toBe(2)
    // Malformed / zero / negative / page 1 fall back to the clean landing.
    expect(variant('page=1')).toBe(false)
    expect(variant('page=0')).toBe(false)
    expect(variant('page=-2')).toBe(false)
    expect(variant('page=abc')).toBe(false)
    expect(variant('page=')).toBe(false)
  })

  it('keeps the clean root and ?country= indexable (prior behaviour preserved)', () => {
    for (const queryString of INDEXABLE_QUERY_STRINGS) {
      expect(variant(queryString)).toBe(false)
    }
  })

  it('leaves utm_* to the earlier 301 strip rather than the robots rule', () => {
    expect(variant('utm_source=newsletter&utm_campaign=launch')).toBe(false)
    const stripCall = middleware.indexOf('stripTrackingParams(new URL(req.url))')
    const robotsCall = middleware.indexOf('isDiscoveryVariantRequest(pathname, req.nextUrl.searchParams)')
    expect(stripCall).toBeGreaterThan(-1)
    expect(robotsCall).toBeGreaterThan(stripCall)
    expect(middleware).toContain("key.toLowerCase().startsWith('utm_')")
  })

  it('applies the predicate on the market-host rewrite, once', () => {
    // Single source of truth: the key list lives in the module, not in the
    // middleware body (a re-inlined copy would drift from this matrix).
    expect(middleware).toContain(
      "import { isDiscoveryVariantRequest } from './lib/marketplaceDiscoveryQuery'",
    )
    expect(middleware).not.toMatch(/const\s+DISCOVERY_FILTER_KEYS/)
    expect(middleware).not.toMatch(/function\s+parseDiscoveryPage/)

    expect(middleware).toContain(
      'if (isDiscoveryVariantRequest(pathname, req.nextUrl.searchParams))',
    )
    expect(middleware).toContain("response.headers.set('X-Robots-Tag', 'noindex, follow')")
    // Exactly one robots emission in the whole file, inside the market-host
    // branch and after the redirect handling above it.
    expect(middleware.match(/headers\.set\('X-Robots-Tag'/g)?.length).toBe(1)
    expect(middleware.indexOf("headers.set('X-Robots-Tag'")).toBeGreaterThan(
      middleware.indexOf('const rewrite = new URL(`/marketplace${pathname}${search}`, req.url)'),
    )
    expect(middleware).toContain('withCorsHeaders(response, req)')
  })

  it('keeps the static landing metadata indexable so the edge rule is the only gate', () => {
    expect(landing).toContain('robots: { index: true, follow: true }')
    expect(landing).not.toMatch(/robots:\s*\{[^}]*index:\s*false/)
    expect(landing).not.toContain('generateMetadata')
    expect(landing).not.toContain('searchParams')
  })
})
