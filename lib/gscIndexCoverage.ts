/**
 * GSC Index Coverage — read WHY a page is (or isn't) indexed.
 *
 * Uses the Search Console URL Inspection API
 * (`POST /v1/urlInspection/index:inspect`), which returns Google's own
 * verdict per URL: the coverage state, the noindex/robots.txt blockers, the
 * fetch state (soft 404 / 404 / 5xx / redirect / 401 / 403), the selected
 * canonical, and the referring URLs. This is the authoritative "why isn't this
 * page indexed" signal — far stronger than the live-HTML heuristics in
 * lib/seoFactory/liveVerify.ts (which can only guess at noindex/canonical).
 *
 * Re-crawl nudging after a fix is handled by lib/indexNow.ts
 * (`submitUrlsToIndexNow`) — Google exposes no public request-indexing API
 * for general pages (the UI button is not in the REST API, and the Indexing
 * API is job-postings/live-video only).
 *
 * Edge-safe: plain fetch only (no node builtins).
 */

import { getGscAccess, type GscAccess } from '@/lib/gscAuth'

const INSPECT_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'

// ── Raw API shapes ──────────────────────────────────────────────────────────

export interface GscRawIndexStatus {
  sitemap?: string[]
  referringUrls?: string[]
  verdict?: string | null
  coverageState?: string | null
  robotsTxtState?: string | null
  indexingState?: string | null
  lastCrawlTime?: string | null
  pageFetchState?: string | null
  googleCanonical?: string | null
  userCanonical?: string | null
  crawledAs?: string | null
}

export interface GscRawInspection {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: GscRawIndexStatus
  }
}

// ── Normalized issue ────────────────────────────────────────────────────────

export type GscIndexReasonCode =
  | 'INDEXED'
  | 'INDEXED_NOT_SUBMITTED'
  | 'INDEXED_BLOCKED_ROBOTS'
  | 'NOINDEX_TAG'
  | 'NOINDEX_HTTP_HEADER'
  | 'BLOCKED_ROBOTS_TXT'
  | 'DUPLICATE_NO_CANONICAL'
  | 'DUPLICATE_CHOSEN_CANONICAL'
  | 'ALTERNATE_WITH_CANONICAL'
  | 'SOFT_404'
  | 'NOT_FOUND_404'
  | 'SERVER_ERROR_5XX'
  | 'REDIRECT_ERROR'
  | 'PAGE_WITH_REDIRECT'
  | 'ACCESS_DENIED_401'
  | 'ACCESS_FORBIDDEN_403'
  | 'BLOCKED_4XX'
  | 'INVALID_URL'
  | 'DISCOVERED_NOT_INDEXED'
  | 'CRAWLED_NOT_INDEXED'
  | 'SUBMITTED_NOT_INDEXED'
  | 'UNKNOWN_TO_GOOGLE'
  | 'UNKNOWN'

export type GscFixAction =
  | 'NONE'
  | 'REMOVE_NOINDEX'
  | 'ADD_CANONICAL'
  | 'FIX_CANONICAL'
  | 'FIX_ROBOTS_TXT'
  | 'ADD_INTERNAL_LINK'
  | 'ADD_SITEMAP'
  | 'EXPAND_THIN_CONTENT'
  | 'IMPROVE_QUALITY'
  | 'FIX_ROUTE'
  | 'FIX_REDIRECT'
  | 'FIX_ACCESS'
  | 'REQUEST_INDEXING'
  | 'MANUAL'

export interface GscIndexIssue {
  url: string
  indexed: boolean
  reasonCode: GscIndexReasonCode
  /** Human-readable reason, e.g. "Excluded by 'noindex' tag". */
  reason: string
  coverageState: string | null
  verdict: string | null
  indexingState: string | null
  pageFetchState: string | null
  robotsTxtState: string | null
  googleCanonical: string | null
  userCanonical: string | null
  sitemaps: string[]
  referringUrls: string[]
  lastCrawlTime: string | null
  fixAction: GscFixAction
  /** True when the Content Studio can deterministically fix this via a PR. */
  autoFix: boolean
  /** Short action label for the Fix button. */
  fixLabel: string
}

const baseIssue = (url: string): GscIndexIssue => ({
  url,
  indexed: false,
  reasonCode: 'UNKNOWN',
  reason: 'Unknown indexing state',
  coverageState: null,
  verdict: null,
  indexingState: null,
  pageFetchState: null,
  robotsTxtState: null,
  googleCanonical: null,
  userCanonical: null,
  sitemaps: [],
  referringUrls: [],
  lastCrawlTime: null,
  fixAction: 'MANUAL',
  autoFix: false,
  fixLabel: 'Review manually',
})

