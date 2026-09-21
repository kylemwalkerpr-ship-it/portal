import type { Metadata } from 'next'
import { EstateFooter } from '@/components/EstateFooter'
import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
import SignInClient from './SignInClient'

// Build-static on purpose — AND on evidence. MARKET-PORTAL-AUTH-HANDOFF-1102 R2:
// the 1102 ("Worker exceeded resource limits") class is this document being
// rendered per request. Live capture (2026-09-21, anonymous requests):
//
//   /sign-in/student → 200 with `cache-control: private, no-cache, no-store`
//                      and no `x-opennext-cache` (a fresh render) interleaved
//                      with 503 `error code: 1102` (cf-ray a3e83a202c58724a)
//                      and 500 (cf-ray a3e82e17aba2724d),
//   /               → 200, `x-opennext-cache: HIT`, `s-maxage=31536000`.
//
// The auth lanes were the only portal documents still rendering per request:
// `generateMetadata` read the request language header and ran the server
// translation helper while the route's optional catch-all stayed dynamic, so
// every anonymous navigation paid a full React render plus a translation
// lookup on a cold Worker isolate. Portal is noindex sitewide, so the
// translated metadata carried zero SEO value (same rationale as app/page.tsx).
//
// The document is now a prebuilt shell: no request-time API, `force-static`,
// and one prerendered document per lane root, published in the read-only
// static-assets incremental cache and served by OpenNext cache interception.
// Clerk's own screens underneath the lane
// (/sign-in/student/factor-one, /sign-in/student/sso-callback, ...) are routed
// back to the lane shell by middleware.ts (lib/portalAuthLaneShell.ts), so no
// path under /sign-in can reach per-request rendering. The client component
// (SignInClient) still owns the entire auth flow.
export const dynamic = 'force-static'

// Fail closed: every path underneath the lane roots is served the lane shell
// by middleware.ts (lib/portalAuthLaneShell.ts) before routing, so an
// unenumerated param can only be a path that escaped that mapping. With
// `dynamicParams` left at its default such a request would fall back to an
// on-demand render — the exact resource-limit class this fix removes — so the
// route answers a cheap 404 instead.
export const dynamicParams = false

export function generateStaticParams() {
  return [
    { rest: [] as string[] },
    ...portalAuthLaneRoots('sign-in').map((lane) => ({ rest: [lane] })),
  ]
}

export function generateMetadata(): Metadata {
  const title = 'Sign in to YouSafe Portal'
  const description =
    'Sign in to your YouSafe Consultancy account — clients, attorneys, consultants, and admins.'
  return {
    title,
    description,
    // No canonical on noindex pages. Google ignores canonical on noindex
    // pages anyway, and emitting one (whether self or root) makes Screaming
    // Frog flag the page as either "Canonicalised" or "Non-Indexable
    // Canonical." Setting null explicitly removes the inherited root-layout
    // canonical so no <link rel="canonical"> is rendered at all.
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignInPage() {
  return (
    <>
      <SignInClient />
      <EstateFooter />
    </>
  )
}
