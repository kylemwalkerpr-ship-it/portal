import fs from 'node:fs'
import path from 'node:path'
import {
  PORTAL_ANONYMOUS_AUTH_EXACT_PATHS,
  PORTAL_ANONYMOUS_DOCUMENT_PATHS,
  PORTAL_ANONYMOUS_SIGN_IN_ALIAS_PATHS,
  isPortalAnonymousDocumentPath,
  portalRequestHasSessionHint,
  shouldBypassClerkForPortalRequest,
} from '@/lib/portalMiddlewareBypass'
import { shouldBypassClerkForMarketRequest } from '@/lib/marketplaceMiddlewareBypass'

const root = process.cwd()
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')

const params = (value = '') => new URLSearchParams(value)

/**
 * Portal mirror of the market Clerk bypass (PR 243) extended to the anonymous
 * auth lanes (PORTAL-SIGNIN-1102). The portal root document and the anonymous
 * /sign-in(.*) + /sign-up(.*) documents are Cloudflare 1102 routes: anonymous
 * HTML must stay off the Clerk CPU path while a signed-in visitor still
 * resolves a session and bounces `/` -> /dashboard (req.cookies
 * `__client_uat`).
 */
describe('Portal Clerk bypass boundary', () => {
  const ANONYMOUS_HINTS = [undefined, null, '', '0']

  test('the anonymous portal root document skips Clerk', () => {
    for (const clientUat of ANONYMOUS_HINTS) {
      expect(shouldBypassClerkForPortalRequest('/', params(), clientUat)).toBe(true)
    }
  })

  test('anonymous sign-in and sign-up documents skip Clerk on every lane', () => {
    for (const pathname of [
      '/sign-in',
      '/sign-in/student',
      '/sign-in/client',
      '/sign-in/consultant',
      '/sign-in/attorney',
      '/sign-in/provider',
      '/sign-in/employer',
      '/sign-in/admin',
      '/sign-in/sso-callback',
      '/sign-up',
      '/sign-up/student',
      '/sign-up/client',
      '/sign-up/consultant',
      '/sign-up/provider',
      '/sign-up/employer',
      '/sign-up/sso-callback',
    ]) {
      for (const clientUat of ANONYMOUS_HINTS) {
        expect(shouldBypassClerkForPortalRequest(pathname, params(), clientUat)).toBe(true)
      }
      expect(isPortalAnonymousDocumentPath(pathname)).toBe(true)
    }
  })

  test('the retired /login and /register aliases skip Clerk when anonymous', () => {
    expect([...PORTAL_ANONYMOUS_SIGN_IN_ALIAS_PATHS]).toEqual(['/login', '/register'])
    for (const pathname of ['/login', '/register']) {
      for (const clientUat of ANONYMOUS_HINTS) {
        expect(shouldBypassClerkForPortalRequest(pathname, params(), clientUat)).toBe(true)
      }
      expect(PORTAL_ANONYMOUS_AUTH_EXACT_PATHS.has(pathname)).toBe(true)
    }
  })

  test('the root allow-list is still exactly the portal root document', () => {
    expect([...PORTAL_ANONYMOUS_DOCUMENT_PATHS]).toEqual(['/'])
    expect([...PORTAL_ANONYMOUS_AUTH_EXACT_PATHS].sort()).toEqual([
      '/login',
      '/register',
      '/sign-in',
      '/sign-up',
    ])
  })

  test('protected and unrelated portal surfaces stay behind Clerk', () => {
    for (const pathname of [
      '/dashboard',
      '/dashboard/analytics',
      '/user',
      '/sellers',
      '/sellers/example',
      '/shop',
      '/shop/example',
      '/marketplace',
      '/marketplace/gigs',
      '/sitemap.xml',
      '/robots.txt',
      '/api/profile',
      '/api/messages/start',
      '/api/webhooks/clerk',
      '/api/cron/weekly-payouts',
      '/api/mobile/session',
      '/gigs/example-service',
      '/categories/immigration',
      '/providers/example',
      // Near-misses must never be mistaken for an auth lane.
      '/sign-inx',
      '/sign-upx',
      '/login/',
      '/register/',
      '/login/extra',
      '/register/extra',
    ]) {
      expect(shouldBypassClerkForPortalRequest(pathname, params(), undefined)).toBe(false)
      expect(isPortalAnonymousDocumentPath(pathname)).toBe(false)
    }

    // The caller always hands over `req.nextUrl.pathname`, which the URL
    // parser has already dot-segment-normalised: a traversal attempt collapses
    // into the protected path it targets, never into an auth lane prefix.
    expect(new URL('https://portal.yousafeconsultancy.com/sign-in/../dashboard').pathname).toBe(
      '/dashboard',
    )
  })

  test('market-host public documents are never widened onto the portal fast path', () => {
    // The market helper is the broad contract; the portal helper must not
    // mirror it path-for-path, or portal-host `/gigs/*` (which the portal app
    // does not rewrite) would skip Clerk.
    for (const pathname of [
      '/',
      '/gigs',
      '/gigs/example-service',
      '/categories',
      '/providers',
      '/shop',
      '/sellers/example',
      '/sitemap.xml',
    ]) {
      expect(shouldBypassClerkForMarketRequest(pathname, params(), false)).toBe(true)
      if (pathname !== '/') {
        expect(shouldBypassClerkForPortalRequest(pathname, params(), undefined)).toBe(false)
      }
    }
  })

  test('a signed-in session hint always keeps the Clerk path', () => {
    for (const clientUat of ['1712345678', '0.0', ' 0']) {
      expect(portalRequestHasSessionHint(clientUat)).toBe(true)
      for (const pathname of [
        '/',
        '/sign-in',
        '/sign-in/student',
        '/sign-in/provider',
        '/sign-up',
        '/sign-up/student',
        '/login',
        '/register',
      ]) {
        expect(shouldBypassClerkForPortalRequest(pathname, params(), clientUat)).toBe(false)
      }
    }
    expect(portalRequestHasSessionHint(undefined)).toBe(false)
    expect(portalRequestHasSessionHint(null)).toBe(false)
    expect(portalRequestHasSessionHint('')).toBe(false)
    expect(portalRequestHasSessionHint('0')).toBe(false)
  })

  test('Clerk handshake, ticket and callback parameters force the Clerk path', () => {
    for (const pathname of [
      '/',
      '/sign-in',
      '/sign-in/student',
      '/sign-in/sso-callback',
      '/sign-up',
      '/sign-up/client',
      '/login',
      '/register',
    ]) {
      for (const query of [
        '__clerk_handshake=1',
        '__clerk_synced=true',
        '__clerk_db_jwt=token',
        '__clerk_ticket=token',
        '__clerk_status=complete',
        '__clerk_hs_reason=handshake',
        '__CLERK_handshake=1',
      ]) {
        expect(shouldBypassClerkForPortalRequest(pathname, params(query), undefined)).toBe(false)
      }
    }
  })

  test('normal navigation, lane and return_to params stay on the fast path', () => {
    expect(shouldBypassClerkForPortalRequest('/', params('lang=es'), undefined)).toBe(true)
    expect(shouldBypassClerkForPortalRequest('/', params('utm_source=newsletter'), undefined)).toBe(
      true,
    )
    expect(
      shouldBypassClerkForPortalRequest(
        '/sign-in/student',
        params('return_to=%2Fdashboard'),
        undefined,
      ),
    ).toBe(true)
    expect(shouldBypassClerkForPortalRequest('/login', params('lane=attorney'), undefined)).toBe(
      true,
    )
    expect(shouldBypassClerkForPortalRequest('/sign-up', params('lang=es'), undefined)).toBe(true)
  })
})

