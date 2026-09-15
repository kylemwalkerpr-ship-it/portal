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

/**
 * Canonical public URL for a Marketplace category. Single source of truth for
 * SEO engines (interlink planner, sitemaps, metadata): category pages always
 * live at `/categories/<id>` on the market host — never under the retired
 * `/marketplace` prefix and never on the Portal/auth host.
 */
export function marketplaceCategoryHref(categoryId: string): string {
  // Blank input must never emit a bare /categories/ URL — fall back to the
  // default immigration category, matching the engine helper's fallback.
  const id = String(categoryId || '').trim() || 'immigration'
  return getMarketplaceCanonicalUrl(`/categories/${id}`)
}
