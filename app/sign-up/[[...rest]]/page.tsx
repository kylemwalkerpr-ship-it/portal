import type { Metadata } from 'next'
import { EstateFooter } from '@/components/EstateFooter'
import { portalAuthLaneRoots } from '@/lib/portalAuthLaneShell'
import SignUpClient from './SignUpClient'

// Build-static on purpose — see app/sign-in/[[...rest]]/page.tsx for the live
// 1102 capture and the full rationale (MARKET-PORTAL-AUTH-HANDOFF-1102 R2):
// these documents were the last portal documents rendering per request (a
// request-header read, a server translation lookup and a dynamic optional
// catch-all), they carry no Clerk state when anonymous, and they now ship as
// prebuilt shells served from the static-assets incremental cache. Clerk
// sub-screens under a lane root are routed back to the lane shell by
// middleware.ts (lib/portalAuthLaneShell.ts).
export const dynamic = 'force-static'

// Fail closed — see app/sign-in/[[...rest]]/page.tsx: an unenumerated param
// (a path that escaped the middleware lane-shell mapping) must never fall back
// to an on-demand render.
export const dynamicParams = false

export function generateStaticParams() {
  return [
    { rest: [] as string[] },
    ...portalAuthLaneRoots('sign-up').map((lane) => ({ rest: [lane] })),
  ]
}

export function generateMetadata(): Metadata {
  const title = 'Create your YouSafe account'
  const description =
    'Sign up for YouSafe Consultancy — clients, attorneys, and consultants. Free to start, secure by design.'
  return {
    title,
    description,
    // No canonical on noindex pages — see /sign-in for rationale.
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignUpPage() {
  return (
    <>
      <SignUpClient />
      <EstateFooter />
    </>
  )
}
