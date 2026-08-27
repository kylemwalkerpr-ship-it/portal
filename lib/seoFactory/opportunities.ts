/**
 * Ranked GSC opportunities powered by the Opportunity Intelligence Engine.
 */

import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { scoreOpportunities, type OpportunityQuery } from '@/lib/seoFactory/opportunityEngine'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { scoreCrucible } from '@/lib/seoEngine/crucible'
import { bestCellForTerm } from '@/lib/seoEngine/planner'

export type OpportunityAction =
  | 'title_rewrite'
  | 'expand_or_build'
  | 'ignore'
  | 'strike_distance'
  | 'page1_defend'
  | 'deep_demand_build'
  | 'cannibal_merge'
  | 'aeo_entity_hub'
  | 'decay_refresh'
  // ── Engine-native actions ──
  | 'quick_win'
  | 'content_gap'
  | 'refresh'
  | 'defend'

export interface FactoryOpportunity {
  term: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  score: number
  action: OpportunityAction
  suggestedContentType: string
  region: string
  ownerHint: any | null
  // Engine-native
  enginePlay?: string
  intent?: string
  signals?: string[]
  opportunityScore?: number
  revenue?: number
  stage?: string
  service?: string | null
  crucibleScore?: number
  crucibleKill?: string | null
}

const PLAY_ACTION_MAP: Record<string, OpportunityAction> = {
  quick_win: 'strike_distance',
  content_gap: 'deep_demand_build',
  refresh: 'expand_or_build',
  defend: 'page1_defend',
  cannibalization: 'cannibal_merge',
}

function inferRegion(term: string): string {
  if (/uk|british|graduate route|ukvi/i.test(term)) return 'UK'
  if (/canada|canadian|pgwp|express entry|ircc/i.test(term)) return 'CA'
  if (/485|pte|australia|home affairs/i.test(term)) return 'AU'
  return 'US'
}

function contentTypeForTerm(term: string): string {
  if (/housing|apartment|dorm|rent|near /i.test(term)) return 'regional_page'
  if (/blog|news|update|what is|how to/i.test(term)) return 'blog_post'
  if (/dependent|spouse|family|visa|opt|h-1b|f-1|pgwp|485/i.test(term)) return 'article'
  return 'article'
}

