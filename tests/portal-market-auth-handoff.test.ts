/**
 * MARKET-PORTAL-AUTH-HANDOFF-1102 — cross-host auth handoff CPU regression.
 *
 * Live capture this suite locks in (2026-09-21, no credentials involved):
 *
 *   GET https://clerk.portal.yousafeconsultancy.com/v1/client/handshake?redirect_url=https://market.yousafeconsultancy.com/
 *   307 location: https://market.yousafeconsultancy.com/
 *   set-cookie: __clerk_handshake=<JWT>; Path=/; Domain=yousafeconsultancy.com; Max-Age=70
 *
 * The `handshake` claim inside that JWT is the cookie list the *destination
 * host's* middleware must apply (`__client_uat`, `__session`, expired deletes).
 * Because the FAPI 307 strips every `__clerk*` *parameter*, the only thing the
 * destination request carries is the cookie — and both host fast paths used to
 * decide eligibility from path + query only. The handoff JWT was therefore
 * answered with the cached anonymous document, never consumed, and Clerk's SDK
 * re-drove the handshake on every page load of the sign-in/sign-out switch, so
 * the shared Worker paid Clerk crypto per re-drive until Cloudflare returned
 * 1102 (market ray a3e7bed14a94724a) and the portal sign-in tab hit the same
 * resource-limit page.
 *
 * The contract below is the smallest safe fix: fail closed on handoff state,
 * session state and Clerk's internal auth paths, while the anonymous lanes that
 * PR #260 and the marketplace bypasses made cheap stay exactly as cheap.
 */
import fs from 'node:fs'
import path from 'node:path'
import { shouldBypassClerkForMarketRequest } from '@/lib/marketplaceMiddlewareBypass'
import { shouldBypassClerkForPortalRequest } from '@/lib/portalMiddlewareBypass'
import {
  clientUatMeansSignedIn,
  isClerkInternalAuthRequest,
  requestHasClerkHandoffCookie,
  requestHasClerkSessionCookie,
  requestNeedsClerkHandoffState,
} from '@/lib/clerkHandoffState'

const root = process.cwd()
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')
const marketHelper = fs.readFileSync(
  path.join(root, 'lib', 'marketplaceMiddlewareBypass.ts'),
  'utf8',
)
const portalHelper = fs.readFileSync(path.join(root, 'lib', 'portalMiddlewareBypass.ts'), 'utf8')

const params = (value = '') => new URLSearchParams(value)
const cookies = (...pairs: Array<[string, string]>) =>
  pairs.map(([name, value]) => ({ name, value }))

/** The exact jar the FAPI 307 leaves on market.yousafeconsultancy.com/. */
const HANDOFF_JAR = cookies(['__clerk_handshake', 'eyJhbGciOiJSUzI1NiJ9.handoff.sig'])

const market = (
  pathname: string,
  query = '',
  jar = [] as ReturnType<typeof cookies>,
  preflight = false,
) => shouldBypassClerkForMarketRequest(pathname, params(query), preflight, jar)

const portal = (
  pathname: string,
  query = '',
  jar = [] as ReturnType<typeof cookies>,
  clientUat?: string | null,
) => shouldBypassClerkForPortalRequest(pathname, params(query), clientUat, jar)

