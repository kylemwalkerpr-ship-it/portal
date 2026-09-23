import type { Metadata } from 'next'
import { MarketplaceProvidersIndex } from '@/components/marketplace/MarketplaceProvidersIndex'
import { ProvidersIndexSeo } from '@/components/marketplace/MarketIndexSeo'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { MARKETPLACE_OG_IMAGE } from '@/lib/publicOgImages'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = getMarketplaceCanonicalUrl('/providers')
  const title = 'All providers | YouSafe Marketplace'
  const description =
    'Browse every verified immigration attorney and consultant on YouSafe. Compare credentials, jurisdictions, and pricing before booking.'
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website', images: [MARKETPLACE_OG_IMAGE] },
    robots: { index: true, follow: true },
  }
}

export default async function MarketplaceProvidersIndexPage() {
  return (
    <>
      <ProvidersIndexSeo />
      <MarketplaceProvidersIndex />
    </>
  )
}
