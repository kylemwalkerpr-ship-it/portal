/**
 * Estate ownership resolver — SEO strategies registry is source of truth.
 *
 * Source of truth:
 *   Documents/GitHub/SEO strategies/ownership-registry-v1.csv
 *   → public/seo-data/ownership-registry.json (runtime asset)
 *   → OWNERSHIP_REGISTRY.md standing rules
 *
 * Standing rules:
 *   1. Canonical long-form / legal_guide / article → caseworks (legal host)
 *   2. Geo "from {country}" → regional /from/ on usa|uk|ca|au (yousafe-consultancy)
 *   3. University / regional guides → usa|uk|ca|au content trees
 *   4. Blog post → apex yousafe-consultancy /blog/ only (never caseworks)
 *   5. Transactional → market (portal), supply_first when blocked
 *   6. Hubs own cluster nav; spokes own long-tail procedure
 *
 * Repo map (never invent hosts outside this table):
 *   legal → caseworks
 *   usa|uk|ca|au|apex → yousafe-consultancy
 *   market → portal
 */

import { loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import { matchStrikeSeed } from './strikeSeeds'

export type OwnerHost = 'legal' | 'usa' | 'ca' | 'uk' | 'au' | 'apex' | 'market'
export type IntentClass =
  | 'procedural'
  | 'checklist'
  | 'geo_modifier'
  | 'university_modifier'
  | 'comparison'
  | 'transactional'
  | 'brand'
  | 'news_summary'
  | 'hub'

export type ContentRepo = 'caseworks' | 'yousafe-consultancy' | 'portal'

export interface OwnershipRow {
  id: number
  primary_keyword: string
  intent_class: IntentClass | string
  owner_host: OwnerHost | string
  owner_url: string
  supporting_urls: string[]
  action: string
  market_destination: string | null
  status: string
  notes: string
}

export interface OwnerPlan {
  matched: OwnershipRow | null
  matchScore: number
  host: OwnerHost
  repo: ContentRepo
  /** Repo-relative file path to write */
  filePath: string
  /** Public URL after deploy */
  canonicalUrl: string
  indexable: boolean
  action: string
  intentClass: string
  /**
   * Final content type after path/host reconciliation.
   * Always trust this over the caller's input type when shipping.
   */
  contentType: string
  warnings: string[]
  blockers: string[]
  ymy: boolean
  /** How routing was decided */
  routingSource: 'registry_owner_url' | 'registry_host' | 'standing_rules' | 'content_type_default' | 'strike_seed'
}

/**
 * Align content type + intent with the resolved host/path.
 *
 * Prevents the War Room / GSC bug where title_ctr_rewrite forced legal_guide
 * onto usa/content/universities/* (1800-word legal floor + ship-gate host mismatch).
 */
export function reconcileContentTypeWithPath(opts: {
  contentType: string
  filePath: string
  host: OwnerHost
  intentClass?: string
}): { contentType: string; intentClass: string } {
  const p = (opts.filePath || '').replace(/^\/+/, '')
  let contentType = (opts.contentType || 'legal_guide').toLowerCase()
  let intentClass = opts.intentClass || 'procedural'

  if (/content\/universities\//.test(p) || /\/universities\//.test(p)) {
    return { contentType: 'regional_university', intentClass: 'university_modifier' }
  }
  if (/content\/from\//.test(p) || /(^|\/)from\//.test(p)) {
    return { contentType: 'regional_from', intentClass: 'geo_modifier' }
  }
  if (/content\/blog\//.test(p) || /app\/blog\//.test(p)) {
    const kind = contentType === 'blog_post' ? 'blog_post' : 'blog_summary'
    return { contentType: kind, intentClass: 'news_summary' }
  }
  if (opts.host === 'market' || /^catalogue\//.test(p)) {
    return { contentType: 'marketplace_gig', intentClass: 'transactional' }
  }
  // Regional hosts must never ship legal_guide (caseworks-only contract)
  if (
    (opts.host === 'usa' ||
      opts.host === 'uk' ||
      opts.host === 'ca' ||
      opts.host === 'au' ||
      opts.host === 'apex') &&
    (contentType === 'legal_guide' || contentType === 'article')
  ) {
    return { contentType: 'regional_page', intentClass: intentClass === 'procedural' ? 'hub' : intentClass }
  }
  // Legal host + regional types: keep the legal canonical. Explicit blog_post
  // is never coerced — blogs belong on apex even if a stale path says caseworks.
  if (opts.host === 'legal' && /^app\//.test(p) && !/^app\/blog\//.test(p)) {
    if (
      contentType === 'regional_university' ||
      contentType === 'regional_from' ||
      contentType === 'regional_page'
    ) {
      return { contentType: 'legal_guide', intentClass: 'procedural' }
    }
  }
  // A legal owner URL is authoritative for explicit cluster overrides. Reconcile
  // the destination type before resolving the final host/repo so a blog_post
  // cannot leave the apex route when ownerUrlHint names a legal page.
  return { contentType, intentClass }
}

/** Host → GitHub repo (immutable estate contract). */
export const HOST_REPO: Record<OwnerHost, ContentRepo> = {
  legal: 'caseworks',
  apex: 'yousafe-consultancy',
  usa: 'yousafe-consultancy',
  uk: 'yousafe-consultancy',
  ca: 'yousafe-consultancy',
  au: 'yousafe-consultancy',
  market: 'portal',
}

export const HOST_PUBLIC: Record<OwnerHost, string> = {
  legal: 'https://legal.yousafeconsultancy.com',
  apex: 'https://yousafeconsultancy.com',
  usa: 'https://usa.yousafeconsultancy.com',
  uk: 'https://uk.yousafeconsultancy.com',
  ca: 'https://ca.yousafeconsultancy.com',
  au: 'https://au.yousafeconsultancy.com',
  market: 'https://market.yousafeconsultancy.com',
}

/** Collapse `https://host//path` so CS never ships Ahrefs "Double slash in URL". */
export function sanitizeOwnerUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return raw
  try {
    const u = new URL(raw)
    u.pathname = u.pathname.replace(/\/{2,}/g, '/')
    if (u.pathname.length > 1 && !u.pathname.endsWith('/')) u.pathname += '/'
    return u.toString()
  } catch {
    return raw.replace(/([^:]\/)\/+/g, '$1')
  }
}

