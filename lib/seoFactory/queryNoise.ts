/**
 * Query-noise filter for the opportunity engine.
 *
 * Google Search Console occasionally leaks non-keyword strings into the top
 * queries: PDF filenames, file paths, and pasted URLs (e.g. a "rates final.pdf"
 * filename plus a pacific.edu file path). These can never be resolved into a
 * cannibal-merge or a real content opportunity, and they surface as "Cannibal
 * sweep: 8 failed" noise. Filter them before they reach the radar.
 */

const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|jpg|jpe?g|png|gif|webp|svg|csv|zip|rar|mp3|mp4|txt)(?:[^a-z0-9]|$)/i

// A pasted URL/domain or a filesystem path fragment is never a search keyword.
// TLD match does not require a trailing slash — GSC often wraps the host in quotes
// (`"iamhome@pacific.edu"`) which used to leak through.
const URL_FRAGMENT_RE =
  /(?:^|[\s"'@])(?:https?:\/\/|www\.)|(?:^|\/)(?:sites|files|wp-content|uploads|assets)(?:\/|$)|\b(?:[a-z0-9-]+\.)+(?:edu|com|org|net|gov|io|co)\b/i

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i

/** CMS user slugs leaked from `/files/users/user2983`. */
const CMS_USER_RE = /\buser\d+\b/i

/** Estate self-reference / brand strings — navigational noise, never a keyword. */
const BRAND_RE = /\b(?:yousafe|mycaseworks|yousafeconsultancy)\b/i

/** Pure numeric pastes (order numbers, user IDs) — not a search phrase. */
const PURE_NUMERIC_RE = /^[0-9\s.,\-/*]+$/

/** Document-stamp queries ("issued by yale university"). */
const ISSUED_BY_RE = /\bissued by\b/i

/** Quoted academic-year / month stamps from a filename (`"2026-04"`, `"2026-2027"`). */
const QUOTED_DATE_RE = /["']\d{4}(?:-\d{2,4})["']/

/** Campus housing PDF leftovers — never an immigration keyword. */
const MEAL_PLAN_RE = /\broom and meal plan\b/i

/** Max word count for a plausible keyword phrase; longer strings are pasted text. */
const MAX_KEYWORD_WORDS = 8

/**
 * True when a term is a file path, URL, email, or CMS path fragment rather
 * than a search keyword (e.g. `rates final.pdf pacific.edu/sites/default/files`).
 * Narrower than isJunkQuery: no word-count or phrasing heuristics, so it is
 * safe to apply to free-form topics and long-but-legitimate queries too.
 */
export function isFileOrUrlLikeTerm(term: string): boolean {
  const t = (term || '').trim()
  if (!t) return false
  return (
    FILE_EXT_RE.test(t) ||
    URL_FRAGMENT_RE.test(t) ||
    EMAIL_RE.test(t) ||
    CMS_USER_RE.test(t)
  )
}

/**
 * True when a query string is noise (a filename/URL/pasted blob), not a real
 * keyword. Empty strings are also considered junk.
 */
export function isJunkQuery(term: string): boolean {
  const t = (term || '').trim()
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > MAX_KEYWORD_WORDS) return true
  if (isFileOrUrlLikeTerm(t)) return true
  if (BRAND_RE.test(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (MEAL_PLAN_RE.test(t)) return true
  // Two or more quoted fragments is a leaked document title + metadata, not a keyword.
  const quoted = t.match(/"[^"]+"/g) || []
  if (quoted.length >= 2) return true
  return false
}

/**
 * Junk check for content-job topics / primary keywords (pipeline backstop).
 * Same junk heuristics as `isJunkQuery` EXCEPT the max-word-count rule, so a
 * legitimate long-tail topic like "how to apply for a uk spouse visa step by
 * step guide" is never rejected — only GSC-leak junk (PDF paths, quoted doc
 * stamps, brand/numeric pastes) is refused before a job is generated.
 */
export function isJunkTopic(term: string): boolean {
  const t = (term || '').trim()
  if (!t) return true
  if (isFileOrUrlLikeTerm(t)) return true
  if (BRAND_RE.test(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (MEAL_PLAN_RE.test(t)) return true
  const quoted = t.match(/"[^"]+"/g) || []
  if (quoted.length >= 2) return true
  return false
}

/**
 * GSC query classification for the factory: eligible vs junk vs deep tail.
 *
 * - `junk`      — never queue, never brief, never regenerate. PDF filenames,
 *                 quoted official-document strings, `user\d+` CMS slugs,
 *                 `pacific.edu/sites` / `files/users` paths, brand terms.
 * - `deep_tail` — real queries with negligible signal (impressions < 10,
 *                 position > 20, zero clicks). Counted in the mix, never
 *                 treated as demand.
 * - `eligible`  — everything else. This is the only class that may become a
 *                 factory play.
 */
export type GscQueryClass = 'eligible' | 'junk' | 'deep_tail'

export function classifyGscQuery(
  term: string,
  row: { impressions: number; position: number; clicks: number },
): GscQueryClass {
  const t = (term || '').trim()
  if (!t) return 'junk'
  if (isJunkQuery(t) || isFileOrUrlLikeTerm(t)) return 'junk'
  const impressions = Math.max(0, row.impressions || 0)
  const position = Math.max(0, row.position || 0)
  const clicks = Math.max(0, row.clicks || 0)
  if (impressions < 10 && position > 20 && clicks === 0) return 'deep_tail'
  return 'eligible'
}
