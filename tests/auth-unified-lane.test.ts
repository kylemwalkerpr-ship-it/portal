/**
 * Unified auth lane (2026-10): one canonical /sign-in + /sign-up, one
 * return_to contract, branded modal opener, forced password change gate.
 */
import {
  buildAuthUrl,
  normalizeAuthIntent,
  normalizeReturnTo,
  normalizeReturnToParams,
  pickReturnTo,
} from '@/lib/auth/returnTo'
import { getCanonicalPortalAuthRedirect, signInUrlForProtectedPath } from '@/lib/auth/portalAuthRedirect'
import {
  CHANGE_PASSWORD_PATH,
  passwordChangeClearable,
  passwordChangeRedirect,
  sessionRequiresPasswordChange,
} from '@/lib/auth/mustChangePassword'
import { onboardingUrl, openYsSignIn, openYsSignUp, signInModalProps, signUpModalProps } from '@/lib/auth/ysAuthModal'
import { ysClerkAppearance } from '@/lib/auth/ysClerkAppearance'
import { getSafeMarketplaceSignInReturnTo } from '@/lib/marketplaceSignInHandoff'

const P = 'https://portal.yousafeconsultancy.com'
const M = 'https://market.yousafeconsultancy.com'

describe('normalizeReturnTo (one shared allowlist)', () => {
  test('keeps estate URLs absolute and resolves relative paths against the portal', () => {
    expect(normalizeReturnTo(`${M}/gigs/visa?utm_source=x`)).toBe(`${M}/gigs/visa?utm_source=x`)
    expect(normalizeReturnTo('/dashboard?tab=orders')).toBe(`${P}/dashboard?tab=orders`)
    expect(normalizeReturnTo('/gigs/a', M)).toBe(`${M}/gigs/a`)
    expect(normalizeReturnTo('https://legal.yousafeconsultancy.com/intake?service=h1b')).toBe(
      'https://legal.yousafeconsultancy.com/intake?service=h1b',
    )
  })

  test('maps the retired /marketplace namespace to clean market URLs', () => {
    expect(normalizeReturnTo(`${P}/marketplace/gigs/a?x=1`)).toBe(`${M}/gigs/a?x=1`)
    expect(normalizeReturnTo('/marketplace')).toBe(`${M}/`)
  })

  test('rejects open redirects, credentials, non-https, control chars and auth loops', () => {
    for (const value of [
      '//evil.example/x',
      '/\\evil.example',
      'https://evil.example/',
      'https://portal.yousafeconsultancy.com.evil.example/',
      'http://portal.yousafeconsultancy.com/dashboard',
      'https://user:pw@portal.yousafeconsultancy.com/',
      'javascript:alert(1)',
      '/dash\nboard',
      `${P}/sign-in`,
      `${P}/sign-up/attorney`,
      '/sign-in/student',
      '',
      `/${'a'.repeat(2100)}`,
    ]) {
      expect(normalizeReturnTo(value)).toBeNull()
    }
  })

  test('strips nested return params from the destination', () => {
    expect(normalizeReturnTo(`${P}/dashboard?return_to=%2Fx&redirect_url=y&tab=1`)).toBe(`${P}/dashboard?tab=1`)
  })

  test('accepts every legacy parameter name and collapses them into one return_to', () => {
    expect(pickReturnTo(new URLSearchParams('ys_return_to=%2Fdashboard'))).toBe(`${P}/dashboard`)
    expect(pickReturnTo(new URLSearchParams(`redirect_url=${encodeURIComponent(`${M}/gigs`)}`))).toBe(`${M}/gigs`)
    expect(pickReturnTo(new URLSearchParams('return_to=https%3A%2F%2Fevil.example&returnTo=%2Fok'))).toBe(`${P}/ok`)
    const params = new URLSearchParams('redirect_url=%2Fa&after_sign_in_url=%2Fb&utm_source=g')
    expect(normalizeReturnToParams(params)).toBe(true)
    expect(params.get('return_to')).toBe(`${P}/a`)
    expect(params.get('redirect_url')).toBeNull()
    expect(params.get('after_sign_in_url')).toBeNull()
    expect(params.get('utm_source')).toBe('g')
  })

  test('legacy marketplace helper delegates to the shared allowlist', () => {
    expect(getSafeMarketplaceSignInReturnTo('/dashboard?tab=orders')).toBe('/dashboard?tab=orders')
    expect(getSafeMarketplaceSignInReturnTo('https://evil.example/')).toBeNull()
  })
})

describe('intents and canonical auth URLs', () => {
  test('normalizes lane names into intents', () => {
    expect(normalizeAuthIntent('student')).toBe('client')
    expect(normalizeAuthIntent('seller')).toBe('provider')
    expect(normalizeAuthIntent('Attorney')).toBe('attorney')
    expect(normalizeAuthIntent('admin')).toBeNull()
  })

  test('buildAuthUrl emits the one canonical URL shape', () => {
    expect(buildAuthUrl('sign-up', { returnTo: `${M}/gigs/a`, intent: 'student', extra: { service: 'h1b', gig: null } })).toBe(
      `${P}/sign-up?return_to=${encodeURIComponent(`${M}/gigs/a`)}&intent=client&service=h1b`,
    )
    expect(buildAuthUrl('sign-in', { returnTo: 'https://evil.example' })).toBe(`${P}/sign-in`)
  })
})