const HOST_FROM_HOSTNAME: Record<string, OwnerHost> = {
  'legal.yousafeconsultancy.com': 'legal',
  'usa.yousafeconsultancy.com': 'usa',
  'uk.yousafeconsultancy.com': 'uk',
  'ca.yousafeconsultancy.com': 'ca',
  'au.yousafeconsultancy.com': 'au',
  'yousafeconsultancy.com': 'apex',
  'www.yousafeconsultancy.com': 'apex',
  'market.yousafeconsultancy.com': 'market',
  'portal.yousafeconsultancy.com': 'market',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Visa/immigration route subtypes — the distinguishing subject of a page. */
export const ROUTE_SUBTYPES_RE =
  /\b(graduate|post.?study|psw|spouse|fianc|partner|dependent|dependant|child|student|visitor|tourist|ancestry|family|parent|carer|innovator|founder|start.?up|global.?talent|health.?care|skilled.?worker|care.?worker)\b/i

/** British spelling variants that must not read as a different route subtype. */
const ROUTE_SUBTYPE_SPELLING: Record<string, string> = {
  dependant: 'dependent',
}

/**
 * City / university / state / province modifiers that make a keyword
 * geographically specific. Region-level markers (us/uk/ca/au) are deliberately
 * NOT here — regionMismatchPenalty handles those. Housing/tenant keywords are
 * also handled separately (they stay on legal).
 *
 * 2026-08 incident: "boulder student visas" / "boulder f-1 visa" (university
 * modifiers) matched the generic "us student visas hub" row — both carry the
 * "student" route subtype — and overwrote the hub + f1-rejection-recovery with
 * Boulder-specific content. A keyword carrying a geo/university modifier must
 * NEVER resolve to a generic route/hub row that lacks that modifier.
 */
const GEO_UNIVERSITY_TOKENS =
  'university|universities|college|campus|downtown|' +
  // universities with caseworks/regional pages or registry rows
  'cornell|auburn|kansas state|utah|creighton|american university|king\'s college|' +
  'washington|nyu|mit|harvard|stanford|ucla|berkeley|' +
  'asu|arizona state|' +
  // cities (estate + majors)
  'boulder|austin|boston|seattle|omaha|atlanta|chicago|dallas|denver|houston|' +
  'los angeles|miami|new york|phoenix|portland|san diego|san francisco|' +
  'london|manchester|edinburgh|toronto|vancouver|melbourne|sydney|brisbane|' +
  // US states + DC + CA provinces
  'alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|' +
  'florida|georgia|hawaii|idaho|illinois|indiana|iowa|kentucky|louisiana|' +
  'maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|' +
  'montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|' +
  'north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|' +
  'south dakota|tennessee|texas|vermont|virginia|washington dc|west virginia|' +
  'wisconsin|wyoming|ontario|british columbia|alberta|quebec'

/** Regex over all geo/university modifiers (case-insensitive). */
export const GEO_MODIFIER_RE = new RegExp(
  '\\b(?:' + GEO_UNIVERSITY_TOKENS + '|university of [a-z-]+)\\b',
  'i',
)

/** All distinct geo/university modifiers present in a subject string. */
export function extractGeoModifiers(text: string): string[] {
  const seen = new Set<string>()
  const re = new RegExp(GEO_MODIFIER_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    seen.add(m[0].toLowerCase().replace(/\s+/g, ' ').trim())
  }
  return [...seen]
}

/**
 * USCIS Form I-485 (Adjustment of Status) — must never be read as AU Temporary
 * Graduate subclass 485. Hyphen→space normalization ("i-485" → "i 485") used to
 * trip a bare \b485\b match and block / mis-route US AOS ships.
 */
export function isUsFormI485(text: string): boolean {
  const raw = String(text || '')
  const spaced = raw.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (/(?:^|\b)(?:form\s+)?i\s*485\b/.test(spaced)) return true
  // glued forms: form-i485 / i485 / formi485
  if (/(?:^|[^a-z0-9])(?:form)?i485\b/i.test(raw.replace(/[-_\s]+/g, ''))) return true
  if (/\b485\b/.test(spaced) && /\badjustment of status\b/.test(spaced)) return true
  return false
}

/** True when text refers to AU Temporary Graduate / subclass 485 (not US Form I-485). */
export function isAuSubclass485(text: string): boolean {
  if (isUsFormI485(text)) return false
  const spaced = String(text || '').toLowerCase().replace(/[-_]+/g, ' ')
  return /\b485\b/.test(spaced) || /\bsubclass\s*485\b/.test(spaced)
}

/** All distinct, normalized route subtypes present in a subject string. */
export function extractRouteSubtypes(text: string): string[] {
  const seen = new Set<string>()
  const re = new RegExp(ROUTE_SUBTYPES_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    let norm = m[0].toLowerCase().replace(/[^a-z]/g, '')
    norm = ROUTE_SUBTYPE_SPELLING[norm] || norm
    if (norm) seen.add(norm)
  }
  // AU subclass 485 is the Temporary Graduate visa — map the bare number to the
  // "graduate" route subtype so a "485 visa" keyword matches graduate-485 pages
  // (never the English-requirements-student page). US Form I-485 (Adjustment of
  // Status) — including after hyphen→space ("i 485") — is NOT a graduate route.
  if (isAuSubclass485(text || '')) seen.add('graduate')
  return [...seen]
}

/**
 * Detect when two keywords describe fundamentally different subjects
 * even though they share words (e.g. "stem occupations list" vs "document checklist").
 *
 * Checks BOTH directions:
 *   1) Keyword has a topical signal the registry entry lacks.
 *   2) Registry entry has a topical signal the keyword lacks.
 *
 * Returns a penalty 0–60 that reduces raw match scores below the 45 threshold
 * when subject mismatch is confirmed.
 */
function intentMismatchPenalty(keyword: string, primary: string): number {
  const kw = keyword.toLowerCase().trim()
  const pr = primary.toLowerCase().trim()
  let penalty = 0

  // ── Direction A: keyword has subject NOT in registry entry ────────────────
  // e.g. kw="stem occupations list" vs pr="document checklist" → kw has "stem"
  if (/stem|category.*occupation|stem.*occupation/i.test(kw) && !/stem/i.test(pr)) {
    penalty += 40
  }
  if (/timeline|processing.*time|how long/i.test(kw) && !/timeline|processing.*time/i.test(pr)) {
    penalty += 40
  }
  if (/fee|cost|price|payment/i.test(kw) && !/fee|cost/i.test(pr)) {
    penalty += 40
  }

  // ── Direction B: registry entry has concrete page type NOT in keyword ─────
  // e.g. pr="express entry document checklist" vs kw="stem category occupations list"
  //      → pr has "checklist" but kw does not
  const concretePageTypes = /checklist|handbook|form|instructions|timeline/i
  const kwConcrete = kw.match(concretePageTypes)
  const prConcrete = pr.match(concretePageTypes)
  if (prConcrete && !kwConcrete) {
    // Registry is a concrete document type but keyword asks about something else
    penalty += 40
  }
  // Both match concrete types but different ones → likely different pages
  if (kwConcrete && prConcrete && kwConcrete[0] !== prConcrete[0]) {
    penalty += 40
  }

  // ── Direction C: requirement/eligibility mismatch ─────────────────────────
  if (/requirement|eligibility|qualify/i.test(pr) && !/requirement|eligibility|qualify/i.test(kw)) {
    penalty += 35
  }
  if (/requirement|eligibility|qualify/i.test(kw) && !/requirement|eligibility|qualify/i.test(pr)) {
    penalty += 35
  }

  // ── Direction D: distinct visa route subtypes ──────────────────────────────
  // 2026-08 incident: "uk graduate visa requirements" matched "uk dependent visa
  // child requirements" (score ≥45) and shipped onto the spouse-visa-document-
  // checklist page. They share only generic words (uk/visa/requirements); the
  // route subtype is the real subject. When both sides carry a DIFFERENT route
  // subtype (graduate ≠ spouse ≠ dependent ≠ child ≠ student …), hard-penalize so
  // the match falls back to standing rules instead of a wrong canonical.
  //
  // 2026-08-19 companion: "asu visa requirements" has NO route subtype, so the
  // both-sides check was a no-op, Jaccard hit exactly 45, and ASU F-1 copy
  // landed on /uk/immigration/uk-dependent-visa-child-requirements-2026/.
  // A registry row that names a specific route must not match a keyword that
  // never mentions that route.
  const UMBRELLA = new Set(['family'])
  const kwRs = extractRouteSubtypes(kw).filter((x) => !UMBRELLA.has(x))
  const prRs = extractRouteSubtypes(pr).filter((x) => !UMBRELLA.has(x))
  if (kwRs.length && prRs.length && !kwRs.some((x) => prRs.includes(x))) {
    penalty += 55
  } else if (!kwRs.length && prRs.length) {
    penalty += 55
  }

  return Math.min(60, penalty)
}

/**
 * Hard-separate geo/university-modifier keywords from generic route/hub rows
 * that share the same route subtype (2026-08 "boulder student visas" → the
 * "us student visas hub" row — both read "student", so intentMismatchPenalty
 * alone can't stop the match).
 *
 * Rules (symmetric):
 *   - keyword geo-specific, row generic            → +55 (hard block → standing rules)
 *   - keyword generic, row geo-specific            → +40
 *   - both geo-specific but different scopes       → +55 (austin ≠ boston)
 *   - both carry the SAME modifier                 → 0  (legit university-row match)
 */
function geoScopeMismatchPenalty(keyword: string, primary: string): number {
  const kwG = extractGeoModifiers(keyword)
  const prG = extractGeoModifiers(primary)
  if (kwG.length && !prG.length) return 55
  if (!kwG.length && prG.length) return 40
  if (kwG.length && prG.length) {
    return kwG.some((x) => prG.includes(x)) ? 0 : 55
  }
  return 0
}

/** Penalize registry rows when keyword region conflicts with entry region signals. */
function regionMismatchPenalty(keyword: string, primary: string, ownerUrl?: string): number {
  const kw = keyword.toLowerCase()
  const pr = (primary + ' ' + (ownerUrl || '')).toLowerCase()
  const kwCa = /\bcanada|canadian|ircc|pgwp|express entry\b/.test(kw)
  const kwUk = /\buk\b|british|ukvi|ilr|appendix fm|skilled worker\b/.test(kw)
  const kwUs = /\b(us|usa|f-1|f1|opt|uscis|sevis|asu|arizona state|i-?485|adjustment of status)\b/.test(kw) || isUsFormI485(kw)
  const kwAu = (/\b(australia|subclass|home affairs|pte)\b/.test(kw) || isAuSubclass485(kw))
  const prCa = /\bcanada|canadian|ircc|\/ca\/|ca\.yousafe/.test(pr)
  const prUk = /\buk\b|british|ukvi|\/uk\/|uk\.yousafe|gov\.uk/.test(pr)
  const prUs = /\b(us|usa|f-1|opt|\/us\/|usa\.yousafe|uscis|i-?485|adjustment of status)\b/.test(pr) || isUsFormI485(pr)
  const prAu = (/\b(australia|\/au\/|au\.yousafe|homeaffairs)\b/.test(pr) || isAuSubclass485(pr))

  if (kwCa && prUk && !prCa) return 55
  if (kwCa && prUs && !prCa) return 55
  if (kwCa && prAu && !prCa) return 55
  if (kwUk && prCa && !prUk) return 55
  if (kwUk && prUs && !prUk) return 55
  if (kwUs && prUk && !prUs) return 55
  if (kwUs && prCa && !prUs) return 45
  if (kwAu && !prAu && (prCa || prUk || prUs)) return 55
  // Housing vs visa subject clash (austin student visa ≠ renting austin)
  if (/\bvisa\b/.test(kw) && /rent|tenant|housing|lease/.test(pr) && !/visa|immigration|f-1|opt/.test(pr)) {
    return 50
  }
  return 0
}

function scoreMatch(keyword: string, primary: string, ownerUrl?: string): number {
  const a = normalize(keyword)
  const b = normalize(primary)
  if (!a || !b) return 0
  const regionPen = regionMismatchPenalty(keyword, primary, ownerUrl)
  if (a === b) return Math.max(0, 100 - regionPen)
  // phrase containment
  if (a.includes(b) || b.includes(a)) {
    // Even when one phrase contains the other, check for intent mismatch
    const ip =
      intentMismatchPenalty(keyword, primary) +
      regionPen +
      geoScopeMismatchPenalty(keyword, primary)
    if (ip >= 40) {
      // Strong penalty — the keywords share words but describe fundamentally different things
      // e.g. "stem category occupations list" matches "document checklist" on "express entry" only
      // Reduce to mid-range so standing rules can pick a better default
      return Math.round(85 * (1 - Math.min(ip, 90) / 100))
    }
    return Math.max(0, 85 - regionPen)
  }
  const aw = a.split(' ').filter((w) => w.length > 2)
  const bw = b.split(' ').filter((w) => w.length > 2)
  if (!aw.length || !bw.length) return 0
  const aset = new Set(aw)
  const overlap = bw.filter((w) => aset.has(w)).length
  if (overlap === 0) return 0
  // Jaccard-ish
  const union = new Set([...aw, ...bw]).size
  const j = overlap / union
  const coverage = overlap / bw.length
  let raw = Math.round(Math.max(j, coverage) * 90)
  // Apply intent + region + geo-scope mismatch penalties
  const ip =
    intentMismatchPenalty(keyword, primary) +
    regionPen +
    geoScopeMismatchPenalty(keyword, primary)
  if (ip > 0) {
    raw = Math.round(raw * (1 - Math.min(ip, 90) / 100))
  }
  return Math.max(0, raw)
}

/** Derive owner host from absolute URL hostname (authoritative when present). */
export function hostFromUrl(url: string | null | undefined): OwnerHost | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return HOST_FROM_HOSTNAME[host] || HOST_FROM_HOSTNAME[u.hostname] || null
  } catch {
    return null
  }
}

