import { headers } from 'next/headers'

const MARKET_HOST = 'market.yousafeconsultancy.com'
const PORTAL_HOST = 'portal.yousafeconsultancy.com'

async function getHost(): Promise<string> {
  const h = await headers()
  return h.get('host')?.split(':')[0] || PORTAL_HOST
}

/**
 * Returns the correct base URL for marketplace pages.
 * On the market domain: https://market.yousafeconsultancy.com
 * On the portal domain: https://portal.yousafeconsultancy.com
 */
export async function getMarketplaceBaseUrl(): Promise<string> {
  const host = await getHost()
  if (host === MARKET_HOST) return `https://${MARKET_HOST}`
  return `https://${PORTAL_HOST}`
}

/**
 * Returns the canonical PATH (without domain) for marketplace pages.
 * On the market domain, strips the /marketplace prefix.
 * On the portal domain, keeps the /marketplace prefix.
 */
export async function getMarketplaceCanonicalPath(path: string): Promise<string> {
  const host = await getHost()
  if (host === MARKET_HOST) {
    return path.replace(/^\/marketplace/, '') || '/'
  }
  return path
}

/**
 * Returns the full canonical URL for marketplace pages.
 * Use this for `alternates.canonical` to override metadataBase.
 */
export async function getMarketplaceCanonicalUrl(path: string): Promise<string> {
  const base = await getMarketplaceBaseUrl()
  const canonicalPath = await getMarketplaceCanonicalPath(path)
  return `${base}${canonicalPath}`
}
