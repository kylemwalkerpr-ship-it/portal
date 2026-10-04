/**
 * Market jurisdiction persistence (lib/marketJurisdiction.ts,
 * components/marketplace/MarketJurisdictionSync.tsx).
 *
 * Precedence: explicit URL param > stored cookie > 'all'.
 * SSR/client agreement: Market documents are build-static, so the server
 * render (and the first client render that hydrates it) must not depend on
 * the cookie; the stored value is applied after hydration.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockSearch = { value: '' }
const mockPath = { value: '/' }
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  usePathname: () => mockPath.value,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}))

import {
  MARKET_JURISDICTION_COOKIE,
  MARKET_JURISDICTION_COOKIE_MAX_AGE,
  marketJurisdictionAppliesTo,
  normalizeMarketJurisdiction,
  planMarketJurisdictionSync,
  readMarketJurisdictionCookie,
  readUrlJurisdiction,
  resolveMarketJurisdiction,
  serializeMarketJurisdictionCookie,
  urlWithStoredJurisdiction,
} from '@/lib/marketJurisdiction'
import { MarketJurisdictionSync } from '@/components/marketplace/MarketJurisdictionSync'
import { JurisdictionDropdown } from '@/components/marketplace/JurisdictionDropdown'

const root = join(__dirname, '..')
const src = (p: string) => readFileSync(join(root, p), 'utf8')

describe('cookie format', () => {
  it('is a host-only, first-party, long-lived Lax cookie readable server-side', () => {
    const c = serializeMarketJurisdictionCookie('uk')
    expect(c).toBe(`${MARKET_JURISDICTION_COOKIE}=uk; Path=/; Max-Age=${MARKET_JURISDICTION_COOKIE_MAX_AGE}; SameSite=Lax; Secure`)
    expect(c).not.toMatch(/Domain=/i)
    expect(c).not.toMatch(/HttpOnly/i) // client writes it too
    expect(MARKET_JURISDICTION_COOKIE_MAX_AGE).toBe(31536000)
    expect(serializeMarketJurisdictionCookie('all', { secure: false })).not.toMatch(/Secure/)
  })

  it('parses from a Cookie header / document.cookie and rejects junk', () => {
    expect(readMarketJurisdictionCookie(`a=1; ${MARKET_JURISDICTION_COOKIE}=ca; b=2`)).toBe('ca')
    expect(readMarketJurisdictionCookie(`${MARKET_JURISDICTION_COOKIE}=ALL`)).toBe('all')
    expect(readMarketJurisdictionCookie(`${MARKET_JURISDICTION_COOKIE}=fr`)).toBeNull()
    expect(readMarketJurisdictionCookie(`x${MARKET_JURISDICTION_COOKIE}=uk`)).toBeNull()
    expect(readMarketJurisdictionCookie(`${MARKET_JURISDICTION_COOKIE}=%E0%A4%A`)).toBeNull()
    expect(readMarketJurisdictionCookie('')).toBeNull()
    expect(readMarketJurisdictionCookie(undefined)).toBeNull()
  })

  it('normalizes only known codes', () => {
    expect(normalizeMarketJurisdiction(' UK ')).toBe('uk')
    expect(normalizeMarketJurisdiction('au')).toBe('au')
    expect(normalizeMarketJurisdiction('gb')).toBeNull()
    expect(normalizeMarketJurisdiction(null)).toBeNull()
  })
})

describe('precedence: URL param > cookie > default', () => {
  const url = (q: string) => readUrlJurisdiction(new URLSearchParams(q))

  it.each([
    // [query, cookie, value, source, persist]
    ['', null, 'all', 'default', null],
    ['', 'uk', 'uk', 'stored', null],
    ['', 'all', 'all', 'stored', null],
    ['country=ca', null, 'ca', 'url', 'ca'],
    ['country=ca', 'uk', 'ca', 'url', 'ca'],
    ['country=uk', 'uk', 'uk', 'url', null],
    ['country=all', 'uk', 'all', 'url', 'all'],
    ['jurisdiction=au', 'uk', 'au', 'url', 'au'],
    ['jurisdiction=us&jurisdiction=uk', 'ca', 'all', 'url', null],
    ['country=zz', 'uk', 'uk', 'stored', null],
  ])('?%s with cookie %s → %s (%s), persist %s', (q, stored, value, source, persist) => {
    expect(resolveMarketJurisdiction({ url: url(q), stored: stored as any })).toEqual({ value, source, persist })
  })
})

describe('applying a stored value to the URL', () => {
  const sp = (q: string) => new URLSearchParams(q)

  it('applies on listing pages only', () => {
    expect(marketJurisdictionAppliesTo('/', sp(''))).toBe(true)
    expect(marketJurisdictionAppliesTo('/gigs', sp(''))).toBe(true)
    expect(marketJurisdictionAppliesTo('/categories', sp(''))).toBe(true)
    expect(marketJurisdictionAppliesTo('/categories/immigration', sp(''))).toBe(true)
    expect(marketJurisdictionAppliesTo('/gigs/some-gig', sp(''))).toBe(false)
    expect(marketJurisdictionAppliesTo('/shop', sp(''))).toBe(false)
    expect(marketJurisdictionAppliesTo('/', sp('view=orders'))).toBe(false)
  })

  it('adds ?country= while keeping other params (pagination survives)', () => {
    expect(urlWithStoredJurisdiction('/categories/immigration', sp('page=2&sort=price'), 'uk')).toBe(
      '/categories/immigration?page=2&sort=price&country=uk',
    )
    expect(urlWithStoredJurisdiction('/', sp(''), 'au')).toBe('/?country=au')
  })

  it('never overrides an explicit URL choice, "all", or non-listing pages', () => {
    expect(urlWithStoredJurisdiction('/', sp('country=ca'), 'uk')).toBeNull()
    expect(urlWithStoredJurisdiction('/', sp('jurisdiction=us&jurisdiction=ca'), 'uk')).toBeNull()
    expect(urlWithStoredJurisdiction('/', sp(''), 'all')).toBeNull()
    expect(urlWithStoredJurisdiction('/', sp(''), null)).toBeNull()
    expect(urlWithStoredJurisdiction('/gigs/x', sp(''), 'uk')).toBeNull()
  })

  it('plans the full post-hydration sync', () => {
    const cookie = `${MARKET_JURISDICTION_COOKIE}=uk`
    expect(planMarketJurisdictionSync({ pathname: '/categories/immigration', search: 'page=3', hash: '#r', cookie })).toEqual({
      value: 'uk', source: 'stored', writeCookie: null, replaceUrl: '/categories/immigration?page=3&country=uk#r',
    })
    // URL wins and updates the stored value.
    expect(planMarketJurisdictionSync({ pathname: '/', search: 'country=ca', cookie })).toEqual({
      value: 'ca', source: 'url', writeCookie: 'ca', replaceUrl: null,
    })
    // Fresh visitor: nothing to do.
    expect(planMarketJurisdictionSync({ pathname: '/', search: '', cookie: '' })).toEqual({
      value: 'all', source: 'default', writeCookie: null, replaceUrl: null,
    })
    // Gig detail keeps its URL but the header still shows the stored choice.
    expect(planMarketJurisdictionSync({ pathname: '/gigs/x', search: '', cookie })).toEqual({
      value: 'uk', source: 'stored', writeCookie: null, replaceUrl: null,
    })
  })
})

describe('SSR / client agreement', () => {
  it('the sync component renders nothing and does no work during the server render', () => {
    mockSearch.value = 'country=ca'
    mockPath.value = '/categories/immigration'
    const onResolved = jest.fn()
    expect(renderToStaticMarkup(createElement(MarketJurisdictionSync, { onResolved }))).toBe('')
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('the header selector server-renders the default until the client resolves', () => {
    mockSearch.value = ''
    mockPath.value = '/'
    const html = renderToStaticMarkup(createElement(JurisdictionDropdown, { active: 'all' }))
    expect(html).toContain('All jurisdictions')
  })

  it('the shell starts from "all" and only resolves the stored value in an effect', () => {
    const shell = src('components/marketplace/MarketplaceShell.tsx')
    expect(shell).toMatch(/useState<MarketJurisdiction>\('all'\)/)
    expect(shell).not.toMatch(/document\.cookie/)
    expect(shell).toMatch(/<React\.Suspense fallback=\{null\}>\s*<MarketJurisdictionSync onResolved=\{setCountry\} \/>/)
    const sync = src('components/marketplace/MarketJurisdictionSync.tsx')
    // Cookie and history are touched only inside useEffect (never in render).
    const effectStart = sync.indexOf('React.useEffect(')
    expect(effectStart).toBeGreaterThan(0)
    expect(sync.indexOf('document.cookie')).toBeGreaterThan(effectStart)
    expect(sync.indexOf('history.replaceState')).toBeGreaterThan(effectStart)
    // replaceState, not router.replace: no RSC request to the Worker.
    expect(sync).not.toMatch(/router\.(replace|push)/)
  })

  it('explicit choices write the cookie (header selector, landing tabs, catalogue filter)', () => {
    expect(src('components/marketplace/JurisdictionDropdown.tsx')).toMatch(/rememberMarketJurisdiction\(value\)/)
    expect(src('components/marketplace/CountryTabs.tsx').match(/rememberMarketJurisdiction\(code\)/g)?.length).toBe(2)
    const discovery = src('components/marketplace/GigDiscoveryPage.tsx')
    expect(discovery).toMatch(/onJurisdictionsChange=\{chooseJurisdictions\}/)
    expect(discovery).toMatch(/onJurisdictionsChange=\{\(v\) => \{ chooseJurisdictions\(v\); setPage\(1\) \}\}/)
    expect(discovery).toMatch(/rememberMarketJurisdiction\('all'\)/)
  })

  it('does not reuse the residence-country profile column for the browse filter', () => {
    for (const p of [
      'lib/marketJurisdiction.ts',
      'components/marketplace/MarketJurisdictionSync.tsx',
      'components/marketplace/JurisdictionDropdown.tsx',
    ]) {
      expect(src(p)).not.toMatch(/\/api\/profile\/country/)
    }
  })
})
