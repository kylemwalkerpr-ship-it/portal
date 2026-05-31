import type { Metadata } from 'next'
import { MarketplaceProvidersIndex } from '@/components/marketplace/MarketplaceProvidersIndex'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = getMarketplaceCanonicalUrl('/marketplace/providers/')
  const title = 'All providers | YouSafe Marketplace'
  const description =
    'Browse every verified immigration attorney and consultant on YouSafe. Compare credentials, jurisdictions, and pricing before booking.'
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website' },
    robots: { index: true, follow: true },
  }
}

export default async function MarketplaceProvidersIndexPage() {
  return <MarketplaceProvidersIndex />
}