export async function loadFactoryOpportunities(limit = 50): Promise<{
  source: 'live' | 'snapshot'
  siteUrl?: string
  opportunities: FactoryOpportunity[]
}> {
  const queries: OpportunityQuery[] = []
  let source: 'live' | 'snapshot' = 'snapshot'
  let siteUrl: string | undefined

  const access = await getGscAccess()
  if (access?.accessToken && access.siteUrl) {
    siteUrl = access.siteUrl
    try {
      const end = new Date().toISOString().slice(0, 10)
      const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: start, endDate: end,
            dimensions: ['query'],
            rowLimit: Math.min(100, limit * 2),
          }),
        },
      )
      if (res.ok) {
        const data: any = await res.json()
        source = 'live'
        for (const r of (data.rows || [])) {
          const term = (r.keys?.[0] || '').trim()
          if (!term || isJunkQuery(term)) continue
          queries.push({
            term,
            impressions: r.impressions ?? 0,
            clicks: r.clicks ?? 0,
            ctr: r.ctr ?? 0,
            position: r.position ?? 0,
          })
        }
      }
    } catch { /* fall through to snapshot */ }
  }

  if (queries.length === 0) {
    const snap = await loadGscSnapshot()
    const shape = (q: { term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
      term: q.term || q.url || '',
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
    })
    queries.push(
      ...(snap.topQueries ?? []).map(shape),
      ...((snap.opportunities?.highImpressionLowCtr as Array<any> | undefined) ?? []).map(shape),
      ...((snap.opportunities?.highImpressionDeepRank as Array<any> | undefined) ?? []).map(shape),
    )
  }

  // Deduplicate — single noise filter (queryNoise.isJunkQuery). A weaker local
  // filter is exactly how quoted PDF queries leaked into the radar before.
  const seen = new Set<string>()
  const deduped: OpportunityQuery[] = []
  for (const q of queries) {
    const t = (q.term || '').trim().toLowerCase()
    if (!t || t.length < 3 || seen.has(t) || isJunkQuery(t)) continue
    seen.add(t)
    deduped.push({ ...q, term: t })
  }
  deduped.sort((a, b) => b.impressions - a.impressions)

  try {
    const { pullGa4Signals, attachGa4Revenue } = await import('@/lib/seoEngine/ga4')
    const ga4 = await pullGa4Signals()
    if (ga4.length) {
      const withMoney = attachGa4Revenue(deduped, ga4)
      deduped.length = 0
      deduped.push(...withMoney)
    }
  } catch {
    /* GA4 is optional — opportunities still rank without purchase data. */
  }

  try {
    const { attachKeywordResearch, loadKeywordResearchIndex } = await import('@/lib/seoEngine/keywordDemand')
    const research = await loadKeywordResearchIndex()
    if (research.length) {
      const withKd = attachKeywordResearch(deduped, research)
      deduped.length = 0
      deduped.push(...withKd)
    }
  } catch {
    /* Ads / cached Ubersuggest optional — competitorOpen falls back to rank proxy. */
  }

  try {
    const { countViableBacklinkTargets } = await import('@/lib/seoEngine/backlinkEngine')
    const targets = await countViableBacklinkTargets()
    if (targets != null) {
      for (const q of deduped) q.backlinkTargetsAvailable = targets
    }
  } catch {
    /* ledger optional — linkAttainability stays mid without it. */
  }

  const result = scoreOpportunities({ queries: deduped, limit: limit * 2 })

  const opportunities: FactoryOpportunity[] = result.opportunities
    .filter((o) => o.play !== 'cannibalization')
    .map((o) => {
      const cell = bestCellForTerm(o.topic)
      const crucible = scoreCrucible({
        term: o.topic,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        intent: o.intent,
        play: o.play,
        stage: cell.stage,
        country: cell.country,
        revenue: o.revenue,
        volume: o.volume,
        keywordDifficulty: o.keywordDifficulty,
        referringDomains: o.referringDomains,
        competitorReferringDomains: o.competitorReferringDomains,
        backlinkTargetsAvailable: o.backlinkTargetsAvailable,
      })
      return {
        term: o.topic,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        score: crucible.killed ? 0 : crucible.total,
        action: PLAY_ACTION_MAP[o.play] || 'expand_or_build',
        suggestedContentType: o.contentType,
        region: inferRegion(o.topic) || cell.country,
        ownerHint: o.sourcePage || null,
        enginePlay: o.play,
        intent: o.intent,
        signals: o.signals,
        opportunityScore: o.opportunityScore,
        revenue: o.revenue,
        stage: cell.stage,
        service: crucible.service,
        crucibleScore: crucible.total,
        crucibleKill: crucible.killReason,
      }
    })
    .sort((a, b) => (b.crucibleScore || 0) - (a.crucibleScore || 0))
    .slice(0, limit)

  return { source, siteUrl, opportunities }
}
export function pickAutoRunCandidates(
  opps: FactoryOpportunity[],
  limit: number,
): FactoryOpportunity[] {
  // Phase C: auto-run never opens a net-new page from the radar. Only
  // expand-existing plays (strike distance, refresh, page-1 defend) ship.
  const eligible = opps
    .filter(
      (o) =>
        o.enginePlay === 'quick_win' ||
        o.enginePlay === 'refresh' ||
        o.enginePlay === 'defend' ||
        o.action === 'strike_distance' ||
        o.action === 'expand_or_build' ||
        o.action === 'page1_defend',
    )
    .filter((o) => o.term.length >= 4)
    .filter((o) => o.impressions >= 8)
  eligible.sort((a, b) => (b.crucibleScore ?? b.score) - (a.crucibleScore ?? a.score))
  return eligible.slice(0, Math.max(1, Math.min(limit, 40)))
}