describe('the handoff cookie jar fails closed on both hosts', () => {
  test('the FAPI handoff destination never gets the anonymous document', () => {
    // market: the 307 lands here carrying only the cookie.
    expect(market('/', '', HANDOFF_JAR)).toBe(false)
    // portal: the same cookie is on `Domain=yousafeconsultancy.com`, so the
    // portal root and the sign-in lane see it too (the incident's portal tab).
    expect(portal('/', '', HANDOFF_JAR)).toBe(false)
    expect(portal('/sign-in', '', HANDOFF_JAR)).toBe(false)
    expect(portal('/sign-in/student', '', HANDOFF_JAR)).toBe(false)
  })

  test("the handoff claim's own state (uat=0 plus the jar) still fails closed", () => {
    const jar = cookies(['__clerk_handshake', 'jwt'], ['__client_uat', '0'])
    expect(market('/', '', jar)).toBe(false)
    expect(portal('/', '', jar)).toBe(false)
    expect(portal('/sign-in', '', jar)).toBe(false)
  })

  test('every __clerk* handoff cookie is covered, case-insensitively', () => {
    for (const name of [
      '__clerk_handshake',
      '__clerk_db_jwt',
      '__clerk_ticket',
      '__clerk_synced',
      '__clerk_redirect_count',
      '__CLERK_handshake',
    ]) {
      expect(requestHasClerkHandoffCookie(cookies([name, 'value']))).toBe(true)
      expect(market('/', '', cookies([name, 'value']))).toBe(false)
      expect(portal('/sign-in', '', cookies([name, 'value']))).toBe(false)
      expect(portal('/', '', cookies([name, 'value']))).toBe(false)
    }
  })

  test('an empty-valued __clerk* cookie is not handoff state on its own', () => {
    expect(requestHasClerkHandoffCookie(cookies(['__clerk_handshake', '']))).toBe(false)
  })
})

describe('signed-in state fails closed without an in-flight handoff', () => {
  test('a session token is never answered with an anonymous document', () => {
    const jar = cookies(['__session', 'eyJhbGciOiJSUzI1NiJ9.session.sig'])
    expect(requestHasClerkSessionCookie(jar)).toBe(true)
    expect(market('/', '', jar)).toBe(false)
    expect(market('/gigs', '', jar)).toBe(false)
    expect(portal('/', '', jar)).toBe(false)
    expect(portal('/sign-in', '', jar)).toBe(false)
  })

  test('an active __client_uat hint fails closed on both hosts', () => {
    // Clerk reports exactly this state as `client-uat-but-no-session-token`
    // (observed live on portal /sign-in), which is a handshake trigger.
    expect(requestNeedsClerkHandoffState('/', params(), cookies(['__client_uat', '1712345678']))).toBe(true)
    expect(market('/', '', cookies(['__client_uat', '1712345678']))).toBe(false)
    expect(portal('/', '', cookies(['__client_uat', '1712345678']))).toBe(false)
  })

  test('a signed-out uat (0 or absent) keeps the anonymous fast paths', () => {
    expect(clientUatMeansSignedIn('0')).toBe(false)
    expect(clientUatMeansSignedIn('')).toBe(false)
    expect(clientUatMeansSignedIn(undefined)).toBe(false)
    expect(market('/', '', cookies(['__client_uat', '0']))).toBe(true)
    expect(portal('/', '', cookies(['__client_uat', '0']))).toBe(true)
    expect(portal('/sign-in', '', cookies(['__client_uat', '0']))).toBe(true)
    expect(portal('/')).toBe(true)
    expect(market('/')).toBe(true)
  })
})

describe('Clerk handshake, callback and internal auth paths fail closed', () => {
  test('internal auth paths are recognised', () => {
    for (const pathname of [
      '/v1/client/handshake',
      '/v1/client/sync',
      '/v1/dev_browser',
      '/v1/environment',
      '/__clerk',
      '/__clerk/v1/client',
      '/clerk-sync-keyless',
    ]) {
      expect(isClerkInternalAuthRequest(pathname, params())).toBe(true)
      expect(market(pathname, '', [])).toBe(false)
      expect(portal(pathname, '', [])).toBe(false)
    }
  })

  test('__clerk* protocol parameters still fail closed on both hosts', () => {
    for (const query of [
      '__clerk_handshake=1',
      '__clerk_synced=true',
      '__clerk_db_jwt=jwt',
      '__clerk_ticket=ticket',
      '__CLERK_handshake=1',
    ]) {
      expect(market('/', query, [])).toBe(false)
      expect(portal('/', query, [])).toBe(false)
      expect(portal('/sign-in', query, [])).toBe(false)
    }
  })

  test('ordinary query strings stay on the fast paths', () => {
    expect(market('/', 'q=visa', [])).toBe(true)
    expect(market('/gigs', 'page=2', [])).toBe(true)
    expect(portal('/', 'lang=es', [])).toBe(true)
    expect(portal('/sign-in/student', 'return_to=%2Fdashboard', [])).toBe(true)
  })
})

