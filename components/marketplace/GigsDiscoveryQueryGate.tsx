'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'

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
 */
export function GigsDiscoveryQueryGate({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const hasDiscoveryQuery = React.useMemo(
    () => GIG_DISCOVERY_QUERY_KEYS.some((key) => Boolean(searchParams?.get(key)?.trim())),
    [searchParams],
  )

  if (!hasDiscoveryQuery) return <>{children}</>
  return <GigDiscoveryPage />
}
