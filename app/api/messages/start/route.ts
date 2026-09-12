/**
 * POST /api/messages/start
 *
 * Universal "start a conversation" handler. Resolves the counterpart by ANY of:
 *   - { counterpart_profile_id: '...' }     ← direct profile id
 *   - { counterpart_attorney_id: '...' }    ← attorneys row id (legacy)
 *   - { counterpart_consultant_id: '...' }  ← consultants row id
 *   - { context_kind: 'order', context_id } ← canonical order participant resolution
 *
 * Optional first message in the same call (body: { message }) so the
 * marketplace ChatSidePane can both create the conversation and post the
 * opening message in one round trip.
 *
 * Returns the conversation id plus the safe counterpart profile snapshot so
 * order workrooms can render Messenger immediately without a second API being
 * responsible for participant discovery.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { getOrCreateConversation } from '@/lib/conversations'
import { scheduleClientAutoReply } from '@/lib/messengerClientAutoReply'

async function resolveOrderProviderProfileId(db: any, order: any): Promise<string | null> {
  const direct = typeof order?.consultant_id === 'string' && order.consultant_id
    ? order.consultant_id
    : null

  if (direct) {
    // Modern orders store the provider profile id directly in consultant_id.
    const { data: profile } = await db.from('profiles').select('id').eq('id', direct).maybeSingle()
    if (profile?.id) return profile.id

    // Legacy orders may still hold a consultants table row id here.
    const { data: consultant } = await db.from('consultants').select('profile_id').eq('id', direct).maybeSingle()
    if (consultant?.profile_id) return consultant.profile_id
  }

  if (typeof order?.attorney_id === 'string' && order.attorney_id) {
    const { data: attorney } = await db.from('attorneys').select('profile_id').eq('id', order.attorney_id).maybeSingle()
    if (attorney?.profile_id) return attorney.profile_id
  }

  return null
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 8000) : ''
  const contextKind = ['general', 'order', 'inquiry', 'gig'].includes(body.context_kind) ? body.context_kind : 'general'
  const contextId   = typeof body.context_id === 'string' ? body.context_id : null

  // Resolve counterpart profile id.
  let counterpartId: string | null = null

  if (typeof body.counterpart_profile_id === 'string' && body.counterpart_profile_id) {
    counterpartId = body.counterpart_profile_id
  } else if (typeof body.counterpart_attorney_id === 'string' && body.counterpart_attorney_id) {
    const { data } = await db.from('attorneys').select('profile_id').eq('id', body.counterpart_attorney_id).maybeSingle()
    counterpartId = (data as any)?.profile_id || null
  } else if (typeof body.counterpart_consultant_id === 'string' && body.counterpart_consultant_id) {
    const { data } = await db.from('consultants').select('profile_id').eq('id', body.counterpart_consultant_id).maybeSingle()
    counterpartId = (data as any)?.profile_id || null
  } else if (contextKind === 'order' && contextId) {
    // Resolve the counterpart from the order itself. This is the authoritative
    // path for order workrooms: the client never has to discover the provider
    // through the Activity endpoint before Messenger can open.
    const { data: order } = await db
      .from('orders')
      .select('client_id, consultant_id, attorney_id')
      .eq('id', contextId)
      .maybeSingle()

    if (order) {
      const providerProfileId = await resolveOrderProviderProfileId(db, order)
      counterpartId =
        (order as any).client_id === profileId
          ? providerProfileId
          : providerProfileId === profileId
            ? (order as any).client_id
            : null
    }
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
    // Same escalation-aware YQAA entry point used by the normal Messenger POST.
    await scheduleClientAutoReply(db, conversationId, firstMessageId)
  }

  let counterpart: any = { id: counterpartId }
  try {
    const { data } = await db
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .eq('id', counterpartId)
      .maybeSingle()
    if (data) counterpart = data
  } catch {
    // The conversation is already valid; profile decoration is non-fatal.
  }

  return Response.json({
    conversation_id: conversationId,
    message_id: firstMessageId,
    counterpart_profile_id: counterpartId,
    counterpart,
  })
}
