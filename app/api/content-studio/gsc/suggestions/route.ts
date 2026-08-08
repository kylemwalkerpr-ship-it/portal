import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { buildGscContentBrief, buildKeywordPortfolio } from '@/lib/gscContentBrief'
import { createClient } from '@supabase/supabase-js'
import {
  scoreOpportunities,
  type OpportunityEngineInput,
} from '@/lib/seoFactory/opportunityEngine'
import { buildKeywordClusters, type ClusterResolution } from '@/lib/seoFactory/keywordCluster'

export const runtime = 'nodejs'

/**
 * POST /api/content-studio/gsc/suggestions
 *
 * Opportunity Radar API — the intelligence layer behind Quick Create.
 *
 * 1. Loads real search demand (live GSC analytics or CSV snapshot fallback).
 * 2. Loads existing content inventory (content_jobs) for coverage + cannibalization.
 * 3. Loads the ecosystem internal-link registry.
 * 4. Runs the Opportunity Intelligence Engine → ranked, explainable suggestions
 *    with a full signals trail, play classification, intent, and interlink strategy.
 *
 * Body: { region?, topic?, limit? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const region = typeof body.region === 'string' ? body.region : 'US'
    const seedTopic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : ''
    const limit = typeof body.limit === 'number' ? Math.min(16, Math.max(3, body.limit)) : 6

    // ── 1. Search demand (live or snapshot) ────────────────────────────────
    const live = await fetchSiteSearchAnalytics(90)
    let queries: OpportunityEngineInput['queries'] = []
    let source = 'snapshot'
    const warnings: string[] = []

    if (live.configured && live.topQueries.length > 0) {
      source = 'live'
      queries = live.topQueries.map((q) => ({
        term: q.key,
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
        position: q.position,
      }))
      const prev = live.totalsPrev
      if (prev && prev.clicks > 0) {
        const change = ((live.totals.clicks - prev.clicks) / prev.clicks) * 100
        warnings.push(
          `GSC live · 90-day window · clicks ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% vs previous period`,
        )
      } else {
        warnings.push('GSC live · 90-day window')
      }
    } else {
      const snap = await loadGscSnapshot()
      const shape = (q: { term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
        term: q.term || q.url || '',
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
        position: q.position,
      })
      queries = [
        ...(snap.topQueries ?? []).map(shape),
        ...((snap.opportunities?.highImpressionLowCtr as Array<{ term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }> | undefined) ?? []).map(shape),
        ...((snap.opportunities?.highImpressionDeepRank as Array<{ term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }> | undefined) ?? []).map(shape),
      ]
      warnings.push('Opportunity scoring on CSV snapshot — connect live Search Console for fresher data')
    }

    // ── 2. Existing content inventory (coverage + cannibalization) ─────────
    let coverage: OpportunityEngineInput['coverage'] = []
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data } = await supabase
        .from('content_jobs')
        .select('title, topic, primary_keyword, status, content_path')
        .order('created_at', { ascending: false })
        .limit(300)
      coverage = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((j) => j && (j.title || j.topic || j.primary_keyword))
        .map((j) => ({
          title: String(j.title || j.topic || j.primary_keyword || ''),
          topic: j.topic ? String(j.topic) : null,
          primaryKeyword: j.primary_keyword ? String(j.primary_keyword) : null,
          status: j.status ? String(j.status) : null,
          url: j.content_path ? String(j.content_path) : null,
        }))
    } catch (err) {
      console.warn('[content-studio/gsc/suggestions] coverage load failed', err)
    }

    // ── 3. Internal-link registry ──────────────────────────────────────────
    let interlinks: OpportunityEngineInput['interlinks'] = []
    try {
      const { LINKS } = await import('@/lib/interlinkRegistry')
      interlinks = ((LINKS as unknown as Array<Record<string, unknown>>) || [])
        .map((l) => ({
          label: String(l.label || l.title || l.url || ''),
          url: String(l.url || ''),
          site: String(l.site || 'caseworks'),
          kind: String(l.kind || 'page'),
        }))
        .filter((l) => l.label && l.url)
    } catch (err) {
      console.warn('[content-studio/gsc/suggestions] interlink registry load failed', err)
    }

    // ── 4. Brief (portfolio snapshot + strategy hints, backward compat) ────
    const brief = await buildGscContentBrief({
      topic: seedTopic || 'immigration international students visas housing',
      region,
    })
    const portfolio = buildKeywordPortfolio(brief)

    // ── 4.5 Keyword clusters → canonical-page resolution (anti-cannibalization) ──
    // Cluster every query, resolve each cluster to ONE page, and feed the
    // engine's relatedByTerm so every suggestion carries its full cluster.
    let clusterResult = { byTerm: {} as Record<string, ClusterResolution>, relatedByTerm: {} as Record<string, string[]> }
    try {
      const { loadOwnershipRegistry } = await import('@/lib/seoDataLoaders')
      const registry = await loadOwnershipRegistry()
      clusterResult = await buildKeywordClusters({
        queries: queries.map((q) => ({ term: q.term, impressions: q.impressions, clicks: q.clicks, position: q.position })),
        region,
        registry: (registry.rows ?? []) as Array<{ primary_keyword?: string; owner_url?: string | null; owner_host?: string | null; action?: string }>,
        coverage: coverage.map((c) => ({ title: c.title, topic: c.topic, primaryKeyword: c.primaryKeyword, status: c.status, url: c.url })),
        minImpressions: 1,
      })
    } catch (err) {
      console.warn('[content-studio/gsc/suggestions] clustering skipped', err)
    }

    // ── 5. Run the Opportunity Intelligence Engine ─────────────────────────
    const result = scoreOpportunities({
      queries,
      coverage,
      interlinks,
      region,
      relatedByTerm: clusterResult.relatedByTerm,
      limit: 48,
    })

    const suggestions = result.opportunities.slice(0, limit).map((o) => ({
      topic: o.topic,
      title: o.title,
      primaryKeyword: o.primaryKeyword,
      keywords: o.keywords,
      audience: o.audience,
      impressions: o.impressions,
      clicks: o.clicks,
      ctr: o.ctr,
      position: o.position,
      demandScore: o.demandScore,
      upsideScore: o.upsideScore,
      difficultyScore: o.difficultyScore,
      opportunityScore: o.opportunityScore,
      trend: o.trend,
      play: o.play,
      intent: o.intent,
      contentType: o.contentType,
      intentCategory: o.intent,
      profitability: o.profitability,
      reason: o.reason,
      cluster: clusterResult.byTerm[o.topic] || null,
      signals: o.signals,
      interlinks: o.interlinks,
      coverage: o.coverage,
      sourcePage: o.sourcePage,
    }))

    return NextResponse.json({
      region,
      suggestions,
      opportunities: result.opportunities.slice(0, 24),
      source,
      coverageStats: result.coverageStats,
      cannibalization: result.cannibalization.slice(0, 8),
      strategyHints: brief.strategyHints ?? [],
      warnings,
      portfolioSnapshot: {
        primaryCount: portfolio.primary?.length ?? 0,
        secondaryCount: portfolio.secondary?.length ?? 0,
        longTailCount: portfolio.longTail?.length ?? 0,
      },
    })
  } catch (err) {
    console.error('[content-studio/gsc/suggestions]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build suggestions' },
      { status: 500 },
    )
  }
}
