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

/** Bare `pdf` / `docx` tokens (GSC often drops the dot: `"fy27 …" pacific pdf`). */
const BARE_FILETYPE_RE = /(?:^|[\s"'])(?:pdf|docx?|xlsx?|pptx?|csv)(?:[\s"']|$)/i

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

/** Fiscal-year filename leftovers (`fy27 stk housing rates`). */
const FISCAL_HOUSING_RE = /\bfy\d{2,4}\b/i

/** Quoted document-title leftovers (`"fy27 stk housing rates"`). */
const QUOTED_HOUSING_DOC_RE =
  /["'][^"']*\b(?:fy\d{2,4}|stk|stockton|housing rates|meal plan|room and)\b[^"']*["']/i

/**
 * Real search demand that is outside YouSafe's ranking mission when it stands
 * alone. These terms are not malformed "junk": we keep them visible in raw
 * analytics so the team can measure topical pollution. They simply must not
 * become an SEO Factory / Master Engine action unless immigration, document,
 * admissions, or tenancy/legal intent is also present.
 */
const CAMPUS_LIFESTYLE_RE =
  /\b(?:student housing|campus housing|housing rates?|dorms?|residence halls?|meal plans?|dining plans?|campus dining|parking rates?|student neighborhoods?|student neighbourhoods?|campus life|commute|accommodation|apartments?|rent ranges?)\b/i

const MISSION_ANCHOR_RE =
  /\b(?:visa|permit|immigration|f-?1|student route|i-?20|cas|sevis|cpt|opt|stem opt|pgwp|work authorization|work authorisation|work permit|express entry|pnp|permanent residence|permanent resident|sponsor(?:ship)?|admission|application|documents?|checklist|proof of funds|loa|pal|caq|status|eligibility|arrival documents?)\b/i

const TENANCY_LEGAL_RE =
  /\b(?:tenant|tenancy|landlord|lease|eviction|discrimination|fair housing|rights?|deposit dispute|rental dispute)\b/i

/** Max word count for a plausible keyword phrase; longer strings are pasted text. */
const MAX_KEYWORD_WORDS = 8

/**
 * Decode GSC plus-encoding and collapse whitespace so junk heuristics and
 * paraphrase collapse see the same term the human typed.
 */
export function sanitizeDemandTerm(term: string): string {
  return String(term || '')
    .replace(/\+/g, ' ')
    .replace(/%20/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when a term is a file path, URL, email, or CMS path fragment rather
 * than a search keyword (e.g. `rates final.pdf pacific.edu/sites/default/files`).
 * Narrower than isJunkQuery: no word-count or phrasing heuristics, so it is
 * safe to apply to free-form topics and long-but-legitimate queries too.
 */
export function isFileOrUrlLikeTerm(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t) return false
  return (
    FILE_EXT_RE.test(t) ||
    BARE_FILETYPE_RE.test(t) ||
    URL_FRAGMENT_RE.test(t) ||
    EMAIL_RE.test(t) ||
    CMS_USER_RE.test(t)
  )
}

/**
 * True when a real query belongs to an off-mission campus-lifestyle family
 * without an immigration/document/admissions or tenancy/legal anchor.
 *
 * Important: this is intentionally separate from `isJunkQuery`. Raw GSC
 * reporting may still show these terms; action surfaces must use
 * `isActionableDemandQuery` instead.
 */
export function isOffMissionDemandQuery(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t || !CAMPUS_LIFESTYLE_RE.test(t)) return false
  if (MISSION_ANCHOR_RE.test(t)) return false
  if (TENANCY_LEGAL_RE.test(t)) return false
  return true
}

/** A demand term the SEO systems are allowed to turn into an action. */
export function isActionableDemandQuery(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t) return false
  return !isJunkQuery(t) && !isOffMissionDemandQuery(t)
}

/** Generic signal-list guard shared by engine feeders and opportunity loaders. */
export function filterActionableDemandSignals<T extends { term?: unknown }>(signals: T[]): T[] {
  return signals.filter((signal) => isActionableDemandQuery(String(signal.term || '')))
}

/**
 * True when a query string is noise (a filename/URL/pasted blob), not a real
 * keyword. Empty strings are also considered junk.
 */
export function isJunkQuery(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > MAX_KEYWORD_WORDS) return true
  if (isFileOrUrlLikeTerm(t)) return true
  if (BRAND_RE.test(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (MEAL_PLAN_RE.test(t)) return true
  if (FISCAL_HOUSING_RE.test(t) && /\b(?:stk|stockton|pacific|housing|rates|meal)\b/i.test(t)) return true
  if (QUOTED_HOUSING_DOC_RE.test(t)) return true
  // Two or more quoted fragments is a leaked document title + metadata, not a keyword.
  const quoted = t.match(/"[^"]+"/g) || []
  if (quoted.length >= 2) return true
  return false
}

/**
 * Junk/off-mission check for content-job topics / primary keywords (pipeline
 * backstop). Same malformed-input heuristics as `isJunkQuery` EXCEPT the
 * max-word-count rule, plus the actionable-demand boundary: a legitimate
 * long-tail immigration topic remains allowed, while a clean but off-mission
 * campus-lifestyle topic is refused before generation.
 */
export function isJunkTopic(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t) return true
  if (isFileOrUrlLikeTerm(t)) return true
  if (BRAND_RE.test(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (MEAL_PLAN_RE.test(t)) return true
  if (FISCAL_HOUSING_RE.test(t) && /\b(?:stk|stockton|pacific|housing|rates|meal)\b/i.test(t)) return true
  if (QUOTED_HOUSING_DOC_RE.test(t)) return true
  if (isOffMissionDemandQuery(t)) return true
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
 *                 factory play. Callers deciding whether to ACT must also use
 *                 `isActionableDemandQuery` so off-mission real demand stays
 *                 observable without becoming a mission.
 */
export type GscQueryClass = 'eligible' | 'junk' | 'deep_tail'

export function classifyGscQuery(
  term: string,
  row: { impressions: number; position: number; clicks: number },
): GscQueryClass {
  const t = sanitizeDemandTerm(term)
  if (!t) return 'junk'
  if (isJunkQuery(t) || isFileOrUrlLikeTerm(t)) return 'junk'
  const impressions = Math.max(0, row.impressions || 0)
  const position = Math.max(0, row.position || 0)
  const clicks = Math.max(0, row.clicks || 0)
  if (impressions < 10 && position > 20 && clicks === 0) return 'deep_tail'
  return 'eligible'
}
