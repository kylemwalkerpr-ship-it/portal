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

/**
 * Fold case, punctuation and repeated separators for the spaced self-brand
 * rule only. Quotes/punctuation collapse, so `"you safe"`, `You Safe?` and
 * `you-safe` all read as the brand query.
 */
function normalizeSelfBrandView(term: string): string {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Spaced self-brand navigational forms ("you safe", "you safe consultancy",
 * "you safe login", "you safe portal", "you safe consultancy london").
 *
 * GSC reports the estate's own brand both run together (`yousafe`, matched
 * anywhere by BRAND_RE) and spaced — the live opportunities/score response
 * included `you safe`, then `you safe login` / `you safe portal` /
 * `you safe consultancy london`, as actionable opportunities. These are the
 * estate's own navigational self-searches, never demand.
 *
 * The rule is deliberately BOUNDED — the brand phrase (plus the optional word
 * `consultancy`) and then at most two qualifiers from a CLOSED navigational
 * vocabulary. It is never an unbounded `^you safe\b.*`: ordinary prose that
 * merely contains or starts with the words ("you safe to travel on a student
 * visa", "are you safe to travel on a student visa", "is warwick safe for
 * international students") is real search demand and must never be junked by
 * the brand rule.
 */
const SPACED_SELF_BRAND_RE =
  /^you safe(?: consultancy)?(?: (?:log ?in|sign ?in|reviews?|apps?|portals?|contacts?|websites?|sites?|homepages?|official|services?|uk|england|scotland|wales|london))?(?: (?:log ?in|sign ?in|reviews?|apps?|portals?|contacts?|uk|london|official))?$/

function isSpacedSelfBrandTerm(term: string): boolean {
  return SPACED_SELF_BRAND_RE.test(normalizeSelfBrandView(term))
}

/**
 * Shared self-brand junk boundary for the query and topic guards, so the brand
 * rule cannot drift between the GSC read/action surfaces and the content-job
 * backstop.
 */
function isBrandJunkTerm(term: string): boolean {
  return BRAND_RE.test(term) || isSpacedSelfBrandTerm(term)
}

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
 * GSC renders the spaces/dots in leaked filenames as underscores
 * (`fy27_stk_housing_rates`). `_` is a word character, so the `\b`-anchored
 * document-stamp heuristics below silently miss those rows. Fold separators
 * for the stamp heuristics only — the raw term is never rewritten, so raw GSC
 * observations stay intact.
 */
function isHousingStampJunk(term: string): boolean {
  const view = term.replace(/_+/g, ' ')
  if (MEAL_PLAN_RE.test(view)) return true
  if (FISCAL_HOUSING_RE.test(view) && /\b(?:stk|stockton|pacific|housing|rates|meal)\b/i.test(view)) return true
  return QUOTED_HOUSING_DOC_RE.test(view)
}

/**
 * Real search demand that is outside YouSafe's ranking mission when it stands
 * alone. These terms are not malformed "junk": we keep them visible in raw
 * analytics so the team can measure topical pollution. They simply must not
 * become an SEO Factory / Master Engine action unless immigration, document,
 * admissions, or tenancy/legal intent is also present.
 *
 * Covers the housing families AND their daily-life neighbours that leaked into
 * production as `qualified` (student rentals / student living / storage /
 * campus-safety queries such as "is warwick safe for international students").
 *
 * Only BOUNDED lifestyle tokens live here: `student storage` and
 * `self storage`, not bare `storage`; `student rentals`, not bare `rentals`.
 * Bare rent/room/storage are ordinary words in immigration and legal content,
 * so their near-campus forms live in CAMPUS_NEAR_RE instead.
 *
 * `student living` is family only for HOUSING/lodging context: the trailing
 * negative lookahead releases the living-COST family ("student living
 * expenses canada"), which is budgeting/proof-of-funds demand, not campus
 * housing demand.
 *
 * Campus-safety note (`safe for … students?`): the trailing negative
 * lookahead keeps place-safety ("is warwick safe for international students")
 * off-mission while letting activity-safety mission questions ("is it safe for
 * international students to work in the uk / study in canada / travel while on
 * a visa") through. Deliberately NOT solved by adding bare `work` / `study`
 * mission anchors, which are ordinary words in campus-lifestyle demand too.
 */
const CAMPUS_LIFESTYLE_RE =
  /\b(?:student housing|campus housing|housing|housing rates?|dorms?|dormitor(?:y|ies)|residence halls?|halls? of residence|student residences?|residence life|homestays?|roommates?|housemates?|flatshares?|meal plans?|dining plans?|campus dining|parking|student neighborhoods?|student neighbourhoods?|campus life|student life|student living(?!\s+(?:costs?|expenses?|budgets?|prices?|affordability|fees?))|commute|accommodation|apartments?|student rentals?|rent ranges?|student storage|self[-\s]?storage|(?:campus|student|university|college)\s+saf(?:e|ety)|safe\s+for\s+(?:international\s+|college\s+|university\s+)?students?\b(?!\s+to\b))\b/i

/**
 * Bounded campus-proximity variants.
 *
 * Bare `rent` / `room` / `rental` / `storage` are ordinary words in
 * immigration and tenancy content, so they are NOT universal family tokens.
 * Only an explicit near-campus frame ("student rent near university", "rooms
 * near university campus") identifies campus-lifestyle demand.
 */
const CAMPUS_NEAR_RE =
  /\b(?:rent|rents|rentals?|rooms?|apartments?|studios?|storage|housing)\s+(?:near|by|around|close to|next to|across from)\s+(?:a\s+|an\s+|the\s+|my\s+|our\s+)?(?:university|campuses|campus|college|school|dorms?|dormitor(?:y|ies))\b/i

/**
 * Topical YouSafe anchors — immigration, visa, F-1/I-20/SEVIS/CAS, study-or-
 * work permit, PGWP/OPT/CPT, Express Entry/PNP, permanent residence,
 * sponsorship, proof of funds, university admission as such, or tenancy-legal
 * rights (see TENANCY_LEGAL_RE).
 *
 * Deliberately EXCLUDES the generic process nouns that used to launder
 * off-mission campus demand into the mission: bare `permit`, `application`,
 * `status`, `documents`, `checklist`, `eligibility`. They describe HOW campus
 * housing / dining / parking demand is processed, not YouSafe intent —
 * "student housing application", "dorm application deadline", "meal plan
 * status", "student housing eligibility requirements", "university dorm move
 * in checklist", "student apartments application" and "parking permit
 * application" are all off-mission unless a genuinely topical anchor above is
 * present alongside them ("f-1 student housing proof of address").
 *
 * Bare `opt` is deliberately NOT an anchor either (it is the English verb in
 * "meal plan opt out"). Only the unambiguous immigration-status phrase `on
 * OPT` qualifies ("is it safe for international students on opt") — and it must
 * reject a following opt-out / opt-in form ("meal plan information on opt out",
 * "student housing details on opt-in"), which is the same ordinary English verb
 * the bare-`opt` exclusion above is about. The trailing lookahead only accepts
 * whitespace/hyphens between `on opt` and the rejected word, so `opt` cannot
 * leak back in as a generic anchor.
 */
const MISSION_ANCHOR_RE =
  /\b(?:visa|immigration|f-?1|i-?20|sevis|cas|student route|(?:study|work|student|graduate|post-?graduation|residence|temporary resident)\s+permit|pgwp|post-?graduation work permit|work authorization|work authorisation|cpt|curricular practical training|stem opt|optional practical training|on\s+opt\b(?![\s-]*(?:out|in)\b)|express entry|pnp|permanent residen(?:ce|t)|sponsor(?:ship)?|admission(?:s)?|proof of funds|loa|pal|caq|arrival documents?)\b/i

/**
 * Tenancy/legal intent, including the narrow instrument phrases that must
 * survive the campus-lifestyle family: `rent/rental/lease/tenancy/occupancy
 * agreement` and `security/rental/rent/lease/damage/holding deposit`.
 */
const TENANCY_LEGAL_RE =
  /\b(?:tenant|tenancy|landlord|lease|eviction|discrimination|fair housing|rights?|deposit dispute|rental dispute|(?:rent|rental|lease|tenancy|occupancy)\s+agreements?|(?:security|rental|rent|lease|damage|holding)\s+deposits?)\b/i

/** Max word count for a plausible keyword phrase; longer strings are pasted text. */
const MAX_KEYWORD_WORDS = 8

/**
 * Mission-safety questions — the one narrow exemption from the pasted-text
 * word-count guard.
 *
 * Natural long-tail questions such as "is it safe for international students
 * to work in the uk" (11 words) are genuine demand: they satisfy the
 * campus-safety ACTIVITY exception (`safe for … students to <mission
 * activity>`) or carry explicit immigration/visa context inside a safety
 * question ("are you safe to travel on a student visa"). Both are longer than
 * MAX_KEYWORD_WORDS, so they were being junked as pasted text.
 *
 * The exemption needs BOTH the word `safe(ty)` and one of those two mission
 * shapes, so the guard stays intact for real pasted blobs — a long blob, a
 * quoted document title, or a long non-safety query ("how to apply for a uk
 * spouse visa step by step guide") is still junk. Does NOT remove or raise
 * MAX_KEYWORD_WORDS.
 */
const SAFETY_QUESTION_RE = /\bsafe(?:ty)?\b/i

const MISSION_SAFETY_ACTIVITY_RE =
  /\bsafe(?:ty)?\b[^?!.]{0,60}?\bfor\s+(?:international\s+|college\s+|university\s+|overseas\s+|foreign\s+)?students?\s+to\s+(?:work|study|travel|volunteer|intern|move|live|stay|arrive|leave|return|earn)\b/i

function isMissionSafetyPhrase(term: string): boolean {
  if (!SAFETY_QUESTION_RE.test(term)) return false
  if (MISSION_SAFETY_ACTIVITY_RE.test(term)) return true
  // Explicit immigration context inside the same safety question.
  return MISSION_ANCHOR_RE.test(term)
}

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
  if (!t) return false
  if (!CAMPUS_LIFESTYLE_RE.test(t) && !CAMPUS_NEAR_RE.test(t)) return false
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
 *
 * The >MAX_KEYWORD_WORDS pasted-text guard is intact EXCEPT for the narrow
 * mission-safety questions described at `isMissionSafetyPhrase`.
 */
export function isJunkQuery(term: string): boolean {
  const t = sanitizeDemandTerm(term)
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > MAX_KEYWORD_WORDS && !isMissionSafetyPhrase(t)) return true
  if (isFileOrUrlLikeTerm(t)) return true
  if (isBrandJunkTerm(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (isHousingStampJunk(t)) return true
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
  if (isBrandJunkTerm(t)) return true
  if (PURE_NUMERIC_RE.test(t)) return true
  if (ISSUED_BY_RE.test(t)) return true
  if (QUOTED_DATE_RE.test(t)) return true
  if (isHousingStampJunk(t)) return true
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

/**
 * P1 measurement integrity — four-bucket visibility class for persisted GSC
 * rows.
 *
 * `classifyGscQuery` above keeps its shipped 3-class contract (`eligible` =
 * pre-qualification, so off-mission real demand still reads as "eligible" for
 * legacy callers). This is the stricter, action-facing split:
 *
 * - `junk`       — malformed input (PDF/URL/brand/stamp leftovers). Never
 *                  counted as demand, never actioned.
 * - `off_mission`— REAL search demand outside the YouSafe mission (campus
 *                  housing / lifestyle / parking with no immigration,
 *                  document, admissions or tenancy-legal anchor). Stays
 *                  observable so topical pollution is measurable, but is
 *                  never actionable.
 * - `deep_tail`  — on-mission query with negligible signal.
 * - `qualified`  — on-mission, signal-bearing. The ONLY bucket allowed to
 *                  drive strike distance, plays, demand scoring or SERP action.
 *
 * Precedence is deliberately `junk -> off_mission -> deep_tail -> qualified`:
 * malformed input wins (a leaked document title stays junk), and topical
 * off-mission-ness is a fact about the term — not a signal-strength fact — so
 * it can never be laundered into the deep tail.
 */
export type GscVisibilityClass = 'junk' | 'off_mission' | 'deep_tail' | 'qualified'

export function classifyGscVisibility(
  term: string,
  row: { impressions: number; position: number; clicks: number },
): GscVisibilityClass {
  const t = sanitizeDemandTerm(term)
  if (!t || isJunkQuery(t) || isFileOrUrlLikeTerm(t)) return 'junk'
  if (isOffMissionDemandQuery(t)) return 'off_mission'
  if (classifyGscQuery(t, row) === 'deep_tail') return 'deep_tail'
  return 'qualified'
}


/**
 * Metric-aware action boundary for persisted/live GSC rows. Unlike the generic
 * semantic `isActionableDemandQuery` guard, this also excludes on-mission
 * `deep_tail` observations. Only the four-class `qualified` bucket may drive a
 * GSC-derived action, score, opportunity, or writer brief.
 */
export function isQualifiedGscDemandQuery(
  term: string,
  row: { impressions: number; position: number; clicks: number },
): boolean {
  return classifyGscVisibility(term, row) === 'qualified'
}
