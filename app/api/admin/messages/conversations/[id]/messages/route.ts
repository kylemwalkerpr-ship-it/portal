/**
 * GET /api/admin/messages/conversations/[id]/messages
 *
 * Full message history for any conversation — admin oversight read path.
 * Non-admins receive 401/403 via requireAdminUser.
 */
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth
  const { id } = await context.params

  const { data: conv, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, created_at')
    .eq('id', id)
    .single()

  if (error || !conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  const [messagesRes, profilesRes] = await Promise.all([
    db
      .from('conversation_messages')
      .select(
        'id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, ref_inquiry_id, reply_to_id, metadata, created_at',
      )
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(1000),
    db
      .from('profiles')
      .select('id, full_name, email, avatar_url, role')
      .in('id', [conv.participant_a, conv.participant_b].filter(Boolean)),
  ])

  if (messagesRes.error) {
    return Response.json({ error: messagesRes.error.message }, { status: 500 })
  }

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const shape = (pid: string | null) => {
    if (!pid) return null
    const p: any = profileById.get(pid)
    if (!p) return { id: pid, name: 'Unknown', email: null, avatar_url: null, role: null }
    return {
      id: p.id,
      name: p.full_name || p.email || 'User',
      email: p.email,
      avatar_url: p.avatar_url,
      role: p.role === 'student' ? 'client' : p.role,
    }
  }

  const participantA = shape(conv.participant_a)
  const participantB = shape(conv.participant_b)

  const messages = (messagesRes.data ?? []).map((m: any) => {
    const sender = shape(m.sender_id)
    return {
      id: m.id,
      sender_id: m.sender_id,
      sender,
      type: m.type || 'text',
      body: m.body,
      attachment_url: m.attachment_url,
      attachment_name: m.attachment_name,
      ref_offer_id: m.ref_offer_id,
      ref_order_id: m.ref_order_id,
      ref_inquiry_id: m.ref_inquiry_id,
      reply_to_id: m.reply_to_id,
      metadata: m.metadata,
      created_at: m.created_at,
    }
  })

  return Response.json({
    conversation: {
      id: conv.id,
      participant_a: participantA,
      participant_b: participantB,
      participants: [participantA, participantB].filter(Boolean),
      context_kind: conv.context_kind,
      context_id: conv.context_id,
      status: conv.status,
      type: conv.type,
      last_message_at: conv.last_message_at,
      created_at: conv.created_at,
    },
    messages,
    total: messages.length,
  })
}
