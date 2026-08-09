import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateInterlinkPlan, persistInterlinkPlan, loadInterlinkGraph, type InterlinkPlanInput } from '@/lib/seoEngine/interlink'

/**
 * GET /api/seo-engine/interlink
 * The persisted interlink graph (planned + applied edges) for the dashboard.
 *
 * POST /api/seo-engine/interlink
 * Generate + persist an auto-interlink plan for a cluster.
 * Body: { sourceSlug, stage, country, contentType, clusterId?, relatedTerms?, serviceCategory? }
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const graph = await loadInterlinkGraph()
    return NextResponse.json({ ok: true, ...graph })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'interlink failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<InterlinkPlanInput>
    if (!body.sourceSlug || !body.stage || !body.country || !body.contentType) {
      return NextResponse.json({ ok: false, error: 'sourceSlug, stage, country and contentType are required' }, { status: 400 })
    }
    const edges = generateInterlinkPlan({
      sourceSlug: body.sourceSlug,
      stage: body.stage,
      country: body.country,
      contentType: body.contentType,
      clusterId: body.clusterId,
      relatedTerms: body.relatedTerms,
      serviceCategory: body.serviceCategory,
    })
    const persisted = await persistInterlinkPlan(edges)
    return NextResponse.json({ ok: true, edges, stored: persisted.stored })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'interlink generation failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
