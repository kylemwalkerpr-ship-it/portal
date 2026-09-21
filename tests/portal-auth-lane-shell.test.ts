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
import nextConfig from '../next.config'
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

const nextConfigSource = readRepo('next.config.ts')
const middlewareSource = readRepo('middleware.ts')
/** The portal host exactly as the runtime entrypoint declares it. */
const RUNTIME_PORTAL_HOST = middlewareSource.match(/const PORTAL_HOST = '([^']+)'/)?.[1]
const MARKET_HOST = 'market.yousafeconsultancy.com'
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

describe('build-time rewriting onto the lane shells', () => {
  type RewriteRule = {
    source: string
    destination: string
    has?: Array<{ type: string; value?: string }>
  }

  /**
   * Mirror the path-to-regexp semantics Next uses for config rewrites:
   * `:name` matches exactly one non-empty segment, and `:name*` repeats zero or
   * more segments with the delimiter INSIDE the repeated group — `/a/:rest*`
   * anchors the path after `/a` and then repeats `/[^/]+` zero or more times, so
   * it matches `/a`, `/a/b` and `/a/b/c` and never requires a trailing
   * separator (a trailing slash is also accepted).
   *
   * Modelling the repeat as a `/`-separated segment (`'/a/(?:/.*)?'`) is wrong:
   * it demands an extra slash, so `/sign-in/student/factor-one` stops matching
   * the very rule that serves it. This helper asserts the documented Next
   * semantics instead of a hand-rolled approximation.
   */
  function rulePattern(source: string): RegExp {
    let pattern = ''
    for (const segment of source.split('/').filter(Boolean)) {
      if (segment.startsWith(':') && segment.endsWith('*')) {
        pattern += '(?:/[^/]+)*'
      } else if (segment.startsWith(':')) {
        pattern += '/[^/]+'
      } else {
        pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      }
    }
    return new RegExp(`^${pattern}/?$`)
  }

  /** A rule applies only when every `has` condition matches the request. */
  function ruleHostMatches(rule: RewriteRule, host: string): boolean {
    if (!rule.has || rule.has.length === 0) return true
    return rule.has.every((condition) => condition.type !== 'host' || condition.value === host)
  }

  async function authLaneRules(): Promise<RewriteRule[]> {
    const rewrites = await nextConfig.rewrites!()
    const beforeFiles = Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? [])
    return (beforeFiles as RewriteRule[]).filter(
      (rule) => rule.source.startsWith('/sign-in') || rule.source.startsWith('/sign-up'),
    )
  }

  async function storefrontRules(): Promise<RewriteRule[]> {
    const rewrites = await nextConfig.rewrites!()
    const beforeFiles = Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? [])
    return (beforeFiles as RewriteRule[]).filter((rule) => rule.source.startsWith('/shop/'))
  }

  /**
   * First matching rewrite wins, exactly like Next/OpenNext routing. Defaults to
   * the portal host because that is the only host these rules may serve.
   */
  async function rewrittenPath(
    pathname: string,
    host: string = RUNTIME_PORTAL_HOST ?? '',
  ): Promise<string> {
    const rule = (await authLaneRules()).find(
      (candidate) => ruleHostMatches(candidate, host) && rulePattern(candidate.source).test(pathname),
    )
    return rule ? rule.destination : pathname
  }

  test('the config enumerates exactly the language of lane roots it must serve', async () => {
    const rules = await authLaneRules()
    const laneRules = rules.slice(0, SHELL_PATHS.length - 2)
    expect(laneRules.map((rule) => rule.source)).toEqual(
      (['sign-in', 'sign-up'] as const).flatMap((family) =>
        portalAuthLaneRoots(family).map((lane) => `/${family}/${lane}/:screen*`),
      ),
    )
    for (const rule of laneRules) {
      expect(rule.destination).toBe(rule.source.replace('/:screen*', ''))
    }
    // The remaining rules are the canonical fallbacks for retired/unknown lanes.
    expect(rules.slice(laneRules.length).map((rule) => [rule.source, rule.destination])).toEqual([
      ['/sign-in/:lane/:rest*', '/sign-in/student'],
      ['/sign-up/:lane/:rest*', '/sign-up/student'],
    ])
  })

  test('every auth-lane rewrite is pinned to the runtime portal host', async () => {
    // middleware.ts is the runtime entrypoint that decides what "the portal
    // host" means; the build config cannot import it (it pulls Clerk), so the
    // literal lives in two files and this contract keeps them equal.
    expect(RUNTIME_PORTAL_HOST).toBe('portal.yousafeconsultancy.com')

    const rules = await authLaneRules()
    expect(rules.length).toBe(SHELL_PATHS.length - 2 + 2)
    for (const rule of rules) {
      expect(rule.has).toEqual([{ type: 'host', value: RUNTIME_PORTAL_HOST }])
    }
    // And the value in the build config is that same host, not a copy that drifted.
    expect(nextConfigSource).toContain(
      `const PORTAL_AUTH_LANE_HOST = '${RUNTIME_PORTAL_HOST}'`,
    )
  })

  test('the market host is never rewritten onto a portal lane shell', async () => {
    const probes = [
      '/sign-in',
      '/sign-in/student',
      '/sign-in/student/factor-one',
      '/sign-in/student/sso-callback',
      '/sign-in/attorney/factor-one',
      '/sign-in/sso-callback',
      '/sign-in/provider',
      '/sign-in/provider/deep/path',
      '/sign-up',
      '/sign-up/student',
      '/sign-up/consultant/verify-email-address',
      '/sign-up/admin',
    ]
    for (const pathname of probes) {
      // Untouched on the market host: the lane shells belong to the portal app.
      expect(`${MARKET_HOST}${pathname} -> ${await rewrittenPath(pathname, MARKET_HOST)}`).toBe(
        `${MARKET_HOST}${pathname} -> ${pathname}`,
      )
      // …and still served the shell on the portal host, so the condition scopes
      // rather than disables the fix.
      const portalTarget = await rewrittenPath(pathname, RUNTIME_PORTAL_HOST!)
      expect(SHELL_PATHS).toContain(portalTarget)
    }
    // An unrelated/unknown host behaves like the market host: no rewrite.
    expect(await rewrittenPath('/sign-in/student/factor-one', 'example.invalid')).toBe(
      '/sign-in/student/factor-one',
    )
  })

  test('the storefront rewrites stay host-agnostic and unchanged', async () => {
    const shopRules = await storefrontRules()
    expect(shopRules.length).toBeGreaterThan(0)
    for (const rule of shopRules) {
      expect(rule.has).toBeUndefined()
      expect(rule.source.startsWith('/shop/')).toBe(true)
      expect(rule.destination.startsWith('/payhip-product/')).toBe(true)
    }
  })

  test('every path resolves to the canonical shell the lib documents', async () => {
    const probes = [
      '/sign-in',
      '/sign-in/student',
      '/sign-in/student/factor-one',
      '/sign-in/student/factor-two/deep',
      '/sign-in/student/sso-callback',
      '/sign-in/attorney/factor-one',
      '/sign-in/admin/choose-organization',
      '/sign-in/sso-callback',
      '/sign-in/provider',
      '/sign-in/provider/deep/path',
      '/sign-up',
      '/sign-up/student',
      '/sign-up/consultant/verify-email-address',
      '/sign-up/admin',
      '/sign-up/marketing',
    ]
    for (const pathname of probes) {
      const canonical = portalAuthLaneShellPath(pathname) ?? pathname
      expect(`${pathname} -> ${await rewrittenPath(pathname)}`).toBe(`${pathname} -> ${canonical}`)
      expect(SHELL_PATHS).toContain(canonical)
    }
  })

  test('the rewrites are beforeFiles, ahead of the storefront rewrites', async () => {
    const rewrites = await nextConfig.rewrites!()
    const beforeFiles = Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? [])
    // OpenNext applies beforeFiles rewrites in order, then asks the read-only
    // static-assets incremental cache for the rewritten path — the lane rules
    // must therefore come before any other beforeFiles rule.
    const first = beforeFiles[0] as RewriteRule
    expect([first.source, first.destination]).toEqual([
      '/sign-in/student/:screen*',
      '/sign-in/student',
    ])
    expect(first.has).toEqual([{ type: 'host', value: RUNTIME_PORTAL_HOST }])
    expect((rewrites as { beforeFiles: RewriteRule[] }).beforeFiles.some((rule) => rule.source.startsWith('/shop/'))).toBe(true)
    expect(nextConfigSource).toContain('portalAuthLaneShellRewrites')
    expect(nextConfigSource).toContain("import portalAuthLaneManifest from './lib/portalAuthLaneShells.json'")
  })

  test('non-auth paths are never rewritten by the lane rules', async () => {
    for (const pathname of [
      '/',
      '/dashboard',
      '/api/v1/client/handshake',
      '/login',
      '/register',
      '/sign-inx',
      '/sign-upx/student',
      '/marketplace/sign-in/student',
      '/sign-in.student',
    ]) {
      expect(await rewrittenPath(pathname)).toBe(pathname)
    }
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
