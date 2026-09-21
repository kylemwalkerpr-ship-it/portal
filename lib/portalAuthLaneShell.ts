/**
 * Portal auth-lane *document shells* (MARKET-PORTAL-AUTH-HANDOFF-1102 R2).
 *
 * Live evidence this module exists for (2026-09-21, anonymous requests, no
 * credentials involved):
 *
 *   GET https://portal.yousafeconsultancy.com/sign-in/student
 *     200 with `cache-control: private, no-cache, no-store` and NO
 *     `x-opennext-cache` — i.e. a per-request Next.js render — interleaved with
 *     503 `error code: 1102` (cf-ray a3e83a202c58724a, a3e82e157a81724b) and
 *     500 `Internal Server Error` (cf-ray a3e82e17aba2724d).
 *
 *   GET https://portal.yousafeconsultancy.com/ in the same window:
 *     200, `x-opennext-cache: HIT`, `s-maxage=31536000` — a cache-served
 *     document that never failed.
 *
 * The failing class is therefore the *per-request render* of the auth-lane
 * documents, not Clerk's session work: those requests carry no Clerk state at
 * all (lib/portalMiddlewareBypass.ts already keeps Clerk off the anonymous
 * lanes) and still exceed the Workers Free CPU budget on a cold isolate.
 *
 * The lane documents are prebuilt shells
 * (`dynamic = 'force-static'` + `generateStaticParams` in
 * app/sign-in/[[...rest]]/page.tsx and app/sign-up/[[...rest]]/page.tsx)
 * published in the read-only static-assets incremental cache. This module owns
 * the single lane list those documents are enumerated from, and the canonical
 * form of the mapping every Clerk sub-screen shares. The mapping is *applied*
 * at build time by the portal-host-scoped `beforeFiles` rules in next.config.ts
 * (see portalAuthLaneShellRewrites there) — never by middleware, which keeps
 * seeing the original request path:
 *
 *   /sign-in/student                      → prerendered lane root (no rewrite)
 *   /sign-in/student/factor-one           → /sign-in/student
 *   /sign-in/student/sso-callback         → /sign-in/student
 *   /sign-in/sso-callback (legacy)        → /sign-in/student
 *   /sign-in/provider (unknown lane)      → /sign-in/student
 *   /sign-up/admin (sign-up has no admin) → /sign-up/student
 *
 * Clerk's path routing (`routing="path"`, `path="/sign-in/<lane>"`) walks its
 * own sub-screens underneath these documents, and no portal route exists for
 * those paths — which is why they used to fall back to per-request rendering.
 * The rewrite target is ALWAYS a prerendered lane root, the browser URL is
 * never changed (so the client-side Clerk router still resolves its step from
 * the real URL), and this module decides nothing about auth: every request
 * that carries Clerk state (handshake jar, session token, active
 * `__client_uat`, `__clerk*` parameter) stays with clerkMiddleware.
 *
 * The lane list lives in lib/portalAuthLaneShells.json so the prerender
 * enumeration, the build-time rewrite mapping in next.config.ts and the deploy
 * gate (scripts/verify-portal-auth-lane-static-cache.mjs) can never drift.
 */
import laneManifest from './portalAuthLaneShells.json'

export type PortalAuthLaneFamily = 'sign-in' | 'sign-up'

/**
 * Lane roots that actually have a portal route and are prerendered, in the
 * order `generateStaticParams` enumerates them. `student` is the canonical
 * default lane every unknown/legacy segment falls back to.
 */
export const PORTAL_AUTH_LANE_ROOTS: Readonly<Record<PortalAuthLaneFamily, readonly string[]>> = {
  'sign-in': laneManifest['sign-in'],
  'sign-up': laneManifest['sign-up'],
}

/** The lane an unknown or legacy segment resolves to (must be a lane root). */
export const PORTAL_AUTH_DEFAULT_LANE = 'student'

export const PORTAL_AUTH_LANE_FAMILIES: readonly PortalAuthLaneFamily[] = ['sign-in', 'sign-up']

/** Lane roots for one family, in prerender order. */
export function portalAuthLaneRoots(family: PortalAuthLaneFamily): readonly string[] {
  return PORTAL_AUTH_LANE_ROOTS[family]
}

/** True when `lane` has a prerendered lane root under `family`. */
export function isPortalAuthLaneRoot(family: PortalAuthLaneFamily, lane: string): boolean {
  return portalAuthLaneRoots(family).includes(lane)
}

/**
 * Every prerendered auth-lane document, in the exact order the pages'
 * `generateStaticParams` enumerates them: the optional catch-all base
 * (`/sign-in`, `/sign-up`) followed by each lane root.
 */
export function portalAuthLaneShellPaths(): string[] {
  const paths: string[] = []
  for (const family of PORTAL_AUTH_LANE_FAMILIES) {
    paths.push(`/${family}`)
    for (const lane of portalAuthLaneRoots(family)) paths.push(`/${family}/${lane}`)
  }
  return paths
}

/**
 * The prerendered lane shell a Clerk sub-screen must be served from, or null
 * when the request already targets a prerendered document (or is not an auth
 * lane at all).
 *
 * Canonical reference only: the executable mapping is the `beforeFiles` rules
 * next.config.ts builds from this same module, and
 * tests/portal-auth-lane-shell.test.ts fails closed if the two ever disagree.
 * Nothing here runs on a request — middleware makes no shell decision.
 *
 * Only paths that have NO prerendered document of their own map to a shell:
 * the `/sign-in` + `/sign-up` bases and the lane roots return null and are
 * served straight from the incremental cache.
 */
export function portalAuthLaneShellPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  const family = segments[0]
  if (family !== 'sign-in' && family !== 'sign-up') return null
  // `/sign-in` and `/sign-up` themselves are prerendered (optional catch-all
  // base) — never rewritten.
  if (segments.length <= 1) return null

  const lane = segments[1]
  const laneIsRoot = isPortalAuthLaneRoot(family, lane)
  // A lane root is prerendered on its own — no rewrite needed.
  if (segments.length === 2 && laneIsRoot) return null

  // Deeper Clerk screens (…/factor-one, …/sso-callback, …) and retired or
  // unknown lane segments (`/sign-in/provider`, `/sign-up/admin`) all render
  // the same shell; the client resolves the real lane from the URL.
  return `/${family}/${laneIsRoot ? lane : PORTAL_AUTH_DEFAULT_LANE}`
}
