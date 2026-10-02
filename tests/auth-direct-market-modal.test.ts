/**
 * 2026-10-02: every portal auth redirect goes straight to the Market modal.
 *
 * Kyle saw
 *   https://portal.yousafeconsultancy.com/sign-in?return_to=https%3A%2F%2Fportal.yousafeconsultancy.com%2Fdashboard%2Fadmin%2Fusers
 * That URL was the middleware's own intermediate hop for a signed-out visit to
 * /dashboard/admin/users (protected doc -> portal /sign-in -> Market modal).
 * Server pages built the same URL on ANY auth failure, which looped for a
 * signed-in user whose profile check failed (portal /sign-in forwards a
 * signed-in visitor straight back to return_to).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  marketAuthModalUrl,
  marketAuthUrlForPortalPath,
  marketSignInUrlForProtectedPath,
  portalAuthFailureDestination,
  signedInAuthRootDestination,
} from '@/lib/auth/portalAuthRedirect'
import { buildAuthUrl } from '@/lib/auth/returnTo'
import { readMarketAuthRequest } from '@/lib/auth/marketAuthHandoff'
import { signInModalProps, signUpModalProps } from '@/lib/auth/ysAuthModal'

const P = 'https://portal.yousafeconsultancy.com'
const M = 'https://market.yousafeconsultancy.com'
const enc = encodeURIComponent
const ORIGINAL = `${P}/sign-in?return_to=${enc(`${P}/dashboard/admin/users`)}`

const protectedRedirect = (p: string) => marketSignInUrlForProtectedPath(`${P}${p}`).toString()

describe('protected portal documents -> Market modal in ONE hop', () => {
  test('/dashboard/admin/users goes straight to the modal, return_to kept, no intent', () => {
    expect(protectedRedirect('/dashboard/admin/users')).toBe(
      `${M}/?ys_sign_in=1&return_to=${enc(`${P}/dashboard/admin/users`)}`,
    )
  })

  test('the original URL (old bookmarks / Clerk paths) still resolves to the same modal', () => {
    expect(marketAuthModalUrl(ORIGINAL)?.toString()).toBe(protectedRedirect('/dashboard/admin/users'))
  })

  test.each([
    ['/dashboard/admin', null],
    ['/dashboard/admin/orders', null],
    ['/dashboard/admin/attorney-applications', null],
    ['/dashboard/support', null],
    ['/dashboard', null],
    ['/dashboard/orders?x=1', null],
    ['/dashboard/attorney/intake', 'attorney'],
    ['/dashboard/consultant/intake', 'consultant'],
    ['/onboarding?intent=attorney', 'attorney'],
    ['/onboarding?intent=admin', null],
    ['/onboarding?intent=support', null],
  ])('%s -> market sign-in modal (intent %s)', (p, intent) => {
    const url = new URL(protectedRedirect(p))
    expect(url.origin).toBe(M)
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('ys_sign_in')).toBe('1')
    expect(url.searchParams.get('intent')).toBe(intent)
    const returnTo = url.searchParams.get('return_to')!
    expect(new URL(returnTo).origin).toBe(P)
    expect(new URL(returnTo).pathname).toBe(p.split('?')[0])
    expect(url.toString()).not.toContain('/sign-in')
  })

  test('/onboarding/provider opens sign-up with the provider lane', () => {
    const url = new URL(protectedRedirect('/onboarding/provider?type=consultant'))
    expect(url.searchParams.get('ys_sign_up')).toBe('1')
    expect(url.searchParams.get('intent')).toBe('consultant')
    expect(new URL(protectedRedirect('/onboarding/provider')).searchParams.get('intent')).toBe('provider')
    expect(new URL(protectedRedirect('/onboarding/provider?type=admin')).searchParams.get('intent')).toBe('provider')
  })

  test('the Market reader round-trips admin/support destinations without ever making them an intent', () => {
    for (const p of ['/dashboard/admin/users', '/dashboard/support']) {
      const request = readMarketAuthRequest(protectedRedirect(p))
      expect(request).toEqual({ mode: 'sign-in', returnTo: `${P}${p}`, intent: null })
    }
    expect(readMarketAuthRequest(`${M}/?ys_sign_up=1&intent=admin`)?.intent).toBeNull()
    expect(readMarketAuthRequest(`${M}/?ys_sign_up=1&intent=support`)?.intent).toBeNull()
  })
})

describe('return_to allow-list (no open redirect)', () => {
  test.each([
    'https://evil.example/dashboard',
    '//evil.example/dashboard',
    'https://portal.yousafeconsultancy.com.evil.example/dashboard',
    'https://evil.example@portal.yousafeconsultancy.com/dashboard',
    'http://portal.yousafeconsultancy.com/dashboard',
    'javascript:alert(1)',
    '/sign-in?return_to=/dashboard',
  ])('%s is dropped', (target) => {
    const built = new URL(marketAuthUrlForPortalPath(target))
    expect(built.origin).toBe(M)
    expect(built.searchParams.get('return_to')).toBeNull()
    expect(new URL(buildAuthUrl('sign-in', { returnTo: target })).searchParams.get('return_to')).toBeNull()
    const viaPortal = marketAuthModalUrl(`${P}/sign-in?return_to=${enc(target)}`)
    expect(viaPortal?.searchParams.get('return_to') ?? null).toBeNull()
  })

  test('estate destinations are kept', () => {
    for (const target of [`${P}/dashboard/admin/users`, `${M}/gigs/x`, 'https://support.yousafeconsultancy.com/admin/users']) {
      expect(new URL(marketAuthUrlForPortalPath(target)).searchParams.get('return_to')).toBe(target)
    }
  })

  test('extra params can never smuggle an intent, flag or return_to', () => {
    const url = new URL(buildAuthUrl('sign-in', {
      returnTo: '/dashboard',
      extra: { intent: 'admin', return_to: 'https://evil.example', redirect_url: 'https://evil.example', ys_sign_up: '1', source: 'x' },
    }))
    expect(url.searchParams.get('intent')).toBeNull()
    expect(url.searchParams.getAll('return_to')).toEqual([`${P}/dashboard`])
    expect(url.searchParams.get('redirect_url')).toBeNull()
    expect(url.searchParams.get('ys_sign_up')).toBeNull()
    expect(url.searchParams.get('source')).toBe('x')
  })
})

describe('server-page auth failures never loop', () => {
  test('401 -> Market modal for the page', () => {
    expect(portalAuthFailureDestination(401, '/dashboard/admin/users')).toBe(protectedRedirect('/dashboard/admin/users'))
  })

  test.each([403, 404, 500])('%s (signed in) -> own dashboard, never portal /sign-in', (status) => {
    const dest = portalAuthFailureDestination(status, '/dashboard/admin/users')
    expect(dest).toBe('/dashboard')
    // The loop this replaces: signed-in on /sign-in?return_to=X is sent back to X.
    expect(signedInAuthRootDestination(ORIGINAL).toString()).toBe(`${P}/dashboard/admin/users`)
    expect(dest.startsWith('/sign-in')).toBe(false)
  })
})

describe('modal cross-links stay on the Market (no portal /sign-in round-trip)', () => {
  test('sign-in modal -> sign-up link and back keep return_to and intent', () => {
    const inProps = signInModalProps({ returnTo: '/dashboard/admin/users', intent: 'attorney' })
    expect(inProps.signUpUrl).toBe(`${M}/?ys_sign_up=1&intent=attorney&return_to=${enc(`${P}/dashboard/admin/users`)}`)
    const upProps = signUpModalProps({ returnTo: '/dashboard', intent: 'admin' })
    expect(upProps.signInUrl).toBe(`${M}/?ys_sign_in=1&return_to=${enc(`${P}/dashboard`)}`)
    expect(JSON.stringify(upProps)).not.toContain('admin')
  })
})

describe('source wiring', () => {
  const root = path.resolve(__dirname, '..')
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(rel)
      return /\.(tsx?|jsx?|mjs)$/.test(entry.name) ? [rel] : []
    })

  test('middleware answers anonymous protected documents with the Market modal directly', () => {
    const src = read('middleware.ts')
    expect(src).toContain('return marketSignInUrlForProtectedPath(req.nextUrl)')
    expect(src).not.toMatch(/return signInUrlForProtectedPath\(/)
  })

  test('no server page redirects to portal /sign-in or /sign-up', () => {
    const offenders = walk('app').filter((f) => /redirect\(\s*[`'"]\/sign-(in|up)/.test(read(f)))
    expect(offenders).toEqual([])
  })

  test('no app/component/lib code links to portal /sign-in or /sign-up', () => {
    const allowed = new Set([
      'lib/auth/portalAuthRedirect.ts', // documents the retired portal docs
      'lib/portalAuthLaneShell.ts', // comments describing the lane shell
      'lib/auth/marketAuthHandoff.ts', // Clerk sub-screens (factor-one, verify-email) must stay on portal
    ])
    const pattern = /portal\.yousafeconsultancy\.com\/sign-(in|up)|['"`]\/sign-(in|up)\?/
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')]
      .filter((f) => !allowed.has(f))
      .filter((f) => pattern.test(read(f)))
    expect(offenders).toEqual([])
  })

  test('admin section page guards with the loop-free helper', () => {
    const src = read('app/dashboard/admin/[section]/page.tsx')
    expect(src).toContain("redirectForPortalAuthFailure(auth, `/dashboard/admin/${section}`)")
    expect(src).toContain("'users'")
    expect(src).toContain("if (auth.role !== 'admin') redirect('/dashboard')")
  })
})

describe('admin index routes exist (no 404)', () => {
  const root = path.resolve(__dirname, '..')
  test.each([
    ['app/dashboard/admin/page.tsx', "redirect('/dashboard/admin/dashboard')"],
    ['app/dashboard/admin/templates/page.tsx', "redirect('/dashboard/admin/templates/pdf-maker')"],
  ])('%s redirects to a guarded admin page', (file, call) => {
    expect(fs.readFileSync(path.join(root, file), 'utf8')).toContain(call)
  })
})
