import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { enforceGate, loadGateRuns, extractComplianceSignals } from '@/lib/seoEngine/gate'

/**
 * GET /api/seo-engine/gate
 * Recent compliance gate runs + pass rate for the dashboard.
 *
 * POST /api/seo-engine/gate
 * Enforce the AEO/GEO/YMYL compliance gate on a plan or draft.
 * Body (plan/brief):
 *   { subjectType: 'plan'|'brief', stage, country, clusterId? }
 * Body (draft/job):
 *   { subjectType: 'draft'|'job', subjectId?, stage, country, draft, title? }
 * Returns the verdict with explicit blockers — nothing hidden.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const runs = await loadGateRuns()
    return NextResponse.json({ ok: true, ...runs })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'gate runs failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      subjectType: 'plan' | 'draft' | 'job' | 'brief'
      subjectId?: string
      clusterId?: string
      stage: string
      country?: string
      draft?: string
      title?: string
    }
    if (!body.subjectType || !body.stage) {
      return NextResponse.json({ ok: false, error: 'subjectType and stage are required' }, { status: 400 })
    }
    const verdict = await enforceGate(
      {
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        clusterId: body.clusterId,
        stage: body.stage,
        country: body.country,
      },
      body.draft,
      { stage: body.stage, country: body.country, title: body.title },
    )
    return NextResponse.json({ ok: true, ...verdict })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'gate enforcement failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
