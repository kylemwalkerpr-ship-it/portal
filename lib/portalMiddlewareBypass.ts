/**
 * Portal-host anonymous documents are public and must stay below Cloudflare
 * Free's CPU limit (the Cloudflare 1102 "Worker exceeded CPU time limit"
 * incident class).
 *
 * The market host already keeps anonymous public HTML off the Clerk path
 * (lib/marketplaceMiddlewareBypass.ts). Portal has the mirror problem: every
 * anonymous visit to portal.yousafeconsultancy.com/ enters clerkMiddleware
 * before OpenNext cache interception can serve the prerendered root document,
 * so the shared Worker pays Clerk's cookie/session work on the hottest
 * document route of the portal app.
 *
 * This helper is deliberately narrower than the market one:
 *   - only the root document `/` is eligible (the route the 1102 report
 *     names). Adding more paths requires the same public-route proof that
 *     middleware.ts already encodes in `isPublicRoute`;
 *   - a `__client_uat` cookie carrying an active value keeps the request on
 *     the Clerk path, so a signed-in visitor still resolves a session and is
 *     bounced from `/` to /dashboard by the Clerk handler;
 *   - Clerk handshake query parameters always stay on the Clerk path;
 *   - APIs, webhooks, cron, `/sellers`, `/shop`, `/sign-in`, `/sign-up`,
 *     `/dashboard` and the retired `/marketplace` redirect are never eligible
 *     (the caller only consults this helper for anonymous portal documents).
 */

/**
 * Anonymous public portal documents allowed to skip Clerk.
 *
 * Intentionally minimal: the portal root document is the 1102 route, and it is
 * the only portal-host path whose public HTML is proven safe to serve without
 * a session resolution. Market-host public documents are a separate contract
 * (`shouldBypassClerkForMarketRequest`) and are never widened by this set.
 */
export const PORTAL_ANONYMOUS_DOCUMENT_PATHS: ReadonlySet<string> = new Set(['/'])

/**
 * Clerk writes `__client_uat` for every client; it is absent or '0' whenever
 * there is no active session (the same predicate the middleware's homepage
 * fast path already uses before skipping `auth()`).
 */
export function portalRequestHasSessionHint(clientUat?: string | null): boolean {
  return typeof clientUat === 'string' && clientUat !== '' && clientUat !== '0'
}

/**
 * True only for an anonymous portal root document. Everything else falls
 * through to the Clerk handler unchanged.
 */
export function shouldBypassClerkForPortalRequest(
  pathname: string,
  searchParams: URLSearchParams,
  clientUat?: string | null,
): boolean {
  if (portalRequestHasSessionHint(clientUat)) return false

  if (!PORTAL_ANONYMOUS_DOCUMENT_PATHS.has(pathname)) return false

  for (const key of searchParams.keys()) {
    if (key.toLowerCase().startsWith('__clerk')) return false
  }

  return true
}