/**
 * Map a public owner URL → repo-relative file path for the correct monorepo.
 * Paths mirror live estate layout (caseworks app/*, consultancy {region}/content/*).
 */
export function filePathFromOwnerUrl(
  ownerUrl: string,
  host: OwnerHost,
): { filePath: string; urlPath: string } | null {
  let u: URL
  try {
    u = new URL(ownerUrl)
  } catch {
    return null
  }
  let path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  if (path !== '/') path = path.replace(/\/+$/, '')
  const urlPath = path.endsWith('/') ? path : `${path}/`
  const segments = path.split('/').filter(Boolean)

  if (host === 'legal') {
    // caseworks: /us/foo → app/us/foo/page.tsx
    if (segments.length === 0) {
      return { filePath: 'app/page.tsx', urlPath: '/' }
    }
    // guide dynamic may use [slug] but static dirs exist for many guides
    return {
      filePath: `app/${segments.join('/')}/page.tsx`,
      urlPath,
    }
  }

  if (host === 'market') {
    if (segments[0] === 'gigs' && segments[1]) {
      return { filePath: `catalogue/${segments[1]}.mdx`, urlPath }
    }
    if (segments[0] === 'categories' && segments[1]) {
      return { filePath: `catalogue/categories/${segments[1]}.mdx`, urlPath }
    }
    return {
      filePath: `catalogue/${slugify(segments.join('-') || 'gig')}.mdx`,
      urlPath,
    }
  }

  // Regional / apex (yousafe-consultancy monorepo)
  const app =
    host === 'apex' ? 'landing-page' : host === 'usa' ? 'usa' : host

  if (segments[0] === 'from' && segments[1]) {
    return {
      filePath: `${app}/content/from/${segments[1]}.md`,
      urlPath,
    }
  }
  if (segments[0] === 'universities' && segments[1]) {
    return {
      filePath: `${app}/content/universities/${segments[1]}.md`,
      urlPath,
    }
  }
  if (segments[0] === 'blog' && segments[1]) {
    // Apex blogs deploy as static pages (landing-page/app/blog/<slug>/page.tsx)
    // — the established yousafe-consultancy blog precedence. Regional hosts
    // keep the markdown content/blog/<slug>.md format.
    if (host === 'apex') {
      return {
        filePath: `${app}/app/blog/${segments[1]}/page.tsx`,
        urlPath,
      }
    }
    return {
      filePath: `${app}/content/blog/${segments[1]}.md`,
      urlPath,
    }
  }
  if (segments.length === 0) {
    return { filePath: `${app}/content/index.md`, urlPath: '/' }
  }
  return {
    filePath: `${app}/content/${segments.join('/')}.md`,
    urlPath,
  }
}

