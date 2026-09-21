import type { NextConfig } from 'next'

import portalAuthLaneManifest from './lib/portalAuthLaneShells.json'

/**
 * PORTAL AUTH-LANE DOCUMENT SHELLS — MARKET-PORTAL-AUTH-HANDOFF-1102 R2.
 *
 * `/sign-in/**` and `/sign-up/**` are the Cloudflare 1102 class this incident
 * is about. Live capture (2026-09-21, anonymous requests, no credentials):
 *
 *   GET /sign-in/student → 200 with `cache-control: private, no-cache,
 *     no-store` and NO `x-opennext-cache` (a fresh per-request Next.js render)
 *     interleaved with 503 `error code: 1102` (cf-ray a3e83a202c58724a,
 *     a3e82e157a81724b) and 500 (cf-ray a3e82e17aba2724d);
 *   GET / → 200, `x-opennext-cache: HIT`, `s-maxage=31536000` (cache-served,
 *     never failed in the same window).
 *
 * The lane documents are now build-static shells (app/sign-in|sign-up/[[...rest]]
 * page.tsx: `force-static` + `dynamicParams = false` + `generateStaticParams`)
 * published in the read-only static-assets incremental cache. Clerk's path
 * routing still walks its own sub-screens underneath a lane root
 * (`/sign-in/student/factor-one`, `…/sso-callback`, `…/verify-email-address`,
 * the retired `/sign-in/sso-callback`, unknown lanes such as
 * `/sign-in/provider`) and no portal route exists for those paths, so every one
 * of them is rewritten onto a prerendered lane document BEFORE route matching.
 *
 * OpenNext applies `beforeFiles` rewrites in its routing handler and then asks
 * the incremental cache interception for the rewritten path, so the rewritten
 * request is answered from `cdn-cgi/_next_cache/<build>/<lane>.cache` with no
 * React render at all. The browser URL is never changed, so Clerk's client-side
 * path router still resolves its step (and its lane) from the real URL, and no
 * auth decision moves: Next runs Proxy/middleware BEFORE `beforeFiles`, so
 * middleware.ts, the anonymous portal fast path (lib/portalMiddlewareBypass.ts)
 * and clerkMiddleware all see the original request unchanged.
 *
 * HOST SCOPED: every auth-lane rule carries `has: [{ type: 'host', value }]`.
 * `beforeFiles` is applied by the build config, which knows nothing about the
 * host split middleware.ts enforces, so without the condition a
 * `market.yousafeconsultancy.com/sign-in/**` request would be rewritten onto a
 * portal lane document. The portal host literal is duplicated from
 * `PORTAL_HOST` in middleware.ts on purpose — that file is a Next entrypoint
 * that imports Clerk, so the build config cannot import it — and
 * tests/portal-auth-lane-shell.test.ts fails closed if the two drift apart.
 *
 * Rule order matters — the first matching rewrite wins:
 *   1..N  one rule per lane root: a deeper Clerk screen is served THAT lane's
 *         document, so `/sign-in/attorney/factor-one` keeps the attorney lane;
 *   last  any other segment under the family (retired/unknown lane) falls back
 *         to the canonical student shell, unchanged from the pre-1102 contract.
 *
 * scripts/verify-portal-auth-lane-static-cache.mjs fails the build/deploy closed
 * when the lane documents are not published, and the regression suite
 * (tests/portal-auth-lane-shell.test.ts) proves these rules stay equivalent to
 * the canonical mapping in lib/portalAuthLaneShell.ts.
 */
const PORTAL_AUTH_LANE_ROOTS: Record<'sign-in' | 'sign-up', readonly string[]> = {
  'sign-in': portalAuthLaneManifest['sign-in'],
  'sign-up': portalAuthLaneManifest['sign-up'],
}

/**
 * The only host the auth-lane shells may be served on. Mirrors `PORTAL_HOST` in
 * middleware.ts (which imports Clerk and therefore cannot be imported here);
 * tests/portal-auth-lane-shell.test.ts asserts the two never drift.
 */
const PORTAL_AUTH_LANE_HOST = 'portal.yousafeconsultancy.com'

/** `has` condition that pins an auth-lane rewrite to the portal host. */
const PORTAL_AUTH_LANE_HOST_CONDITION = [
  { type: 'host' as const, value: PORTAL_AUTH_LANE_HOST },
]

const portalAuthLaneShellRewrites = [
  ...(['sign-in', 'sign-up'] as const).flatMap((family) =>
    PORTAL_AUTH_LANE_ROOTS[family].map((lane) => ({
      source: `/${family}/${lane}/:screen*`,
      destination: `/${family}/${lane}`,
      has: PORTAL_AUTH_LANE_HOST_CONDITION,
    })),
  ),
  ...(['sign-in', 'sign-up'] as const).map((family) => ({
    source: `/${family}/:lane/:rest*`,
    destination: `/${family}/student`,
    has: PORTAL_AUTH_LANE_HOST_CONDITION,
  })),
]

// Site-wide security headers. Applied to every response via Next's
// `headers()` config. Mirrors the policy emitted by the static-export
// apps' `public/_headers` files so the whole ecosystem stays consistent.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy',   value: "frame-ancestors 'self'" },
]

const legacyMarketplaceRedirects = [{
  source: '/marketplace/:path*',
  destination: 'https://market.yousafeconsultancy.com/:path*',
  permanent: true,
}]

// Phase-A-cleared Payhip products 10-36. Rewriting only these exact public
// shop URLs leaves the already-shipped Batch-1 immigration pages untouched.
const auditedPayhipShopSlugs = [
  'us-i134-financial-support-companion-pack',
  'us-stem-opt-i765-i983-companion-pack',
  'us-opt-i765-application-prep-pack',
  'us-b1b2-visitor-visa-ds160-invitation-pack',
  'us-f1-interview-home-ties-pack',
  'us-f1-student-visa-ds160-i20-pack',
  'canada-study-permit-complete-pack',
  'weekly-meal-planner-grocery-list',
  '90-day-guided-self-reflection-journal',
  'svg-cut-file-bundle-8-designs',
  'minimalist-wall-art-bundle-6-prints',
  'undated-hyperlinked-digital-planner',
  'social-media-post-template-pack-8-editable-posts',
  'business-plan-investor-pitch-deck-template',
  'client-welcome-packet-template',
  'wedding-invitation-suite-editable-word',
  'ats-resume-matching-cover-letter-templates',
  'small-business-startup-checklist-90-day-plan',
  '30-day-habit-wellness-tracker',
  '50-ai-prompts-content-creators-marketers',
  'rental-property-income-expense-tracker',
  'content-calendar-social-media-planner',
  'wedding-budget-vendor-tracker',
  'household-budget-debt-payoff-tracker',
  'freelance-rate-project-profitability-calculator',
  'solo-consultant-business-toolkit',
  '50-ai-prompts-small-business-owners',
] as const

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
  async redirects() {
    // Preserve authority from the retired public `/marketplace` namespace.
    // Next applies these before Proxy/middleware and carries query parameters
    // through to the clean standalone Marketplace URL.
    return legacyMarketplaceRedirects
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Auth-lane Clerk sub-screens first: they are the CPU-budget route the
        // 1102 incident names, and they must never fall through to route
        // matching (see portalAuthLaneShellRewrites above). Portal host only.
        ...portalAuthLaneShellRewrites,
        // Storefront rewrites stay host-agnostic, exactly as they shipped.
        ...auditedPayhipShopSlugs.map((slug) => ({
          source: `/shop/${slug}`,
          destination: `/payhip-product/${slug}`,
        })),
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
