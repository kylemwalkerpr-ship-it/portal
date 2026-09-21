'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { isLandingPageOnlyQuery } from '@/lib/marketplaceLandingUrl'

/**
 * Discovery query keys understood by GigDiscoveryPage. Keep this list in sync
 * with the URL ↔ state hydration effect inside that component.
 */
export const GIG_DISCOVERY_QUERY_KEYS = [
  'q',
  'category',
  'country',
  'jurisdiction',
  'provider_type',
  'sort',
  'min_price',
  'max_price',
  'min_rating',
  'delivery_days',
  'page',
] as const

/**
 * Client-side query gate for the build-static /gigs hub.
 *
 * The hub is generated once at build time and never reads the URL on the
 * server, so filtered deep links (/gigs?q=visa&country=us) are resolved here:
 * after hydration the gate checks the real query string and renders the same
 * GigDiscoveryPage island the marketing landing and the category shelves use.
 * Without a discovery query the server-rendered directory is kept untouched —
 * that directory is also the markup crawlers receive from the static build.
 *
 * EXCEPTION — numbered pagination of the clean browsing surfaces: `/?page=N`
 * (a bare page pointer with no other key) is browsing state owned by the
 * surface's own pager, so the landing must keep rendering and open its page-N
 * window client-side instead of swapping in the discovery island. Every other
 * recognized key — `country` included — still opens discovery, so
 * `/?country=uk` and `/?country=uk&page=2` keep their existing behaviour.
 */
export function GigsDiscoveryQueryGate({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const hasDiscoveryQuery = React.useMemo(() => {
    const hasKey = GIG_DISCOVERY_QUERY_KEYS.some((key) => Boolean(searchParams?.get(key)?.trim()))
    if (!hasKey) return false
    // A bare ?page=N is the landing's numbered pager, not a discovery deep link.
    return !isLandingPageOnlyQuery(searchParams)
  }, [searchParams])

  if (!hasDiscoveryQuery) return <>{children}</>
  return <GigDiscoveryPage />
}