/**
 * Standing-rules fallback when no registry row matches.
 * Never routes YMYL procedure to regional or market by accident.
 */
export function standingRulesHost(opts: {
  primaryKeyword: string
  contentType: string
  region: string
  intentHint?: string
}): { host: OwnerHost; contentType: string; reason: string } {
  const kw = normalize(opts.primaryKeyword)
  const region = opts.region.toUpperCase()
  let contentType = opts.contentType

  // Transactional / marketplace — the studio NEVER ships marketplace content.
  // Marketplace pages are fed exclusively by service providers from their
  // dashboard. The studio routes transactional intent to a blog summary on
  // legal (YMYL-supervised) or the best-fit regional host so the funnel
  // naturally leads readers to the marketplace without creating gig pages.
  if (
    contentType === 'marketplace_gig' ||
    /hire|marketplace|gig|attorney near me|consultant fee/i.test(kw)
  ) {
    // Route transactional intent to a blog on the most relevant host.
    // The article will include CTA links to the marketplace — it does not
    // create marketplace catalogue entries.
    if (/uk|british|student route|ukvi/i.test(kw) || region === 'UK') {
      return { host: 'apex', contentType: 'blog_post', reason: 'transactional how-to → apex /blog (never marketplace)' }
    }
    if (/canada|study permit|pgwp|ircc/i.test(kw) || region === 'CA') {
      return { host: 'apex', contentType: 'blog_post', reason: 'transactional how-to → apex /blog (never marketplace)' }
    }
    if (/australia|subclass/i.test(kw) || isAuSubclass485(kw) || region === 'AU') {
      return { host: 'apex', contentType: 'blog_post', reason: 'transactional how-to → apex /blog (never marketplace)' }
    }
    return { host: 'apex', contentType: 'blog_post', reason: 'transactional how-to → apex /blog (never marketplace catalogue)' }
  }

  // Geo from-country
  if (
    contentType === 'regional_from' ||
    /\bfrom (nigeria|india|kenya|ghana|pakistan|bangladesh|china|philippines|sri lanka|uae|united arab)\b/i.test(
      kw,
    ) ||
    /\bvisa from\b/i.test(kw)
  ) {
    let host: OwnerHost = 'usa'
    if (/uk|british|student route/i.test(kw) || region === 'UK') host = 'uk'
    else if (/canada|study permit|pgwp|ircc/i.test(kw) || region === 'CA') host = 'ca'
    else if (/australia|subclass/i.test(kw) || isAuSubclass485(kw) || region === 'AU') host = 'au'
    else if (region === 'US') host = 'usa'
    return { host, contentType: 'regional_from', reason: 'geo_modifier from-country → regional' }
  }

  // University / geo modifier → regional campus graph (strategy default).
  // Curated city/state/university tokens included so "boulder student visas"
  // (a university modifier that shares the "student" route subtype with the
  // legal student-visas hub) can never fall back to the generic hub — it gets
  // a dedicated regional universities entry. Housing/tenant keywords are
  // excluded (they stay on legal, matching the estate's renting-* pages).
  if (
    contentType === 'regional_university' ||
    (GEO_MODIFIER_RE.test(kw) && !/housing|tenant|rent/i.test(kw))
  ) {
    let host: OwnerHost = 'usa'
    if (/uk|london|kcl|ucl|manchester|edinburgh/i.test(kw) || region === 'UK') host = 'uk'
    else if (/canada|toronto|ubc|mcgill/i.test(kw) || region === 'CA') host = 'ca'
    else if (/australia|melbourne|sydney|monash/i.test(kw) || region === 'AU') host = 'au'
    return {
      host,
      contentType: 'regional_university',
      reason: 'university/geo modifier → regional universities graph',
    }
  }

  // Housing guides often stay legal (many are legal/guide/*)
  if (/housing|tenant|renters? rights|section 21|deposit dispute/i.test(kw)) {
    return { host: 'legal', contentType: contentType || 'legal_guide', reason: 'housing/tenant rights → legal' }
  }

  // Blog — the studio's Blog Post (blog_post) always deploys to the apex
  // yousafe-consultancy blog (https://yousafeconsultancy.com/blog/<slug>/),
  // whose page format is the established precedent. News-style blog_summary
  // keeps the soft-regional / legal behavior below.
  if (contentType === 'blog_post') {
    return { host: 'apex', contentType: 'blog_post', reason: 'blog_post → apex yousafe-consultancy /blog/' }
  }
  if (contentType === 'blog_summary' || /news|update 2026|overview/i.test(kw)) {
    // Soft regional blog only when keyword is clearly geo-local and non-procedural.
    // Visa/permit "blogs" used to fall through to caseworks app/blog — the
    // estate blog lives on the apex landing page.
    if (
      contentType === 'blog_summary' &&
      !/visa|permit|uscis|ukvi|ircc|opt|h-1b|i-\d+/i.test(kw) &&
      (region === 'UK' || region === 'CA' || region === 'AU' || region === 'US')
    ) {
      const host: OwnerHost =
        region === 'UK' ? 'uk' : region === 'CA' ? 'ca' : region === 'AU' ? 'au' : 'usa'
      return {
        host,
        contentType: 'blog_summary',
        reason: `regional news-style blog → ${host}/content/blog`,
      }
    }
    return { host: 'apex', contentType: contentType || 'blog_post', reason: 'blog → apex yousafe-consultancy /blog/' }
  }

  // Cross-country compare
  if (contentType === 'regional_page' && region === 'COMPARE') {
    return { host: 'legal', contentType: 'legal_guide', reason: 'comparison → legal/compare' }
  }

  // Explicit regional landing (non-YMYL soft pages)
  if (contentType === 'regional_page') {
    const r = region.toLowerCase()
    if (r === 'us') return { host: 'usa', contentType, reason: 'regional_page US → usa' }
    if (r === 'uk') return { host: 'uk', contentType, reason: 'regional_page UK → uk' }
    if (r === 'ca') return { host: 'ca', contentType, reason: 'regional_page CA → ca' }
    if (r === 'au') return { host: 'au', contentType, reason: 'regional_page AU → au' }
    return { host: 'apex', contentType, reason: 'regional_page default → apex' }
  }

  // Default YMYL / procedural / checklist → legal (caseworks)
  return {
    host: 'legal',
    contentType: contentType === 'article' ? 'legal_guide' : contentType || 'legal_guide',
    reason: 'procedural/YMYL default → legal (caseworks)',
  }
}