function make(
  url: string,
  s: GscRawIndexStatus,
  reasonCode: GscIndexReasonCode,
  reason: string,
  fixAction: GscFixAction,
  autoFix: boolean,
  fixLabel: string,
  indexed: boolean,
): GscIndexIssue {
  return {
    ...baseIssue(url),
    indexed,
    reasonCode,
    reason,
    fixAction,
    autoFix,
    fixLabel,
    coverageState: s.coverageState ?? null,
    verdict: s.verdict ?? null,
    indexingState: s.indexingState ?? null,
    pageFetchState: s.pageFetchState ?? null,
    robotsTxtState: s.robotsTxtState ?? null,
    googleCanonical: s.googleCanonical ?? null,
    userCanonical: s.userCanonical ?? null,
    sitemaps: s.sitemap ?? [],
    referringUrls: s.referringUrls ?? [],
    lastCrawlTime: s.lastCrawlTime ?? null,
  }
}

/**
 * Classify a raw `indexStatusResult` into a normalized, actionable issue.
 * Pure — exported so unit tests can lock every reason mapping.
 */
export function classifyIndexStatus(url: string, s: GscRawIndexStatus | null | undefined): GscIndexIssue {
  if (!s) {
    return {
      ...baseIssue(url),
      reasonCode: 'UNKNOWN_TO_GOOGLE',
      reason: 'URL is unknown to Google (no inspection result)',
      fixAction: 'ADD_SITEMAP',
      autoFix: true,
      fixLabel: 'Add to sitemap + request indexing',
    }
  }

  const coverage = (s.coverageState ?? '').toLowerCase()
  const indexingState = s.indexingState ?? ''
  const pageFetchState = s.pageFetchState ?? ''
  const robotsTxtState = s.robotsTxtState ?? ''
  const verdict = s.verdict ?? ''

  // 1) noindex directives — the most actionable blockers.
  if (indexingState === 'BLOCKED_BY_META_TAG') {
    return make(url, s, 'NOINDEX_TAG', "Excluded by 'noindex' meta tag", 'REMOVE_NOINDEX', true, 'Remove noindex tag', false)
  }
  if (indexingState === 'BLOCKED_BY_HTTP_HEADER') {
    return make(url, s, 'NOINDEX_HTTP_HEADER', "Excluded by X-Robots-Tag 'noindex' header", 'REMOVE_NOINDEX', true, 'Remove noindex header', false)
  }

  // 2) fetch-state errors (Google couldn't retrieve the page cleanly).
  if (pageFetchState === 'SOFT_404') {
    return make(url, s, 'SOFT_404', 'Soft 404 — content too thin to index', 'EXPAND_THIN_CONTENT', false, 'Expand content + internal links', false)
  }
  if (pageFetchState === 'NOT_FOUND') {
    return make(url, s, 'NOT_FOUND_404', 'Not found (404)', 'FIX_ROUTE', false, 'Fix route or restore page', false)
  }
  if (pageFetchState === 'SERVER_ERROR') {
    return make(url, s, 'SERVER_ERROR_5XX', 'Server error (5xx)', 'FIX_ROUTE', false, 'Fix server error', false)
  }
  if (pageFetchState === 'REDIRECT_ERROR') {
    return make(url, s, 'REDIRECT_ERROR', 'Redirect error', 'FIX_REDIRECT', false, 'Fix redirect', false)
  }
  if (pageFetchState === 'ACCESS_DENIED') {
    return make(url, s, 'ACCESS_DENIED_401', 'Blocked due to unauthorized request (401)', 'FIX_ACCESS', false, 'Fix 401 auth block', false)
  }
  if (pageFetchState === 'ACCESS_FORBIDDEN') {
    return make(url, s, 'ACCESS_FORBIDDEN_403', 'Blocked due to access forbidden (403)', 'FIX_ACCESS', false, 'Fix 403 access block', false)
  }
  if (pageFetchState === 'BLOCKED_4XX') {
    return make(url, s, 'BLOCKED_4XX', 'Blocked by other 4xx issue', 'FIX_ACCESS', false, 'Fix 4xx block', false)
  }
  if (pageFetchState === 'BLOCKED_ROBOTS_TXT') {
    return make(url, s, 'BLOCKED_ROBOTS_TXT', 'Blocked by robots.txt', 'FIX_ROBOTS_TXT', true, 'Unblock in robots.txt', false)
  }
  if (pageFetchState === 'INVALID_URL') {
    return make(url, s, 'INVALID_URL', 'Invalid URL', 'MANUAL', false, 'Review URL', false)
  }

  // 3) robots.txt disallow.
  if (robotsTxtState === 'DISALLOWED') {
    return make(url, s, 'BLOCKED_ROBOTS_TXT', 'Blocked by robots.txt', 'FIX_ROBOTS_TXT', true, 'Unblock in robots.txt', false)
  }

  // 4) canonical / duplicate / redirect / quality (verdict NEUTRAL coverage text).
  if (/duplicate without user-selected canonical/.test(coverage)) {
    return make(url, s, 'DUPLICATE_NO_CANONICAL', 'Duplicate without user-selected canonical', 'ADD_CANONICAL', true, 'Add self-referencing canonical', false)
  }
  if (/duplicate, google chose different canonical/.test(coverage)) {
    return make(url, s, 'DUPLICATE_CHOSEN_CANONICAL', 'Google chose a different canonical than declared', 'FIX_CANONICAL', true, 'Correct canonical target', false)
  }
  if (/alternate page with proper canonical/.test(coverage)) {
    return make(url, s, 'ALTERNATE_WITH_CANONICAL', 'Alternate page with proper canonical tag (canonicalized to another URL)', 'NONE', false, 'No fix needed', true)
  }
  if (/page with redirect/.test(coverage)) {
    return make(url, s, 'PAGE_WITH_REDIRECT', 'Page with redirect', 'FIX_REDIRECT', false, 'Fix redirect', false)
  }
  if (/crawled - currently not indexed|crawled.*currently not indexed/.test(coverage)) {
    return make(url, s, 'CRAWLED_NOT_INDEXED', 'Crawled - currently not indexed', 'IMPROVE_QUALITY', false, 'Improve content + links', false)
  }
  if (/discovered - currently not indexed|discovered.*not indexed/.test(coverage)) {
    return make(url, s, 'DISCOVERED_NOT_INDEXED', 'Discovered - currently not indexed', 'IMPROVE_QUALITY', false, 'Improve content + links', false)
  }
  if (/submitted but not indexed/.test(coverage)) {
    return make(url, s, 'SUBMITTED_NOT_INDEXED', 'Submitted but not indexed', 'IMPROVE_QUALITY', false, 'Improve content + links', false)
  }
  if (/soft 404/.test(coverage)) {
    return make(url, s, 'SOFT_404', 'Soft 404 — content too thin to index', 'EXPAND_THIN_CONTENT', false, 'Expand content + internal links', false)
  }
  if (/not found \(404\)|not found/.test(coverage)) {
    return make(url, s, 'NOT_FOUND_404', 'Not found (404)', 'FIX_ROUTE', false, 'Fix route or restore page', false)
  }
  if (/server error \(5xx\)|server error/.test(coverage)) {
    return make(url, s, 'SERVER_ERROR_5XX', 'Server error (5xx)', 'FIX_ROUTE', false, 'Fix server error', false)
  }
  if (/blocked by robots\.txt/.test(coverage)) {
    return make(url, s, 'BLOCKED_ROBOTS_TXT', 'Blocked by robots.txt', 'FIX_ROBOTS_TXT', true, 'Unblock in robots.txt', false)
  }
  if (/excluded by .?noindex.?( tag)?|noindex tag/.test(coverage)) {
    return make(url, s, 'NOINDEX_TAG', "Excluded by 'noindex' tag", 'REMOVE_NOINDEX', true, 'Remove noindex tag', false)
  }
  if (/url is unknown to google/.test(coverage)) {
    return make(url, s, 'UNKNOWN_TO_GOOGLE', 'URL is unknown to Google', 'ADD_SITEMAP', true, 'Add to sitemap + request indexing', false)
  }
  if (/blocked due to unauthorized request|\(401\)/.test(coverage)) {
    return make(url, s, 'ACCESS_DENIED_401', 'Blocked due to unauthorized request (401)', 'FIX_ACCESS', false, 'Fix 401 auth block', false)
  }
  if (/blocked due to access forbidden|\(403\)/.test(coverage)) {
    return make(url, s, 'ACCESS_FORBIDDEN_403', 'Blocked due to access forbidden (403)', 'FIX_ACCESS', false, 'Fix 403 access block', false)
  }
  if (/blocked by page removal tool/.test(coverage)) {
    return make(url, s, 'BLOCKED_4XX', 'Blocked by page removal tool', 'MANUAL', false, 'Review removal', false)
  }

  // 5) indexed (verdict PASS or "Indexed" coverage) — and the informational
  //    "indexed but blocked by robots" edge.
  if (verdict === 'PASS' || /indexed/.test(coverage)) {
    if (/indexed.*blocked by robots|blocked by robots.*indexed/.test(coverage)) {
      return make(url, s, 'INDEXED_BLOCKED_ROBOTS', 'Indexed, though blocked by robots.txt', 'FIX_ROBOTS_TXT', true, 'Unblock in robots.txt', true)
    }
    if (/not submitted in sitemap/.test(coverage)) {
      return make(url, s, 'INDEXED_NOT_SUBMITTED', 'Indexed, not submitted in sitemap', 'NONE', false, 'No fix needed', true)
    }
    return make(url, s, 'INDEXED', 'Indexed', 'NONE', false, 'No fix needed', true)
  }

  // 6) fallback — surface Google's raw coverage text.
  return {
    ...baseIssue(url),
    reasonCode: 'UNKNOWN',
    reason: s.coverageState || 'Unknown indexing state',
    coverageState: s.coverageState ?? null,
    verdict: s.verdict ?? null,
    indexingState: s.indexingState ?? null,
    pageFetchState: s.pageFetchState ?? null,
    robotsTxtState: s.robotsTxtState ?? null,
    googleCanonical: s.googleCanonical ?? null,
    userCanonical: s.userCanonical ?? null,
    sitemaps: s.sitemap ?? [],
    referringUrls: s.referringUrls ?? [],
    lastCrawlTime: s.lastCrawlTime ?? null,
    fixAction: 'MANUAL',
    autoFix: false,
    fixLabel: 'Review manually',
  }
}

