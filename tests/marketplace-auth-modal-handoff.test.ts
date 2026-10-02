import {
  createMarketplaceSignInHandoffUrl,
  getSafeMarketplaceSignInReturnTo,
  shouldRedirectLegacyStudentSignIn,
} from '@/lib/marketplaceSignInHandoff'

describe('Market sign-in modal handoff', () => {
  test('builds a Market home URL that asks the existing auth nav to open sign-in', () => {
    expect(createMarketplaceSignInHandoffUrl('/dashboard/orders')).toBe(
      'https://market.yousafeconsultancy.com/?ys_sign_in=1&ys_return_to=%2Fdashboard%2Forders',
    )
  })

  test('keeps safe same-family return URLs while rejecting open redirects and auth loops', () => {
    expect(getSafeMarketplaceSignInReturnTo('/dashboard?tab=orders')).toBe('/dashboard?tab=orders')
    expect(getSafeMarketplaceSignInReturnTo('https://market.yousafeconsultancy.com/gigs')).toBe(
      'https://market.yousafeconsultancy.com/gigs',
    )
    for (const value of ['//evil.example', 'https://evil.example/', '/sign-in/student', '/sign-up/student']) {
      expect(getSafeMarketplaceSignInReturnTo(value)).toBeNull()
    }
  })

  test('legacy student URL redirects only for ordinary page requests, not Clerk protocol callbacks', () => {
    expect(shouldRedirectLegacyStudentSignIn('/sign-in/student', new URLSearchParams('return_to=%2Fdashboard'))).toBe(true)
    expect(shouldRedirectLegacyStudentSignIn('/sign-in/attorney', new URLSearchParams())).toBe(false)
    expect(shouldRedirectLegacyStudentSignIn('/sign-in/student', new URLSearchParams('__clerk_ticket=secret'))).toBe(false)
    expect(shouldRedirectLegacyStudentSignIn('/sign-in/student/factor-one', new URLSearchParams())).toBe(false)
  })
})

describe('route and UI wiring', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const middleware = fs.readFileSync('middleware.ts', 'utf8')
  const authNav = fs.readFileSync('components/marketplace/MarketplaceAuthNav.tsx', 'utf8')
  const memberModal = fs.readFileSync('components/design/landing/MemberSignInModal.tsx', 'utf8')

  test('portal anonymous root retires to Market; lane URLs 301 straight to the canonical portal pages (no market bounce)', () => {
    const gate = middleware.indexOf("requestHostname(req) === PORTAL_HOST && (req.method === 'GET' || req.method === 'HEAD')")
    const clerkFallback = middleware.indexOf('return clerkHandler(req, event)', gate)
    expect(gate).toBeGreaterThan(-1)
    expect(clerkFallback).toBeGreaterThan(gate)
    const portalGate = middleware.slice(gate, clerkFallback)
    expect(portalGate).toContain("pathname === '/'")
    expect(portalGate).toContain('!handoffInProgress && !signedInHint')
    expect(portalGate).toContain('getCanonicalPortalAuthRedirect(req.nextUrl)')
    expect(portalGate).toContain('NextResponse.redirect(canonical, { status: 301 })')
    // The 3-hop /sign-in/student -> market modal -> portal bounce is gone.
    expect(portalGate).not.toContain('shouldRedirectLegacyStudentSignIn(pathname, searchParams)')
  })

  test('member lanes open the Market modal directly (no portal hop); auth nav opens the shared branded modal and signs out to Market', () => {
    expect(memberModal).toContain("signInHref: 'https://market.yousafeconsultancy.com/?ys_sign_in=1'")
    expect(memberModal).toContain("signInHref: 'https://market.yousafeconsultancy.com/?ys_sign_in=1&intent=attorney'")
    expect(memberModal).toContain("signUpHref: 'https://market.yousafeconsultancy.com/?ys_sign_up=1&intent=attorney'")
    expect(memberModal).toContain("signUpHref: 'https://market.yousafeconsultancy.com/?ys_sign_up=1&intent=consultant'")
    expect(memberModal).not.toMatch(/portal\.yousafeconsultancy\.com\/sign-(in|up)/)
    expect(authNav).toContain("import { openYsSignIn, openYsSignUp } from '@/lib/auth/ysAuthModal'")
    expect(authNav).toContain('openYsSignIn(clerk, { returnTo: request.returnTo, intent: request.intent })')
    expect(authNav).toContain('readMarketAuthRequest(href)')
    expect(authNav).toContain('redirectUrl: MARKET_HOME_URL')
    expect(authNav).toContain('window.location.replace(MARKET_HOME_URL)')
  })
})