import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { runPlanner, loadPlansDashboard } from '@/lib/seoEngine/planner'
import { recordEngineRun } from '@/lib/seoEngine/knowledge'
import { formatEnginePairTape } from '@/lib/seoEngine/engineAi'

/**
 * GET /api/seo-engine/plan
 * Latest cluster plans + (stage × country) coverage map for the dashboard.
 *
 * POST /api/seo-engine/plan  (body: { stage?, country?, signals?, knowledge?, draftBriefs?, limit? })
 * Runs the master planner: GSC demand + knowledge intel + life-cycle ontology
 * → ranked cluster plans persisted to seo_cluster_plans.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const dash = await loadPlansDashboard()
    return NextResponse.json({ ok: true, ...dash })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'plans failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      stage?: string
      country?: string
      draftBriefs?: boolean
      limit?: number
      aiProvider?: string
    }
    const { plans, pair, persisted, persistErrors } = await runPlanner({
      stage: body.stage,
      country: body.country,
      draftBriefs: body.draftBriefs !== false,
      limit: body.limit,
      aiProvider: body.aiProvider ? String(body.aiProvider) : undefined,
    })
    const persistIssue = (persistErrors?.length ?? 0) > 0
    await recordEngineRun(
      'plan',
      persistIssue || !plans.length ? 'partial' : 'success',
      {
        plans: plans.length,
        persisted: persisted ?? plans.length,
        persistErrors: persistErrors?.length ?? 0,
        pair: formatEnginePairTape(pair),
      },
      persistErrors || [],
      'admin',
    )
    // The desk must never believe 20 plans reached the DB when 0 did.
    return NextResponse.json({
      ok: true,
      plans,
      count: plans.length,
      persisted: persisted ?? plans.length,
      persistErrors: persistErrors || [],
      pair,
    })
  } catch (e) {
    await recordEngineRun('plan', 'failed', {}, [e instanceof Error ? e.message : 'unknown'], 'admin')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'planning failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
