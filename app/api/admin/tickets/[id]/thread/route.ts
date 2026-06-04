/**
 * GET /api/admin/tickets/[id]/thread
 *
 * Returns the conversation backing the ticket's order plus a normalised
 * timeline of decision events (raised, decided, status notes). Used by the
 * admin tickets side-drawer to show the full context that led to (and
 * followed) the ticket.
 *
 * The conversation pull is best-effort: if the ticket has no conversation_id
 * we fall back to the order's context conversation, then to a DM between
 * the parties — matching the discovery rules used in
 * /api/support/orders/[id].
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Invalid ticket id.', 400)

  const warnings: string[] = []

  // 1. Pull the ticket
  const { data: ticket, error: ticketErr } = await db
    .from('support_tickets')
    .select('id, order_id, conversation_id, raised_by, decided_by, kind, status, reason, detail, decision_notes, created_at, decided_at')
    .eq('id', id)
    .single()
  if (ticketErr || !ticket) return fail('Ticket not found.', 404)

  // 2. Pull the order so we know the parties
  let order: any = null
  try {
    const { data } = await db
      .from('orders')
      .select('id, order_number, status, escrow_status, client_id, consultant_id, attorney_id, created_at, total_amount')
      .eq('id', ticket.order_id)
      .maybeSingle()
    order = data
  } catch (e: any) {
    warnings.push('order_lookup_failed: ' + (e?.message || 'unknown'))
  }

  // 3. Resolve conversation id
  let conversationId: string | null = ticket.conversation_id ?? null

  if (!conversationId && order) {
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
      const { data: dm } = await db
        .from('conversations')
        .select('id')
        .or(
          `and(participant_a.eq.${partyA},participant_b.eq.${partyB}),and(participant_a.eq.${partyB},participant_b.eq.${partyA})`,
        )
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      conversationId = dm?.id ?? null
    } catch {
      warnings.push('conversation_dm_lookup_failed')
    }
  }

  // 4. Fetch messages (best-effort)
  let messages: any[] = []
  if (conversationId) {
    try {
      const { data } = await db
        .from('conversation_messages')
        .select('id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(200)
      messages = (data ?? []).reverse()
    } catch (e: any) {
      warnings.push('conversation_messages_unavailable: ' + (e?.message || 'unknown'))
    }
  }

  // 5. Resolve sender names
  const profileIds = new Set<string>()
  for (const m of messages) if (m.sender_id) profileIds.add(m.sender_id)
  if (ticket.raised_by) profileIds.add(ticket.raised_by)
  if (ticket.decided_by) profileIds.add(ticket.decided_by)
  if (order?.client_id) profileIds.add(order.client_id)
  if (order?.consultant_id) profileIds.add(order.consultant_id)
  if (order?.attorney_id) profileIds.add(order.attorney_id)

  const profileMap = new Map<string, any>()
  if (profileIds.size) {
    try {
      const { data } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', Array.from(profileIds))
      for (const p of data ?? []) profileMap.set(p.id, p)
    } catch {
      warnings.push('profile_resolution_failed')
    }
  }

  const enrichedMessages = messages.map(m => {
    const sender = profileMap.get(m.sender_id) || {}
    return {
      id: m.id,
      sender_id: m.sender_id,
      sender_name: sender.full_name || sender.email || 'Unknown',
      sender_role: sender.role || null,
      type: m.type,
      body: m.body,
      attachment_url: m.attachment_url,
      attachment_name: m.attachment_name,
      created_at: m.created_at,
    }
  })

  // 6. Compose a decision timeline so the UI can render system events inline
  const decisionEvents: any[] = []
  decisionEvents.push({
    type: 'ticket_raised',
    actor_id: ticket.raised_by,
    actor_name: profileMap.get(ticket.raised_by)?.full_name || profileMap.get(ticket.raised_by)?.email || 'Support',
    body: `${ticket.kind.replace(/_/g, ' ')} ticket opened: ${ticket.reason}`,
    created_at: ticket.created_at,
  })
  if (ticket.decided_at) {
    decisionEvents.push({
      type: `ticket_${ticket.status}`,
      actor_id: ticket.decided_by,
      actor_name: ticket.decided_by ? (profileMap.get(ticket.decided_by)?.full_name || profileMap.get(ticket.decided_by)?.email || 'Admin') : 'System',
      body: ticket.decision_notes || `Ticket ${ticket.status}.`,
      created_at: ticket.decided_at,
    })
  }

  return ok({
    ticket: {
      id:           ticket.id,
      order_id:     ticket.order_id,
      kind:         ticket.kind,
      status:       ticket.status,
      reason:       ticket.reason,
      detail:       ticket.detail,
      decision_notes: ticket.decision_notes,
      created_at:   ticket.created_at,
      decided_at:   ticket.decided_at,
    },
    order: order
      ? {
          id:             order.id,
          order_number:   order.order_number,
          status:         order.status,
          escrow_status:  order.escrow_status,
          total_amount:   Number(order.total_amount) || 0,
          client:         order.client_id ? {
            id:    order.client_id,
            name:  profileMap.get(order.client_id)?.full_name || profileMap.get(order.client_id)?.email || null,
            email: profileMap.get(order.client_id)?.email || null,
          } : null,
          provider:       (order.consultant_id || order.attorney_id) ? {
            id:    order.consultant_id || order.attorney_id,
            role:  order.attorney_id ? 'attorney' : 'consultant',
            name:  profileMap.get(order.consultant_id || order.attorney_id)?.full_name
                   || profileMap.get(order.consultant_id || order.attorney_id)?.email || null,
            email: profileMap.get(order.consultant_id || order.attorney_id)?.email || null,
          } : null,
        }
      : null,
    conversation_id:  conversationId,
    messages:         enrichedMessages,
    decision_events:  decisionEvents,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}
