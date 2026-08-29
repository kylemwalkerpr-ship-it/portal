import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PublicMarketplaceLanding } from './PublicMarketplaceLanding'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

// ISR: revalidate at most once per hour
export const revalidate = 3600

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const sp = (await searchParams) ?? {}
  const filterParams = ['q', 'category', 'sort', 'jurisdiction', 'provider_type', 'min_price', 'max_price', 'min_rating', 'delivery_days']
  const hasFilters = filterParams.some((k) => sp[k] !== undefined)
  const hasUtm = Object.keys(sp).some((k) => k.startsWith('utm_'))

  const title = 'YouSafe Marketplace — Verified Immigration & Tenancy Help'
  const description =
    'Browse vetted US, UK, Canada, and Australia immigration consultants and attorneys, plus tenancy-law help. Compare pricing, languages and reviews. Free to browse.'
  const canonicalUrl = getMarketplaceCanonicalUrl('/marketplace/')
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: hasFilters || hasUtm ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      url: canonicalUrl,
      title,
      description,
      type: 'website',
    },
  }
}


type Country = 'all' | 'us' | 'uk' | 'ca' | 'au'

function parseCountry(raw: string | string[] | undefined): Country {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'us' || v === 'uk' || v === 'ca' || v === 'au') return v
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
    return (
      <Suspense fallback={<div style={{ minHeight: 240, background: 'var(--ys-paper, #4A2A1A)' }} />}>
        <GigDiscoveryPage />
      </Suspense>
    )
  }

  // No role-gating on the marketplace landing. Anyone — anon, client,
  // student, attorney, consultant, admin, support — can browse the public
  // marketplace. Earlier code redirected non-client/non-student roles to
  // /dashboard, which broke the common case of a signed-in provider
  // clicking "Marketplace" in their dashboard nav to see their own
  // listings or competing services and getting bounced straight back.
  // Role-specific surfaces (buy flow, listing edit) gate themselves
  // downstream; the landing itself is public read-only. NOTE: no auth call
  // here — the previous getOptionalPortalUser() invocation parsed Clerk
  // cookies + hit Supabase on EVERY anonymous landing render for no used
  // return value, pure Worker CPU burn (CF error 1102 contributor).

  return <PublicMarketplaceLanding country={country} />
}
