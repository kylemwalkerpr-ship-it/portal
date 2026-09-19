/**
 * Discovery-query contract for the public Marketplace estate.
 *
 * Every public Marketplace surface (/, /gigs, /categories/<slug>) is
 * build-static and never reads the URL on the server, so anything that depends
 * on the query string happens either in the client discovery island or at the
 * edge. This module is the edge half: it decides whether a request carries a
 * discovery *variant* that must stay out of the index.
 *
 * Retired context: the Marketplace landing used to make this decision in its
 * own `searchParams`-driven `generateMetadata`. That page is TRUE SSG now, so
 * the same decision is enforced by `middleware.ts` as
 * `X-Robots-Tag: noindex, follow`, and this module keeps the key list and the
 * page semantics in one place that the contract tests can execute directly.
 */

/**
 * Discovery filter keys that only ever build a variant of a clean Marketplace
 * surface (`/` or `/gigs`), never a distinct canonical document.
 */
export const DISCOVERY_FILTER_KEYS = [
  'q',
  'category',
  'sort',
  'jurisdiction',
  'provider_type',
  'min_price',
  'max_price',
  'min_rating',
  'delivery_days',
]

/**
 * Clean, indexable Marketplace surfaces whose filtered/paginated variants are
 * duplicate documents of the same canonical URL:
 *
 *  · `/`     — the Marketplace landing;
 *  · `/gigs` — the versioned service directory.
 *
 * Both are TRUE SSG with static `robots: { index: true, follow: true }`
 * metadata, so neither can emit query-sensitive robots metadata any more and
 * the variant directive can only be applied at the host edge. Paths are *not*
 * wildcarded: `/gigs/<slug>`, `/providers/<id>` and `/categories/<slug>` each
 * own one canonical slug and were never query-noindexed (the category shelf's
 * only query rule was `utm_*`, which the middleware 301-consolidates before the
 * route is reached), so their indexability must not change here.
 */
export const DISCOVERY_VARIANT_PATHS = ['/', '/gigs'] as const

/**
 * Page parsing parity with the landing's retired `parsePage` helper: positive
 * integers only, so malformed / zero / negative values fall back to page 1 and
 * only `?page=N` (N >= 2) counts as a paginated duplicate.
 */
export function parseDiscoveryPage(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/**
 * True when a request carries a discovery filter or a paginated view that
 * duplicates a clean, indexable Marketplace surface.
 *
 * Presence — not a non-empty value — matches the retired landing metadata check
 * (`sp[key] !== undefined`), including the legacy `?q=` noindex. `?country=` is
 * deliberately absent (it was never noindexed on either surface), and `page` is
 * conditional rather than presence-based for the same reason.
 */
export function isDiscoveryQueryVariant(params: URLSearchParams): boolean {
  if (DISCOVERY_FILTER_KEYS.some((key) => params.has(key))) return true
  return parseDiscoveryPage(params.get('page')) > 1
}

/**
 * True when `pathname` is one of the clean surfaces above. A trailing slash is
 * tolerated so `/gigs/` cannot slip past the edge rule on the request that
 * canonicalizes to `/gigs`.
 */
export function isDiscoveryVariantPath(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return (DISCOVERY_VARIANT_PATHS as readonly string[]).includes(normalized)
}

/**
 * Edge contract enforced by `middleware.ts` on the market host: the
 * `(pathname, query)` pairs whose response must carry
 * `X-Robots-Tag: noindex, follow`.
 *
 * The query string is never rewritten or trimmed here: recognized discovery
 * params, `?country=` and `?lang=` all keep working for users and crawlers
 * (`?country=`/`?lang=` stay indexable); only the robots directive changes.
 */
export function isDiscoveryVariantRequest(pathname: string, params: URLSearchParams): boolean {
  return isDiscoveryVariantPath(pathname) && isDiscoveryQueryVariant(params)
}
