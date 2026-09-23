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

  test('portal anonymous root and student sign-in retire to Market before Clerk page rendering', () => {
    const gate = middleware.indexOf("requestHostname(req) === PORTAL_HOST && (req.method === 'GET' || req.method === 'HEAD')")
    const clerkFallback = middleware.indexOf('return clerkHandler(req, event)', gate)
    expect(gate).toBeGreaterThan(-1)
    expect(clerkFallback).toBeGreaterThan(gate)
    expect(middleware.slice(gate, clerkFallback)).toContain("pathname === '/'")
    expect(middleware.slice(gate, clerkFallback)).toContain('shouldRedirectLegacyStudentSignIn(pathname, searchParams)')
    expect(middleware.slice(gate, clerkFallback)).toContain('!handoffInProgress && !signedInHint')
  })

  test('client lane link opens the Market auth modal; auth nav honors the handoff and signs out to Market', () => {
    expect(memberModal).toContain("signInHref: 'https://market.yousafeconsultancy.com/?ys_sign_in=1'")
    expect(memberModal).toContain("signInHref: 'https://portal.yousafeconsultancy.com/sign-in/attorney'")
    expect(memberModal).toContain("signInHref: 'https://portal.yousafeconsultancy.com/sign-in/consultant'")
    expect(authNav).toContain('clerk.openSignIn({')
    expect(authNav).toContain('MARKETPLACE_SIGN_IN_QUERY')
    expect(authNav).toContain('signInUrl: `${MARKET_HOME_URL}?ys_sign_in=1`')
    expect(authNav).toContain('redirectUrl: MARKET_HOME_URL')
    expect(authNav).toContain('window.location.replace(MARKET_HOME_URL)')
  })
})