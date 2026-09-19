/**
 * MARKETPLACE DISCOVERY-VARIANT NOINDEX CONTRACT (market-host edge).
 *
 * The public Marketplace SEO estate is TRUE SSG: `/` (the landing) and `/gigs`
 * (the service directory) both ship static `robots: { index: true, follow:
 * true }` metadata, so neither page can emit a query-sensitive robots
 * directive any more. The equivalent protection now lives at the host edge —
 * `middleware.ts` sets `X-Robots-Tag: noindex, follow` for recognized
 * discovery variants of those clean URLs, backed by
 * `lib/marketplaceDiscoveryQuery.ts`.
 *
 * Locked here:
 *
 *  · the exact surface set — `/` and `/gigs` only, so `/gigs/<slug>`,
 *    `/providers/<id>` and `/categories/<slug>` keep the indexability they had
 *    before this patch;
 *  · `q`, non-`q` filter keys and `?page=N` (N >= 2) on both surfaces;
 *  · clean `/` and clean `/gigs` — plus `?country=` and `?lang=`, which were
 *    never noindexed — stay indexable;
 *  · discovery params are never stripped or redirected away: only the robots
 *    directive changes, and tracking params keep their earlier 301;
 *  · both pages keep their indexable static metadata, so the edge rule is the
 *    only gate and the clean canonical URL cannot be caught by it.
 *
 * The matrix executes the shipped predicate module (no copies), so dropping a
 * filter key, widening the surface set, or noindexing a clean URL fails here.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  DISCOVERY_FILTER_KEYS,
  DISCOVERY_VARIANT_PATHS,
  isDiscoveryQueryVariant,
  isDiscoveryVariantPath,
  isDiscoveryVariantRequest,
} from '@/lib/marketplaceDiscoveryQuery'

const readRepo = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const middleware = readRepo('middleware.ts')
const landing = readRepo('app/marketplace/page.tsx')
const gigsHub = readRepo('app/marketplace/gigs/page.tsx')
const queryGate = readRepo('components/marketplace/GigsDiscoveryQueryGate.tsx')

const request = (pathname: string, queryString = '') =>
  isDiscoveryVariantRequest(pathname, new URLSearchParams(queryString))

const REWRITE_CALL = 'const rewrite = new URL(`${internalPath}${search}`, req.url)'
const ROBOTS_CALL = "headers.set('X-Robots-Tag'"
const STRIP_CALL = 'stripTrackingParams(new URL(req.url))'

/** Query strings that must stay indexable on BOTH clean surfaces. */
const CLEAN_QUERY_STRINGS = [
  '',
  'country=uk',
  'country=us',
  'country=all',
  'lang=es',
  'page=1',
  'page=0',
  'page=-2',
  'page=abc',
  'page=',
]

describe('market-host discovery-variant surface set', () => {
  it('covers exactly the two clean, build-static discovery surfaces', () => {
    expect(DISCOVERY_VARIANT_PATHS).toEqual(['/', '/gigs'])
    expect(isDiscoveryVariantPath('/')).toBe(true)
    expect(isDiscoveryVariantPath('/gigs')).toBe(true)
    // Request-side tolerance for the pre-canonicalization trailing slash.
    expect(isDiscoveryVariantPath('/gigs/')).toBe(true)
  })

  it('leaves every other public path out of the rule (prior indexability)', () => {
    const untouched = [
      '/gigs/visa-eb2',
      '/providers/acme-law',
      '/categories/immigration',
      '/categories',
      '/providers',
      '/shop',
    ]
    for (const pathname of untouched) {
      expect(isDiscoveryVariantPath(pathname)).toBe(false)
      expect(request(pathname, 'q=visa')).toBe(false)
      expect(request(pathname, 'category=immigration&sort=price_asc')).toBe(false)
      expect(request(pathname, 'page=3')).toBe(false)
    }
  })
})

