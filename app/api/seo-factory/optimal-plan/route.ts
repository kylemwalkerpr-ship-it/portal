import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { buildKeywordPlan, planTermsForAutoRun } from '@/lib/seoFactory/keywordPlanner'
import { getGscAccess } from '@/lib/gscAuth'
import { listConfiguredContentProviders } from '@/lib/contentAiProvider'
import { describeEstateContract } from '@/lib/seoFactory/shipGate'

/**
 * GET/POST /api/seo-factory/optimal-plan
 *
 * Maximally optimal editorial feed for Content Studio + agent/MCP handoff:
 *   GSC demand × AEO/SEO/GEO authority × lane mix × estate-ready ship hints.
 *
 * Query/body:
 *   planLimit?, boardLimit?, regionFilter?, minImpressions?,
 *   mixRefresh?, mixExpand?, mixNew?
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

    const planLimit = Math.min(30, Math.max(3, num('planLimit', 12)))
    const boardLimit = Math.min(200, Math.max(20, num('boardLimit', 80)))
    const minImpressions = Math.max(1, num('minImpressions', 5))
    const regionFilter = str('regionFilter')?.toUpperCase()
    const mixRefresh = num('mixRefresh', 40) / 100
    const mixExpand = num('mixExpand', 35) / 100
    const mixNew = num('mixNew', 25) / 100

    const gscAccess = await getGscAccess()
    const siteUrl =
      gscAccess?.siteUrl ||
      process.env.GSC_SITE_URL ||
      'sc-domain:yousafeconsultancy.com'

    const kwPlan = await buildKeywordPlan({
      planLimit,
      boardLimit,
      minImpressions,
      regionFilter,
      targetMix: { refresh: mixRefresh, expand: mixExpand, build_new: mixNew },
    })

    // Agent/MCP handoff: ordered terms + host for Auto-Pilot shipMode none
    const autoTerms = planTermsForAutoRun(kwPlan.plan, Math.min(planLimit, 10))
    const agentFeed = kwPlan.plan.map((p, i) => ({
      rank: i + 1,
      term: p.term,
      lane: p.lane,
      authorityScore: p.authorityScore,
      demandScore: p.demandScore,
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
    }))

    const providers = listConfiguredContentProviders()
    const estate = describeEstateContract()

    return NextResponse.json({
      ok: true,
      stack: 'gsc + authority + estate shipGate + cf/gig AI chain',
      siteUrl,
      gscLive: Boolean(gscAccess?.accessToken),
      gscSource: kwPlan.source,
      generatedAt: kwPlan.generatedAt,
      summary: kwPlan.summary,
      warnings: [
        ...kwPlan.warnings,
        !gscAccess?.accessToken
          ? 'GSC live offline — plan used snapshot/demand feed. Configure SA or OAuth for maximal accuracy.'
          : null,
      ].filter(Boolean),
      mix: kwPlan.mix,
      targetMix: kwPlan.targetMix,
      /** Top board (research) */
      board: kwPlan.board.slice(0, boardLimit),
      /** Executable editorial plan */
      plan: agentFeed,
      /** Drop into Auto-Pilot “Run selected” / terms */
      autoRunTerms: autoTerms,
      autoRunBody: {
        terms: autoTerms,
        limit: Math.min(5, autoTerms.length || 3),
        shipMode: 'none',
        minAuditScore: 55,
        maxRefine: 2,
        skipRecent: true,
        useKeywordPlan: false,
      },
      mcp: {
        server: 'gsc (mcp-search-console)',
        property: siteUrl,
        prompts: [
          `Show top 50 queries for ${siteUrl} last 28 days with impressions > 20 and position between 4 and 20, sorted by impressions.`,
          `Find high-impression low-CTR queries for ${siteUrl} last 90 days (CTR below expected for position).`,
          `Compare last 28 days vs previous 28 days for ${siteUrl}; list biggest query winners and losers.`,
          `Batch inspect these URLs for indexing issues: ${agentFeed
            .slice(0, 5)
            .map((p) => p.canonical)
            .filter(Boolean)
            .join(', ')}`,
        ],
        handoff: 'Pass autoRunTerms into Content Studio Auto-Pilot or POST /api/seo-factory/auto-run with autoRunBody.',
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
