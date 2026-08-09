import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { runVisibilityAudits, loadVisibilityFeed } from '@/lib/seoEngine/llmVisibility'

/**
 * GET /api/seo-engine/llm-visibility
 * Recent prompt audits + share-of-voice summary for the dashboard.
 *
 * POST /api/seo-engine/llm-visibility
 * Run a fresh audit batch. Body: { queries?: string[], engineLabel?: string, maxAudits?: number }
 * Each query is answered by the AI cascade and checked for estate citations.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const feed = await loadVisibilityFeed()
    return NextResponse.json({ ok: true, ...feed })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'visibility feed failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as { queries?: string[]; engineLabel?: string; maxAudits?: number }
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
