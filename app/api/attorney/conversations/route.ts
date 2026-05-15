/**
 * GET /api/attorney/conversations
 * Unified conversation list for the attorney-facing Messages page.
 * Sources:
 *   • Pre-intake / inquiry chats (attorney_chats table)
 *   • Every order where this attorney is the consultant_id (order channels)
 * Each row carries last-message preview, unread approximation, pending-offer
 * count, and last activity timestamp.
 *
 * Query params:
 *   kind     — chat | order | all      (default all)
 *   filter   — unread | offers | archived | all
 *   q        — search counterpart name / order title / last message
 *   page, page_size — default 50, max 200
 */
import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const kind     = searchParams.get('kind')   || 'all'
  const filter   = searchParams.get('filter') || 'all'
  const q        = searchParams.get('q')?.trim().toLowerCase() || ''
  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  type Conv = {
    type: 'chat' | 'order'
    id: string
    name: string
    sub: string
    avatar?: string | null
    unread: number
    pending: number
    lastMessage: string | null
    lastFrom: 'me' | 'them' | 'system' | null
    lastAt: string | null
    archived: boolean
    meta?: Record<string, any>
  }

  const conversations: Conv[] = []

  // ── Inquiry chats ──────────────────────────────────────────────────────
  if (kind === 'all' || kind === 'chat') {
    try {
      const { data: chats, error: chatsErr } = await ctx.db
        .from('attorney_chats')
        .select('id, client_profile_id, client_name, client_email, last_message, last_message_at, pending_offers, unread_for_attorney, status')
        .eq('attorney_id', ctx.attorneyId)
        .order('last_message_at', { ascending: false })

      if (!chatsErr) {
        for (const c of chats ?? []) {
          conversations.push({
            type: 'chat',
            id: (c as any).id,
            name: (c as any).client_name || (c as any).client_email || 'Client',
            sub: (c as any).client_email || 'Pre-intake chat',
            avatar: null,
            unread: Number((c as any).unread_for_attorney || 0),
            pending: Number((c as any).pending_offers || 0),
            lastMessage: (c as any).last_message || null,
            lastFrom: null,
            lastAt: (c as any).last_message_at || null,
            archived: (c as any).status === 'closed' || (c as any).status === 'archived',
            meta: { clientProfileId: (c as any).client_profile_id },
          })
        }
      }
    } catch { /* table may not exist */ }
  }

  // ── Order channels ─────────────────────────────────────────────────────
  if (kind === 'all' || kind === 'order') {
    let { data: orders, error: ordersErr } = await ctx.db
      .from('orders')
      .select('id, order_number, client_id, status, requirements, created_at, source_offer_id, offer_id')
      .eq('consultant_id', ctx.profileId)
      .order('created_at', { ascending: false })
    if (ordersErr && /column .* does not exist/i.test(ordersErr.message || '')) {
      const r = await ctx.db.from('orders').select('*').eq('consultant_id', ctx.profileId).order('created_at', { ascending: false })
      orders = r.data as any
      ordersErr = r.error as any
    }
    const orderRows = orders ?? []
    const orderIds = orderRows.map((o: any) => o.id)
    const clientIds = Array.from(new Set(orderRows.map((o: any) => o.client_id).filter(Boolean)))
    const offerIds = Array.from(new Set(orderRows.map((o: any) => o.source_offer_id).filter(Boolean)))
    const unifiedIds = Array.from(new Set(orderRows.map((o: any) => o.offer_id).filter(Boolean)))

    const [profilesRes, offersRes, unifiedRes, msgsRes] = await Promise.all([
      clientIds.length ? ctx.db.from('profiles').select('id, full_name, email, avatar_url').in('id', clientIds) : Promise.resolve({ data: [] }),
      offerIds.length ? ctx.db.from('attorney_offers').select('id, title').in('id', offerIds) : Promise.resolve({ data: [] }),
      unifiedIds.length ? ctx.db.from('offers').select('id, title').in('id', unifiedIds) : Promise.resolve({ data: [] }),
      orderIds.length ? ctx.db.from('order_messages').select('order_id, sender_role, body, created_at').in('order_id', orderIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ])

    const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
    const offerById = new Map((offersRes.data ?? []).map((o: any) => [o.id, o]))
    const unifiedById = new Map((unifiedRes.data ?? []).map((o: any) => [o.id, o]))

    // Last message + unread approximation (messages from non-attorneys in last 30d)
    const last = new Map<string, { body: string; from: string; at: string }>()
    const unread = new Map<string, number>()
    for (const m of msgsRes.data ?? []) {
      const oid = (m as any).order_id
      if (!last.has(oid)) {
        last.set(oid, {
          body: String((m as any).body || '').slice(0, 120),
          from: (m as any).sender_role || 'client',
          at: (m as any).created_at,
        })
      }
      if ((m as any).sender_role === 'client') {
        const age = Date.now() - new Date((m as any).created_at).getTime()
        if (age < 30 * 86_400_000) unread.set(oid, (unread.get(oid) || 0) + 1)
      }
    }

    for (const o of orderRows as any[]) {
      const client: any = o.client_id ? profileById.get(o.client_id) : null
      const offer: any = o.source_offer_id ? offerById.get(o.source_offer_id) : o.offer_id ? unifiedById.get(o.offer_id) : null
      const l = last.get(o.id)
      conversations.push({
        type: 'order',
        id: o.id,
        name: client?.full_name || client?.email || 'Client',
        sub: offer?.title || o.requirements || 'Order',
        avatar: client?.avatar_url || null,
        unread: unread.get(o.id) || 0,
        pending: 0,
        lastMessage: l?.body || null,
        lastFrom: l ? (l.from === 'attorney' || l.from === 'consultant' ? 'me' : l.from === 'system' ? 'system' : 'them') : null,
        lastAt: l?.at || o.created_at,
        archived: ['completed', 'cancelled', 'refunded'].includes(o.status),
        meta: { status: o.status, orderTitle: offer?.title || null, orderNumber: o.order_number || null },
      })
    }
  }

  // Sort by last activity
  conversations.sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0
    return tb - ta
  })

  // Filters
  let filtered = conversations
  if (filter === 'unread')   filtered = filtered.filter(c => c.unread > 0)
  else if (filter === 'offers')   filtered = filtered.filter(c => c.pending > 0)
  else if (filter === 'archived') filtered = filtered.filter(c => c.archived)
  else /* all */                  filtered = filtered.filter(c => !c.archived)

  if (q) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.sub || '').toLowerCase().includes(q) ||
      (c.lastMessage || '').toLowerCase().includes(q)
    )
  }

  const total = filtered.length
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const counts = {
    all:      conversations.filter(c => !c.archived).length,
    chat:     conversations.filter(c => c.type === 'chat' && !c.archived).length,
    order:    conversations.filter(c => c.type === 'order' && !c.archived).length,
    unread:   conversations.filter(c => c.unread > 0).length,
    offers:   conversations.filter(c => c.pending > 0).length,
    archived: conversations.filter(c => c.archived).length,
    totalUnread: conversations.reduce((s, c) => s + (c.unread || 0), 0),
  }

  return Response.json({
    conversations: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    counts,
  })
}
