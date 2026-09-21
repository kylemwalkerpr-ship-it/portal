/**
 * MARKET-PORTAL-AUTH-HANDOFF-1102 R2 — portal auth-lane document shells.
 *
 * The live capture this suite locks in (2026-09-21, anonymous requests, no
 * credentials involved):
 *
 *   GET https://portal.yousafeconsultancy.com/sign-in/student
 *     200 · `cache-control: private, no-cache, no-store` · NO `x-opennext-cache`
 *     → a per-request Next.js render, interleaved with
 *     503 · `error code: 1102` (cf-ray a3e83a202c58724a, a3e82e157a81724b) and
 *     500 · `Internal Server Error` (cf-ray a3e82e17aba2724d)
 *   GET https://portal.yousafeconsultancy.com/ (same window)
 *     200 · `x-opennext-cache: HIT` · `s-maxage=31536000` → cache-served, never
 *     failed.
 *
 * So the failing state is NOT a Clerk handoff: it is a plain anonymous document
 * request for an auth lane, rendered per request, blowing the Workers Free
 * resource limit on a cold isolate. These contracts fail closed if any of the
 * three parts of the fix drift — a build-static lane document, a shell path
 * that is always a prerendered lane root, and middleware that routes every
 * Clerk sub-screen through that shell instead of a per-request render.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PORTAL_AUTH_DEFAULT_LANE,
  PORTAL_AUTH_LANE_ROOTS,
  isPortalAuthLaneRoot,
  portalAuthLaneRoots,
  portalAuthLaneShellPath,
  portalAuthLaneShellPaths,
} from '@/lib/portalAuthLaneShell'

const root = process.cwd()
const readRepo = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const middleware = readRepo('middleware.ts')
const signInPage = readRepo('app/sign-in/[[...rest]]/page.tsx')
const signUpPage = readRepo('app/sign-up/[[...rest]]/page.tsx')
const signInClient = readRepo('app/sign-in/[[...rest]]/SignInClient.tsx')
const signUpClient = readRepo('app/sign-up/[[...rest]]/SignUpClient.tsx')

const SHELL_PATHS = portalAuthLaneShellPaths()

/** The lane set a client component validates against, as written in source. */
function clientLaneSet(source: string, name: string): string[] {
  const match = source.match(new RegExp(`${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`))
  if (!match) throw new Error(`missing ${name} in the client source`)
  return match[1]
    .split(',')
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

describe('portal auth-lane shell mapping', () => {
  test('the prerendered documents are the lane bases plus every lane root', () => {
    expect(SHELL_PATHS).toEqual([
      '/sign-in',
      '/sign-in/student',
      '/sign-in/client',
      '/sign-in/consultant',
      '/sign-in/attorney',
      '/sign-in/admin',
      '/sign-up',
      '/sign-up/student',
      '/sign-up/client',
      '/sign-up/consultant',
      '/sign-up/attorney',
    ])
    // The live 1102 URL must be one of the prerendered documents itself.
    expect(SHELL_PATHS).toContain('/sign-in/student')
    expect(SHELL_PATHS).toContain('/sign-up/student')
    expect(SHELL_PATHS).toContain('/sign-in')
  })

  test('the canonical default lane is the student lane of both families', () => {
    expect(PORTAL_AUTH_DEFAULT_LANE).toBe('student')
    expect(portalAuthLaneRoots('sign-in')[0]).toBe('student')
    expect(portalAuthLaneRoots('sign-up')[0]).toBe('student')
    expect(PORTAL_AUTH_LANE_ROOTS['sign-up']).not.toContain('admin')
  })

  test('lane roots are served as-is: no rewrite for a prerendered document', () => {
    for (const shellPath of SHELL_PATHS) {
      expect(portalAuthLaneShellPath(shellPath)).toBeNull()
    }
    // Trailing slashes collapse onto the same prerendered document.
    expect(portalAuthLaneShellPath('/sign-in/')).toBeNull()
    expect(portalAuthLaneShellPath('/sign-up/student/')).toBeNull()
  })

  test('every Clerk sub-screen is routed to a prerendered lane shell', () => {
    const cases: Array<[string, string]> = [
      ['/sign-in/student/factor-one', '/sign-in/student'],
      ['/sign-in/student/factor-two', '/sign-in/student'],
      ['/sign-in/student/sso-callback', '/sign-in/student'],
      ['/sign-in/student/verify-email-address', '/sign-in/student'],
      ['/sign-in/student/reset-password', '/sign-in/student'],
      ['/sign-in/attorney/factor-one', '/sign-in/attorney'],
      ['/sign-in/admin/choose-organization', '/sign-in/admin'],
      ['/sign-up/student/verify-email-address', '/sign-up/student'],
      ['/sign-up/consultant/sso-callback', '/sign-up/consultant'],
      // Retired / unknown lane segments never reach a portal route of their own.
      ['/sign-in/sso-callback', '/sign-in/student'],
      ['/sign-in/provider', '/sign-in/student'],
      ['/sign-in/employer', '/sign-in/student'],
      ['/sign-up/admin', '/sign-up/student'],
      ['/sign-up/marketing', '/sign-up/student'],
    ]
    for (const [pathname, expected] of cases) {
      expect(portalAuthLaneShellPath(pathname)).toBe(expected)
    }
  })

  test('every shell target is a prerendered document (invariant)', () => {
    const probes = [
      '/sign-in',
      '/sign-in/',
      '/sign-in/student',
      '/sign-in/student/factor-one',
      '/sign-in/sso-callback',
      '/sign-in/provider',
      '/sign-inx',
      '/sign-up',
      '/sign-up/attorney/sso-callback',
      '/sign-up/whatever/deeper/still',
    ]
    for (const probe of probes) {
      const target = portalAuthLaneShellPath(probe)
      if (target === null) continue
      expect(SHELL_PATHS).toContain(target)
    }
  })

  test('non-auth paths are never rewritten onto an auth shell', () => {
    for (const pathname of [
      '/',
      '/dashboard',
      '/dashboard/orders',
      '/user/profile',
      '/api/v1/client/handshake',
      '/login',
      '/register',
      '/sign-inx',
      '/sign-inx/student',
      '/sign-upx',
      '/marketplace/sign-in/student',
      '/sign-in.student',
      '/SIGN-IN/student',
      '/sitemap.xml',
    ]) {
      expect(portalAuthLaneShellPath(pathname)).toBeNull()
    }
  })

  test('the mapping and the prerender enumeration share one lane list', () => {
    for (const family of ['sign-in', 'sign-up'] as const) {
      for (const lane of portalAuthLaneRoots(family)) {
        expect(isPortalAuthLaneRoot(family, lane)).toBe(true)
        expect(portalAuthLaneShellPath(`/${family}/${lane}/factor-one`)).toBe(`/${family}/${lane}`)
      }
    }
    // A lane the manifest does not list can never be a rewrite target.
    for (const family of ['sign-in', 'sign-up'] as const) {
      expect(portalAuthLaneShellPath(`/${family}/not-a-lane/factor-one`)).toBe(`/${family}/student`)
    }
  })
})

describe('the lane documents stay build-static', () => {
  const pages: Array<[string, string]> = [
    ['app/sign-in/[[...rest]]/page.tsx', signInPage],
    ['app/sign-up/[[...rest]]/page.tsx', signUpPage],
  ]

  test('no request-time server work can make a lane dynamic again', () => {
    for (const [file, source] of pages) {
      expect(`${file}:${/from\s+['"]next\/headers['"]/.test(source)}`).toBe(`${file}:false`)
      expect(`${file}:${/\bawait\s+headers\s*\(/.test(source)}`).toBe(`${file}:false`)
      expect(`${file}:${/\btranslateBatch\s*\(/.test(source)}`).toBe(`${file}:false`)
      expect(`${file}:${/\bawait\s+auth\s*\(/.test(source)}`).toBe(`${file}:false`)
      expect(`${file}:${/@clerk\/nextjs\/server/.test(source)}`).toBe(`${file}:false`)
      expect(`${file}:${/\bsearchParams\b/.test(source)}`).toBe(`${file}:false`)
    }
  })

  test('both pages pin force-static and enumerate the shared lane list', () => {
    for (const [file, source] of pages) {
      expect(`${file}:${/export\s+const\s+dynamic\s*=\s*['"]force-static['"]/.test(source)}`).toBe(
        `${file}:true`,
      )
      // Fail closed: an unenumerated param must 404 instead of rendering.
      expect(`${file}:${/export\s+const\s+dynamicParams\s*=\s*false/.test(source)}`).toBe(
        `${file}:true`,
      )
      expect(`${file}:${/export\s+function\s+generateStaticParams\s*\(/.test(source)}`).toBe(
        `${file}:true`,
      )
      // The optional catch-all base document (rest: []) must be enumerated too,
      // otherwise /sign-in and /sign-up have no prerendered document.
      expect(source).toContain('{ rest: [] as string[] }')
    }
    expect(signInPage).toContain("portalAuthLaneRoots('sign-in')")
    expect(signUpPage).toContain("portalAuthLaneRoots('sign-up')")
  })

  test('noindex metadata survives without server translation', () => {
    for (const [, source] of pages) {
      expect(source).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/)
      expect(source).toContain('alternates: { canonical: null }')
    }
  })

  test('the client lane sets cannot drift from the prerendered lane roots', () => {
    expect(new Set(clientLaneSet(signInClient, 'VALID_SIGN_IN_LANES'))).toEqual(
      new Set(portalAuthLaneRoots('sign-in')),
    )
    expect(new Set(clientLaneSet(signUpClient, 'VALID_SIGN_UP_LANES'))).toEqual(
      new Set(portalAuthLaneRoots('sign-up')),
    )
    // The sign-up admin lane must keep redirecting to the sign-in admin lane.
    expect(signUpClient).toContain("const ADMIN_SIGN_IN_URL = '/sign-in/admin'")
    expect(SHELL_PATHS).toContain('/sign-in/admin')
  })
})

