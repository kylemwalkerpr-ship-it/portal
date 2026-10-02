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
import { normalizeReturnToParams, PORTAL_ORIGIN } from './returnTo'

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
