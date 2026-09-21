/**
 * Market-host HTML is public and must stay below Cloudflare Free's CPU limit.
 * Clerk still owns all APIs, the authenticated seller directory, and any
 * Clerk handshake request.
 *
 * "Any Clerk handshake request" is decided by lib/clerkHandoffState.ts, not by
 * the query string alone: Clerk's cross-domain handoff comes back from the FAPI
 * as a `__clerk_handshake` cookie minted on the shared registrable domain, with
 * no `__clerk*` parameter left to see. Answering that request from the
 * anonymous cache (the MARKET-PORTAL-AUTH-HANDOFF-1102 amplification) left the
 * handoff JWT unconsumed, so the SDK re-drove it on every navigation and the
 * shared Worker paid Clerk's crypto per re-drive until Cloudflare returned
 * 1102. Handoff state now fails closed: clerkMiddleware consumes the JWT once,
 * the market routing then re-joins through its normal branch, and anonymous
 * traffic (no Clerk cookie state) keeps the cache-hit fast path untouched.
 */
import {
  requestNeedsClerkHandoffState,
  type ClerkRequestCookie,
} from './clerkHandoffState'

export function shouldBypassClerkForMarketRequest(
  pathname: string,
  searchParams: URLSearchParams,
  isAllowedCorsPreflight: boolean,
  /**
   * Cookies on the request. Omitted/empty means "no Clerk state seen", which
   * keeps the helper's historical three-argument contract for anonymous
   * callers; the middleware always passes the real jar.
   */
  cookies: readonly ClerkRequestCookie[] = [],
): boolean {
  if (isAllowedCorsPreflight) return true

  // Clerk handshake / callback / internal auth paths, the `__clerk*` protocol
  // parameters, the handoff cookie jar, a session token or an active session
  // hint: all of it stays with clerkMiddleware.
  if (requestNeedsClerkHandoffState(pathname, searchParams, cookies)) return false

  if (pathname === '/api' || pathname.startsWith('/api/')) return false

  if (pathname === '/sellers' || pathname === '/sellers/') return false

  return true
}
