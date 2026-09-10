const MARKET_HOST = 'market.yousafeconsultancy.com'

/**
 * Marketplace pages are publicly owned by market.yousafeconsultancy.com.
 * The Next.js route tree may remain under app/marketplace internally, but
 * public URLs always use clean root-level paths on the market host.
 */
export function getMarketplaceBaseUrl(): string {
  return `https://${MARKET_HOST}`
}

/**
 * Return the clean public Marketplace path. Internal callers may still refer
 * to the on-disk `/marketplace` route namespace while the route tree is being
 * maintained, but that namespace is never exposed by this public URL helper.
 */
export function getMarketplaceCanonicalPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const stripped = normalized.replace(/^\/marketplace(?=\/|$)/, '') || '/'
  return stripped === '/' ? '/' : stripped.replace(/\/$/, '')
}

/** Returns the full public URL for a Marketplace path. */
export function getMarketplaceCanonicalUrl(path: string): string {
  return `${getMarketplaceBaseUrl()}${getMarketplaceCanonicalPath(path)}`
}
