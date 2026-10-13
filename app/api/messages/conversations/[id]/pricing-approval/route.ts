import { requirePortalUser } from '@/lib/portalAuth'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!PROVIDER_ROLES.has(auth.role)) return Response.json({ error: 'Provider account required.' }, { status: 403 })
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const requestId = String(body.request_id || '')
  const version = Number(body.version)
  const decision = body.decision === 'approved' || body.decision === 'declined' ? body.decision : ''
  if (!requestId || !Number.isInteger(version) || version < 1 || !decision) return Response.json({ error: 'Invalid approval decision.' }, { status: 400 })
  const { data: conversation } = await auth.db.from('conversations').select('participant_a, participant_b').eq('id', id).maybeSingle()
  if (!conversation) return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  if (![conversation.participant_a, conversation.participant_b].includes(auth.profileId)) return Response.json({ error: 'Forbidden.' }, { status: 403 })
  const { data, error } = await auth.db.rpc('resolve_yqaa_pricing_approval', {
    p_conversation_id: id,
    p_request_id: requestId,
    p_version: version,
    p_provider_id: auth.profileId,
    p_decision: decision,
  })
  if (error) {
    const missing = /resolve_yqaa_pricing_approval|yqaa_pricing_approvals|does not exist/i.test(error.message || '')
    return Response.json({ error: missing ? 'Pricing approvals are not available until the additive YQAA migration is applied.' : 'Could not resolve this pricing request.' }, { status: missing ? 503 : 409 })
  }
  return Response.json({ approval: data })
}
