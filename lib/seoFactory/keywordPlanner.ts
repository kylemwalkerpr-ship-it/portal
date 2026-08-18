/**
 * Keyword research + planning driven by GSC demand, ownership registry,
 * and recent content_jobs — balances refresh vs expand vs net-new.
 */

import { createClient } from '@supabase/supabase-js'
import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot, loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import { CATEGORIES } from '@/lib/categories'
import { isJunkQuery } from './queryNoise'

/**
 * Marketplace category demand signal — when the marketplace has active
 * service-provider supply in an area, the engine should prioritize creating
 * educational content (blogs, guides, regional pages) that funnels readers
 * toward those services. The studio NEVER creates marketplace gigs — it uses
 * marketplace demand only as a weight to decide WHICH topics to flesh out.
 *
 * Returns a bonus 0–25 added to the authority score for keywords that match
 * marketplace category/subcategory names or keywords.
 */
function marketplaceDemandBoost(term: string): number {
  const t = term.toLowerCase()
  let best = 0
  for (const cat of CATEGORIES) {
    // Category name match → strong signal
    if (cat.name && t.includes(cat.name.toLowerCase())) {
      best = Math.max(best, 20)
    }
    // Subcategory name match
    for (const sub of cat.subcategories || []) {
      if (sub.name && t.includes(sub.name.toLowerCase())) {
        best = Math.max(best, 18)
      }
      // Subcategory keyword match → direct demand signal
      for (const kw of sub.keywords || []) {
        if (kw && t.includes(kw.toLowerCase())) {
          best = Math.max(best, 15)
        }
      }
    }
    // Category description keyword match (looser signal)
    if (cat.description) {
      const descWords = cat.description.toLowerCase().split(/\s+/).filter(w => w.length > 4)
      const matchCount = descWords.filter(w => t.includes(w)).length
      if (matchCount >= 2) best = Math.max(best, 10)
    }
  }
  return Math.min(25, best)
}
import { classifyDestinationType, resolveOwner, type OwnerPlan } from './ownership'
import {
  authorityPromptHints,
  scoreTopicAuthority,
  type AuthorityBreakdown,
} from './authorityScoring'

export type PlanLane =
  | 'refresh' // pos 4–20, weak CTR → rewrite/refresh existing owner
  | 'expand' // high imp, deep rank, owner exists → deepen existing page
  | 'build_new' // demand with no owner / action=build → net-new URL
  | 'monitor' // healthy or recently covered
  | 'defer' // blocked, merge/301, brand, thin demand

export interface KeywordSignal {
  term: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  /** Research score for ranking the board */
  demandScore: number
  /** AEO/SEO/GEO authority composite 0–100 */
  authorityScore: number
  authority: AuthorityBreakdown
  /** Marketplace category demand bonus 0–25 — signal that service providers exist */
  marketplaceDemand?: number
  lane: PlanLane
  laneReason: string
  region: string
  suggestedContentType: string
  owner: {
    host: string | null
    repo: string | null
    url: string | null
    action: string | null
    matchScore: number
    filePath: string | null
  }
  relatedPage?: {
    url: string
    impressions: number
    clicks: number
    ctr: number
    position: number
  } | null
  recentlyCovered: boolean
  priority: number // higher = do first
}

export interface EditorialPlanItem {
  term: string
  lane: PlanLane
  priority: number
  region: string
  contentType: string
  shipHint: 'pr' | 'autodeploy' | 'merge' | 'none'
  ownerUrl: string | null
  host: string | null
  repo: string | null
  filePath: string | null
  demandScore: number
  authorityScore: number
  contentAngle: AuthorityBreakdown['contentAngle']
  writeHint: string
  rationale: string
  impressions: number
  position: number
  ctr: number
}

export interface KeywordPlanResult {
  source: 'live' | 'snapshot' | 'mixed'
  siteUrl?: string
  generatedAt: string
  mix: { refresh: number; expand: number; build_new: number; monitor: number; defer: number }
  /** Target share for next production batch (0–1) */
  targetMix: { refresh: number; expand: number; build_new: number }
  board: KeywordSignal[]
  plan: EditorialPlanItem[]
  summary: string
  warnings: string[]
}

export interface PlanOptions {
  /** Max keywords on research board */
  boardLimit?: number
  /** Max items in executable plan */
  planLimit?: number
  /** Desired mix of the plan (normalized) */
  targetMix?: { refresh?: number; expand?: number; build_new?: number }
  regionFilter?: string
  minImpressions?: number
  /** Days to treat a keyword as recently covered via content_jobs */
  recentDays?: number
  includeBrand?: boolean
}

