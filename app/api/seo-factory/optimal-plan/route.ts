import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { buildKeywordPlan, planTermsForAutoRun } from '@/lib/seoFactory/keywordPlanner'
import { buildSeoWarRoom, playToOpportunityAction } from '@/lib/seoFactory/seoWarRoom'
import { getGscAccess } from '@/lib/gscAuth'
import { listConfiguredContentProviders } from '@/lib/contentAiProvider'
import { describeEstateContract } from '@/lib/seoFactory/shipGate'

/**
 * GET/POST /api/seo-factory/optimal-plan
 *
 * Maximally optimal editorial feed:
 *   War Room (CTR gap · strike · cannibal · AEO) × keyword lanes × estate shipGate.
 *
 * Query/body:
 *   planLimit?, boardLimit?, regionFilter?, minImpressions?,
 *   mixRefresh?, mixExpand?, mixNew?,
 *   useWarRoom? (default true), days?
 */
export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(request.url)
    let body: Record<string, unknown> = {}
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}))
    }

    const num = (k: string, def: number) => {
      const v = body[k] ?? url.searchParams.get(k)
      if (v == null || v === '') return def
      const n = Number(v)
      return Number.isFinite(n) ? n : def
    }
    const str = (k: string) => {
      const v = body[k] ?? url.searchParams.get(k)
      return v != null && String(v).trim() ? String(v).trim() : undefined
    }
    const bool = (k: string, def: boolean) => {
      const v = body[k] ?? url.searchParams.get(k)
      if (v == null || v === '') return def
      if (typeof v === 'boolean') return v
      const s = String(v).toLowerCase()
      if (s === '0' || s === 'false' || s === 'no') return false
      if (s === '1' || s === 'true' || s === 'yes') return true
      return def
    }

    const planLimit = Math.min(30, Math.max(3, num('planLimit', 12)))
    const boardLimit = Math.min(200, Math.max(20, num('boardLimit', 80)))
    const minImpressions = Math.max(1, num('minImpressions', 2))
    const regionFilter = str('regionFilter')?.toUpperCase()
    const mixRefresh = num('mixRefresh', 40) / 100
    const mixExpand = num('mixExpand', 35) / 100
    const mixNew = num('mixNew', 25) / 100
    const useWarRoom = bool('useWarRoom', true)
    const days = Math.min(180, Math.max(28, num('days', 90)))

    const gscAccess = await getGscAccess()
    const siteUrl =
      gscAccess?.siteUrl ||
      process.env.GSC_SITE_URL ||
      'sc-domain:yousafeconsultancy.com'

    // Parallel: war room (technician ranking) + classic keyword plan (lane mix)
    const [warRoom, kwPlan] = await Promise.all([
      useWarRoom
        ? buildSeoWarRoom({
            days,
            limit: Math.max(planLimit * 3, 40),
            minImpressions,
            regionFilter,
          })
        : Promise.resolve(null),
      buildKeywordPlan({
        planLimit,
        boardLimit,
        minImpressions: Math.max(minImpressions, 3),
        regionFilter,
        targetMix: { refresh: mixRefresh, expand: mixExpand, build_new: mixNew },
      }),
    ])

    // Prefer war-room order for auto-run; fall back to keyword plan terms
    const warTerms = warRoom?.autoRunTerms || []
    const kwTerms = planTermsForAutoRun(kwPlan.plan, Math.min(planLimit, 10))
    const autoTerms = (warTerms.length ? warTerms : kwTerms).slice(0, Math.min(planLimit, 12))

    // Agent feed: war-room queue first (play + gain), then keyword plan fillers
    const seen = new Set<string>()
    const agentFeed: Array<Record<string, unknown>> = []

    if (warRoom) {
      for (const o of warRoom.queue) {
        if (agentFeed.length >= planLimit) break
        const key = o.term.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        agentFeed.push({
          rank: agentFeed.length + 1,
          term: o.term,
          play: o.play,
          opportunityAction: playToOpportunityAction(o.play),
          lane:
            o.play === 'title_ctr_rewrite'
              ? 'refresh'
              : o.play === 'deep_demand_build' || o.play === 'aeo_entity_hub'
                ? 'build_new'
                : 'expand',
          authorityScore: o.authorityScore,
          demandScore: o.priorityScore,
          priorityScore: o.priorityScore,
          estimatedGainClicks: o.estimatedGainClicks,
          region: o.region,
          contentType: o.contentType,
          host: o.host,
          repo: o.repo,
          filePath: o.filePath,
          canonical: o.ownerUrl,
          shipHint: o.shipHint,
          contentAngle: o.contentAngle,
          writeHint: o.writeHint,
          rationale: o.rationale,
          impressions: o.impressions,
          position: o.position,
          ctr: o.ctr,
          expectedCtr: o.expectedCtr,
          ctrGap: o.ctrGap,
          pages: o.pages,
        })
      }
    }

    for (const p of kwPlan.plan) {
      if (agentFeed.length >= planLimit) break
      const key = p.term.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      agentFeed.push({
        rank: agentFeed.length + 1,
        term: p.term,
        play: p.lane === 'refresh' ? 'title_ctr_rewrite' : p.lane === 'build_new' ? 'deep_demand_build' : 'strike_distance',
        opportunityAction: p.lane === 'refresh' ? 'title_rewrite' : 'expand_or_build',
        lane: p.lane,
        authorityScore: p.authorityScore,
        demandScore: p.demandScore,
        priorityScore: p.authorityScore + p.demandScore,
        region: p.region,
        contentType: p.contentType,
        host: p.host,
        repo: p.repo,
        filePath: p.filePath,
        canonical: p.ownerUrl,
        shipHint: p.shipHint,
        contentAngle: p.contentAngle,
        writeHint: p.writeHint,
        rationale: p.rationale,
        impressions: p.impressions,
        position: p.position,
        ctr: p.ctr,
      })
    }

    const providers = listConfiguredContentProviders()
    const estate = describeEstateContract()

    const summaryParts = [
      warRoom?.summary,
      `Keyword lanes: ${kwPlan.summary}`,
      `Executable feed: ${agentFeed.length} terms (war-room first, lanes fill gaps).`,
    ].filter(Boolean)

    return NextResponse.json({
      ok: true,
      stack: 'war-room + gsc + authority + estate shipGate + cf/gig AI chain',
      siteUrl,
      gscLive: Boolean(gscAccess?.accessToken) || Boolean(warRoom?.kpis.liveGsc),
      gscSource: warRoom?.source || kwPlan.source,
      generatedAt: new Date().toISOString(),
      summary: summaryParts.join(' '),
      warnings: [
        ...(warRoom?.warnings || []),
        ...kwPlan.warnings,
        !gscAccess?.accessToken
          ? 'GSC live offline — plan used snapshot/demand feed. Configure SA or OAuth for maximal accuracy.'
          : null,
      ].filter(Boolean),
      mix: kwPlan.mix,
      targetMix: kwPlan.targetMix,
      warRoom: warRoom
        ? {
            kpis: warRoom.kpis,
            buckets: {
              title_ctr_rewrite: warRoom.buckets.title_ctr_rewrite.length,
              strike_distance: warRoom.buckets.strike_distance.length,
              deep_demand_build: warRoom.buckets.deep_demand_build.length,
              cannibal_merge: warRoom.buckets.cannibal_merge.length,
              aeo_entity_hub: warRoom.buckets.aeo_entity_hub.length,
              page1_defend: warRoom.buckets.page1_defend.length,
            },
            queue: warRoom.queue.slice(0, planLimit),
          }
        : null,
      /** Top board (research) */
      board: kwPlan.board.slice(0, boardLimit),
      /** Executable editorial plan (war-room prioritized) */
      plan: agentFeed,
      /** Drop into Auto-Pilot */
      autoRunTerms: autoTerms,
      autoRunBody: {
        terms: autoTerms.slice(0, Math.min(5, autoTerms.length || 3)),
        limit: Math.min(5, autoTerms.length || 3),
        shipMode: 'none',
        minAuditScore: 65,
        maxRefine: 2,
        skipRecent: true,
        useKeywordPlan: false,
        useWarRoom: true,
      },
      mcp: {
        server: 'gsc (mcp-search-console)',
        property: siteUrl,
        serviceAccount: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
        credentialsHint:
          'Local MCP: ~/.config/gsc/service_account.json for that SA. GSC UI must list the SA as Full user or API returns 403.',
        prompts: [
          `Show top 50 queries for ${siteUrl} last 28 days with impressions > 5 sorted by impressions.`,
          `Find high-impression low-CTR queries for ${siteUrl} last 90 days (CTR below expected for position 4–15).`,
          `Find strike-distance queries (position 11–20) with impressions ≥ 10 for ${siteUrl}.`,
          `Compare last 28 days vs previous 28 days for ${siteUrl}; list biggest query winners and losers.`,
          `Batch inspect these URLs for indexing issues: ${agentFeed
            .slice(0, 5)
            .map((p) => p.canonical)
            .filter(Boolean)
            .join(', ')}`,
        ],
        handoff:
          'Use War Room tab or POST /api/seo-factory/war-room. Pass autoRunTerms into Auto-Pilot or POST /api/seo-factory/auto-run with useWarRoom:true.',
      },
      aiProviders: providers,
      estate,
    })
  } catch (err) {
    console.error('[seo-factory/optimal-plan]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Optimal plan failed' },
      { status: 500 },
    )
  }
}
