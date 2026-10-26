import { requirePortalUser } from '@/lib/portalAuth'
import { applyMemoryMutation, loadYqaaConsent } from '@/lib/yqaaPrivacy'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only the authenticated customer may inspect their scoped consent. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  if (!uuid.test(id)) return Response.json({ error: 'Invalid scope' }, { status: 400 })
  if (!['client', 'student'].includes(auth.role)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { data: conversation, error } = await auth.db.from('conversations')
      .select('participant_a, participant_b').eq('id', id).maybeSingle()
    if (error) throw error
    if (!conversation || ![conversation.participant_a, conversation.participant_b].includes(auth.profileId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const consent = await loadYqaaConsent(auth.db, id)
    if (consent && consent.subject_id !== auth.profileId) return Response.json({ error: 'Forbidden' }, { status: 403 })
    return Response.json({ consent: consent || { version: 0, granted: false, cross_site_linking: false } },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Privacy state unavailable' }, { status: 503 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  // Require same-origin browser mutations; missing Origin is allowed for native
  // authenticated clients, which still need the existing verified portal session.
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!uuid.test(id) || !body || !uuid.test(body.requestId || '') ||
      !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 ||
      !['grant', 'forget', 'withdraw'].includes(body.action) ||
      (body.action === 'grant' && body.explicitOptIn !== true) ||
      (body.crossSiteLinking !== undefined && body.crossSiteLinking !== false)) {
    return Response.json({ error: 'Invalid privacy mutation; cross-site linking is unavailable' }, { status: 400 })
  }
  try {
    // The RPC checks the authenticated subject against canonical participants
    // under the conversation lock; callers cannot supply a different subject.
    const receipt = await applyMemoryMutation(auth.db, {
      scopeId: id, subjectId: auth.profileId, expectedVersion: body.expectedVersion,
      requestId: body.requestId, action: body.action, explicitOptIn: body.explicitOptIn,
    })
    const consent = await loadYqaaConsent(auth.db, id)
    return Response.json({ receipt, consent }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    const status = error?.code === '42501' ? 403 : error?.code === '40001' ? 409 : error?.code === '22023' ? 400 : 503
    return Response.json({ error: 'Privacy mutation was not confirmed' }, { status })
  }
}
