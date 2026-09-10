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
 * Normalize an already-clean public Marketplace path. The retired
 * `/marketplace` namespace is deliberately rejected instead of silently
 * stripped, so a future public URL regression fails loudly in tests/dev.
 */
export function getMarketplaceCanonicalPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === '/marketplace' || normalized.startsWith('/marketplace/')) {
    throw new Error('Marketplace public paths must not include the retired /marketplace prefix')
  }
  return normalized === '/' ? '/' : normalized.replace(/\/$/, '')
}

/** Returns the full public URL for an already-clean Marketplace path. */
export function getMarketplaceCanonicalUrl(path: string): string {
  return `${getMarketplaceBaseUrl()}${getMarketplaceCanonicalPath(path)}`
}
