/**
 * ONE return_to contract for every YouSafe auth entry point.
 *
 * - Canonical parameter name: `return_to`.
 * - Canonical value: an ABSOLUTE https URL on an allow-listed estate origin.
 *   Relative paths are resolved against the portal origin (or a caller base).
 * - Legacy parameter names (`ys_return_to`, `redirect_url`, `returnTo`, ...)
 *   are accepted on input and normalized to `return_to` on output.
 * - Auth documents (/sign-in, /sign-up, /login, /register) are never valid
 *   destinations (prevents sign-in loops).
 *
 * Pure string/URL work only: this runs in middleware on the shared Worker
 * (Cloudflare 1102 history), so no crypto, no I/O, no regex backtracking.
 */

export const PORTAL_ORIGIN = 'https://portal.yousafeconsultancy.com'
export const MARKET_ORIGIN = 'https://market.yousafeconsultancy.com'

/** Every first-party origin a user may be returned to after auth. */
export const ESTATE_ORIGINS: ReadonlySet<string> = new Set([
  PORTAL_ORIGIN,
  MARKET_ORIGIN,
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://uk.yousafeconsultancy.com',
  'https://au.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
])

/** Canonical name first; the rest are accepted for backwards compatibility. */
export const RETURN_TO_PARAM = 'return_to'
export const LEGACY_RETURN_TO_PARAMS: readonly string[] = [
  'ys_return_to',
  'redirect_url',
  'returnTo',
  'return_url',
  'redirect_to',
  'sign_in_force_redirect_url',
  'sign_up_force_redirect_url',
  'after_sign_in_url',
  'after_sign_up_url',
]
export const ALL_RETURN_TO_PARAMS: readonly string[] = [RETURN_TO_PARAM, ...LEGACY_RETURN_TO_PARAMS]

const MAX_RETURN_TO_LENGTH = 2048

const AUTH_DOCUMENT_PREFIXES = ['/sign-in', '/sign-up', '/login', '/register']

function isAuthDocumentPath(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return AUTH_DOCUMENT_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}?`),
  )
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Normalize a candidate return target to an absolute, allow-listed https URL.
 * Returns null for anything unsafe or unusable.
 */
export function normalizeReturnTo(
  value: string | null | undefined,
  base: string = PORTAL_ORIGIN,
): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_RETURN_TO_LENGTH) return null
  if (raw.startsWith('//') || raw.includes('\\') || hasControlCharacters(raw)) return null

  let url: URL
  try {
    if (raw.startsWith('/')) {
      const baseOrigin = ESTATE_ORIGINS.has(base) ? base : PORTAL_ORIGIN
      url = new URL(raw, baseOrigin)
    } else {
      url = new URL(raw)
    }
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!ESTATE_ORIGINS.has(url.origin)) return null

  // Retired public /marketplace namespace -> clean market URL.
  if (url.pathname === '/marketplace' || url.pathname.startsWith('/marketplace/')) {
    const cleanPath = url.pathname.slice('/marketplace'.length) || '/'
    url = new URL(`${cleanPath}${url.search}${url.hash}`, MARKET_ORIGIN)
  }

  if (isAuthDocumentPath(url.pathname)) return null

  // Never round-trip auth-flow parameters inside a destination.
  for (const name of ALL_RETURN_TO_PARAMS) url.searchParams.delete(name)

  return url.toString()
}

/** First valid return target across canonical + legacy parameter names. */
export function pickReturnTo(
  searchParams: URLSearchParams,
  base: string = PORTAL_ORIGIN,
): string | null {
  for (const name of ALL_RETURN_TO_PARAMS) {
    const candidate = searchParams.get(name)
    const normalized = normalizeReturnTo(candidate, base)
    if (normalized) return normalized
  }
  return null
}

/**
 * Rewrite a query string in place: drop every legacy/canonical return param and
 * set the single normalized `return_to` (when one is valid). Returns true when
 * anything changed.
 */
export function normalizeReturnToParams(
  searchParams: URLSearchParams,
  base: string = PORTAL_ORIGIN,
): boolean {
  const before = searchParams.toString()
  const returnTo = pickReturnTo(searchParams, base)
  for (const name of ALL_RETURN_TO_PARAMS) searchParams.delete(name)
  if (returnTo) searchParams.set(RETURN_TO_PARAM, returnTo)
  return searchParams.toString() !== before
}

export type AuthMode = 'sign-in' | 'sign-up'

/** Canonical provider/client intents carried through sign-up. */
export type AuthIntent = 'client' | 'provider' | 'attorney' | 'consultant' | 'regulated_adviser'

const VALID_INTENTS: ReadonlySet<string> = new Set([
  'client',
  'provider',
  'attorney',
  'consultant',
  'regulated_adviser',
])

export function normalizeAuthIntent(value: unknown): AuthIntent | null {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  if (lower === 'student') return 'client'
  if (lower === 'seller') return 'provider'
  return VALID_INTENTS.has(lower) ? (lower as AuthIntent) : null
}

/** Build the single canonical portal auth URL. */
export function buildAuthUrl(
  mode: AuthMode,
  options: { returnTo?: string | null; intent?: string | null; extra?: Record<string, string | null | undefined> } = {},
): string {
  const url = new URL(`/${mode}`, PORTAL_ORIGIN)
  const returnTo = normalizeReturnTo(options.returnTo ?? null)
  if (returnTo) url.searchParams.set(RETURN_TO_PARAM, returnTo)
  const intent = normalizeAuthIntent(options.intent)
  if (intent) url.searchParams.set('intent', intent)
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}
