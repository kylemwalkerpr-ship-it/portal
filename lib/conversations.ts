/**
 * Shared helpers for the unified messaging layer.
 *
 * Used by every send-site (ChatSidePane → /api/messages/send,
 * order detail composer → /api/student|attorney/messages,
 * inquiry detail composer → /api/client/inquiries/[id]/messages)
 * to ensure every legacy write is mirrored into conversation_messages.
 *
 * Keep these tiny and side-effect-only — they should never throw to the
 * caller. The legacy table write is the audit-of-record; mirroring is
 * best-effort.
 */
import { createSupabaseAdminClient } from './supabase'

type DB = ReturnType<typeof createSupabaseAdminClient>

/** Resolve (or create) the conversation row for two participants. */
export async function getOrCreateConversation(
  db: DB,
  participantA: string,
  participantB: string,
  contextKind: 'general' | 'order' | 'inquiry' | 'gig' = 'general',
  contextId: string | null = null,
): Promise<string | null> {
  if (!participantA || !participantB || participantA === participantB) return null
  try {
    const { data, error } = await db.rpc('get_or_create_conversation', {
      p_a: participantA,
      p_b: participantB,
      p_context_kind: contextKind,
      p_context_id: contextId,
    })
    if (error || !data) return null
    return typeof data === 'string' ? data : null
  } catch {
    return null
  }
}

/** Mirror a single legacy message into conversation_messages (best-effort). */
export async function mirrorMessage(
  db: DB,
  args: {
    participantA: string
    participantB: string
    senderId: string
    body: string
    contextKind?: 'general' | 'order' | 'inquiry' | 'gig'
    contextId?: string | null
    refOrderId?: string | null
    refInquiryId?: string | null
    refMessageId?: string | null
    type?: 'text' | 'attachment' | 'offer' | 'order_event' | 'inquiry_event' | 'system'
    attachmentUrl?: string | null
    attachmentName?: string | null
    metadata?: Record<string, any>
  },
): Promise<void> {
  try {
    const convId = await getOrCreateConversation(
      db,
      args.participantA,
      args.participantB,
      args.contextKind || 'general',
      args.contextId || null,
    )
    if (!convId) return
    await db.from('conversation_messages').insert({
      conversation_id: convId,
      sender_id:       args.senderId,
      type:            args.type || (args.body ? 'text' : 'system'),
      body:            args.body || null,
      attachment_url:  args.attachmentUrl || null,
      attachment_name: args.attachmentName || null,
      ref_order_id:    args.refOrderId || null,
      ref_inquiry_id:  args.refInquiryId || null,
      ref_message_id:  args.refMessageId || null,
      metadata:        args.metadata || {},
    })
  } catch {
    /* swallow — mirroring is best-effort */
  }
}
