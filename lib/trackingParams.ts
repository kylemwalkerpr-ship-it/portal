/**
 * Estate-wide tracking-parameter consolidation.
 *
 * Extracted from `middleware.ts` so the SEO invariant is a pure, directly
 * testable function: a URL carrying `utm_*`, a click id or the P10 `yattr`
 * handoff parameter is answered with a single permanent redirect to the clean
 * canonical path, and the tracking variant can never become an indexable URL.
 *
 * Dependency-free and edge-safe (imported by `middleware.ts`).
 */

/** Tracking/query junk that must never create distinct indexable URLs. */
export const TRACKING_QUERY_KEYS: ReadonlySet<string> = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  // Google cross-domain linker parameter: leave it untouched at the edge so GA4
  // can consume it after explicit consent, then remove it in the browser.
  // '_gl' is intentionally not a server-redirect key.
  // P10 cross-domain attribution handoff. Captured into a short-lived first-party
  // cookie under explicit granted consent and then removed, so a handoff URL can
  // never become an indexable tracking variant of a canonical page.
  'yattr',
])

/** True for a fixed tracking key or any explicitly prefixed `utm_*` key. */
export function isTrackingQueryKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return TRACKING_QUERY_KEYS.has(normalized) || normalized.startsWith('utm_')
}

/** Delete every tracking key in place; returns true when something was removed. */
export function deleteTrackingQueryParams(params: URLSearchParams): boolean {
  let changed = false
  for (const key of [...params.keys()]) {
    if (isTrackingQueryKey(key)) {
      params.delete(key)
      changed = true
    }
  }
  return changed
}

/**
 * Path + (clean) query for a URL whose tracking parameters must be consolidated,
 * or `null` when the URL already is canonical. Never returns a full URL, so the
 * caller decides the redirect destination and host.
 */
export function stripTrackingParams(url: URL): string | null {
  const changed = deleteTrackingQueryParams(url.searchParams)
  return changed ? url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') : null
}
