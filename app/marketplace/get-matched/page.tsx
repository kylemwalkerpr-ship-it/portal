import type { Metadata } from 'next'
import GetMatchedClient from '@/components/marketplace/GetMatchedClient'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { MARKETPLACE_OG_IMAGE } from '@/lib/publicOgImages'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = getMarketplaceCanonicalUrl('/get-matched')
  const title = 'Describe your case free, get a fixed-fee offer | YouSafe Marketplace'
  const description =
    'Not sure which service you need? Tell us about your US, UK, Canada or Australia immigration or tenancy matter and get a fixed-fee offer from a bar-verified attorney or reviewed consultant. Free, no account needed.'
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website', images: [MARKETPLACE_OG_IMAGE] },
    robots: { index: true, follow: true },
  }
}

export default function GetMatchedPage() {
  return <GetMatchedClient />
}
