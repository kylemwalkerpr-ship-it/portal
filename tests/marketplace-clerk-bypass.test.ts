import fs from 'node:fs'
import path from 'node:path'
import { shouldBypassClerkForMarketRequest } from '@/lib/marketplaceMiddlewareBypass'

const root = process.cwd()
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')

const params = (value = '') => new URLSearchParams(value)

describe('Marketplace Clerk bypass boundary', () => {
  test('public market documents skip Clerk', () => {
    for (const pathname of [
      '/',
      '/gigs',
      '/gigs/example-service',
      '/categories',
      '/categories/immigration',
      '/providers',
      '/providers/example',
      '/shop',
      '/shop/example',
      '/sellers/example',
      '/sitemap.xml',
      '/dashboard',
      '/sign-in/student',
    ]) {
      expect(shouldBypassClerkForMarketRequest(pathname, params(), false)).toBe(true)
    }
  })

  test('all market APIs remain behind Clerk', () => {
    for (const pathname of [
      '/api/profile',
      '/api/marketplace/gigs',
      '/api/gigs/123/publish',
      '/api/messages/start',
      '/api/wallet/balance',
      '/api/admin/users',
    ]) {
      expect(shouldBypassClerkForMarketRequest(pathname, params(), false)).toBe(false)
    }
  })

  test('the authenticated sellers directory remains behind Clerk', () => {
    expect(shouldBypassClerkForMarketRequest('/sellers', params(), false)).toBe(false)
    expect(shouldBypassClerkForMarketRequest('/sellers/', params(), false)).toBe(false)
    expect(shouldBypassClerkForMarketRequest('/sellers/example', params(), false)).toBe(true)
  })

  test('Clerk handshake query parameters force the Clerk path', () => {
    expect(shouldBypassClerkForMarketRequest('/', params('__clerk_handshake=1'), false)).toBe(false)
    expect(shouldBypassClerkForMarketRequest('/gigs', params('__clerk_synced=true'), false)).toBe(false)
  })

  test('normal discovery and tracking params stay on the fast path', () => {
    expect(shouldBypassClerkForMarketRequest('/', params('q=visa'), false)).toBe(true)
    expect(shouldBypassClerkForMarketRequest('/gigs', params('page=2'), false)).toBe(true)
    expect(shouldBypassClerkForMarketRequest('/', params('utm_source=test'), false)).toBe(true)
  })

  test('allowed preflight skips Clerk even for an API', () => {
    expect(
      shouldBypassClerkForMarketRequest('/api/messages/start', params(), true),
    ).toBe(true)
  })
})

describe('middleware wiring', () => {
  test('Clerk is a delegated handler instead of the default wrapper', () => {
    expect(middleware).toContain('const clerkHandler = clerkMiddleware(')
    expect(middleware).not.toContain('export default clerkMiddleware(')
    expect(middleware).toContain('export default function middleware(')
  })

  test('market-host public requests are routed before Clerk', () => {
    const wrapper = middleware.indexOf('export default function middleware(')
    const marketGuard = middleware.indexOf('requestHostname(req) === MARKET_HOST', wrapper)
    const fastPath = middleware.indexOf('return handleMarketHostRequest(req)', marketGuard)
    const clerkFallback = middleware.indexOf('return clerkHandler(req, event)', fastPath)

    expect(wrapper).toBeGreaterThan(-1)
    expect(marketGuard).toBeGreaterThan(wrapper)
    expect(fastPath).toBeGreaterThan(marketGuard)
    expect(clerkFallback).toBeGreaterThan(fastPath)
  })

  test('protected routes retain Clerk auth enforcement', () => {
    const clerkStart = middleware.indexOf('const clerkHandler = clerkMiddleware(')
    const clerkBody = middleware.slice(clerkStart)
    expect(clerkBody).toContain('const { userId } = await auth()')
    expect(clerkBody).toContain("if (pathname.startsWith('/api/'))")
    expect(clerkBody).toContain("error: 'Unauthorized'")
    expect(clerkBody).toContain('authorizedParties:')
  })

  test('Clerk handshakes rejoin market routing after the wrapper', () => {
    const clerkStart = middleware.indexOf('const clerkHandler = clerkMiddleware(')
    const handshakeFallback = middleware.indexOf("pathname !== '/sellers'", clerkStart)
    const fastPathReturn = middleware.indexOf('return handleMarketHostRequest(req)', handshakeFallback)
    const authCall = middleware.indexOf('const { userId } = await auth()', fastPathReturn)

    expect(handshakeFallback).toBeGreaterThan(clerkStart)
    expect(middleware.slice(handshakeFallback, fastPathReturn)).toContain("!pathname.startsWith('/api/')")
    expect(fastPathReturn).toBeGreaterThan(handshakeFallback)
    expect(authCall).toBeGreaterThan(fastPathReturn)
  })

  test('fast path preserves market routing and SEO contracts', () => {
    const start = middleware.indexOf('function handleMarketHostRequest(')
    const end = middleware.indexOf('const clerkHandler = clerkMiddleware(', start)
    const fastPath = middleware.slice(start, end)

    expect(fastPath).toContain("pathname === '/marketplace'")
    expect(fastPath).toContain('NextResponse.redirect(target, { status: 301 })')
    expect(fastPath).toContain("pathname.startsWith('/api/')")
    expect(fastPath).toContain("pathname.startsWith('/sellers')")
    expect(fastPath).toContain("pathname === '/shop'")
    expect(fastPath).toContain("pathname === '/sitemap.xml'")
    expect(fastPath).toContain("const internalPath = pathname === '/' ? '/marketplace' : `/marketplace${pathname}`")
    expect(fastPath).toContain('NextResponse.rewrite(rewrite)')
    expect(fastPath).toContain('isDiscoveryVariantRequest(pathname, req.nextUrl.searchParams)')
    expect(fastPath).toContain("'X-Robots-Tag', 'noindex, follow'")
    expect(fastPath).toContain('isAllowedCorsPreflight(req)')
  })

  test('the outer bypass is market-host-only', () => {
    const wrapper = middleware.slice(middleware.indexOf('export default function middleware('))
    expect(wrapper).toContain('requestHostname(req) === MARKET_HOST')
    expect(wrapper).not.toContain('requestHostname(req) === PORTAL_HOST')
  })
})
