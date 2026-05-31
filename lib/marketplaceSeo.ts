const MARKET_HOST = 'market.yousafeconsultancy.com'

/**
 * Marketplace pages are public on market.yousafeconsultancy.com. Portal
 * /marketplace URLs redirect there, so SEO metadata must always use the final
 * market URL instead of emitting canonicals that point at a 301.
 */
export function getMarketplaceBaseUrl(): string {
  return `https://${MARKET_HOST}`
}

/**
 * Returns the canonical path on the market domain. The app keeps route files
 * under /marketplace, while middleware rewrites market-domain clean paths to
 * those routes and 301s /marketplace-prefixed requests.
 */
export function getMarketplaceCanonicalPath(path: string): string {
  const stripped = path.replace(/^\/marketplace/, '') || '/'
  // Drop trailing slash — the host 308s `/foo/` → `/foo`, so canonicals must
  // be the final form. Root `/` stays as `/`.
  return stripped === '/' ? '/' : stripped.replace(/\/$/, '')
}

/**
 * Returns the full canonical URL for marketplace pages.
 * Use this for `alternates.canonical` to override metadataBase.
 */
export function getMarketplaceCanonicalUrl(path: string): string {
  return `${getMarketplaceBaseUrl()}${getMarketplaceCanonicalPath(path)}`
}