function pathForHostFallback(
  host: OwnerHost,
  region: string,
  slug: string,
  contentType: string,
): { filePath: string; urlPath: string } {
  const reg = region.toLowerCase() === 'compare' ? 'us' : region.toLowerCase()

  if (host === 'legal') {
    if (contentType === 'blog_post' || contentType === 'blog_summary') {
      return { filePath: `app/blog/${slug}/page.tsx`, urlPath: `/blog/${slug}/` }
    }
    // Prefer region tree matching keyword region
    return { filePath: `app/${reg}/${slug}/page.tsx`, urlPath: `/${reg}/${slug}/` }
  }

  if (host === 'market') {
    return { filePath: `catalogue/${slug}.mdx`, urlPath: `/marketplace/gigs/${slug}/` }
  }

  const app = host === 'apex' ? 'landing-page' : host === 'usa' ? 'usa' : host
  if (contentType === 'regional_from') {
    return { filePath: `${app}/content/from/${slug}.md`, urlPath: `/from/${slug}/` }
  }
  if (contentType === 'regional_university') {
    return {
      filePath: `${app}/content/universities/${slug}.md`,
      urlPath: `/universities/${slug}/`,
    }
  }
  if (contentType === 'blog_post' || contentType === 'blog_summary') {
    // Apex blogs use the established static-page layout; regional blogs remain
    // Markdown under their host's content tree.
    if (host === 'apex') {
      return { filePath: `${app}/app/blog/${slug}/page.tsx`, urlPath: `/blog/${slug}/` }
    }
    return { filePath: `${app}/content/blog/${slug}.md`, urlPath: `/blog/${slug}/` }
  }
  return { filePath: `${app}/content/${slug}.md`, urlPath: `/${slug}/` }
}

/**
 * Infer content type from registry intent when caller passes a generic type.
 * An explicit studio destination (blog / regional) is never overwritten by
 * a procedural registry intent — that was sending every visa blog to caseworks.
 */
