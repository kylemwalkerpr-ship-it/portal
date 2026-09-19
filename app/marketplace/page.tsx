import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PublicMarketplaceLanding } from './PublicMarketplaceLanding'
import { GigsDiscoveryQueryGate } from '@/components/marketplace/GigsDiscoveryQueryGate'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

// TRUE SSG — no `dynamic`, no ISR window, and the URL query string is never
// parsed on the server.
// Production evidence: rendering this landing per request (ISR window plus
// server-side filter/pagination parsing) exceeded the Workers Free 10ms CPU
// budget, and the Free plan has no real ISR queue (OpenNext's default queue is
// a dummy that throws). The landing is therefore rendered once at build time.
//
// Query-string discovery stays client-side. `GigsDiscoveryQueryGate` reads the
// real URL after hydration and swaps in GigDiscoveryPage whenever ANY
// recognized discovery key is present; while the boundary is pending (i.e. in
// the static HTML crawlers receive) the fallback is the default
// `PublicMarketplaceLanding country="all" page={1}`.

const canonicalUrl = getMarketplaceCanonicalUrl('/')

export const metadata: Metadata = {
  title: 'YouSafe Marketplace — Verified Immigration & Tenancy Help',
  description:
    'Browse vetted US, UK, Canada, and Australia immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.',
  alternates: { canonical: canonicalUrl },
  robots: { index: true, follow: true },
  openGraph: {
    url: canonicalUrl,
    title: 'YouSafe Marketplace — Verified Immigration & Tenancy Help',
    description:
      'Browse vetted US, UK, Canada, and Australia immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.',
    type: 'website',
  },
}

export default function MarketplaceLandingPage() {
  // No role-gating on the marketplace landing. Anyone — anon, client,
  // student, attorney, consultant, admin, support — can browse the public
  // marketplace. Earlier code redirected non-client/non-student roles to
  // /dashboard, which broke the common case of a signed-in provider
  // clicking "Marketplace" in their dashboard nav to see their own
  // listings or competing services and getting bounced straight back.
  // Role-specific surfaces (buy flow, listing edit) gate themselves
  // downstream; the landing itself is public read-only. NOTE: no auth call
  // here — a previous getOptionalPortalUser() invocation parsed Clerk
  // cookies + hit Supabase on EVERY anonymous landing render for no used
  // return value, pure Worker CPU burn (CF error 1102 contributor).
  const landing = <PublicMarketplaceLanding country="all" page={1} />

  return (
    <Suspense fallback={landing}>
      <GigsDiscoveryQueryGate>{landing}</GigsDiscoveryQueryGate>
    </Suspense>
  )
}
