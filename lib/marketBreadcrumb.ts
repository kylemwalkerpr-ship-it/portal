import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export type MarketCrumb = { name: string; path: string }

// BreadcrumbList JSON-LD for market-host pages. "Marketplace" (the home page)
// is always position 1; pass the remaining trail, ending with the current page.
export function buildMarketBreadcrumb(items: MarketCrumb[]) {
  const trail: MarketCrumb[] = [{ name: 'Marketplace', path: '/' }, ...items]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: getMarketplaceCanonicalUrl(crumb.path),
    })),
  }
}
