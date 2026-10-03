import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { executeP11AuditCommand, profileP11Actor, validP11IdempotencyKey, type P11AuditRequest } from '@/lib/seoEngine/p11AuditCommand'
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
    const key = req.headers.get('Idempotency-Key')
    if (!validP11IdempotencyKey(key)) return NextResponse.json({ ok: false, error: 'A valid Idempotency-Key header (8–200 printable ASCII characters) is required' }, { status: 400 })
    const body = (await req.json()) as P11AuditRequest
    const outcome = await executeP11AuditCommand({
      actor: profileP11Actor(auth.profileId),
      idempotencyKey: key,
      request: body,
      run: async (command) => command.request.fanOut
        ? runFanOutVisibilityAudits({ ...command.request, command })
        : runVisibilityAudits({ ...command.request, command }),
    })
    if (outcome.kind === 'conflict') return NextResponse.json({ ok: false, error: 'Idempotency key was already used with a different request', commandId: outcome.command.id }, { status: 409 })
    if (outcome.kind === 'pending') return NextResponse.json({ ok: true, replayed: true, commandId: outcome.command.id, status: outcome.command.status, recoverable: true }, { status: 202 })
    return NextResponse.json({ ok: true, replayed: outcome.replayed === true, commandId: outcome.command.id, ...(outcome.command.request_json?.fanOut === true ? { fanOut: true } : {}), ...(outcome.result as object) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'audit failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