describe('middleware wiring', () => {
  const wrapper = middleware.slice(middleware.indexOf('export default function middleware('))
  const portalGuard = wrapper.indexOf('requestHostname(req) === PORTAL_HOST')
  const bypassCall = wrapper.indexOf('shouldBypassClerkForPortalRequest(', portalGuard)
  const shellBranch = wrapper.indexOf('portalAuthLaneShellPath(req.nextUrl.pathname)', bypassCall)
  const fastPath = wrapper.indexOf('return handlePortalAnonymousDocumentRequest(req)', bypassCall)

  test('the shell branch sits behind the fail-closed Clerk-state guard', () => {
    expect(portalGuard).toBeGreaterThan(-1)
    expect(bypassCall).toBeGreaterThan(portalGuard)
    // Inside the bypass: the helper already proved there is no Clerk state on
    // the request (handshake jar, __session, active __client_uat, __clerk*).
    expect(shellBranch).toBeGreaterThan(bypassCall)
    expect(fastPath).toBeGreaterThan(bypassCall)
    expect(wrapper).toContain('shouldBypassClerkForPortalRequest(')
    expect(wrapper).toContain('return handlePortalAuthLaneShellRequest(req, authLaneShellPath)')
    expect(wrapper).toContain('return clerkHandler(req, event)')
  })

  test('the shell handler is separate from the anonymous document answer', () => {
    const shellHandler = middleware.indexOf('function handlePortalAuthLaneShellRequest(')
    const anonymousHandler = middleware.indexOf('function handlePortalAnonymousDocumentRequest(')
    const clerkStart = middleware.indexOf('const clerkHandler = clerkMiddleware(')
    const anonymousSlice = middleware.slice(anonymousHandler, clerkStart)

    expect(shellHandler).toBeGreaterThan(-1)
    expect(shellHandler).toBeLessThan(anonymousHandler)
    // #260's fast path still answers the root document with a plain pass-through.
    expect(anonymousSlice).toContain('withPathHeaders(NextResponse.next(), pathname, search, lang)')
    expect(anonymousSlice).not.toContain('NextResponse.rewrite')
    expect(anonymousSlice).not.toContain('await auth()')
    // The shell handler keeps the portal pre-Clerk contract (301 + preflight).
    const shellHandlerSource = middleware.slice(shellHandler, anonymousHandler)
    expect(shellHandlerSource).toContain('stripTrackingParams(new URL(req.url))')
    expect(shellHandlerSource).toContain('status: 301')
    expect(shellHandlerSource).toContain('isAllowedCorsPreflight(req)')
    expect(shellHandlerSource).toContain('status: 204')
    expect(shellHandlerSource).toContain(
      'NextResponse.rewrite(new URL(shellPath, req.url))',
    )
    expect(shellHandlerSource).not.toContain('await auth()')
  })

  test('the Clerk path keeps sessions fail-closed and only rewrites the portal shell', () => {
    const clerkBody = middleware.slice(middleware.indexOf('const clerkHandler = clerkMiddleware('))
    expect(clerkBody).toContain('const { userId } = await auth()')
    expect(clerkBody).toContain("if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))")
    expect(clerkBody).toContain("error: 'Unauthorized'")
    expect(clerkBody).toContain('authorizedParties:')
    // The Clerk-side shell branch is portal-only: a request that carried Clerk
    // state still resolves its session first, then receives the prebuilt shell.
    expect(clerkBody).toContain(
      "hostname === PORTAL_HOST ? portalAuthLaneShellPath(pathname) : null",
    )
  })
})

