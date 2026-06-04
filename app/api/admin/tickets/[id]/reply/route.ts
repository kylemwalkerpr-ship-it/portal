/**
 * POST /api/admin/tickets/[id]/reply
 *
 * Posts an admin reply into the conversation backing the ticket. Mirrors
 * the pattern in /api/admin/escrow/[id]/freeze (best-effort updates with
 * data_warnings instead of 500s).
 *
 * Body: { body: string }
 *
 * Flow:
 *   1. Load the ticket. Resolve its conversation_id — falling back to the
 *      order's context conversation, then to a DM between the parties.
 *   2. Insert a new conversation_messages row of type='text', sender_id=admin.
 *   3. Best-effort audit log.
 *
 * If the conversation can't be resolved we still return 200 with a
 * data_warning so the UI can surface the issue without crashing.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Invalid ticket id.', 400)

  const body = await req.json().catch(() => ({}))
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return fail('Reply body is required.', 422)
  if (text.length > 8000) return fail('Reply is too long (max 8000 chars).', 422)

  const warnings: string[] = []

  // 1. Load ticket
  const { data: ticket, error: ticketErr } = await db
    .from('support_tickets')
    .select('id, order_id, conversation_id')
    .eq('id', id)
    .single()
  if (ticketErr || !ticket) return fail('Ticket not found.', 404)

  // 2. Resolve conversation_id
  let conversationId: string | null = ticket.conversation_id ?? null
  let order: any = null

  if (!conversationId) {
    try {
      const { data: o } = await db
        .from('orders')
        .select('id, client_id, consultant_id, attorney_id')
        .eq('id', ticket.order_id)
        .maybeSingle()
      order = o
    } catch (e: any) {
      warnings.push('order_lookup_failed: ' + (e?.message || 'unknown'))
    }

    if (order) {
      try {
        const { data: ctxConv } = await db
          .from('conversations')
          .select('id')
          .eq('context_kind', 'order')
          .eq('context_id', order.id)
          .maybeSingle()
        conversationId = ctxConv?.id ?? null
      } catch {
        warnings.push('conversation_context_lookup_failed')
      }
    }

    if (!conversationId && order?.client_id && (order?.consultant_id || order?.attorney_id)) {
      const partyA = order.client_id as string
      const partyB = (order.consultant_id || order.attorney_id) as string
      try {
        const { data: convId } = await db.rpc('get_or_create_conversation', {
          p_a: partyA,
          p_b: partyB,
          p_context_kind: 'order',
          p_context_id: order.id,
        })
        conversationId = typeof convId === 'string' ? convId : (convId as any)?.id ?? null
      } catch (e: any) {
        warnings.push('conversation_create_failed: ' + (e?.message || 'unknown'))
      }
    }
  }

  if (!conversationId) {
    return fail('No conversation could be resolved for this ticket.', 409, {}, { data_warnings: warnings })
  }

  // 3. Insert the message
  let message: any = null
  try {
    const { data, error } = await db
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id:       profileId,
        type:            'text',
        body:            text,
        metadata:        { source: 'admin_ticket_reply', ticket_id: id },
      })
      .select('id, conversation_id, sender_id, type, body, created_at')
      .single()
    if (error) return fail(error.message, 500, {}, { data_warnings: warnings })
    message = data
  } catch (e: any) {
    return fail(e?.message || 'Insert failed.', 500, {}, { data_warnings: warnings })
  }

  // 4. Best-effort audit + ticket touch
  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'ticket_reply',
      target_table: 'support_tickets',
      target_id: id,
      payload_snapshot: { conversation_id: conversationId, message_id: message?.id, length: text.length },
      reason: null,
    })
  } catch (e: any) {
    warnings.push('audit_log_failed: ' + (e?.message || 'unknown'))
  }

  try {
    await db.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', id)
  } catch {
    warnings.push('ticket_touch_failed')
  }

  return ok({ message, conversation_id: conversationId }, {}, warnings.length ? { data_warnings: warnings } : {})
}
