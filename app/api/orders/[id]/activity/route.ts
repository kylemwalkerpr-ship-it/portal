import { requirePortalUser } from '@/lib/portalAuth'

/**
 * Participant-safe order workroom feed.
 *
 * One endpoint powers the Marketplace order timeline for BOTH clients and
 * providers. It intentionally reads the canonical workflow/audit tables
 * rather than treating chat as the order history:
 *   - order_events / order_status_history
 *   - milestones / scope changes
 *   - files / escrow events
 *   - unified Messenger + legacy order messages
 *
 * No raw data is public: callers must be an order participant or admin.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  if (!id) return Response.json({ error: 'Order id required.' }, { status: 400 })

  const { db, profileId, role } = auth
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, order_number, client_id, consultant_id, attorney_id, status, progress, requirements, created_at, updated_at, delivery_deadline, completed_at, cancelled_at, revision_reason, currency, total_amount, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, auto_release_eligible_at')
    .eq('id', id)
    .single()

  if (orderError || !order) return Response.json({ error: 'Order not found.' }, { status: 404 })

  const isClient = order.client_id === profileId
  const isProvider = order.consultant_id === profileId
  if (!isClient && !isProvider && role !== 'admin') {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const participantIds = [order.client_id, order.consultant_id].filter(Boolean) as string[]
  const counterpartId = isClient
    ? order.consultant_id
    : isProvider
      ? order.client_id
      : order.consultant_id || order.client_id

  const [
    profilesRes,
    orderEventsRes,
    statusHistoryRes,
    milestonesRes,
    scopeChangesRes,
    filesRes,
    legacyMessagesRes,
    escrowEventsRes,
    conversationsRes,
  ] = await Promise.allSettled([
    participantIds.length
      ? db.from('profiles').select('id, full_name, avatar_url, role').in('id', participantIds)
      : Promise.resolve({ data: [] }),
    db.from('order_events')
      .select('id, actor_id, actor_role, from_status, to_status, note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    db.from('order_status_history')
      .select('id, from_status, to_status, changed_by_id, note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    db.from('order_milestones').select('*').eq('order_id', id).order('sequence', { ascending: true }),
    db.from('order_scope_changes').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    db.from('order_files')
      .select('id, name, mime_type, size_bytes, uploader_id, uploader_role, created_at, is_deleted')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    db.from('order_messages')
      .select('id, sender_id, sender_role, body, attachment_name, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true })
      .limit(200),
    db.from('escrow_events').select('*').eq('order_id', id).order('created_at', { ascending: true }).limit(100),
    db.from('conversations')
      .select('id, participant_a, participant_b, context_kind, context_id, created_at, last_message_at')
      .eq('context_kind', 'order')
      .eq('context_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const rows = <T,>(result: PromiseSettledResult<any>): T[] => {
    if (result.status !== 'fulfilled') return []
    return ((result.value as any)?.data ?? []) as T[]
  }

  const profiles = rows<any>(profilesRes)
  const profileById = new Map(profiles.map((p: any) => [p.id, p]))
  const counterpart = counterpartId ? profileById.get(counterpartId) || null : null
  const viewer = profileById.get(profileId) || { id: profileId, role }

  const conversations = rows<any>(conversationsRes)
  const conversation = conversations.find((c: any) =>
    c.participant_a === profileId || c.participant_b === profileId,
  ) || null

  let unifiedMessages: any[] = []
  if (conversation?.id) {
    try {
      const { data } = await db
        .from('conversation_messages')
        .select('id, sender_id, type, body, attachment_name, ref_order_id, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .limit(300)
      unifiedMessages = (data ?? []).map((message: any) => ({
        ...message,
        sender_role: message.sender_id === order.client_id ? 'client' : 'provider',
        source: 'messenger',
      }))
    } catch {
      // Timeline still renders from the order audit tables if Messenger is unavailable.
    }
  }

  const legacyMessages = rows<any>(legacyMessagesRes).map((message: any) => ({
    ...message,
    source: 'order_messages',
  }))

  // Avoid showing the same mirrored workflow message twice when older routes
  // wrote to order_messages and the unified Messenger in the same action.
  const messageMap = new Map<string, any>()
  for (const message of [...legacyMessages, ...unifiedMessages]) {
    const created = message.created_at ? new Date(message.created_at).getTime() : 0
    const bucket = Math.floor(created / 5000)
    const key = `${message.sender_id || message.sender_role || ''}:${String(message.body || '').trim()}:${bucket}`
    if (!messageMap.has(key) || message.source === 'messenger') messageMap.set(key, message)
  }

  return Response.json({
    order: {
      id: order.id,
      orderNumber: order.order_number || null,
      status: order.status || 'created',
      progress: Number.isFinite(Number(order.progress)) ? Number(order.progress) : 0,
      requirements: order.requirements || '',
      createdAt: order.created_at || null,
      updatedAt: order.updated_at || null,
      deadlineAt: order.delivery_deadline || null,
      completedAt: order.completed_at || null,
      cancelledAt: order.cancelled_at || null,
      revisionReason: order.revision_reason || null,
      currency: order.currency || 'usd',
      totalAmount: Number(order.total_amount || 0),
      escrowStatus: order.escrow_status || 'held',
      escrowAmount: Number(order.escrow_amount || 0),
      escrowReleasedAmount: Number(order.escrow_released_amount || 0),
      escrowRefundedAmount: Number(order.escrow_refunded_amount || 0),
      autoReleaseEligibleAt: order.auto_release_eligible_at || null,
      clientId: order.client_id,
      providerId: order.consultant_id,
    },
    viewer,
    counterpart,
    participants: profiles,
    conversation: conversation ? { id: conversation.id, lastMessageAt: conversation.last_message_at || null } : null,
    orderEvents: rows<any>(orderEventsRes),
    statusHistory: rows<any>(statusHistoryRes),
    milestones: rows<any>(milestonesRes),
    scopeChanges: rows<any>(scopeChangesRes),
    files: rows<any>(filesRes).filter((file: any) => !file.is_deleted),
    messages: Array.from(messageMap.values()).sort((a: any, b: any) =>
      new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    ),
    escrowEvents: rows<any>(escrowEventsRes),
  })
}
