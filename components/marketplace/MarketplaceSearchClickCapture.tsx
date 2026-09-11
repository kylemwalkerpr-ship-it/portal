'use client'

import React from 'react'
import { queueMarketplaceSearchExecution } from '@/lib/marketplaceSearchIntelligence'

/**
 * Attribute canonical gig-tag links without adding tracking parameters to the
 * public URL. This capture boundary is intentionally narrow: it only runs on a
 * gig-detail route and only recognizes same-origin Marketplace/category links
 * that already contain a meaningful `q` parameter.
 */
export function MarketplaceSearchClickCapture() {
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const currentPath = window.location.pathname
      if (!currentPath.includes('/gigs/')) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      let destination: URL
      try {
        destination = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (destination.origin !== window.location.origin) return

      const isSearchSurface =
        destination.pathname === '/marketplace'
        || destination.pathname === '/marketplace/'
        || destination.pathname.startsWith('/categories/')
        || destination.pathname.startsWith('/marketplace/categories/')
      if (!isSearchSurface) return

      const query = destination.searchParams.get('q')?.trim()
      if (!query) return

      queueMarketplaceSearchExecution({
        query,
        source: 'tag_click',
      })
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
