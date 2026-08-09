import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  computeRankingScore,
  loadRankingScores,
  persistRankingScore,
  persistForecast,
  runRankingPassForPlans,
  type RankingModelInput,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

/**
 * GET  /api/seo-engine/rank  — latest ranking-model scores (optional scope/country/stage)
 * POST /api/seo-engine/rank  — compute (and persist) the composite ranking score for a
 *                              topic/page/plan from GSC + audit + links + evidence.
 *                              Special mode: body.scope === 'plans' runs the bulk pass
 *                              over the top planner missions (cron + dashboard shared).
 *
 * The model is deterministic; this endpoint is the single compute surface the
 * dashboard panels consume.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sp = req.nextUrl.searchParams
  const scores = await loadRankingScores({
    limit: Number(sp.get('limit')) || 25,
    scope: sp.get('scope') || undefined,
    country: sp.get('country') || undefined,
    stage: sp.get('stage') || undefined,
  })
  return NextResponse.json({ ok: true, modelVersion: 'seo-ranking-model-v1', scores })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (String(body.scope || '').toLowerCase() === 'plans') {
      const result = await runRankingPassForPlans(
        typeof body.limit === 'number' ? body.limit : 15,
      )
      return NextResponse.json({ ok: true, scope: 'plans', ...result })
    }
    if (!topic) {
      return NextResponse.json({ ok: false, error: 'topic is required' }, { status: 400 })
    }
    const input: RankingModelInput = {
      topic,
      scope: (body.scope as RankingModelInput['scope']) || 'topic',
      subjectKey: body.subjectKey ? String(body.subjectKey) : null,
      url: body.url ? String(body.url) : null,
      country: body.country ? String(body.country) : null,
      stage: body.stage ? String(body.stage) : null,
      intentOverride: body.intentOverride as RankingModelInput['intentOverride'],
      gsc: (body.gsc as RankingModelInput['gsc']) || undefined,
      audit: (body.audit as RankingModelInput['audit']) || undefined,
      links: (body.links as RankingModelInput['links']) || undefined,
      evidence: (body.evidence as RankingModelInput['evidence']) || undefined,
      knowledgeBias: typeof body.knowledgeBias === 'number' ? body.knowledgeBias : undefined,
      llmVisibility: (body.llmVisibility as RankingModelInput['llmVisibility']) || undefined,
    }
    const score = computeRankingScore(input)
    if (body.persist !== false) {
      await persistRankingScore(score)
      await persistForecast(score.topic, score.forecast, score.subjectKey)
    }
    return NextResponse.json({ ok: true, score })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'ranking model failed' },
      { status: 500 },
    )
  }
}