describe('portal middleware wiring', () => {
  const wrapper = middleware.slice(middleware.indexOf('export default function middleware('))
  const clerkStart = middleware.indexOf('const clerkHandler = clerkMiddleware(')
  const clerkBody = middleware.slice(clerkStart)
  const portalHandlerStart = middleware.indexOf('function handlePortalAnonymousDocumentRequest(')
  const portalHandlerEnd = middleware.indexOf('const clerkHandler = clerkMiddleware(', portalHandlerStart)
  const portalHandler = middleware.slice(portalHandlerStart, portalHandlerEnd)

  test('the portal guard is wired into the delegated handler, not inline', () => {
    const portalGuard = wrapper.indexOf('requestHostname(req) === PORTAL_HOST')
    const bypassCall = wrapper.indexOf('shouldBypassClerkForPortalRequest(', portalGuard)
    const fastPath = wrapper.indexOf('return handlePortalAnonymousDocumentRequest(req)', bypassCall)
    const clerkFallback = wrapper.indexOf('return clerkHandler(req, event)', fastPath)

    expect(portalGuard).toBeGreaterThan(-1)
    expect(bypassCall).toBeGreaterThan(portalGuard)
    expect(fastPath).toBeGreaterThan(bypassCall)
    expect(clerkFallback).toBeGreaterThan(fastPath)
    // The session hint is read from the request cookies and handed to the
    // helper; the wrapper itself never decides who is signed in.
    expect(wrapper).toContain("req.cookies.get('__client_uat')?.value")
  })

  test('the market fast path is untouched and still evaluated', () => {
    const marketGuard = wrapper.indexOf('requestHostname(req) === MARKET_HOST')
    const marketFastPath = wrapper.indexOf('return handleMarketHostRequest(req)', marketGuard)
    const portalGuard = wrapper.indexOf('requestHostname(req) === PORTAL_HOST')

    expect(marketGuard).toBeGreaterThan(-1)
    expect(marketFastPath).toBeGreaterThan(marketGuard)
    expect(wrapper).toContain('shouldBypassClerkForMarketRequest(')
    expect(portalGuard).toBeGreaterThan(-1)
  })

  test('the portal fast path serves the root document without auth or rewrites', () => {
    expect(portalHandlerStart).toBeGreaterThan(-1)
    expect(portalHandler).toContain('const lang = resolveLanguage(req)')
    expect(portalHandler).toContain('withPathHeaders(NextResponse.next(), pathname, search, lang)')
    expect(portalHandler).toContain('withCorsHeaders(')
    // No marketplace rewrite, no host routing, no session resolution, and no
    // signed-in bounce: those stay in the Clerk path.
    expect(portalHandler).not.toContain('NextResponse.rewrite')
    expect(portalHandler).not.toContain('handleMarketHostRequest')
    expect(portalHandler).not.toContain('await auth()')
    expect(portalHandler).not.toContain('/dashboard')
  })

  test('the anonymous /login + /register answer is the Clerk path answer, shared', () => {
    // The fast path only ever redirects the two alias paths, and it does so
    // through the same helper the Clerk handler uses, so the lane mapping and
    // the return_to contract cannot drift.
    expect(portalHandler).toContain('PORTAL_ANONYMOUS_SIGN_IN_ALIAS_PATHS.has(pathname)')
    expect(portalHandler).toContain('anonymousSignInRedirectUrl(req, pathname, search)')
    expect(clerkBody).toContain('anonymousSignInRedirectUrl(req, pathname, search)')
    // One lane mapping for the whole file: the Clerk handler no longer builds
    // the sign-in URL itself.
    expect(middleware.split("lane === 'consultant' ? 'consultant'").length - 1).toBe(1)
    expect(clerkBody).not.toContain('signInUrl.searchParams.set')
  })

  test('the fast path keeps the portal CORS preflight and tracking consolidation', () => {
    expect(portalHandler).toContain('isAllowedCorsPreflight(req)')
    expect(portalHandler).toContain('status: 204')
    expect(portalHandler).toContain('corsHeadersFor(req)')
    expect(portalHandler).toContain('stripTrackingParams(new URL(req.url))')
    expect(portalHandler).toContain('status: 301')
  })

  test('signed-in portal visitors still resolve a session and bounce to /dashboard', () => {
    expect(clerkBody).toContain('const { userId } = await auth()')
    expect(clerkBody).toContain("if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))")
  })

  test('protected portal surfaces stay behind Clerk', () => {
    expect(clerkBody).toContain("if (pathname.startsWith('/api/'))")
    expect(clerkBody).toContain("error: 'Unauthorized'")
    expect(clerkBody).toContain('authorizedParties:')
    // The retired /marketplace namespace still canonicalises to the market
    // host for BOTH hosts inside the Clerk handler, so the portal fast path
    // never has to know about it.
    expect(clerkBody).toContain('hostname === PORTAL_HOST')
    expect(clerkBody).toContain('isLegacyMarketplacePath')
  })

  test('the middleware matcher still covers the portal root document', () => {
    // Assert the matcher exactly as it is written in middleware.ts. The file
    // literal is `.*\\..*` (a JS string escapes the backslash), which collapses
    // to the runtime regex `.*\..*` — the dotted-path exclusion. String.raw
    // keeps this expectation from re-escaping `\\` down to a single backslash,
    // which is not valid source for a literal dot.
    expect(middleware).toContain(String.raw`'/((?!_next|api/translate|api/webhooks|.*\\..*).*)'`)
    expect(middleware).toContain("'/sitemap.xml'")
  })
})
