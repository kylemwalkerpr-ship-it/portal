const MARKET_HOST = 'market.yousafeconsultancy.com'

/**
 * Marketplace pages are publicly owned by market.yousafeconsultancy.com.
 * The Next.js route tree may remain under app/marketplace internally, but
 * public URLs must use clean root-level paths on the market host.
 */
export function getMarketplaceBaseUrl(): string {
  return `https://${MARKET_HOST}`
}

/**
 * Normalize an already-clean public Marketplace path.
 *
 * Deliberately reject the retired `/marketplace` namespace instead of
 * silently stripping it. That makes stale public URL emissions fail loudly
 * in development/tests rather than leaking back into links or metadata.
 */
export function getMarketplaceCanonicalPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === '/marketplace' || normalized.startsWith('/marketplace/')) {
    throw new Error('Marketplace public paths must not include the retired /marketplace prefix')
  }
  return normalized === '/' ? '/' : normalized.replace(/\/$/, '')
}

/** Returns the full public URL for a clean Marketplace path. */
export function getMarketplaceCanonicalUrl(path: string): string {
  return `${getMarketplaceBaseUrl()}${getMarketplaceCanonicalPath(path)}`
}
