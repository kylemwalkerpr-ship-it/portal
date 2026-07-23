/**
 * Ranked GSC opportunities for the SEO Factory auto-run pipeline.
 */

import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { resolveOwner, type OwnerPlan } from '@/lib/seoFactory/ownership'
import { scoreTopicAuthority } from '@/lib/seoFactory/authorityScoring'

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
  ownerHint: OwnerPlan | null
}

function inferRegion(term: string): string {
  if (/uk|british|graduate route|ukvi/i.test(term)) return 'UK'
  if (/canada|canadian|pgwp|express entry|ircc/i.test(term)) return 'CA'
  if (/485|pte|australia|home affairs/i.test(term)) return 'AU'
  return 'US'
}

function inferContentType(term: string): string {
  if (/blog|news|update|what is|how to/i.test(term)) return 'blog_summary'
  if (/housing|apartment|dorm|rent|near /i.test(term)) return 'legal_guide'
  if (/dependent|spouse|family|visa|opt|h-1b|f-1|pgwp|485/i.test(term)) return 'legal_guide'
  return 'legal_guide'
}

export async function loadFactoryOpportunities(limit = 50): Promise<{
  source: 'live' | 'snapshot'
  siteUrl?: string
  opportunities: FactoryOpportunity[]
}> {
  type Q = { term: string; impressions: number; clicks: number; ctr: number; position: number }
  let queries: Q[] = []
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
            startDate: start,
            endDate: end,
            dimensions: ['query'],
            rowLimit: 100,
          }),
        },
      )
      if (res.ok) {
        const json = (await res.json()) as {
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
          .filter((q) => q.term && q.impressions >= 5)
        if (queries.length) source = 'live'
      }
    } catch {
      /* fall through to snapshot */
    }
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
      if (!q.term || seen.has(q.term)) return false
      seen.add(q.term)
      return q.impressions >= 5
    })
  }

  const brand = /yousafe|yousafeconsultancy/
  type Scored = {
    term: string
    impressions: number
    clicks: number
    ctr: number
    position: number
    score: number
    action: OpportunityAction
    suggestedContentType: string
    region: string
  }
  const scored: Scored[] = []
  for (const q of queries.filter((row) => !brand.test(row.term))) {
    let action: OpportunityAction = 'expand_or_build'
    if (q.position >= 4 && q.position <= 20 && q.ctr < 0.03) action = 'title_rewrite'
    if (q.impressions < 10) action = 'ignore'
    const region = inferRegion(q.term)
    const suggestedContentType = inferContentType(q.term)
    // Preliminary authority (owner resolved in next loop for final score)
    const pre = scoreTopicAuthority({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
    })
    const posW = q.position <= 20 ? 1.4 : q.position <= 40 ? 1.1 : 0.9
    const ctrGap = 1 - Math.min(q.ctr / 0.05, 1)
    const gscRaw = q.impressions * ctrGap * posW
    // Blend GSC opportunity with AEO/SEO/GEO authority (0–100 → scale)
    const score = gscRaw * 0.45 + pre.total * 40
    scored.push({
      ...q,
      score,
      action,
      suggestedContentType,
      region,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)

  const opportunities: FactoryOpportunity[] = []
  for (const q of top) {
    const ownerHint = await resolveOwner({
      primaryKeyword: q.term,
      contentType: q.suggestedContentType,
      region: q.region,
    })
    const auth = scoreTopicAuthority({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
      hasOwner: Boolean(ownerHint.matched?.owner_url),
      host: ownerHint.host,
      registryAction: ownerHint.action,
    })
    opportunities.push({
      ...q,
      score: q.score * 0.5 + auth.total * 35,
      ownerHint,
    })
  }
  opportunities.sort((a, b) => b.score - a.score)

  return {
    source,
    siteUrl: siteUrl || process.env.GSC_SITE_URL,
    opportunities,
  }
}

/** Opportunities safe for auto generate+ship (buildable, not ignore-only). */
export function pickAutoRunCandidates(
  opps: FactoryOpportunity[],
  limit: number,
): FactoryOpportunity[] {
  const eligible = opps
    .filter((o) => o.action === 'expand_or_build' || o.action === 'title_rewrite')
    .filter((o) => o.term.length >= 4)
    .filter((o) => o.impressions >= 8)
  // Prefer net-new expansion over title rewrites; then by score
  eligible.sort((a, b) => {
    const rank = (x: FactoryOpportunity) => (x.action === 'expand_or_build' ? 2 : 1)
    return rank(b) - rank(a) || b.score - a.score
  })
  return eligible.slice(0, Math.max(1, Math.min(limit, 40)))
}