describe('portal lane URLs 301 to the canonical pages', () => {
  const redirect = (u: string) => getCanonicalPortalAuthRedirect(new URL(u))?.toString() ?? null

  test('sign-in lanes collapse to /sign-in with the return target preserved', () => {
    expect(redirect(`${P}/sign-in/student?return_to=%2Fdashboard`)).toBe(
      `${P}/sign-in?return_to=${encodeURIComponent(`${P}/dashboard`)}`,
    )
    expect(redirect(`${P}/sign-in/attorney`)).toBe(`${P}/sign-in`)
    expect(redirect(`${P}/sign-in/admin/`)).toBe(`${P}/sign-in`)
    expect(redirect(`${P}/sign-in/consultant/factor-one`)).toBe(`${P}/sign-in/factor-one`)
  })

  test('sign-up lanes carry their intent; admin sign-up becomes sign-in', () => {
    expect(redirect(`${P}/sign-up/attorney?utm_source=google`)).toBe(`${P}/sign-up?utm_source=google&intent=attorney`)
    expect(redirect(`${P}/sign-up/student`)).toBe(`${P}/sign-up?intent=client`)
    expect(redirect(`${P}/sign-up/seller`)).toBe(`${P}/sign-up?intent=provider`)
    expect(redirect(`${P}/sign-up/admin`)).toBe(`${P}/sign-in`)
  })

  test('aliases and legacy return params on canonical roots are normalized', () => {
    expect(redirect(`${P}/login`)).toBe(`${P}/sign-in`)
    expect(redirect(`${P}/register?source=marketing`)).toBe(`${P}/sign-up?source=marketing&intent=client`)
    expect(redirect(`${P}/sign-in?redirect_url=%2Fdashboard`)).toBe(
      `${P}/sign-in?return_to=${encodeURIComponent(`${P}/dashboard`)}`,
    )
  })

  test('canonical URLs and Clerk protocol requests are left alone', () => {
    expect(redirect(`${P}/sign-in`)).toBeNull()
    expect(redirect(`${P}/sign-in?return_to=${encodeURIComponent(`${P}/dashboard`)}`)).toBeNull()
    expect(redirect(`${P}/sign-up?intent=client`)).toBeNull()
    expect(redirect(`${P}/sign-in/student?__clerk_ticket=abc`)).toBeNull()
    expect(redirect(`${P}/sign-in/sso-callback`)).toBeNull()
    expect(redirect(`${P}/dashboard`)).toBeNull()
  })

  test('protected documents send anonymous visitors to one sign-in URL', () => {
    expect(signInUrlForProtectedPath(`${P}/dashboard/orders?x=1`).toString()).toBe(
      `${P}/sign-in?return_to=${encodeURIComponent(`${P}/dashboard/orders?x=1`)}`,
    )
  })
})

describe('shared branded Clerk modal opener', () => {
  test('sign-in goes straight to the destination; sign-up goes through onboarding', () => {
    const props = signInModalProps({ returnTo: `${M}/gigs/a` })
    expect(props.forceRedirectUrl).toBe(`${M}/gigs/a`)
    expect(props.signUpForceRedirectUrl).toBe(onboardingUrl(`${M}/gigs/a`))
    expect(props.appearance).toBe(ysClerkAppearance)

    const up = signUpModalProps({ returnTo: 'https://evil.example', intent: 'attorney', source: 'footer' })
    expect(up.forceRedirectUrl).toBe(`${P}/onboarding?return_to=${encodeURIComponent(`${P}/dashboard`)}&intent=attorney`)
    // unsafeMetadata is analytics only and never carries a role.
    expect(up.unsafeMetadata).toEqual({ signupIntent: 'attorney', signupSource: 'footer' })
    expect(JSON.stringify(up.unsafeMetadata)).not.toContain('role')
  })

  test('opens the Clerk modal with those props', () => {
    const calls: Array<[string, any]> = []
    const clerk = { openSignIn: (p: any) => calls.push(['in', p]), openSignUp: (p: any) => calls.push(['up', p]) }
    openYsSignIn(clerk, { returnTo: '/dashboard' })
    openYsSignUp(clerk, { intent: 'client' })
    expect(calls.map((c) => c[0])).toEqual(['in', 'up'])
    expect(calls[0][1].forceRedirectUrl).toBe(`${P}/dashboard`)
  })

  test('appearance uses Clerk v7 variable names only (deprecated names are silently ignored)', () => {
    const variables = ysClerkAppearance.variables as Record<string, unknown>
    for (const deprecated of ['colorText', 'colorTextSecondary', 'colorInputBackground', 'colorInputText', 'colorTextOnPrimaryBackground']) {
      expect(variables).not.toHaveProperty(deprecated)
    }
    expect(variables.colorPrimary).toBe('#3C3B6E')
    expect(variables).toHaveProperty('colorForeground')
    expect(variables).toHaveProperty('colorInput')
    expect((ysClerkAppearance as any).layout).toBeUndefined()
  })
})

