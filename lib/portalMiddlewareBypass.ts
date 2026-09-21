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
 * The 1102 report names two document families: the prerendered root document
 * (PR 259 + the deploy's `verify-portal-root-static-cache.mjs` gate) and the
 * anonymous auth lanes, which stay Clerk-dynamic only because clerkMiddleware
 * resolves a session nobody has. This helper is still deliberately narrower
 * than the market one:
 *   - the only non-auth document is the root `/` (the route the 1102 report
 *     names). Adding more requires the same public-route proof that
 *     middleware.ts already encodes in `isPublicRoute`;
 *   - the anonymous auth lanes are exactly `/sign-in(.*)` and `/sign-up(.*)`,
 *     plus their retired aliases `/login` and `/register` (which have no portal
 *     route; middleware.ts answers them with the same anonymous lane redirect
 *     the Clerk handler used to emit);
 *   - a `__client_uat` cookie carrying an active value keeps the request on
 *     the Clerk path, so a signed-in visitor still resolves a session and is
 *     bounced from `/` to /dashboard by the Clerk handler;
 *   - every query parameter starting with `__clerk` (`__clerk_handshake`,
 *     `__clerk_synced`, `__clerk_db_jwt`, `__clerk_ticket`, ...) always stays
 *     on the Clerk path: that is Clerk's handshake / internal callback
 *     protocol, never a document we may answer ourselves;
 *   - the same is true of Clerk's handoff *cookies* and its internal auth
 *     paths (lib/clerkHandoffState.ts). The cross-host handoff returns from
 *     the FAPI as `__clerk_handshake` on `Domain=yousafeconsultancy.com` with
 *     no `__clerk*` parameter left to match, so a cookie-blind fast path
 *     answered the handoff with the anonymous root document, the JWT was never
 *     consumed, and the SDK re-drove the handshake on every page load of the
 *     switch (the MARKET-PORTAL-AUTH-HANDOFF-1102 CPU amplification);
 *   - APIs, webhooks, cron, `/sellers`, `/shop`, `/dashboard` and the retired
 *     `/marketplace` redirect are never eligible (the caller only consults
 *     this helper for anonymous portal documents).
 */
import {
  clientUatMeansSignedIn,
  requestNeedsClerkHandoffState,
  type ClerkRequestCookie,
} from './clerkHandoffState'

/**
 * Anonymous public portal documents allowed to skip Clerk, by exact path.
 *
 * Intentionally minimal: the portal root document is the only non-auth path
 * whose public HTML is proven safe to serve without a session resolution.
 * Market-host public documents are a separate contract
 * (`shouldBypassClerkForMarketRequest`) and are never widened by this set.
 */
export const PORTAL_ANONYMOUS_DOCUMENT_PATHS: ReadonlySet<string> = new Set(['/'])

/**
 * Anonymous auth documents, by exact path. `/sign-in` and `/sign-up` are the
 * lane roots; `/login` and `/register` are the retired aliases whose only
 * portal-host answer is the anonymous sign-in redirect (see
 * PORTAL_ANONYMOUS_SIGN_IN_ALIAS_PATHS).
 */
export const PORTAL_ANONYMOUS_AUTH_EXACT_PATHS: ReadonlySet<string> = new Set([
  '/sign-in',
  '/sign-up',
  '/login',
  '/register',
])

/**
 * Anonymous auth documents served by the `/sign-in/[[...rest]]` and
 * `/sign-up/[[...rest]]` catch-all route — every lane and Clerk screen that
 * renders underneath them. Trailing slash is required so `/sign-inx` can never
 * be mistaken for a lane.
 */
export const PORTAL_ANONYMOUS_AUTH_PATH_PREFIXES: readonly string[] = ['/sign-in/', '/sign-up/']

/**
 * Retired auth aliases with no portal route. An anonymous request for these
 * paths is answered with the student sign-in lane plus `return_to`; the
 * middleware reproduces the Clerk handler's `!userId` answer instead of paying
 * Clerk's session work for a path Clerk never renders.
 */
export const PORTAL_ANONYMOUS_SIGN_IN_ALIAS_PATHS: ReadonlySet<string> = new Set([
  '/login',
  '/register',
])

/**
 * Clerk writes `__client_uat` for every client; it is absent or '0' whenever
 * there is no active session (the same predicate the middleware's homepage
 * fast path already uses before skipping `auth()`). One definition lives in
 * lib/clerkHandoffState.ts so the market and portal fast paths can never drift.
 */
export function portalRequestHasSessionHint(clientUat?: string | null): boolean {
  return clientUatMeansSignedIn(clientUat)
}

/**
 * True only for an anonymous portal document: the root document or an
 * anonymous auth lane. Session hints and Clerk protocol parameters are handled
 * by the caller.
 */
export function isPortalAnonymousDocumentPath(pathname: string): boolean {
  if (PORTAL_ANONYMOUS_DOCUMENT_PATHS.has(pathname)) return true
  if (PORTAL_ANONYMOUS_AUTH_EXACT_PATHS.has(pathname)) return true
  return PORTAL_ANONYMOUS_AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * True only for an anonymous portal document. Everything else — signed-in
 * visitors, Clerk handshake/callback requests and every protected surface —
 * falls through to the Clerk handler unchanged.
 */
export function shouldBypassClerkForPortalRequest(
  pathname: string,
  searchParams: URLSearchParams,
  clientUat?: string | null,
  /**
   * Cookies on the request. Omitted/empty keeps the historical three-argument
   * contract for callers that only model the session hint; the middleware
   * always passes the real jar so Clerk's handoff cookies fail closed.
   */
  cookies: readonly ClerkRequestCookie[] = [],
): boolean {
  if (portalRequestHasSessionHint(clientUat)) return false

  // Clerk's handoff jar (`__clerk_handshake`), session token, `__clerk*`
  // protocol parameters and internal auth paths all stay with clerkMiddleware:
  // the anonymous document must never be substituted for a request that is
  // mid-handoff, or the handoff never terminates.
  if (requestNeedsClerkHandoffState(pathname, searchParams, cookies)) return false

  if (!isPortalAnonymousDocumentPath(pathname)) return false

  return true
}