function inferRegion(term: string): string {
  if (/uk|british|graduate route|ukvi|skilled worker/i.test(term)) return 'UK'
  if (/canada|canadian|pgwp|express entry|ircc|study permit/i.test(term)) return 'CA'
  if (/485|pte|australia|home affairs|subclass/i.test(term)) return 'AU'
  return 'US'
}

function brandTerm(term: string): boolean {
  return /yousafe|mycaseworks|yousafeconsultancy/i.test(term)
}

function demandScore(q: {
  impressions: number
  clicks: number
  ctr: number
  position: number
}): number {
  // High impressions + CTR gap + mid/deep position = opportunity
  const expectedCtr =
    q.position <= 3 ? 0.12 : q.position <= 10 ? 0.05 : q.position <= 20 ? 0.025 : 0.01
  const ctrGap = Math.max(0, expectedCtr - q.ctr)
  const posW = q.position <= 20 ? 1.35 : q.position <= 40 ? 1.1 : 0.85
  return Math.round(q.impressions * (0.35 + ctrGap * 8) * posW)
}

async function loadQueryRows(minImpressions: number): Promise<{
  source: 'live' | 'snapshot'
  siteUrl?: string
  queries: Array<{ term: string; impressions: number; clicks: number; ctr: number; position: number }>
  pages: Array<{ url: string; impressions: number; clicks: number; ctr: number; position: number }>
  warnings: string[]
}> {
  const warnings: string[] = []
  let queries: Array<{ term: string; impressions: number; clicks: number; ctr: number; position: number }> = []
  let pages: Array<{ url: string; impressions: number; clicks: number; ctr: number; position: number }> = []
  let source: 'live' | 'snapshot' = 'snapshot'
  let siteUrl: string | undefined

  const access = await getGscAccess()
  if (access?.accessToken && access.siteUrl) {
    siteUrl = access.siteUrl
    try {
      const end = new Date().toISOString().slice(0, 10)
      const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
      const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`
      const headers = {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      }
      const [qRes, pRes] = await Promise.all([
        fetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            dimensions: ['query'],
            rowLimit: 250,
          }),
        }),
        fetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            dimensions: ['page'],
            rowLimit: 100,
          }),
        }),
      ])
      if (qRes.ok) {
        const json = (await qRes.json()) as {
          rows?: Array<{
            keys?: string[]
            impressions?: number
            clicks?: number
            ctr?: number
            position?: number
          }>
        }
        queries = (json.rows || [])
          .map((r) => ({
            term: (r.keys?.[0] || '').trim(),
            impressions: r.impressions || 0,
            clicks: r.clicks || 0,
            ctr: r.ctr || 0,
            position: r.position || 100,
          }))
          .filter((q) => q.term && q.impressions >= minImpressions)
        if (queries.length) source = 'live'
      } else {
        warnings.push(`Live GSC queries HTTP ${qRes.status}`)
      }
      if (pRes.ok) {
        const json = (await pRes.json()) as {
          rows?: Array<{
            keys?: string[]
            impressions?: number
            clicks?: number
            ctr?: number
            position?: number
          }>
        }
        pages = (json.rows || [])
          .map((r) => ({
            url: (r.keys?.[0] || '').trim(),
            impressions: r.impressions || 0,
            clicks: r.clicks || 0,
            ctr: r.ctr || 0,
            position: r.position || 100,
          }))
          .filter((p) => p.url)
      }
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : 'Live GSC failed')
    }
  } else {
    warnings.push('No live GSC credentials — using snapshot demand feed')
  }

  if (!queries.length) {
    const snap = await loadGscSnapshot()
    queries = [
      ...(snap.opportunities?.highImpressionLowCtr || []),
      ...(snap.opportunities?.highImpressionDeepRank || []),
      ...(snap.topQueries || []),
    ]
    const seen = new Set<string>()
    queries = queries.filter((q) => {
      if (!q.term || seen.has(q.term) || q.impressions < minImpressions) return false
      seen.add(q.term)
      return true
    })
    pages = (snap.topPages || []).map((p) => ({
      url: p.url,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      position: p.position,
    }))
    source = 'snapshot'
  }

  return { source, siteUrl, queries, pages, warnings }
}

async function loadRecentCoverage(days: number): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const since = new Date(Date.now() - days * 864e5).toISOString()
    const { data } = await supabase
      .from('content_jobs')
      .select('primary_keyword, topic, status')
      .gte('created_at', since)
      .neq('status', 'failed')
      .limit(500)
    for (const row of data || []) {
      const k = (row.primary_keyword || row.topic || '').toLowerCase().trim()
      if (k) out.add(k)
    }
  } catch {
    /* empty */
  }
  return out
}

function findRelatedPage(
  term: string,
  pages: Array<{ url: string; impressions: number; clicks: number; ctr: number; position: number }>,
  ownerUrl: string | null,
) {
  if (ownerUrl) {
    let ownerPath = ownerUrl
    try {
      ownerPath = new URL(ownerUrl).pathname.replace(/\/$/, '')
    } catch {
      /* keep raw */
    }
    const hit = pages.find((p) => {
      try {
        const pp = new URL(p.url).pathname.replace(/\/$/, '')
        return pp === ownerPath || p.url === ownerUrl || ownerUrl.includes(pp)
      } catch {
        return p.url === ownerUrl
      }
    })
    if (hit) return hit
  }
  const tokens = term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)
    .slice(0, 4)
  if (!tokens.length) return null
  let best: (typeof pages)[0] | null = null
  let bestN = 0
  for (const p of pages) {
    const u = p.url.toLowerCase()
    const n = tokens.filter((t) => u.includes(t)).length
    if (n > bestN) {
      bestN = n
      best = p
    }
  }
  return bestN >= 2 ? best : null
}

function classifyLane(opts: {
  q: { term: string; impressions: number; clicks: number; ctr: number; position: number }
  plan: OwnerPlan
  recentlyCovered: boolean
  includeBrand: boolean
}): { lane: PlanLane; reason: string } {
  const { q, plan, recentlyCovered, includeBrand } = opts
  if (!includeBrand && brandTerm(q.term)) {
    return { lane: 'defer', reason: 'Brand query — not content expansion target' }
  }
  if (q.impressions < 8) {
    return { lane: 'defer', reason: 'Impressions too low for investment' }
  }
  if (plan.blockers.some((b) => /blocked_on_supply|301|merge/i.test(b))) {
    return { lane: 'defer', reason: plan.blockers[0] || 'Ownership blocked' }
  }
  if (recentlyCovered) {
    return { lane: 'monitor', reason: 'Recently covered by Content Studio job' }
  }

  const hasOwner = Boolean(plan.matched?.owner_url)
  const expectedCtr =
    q.position <= 3 ? 0.1 : q.position <= 10 ? 0.045 : q.position <= 20 ? 0.025 : 0.012

  // Striking distance + CTR gap → refresh existing
  if (q.position >= 4 && q.position <= 20 && q.ctr < expectedCtr * 0.7 && (hasOwner || q.impressions >= 20)) {
    return {
      lane: 'refresh',
      reason: `Pos ${q.position.toFixed(1)} with CTR ${(q.ctr * 100).toFixed(2)}% (gap) — refresh title/meta/content on owner`,
    }
  }

  // Deep rank high demand + owner → expand
  if (q.position > 20 && q.impressions >= 15 && hasOwner) {
    return {
      lane: 'expand',
      reason: `Deep rank (pos ${q.position.toFixed(1)}) with ${q.impressions} imp — expand owner ${plan.matched?.owner_url}`,
    }
  }

  // Registry says build / expand
  if (plan.action === 'build' || plan.action === 'expand') {
    return {
      lane: plan.matched ? 'expand' : 'build_new',
      reason: `Registry action=${plan.action}`,
    }
  }

  // No strong owner match + solid demand → new
  if (!hasOwner && q.impressions >= 20 && q.position > 15) {
    return {
      lane: 'build_new',
      reason: 'No registry owner + sustained demand — candidate net-new (still routes by standing rules)',
    }
  }

  // Weak mid-pack with owner
  if (hasOwner && q.impressions >= 25 && q.position > 10) {
    return {
      lane: 'expand',
      reason: 'Owner exists with residual demand — expand rather than sibling URL',
    }
  }

  if (q.position <= 10 && q.ctr >= expectedCtr * 0.8) {
    return { lane: 'monitor', reason: 'Already performing — protect with internal links only' }
  }

  return { lane: 'monitor', reason: 'Hold — not enough signal for a ship this cycle' }
}

/**
 * Full keyword research board + balanced editorial plan.
 */
export async function buildKeywordPlan(opts: PlanOptions = {}): Promise<KeywordPlanResult> {
  const boardLimit = Math.min(200, Math.max(20, opts.boardLimit ?? 80))
  const planLimit = Math.min(30, Math.max(1, opts.planLimit ?? 12))
  const minImpressions = opts.minImpressions ?? 5
  const recentDays = opts.recentDays ?? 45
  const includeBrand = Boolean(opts.includeBrand)
  const regionFilter = opts.regionFilter?.toUpperCase() || ''

  const rawMix = {
    refresh: opts.targetMix?.refresh ?? 0.4,
    expand: opts.targetMix?.expand ?? 0.35,
    build_new: opts.targetMix?.build_new ?? 0.25,
  }
  const mixSum = rawMix.refresh + rawMix.expand + rawMix.build_new || 1
  const targetMix = {
    refresh: rawMix.refresh / mixSum,
    expand: rawMix.expand / mixSum,
    build_new: rawMix.build_new / mixSum,
  }

  const { source, siteUrl, queries, pages, warnings } = await loadQueryRows(minImpressions)
  const recent = await loadRecentCoverage(recentDays)
  // Warm registry cache
  await loadOwnershipRegistry()

  const board: KeywordSignal[] = []
  for (const q of queries) {
    // Drop junk (PDF filenames, quoted document blobs, file paths) before
    // clustering — a junk query can never resolve to an owner or a cluster.
    // Brand terms are still allowed when the caller explicitly opts in.
    if (isJunkQuery(q.term) && !(includeBrand && brandTerm(q.term))) continue
    const region = inferRegion(q.term)
    if (regionFilter && region !== regionFilter) continue

    const plan = await resolveOwner({
      primaryKeyword: q.term,
      contentType: classifyDestinationType(q.term),
      region,
    })
    const recentlyCovered = recent.has(q.term.toLowerCase())
    // Strike-seed routing (Phase C): the four guide/lease pages expand their
    // existing owner URL; the apex homepage is defended, never rewritten.
    const isSeed = plan.routingSource === 'strike_seed'
    const { lane, reason } = isSeed
      ? plan.action === 'expand'
        ? { lane: 'expand' as PlanLane, reason: 'Strike-seed lock — expand existing owner URL (no sibling)' }
        : { lane: 'monitor' as PlanLane, reason: 'Strike-seed homepage — defend existing page (no rewrite)' }
      : classifyLane({
          q,
          plan,
          recentlyCovered,
          includeBrand,
        })
    const relatedPage = findRelatedPage(q.term, pages, plan.matched?.owner_url || plan.canonicalUrl)
    const dScore = demandScore(q)
    const authority = scoreTopicAuthority({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
      hasOwner: Boolean(plan.matched?.owner_url),
      host: plan.host,
      recentlyCovered,
      registryAction: plan.action,
    })

    // Marketplace demand signal: when the marketplace already has service
    // providers for this topic, the engine should prioritize educational
    // content that funnels readers toward those services.
    const mktDemand = marketplaceDemandBoost(q.term)

    // Priority: actionable lanes first, then AEO/SEO/GEO authority, then raw demand
    const lanePri =
      lane === 'refresh' ? 100 : lane === 'expand' ? 85 : lane === 'build_new' ? 70 : lane === 'monitor' ? 20 : 5
    // Prefer high-authority expand/refresh over low-authority net-new.
    // Marketplace demand adds up to 2,500 bonus points (25 × 100).
    const authorityBoost = authority.total + mktDemand
    const priority = lanePri * 100000 + authorityBoost * 1000 + Math.min(dScore, 999)

    board.push({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
      demandScore: dScore,
      authorityScore: authority.total + mktDemand,
      authority,
      marketplaceDemand: mktDemand,
      lane,
      laneReason: `${reason} · ${authority.rationale}${mktDemand > 0 ? ` · marketplace demand +${mktDemand}` : ''}`,
      region,
      suggestedContentType: plan.contentType || 'legal_guide',
      owner: {
        host: plan.host,
        repo: plan.repo,
        url: plan.canonicalUrl,
        action: plan.action,
        matchScore: plan.matchScore,
        filePath: plan.filePath,
      },
      relatedPage: relatedPage
        ? {
            url: relatedPage.url,
            impressions: relatedPage.impressions,
            clicks: relatedPage.clicks,
            ctr: relatedPage.ctr,
            position: relatedPage.position,
          }
        : null,
      recentlyCovered,
      priority,
    })
  }

  board.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.authorityScore - a.authorityScore ||
      b.demandScore - a.demandScore,
  )
  const trimmed = board.slice(0, boardLimit)

  const mix = {
    refresh: trimmed.filter((b) => b.lane === 'refresh').length,
    expand: trimmed.filter((b) => b.lane === 'expand').length,
    build_new: trimmed.filter((b) => b.lane === 'build_new').length,
    monitor: trimmed.filter((b) => b.lane === 'monitor').length,
    defer: trimmed.filter((b) => b.lane === 'defer').length,
  }

  // Balanced plan: fill buckets by target mix
  const want = {
    refresh: Math.max(1, Math.round(planLimit * targetMix.refresh)),
    expand: Math.max(1, Math.round(planLimit * targetMix.expand)),
    build_new: Math.max(0, Math.round(planLimit * targetMix.build_new)),
  }
  // Fix rounding to planLimit
  let assigned = want.refresh + want.expand + want.build_new
  while (assigned > planLimit) {
    if (want.build_new > 0) want.build_new--
    else if (want.expand > 1) want.expand--
    else want.refresh--
    assigned = want.refresh + want.expand + want.build_new
  }
  while (assigned < planLimit) {
    want.refresh++
    assigned++
  }

  const plan: EditorialPlanItem[] = []
  const toPlanItem = (b: KeywordSignal, extraRationale = ''): EditorialPlanItem => ({
    term: b.term,
    lane: b.lane,
    priority: plan.length + 1,
    region: b.region,
    contentType: b.suggestedContentType,
    // High authority + clear owner → merge to main after generate; else PR
    shipHint:
      b.authorityScore >= 62 && b.lane !== 'build_new'
        ? 'merge'
        : b.authorityScore >= 70
          ? 'merge'
          : 'pr',
    ownerUrl: b.owner.url,
    host: b.owner.host,
    repo: b.owner.repo,
    filePath: b.owner.filePath,
    demandScore: b.demandScore,
    authorityScore: b.authorityScore,
    contentAngle: b.authority.contentAngle,
    writeHint: authorityPromptHints(b.authority.contentAngle),
    rationale: (b.laneReason + extraRationale).trim(),
    impressions: b.impressions,
    position: b.position,
    ctr: b.ctr,
  })

  const take = (lane: PlanLane, n: number) => {
    // Within lane, authority-first (already sorted on board)
    const pool = trimmed
      .filter((b) => b.lane === lane && !plan.some((p) => p.term === b.term))
      .sort((a, b) => b.authorityScore - a.authorityScore || b.demandScore - a.demandScore)
    for (const b of pool.slice(0, n)) {
      plan.push(toPlanItem(b))
    }
  }
  take('refresh', want.refresh)
  take('expand', want.expand)
  take('build_new', want.build_new)
  // Backfill with next best actionable if buckets empty
  if (plan.length < planLimit) {
    for (const b of trimmed) {
      if (plan.length >= planLimit) break
      if (b.lane === 'monitor' || b.lane === 'defer') continue
      if (plan.some((p) => p.term === b.term)) continue
      plan.push(toPlanItem(b, ' (backfill)'))
    }
  }

  // Final plan order: authority score within retained mix
  plan.sort((a, b) => b.authorityScore - a.authorityScore || b.demandScore - a.demandScore)
  plan.forEach((p, i) => {
    p.priority = i + 1
  })

  const avgAuth = plan.length
    ? Math.round(plan.reduce((s, p) => s + p.authorityScore, 0) / plan.length)
    : 0

  const summary = [
    `GSC ${source}: ${queries.length} queries researched, ${trimmed.length} on board.`,
    `Lanes — refresh ${mix.refresh}, expand ${mix.expand}, new ${mix.build_new}, monitor ${mix.monitor}, defer ${mix.defer}.`,
    `Plan ${plan.length} items @ mix refresh ${Math.round(targetMix.refresh * 100)}% / expand ${Math.round(targetMix.expand * 100)}% / new ${Math.round(targetMix.build_new * 100)}%.`,
    `Authority algorithm (AEO/SEO/GEO): avg score ${avgAuth}/100 — prioritizes discipline entities, Q&A intent, LLM-citable structure, and cluster fill over thin demand.`,
    `Ship default for high-authority items: merge→main (Cloudflare autodeploy).`,
  ].join(' ')

  return {
    source,
    siteUrl,
    generatedAt: new Date().toISOString(),
    mix,
    targetMix,
    board: trimmed,
    plan,
    summary,
    warnings,
  }
}

/** Terms to feed auto-run from a plan (ordered). */
export function planTermsForAutoRun(
  plan: EditorialPlanItem[],
  limit: number,
  lanes?: PlanLane[],
): string[] {
  const allow = new Set(lanes || ['refresh', 'expand', 'build_new'])
  return plan
    .filter((p) => allow.has(p.lane))
    .slice(0, limit)
    .map((p) => p.term)
}
