/**
 * GET /api/support/orders/[id] — order detail + read-only conversation.
 *
 * Returns up to the last 200 conversation_messages between the two parties.
 * Support agents see all, but cannot send — the UI is read-only and routes
 * the "intervene" action through POST /api/support/tickets instead.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!['support', 'admin'].includes(auth.role)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid order id.' }, { status: 400 })

  const { data: order, error: orderErr } = await auth.db
    .from('orders')
    .select('id, status, escrow_status, client_id, attorney_id, consultant_id, created_at')
    .eq('id', id)
    .single()
  if (orderErr || !order) return Response.json({ error: 'Order not found.' }, { status: 404 })

  // Find the conversation that backs this order. We don't have an explicit
  // FK from orders → conversations, so we look up by context_kind='order'
  // and context_id=order_id, falling back to a DM between the two parties.
  const partyA = order.client_id as string | null
  const partyB = (order.attorney_id || order.consultant_id) as string | null

  let conversationId: string | null = null
  {
    const { data: c } = await auth.db
      .from('conversations')
      .select('id')
      .eq('context_kind', 'order')
      .eq('context_id', id)
      .maybeSingle()
    conversationId = c?.id ?? null
  }
  if (!conversationId && partyA && partyB) {
    const { data: c } = await auth.db
      .from('conversations')
      .select('id')
      .or(
        `and(participant_a.eq.${partyA},participant_b.eq.${partyB}),and(participant_a.eq.${partyB},participant_b.eq.${partyA})`,
      )
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    conversationId = c?.id ?? null
  }

  // Pull party names so the UI can render "Aanya P → Renu N".
  const partyIds = [partyA, partyB].filter(Boolean) as string[]
  const { data: profiles } = await auth.db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', partyIds.length ? partyIds : ['00000000-0000-0000-0000-000000000000'])
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, { name: (p.full_name as string) || (p.email as string) || 'Unknown', email: (p.email as string) || null }]))

  let messages: any[] = []
  if (conversationId) {
    const { data: msgs } = await auth.db
      .from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, metadata, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200)
    messages = (msgs ?? []).reverse()
  }

  return Response.json({
    order: {
      id:             order.id,
      status:         order.status,
      escrow_status:  order.escrow_status,
      created_at:     order.created_at,
      buyer:          partyA ? { id: partyA, ...nameById.get(partyA) } : null,
      seller:         partyB
        ? { id: partyB, role: order.attorney_id ? 'attorney' : 'consultant', ...nameById.get(partyB) }
        : null,
    },
    conversation_id: conversationId,
    messages,
  })
}
