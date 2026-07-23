import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  buildKeywordPlan,
  planTermsForAutoRun,
  type PlanLane,
} from '@/lib/seoFactory/keywordPlanner'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'

/**
 * GET /api/seo-factory/keyword-plan
 * Research board + balanced editorial plan from GSC + ownership + jobs.
 *
 * Query:
 *   planLimit, boardLimit, minImpressions, region, recentDays
 *   refresh, expand, build_new  (mix weights 0–1)
 *
 * POST — execute plan items through factory pipeline
 * Body:
 *   limit?, lanes?, shipMode?, dryRun?, minAuditScore?, maxRefine?
 *   terms? (override) | usePlan: true (default)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const sp = request.nextUrl.searchParams
    const result = await buildKeywordPlan({
      planLimit: Number(sp.get('planLimit') || 12),
      boardLimit: Number(sp.get('boardLimit') || 80),
      minImpressions: Number(sp.get('minImpressions') || 5),
      regionFilter: sp.get('region') || undefined,
      recentDays: Number(sp.get('recentDays') || 45),
      targetMix: {
        refresh: sp.has('refresh') ? Number(sp.get('refresh')) : 0.4,
        expand: sp.has('expand') ? Number(sp.get('expand')) : 0.35,
        build_new: sp.has('build_new') ? Number(sp.get('build_new')) : 0.25,
      },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[seo-factory/keyword-plan GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Plan failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(5, Math.max(1, Number(body.limit) || 3))
    const dryRun = Boolean(body.dryRun)
    const minAuditScore = body.minAuditScore != null ? Number(body.minAuditScore) : 65
    const maxRefine = body.maxRefine != null ? Number(body.maxRefine) : 2
    const shipMode = (body.shipMode || 'pr') as 'pr' | 'auto' | 'autodeploy' | 'none'
    const lanes = (Array.isArray(body.lanes) ? body.lanes : ['refresh', 'expand', 'build_new']) as PlanLane[]

    const planResult = await buildKeywordPlan({
      planLimit: Math.max(limit * 3, 12),
      boardLimit: 100,
      targetMix: body.targetMix,
      regionFilter: body.regionFilter,
      minImpressions: body.minImpressions,
    })

    const explicit: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []
    const terms =
      explicit.length > 0
        ? explicit.slice(0, limit)
        : planTermsForAutoRun(planResult.plan, limit, lanes)

    if (!terms.length) {
      return NextResponse.json({
        ok: true,
        message: 'No plan items to execute for selected lanes',
        plan: planResult.plan,
        results: [],
      })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile
        ?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const results: Array<Record<string, unknown>> = []
    for (const term of terms) {
      const item = planResult.plan.find((p) => p.term === term) || planResult.board.find((b) => b.term === term)
      try {
        const r = await runSeoFactoryPipeline({
          topic: term,
          title: term,
          primaryKeyword: term,
          region: (item as any)?.region || 'US',
          contentType: (item as any)?.contentType || (item as any)?.suggestedContentType || 'legal_guide',
          shipMode,
          dryRun,
          minAuditScore,
          maxRefine,
          opportunityAction:
            (item as any)?.lane === 'refresh'
              ? 'title_rewrite'
              : (item as any)?.lane === 'expand'
                ? 'expand_or_build'
                : 'expand_or_build',
          userId,
        })
        results.push({
          ok: r.ok && !r.shipError,
          term,
          lane: (item as any)?.lane,
          host: r.plan.host,
          repo: r.plan.repo,
          path: r.plan.filePath,
          audit: r.audit.score,
          ship: r.ship,
          shipError: r.shipError,
          provider: r.provider,
          attempts: r.attempts,
          jobId: r.jobId,
        })
      } catch (e) {
        results.push({
          ok: false,
          term,
          error: e instanceof Error ? e.message : 'Failed',
        })
      }
    }

    const shipped = results.filter((r) => r.ok && r.ship).length
    return NextResponse.json({
      ok: true,
      summary: planResult.summary,
      source: planResult.source,
      terms,
      shipped,
      results,
      planPreview: planResult.plan.slice(0, 20),
      message: dryRun
        ? `Keyword-plan dry-run: ${results.length} items`
        : `Keyword-plan execute: ${shipped}/${results.length} shipped`,
    })
  } catch (err) {
    console.error('[seo-factory/keyword-plan POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Execute failed' },
      { status: 500 },
    )
  }
}
