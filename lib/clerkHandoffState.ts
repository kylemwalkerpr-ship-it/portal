/**
 * Clerk's cross-host handoff state, shared by the market and portal middleware
 * fast paths (MARKET-PORTAL-AUTH-HANDOFF-1102).
 *
 * Clerk does not carry a cross-domain handoff in the query string. The FAPI
 * (`clerk.portal.yousafeconsultancy.com`) answers
 * `/v1/client/handshake?redirect_url=<host>/` with a 307 back to the app host
 * plus a *cookie* minted on the registrable domain shared by market and portal:
 *
 *   set-cookie: __clerk_handshake=<RS256 JWT>; Path=/; Domain=yousafeconsultancy.com; Max-Age=70
 *
 * That JWT's `handshake` claim is the list of cookies the *destination host's*
 * middleware must apply (`__client_uat`, `__session`, expired deletes, ...).
 * Only a request that reaches clerkMiddleware can consume it.
 *
 * Both host fast paths used to decide "anonymous" from path + query only, so a
 * request arriving with `__clerk_handshake` — and no `__clerk*` *parameter*,
 * which the FAPI 307 strips — was answered with the cached anonymous document
 * on market and on portal alike. The JWT was never consumed, the destination
 * host never finished the handoff, and the Clerk SDK re-drove the handshake on
 * every page load of the sign-in / sign-out switch. Each re-drive spends Clerk
 * CPU on the shared Worker (cookie parse + JWT/crypto verification + handshake
 * minting) inside the Free-plan 10ms budget: that amplification is the 1102
 * class this module closes. Failing closed on handoff state makes a cross-host
 * switch cost exactly one Clerk pass, after which the state is settled and the
 * cheap anonymous path is eligible again.
 *
 * This module decides *nothing* about auth. It only answers "is Clerk state in
 * flight on this request?", so the host bypasses can refuse to answer such a
 * request with an anonymous document.
 */

/** Minimal cookie shape shared by `NextRequest['cookies']['getAll']()`. */
export type ClerkRequestCookie = { name: string; value?: string | null }

/** Every Clerk cookie (handshake jar, dev-browser JWT, session, hints...). */
const CLERK_COOKIE_PREFIX = '__clerk'

/** Clerk's session token cookie. */
const CLERK_SESSION_COOKIE = '__session'

/**
 * Clerk's client-readable "is there an active session?" hint. Unlike the
 * handshake jar it is also written as `0` when there is no session.
 */
const CLERK_CLIENT_UAT_COOKIE = '__client_uat'

/**
 * Clerk Frontend API / internal auth paths. These are handshake, sync and
 * keyless-bootstrap endpoints, never app documents: they must always reach
 * Clerk. No app route owns these prefixes (verified against the `app/` tree),
 * so listing them costs no public surface.
 */
export const CLERK_INTERNAL_AUTH_PATH_PREFIXES: readonly string[] = [
  '/__clerk',
  '/v1/',
  '/clerk-sync-keyless',
]

/** `__client_uat` semantics: absent or `0` means "no active session". */
export function clientUatMeansSignedIn(value?: string | null): boolean {
  return typeof value === 'string' && value !== '' && value !== '0'
}

/**
 * True when the request carries Clerk's handoff / internal cookie jar
 * (`__clerk_handshake`, `__clerk_db_jwt`, `__clerk_ticket`, `__clerk_synced`,
 * `__clerk_redirect_count`, ...). A non-empty value means Clerk state is in
 * flight for this request.
 */
export function requestHasClerkHandoffCookie(
  cookies: readonly ClerkRequestCookie[],
): boolean {
  return cookies.some(
    (cookie) =>
      cookie.name.toLowerCase().startsWith(CLERK_COOKIE_PREFIX) &&
      typeof cookie.value === 'string' &&
      cookie.value !== '',
  )
}

/**
 * True when the request carries Clerk's session token. A request with a real
 * session is authenticated and must never be answered with an anonymous
 * document, whatever the path.
 */
export function requestHasClerkSessionCookie(
  cookies: readonly ClerkRequestCookie[],
): boolean {
  return cookies.some(
    (cookie) =>
      cookie.name.toLowerCase() === CLERK_SESSION_COOKIE &&
      typeof cookie.value === 'string' &&
      cookie.value !== '',
  )
}

/** The `__client_uat` cookie value on this request, if any. */
export function requestClientUat(cookies: readonly ClerkRequestCookie[]): string | null {
  const cookie = cookies.find(
    (candidate) => candidate.name.toLowerCase() === CLERK_CLIENT_UAT_COOKIE,
  )
  return typeof cookie?.value === 'string' ? cookie.value : null
}

/**
 * True for Clerk's handshake / callback / internal auth paths. `searchParams` is
 * optional so the predicate can be reused on a pathname-only decision, but when
 * supplied it also covers Clerk's `__clerk*` protocol parameters (case
 * insensitive, as Clerk writes both cases).
 */
export function isClerkInternalAuthRequest(
  pathname: string,
  searchParams?: URLSearchParams | null,
): boolean {
  if (
    CLERK_INTERNAL_AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return true
  }
  if (!searchParams) return false
  for (const key of searchParams.keys()) {
    if (key.toLowerCase().startsWith(CLERK_COOKIE_PREFIX)) return true
  }
  return false
}

/**
 * The complete fail-closed contract for both host fast paths: true when the
 * request carries Clerk state that only clerkMiddleware may consume —
 * Clerk's internal auth paths, its `__clerk*` protocol parameters, its
 * handoff / dev-browser cookie jar, its session token, or an active
 * `__client_uat` session hint.
 *
 * Anything that answers true here must be handed to clerkMiddleware unchanged:
 * no anonymous document, no cache entry, no host rewrite.
 */
export function requestNeedsClerkHandoffState(
  pathname: string,
  searchParams: URLSearchParams | null | undefined,
  cookies: readonly ClerkRequestCookie[],
): boolean {
  if (isClerkInternalAuthRequest(pathname, searchParams)) return true
  if (requestHasClerkHandoffCookie(cookies)) return true
  if (requestHasClerkSessionCookie(cookies)) return true
  return clientUatMeansSignedIn(requestClientUat(cookies))
}
