import { deleteTrackingQueryParams } from './trackingParams'

const MARKET_SHOP_URL = 'https://market.yousafeconsultancy.com/shop'

/** Build the canonical destination for the retired public templates alias. */
export function getMarketplaceTemplatesRedirectUrl(requestUrl: URL): URL | null {
  if (requestUrl.pathname !== '/templates' && requestUrl.pathname !== '/templates/') return null

  const destination = new URL(MARKET_SHOP_URL)
  const query = new URLSearchParams(requestUrl.searchParams)
  deleteTrackingQueryParams(query)
  destination.search = query.toString()
  return destination
}
