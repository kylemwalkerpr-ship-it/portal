/**
 * Canonical portal auth URLs: portal keeps ONLY `/sign-in` and `/sign-up`.
 *
 * Every retired lane URL is answered with one 301 to the canonical document,
 * carrying a single normalized `return_to` (absolute, allow-listed) and, for
 * sign-up lanes, the lane as an `intent` hint for /onboarding:
 *
 *   /sign-in/student|client|consultant|attorney|admin   -> /sign-in
 *   /sign-in/<lane>/<clerk-screen>                       -> /sign-in/<clerk-screen>
 *   /sign-up/student|client                              -> /sign-up?intent=client
 *   /sign-up/consultant|attorney                         -> /sign-up?intent=<lane>
 *   /sign-up/admin                                       -> /sign-in
 *   /login                                               -> /sign-in
 *   /register                                            -> /sign-up
 *
 * Clerk's own screens under the canonical roots (`/sign-in/factor-one`,
 * `/sign-in/sso-callback`, `/sign-up/verify-email-address`, ...) are never
 * redirected. Requests carrying Clerk protocol parameters (`__clerk*`) are left
 * alone so a handshake is never interrupted; the client component normalizes
 * those after Clerk has consumed its parameters.
 *
 * Pure function of the URL: no cookies, no crypto (1102 budget).
 */
import { normalizeReturnToParams, pickReturnTo, PORTAL_ORIGIN } from './returnTo'

export const LEGACY_SIGN_IN_LANES: ReadonlySet<string> = new Set([
  'student',
  'client',
  'consultant',
  'attorney',
  'admin',
  'provider',
  'seller',
])

export const LEGACY_SIGN_UP_LANES: ReadonlySet<string> = new Set([
  'student',
  'client',
  'consultant',
  'attorney',
  'admin',
  'provider',
  'seller',
])

const SIGN_UP_LANE_INTENT: Record<string, string> = {
  student: 'client',
  client: 'client',
  consultant: 'consultant',
  attorney: 'attorney',
  provider: 'provider',
  seller: 'provider',
}

function hasClerkProtocolParam(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (key.toLowerCase().startsWith('__clerk')) return true
  }
  return false
}

/**
 * The canonical URL a portal auth request should be permanently redirected to,
 * or null when the request is already canonical (or must not be touched).
 */
export function getCanonicalPortalAuthRedirect(requestUrl: string | URL): URL | null {
  const url = new URL(requestUrl.toString())
  const pathname = url.pathname.length > 1 && url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname

  if (hasClerkProtocolParam(url.searchParams)) return null

  let target: string | null = null
  let intent: string | null = null

  if (pathname === '/login') {
    target = '/sign-in'
  } else if (pathname === '/register') {
    target = '/sign-up'
  } else if (pathname.startsWith('/sign-in/') || pathname.startsWith('/sign-up/')) {
    const segments = pathname.split('/').filter(Boolean)
    const family = segments[0] as 'sign-in' | 'sign-up'
    const lane = (segments[1] || '').toLowerCase()
    const lanes = family === 'sign-in' ? LEGACY_SIGN_IN_LANES : LEGACY_SIGN_UP_LANES
    if (lanes.has(lane)) {
      const rest = segments.slice(2).join('/')
      if (family === 'sign-up' && lane === 'admin') {
        target = '/sign-in'
      } else {
        target = `/${family}${rest ? `/${rest}` : ''}`
        if (family === 'sign-up' && !rest) intent = SIGN_UP_LANE_INTENT[lane] ?? null
      }
    }
  }

  // Already-canonical documents still get a 301 when they carry legacy
  // return parameters, so every downstream reader sees one contract.
  const isCanonicalRoot = pathname === '/sign-in' || pathname === '/sign-up'

  if (!target && !isCanonicalRoot) return null

  const destination = new URL(target ?? pathname, PORTAL_ORIGIN)
  url.searchParams.forEach((value, key) => destination.searchParams.append(key, value))
  const paramsChanged = normalizeReturnToParams(destination.searchParams, PORTAL_ORIGIN)
  if (intent && !destination.searchParams.has('intent')) destination.searchParams.set('intent', intent)
  // `source=marketing` used to force the client lane; intent replaces it.
  if (destination.searchParams.get('source') === 'marketing' && !destination.searchParams.has('intent')) {
    destination.searchParams.set('intent', 'client')
  }

  if (!target && !paramsChanged) return null
  return destination
}

/** Anonymous redirect target for a protected portal document. */
export function signInUrlForProtectedPath(requestUrl: string | URL): URL {
  const url = new URL(requestUrl.toString())
  const signIn = new URL('/sign-in', PORTAL_ORIGIN)
  const returnTo = new URL(`${url.pathname}${url.search}`, PORTAL_ORIGIN)
  signIn.searchParams.set('return_to', returnTo.toString())
  return signIn
}

// ── Portal auth documents -> branded Market modal ─────────────────────────
//
// portal.yousafeconsultancy.com no longer shows a standalone sign-in page. An
// anonymous `/sign-in` / `/sign-up` (and every retired lane/alias above) is
// answered with ONE 302 to the Market home, which auto-opens the branded,
// lane-aware Clerk modal:
//
//   https://market.yousafeconsultancy.com/?ys_sign_in=1&intent=attorney&return_to=<abs>
//
// Clerk's dashboard paths still point at portal /sign-in and /sign-up, so the
// portal routes stay valid entry points. Requests carrying Clerk protocol
// parameters (`__clerk_ticket`, `__clerk_status`, `__clerk_handshake`, ...)
// and Clerk's own sub-screens (`/sign-in/factor-one`, `/sign-up/continue`,
// `/sign-in/sso-callback`, ...) are NEVER redirected: those keep rendering the
// embedded component so tickets, email links and handshakes complete. A URL
// fragment such as `#/sso-callback?...` is inherited by the browser across the
// 302 and is completed by the Market page (MarketplaceAuthNav).
//
// Pure URL work (no cookies, crypto or I/O) — safe for the 1102 budget.