// ── API calls ───────────────────────────────────────────────────────────────

/** Inspect a single URL. Returns the raw index status result, or null on error. */
export async function inspectGscUrl(url: string, access: GscAccess): Promise<GscRawIndexStatus | null> {
  const res = await fetch(INSPECT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: access.siteUrl, languageCode: 'en-US' }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GSC inspect ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as GscRawInspection
  return json.inspectionResult?.indexStatusResult ?? null
}

/**
 * Batch-inspect a list of URLs with bounded concurrency and inter-request
 * delay (the URL Inspection API is quota-limited and throttles bursts).
 * Returns only the NON-indexed issues (and the "indexed but robots-blocked"
 * informational case) so the caller sees exactly what needs fixing.
 */
export async function fetchGscIndexCoverage(
  urls: string[],
  opts: { concurrency?: number; delayMs?: number; maxUrls?: number } = {},
): Promise<{
  issues: GscIndexIssue[]
  inspected: number
  skipped: number
  errors: Array<{ url: string; error: string }>
  configured: boolean
}> {
  const access = await getGscAccess()
  if (!access || !access.accessToken || !access.siteUrl) {
    return { issues: [], inspected: 0, skipped: urls.length, errors: [], configured: false }
  }
  const concurrency = Math.max(1, Math.min(5, opts.concurrency ?? 3))
  const delayMs = opts.delayMs ?? 400
  const maxUrls = opts.maxUrls ?? 250
  const targets = urls.slice(0, maxUrls)
  const errors: Array<{ url: string; error: string }> = []
  const issues: GscIndexIssue[] = []
  let inspected = 0

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  let cursor = 0
  async function worker() {
    while (cursor < targets.length) {
      const url = targets[cursor++]
      try {
        const raw = await inspectGscUrl(url, access)
        inspected++
        const issue = classifyIndexStatus(url, raw)
        // Only surface pages that are NOT indexed (plus the robots-blocked edge).
        if (!issue.indexed || issue.reasonCode === 'INDEXED_BLOCKED_ROBOTS') {
          issues.push(issue)
        }
      } catch (e) {
        errors.push({ url, error: e instanceof Error ? e.message.slice(0, 160) : String(e) })
      }
      await sleep(delayMs)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  issues.sort((a, b) => a.url.localeCompare(b.url))
  return { issues, inspected, skipped: urls.length - inspected, errors, configured: true }
}