describe('the fresh failing state is served without a per-request render', () => {
  // The exact requests captured live: an anonymous, cookie-free navigation to
  // the auth lanes (the state that produced 503 `error code: 1102` /
  // 500 Internal Server Error). Each must resolve to a prerendered document.
  const capturedRequests = ['/sign-in/student', '/sign-in', '/sign-up/student', '/sign-up']

  test('an anonymous lane navigation never needs a render', () => {
    for (const pathname of capturedRequests) {
      const shell = portalAuthLaneShellPath(pathname)
      const served = shell ?? pathname
      expect(SHELL_PATHS).toContain(served)
    }
  })

  test('no /sign-in or /sign-up path can fall back to the Next.js server', () => {
    // Every path family the Clerk path router can produce underneath a lane:
    // deeper screens map to a shell, lane roots are prerendered themselves.
    const clerkScreens = [
      'factor-one',
      'factor-two',
      'sso-callback',
      'verify-email-address',
      'reset-password',
      'forgot-password',
      'continue',
      'create',
      'tasks',
      'choose-organization',
    ]
    for (const family of ['sign-in', 'sign-up'] as const) {
      const lanes = [...portalAuthLaneRoots(family), 'unknown-lane']
      for (const lane of lanes) {
        for (const screen of clerkScreens) {
          const pathname = `/${family}/${lane}/${screen}`
          const shell = portalAuthLaneShellPath(pathname)
          expect(SHELL_PATHS).toContain(shell ?? pathname)
        }
      }
      // Legacy single-segment screens (`/sign-in/sso-callback`) too.
      const legacy = `/${family}/sso-callback`
      expect(SHELL_PATHS).toContain(portalAuthLaneShellPath(legacy) ?? legacy)
    }
  })
})
