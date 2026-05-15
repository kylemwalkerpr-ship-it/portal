/**
 * POST /api/messages/start
 *
 * Universal "start a conversation" handler. Resolves the counterpart by ANY of:
 *   - { counterpart_profile_id: '...' }     ← direct profile id
 *   - { counterpart_attorney_id: '...' }    ← attorneys row id (legacy)
 *   - { counterpart_consultant_id: '...' }  ← consultants row id
 *
 * Optional first message in the same call (body: { message }) so the
 * marketplace ChatSidePane can both create the conversation and post the
 * opening message in one round trip.
 *
 * Returns { conversation_id }.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { getOrCreateConversation } from '@/lib/conversations'

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 8000) : ''
  const contextKind = ['general', 'order', 'inquiry', 'gig'].includes(body.context_kind) ? body.context_kind : 'general'
  const contextId   = typeof body.context_id === 'string' ? body.context_id : null

  // Resolve counterpart profile id
  let counterpartId: string | null = null

  if (typeof body.counterpart_profile_id === 'string' && body.counterpart_profile_id) {
    counterpartId = body.counterpart_profile_id
  } else if (typeof body.counterpart_attorney_id === 'string' && body.counterpart_attorney_id) {
    const { data } = await db.from('attorneys').select('profile_id').eq('id', body.counterpart_attorney_id).maybeSingle()
    counterpartId = (data as any)?.profile_id || null
  } else if (typeof body.counterpart_consultant_id === 'string' && body.counterpart_consultant_id) {
    const { data } = await db.from('consultants').select('profile_id').eq('id', body.counterpart_consultant_id).maybeSingle()
    counterpartId = (data as any)?.profile_id || null
  }

  if (!counterpartId) return Response.json({ error: 'Could not resolve counterpart.' }, { status: 400 })
  if (counterpartId === profileId) return Response.json({ error: 'Cannot start a conversation with yourself.' }, { status: 400 })

  const conversationId = await getOrCreateConversation(db, profileId, counterpartId, contextKind as any, contextId)
  if (!conversationId) return Response.json({ error: 'Could not create conversation.' }, { status: 500 })

  let firstMessageId: string | null = null
  if (message) {
    const { data, error } = await db
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id:       profileId,
        type:            'text',
        body:            message,
      })
      .select('id')
      .single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    firstMessageId = (data as any).id
  }

  return Response.json({ conversation_id: conversationId, message_id: firstMessageId })
}