describe('landing (/) — clean root stays indexable, variants do not', () => {
  it('keeps the clean root indexable', () => {
    for (const queryString of CLEAN_QUERY_STRINGS) {
      expect(request('/', queryString)).toBe(false)
    }
  })

  it('noindexes q, a non-q filter and page >= 2', () => {
    expect(request('/', 'q=visa')).toBe(true)
    expect(request('/', 'category=immigration')).toBe(true)
    expect(request('/', 'page=2')).toBe(true)
  })
})

describe('/gigs hub — same parity so filtered deep links never become index inventory', () => {
  it('keeps the clean /gigs URL indexable', () => {
    for (const queryString of CLEAN_QUERY_STRINGS) {
      expect(request('/gigs', queryString)).toBe(false)
    }
    expect(isDiscoveryQueryVariant(new URLSearchParams(''))).toBe(false)
  })

  it('noindexes q on /gigs, including the legacy empty q=', () => {
    expect(request('/gigs', 'q=visa')).toBe(true)
    expect(request('/gigs', 'q=green%20card%20help')).toBe(true)
    // Presence, not a non-empty value: parity with the retired `sp.q` check.
    expect(request('/gigs', 'q=')).toBe(true)
  })

  it('noindexes every non-q filter key on /gigs', () => {
    for (const key of DISCOVERY_FILTER_KEYS.filter((k) => k !== 'q')) {
      expect(request('/gigs', `${key}=value`)).toBe(true)
    }
    // Named cases so a drift reads clearly in CI output.
    expect(request('/gigs', 'category=immigration')).toBe(true)
    expect(request('/gigs', 'sort=price_asc')).toBe(true)
    expect(request('/gigs', 'jurisdiction=uk&provider_type=attorney')).toBe(true)
    expect(request('/gigs', 'min_price=50&max_price=200&min_rating=4&delivery_days=3')).toBe(true)
  })

  it('noindexes paginated /gigs views with the retired parsePage semantics', () => {
    expect(request('/gigs', 'page=2')).toBe(true)
    expect(request('/gigs', 'page=99')).toBe(true)
    expect(request('/gigs', 'q=visa&page=3')).toBe(true)
    expect(request('/gigs', 'page=1')).toBe(false)
    expect(request('/gigs', 'page=abc')).toBe(false)
  })
})

