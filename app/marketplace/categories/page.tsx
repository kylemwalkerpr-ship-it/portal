import type { Metadata } from 'next'
import { MarketplaceCategoriesIndex } from '@/components/marketplace/MarketplaceCategoriesIndex'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

// ISR: revalidate at most once per hour
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = getMarketplaceCanonicalUrl('/marketplace/categories/')
  const title = 'All categories | YouSafe Marketplace'
  const description =
    'Browse every category of immigration and tenancy help on YouSafe — study permits, work visas, family sponsorship, citizenship and more.'
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website' },
    robots: { index: true, follow: true },
  }
}

export default async function MarketplaceCategoriesIndexPage() {
  // MarketplaceCategoriesIndex is pre-rendered by Next even though it hydrates
  // client-side for search/filter interactions. Rendering a second SEO-only
  // <main> here duplicated the entire directory for real users and produced
  // two primary landmarks. Keep one authoritative, indexable experience.
  return <MarketplaceCategoriesIndex />
}
