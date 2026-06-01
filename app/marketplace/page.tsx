import type { Metadata } from 'next'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { PublicMarketplaceLanding } from './PublicMarketplaceLanding'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'YouSafe Marketplace — Verified Immigration & Tenancy Help'
  const description =
    'Browse vetted US, UK and Canada immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.'
  const canonicalUrl = getMarketplaceCanonicalUrl('/marketplace/')
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
    jurisdiction?: string | string[]
    provider_type?: string | string[]
    min_price?: string | string[]
    max_price?: string | string[]
    min_rating?: string | string[]
    delivery_days?: string | string[]
  }>
}) {
  const sp = (await searchParams) ?? {}
  const country = parseCountry(sp.country)

  // When ANY filter param is present, render the discovery results page.
  // GigDiscoveryPage reads useSearchParams() client-side and seeds all
  // filter state from the URL. Previously this gate only checked q/
  // category/sort, so jurisdiction or provider-type deep links from the
  // landing page fell through to the unfiltered hero — looked like the
  // filter wasn't being honoured.
  const hasFilters = Boolean(
    sp.q || sp.category || sp.sort ||
    sp.jurisdiction || sp.provider_type ||
    sp.min_price || sp.max_price || sp.min_rating || sp.delivery_days,
  )
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
