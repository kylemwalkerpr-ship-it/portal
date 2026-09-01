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
    const { plans, pair } = await runPlanner({
      stage: body.stage,
      country: body.country,
      draftBriefs: body.draftBriefs !== false,
      limit: body.limit,
      aiProvider: body.aiProvider ? String(body.aiProvider) : undefined,
    })
    await recordEngineRun('plan', plans.length ? 'success' : 'partial', {
      plans: plans.length,
      pair: formatEnginePairTape(pair),
    }, [], 'admin')
    return NextResponse.json({ ok: true, plans, count: plans.length, pair })
  } catch (e) {
    await recordEngineRun('plan', 'failed', {}, [e instanceof Error ? e.message : 'unknown'], 'admin')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'planning failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