export const MARKET_AUTH_ORIGIN = 'https://market.yousafeconsultancy.com'
export const MARKET_SIGN_IN_FLAG = 'ys_sign_in'
export const MARKET_SIGN_UP_FLAG = 'ys_sign_up'

/** Forwarded besides intent/return_to (attribution; the market consolidates tracking keys). */
const FORWARDED_PARAM_PREFIXES = ['utm_']
const FORWARDED_PARAMS: ReadonlySet<string> = new Set(['source', 'gclid', 'fbclid', 'msclkid', '_gl'])

/**
 * Best-effort role intent from where the user was going. Only self-service
 * intents exist (client / provider lanes); admin and support are never
 * inferred and never self-assignable — /onboarding + the DB decide the role.
 */
export function inferAuthIntentFromReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null
  let url: URL
  try {
    url = new URL(returnTo)
  } catch {
    return null
  }
  const path = url.pathname.toLowerCase()
  if (path.startsWith('/dashboard/attorney') || path.startsWith('/attorneys/apply')) return 'attorney'
  if (path.startsWith('/dashboard/consultant')) return 'consultant'
  if (path.startsWith('/onboarding/provider') || path === '/apply' || path.startsWith('/apply/')) {
    const type = normalizeAuthIntentValue(url.searchParams.get('type'))
    return type ?? 'provider'
  }
  return null
}

function normalizeAuthIntentValue(value: string | null): string | null {
  if (!value) return null
  const lower = value.trim().toLowerCase()
  if (lower === 'student' || lower === 'client') return 'client'
  if (lower === 'seller' || lower === 'provider') return 'provider'
  if (lower === 'attorney' || lower === 'consultant' || lower === 'regulated_adviser') return lower
  return null
}

/**
 * The Market modal URL for an anonymous portal auth request, or null when the
 * request must stay on the portal (Clerk protocol parameters or a Clerk
 * sub-screen) or is not an auth document at all.
 */
export function marketAuthModalUrl(requestUrl: string | URL): URL | null {
  const url = new URL(requestUrl.toString())
  if (hasClerkProtocolParam(url.searchParams)) return null

  // Fold retired lanes/aliases/legacy params into the canonical document first.
  const canonical = getCanonicalPortalAuthRedirect(url) ?? url
  const pathname = canonical.pathname.length > 1 && canonical.pathname.endsWith('/')
    ? canonical.pathname.slice(0, -1)
    : canonical.pathname
  if (pathname !== '/sign-in' && pathname !== '/sign-up') return null

  const params = new URLSearchParams(canonical.searchParams)
  normalizeReturnToParams(params, PORTAL_ORIGIN)
  const returnTo = params.get('return_to')
  const intent =
    normalizeAuthIntentValue(params.get('intent')) ??
    normalizeAuthIntentValue(params.get('lane')) ??
    inferAuthIntentFromReturnTo(returnTo)

  const destination = new URL('/', MARKET_AUTH_ORIGIN)
  destination.searchParams.set(pathname === '/sign-up' ? MARKET_SIGN_UP_FLAG : MARKET_SIGN_IN_FLAG, '1')
  if (intent) destination.searchParams.set('intent', intent)
  if (returnTo) destination.searchParams.set('return_to', returnTo)
  params.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (FORWARDED_PARAMS.has(lower) || FORWARDED_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      destination.searchParams.append(key, value)
    }
  })
  return destination
}

/** True for the two canonical auth roots (`/sign-in`, `/sign-up`, trailing slash tolerated). */
export function isPortalAuthRootPath(pathname: string): boolean {
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return p === '/sign-in' || p === '/sign-up'
}

/** Signed-in visitor on an auth root: where to send them (allow-listed return_to or dashboard). */
export function signedInAuthRootDestination(requestUrl: string | URL): URL {
  const url = new URL(requestUrl.toString())
  const returnTo = pickReturnTo(url.searchParams, PORTAL_ORIGIN)
  return new URL(returnTo ?? `${PORTAL_ORIGIN}/dashboard`)
}

/**
 * Where an anonymous visitor on the portal root `/` goes. The portal has no
 * landing page of its own:
 *
 * - No `__client_uat` cookie at all (a fresh visitor typing the portal URL):
 *   the Market home with the branded sign-in modal open.
 * - `__client_uat=0` (this browser had a session and signed out — including
 *   Clerk's hosted sign-out, whose after-sign-out URL is portal `/`): the plain
 *   Market home, so sign-out never re-opens a sign-in modal.
 *
 * Pure URL work (no crypto) — safe for the 1102 budget.
 */
export function anonymousPortalRootDestination(requestUrl: string | URL, clientUat: string | undefined): URL {
  const url = new URL(requestUrl.toString())
  if (clientUat === undefined) {
    const modal = marketAuthModalUrl(new URL(`/sign-in${url.search}`, PORTAL_ORIGIN))
    if (modal) return modal
  }
  return new URL(`/${url.search}`, MARKET_AUTH_ORIGIN)
}
