/**
 * Market-host HTML is public and must stay below Cloudflare Free's CPU limit.
 * Clerk still owns all APIs, the authenticated seller directory, and any
 * Clerk handshake request.
 */
export function shouldBypassClerkForMarketRequest(
  pathname: string,
  searchParams: URLSearchParams,
  isAllowedCorsPreflight: boolean,
): boolean {
  if (isAllowedCorsPreflight) return true

  if (pathname === '/api' || pathname.startsWith('/api/')) return false

  if (pathname === '/sellers' || pathname === '/sellers/') return false

  for (const key of searchParams.keys()) {
    if (key.toLowerCase().startsWith('__clerk')) return false
  }

  return true
}