describe('edge wiring — header only, params untouched, tracking 301 preserved', () => {
  it('applies the shared predicate to the market-host rewrite', () => {
    expect(middleware).toContain(
      "import { isDiscoveryVariantRequest } from './lib/marketplaceDiscoveryQuery'",
    )
    expect(middleware).toContain('if (isDiscoveryVariantRequest(pathname, req.nextUrl.searchParams))')
    // The un-scoped predicate is never called directly (that would lose the
    // `/` + `/gigs` surface boundary), and the key list / page parser are not
    // re-inlined in the middleware body.
    expect(middleware).not.toContain('isDiscoveryQueryVariant(')
    expect(middleware).not.toMatch(/const\s+DISCOVERY_FILTER_KEYS/)
    expect(middleware).not.toMatch(/DISCOVERY_VARIANT_PATHS/)
    expect(middleware).not.toMatch(/function\s+parseDiscoveryPage/)
  })

  it('sets exactly one robots header, inside the market rewrite and after the tracking 301', () => {
    expect(middleware.match(/headers\.set\('X-Robots-Tag'/g)?.length).toBe(1)
    expect(middleware).toContain("response.headers.set('X-Robots-Tag', 'noindex, follow')")

    const robotsCall = middleware.indexOf(ROBOTS_CALL)
    const rewriteCall = middleware.indexOf(REWRITE_CALL)
    const stripCall = middleware.indexOf(STRIP_CALL)
    expect(rewriteCall).toBeGreaterThan(-1)
    expect(stripCall).toBeGreaterThan(-1)
    expect(robotsCall).toBeGreaterThan(rewriteCall)
    expect(stripCall).toBeLessThan(robotsCall)
    // The rule lives in the dedicated market fast-path handler, which the
    // outer host guard invokes before Clerk. Portal traffic never enters it.
    const fastPathStart = middleware.indexOf('function handleMarketHostRequest(')
    const fastPathEnd = middleware.indexOf('const clerkHandler = clerkMiddleware(', fastPathStart)
    const outerMarketGuard = middleware.indexOf('requestHostname(req) === MARKET_HOST')
    const fastPathReturn = middleware.indexOf('return handleMarketHostRequest(req)', outerMarketGuard)
    expect(fastPathStart).toBeLessThan(rewriteCall)
    expect(robotsCall).toBeLessThan(fastPathEnd)
    expect(outerMarketGuard).toBeGreaterThan(fastPathEnd)
    expect(fastPathReturn).toBeGreaterThan(outerMarketGuard)
  })

  it('never strips or redirects a recognized discovery param', () => {
    const setStart = middleware.indexOf('const STRIP_QUERY_KEYS = new Set([')
    expect(setStart).toBeGreaterThan(-1)
    const stripBlock = middleware.slice(setStart, middleware.indexOf('])', setStart))
    for (const key of [...DISCOVERY_FILTER_KEYS, 'page', 'country', 'lang']) {
      expect(stripBlock).not.toContain(`'${key}'`)
    }
    // Tracking keys keep their existing 301 consolidation.
    expect(stripBlock).toContain("'utm_source'")
    expect(stripBlock).toContain("'gclid'")
    expect(middleware).toContain("key.toLowerCase().startsWith('utm_')")
    expect(middleware).toContain('NextResponse.redirect(dest, { status: 301 })')

    // The robots branch is header-only: no param mutation, no redirect.
    const robotsBranch = middleware.slice(
      middleware.indexOf(REWRITE_CALL),
      middleware.indexOf('return withCorsHeaders(response, req)'),
    )
    expect(robotsBranch).not.toContain('searchParams.delete')
    expect(robotsBranch).not.toContain('searchParams.set')
    expect(robotsBranch).not.toContain('NextResponse.redirect')
    expect(robotsBranch).toContain('X-Robots-Tag')
  })

  it('keeps both static documents indexable so only the edge rule can noindex', () => {
    // `/` (landing) and `/gigs` (service directory): the page files must not
    // carry a noindex of their own — not statically, not at runtime.
    for (const source of [landing, gigsHub]) {
      expect(source).toContain('robots: { index: true, follow: true }')
      expect(source).not.toMatch(/robots:\s*\{[^}]*index:\s*false/)
      expect(source).not.toContain('generateMetadata')
      expect(source).not.toContain('X-Robots-Tag')
    }
  })

  it('keeps the edge key set in step with the client discovery gate', () => {
    // Drift guard: every key the client gate hydrates from is either noindexed
    // at the edge or explicitly exempt — `country` keeps its prior
    // indexability, `page` only duplicates the clean URL at N >= 2. A new
    // discovery key added to the gate therefore fails here until it is either
    // listed in DISCOVERY_FILTER_KEYS or consciously exempted.
    const gateBlock = queryGate.slice(
      queryGate.indexOf('GIG_DISCOVERY_QUERY_KEYS = ['),
      queryGate.indexOf('] as const'),
    )
    const gateKeys = [...gateBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(gateKeys).toContain('q')
    expect(gateKeys).toContain('country')
    expect(gateKeys).toContain('page')

    for (const key of gateKeys) {
      if (key === 'country' || key === 'page') continue
      expect(DISCOVERY_FILTER_KEYS).toContain(key)
      expect(request('/gigs', `${key}=x`)).toBe(true)
      expect(request('/', `${key}=x`)).toBe(true)
    }

    expect(DISCOVERY_FILTER_KEYS).not.toContain('country')
    expect(DISCOVERY_FILTER_KEYS).not.toContain('page')
    expect(request('/gigs', 'page=2')).toBe(true)
    expect(request('/gigs', 'country=us')).toBe(false)
  })
})
