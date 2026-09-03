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
import { STRATEGIC_KEYWORDS } from '@/lib/seoKnowledgeBase'
import { filterRegenerationCandidates, type RegenerationFilters } from '@/lib/seoEngine/intelligence'
import { leanRanking, rankingForOpportunity } from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

function normalizedTopic(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function selectVariedOpportunities(
  items: Array<Record<string, any>>,
  limit: number,
  seed: string,
  excluded: Set<string>,
  regenerationFilters: RegenerationFilters = {},
): Array<Record<string, any>> {
  // Filters are strict: never fall back to an excluded/cannibalized item just
  // to fill the carousel. An empty result is an honest signal to rescan or
  // relax the operator's criteria.
  const filtered = filterRegenerationCandidates(items, regenerationFilters)
  const eligible = filtered.filter((item) => !excluded.has(normalizedTopic(item.topic)))
  const pool = eligible.slice(0, Math.max(48, limit * 8))
  if (!pool.length) return []
  const offset = stableHash(seed) % pool.length
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)]
  const selected: Array<Record<string, any>> = []
  const buckets = new Set<string>()
  for (const item of rotated) {
    if (selected.length >= limit) break
    const bucket = `${item.play || 'unknown'}|${item.contentType || 'article'}|${item.region || 'all'}`
    if (buckets.has(bucket)) continue
    buckets.add(bucket)
    selected.push(item)
  }
  for (const item of rotated.filter((candidate) => eligible.includes(candidate))) {
    if (selected.length >= limit) break
    if (selected.some((chosen) => normalizedTopic(chosen.topic) === normalizedTopic(item.topic))) continue
    selected.push(item)
  }
  return selected
}

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
    const variationSeed = typeof body.nonce === 'string' && body.nonce.trim() ? body.nonce : new Date().toISOString()
    const excludedTopics = new Set(
      Array.isArray(body.excludeTopics)
        ? body.excludeTopics.map((topic) => normalizedTopic(topic)).filter(Boolean).slice(-160)
        : [],
    )
    const allowedPlays = new Set(['content_gap', 'quick_win', 'refresh', 'defend', 'cannibalization'])
    const regenerationFilters: RegenerationFilters = {
      plays: Array.isArray(body.plays) ? body.plays.map(String).filter((play) => allowedPlays.has(play)) as RegenerationFilters['plays'] : undefined,
      excludeCannibalization: body.excludeCannibalization !== false,
      minOpportunityScore: typeof body.minOpportunityScore === 'number' ? body.minOpportunityScore : undefined,
      maxDifficultyScore: typeof body.maxDifficultyScore === 'number' ? body.maxDifficultyScore : undefined,
      region: typeof body.filterRegion === 'string' ? body.filterRegion : undefined,
      intents: Array.isArray(body.intents) ? body.intents.map(String) : undefined,
      excludeTopics: Array.from(excludedTopics),
    }

    // ── 1. Search demand (live or snapshot) ────────────────────────────────
    const live = await fetchSiteSearchAnalytics(90)
    let queries: OpportunityEngineInput['queries'] = []
    let source = 'snapshot'
    let snapshotMeta: { generatedAt?: string } | null = null
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
      const snap = await loadGscSnapshot({ allowStale: false, maxAgeDays: 14 })
      snapshotMeta = { generatedAt: snap.generatedAt }
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
      if (queries.length === 0) {
        // The 14-day stale guard refused the snapshot (older than 14 days or
        // missing) — never score dated demand as live. Keep the raw snapshot
        // date so the UI's stale banner can fire even though we refuse to
        // score it.
        warnings.push(
          'GSC snapshot is stale or unavailable (older than 14 days or missing). ' +
            'Refusing snapshot demand — regenerate the snapshot (re-export from Search Console) or fix live GSC credentials.',
        )
        try {
          const raw = await loadGscSnapshot()
          snapshotMeta = { generatedAt: raw.generatedAt }
        } catch {
          /* no snapshot date to show */
        }
      } else {
        warnings.push('Opportunity scoring on CSV snapshot — connect live Search Console for fresher data')
      }
    }
    // Radar honesty: when BOTH live GSC and a fresh ≤14d snapshot are absent,
    // there is NO real demand to score. Strategy-corpus rows must never be
    // injected into the scored pool with fabricated impressions:1 as if they
    // were Search Console demand.
    const snapshotRefused = queries.length === 0

    // ── 2. Existing content inventory (coverage + cannibalization) ─────────
    let coverage: OpportunityEngineInput['coverage'] = []
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data } = await supabase
        .from('content_jobs')
        .select('title, topic, primary_keyword, status, content_path, canonical_url')
        .order('created_at', { ascending: false })
        .limit(300)
      coverage = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((j) => j && (j.title || j.topic || j.primary_keyword))
        .map((j) => ({
          title: String(j.title || j.topic || j.primary_keyword || ''),
          topic: j.topic ? String(j.topic) : null,
          primaryKeyword: j.primary_keyword ? String(j.primary_keyword) : null,
          status: j.status ? String(j.status) : null,
          url: String(j.canonical_url || j.content_path || '').trim() || null,
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

    // ── 4.25 Full strategy corpus ──────────────────────────────────────────
    // GSC is the demand signal, but it is not the whole editorial brain. Add a
    // bounded, clearly low-demand knowledge signal pool from the strategy corpus
    // so the radar can surface authority gaps and not repeat the same GSC rows.
    const topicTokens = new Set(
      `${seedTopic} ${region}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3),
    )
    const knowledgeSignals = STRATEGIC_KEYWORDS
      .map((keyword, index) => {
        const haystack = `${keyword.term} ${keyword.cluster} ${keyword.intent}`.toLowerCase()
        const relevance = [...topicTokens].reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
        return { keyword, relevance, tie: stableHash(`${variationSeed}:${keyword.term}:${index}`) }
      })
      .filter(({ keyword }) => keyword.surface !== 'marketplace' || /service|help|consult|review/i.test(keyword.term))
      .sort((a, b) => b.relevance - a.relevance || a.tie - b.tie)
      .slice(0, 160)
      .map(({ keyword, tie }) => ({
        term: keyword.term,
        clicks: 0,
        impressions: 1,
        ctr: 0,
        position: 60 + (tie % 20),
        url: '',
        knowledgeBase: true,
      }))
    const knownTerms = new Set(queries.map((query) => normalizedTopic(query.term)))
    if (!snapshotRefused) {
      for (const signal of knowledgeSignals) {
        if (!knownTerms.has(normalizedTopic(signal.term))) {
          queries.push(signal)
          knownTerms.add(normalizedTopic(signal.term))
        }
      }
      warnings.push(`Strategy knowledge corpus active · ${knowledgeSignals.length} supplemental authority signals`)
    } else {
      warnings.push(
        'Strategy knowledge corpus withheld from scoring — no live/snapshot GSC demand to supplement. ' +
          'Knowledge signals are returned separately (synthetic:true) and never fill the opportunity list as if they were GSC.',
      )
    }

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

    // ── 5.25 Withheld knowledge corpus (snapshot refused) ─────────────────
    // When no real GSC demand exists the radar does not lead with fabricated
    // impressions. The strategy corpus is still surfaced — separately, with
    // zero demand and synthetic:true — so authority gaps stay undiscoverable
    // only by explicit opt-in, never dressed up as Search Console rows.
    const syntheticSignals = snapshotRefused && knowledgeSignals.length
      ? knowledgeSignals.slice(0, Math.max(limit * 3, 9)).map((signal) => ({
          topic: signal.term,
          title: signal.term,
          primaryKeyword: signal.term,
          keywords: [signal.term],
          audience: null,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 0,
          knowledgeBase: true,
          synthetic: true,
          play: 'content_gap',
          intent: null,
          contentType: 'article',
          region,
          opportunityScore: null,
          demandScore: null,
          upsideScore: null,
          difficultyScore: null,
          reason: 'Strategy knowledge corpus — NOT Search Console demand (snapshot refused). No impressions to score.',
          signals: ['Strategy knowledge-base authority signal · no scored demand'],
          interlinks: null,
          coverage: null,
          ranking: leanRanking(rankingForOpportunity({
            term: signal.term,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            position: 100,
            region,
          })),
        }))
      : []

    const variedOpportunities = selectVariedOpportunities(
      result.opportunities as Array<Record<string, any>>,
      limit,
      variationSeed,
      excludedTopics,
      regenerationFilters,
    )
    const knowledgeTerms = new Set(knowledgeSignals.map((signal) => normalizedTopic(signal.term)))
    const suggestions = variedOpportunities.map((o) => {
      // Synthetic rows originate from the strategy knowledge corpus, not Search
      // Console. They are scored with zero demand and flagged so the UI never
      // reads their numbers as real GSC impressions/clicks.
      const synthetic = knowledgeTerms.has(normalizedTopic(o.topic))
      // Deterministic ranking-model enrichment (lean view) — same brain as the
      // command-center radar so Quick Create briefs can show score + forecast.
      const ranking = leanRanking(rankingForOpportunity({
        term: o.topic,
        impressions: Number(o.impressions) || 0,
        clicks: Number(o.clicks) || 0,
        ctr: Number(o.ctr) || 0,
        position: Number(o.position) || 100,
        region,
        lifecycleStage: o.stage || undefined,
      }))
      return {
      topic: o.topic,
      title: o.title,
      primaryKeyword: o.primaryKeyword,
      keywords: o.keywords,
      audience: o.audience,
      impressions: o.impressions,
      clicks: o.clicks,
      ctr: o.ctr,
      position: o.position,
      knowledgeBase: synthetic,
      synthetic,
      demandScore: o.demandScore,
      upsideScore: o.upsideScore,
      difficultyScore: o.difficultyScore,
      opportunityScore: o.opportunityScore,
      valueScore: o.valueScore,
      priorityTier: o.priorityTier,
      trend: o.trend,
      play: o.play,
      intent: o.intent,
      contentType: o.contentType,
      intentCategory: o.intent,
      profitability: o.profitability,
      reason: o.reason,
      cluster: clusterResult.byTerm[o.topic] || null,
      signals: [
        ...(o.signals || []),
        ...(synthetic ? ['Strategy knowledge-base authority signal'] : []),
      ],
      interlinks: o.interlinks,
      coverage: o.coverage,
      sourcePage: o.sourcePage,
      ranking,
      }
    })

    return NextResponse.json({
      region,
      suggestions,
      opportunities: selectVariedOpportunities(
        result.opportunities as Array<Record<string, any>>,
        24,
        `${variationSeed}:insights`,
        excludedTopics,
      ),
      source,
      snapshot: snapshotMeta,
      snapshotRefused,
      syntheticSignals,
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