export function contentTypeFromIntent(
  intent: string,
  fallback: string,
): string {
  const fb = String(fallback || '').toLowerCase()
  if (isExplicitDestinationType(fb)) return fb
  switch (intent) {
    case 'geo_modifier':
      return 'regional_from'
    case 'university_modifier':
      return 'regional_university'
    case 'transactional':
      return 'blog_post'
    case 'news_summary':
      return 'blog_summary'
    case 'hub':
    case 'procedural':
    case 'checklist':
    case 'comparison':
      return 'legal_guide'
    default:
      return fallback || 'legal_guide'
  }
}

/** Studio / planner types that name a destination host, not just a length. */
export const EXPLICIT_DESTINATION_TYPES = new Set([
  'blog_post',
  'blog_summary',
  'regional_page',
  'regional_from',
  'regional_university',
])

export function isExplicitDestinationType(t: string): boolean {
  return EXPLICIT_DESTINATION_TYPES.has(String(t || '').toLowerCase())
}

export function destinationFamily(contentType: string): 'legal' | 'regional' | 'market' | 'blog' {
  const t = normalizeStudioContentType(contentType)
  if (t === 'marketplace_gig') return 'market'
  if (t === 'blog_post' || t === 'blog_summary') return 'blog'
  if (t === 'legal_guide' || t === 'article') return 'legal'
  if (isExplicitDestinationType(t)) return 'regional'
  return 'legal'
}

export function hostFamily(host: OwnerHost | string | null | undefined): 'legal' | 'regional' | 'market' | 'blog' {
  if (host === 'market') return 'market'
  if (host === 'legal') return 'legal'
  if (host === 'apex') return 'blog'
  return 'regional'
}

/** Cluster/legal pillar URLs must not steal an explicit blog or regional ship. */
export function ownerHintAllowedForType(hintHost: OwnerHost | string | null, contentType: string): boolean {
  if (!hintHost) return false
  const dest = destinationFamily(contentType)
  const fam = hostFamily(hintHost)
  if (normalizeStudioContentType(contentType) === 'blog_post') return hintHost === 'apex'
  return dest === fam
}

/** UI `article` is the caseworks legal guide; keep blog_post as blog_post. */
export function normalizeStudioContentType(t: string): string {
  const x = String(t || '').toLowerCase().trim()
  if (x === 'article' || x === 'casework' || x === 'legal') return 'legal_guide'
  if (x === 'blog') return 'blog_post'
  return x || 'legal_guide'
}

/**
 * Guess a destination when the caller only sent legal_guide / article.
 * Conservative: procedure stays on caseworks; from-country, campus, and
 * lifestyle/news go to regional hosts or the apex blog.
 */
export function classifyDestinationType(keyword: string): string {
  const kw = normalize(keyword)
  if (
    /\bfrom (nigeria|india|kenya|ghana|pakistan|bangladesh|china|philippines|sri lanka|uae|united arab)\b/i.test(kw) ||
    /\bvisa from\b/i.test(kw)
  ) {
    return 'regional_from'
  }
  if (GEO_MODIFIER_RE.test(kw) && !/housing|tenant|rent/i.test(kw)) {
    return 'regional_university'
  }
  if (
    /\b(news|update 2026|overview|what is|first 30 days|banking|cost of living|packing list|orientation|settlement services|living in|life in)\b/i.test(
      kw,
    ) &&
    !/\b(how to apply|eligibility|document checklist|form i-|refusal|appeal|template)\b/i.test(kw)
  ) {
    return 'blog_post'
  }
  return 'legal_guide'
}

