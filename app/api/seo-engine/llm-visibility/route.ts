import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  runVisibilityAudits,
  loadVisibilityFeed,
  runFanOutVisibilityAudits,
  loadVisibilityByCluster,
} from '@/lib/seoEngine/llmVisibility'

/**
 * GET /api/seo-engine/llm-visibility
 * Recent prompt audits + share-of-voice summary for the dashboard, plus the
 * per-cluster fan-out citation map that feeds the ranking model's aeoGeo family.
 *
 * POST /api/seo-engine/llm-visibility
 * Run a fresh audit batch. Body: { queries?: string[], engineLabel?: string,
 * maxAudits?: number, fanOut?: boolean, planLimit?: number, maxPerPlan?: number }
 * Each query is answered by the AI cascade and checked for estate citations.
 * When fanOut: true, sub-queries are built from the top cluster plans (FAQ +
 * related terms + primary) and audited with cluster provenance.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const [feed, byCluster] = await Promise.all([loadVisibilityFeed(), loadVisibilityByCluster()])
    return NextResponse.json({ ok: true, ...feed, byCluster })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'visibility feed failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as { queries?: string[]; engineLabel?: string; maxAudits?: number; fanOut?: boolean; planLimit?: number; maxPerPlan?: number }
    if (body.fanOut) {
      const result = await runFanOutVisibilityAudits({
        planLimit: body.planLimit,
        maxPerPlan: body.maxPerPlan,
        maxAudits: body.maxAudits,
        engineLabel: body.engineLabel,
      })
      return NextResponse.json({ ok: true, fanOut: true, ...result })
    }
    const result = await runVisibilityAudits({
      queries: body.queries,
      engineLabel: body.engineLabel,
      maxAudits: body.maxAudits,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'audit failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
