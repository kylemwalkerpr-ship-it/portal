import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  recordOutreach,
  listOutreachForTarget,
  draftOutreachMessage,
  listTargetOpportunities,
} from '@/lib/seoEngine/backlinkEngine'
import type { Country, LifecycleStageDef } from '@/lib/seoEngine/ontology'

/**
 * POST /api/seo-engine/backlink/outreach
 *
 * Body shape:
 *   { action: 'draft' | 'record', ... }
 *
 * action 'draft':
 *   { action: 'draft', target_id, brief?: { topic, stage, country, url } }
 *   → returns { ok: true, subject, body, model } for operator review.
 *
 * action 'record':
 *   { action: 'record', target_id, channel?, direction?, subject?, message_body,
 *     status?, operator_id?, source_brief? }
 *   → returns { ok: true, outreach } persisted row.
 *
 * GET /api/seo-engine/backlink/outreach?target_id=...
 *   → returns the timeline of touches for one target.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '').trim()

    if (action === 'draft') {
      const target_id = String(body.target_id || '').trim()
      if (!target_id) return NextResponse.json({ ok: false, error: 'target_id required' }, { status: 400 })
      const targets = await listTargetOpportunities({ limit: 200 })
      const target = targets.find((t) => t.id === target_id)
      if (!target) return NextResponse.json({ ok: false, error: 'target not found' }, { status: 404 })
      const brief = (body.brief as { topic?: string; stage?: LifecycleStageDef; country?: Country; url?: string } | undefined) || undefined
      const draft = await draftOutreachMessage({ target, briefContext: brief, whyWeFit: typeof body.whyWeFit === 'string' ? body.whyWeFit : undefined })
      return NextResponse.json({ ok: true, ...draft })
    }

    if (action === 'record') {
      const target_id = String(body.target_id || '').trim()
      const message_body = String(body.message_body || '').trim()
      if (!target_id || !message_body) {
        return NextResponse.json({ ok: false, error: 'target_id and message_body required' }, { status: 400 })
      }
      const outreach = await recordOutreach({
        target_id,
        channel: (body.channel as any) || 'email',
        direction: (body.direction as any) || 'outbound',
        subject: body.subject ? String(body.subject) : undefined,
        message_body,
        status: (body.status as any) || 'drafted',
        operator_id: body.operator_id ? String(body.operator_id) : undefined,
        source_brief: (body.source_brief as Record<string, unknown>) || {},
      })
      if (!outreach) return NextResponse.json({ ok: false, error: 'persistence failed' }, { status: 500 })
      return NextResponse.json({ ok: true, outreach })
    }

    return NextResponse.json({ ok: false, error: `Unknown action '${action}'` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'outreach failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const url = new URL(req.url)
    const target_id = url.searchParams.get('target_id')?.trim() || ''
    if (!target_id) return NextResponse.json({ ok: false, error: 'target_id required' }, { status: 400 })
    const timeline = await listOutreachForTarget(target_id)
    return NextResponse.json({ ok: true, timeline })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'outreach timeline failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