export async function resolveOwner(opts: {
  primaryKeyword: string
  contentType: string
  region: string
  slug?: string
  indexable?: boolean
  /**
   * Keyword-cluster override: when a cluster already resolves to an existing
   * canonical page (owner URL or shipped job), force this generation onto that
   * exact URL so we expand a unique page instead of creating a cannibal sibling.
   */
  ownerUrlHint?: string
}): Promise<OwnerPlan> {
  const warnings: string[] = []
  const blockers: string[] = []
  const keyword = opts.primaryKeyword || ''

  // ── Explicit blog_post ships to apex unless a cluster explicitly supplies a
  //    canonical owner URL. Registry matches alone must not redirect a studio
  //    blog_post to a regional or legal host.
  const explicitType = normalizeStudioContentType(opts.contentType || '')
  const hintedEarly = opts.ownerUrlHint ? hostFromUrl(opts.ownerUrlHint) : null
  if (
    explicitType === 'blog_post' &&
    isExplicitDestinationType(explicitType) &&
    !ownerHintAllowedForType(hintedEarly, explicitType)
  ) {
    const slug = opts.slug || slugify(keyword || 'blog')
    const fb = pathForHostFallback('apex', opts.region, slug, 'blog_post')
    return {
      matched: null,
      matchScore: 0,
      host: 'apex',
      repo: HOST_REPO['apex'],
      filePath: fb.filePath,
      canonicalUrl: sanitizeOwnerUrl(`${HOST_PUBLIC['apex']}${fb.urlPath}`),
      indexable: opts.indexable !== false,
      action: 'build',
      intentClass: 'news_summary',
      contentType: 'blog_post',
      warnings: ['Explicit blog_post → apex (standing rules override registry match; matched legal pillar stays on legal)'],
      blockers: [],
      ymy: false,
      routingSource: 'standing_rules',
    }
  }

  // ── Strike-seed routing (Phase C): the five locked GSC pages always EXPAND
  //    their existing owner URL — never a sibling, never standing rules. ──
  const seed = matchStrikeSeed(keyword)
  if (seed) {
    const host: OwnerHost = seed.host === 'apex' ? 'apex' : 'legal'
    const repo = HOST_REPO[host]
    const action = seed.mode === 'defend' ? 'keep' : 'expand'
    const reconciled = reconcileContentTypeWithPath({
      contentType: normalizeStudioContentType(opts.contentType || 'legal_guide'),
      filePath: seed.filePath,
      host,
      intentClass: 'procedural',
    })
    warnings.push(
      `Strike-seed lock: "${keyword}" ${action === 'expand' ? 'expands' : 'defends'} existing page ${seed.canonicalUrl} (${seed.filePath}) — no sibling created`,
    )
    return {
      matched: null,
      matchScore: 100,
      host,
      repo,
      filePath: seed.filePath,
      canonicalUrl: seed.canonicalUrl,
      indexable: opts.indexable !== false,
      action,
      intentClass: reconciled.intentClass,
      contentType: reconciled.contentType,
      warnings,
      blockers,
      ymy: host === 'legal',
      routingSource: 'strike_seed',
    }
  }

  const registry = await loadOwnershipRegistry()
  const rows = (registry.rows ?? []) as OwnershipRow[]

  let best: { row: OwnershipRow; score: number } | null = null
  for (const row of rows) {
    const score = scoreMatch(keyword, row.primary_keyword, row.owner_url)
    if (score < 45) continue
    if (!best || score > best.score) best = { row, score }
  }

  const matched = best?.row ?? null
  const matchScore = best?.score ?? 0

  let contentType = normalizeStudioContentType(opts.contentType || 'legal_guide')
  if (!isExplicitDestinationType(contentType) && (contentType === 'legal_guide' || !opts.contentType)) {
    const guessed = classifyDestinationType(keyword)
    if (guessed !== 'legal_guide') contentType = guessed
  }
  const callerExplicit = isExplicitDestinationType(normalizeStudioContentType(opts.contentType || ''))
  let host: OwnerHost
  let repo: ContentRepo
  let routingSource: OwnerPlan['routingSource']
  let filePath: string
  let urlPath: string
  let canonicalUrl: string
  let action = 'build'
  let intentClass = 'procedural'

  const registryHost = matched
    ? hostFromUrl(matched.owner_url) ||
      (HOST_REPO[matched.owner_host as OwnerHost] ? (matched.owner_host as OwnerHost) : 'legal')
    : null
  // An explicit legal ownerUrlHint is an authoritative cluster destination.
  // Recompute both host and content type from that URL before registry matching,
  // so the caller's generic blog_post type cannot keep this plan on apex.
  const hintedHost = opts.ownerUrlHint ? hostFromUrl(opts.ownerUrlHint) : null
  let hintedOwnerPath: { filePath: string; urlPath: string } | null = null
  if (hintedHost === 'legal' && opts.ownerUrlHint && ownerHintAllowedForType(hintedHost, contentType)) {
    hintedOwnerPath = filePathFromOwnerUrl(opts.ownerUrlHint, hintedHost)
    if (hintedOwnerPath) {
      host = hintedHost
      repo = HOST_REPO[hintedHost]
      filePath = hintedOwnerPath.filePath
      urlPath = hintedOwnerPath.urlPath
      canonicalUrl = sanitizeOwnerUrl(opts.ownerUrlHint)
      contentType = 'legal_guide'
      intentClass = 'procedural'
      routingSource = 'registry_owner_url'
      action = 'expand'
      warnings.push(`Explicit ownerUrlHint → legal/caseworks owner ${canonicalUrl}`)
    }
  }
  // Explicit blog/regional ships must not overwrite a legal pillar just because
  // the keyword matched a caseworks registry row.
  const stealLegalPillar =
    Boolean(matched) &&
    callerExplicit &&
    registryHost === 'legal' &&
    destinationFamily(contentType) !== 'legal' &&
    !ownerHintAllowedForType(hintedHost, contentType)

  if (hintedOwnerPath) {
    // Keep the explicit legal owner URL selected above; registry keyword matches
    // must not overwrite a caller-supplied cluster destination.
  } else if (matched && !stealLegalPillar) {
    intentClass = String(matched.intent_class || 'procedural')
    contentType = contentTypeFromIntent(intentClass, contentType)
    action = matched.action || 'build'

    // Host: prefer owner_url hostname (ground truth), then owner_host column
    const fromUrl = hostFromUrl(matched.owner_url)
    const fromCol = matched.owner_host as OwnerHost
    host = fromUrl || (HOST_REPO[fromCol] ? fromCol : 'legal')
    if (fromUrl && fromCol && fromUrl !== fromCol) {
      warnings.push(
        `Registry host mismatch: owner_host=${fromCol} but owner_url host=${fromUrl}; using URL host (strategy path wins)`,
      )
      host = fromUrl
    }

    // Path: always prefer owner_url path so ships land on the strategy URL tree
    const fromOwner = filePathFromOwnerUrl(matched.owner_url, host)
    if (fromOwner) {
      filePath = fromOwner.filePath
      urlPath = fromOwner.urlPath
      routingSource = 'registry_owner_url'
    } else {
      const slug = opts.slug || slugify(keyword)
      const fb = pathForHostFallback(host, opts.region, slug, contentType)
      filePath = fb.filePath
      urlPath = fb.urlPath
      routingSource = 'registry_host'
      warnings.push('Could not parse owner_url path; used host fallback path')
    }
    canonicalUrl = sanitizeOwnerUrl(matched.owner_url || `${HOST_PUBLIC[host]}${urlPath}`)
  } else {
    if (stealLegalPillar && matched) {
      warnings.push(
        `Registry pillar ${matched.owner_url} stays on legal — shipping ${contentType} to its own host instead of overwriting caseworks`,
      )
    }
    const rules = standingRulesHost({
      primaryKeyword: keyword,
      contentType,
      region: opts.region,
    })
    host = rules.host
    contentType = rules.contentType
    routingSource = 'standing_rules'
    intentClass =
      contentType === 'regional_from'
        ? 'geo_modifier'
        : contentType === 'regional_university'
          ? 'university_modifier'
          : contentType === 'blog_post' || contentType === 'blog_summary'
            ? 'news_summary'
            : contentType === 'regional_page'
              ? 'hub'
              : 'procedural'
    const slug = opts.slug || slugify(keyword || contentType)
    const fb = pathForHostFallback(host, opts.region, slug, contentType)
    filePath = fb.filePath
    urlPath = fb.urlPath
    canonicalUrl = sanitizeOwnerUrl(`${HOST_PUBLIC[host]}${urlPath}`)
    warnings.push(`No registry match — standing rules: ${rules.reason}`)
  }

  if (!HOST_REPO[host]) {
    warnings.push(`Unknown host ${host}; forcing legal/caseworks`)
    host = 'legal'
  }
  repo = HOST_REPO[host]

  // Indexability is the DEFAULT for any article that passes review and merges
  // to live. A registry action (noindex / supply_first) may flag a page for
  // manual handling, but it never silently forces a noindex directive — only
  // an explicit caller override (opts.indexable === false) can mark a page
  // noindex.
  const indexable = opts.indexable !== false

  if (matched && !stealLegalPillar) {
    if (matched.action === 'noindex' || matched.action === 'supply_first') {
      warnings.push(`Registry action=${matched.action} for "${matched.primary_keyword}" — ship stays indexable by default`)
    }
    if (matched.action === '301' || matched.action === 'merge') {
      // Auto-resolve to the existing canonical page: the file path already
      // points to matched.owner_url via filePathFromOwnerUrl above. Convert
      // this from a blocker to a warning so the pipeline ships to the right
      // path instead of refusing to ship at all.
      action = 'expand'
      warnings.push(
        `Registry says ${matched.action} for "${matched.primary_keyword}" — shipping expands existing page ${canonicalUrl} (${filePath}), no sibling created`,
      )
    }
    if (matched.action === 'blocked_on_supply' || matched.status === 'blocked_on_supply') {
      blockers.push(`blocked_on_supply: ${matched.notes || 'wait for market inventory'}`)
    }
    if (matched.status === 'needs_decision') {
      warnings.push(`Ownership needs_decision: ${matched.notes}`)
    }
    // Strong keep match: do not invent a new indexable URL — ship expands owner path
    if (
      (matched.action === 'keep' || matched.action === 'expand') &&
      matched.status === 'confirmed' &&
      matchScore >= 80
    ) {
      if (matched.action === 'keep' && contentType !== 'blog_summary') {
        warnings.push(
          `Strong registry match — shipping expands owner URL ${matched.owner_url} (repo ${repo}), not a new sibling`,
        )
      }
    }
    if (matched.action === 'keep' && matchScore >= 90 && contentType !== 'blog_summary' && matched.status === 'confirmed') {
      // Soft blocker only when intent is exact keep and we're not expanding
      // Allow ship to owner path; block only if path would diverge
      const expected = filePathFromOwnerUrl(matched.owner_url, host)
      if (expected && expected.filePath !== filePath) {
        blockers.push(
          `Path divergence from strategy owner ${matched.owner_url}. Expand that URL only.`,
        )
      }
    }
  }

  const ymy =
    host === 'legal' ||
    /visa|immigration|permit|asylum|green.?card|ilr|opt|i-20|uscis|ukvi|pgwp|485/i.test(
      keyword + contentType,
    )

  if (ymy && indexable) {
    warnings.push('YMYL legal content: prefer ship_mode=pr unless audit ≥ 80')
  }

  // Final invariant: repo must match host table
  if (HOST_REPO[host] !== repo) {
    blockers.push(`Internal error: host ${host} repo mismatch`)
  }

  // Path/host always win over caller or registry intent when they disagree.
  // Fixes: legal_guide forced onto universities/* or regional hosts.
  const reconciled = reconcileContentTypeWithPath({
    contentType,
    filePath,
    host,
    intentClass,
  })
  if (reconciled.contentType !== contentType) {
    warnings.push(
      `Content type reconciled ${contentType} → ${reconciled.contentType} (path=${filePath}, host=${host})`,
    )
  }
  contentType = reconciled.contentType
  intentClass = reconciled.intentClass

  // ── Keyword-cluster override: ship onto an existing canonical page ───────
  if (opts.ownerUrlHint) {
    const hintHost = hostFromUrl(opts.ownerUrlHint)
    if (hintHost && HOST_REPO[hintHost] && !ownerHintAllowedForType(hintHost, contentType)) {
      warnings.push(
        `ownerUrlHint ${opts.ownerUrlHint} ignored — ${contentType} ships to its own estate, not ${hintHost}/caseworks`,
      )
    } else if (hintHost && HOST_REPO[hintHost]) {
      const mapped = filePathFromOwnerUrl(opts.ownerUrlHint, hintHost)
      if (mapped) {
        host = hintHost
        // ownerUrlHint is the final canonical authority. Recompute the repo
        // with the overridden host so a regional plan cannot retain
        // `yousafe-consultancy` after being redirected to caseworks/legal.
        repo = HOST_REPO[host]
        filePath = mapped.filePath
        urlPath = mapped.urlPath
        canonicalUrl = sanitizeOwnerUrl(opts.ownerUrlHint.replace(/\/+$/, '') + '/')
        routingSource = 'registry_owner_url'
        warnings.push(
          `Keyword cluster: generation expands existing canonical page ${canonicalUrl} — no sibling created`,
        )
        action = 'expand'
        // Reconcile content type with the forced path (never legal_guide on universities)
        const re2 = reconcileContentTypeWithPath({ contentType, filePath, host, intentClass })
        contentType = re2.contentType
        intentClass = re2.intentClass
      } else {
        warnings.push(`ownerUrlHint ${opts.ownerUrlHint} could not be mapped to a file path — ignored`)
      }
    } else {
      warnings.push(`ownerUrlHint ${opts.ownerUrlHint} has no known estate host — ignored`)
    }
  }

  return {
    matched,
    matchScore,
    host,
    repo,
    filePath,
    canonicalUrl,
    indexable,
    action,
    intentClass,
    contentType,
    warnings,
    blockers,
    ymy,
    routingSource,
  }
}

export async function listRegistry(): Promise<OwnershipRow[]> {
  const registry = await loadOwnershipRegistry()
  return (registry.rows ?? []) as OwnershipRow[]
}

/** Assert plan is shippable to the strategy repo (throws if inconsistent). */
export function assertPlanRepoConsistency(plan: OwnerPlan): void {
  const expected = HOST_REPO[plan.host]
  if (plan.repo !== expected) {
    throw new Error(
      `Ownership invariant violated: host=${plan.host} expects repo=${expected} but plan.repo=${plan.repo}`,
    )
  }
  if (plan.host === 'legal' && !plan.filePath.startsWith('app/')) {
    throw new Error(`Legal/caseworks path must start with app/: got ${plan.filePath}`)
  }
  if (
    (plan.host === 'usa' || plan.host === 'uk' || plan.host === 'ca' || plan.host === 'au' || plan.host === 'apex') &&
    plan.repo !== 'yousafe-consultancy'
  ) {
    throw new Error(`Regional host ${plan.host} must ship to yousafe-consultancy`)
  }
  if (plan.host === 'market' && plan.repo !== 'portal') {
    throw new Error('Market host must ship to portal')
  }
}