describe('forced password change gate (feature-flag safe)', () => {
  test('reads the custom session claim or nested public metadata', () => {
    expect(sessionRequiresPasswordChange({ ys_mcp: true })).toBe(true)
    expect(sessionRequiresPasswordChange({ ys_mcp: 'true' })).toBe(true)
    expect(sessionRequiresPasswordChange({ metadata: { mustChangePassword: true } })).toBe(true)
    expect(sessionRequiresPasswordChange({ ys_mcp: false })).toBe(false)
    expect(sessionRequiresPasswordChange({ ys_mcp: '' })).toBe(false)
    // Claim not configured yet in the dashboard -> inert.
    expect(sessionRequiresPasswordChange({ sub: 'user_1' })).toBe(false)
    expect(sessionRequiresPasswordChange(null)).toBe(false)
  })

  test('redirects documents with return_to, exempts the change-password surfaces, honours the kill switch', () => {
    const claims = { ys_mcp: true }
    const target = passwordChangeRedirect('/dashboard/orders', '?x=1', claims, P, {})
    expect(target?.toString()).toBe(`${P}${CHANGE_PASSWORD_PATH}?return_to=${encodeURIComponent(`${P}/dashboard/orders?x=1`)}`)
    expect(passwordChangeRedirect('/api/orders', '', claims, P, {})?.pathname).toBe(CHANGE_PASSWORD_PATH)
    expect(passwordChangeRedirect(CHANGE_PASSWORD_PATH, '', claims, P, {})).toBeNull()
    expect(passwordChangeRedirect('/api/account/password', '', claims, P, {})).toBeNull()
    expect(passwordChangeRedirect('/sign-in/factor-one', '', claims, P, {})).toBeNull()
    expect(passwordChangeRedirect('/dashboard', '', claims, P, { YS_PASSWORD_CHANGE_GATE: 'off' })).toBeNull()
    expect(passwordChangeRedirect('/dashboard', '', {}, P, {})).toBeNull()
  })

  test('the flag is only cleared after a real password change', () => {
    const issued = '2026-10-02T06:00:00.000Z'
    const meta = { mustChangePassword: true, tempPasswordIssuedAt: issued }
    expect(passwordChangeClearable({ public_metadata: meta, password_last_updated_at: Date.parse(issued) + 1000 })).toEqual({ ok: true })
    expect(passwordChangeClearable({ public_metadata: meta, password_last_updated_at: Date.parse(issued) - 1000 })).toEqual({ ok: false, reason: 'not_changed' })
    expect(passwordChangeClearable({ public_metadata: meta, password_last_updated_at: null })).toEqual({ ok: false, reason: 'not_changed' })
    expect(passwordChangeClearable({ public_metadata: { mustChangePassword: false }, password_last_updated_at: 1 })).toEqual({ ok: false, reason: 'not_required' })
    const now = Date.parse('2026-10-02T07:00:00Z')
    expect(passwordChangeClearable({ public_metadata: { mustChangePassword: true }, password_last_updated_at: now - 60_000 }, now)).toEqual({ ok: true })
    expect(passwordChangeClearable({ public_metadata: { mustChangePassword: true }, password_last_updated_at: now - 3_600_000 }, now)).toEqual({ ok: false, reason: 'not_changed' })
  })

  test('middleware wires the gate after the existing auth() call, without extra network work', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const middleware = fs.readFileSync('middleware.ts', 'utf8')
    const clerkBody = middleware.slice(middleware.indexOf('const clerkHandler = clerkMiddleware('))
    const authCall = clerkBody.indexOf('const { userId, sessionClaims } = await auth()')
    const gate = clerkBody.indexOf('passwordChangeRedirect(', authCall)
    expect(authCall).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(authCall)
    expect(clerkBody).not.toContain('currentUser()')
  })
})

describe('auth lane shells keep the deploy-gate marker', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  for (const file of ['app/sign-in/[[...rest]]/SignInClient.tsx', 'app/sign-up/[[...rest]]/SignUpClient.tsx']) {
    test(`${file} renders its AuthShell title on every prerendered lane`, () => {
      const source = fs.readFileSync(file, 'utf8')
      // The static-cache gate requires the AuthShell title in EVERY lane
      // document (/sign-in/student, ...). No early return may skip the shell.
      expect(source).not.toMatch(/if \(legacyLane\) \{\s*return/)
      const returns = source.match(/\n  return \(/g) ?? []
      expect(returns).toHaveLength(1)
      expect(source).toMatch(/<AuthShell[\s\S]{0,600}?title="([^"]{20,})"/)
      // Lane detection happens after mount so every shell hydrates identically.
      expect(source).toContain('const [legacyLane, setLegacyLane] = useState<string | null>(null)')
    })
  }
})