describe('the cross-host handoff terminates instead of oscillating', () => {
  // Replay the three hops of a market <-> portal switch. Before the fix hop 2
  // was answered by the anonymous cache on both hosts, so the jar was never
  // consumed and hop 2 repeated until the Worker exhausted its CPU budget.
  const replay = (host: 'market' | 'portal') => {
    const bypass = host === 'market' ? market : portal
    const hops: Array<{ step: string; clerk: boolean }> = []

    // hop 1 — the FAPI answers the signed-out visitor's handshake and 307s to
    // the destination host with the handoff cookie set; nothing reaches the app
    // host yet.
    // hop 2 — the destination host receives the jar and must consume it.
    hops.push({
      step: 'destination-with-jar',
      clerk: bypass('/' as any, '', HANDOFF_JAR) === false,
    })
    // hop 3 — clerkMiddleware consumed the JWT, the claim cleared the jar and
    // redirected to the clean URL; the next request carries no Clerk state.
    hops.push({
      step: 'clean-follow-up',
      clerk: bypass('/' as any, '', cookies(['__client_uat', '0'])) === false,
    })
    // hop 4 — and the anonymous document path is eligible again, so the switch
    // cannot re-enter Clerk on every navigation.
    hops.push({ step: 'anonymous-again', clerk: bypass('/' as any, '', []) === false })
    return hops
  }

  test('market -> portal consumes the handoff exactly once', () => {
    expect(replay('market')).toEqual([
      { step: 'destination-with-jar', clerk: true },
      { step: 'clean-follow-up', clerk: false },
      { step: 'anonymous-again', clerk: false },
    ])
  })

  test('portal -> market consumes the handoff exactly once', () => {
    expect(replay('portal')).toEqual([
      { step: 'destination-with-jar', clerk: true },
      { step: 'clean-follow-up', clerk: false },
      { step: 'anonymous-again', clerk: false },
    ])
  })

  test('repeated switching never re-enters Clerk without new handoff state', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(market('/', '', [])).toBe(true)
      expect(portal('/', '', [])).toBe(true)
      expect(market('/', '', cookies(['__client_uat', '0']))).toBe(true)
      expect(portal('/', '', cookies(['__client_uat', '0']))).toBe(true)
    }
  })
})

describe('#260 and marketplace bypasses stay intact', () => {
  test('anonymous portal auth lanes still skip Clerk', () => {
    for (const pathname of [
      '/',
      '/sign-in',
      '/sign-in/student',
      '/sign-in/attorney',
      '/sign-in/consultant',
      '/sign-in/admin',
      '/sign-in/factor-one',
      '/sign-up',
      '/sign-up/student',
      '/login',
      '/register',
    ]) {
      expect(portal(pathname)).toBe(true)
    }
  })

  test('anonymous market documents still skip Clerk', () => {
    for (const pathname of [
      '/',
      '/gigs',
      '/gigs/example-service',
      '/categories/immigration',
      '/providers/example',
      '/shop',
      '/shop/example',
      '/sellers/example',
      '/sitemap.xml',
      '/dashboard',
      '/sign-in/student',
    ]) {
      expect(market(pathname)).toBe(true)
    }
  })

  test('market APIs, the sellers root and protected portal surfaces stay behind Clerk', () => {
    for (const pathname of ['/api', '/api/profile', '/api/messages/start', '/sellers', '/sellers/']) {
      expect(market(pathname)).toBe(false)
    }
    for (const pathname of ['/dashboard', '/dashboard/orders', '/user/profile', '/shop']) {
      expect(portal(pathname)).toBe(false)
    }
  })

  test('an allowed CORS preflight is unaffected by the handoff contract', () => {
    // Preflights carry no cookies at all; the existing 204 contract is first.
    expect(market('/api/messages/start', '', [], true)).toBe(true)
    expect(market('/', '', [], true)).toBe(true)
  })
})

