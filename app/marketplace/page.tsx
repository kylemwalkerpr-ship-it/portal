import type { Metadata } from 'next'
import { MarketplacePage } from '@/components/marketplace/MarketplacePage'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { PublicMarketplaceLanding } from './PublicMarketplaceLanding'
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
  searchParams?: Promise<{ country?: string | string[] }>
}) {
  const sp = (await searchParams) ?? {}
  const country = parseCountry(sp.country)
  const auth = await getOptionalPortalUser()
  // PublicMarketplaceLanding renders EstateFooter itself — no second footer here.
  if (!auth) return <PublicMarketplaceLanding country={country} />
  if (auth.role !== 'client') redirect('/dashboard')
  return <MarketplacePage />
}
