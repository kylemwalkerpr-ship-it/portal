/**
 * Market jurisdiction preference (header selector, country tabs, catalogue
 * filter) persisted across navigation, reloads, pagination and new visits.
 *
 * Storage: one first-party, host-only cookie (`ys_market_jx`). It is a plain
 * cookie so server code CAN read it (`readMarketJurisdictionCookie(header)`),
 * but the Market documents are build-static (served from the static
 * incremental cache — rendering them per request is the Workers Free 1102
 * risk), so the value is applied on the client right after hydration by
 * MarketJurisdictionSync: the static HTML and the first client render agree
 * on the default, then the stored value is applied in the URL.
 *
 * Precedence (resolveMarketJurisdiction):
 *   1. an explicit URL param (`?country=` or multi-value `?jurisdiction=`) —
 *      authoritative, and a single value updates the stored preference;
 *   2. the stored cookie;
 *   3. the default, 'all'.
 *
 * Signed-in users use the same cookie. `profiles.country_code` is NOT reused:
 * it is the user's own (IP-detected / user-set) residence country used by
 * receipts and admin, cannot express "All jurisdictions", and writing a
 * browse filter into it would corrupt it. No schema is added here.
 */

export type MarketJurisdiction = 'all' | 'us' | 'uk' | 'ca' | 'au'

export const MARKET_JURISDICTIONS: readonly MarketJurisdiction[] = ['all', 'us', 'uk', 'ca', 'au']
export const MARKET_JURISDICTION_COOKIE = 'ys_market_jx'
/** One year: "new visits" keep the choice until the visitor changes it. */
export const MARKET_JURISDICTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function normalizeMarketJurisdiction(value: unknown): MarketJurisdiction | null {
  const v = String(value ?? '').trim().toLowerCase()
  return (MARKET_JURISDICTIONS as readonly string[]).includes(v) ? (v as MarketJurisdiction) : null
}

/** Reads the preference from a Cookie header (server) or `document.cookie` (client). */
export function readMarketJurisdictionCookie(cookieHeader: string | null | undefined): MarketJurisdiction | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== MARKET_JURISDICTION_COOKIE) continue
    try {
      return normalizeMarketJurisdiction(decodeURIComponent(part.slice(eq + 1).trim()))
    } catch {
      return null
    }
  }
  return null
}

export function serializeMarketJurisdictionCookie(
  value: MarketJurisdiction,
  { secure = true }: { secure?: boolean } = {},
): string {
  return [
    `${MARKET_JURISDICTION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${MARKET_JURISDICTION_COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export type UrlJurisdiction =
  | { kind: 'single'; value: MarketJurisdiction }
  | { kind: 'multi' }
  | null

type ParamsLike = { get(name: string): string | null; getAll(name: string): string[] }

/** The jurisdiction a URL explicitly asks for, if any. */
export function readUrlJurisdiction(params: ParamsLike | null | undefined): UrlJurisdiction {
  if (!params) return null
  const country = normalizeMarketJurisdiction(params.get('country'))
  const multi = Array.from(
    new Set(params.getAll('jurisdiction').map(normalizeMarketJurisdiction).filter((v): v is MarketJurisdiction => Boolean(v && v !== 'all'))),
  )
  if (country) return { kind: 'single', value: country }
  if (multi.length === 1) return { kind: 'single', value: multi[0] }
  if (multi.length > 1) return { kind: 'multi' }
  return null
}

export interface ResolvedMarketJurisdiction {
  /** Value the chrome (header selector, category rail) should show. */
  value: MarketJurisdiction
  source: 'url' | 'stored' | 'default'
  /** Value to write to the cookie now (only when the URL made a single explicit choice). */
  persist: MarketJurisdiction | null
}

export function resolveMarketJurisdiction({
  url,
  stored,
}: {
  url: UrlJurisdiction
  stored: MarketJurisdiction | null
}): ResolvedMarketJurisdiction {
  if (url?.kind === 'single') {
    return { value: url.value, source: 'url', persist: url.value === stored ? null : url.value }
  }
  // Several jurisdictions picked in the catalogue filter: explicit, but not a
  // single preference — show "All" in the header and leave the cookie alone.
  if (url?.kind === 'multi') return { value: 'all', source: 'url', persist: null }
  if (stored) return { value: stored, source: 'stored', persist: null }
  return { value: 'all', source: 'default', persist: null }
}

/**
 * Pages whose listings honour `?country=` (home, the /gigs hub and category
 * shelves). Gig detail, provider, cart, shop and account views are left alone.
 */
export function marketJurisdictionAppliesTo(pathname: string | null | undefined, params: ParamsLike | null | undefined): boolean {
  const path = String(pathname || '')
  if (params?.get('view')) return false
  return path === '/' || path === '/gigs' || path === '/categories' || path.startsWith('/categories/')
}

/**
 * URL that applies a stored (non-"all") preference to the current page, or
 * null when nothing should change (explicit URL choice, "all", or a page that
 * does not filter by jurisdiction).
 */
export function urlWithStoredJurisdiction(
  pathname: string,
  params: URLSearchParams,
  stored: MarketJurisdiction | null,
): string | null {
  if (!stored || stored === 'all') return null
  if (readUrlJurisdiction(params)) return null
  if (!marketJurisdictionAppliesTo(pathname, params)) return null
  const next = new URLSearchParams(params.toString())
  next.set('country', stored)
  return `${pathname}?${next.toString()}`
}

export interface MarketJurisdictionSyncPlan {
  value: MarketJurisdiction
  source: ResolvedMarketJurisdiction['source']
  /** Cookie value to write, or null. */
  writeCookie: MarketJurisdiction | null
  /** URL (path + query + hash) to replaceState to, or null. */
  replaceUrl: string | null
}

/**
 * Everything MarketJurisdictionSync does after hydration, as a pure function
 * of (pathname, search, hash, cookie) — unit-testable without a DOM.
 */
export function planMarketJurisdictionSync({
  pathname,
  search,
  hash = '',
  cookie,
}: {
  pathname: string
  search: string
  hash?: string
  cookie: string | null | undefined
}): MarketJurisdictionSyncPlan {
  const params = new URLSearchParams(search)
  const resolved = resolveMarketJurisdiction({
    url: readUrlJurisdiction(params),
    stored: readMarketJurisdictionCookie(cookie),
  })
  const next = resolved.source === 'stored' ? urlWithStoredJurisdiction(pathname || '/', params, resolved.value) : null
  return {
    value: resolved.value,
    source: resolved.source,
    writeCookie: resolved.persist,
    replaceUrl: next ? `${next}${hash}` : null,
  }
}

/** Client helper: record an explicit choice (header selector, tabs, filters). */
export function rememberMarketJurisdiction(value: MarketJurisdiction): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = serializeMarketJurisdictionCookie(value, {
      secure: typeof location !== 'undefined' ? location.protocol === 'https:' : true,
    })
  } catch {
    /* cookies blocked: the URL still carries the choice */
  }
}