describe('middleware wiring', () => {
  const wrapper = middleware.slice(middleware.indexOf('export default function middleware('))

  test('both fast paths hand the real cookie jar to their helper', () => {
    expect(wrapper).toContain('shouldBypassClerkForMarketRequest(')
    expect(wrapper).toContain('shouldBypassClerkForPortalRequest(')
    // One jar read per host branch, passed to the helper that owns the contract.
    expect(wrapper.split('req.cookies.getAll()').length - 1).toBe(2)
    expect(wrapper).toContain("req.cookies.get('__client_uat')?.value")
  })

  test('the market handoff guard runs before its fast-path handler', () => {
    const marketGuard = wrapper.indexOf('requestHostname(req) === MARKET_HOST')
    const jarRead = wrapper.indexOf('req.cookies.getAll()', marketGuard)
    const fastPath = wrapper.indexOf('return handleMarketHostRequest(req)', marketGuard)

    expect(jarRead).toBeGreaterThan(marketGuard)
    expect(fastPath).toBeGreaterThan(jarRead)
  })

  test('the portal handoff guard runs before its fast-path handler', () => {
    const portalGuard = wrapper.indexOf('requestHostname(req) === PORTAL_HOST')
    const jarRead = wrapper.indexOf('req.cookies.getAll()', portalGuard)
    const fastPath = wrapper.indexOf('return handlePortalAnonymousDocumentRequest(req)', portalGuard)
    const clerkFallback = wrapper.indexOf('return clerkHandler(req, event)', fastPath)

    expect(jarRead).toBeGreaterThan(portalGuard)
    expect(fastPath).toBeGreaterThan(jarRead)
    expect(clerkFallback).toBeGreaterThan(fastPath)
  })

  test('every requested bypass is handed to clerkMiddleware unchanged', () => {
    const clerkStart = middleware.indexOf('const clerkHandler = clerkMiddleware(')
    const clerkBody = middleware.slice(clerkStart)

    // Fail-closed means "rejoin the existing Clerk path": auth enforcement,
    // authorized parties and the /api 401 + /dashboard bounce are untouched.
    expect(clerkBody).toContain('const { userId } = await auth()')
    expect(clerkBody).toContain("if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))")
    expect(clerkBody).toContain("error: 'Unauthorized'")
    expect(clerkBody).toContain('authorizedParties:')
    expect(clerkBody).toContain('handleMarketHostRequest(req)')
  })

  test('the anonymous fast path itself is unchanged', () => {
    const start = middleware.indexOf('function handlePortalAnonymousDocumentRequest(')
    const end = middleware.indexOf('const clerkHandler = clerkMiddleware(', start)
    const portalHandler = middleware.slice(start, end)

    expect(portalHandler).toContain('withPathHeaders(NextResponse.next(), pathname, search, lang)')
    expect(portalHandler).toContain('anonymousSignInRedirectUrl(req, pathname, search)')
    expect(portalHandler).not.toContain('await auth()')
    expect(portalHandler).not.toContain('/dashboard')
  })

  test('both helpers decide handoff state from the shared contract, not locally', () => {
    for (const helper of [marketHelper, portalHelper]) {
      expect(helper).toContain('requestNeedsClerkHandoffState')
      expect(helper).toContain("from './clerkHandoffState'")
    }
    // No helper may re-implement its own private __clerk* scan: that drift is
    // what made the portal cookie-blind while the market only looked at params.
    expect(marketHelper).not.toContain("startsWith('__clerk')")
    expect(portalHelper).not.toContain("startsWith('__clerk')")
  })
})
