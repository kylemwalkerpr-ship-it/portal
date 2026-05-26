import type { Metadata } from 'next'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { PublicMarketplaceLanding } from './PublicMarketplaceLanding'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { getMarketplaceBaseUrl, getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'YouSafe Marketplace — Verified Immigration & Tenancy Help'
  const description =
    'Browse vetted US, UK and Canada immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.'
  const baseUrl = await getMarketplaceBaseUrl()
  const canonicalUrl = await getMarketplaceCanonicalUrl('/marketplace/')
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      url: canonicalUrl,
      title,
      description,
      type: 'website',
    },
  }
}

type Country = 'all' | 'us' | 'uk' | 'ca'

function parseCountry(raw: string | string[] | undefined): Country {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'us' || v === 'uk' || v === 'ca') return v
  return 'all'
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    country?: string | string[]
    q?: string | string[]
    category?: string | string[]
    sort?: string | string[]
  }>
}) {
  const sp = (await searchParams) ?? {}
  const country = parseCountry(sp.country)

  // When search filters are present, render the discovery results page.
  // GigDiscoveryPage reads useSearchParams() client-side.
  const hasFilters = Boolean(sp.q || sp.category || sp.sort)
  if (hasFilters) {
    return <GigDiscoveryPage />
  }

  // No role-gating on the marketplace landing. Anyone — anon, client,
  // student, attorney, consultant, admin, support — can browse the public
  // marketplace. Earlier code redirected non-client/non-student roles to
  // /dashboard, which broke the common case of a signed-in provider
  // clicking "Marketplace" in their dashboard nav to see their own
  // listings or competing services and getting bounced straight back.
  // Role-specific surfaces (buy flow, listing edit) gate themselves
  // downstream; the landing itself is public read-only.
  await getOptionalPortalUser() // touch session for any side effects (no return value used)

  return <PublicMarketplaceLanding country={country} />
}
