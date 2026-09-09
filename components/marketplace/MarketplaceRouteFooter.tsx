'use client'

import { usePathname } from 'next/navigation'
import { MarketplaceFooter } from './MarketplaceFooter'

/**
 * The marketplace landing and file shop already own their footer. Detail and
 * taxonomy routes did not, which left category, gig, and provider pages ending
 * abruptly on blank paper. Because the market subdomain rewrites public paths
 * (`/gigs/...`) to internal `/marketplace/gigs/...` routes, accept both path
 * shapes here.
 */
export function MarketplaceRouteFooter() {
  const pathname = usePathname() || ''
  const publicPath = pathname.replace(/^\/marketplace(?=\/|$)/, '') || '/'
  const needsSharedFooter = /^\/(?:categories|gigs|providers)(?:\/|$)/.test(publicPath)

  if (!needsSharedFooter) return null
  return <MarketplaceFooter />
}
