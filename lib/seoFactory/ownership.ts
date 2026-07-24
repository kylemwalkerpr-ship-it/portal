/**
 * Estate ownership resolver — SEO strategies registry is source of truth.
 *
 * Source of truth:
 *   Documents/GitHub/SEO strategies/ownership-registry-v1.csv
 *   → public/seo-data/ownership-registry.json (runtime asset)
 *   → OWNERSHIP_REGISTRY.md standing rules
 *
 * Standing rules:
 *   1. Procedural / YMYL → legal (caseworks)
 *   2. Geo "from {country}" → regional /from/ (yousafe-consultancy)
 *   3. University modifiers → regional universities graph by default
 *   4. Blog → news/summary on legal or apex, always links to legal pillar
 *   5. Transactional → market (portal), supply_first when blocked
 *   6. Hubs own cluster nav; spokes own long-tail procedure
 *
 * Repo map (never invent hosts outside this table):
 *   legal → caseworks
 *   usa|uk|ca|au|apex → yousafe-consultancy
 *   market → portal
 */

import { loadOwnershipRegistry } from '@/lib/seoDataLoaders'

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
  warnings: string[]
  blockers: string[]
  ymy: boolean
  /** How routing was decided */
  routingSource: 'registry_owner_url' | 'registry_host' | 'standing_rules' | 'content_type_default'
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

  return Math.min(60, penalty)
}

function scoreMatch(keyword: string, primary: string): number {
  const a = normalize(keyword)
  const b = normalize(primary)
  if (!a || !b) return 0
  if (a === b) return 100
  // phrase containment
  if (a.includes(b) || b.includes(a)) {
    // Even when one phrase contains the other, check for intent mismatch
    const ip = intentMismatchPenalty(keyword, primary)
    if (ip >= 40) {
      // Strong penalty — the keywords share words but describe fundamentally different things
      // e.g. "stem category occupations list" matches "document checklist" on "express entry" only
      // Reduce to mid-range so standing rules can pick a better default
      return Math.round(85 * (1 - ip / 100))
    }
    return 85
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
  // Apply intent mismatch penalty
  const ip = intentMismatchPenalty(keyword, primary)
  if (ip > 0) {
    raw = Math.round(raw * (1 - ip / 100))
  }
  return raw
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
  let path = u.pathname.replace(/\/+$/, '') || '/'
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

  // Transactional / marketplace
  if (
    contentType === 'marketplace_gig' ||
    /hire|marketplace|gig|attorney near me|consultant fee/i.test(kw)
  ) {
    return { host: 'market', contentType: 'marketplace_gig', reason: 'transactional → market' }
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
    else if (/australia|485|subclass/i.test(kw) || region === 'AU') host = 'au'
    else if (region === 'US') host = 'usa'
    return { host, contentType: 'regional_from', reason: 'geo_modifier from-country → regional' }
  }

  // University modifier → regional campus graph (strategy default)
  if (
    contentType === 'regional_university' ||
    (/\buniversity\b|\bcollege\b|\bmit\b|\bnyu\b|\bharvard\b/i.test(kw) &&
      !/housing|tenant|rent/i.test(kw))
  ) {
    let host: OwnerHost = 'usa'
    if (/uk|london|kcl|ucl|manchester|edinburgh/i.test(kw) || region === 'UK') host = 'uk'
    else if (/canada|toronto|ubc|mcgill/i.test(kw) || region === 'CA') host = 'ca'
    else if (/australia|melbourne|sydney|monash/i.test(kw) || region === 'AU') host = 'au'
    return {
      host,
      contentType: 'regional_university',
      reason: 'university_modifier → regional universities graph',
    }
  }

  // Housing guides often stay legal (many are legal/guide/*)
  if (/housing|tenant|renters? rights|section 21|deposit dispute/i.test(kw)) {
    return { host: 'legal', contentType: contentType || 'legal_guide', reason: 'housing/tenant rights → legal' }
  }

  // Blog / news — legal by default for YMYL news; regional hosts only when region page type is explicit
  if (contentType === 'blog_post' || contentType === 'blog_summary' || /news|update 2026|overview/i.test(kw)) {
    // Soft regional blog only when keyword clearly geo-local and non-procedural
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
    return { host: 'legal', contentType: contentType || 'blog_summary', reason: 'news_summary → legal blog' }
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
    return {
      filePath: `${app}/content/blog/${slug}.md`,
      urlPath: `/blog/${slug}/`,
    }
  }
  return { filePath: `${app}/content/${slug}.md`, urlPath: `/${slug}/` }
}

/**
 * Infer content type from registry intent when caller passes a generic type.
 */
export function contentTypeFromIntent(
  intent: string,
  fallback: string,
): string {
  switch (intent) {
    case 'geo_modifier':
      return 'regional_from'
    case 'university_modifier':
      return 'regional_university'
    case 'transactional':
      return 'marketplace_gig'
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

export async function resolveOwner(opts: {
  primaryKeyword: string
  contentType: string
  region: string
  slug?: string
  indexable?: boolean
}): Promise<OwnerPlan> {
  const warnings: string[] = []
  const blockers: string[] = []
  const registry = await loadOwnershipRegistry()
  const rows = (registry.rows ?? []) as OwnershipRow[]
  const keyword = opts.primaryKeyword || ''

  let best: { row: OwnershipRow; score: number } | null = null
  for (const row of rows) {
    const score = scoreMatch(keyword, row.primary_keyword)
    if (score < 45) continue
    if (!best || score > best.score) best = { row, score }
  }

  const matched = best?.row ?? null
  const matchScore = best?.score ?? 0

  let contentType = opts.contentType || 'legal_guide'
  let host: OwnerHost
  let routingSource: OwnerPlan['routingSource']
  let filePath: string
  let urlPath: string
  let canonicalUrl: string
  let action = 'build'
  let intentClass = 'procedural'

  if (matched) {
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
    canonicalUrl = matched.owner_url || `${HOST_PUBLIC[host]}${urlPath}`
  } else {
    const rules = standingRulesHost({
      primaryKeyword: keyword,
      contentType,
      region: opts.region,
    })
    host = rules.host
    contentType = rules.contentType
    routingSource = 'standing_rules'
    intentClass = contentType === 'regional_from' ? 'geo_modifier' : contentType === 'regional_university' ? 'university_modifier' : 'procedural'
    const slug = opts.slug || slugify(keyword || contentType)
    const fb = pathForHostFallback(host, opts.region, slug, contentType)
    filePath = fb.filePath
    urlPath = fb.urlPath
    canonicalUrl = `${HOST_PUBLIC[host]}${urlPath}`
    warnings.push(`No registry match — standing rules: ${rules.reason}`)
  }

  if (!HOST_REPO[host]) {
    warnings.push(`Unknown host ${host}; forcing legal/caseworks`)
    host = 'legal'
  }

  const repo = HOST_REPO[host]
  let indexable = opts.indexable ?? true

  if (matched) {
    if (matched.action === 'noindex' || matched.action === 'supply_first') {
      if (matched.action === 'noindex') indexable = false
      warnings.push(`Registry action=${matched.action} for "${matched.primary_keyword}"`)
    }
    if (matched.action === '301' || matched.action === 'merge') {
      blockers.push(
        `Registry says ${matched.action} for "${matched.primary_keyword}" → expand existing ${matched.owner_url}, do not create sibling`,
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
