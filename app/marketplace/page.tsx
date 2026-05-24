import type { Metadata } from 'next'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
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

  const auth = await getOptionalPortalUser()
  // Students may be stored as either 'client' or legacy 'student' in profiles.role
  // (see app/api/sellers/[id]/route.ts:140 + lib/roleLanes.ts). Accept both so a
  // student doesn't get bounced market → /dashboard → portal/dashboard.
  if (auth && auth.role !== 'client' && auth.role !== 'student') {
    redirect('/dashboard')
  }

  // Unified landing page for guests and clients alike.
  // PublicMarketplaceLanding renders EstateFooter itself — no second footer here.
  return <PublicMarketplaceLanding country={country} />
}
