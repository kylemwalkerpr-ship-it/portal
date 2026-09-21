/**
 * Landing pagination URL contract (TRUE PAGINATION).
 *
 * The market root is build-static and never parses the query string on the
 * server (no searchParams, no headers), so the numbered pager owns the URL on
 * the client through window.location + the History API:
 *
 *   page 1 -> `/`          (canonical browsing URL)
 *   page N -> `/?page=N`   (N >= 2, country state preserved)
 *
 * Everything here is pure string/URL math so the parse, the canonical href
 * builder and the "is this the landing's own page pointer?" decision used by
 * the client query gate are unit-tested rather than re-implemented inline.
 */

import { withCountry, type Country } from '@/lib/marketplaceDisplay'

/** The one query key the landing pager owns. */
export const LANDING_PAGE_PARAM = 'page'

/**
 * Query keys landing browsing owns. `page` is the numbered pager's pointer and
 * `country` is the existing jurisdiction state (the same key the country tabs
 * and the grid's discovery links already use). Any other key belongs to another
 * consumer, so the grid must not rewrite it away.
 */
export const LANDING_BROWSING_KEYS = [LANDING_PAGE_PARAM, 'country'] as const

type SearchInput = string | URLSearchParams | null | undefined

function asSearchParams(input: SearchInput): URLSearchParams {
  if (input instanceof URLSearchParams) return input
  if (typeof input !== 'string') return new URLSearchParams()
  return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
}

/**
 * Page number from a URL query string. Mirrors the edge's
 * `parseDiscoveryPage` semantics: positive integers only, so absent, malformed,
 * zero and negative values all resolve to the canonical page 1 (clamping
 * against the real page count happens with `clampPage` once the total is known).
 */
export function parseLandingPage(input: SearchInput): number {
  const raw = asSearchParams(input).get(LANDING_PAGE_PARAM)
  if (raw == null) return 1
  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * Canonical browsing URL for one page: `/` for page 1 (the page parameter is
 * never serialized for the canonical window) and `/?page=N` for N >= 2, with
 * the relevant country state carried through exactly as `withCountry` does
 * everywhere else on the landing.
 */
export function landingPageHref(page: number, country: Country = 'all'): string {
  const target = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
  return withCountry(target > 1 ? `/?${LANDING_PAGE_PARAM}=${target}` : '/', country)
}

/**
 * True when every query key present is one landing browsing owns (`page`,
 * `country`). The grid only normalizes/rewrites such URLs — a query string that
 * carries a discovery filter, `lang` or a tracking key is left untouched.
 */
export function isLandingBrowsingQuery(input: SearchInput): boolean {
  const params = asSearchParams(input)
  for (const key of params.keys()) {
    if (!(LANDING_BROWSING_KEYS as readonly string[]).includes(key)) return false
  }
  return true
}

/**
 * True when the query string is the landing's own numbered pagination and
 * nothing else — a non-empty `page` pointer with no other key at all.
 *
 * The client query gate uses this to keep `/?page=3` on the landing: a bare
 * page pointer is browsing state, not a discovery deep link. Every other
 * recognized discovery key (country included) still opens GigDiscoveryPage, so
 * `/?country=uk` and even `/?country=uk&page=2` keep their existing discovery
 * behaviour — the numbered pager only ever emits `/?page=N` (plus country when
 * the landing is rendered for a country slice).
 */
export function isLandingPageOnlyQuery(input: SearchInput): boolean {
  const params = asSearchParams(input)
  const raw = params.get(LANDING_PAGE_PARAM)
  if (raw == null || raw.trim() === '') return false
  for (const key of params.keys()) {
    if (key !== LANDING_PAGE_PARAM) return false
  }
  return true
}
