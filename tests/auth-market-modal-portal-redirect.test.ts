/**
 * 2026-10-02: portal.yousafeconsultancy.com has no standalone sign-in page.
 * Anonymous portal auth documents 302 once to the Market home, which opens the
 * branded, lane-aware Clerk modal; Clerk protocol requests and sub-screens stay
 * embedded on the portal; sign-out always lands on the Market home.
 */
import fs from 'node:fs'
import {
  inferAuthIntentFromReturnTo,
  isPortalAuthRootPath,
  marketAuthModalUrl,
  signedInAuthRootDestination,
} from '@/lib/auth/portalAuthRedirect'
import {
  allowSignedInForward,
  BOUNCE_MAX,
  readMarketAuthRequest,
  readSsoCallback,
  stripMarketAuthParams,
} from '@/lib/auth/marketAuthHandoff'

const P = 'https://portal.yousafeconsultancy.com'
const M = 'https://market.yousafeconsultancy.com'
const modal = (path: string) => marketAuthModalUrl(`${P}${path}`)?.toString() ?? null

describe('portal auth documents -> Market modal (one hop)', () => {
  test('canonical roots open the matching modal', () => {
    expect(modal('/sign-in')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/sign-up')).toBe(`${M}/?ys_sign_up=1`)
    expect(modal('/sign-in/')).toBe(`${M}/?ys_sign_in=1`)
  })

  test('retired lanes and aliases fold into the modal with the lane as intent', () => {
    expect(modal('/sign-in/student')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/sign-up/student')).toBe(`${M}/?ys_sign_up=1&intent=client`)
    expect(modal('/sign-up/attorney')).toBe(`${M}/?ys_sign_up=1&intent=attorney`)
    expect(modal('/sign-up/consultant')).toBe(`${M}/?ys_sign_up=1&intent=consultant`)
    expect(modal('/sign-up/seller')).toBe(`${M}/?ys_sign_up=1&intent=provider`)
    expect(modal('/sign-up/admin')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/login')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/register')).toBe(`${M}/?ys_sign_up=1`)
  })

  test('return_to is normalized to an absolute allow-listed URL; unsafe values dropped', () => {
    expect(modal('/sign-in?return_to=%2Fdashboard%3Fpage%3Dorders')).toBe(
      `${M}/?ys_sign_in=1&return_to=${encodeURIComponent(`${P}/dashboard?page=orders`)}`,
    )
    expect(modal('/sign-in?redirect_url=https%3A%2F%2Flegal.yousafeconsultancy.com%2Fintake%2F')).toBe(
      `${M}/?ys_sign_in=1&return_to=${encodeURIComponent('https://legal.yousafeconsultancy.com/intake/')}`,
    )
    expect(modal('/sign-in?return_to=https%3A%2F%2Fevil.example%2F')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/sign-in?return_to=%2Fsign-in')).toBe(`${M}/?ys_sign_in=1`)
  })

  test('intent comes from intent/lane params or the destination; admin/support never', () => {
    expect(modal('/sign-up?intent=attorney')).toContain('intent=attorney')
    expect(modal('/sign-in?lane=consultant')).toContain('intent=consultant')
    expect(modal('/sign-in?intent=admin')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/sign-in?intent=support')).toBe(`${M}/?ys_sign_in=1`)
    expect(modal('/sign-in?lane=support')).toBe(`${M}/?ys_sign_in=1`)
    expect(inferAuthIntentFromReturnTo(`${P}/onboarding/provider?type=attorney`)).toBe('attorney')
    expect(inferAuthIntentFromReturnTo(`${P}/onboarding/provider`)).toBe('provider')
    expect(inferAuthIntentFromReturnTo(`${P}/dashboard/consultant/intake`)).toBe('consultant')
    expect(inferAuthIntentFromReturnTo(`${P}/dashboard`)).toBeNull()
  })

  test('attribution params ride along; unrelated params do not', () => {
    const url = new URL(modal('/sign-up?intent=client&utm_source=legal&utm_campaign=x&source=marketing&foo=bar')!)
    expect(url.searchParams.get('utm_source')).toBe('legal')
    expect(url.searchParams.get('utm_campaign')).toBe('x')
    expect(url.searchParams.get('source')).toBe('marketing')
    expect(url.searchParams.has('foo')).toBe(false)
  })

  test('Clerk protocol requests and Clerk sub-screens stay on the portal (tickets, email links, OAuth steps)', () => {
    expect(modal('/sign-in?__clerk_ticket=abc')).toBeNull()
    expect(modal('/sign-up?__clerk_ticket=abc')).toBeNull()
    expect(modal('/sign-in?__clerk_status=verified')).toBeNull()
    expect(modal('/sign-in?__clerk_handshake=jwt')).toBeNull()
    for (const sub of ['/sign-in/factor-one', '/sign-in/factor-two', '/sign-in/sso-callback', '/sign-in/reset-password', '/sign-up/continue', '/sign-up/verify-email-address', '/sign-in/student/factor-one']) {
      expect(modal(sub)).toBeNull()
    }
  })

  test('non-auth documents are untouched', () => {
    for (const path of ['/', '/dashboard', '/onboarding', '/account/change-password', '/sign-inx', '/api/profile']) {
      expect(modal(path)).toBeNull()
    }
    expect(isPortalAuthRootPath('/sign-in')).toBe(true)
    expect(isPortalAuthRootPath('/sign-up/')).toBe(true)
    expect(isPortalAuthRootPath('/sign-in/factor-one')).toBe(false)
  })

  test('signed-in visitors on an auth root go to return_to or the dashboard', () => {
    expect(signedInAuthRootDestination(`${P}/sign-in`).toString()).toBe(`${P}/dashboard`)
    expect(signedInAuthRootDestination(`${P}/sign-in?return_to=%2Fonboarding`).toString()).toBe(`${P}/onboarding`)
    expect(signedInAuthRootDestination(`${P}/sign-in?return_to=https%3A%2F%2Fevil.example`).toString()).toBe(`${P}/dashboard`)
    expect(signedInAuthRootDestination(`${P}/sign-in?return_to=%2Fsign-in`).toString()).toBe(`${P}/dashboard`)
  })
})

describe('Market side: modal request, OAuth callback, loop guard', () => {
  test('reads the modal request and strips the one-shot params', () => {
    expect(readMarketAuthRequest(`${M}/?ys_sign_in=1&intent=attorney&return_to=${encodeURIComponent(`${P}/dashboard`)}`)).toEqual({
      mode: 'sign-in',
      intent: 'attorney',
      returnTo: `${P}/dashboard`,
    })
    expect(readMarketAuthRequest(`${M}/?ys_sign_up=1&lane=student`)).toEqual({ mode: 'sign-up', intent: 'client', returnTo: null })
    expect(readMarketAuthRequest(`${M}/?ys_sign_in=1&ys_return_to=%2Fdashboard`)?.returnTo).toBe('/dashboard')
    expect(readMarketAuthRequest(`${M}/?ys_sign_in=1&return_to=https%3A%2F%2Fevil.example`)?.returnTo).toBeNull()
    expect(readMarketAuthRequest(`${M}/?ys_sign_in=1&intent=admin`)?.intent).toBeNull()
    expect(readMarketAuthRequest(`${M}/gigs/x`)).toBeNull()
    expect(stripMarketAuthParams(`${M}/?ys_sign_in=1&intent=client&return_to=x&q=visa`)).toBe('/?q=visa')
  })

  test('completes the modal OAuth fragment with allow-listed targets only', () => {
    const cb = readSsoCallback(
      `${M}/?ys_sign_in=1#/sso-callback?sign_up_force_redirect_url=${encodeURIComponent(`${P}/onboarding?return_to=x`)}&sign_in_force_redirect_url=${encodeURIComponent(`${P}/dashboard`)}`,
    )!
    expect(cb.signInForceRedirectUrl).toBe(`${P}/dashboard`)
    expect(cb.signUpForceRedirectUrl).toBe(`${P}/onboarding?return_to=x`)
    expect(cb.continueSignUpUrl).toBe(`${P}/sign-up/continue`)
    const evil = readSsoCallback(`${M}/#/sso-callback?sign_in_force_redirect_url=https%3A%2F%2Fevil.example`)!
    expect(evil.signInForceRedirectUrl).toBe(`${P}/dashboard`)
    expect(readSsoCallback(`${M}/#/something-else`)).toBeNull()
    expect(readSsoCallback(`${M}/`)).toBeNull()
  })

  test('signed-in forward is capped so a portal that cannot see the session cannot ping-pong', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const now = 1_000_000
    for (let i = 0; i < BOUNCE_MAX; i += 1) expect(allowSignedInForward(storage, now + i)).toBe(true)
    expect(allowSignedInForward(storage, now + 10)).toBe(false)
    expect(allowSignedInForward(storage, now + 130_000)).toBe(true)
  })
})

describe('wiring', () => {
  const middleware = fs.readFileSync('middleware.ts', 'utf8')
  const nav = fs.readFileSync('components/marketplace/MarketplaceAuthNav.tsx', 'utf8')
  const layout = fs.readFileSync('app/layout.tsx', 'utf8')

  test('portal pre-Clerk gate sends anonymous auth documents to the Market modal before canonicalizing', () => {
    const gate = middleware.indexOf("requestHostname(req) === PORTAL_HOST && (req.method === 'GET' || req.method === 'HEAD')")
    const block = middleware.slice(gate, middleware.indexOf('return clerkHandler(req, event)', gate))
    const modalAt = block.indexOf('marketAuthModalUrl(req.nextUrl)')
    expect(modalAt).toBeGreaterThan(-1)
    expect(modalAt).toBeLessThan(block.indexOf('getCanonicalPortalAuthRedirect(req.nextUrl)'))
    expect(block).toContain('if (!handoffInProgress && !signedInHint) {')
  })

  test('Clerk handler: signed-in auth root -> destination, stale hint -> modal, signed-out portal / -> Market', () => {
    expect(middleware).toContain('signedInAuthRootDestination(req.nextUrl)')
    expect(middleware).toMatch(/if \(hostname === PORTAL_HOST\) \{\s*return withCorsHeaders\(\s*NextResponse\.redirect\(new URL\(`\/\$\{search\}`, `https:\/\/\$\{MARKET_HOST\}`\)/)
  })

  test('market host auth paths open the modal in place (no portal round-trip)', () => {
    expect(middleware).toContain('marketAuthModalUrl(portalUrl)')
  })

  test('Market nav completes OAuth callbacks and opens lane-aware modals', () => {
    expect(nav).toContain('clerk.handleRedirectCallback(sso)')
    expect(nav).toContain("openYsSignUp(clerk, { returnTo: request.returnTo, intent: request.intent, source: 'portal_handoff' })")
    expect(nav).toContain('allowSignedInForward(storage, Date.now())')
  })

  test('every sign-out lands on the Market home', () => {
    expect(layout).toContain('afterSignOutUrl={MARKET_HOME_URL}')
    const files = ['app/dashboard/client.tsx', 'app/dashboard/admin/AdminSectionClient.tsx', 'components/marketplace/MarketplaceAuthNav.tsx']
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      expect(src).toContain("const MARKET_HOME_URL = 'https://market.yousafeconsultancy.com/'")
      expect(src).toMatch(/signOut\(\{ redirectUrl: MARKET_HOME_URL \}\)/)
    }
  })
})
