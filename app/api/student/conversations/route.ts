/**
 * GET /api/student/conversations
 * Unified conversation list for the student-facing Messages page.
 * Sources:
 *   • Every order the student owns (consultant chat channels)
 *   • Every attorney profile chat the student has opened
 * Each row carries last-message preview, unread count, presence, last activity.
 *
 * Filterable + paginated so the list scales to hundreds of conversations.
 *
 * Query params:
 *   kind       — order | attorney | all
 *   filter     — unread | offers | archived | all
 *   q          — search by counterpart name / order title / last message snippet
 *   page, page_size  — default 50, max 200
 */
import { getCurrentStudent } from '@/lib/student'

export async function GET(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { searchParams } = new URL(req.url)
  const kind     = searchParams.get('kind')   || 'all'
  const filter   = searchParams.get('filter') || 'all'
  const q        = searchParams.get('q')?.trim().toLowerCase() || ''
  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  type Conv = {
    type: 'order' | 'attorney'
    id: string
    name: string
    sub: string
    avatar?: string | null
    presence?: 'online' | 'offline' | null
    pending?: number
    unread: number
    lastMessage: string | null
    lastFrom: 'me' | 'them' | 'system' | null
    lastAt: string | null
    archived: boolean
    meta?: Record<string, any>
  }

  const conversations: Conv[] = []

  // ── Orders / consultant channels ───────────────────────────────────────
  if (kind === 'all' || kind === 'order') {
    let { data: orders, error } = await db
      .from('orders')
      .select('id, status, consultant_id, requirements, created_at')
      .eq('client_id', profile.id)
      .order('created_at', { ascending: false })

    if (error && /column .* does not exist/i.test(error.message || '')) {
      const r = await db.from('orders').select('*').eq('client_id', profile.id).order('created_at', { ascending: false })
      orders = r.data as any
      error = r.error as any
    }
    if (error) return Response.json({ error: error.message }, { status: 500 })

    const orderRows = orders ?? []
    const orderIds = orderRows.map(o => o.id)
    const consultantIds = Array.from(new Set(orderRows.map(o => o.consultant_id).filter(Boolean)))

    const [itemsRes, servicesRes, profilesRes, msgsRes] = await Promise.all([
      orderIds.length ? db.from('order_items').select('order_id, service_id').in('order_id', orderIds) : Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }), // placeholder — we'll fetch after items
      consultantIds.length ? db.from('profiles').select('id, full_name, email, avatar_url').in('id', consultantIds) : Promise.resolve({ data: [] }),
      orderIds.length ? db.from('order_messages').select('order_id, sender_role, body, created_at').in('order_id', orderIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ])

    const items = itemsRes.data ?? []
    const serviceIds = Array.from(new Set(items.map((i: any) => i.service_id).filter(Boolean)))
    const services = serviceIds.length
      ? (await db.from('services').select('id, title').in('id', serviceIds)).data ?? []
      : []
    const serviceById = new Map(services.map((s: any) => [s.id, s]))
    const itemByOrder = new Map(items.map((i: any) => [i.order_id, i]))
    const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))

    // Last message + unread per order
    const lastByOrder = new Map<string, { body: string; from: string; at: string }>()
    const unreadByOrder = new Map<string, number>()
    for (const m of msgsRes.data ?? []) {
      const oid = (m as any).order_id
      if (!lastByOrder.has(oid)) {
        lastByOrder.set(oid, {
          body: String((m as any).body || '').slice(0, 120),
          from: (m as any).sender_role || 'consultant',
          at: (m as any).created_at,
        })
      }
      // Treat unread as messages from non-client roles within the last 30 days
      // (no per-message read receipts exist; this is a useful approximation
      // until we track read_at).
      if ((m as any).sender_role !== 'client') {
        const age = Date.now() - new Date((m as any).created_at).getTime()
        if (age < 30 * 86_400_000) unreadByOrder.set(oid, (unreadByOrder.get(oid) || 0) + 1)
      }
    }

    for (const o of orderRows) {
      const item = itemByOrder.get(o.id) as any
      const svc = item ? serviceById.get(item.service_id) : null
      const consultant: any = o.consultant_id ? profileById.get(o.consultant_id) : null
      const last = lastByOrder.get(o.id)
      conversations.push({
        type: 'order',
        id: o.id,
        name: consultant?.full_name || consultant?.email || (o.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
        sub: (svc as any)?.title || o.requirements || 'Order',
        avatar: consultant?.avatar_url || null,
        presence: null,
        unread: unreadByOrder.get(o.id) || 0,
        pending: 0,
        lastMessage: last?.body || null,
        lastFrom: last ? (last.from === 'client' ? 'me' : last.from === 'system' ? 'system' : 'them') : null,
        lastAt: last?.at || o.created_at,
        archived: ['completed', 'cancelled', 'refunded'].includes(o.status),
        meta: { status: o.status, consultantId: o.consultant_id, serviceTitle: (svc as any)?.title || null },
      })
    }
  }

  // ── Attorney profile chats ─────────────────────────────────────────────
  if (kind === 'all' || kind === 'attorney') {
    // Try the existing endpoint's source table. If schema isn't present yet,
    // gracefully degrade to an empty list.
    try {
      const { data, error } = await db
        .from('attorney_chats')
        .select('id, attorney_id, last_message, last_message_at, pending_offers, presence, unread_for_client')
        .eq('client_profile_id', profile.id)
        .order('last_message_at', { ascending: false })
      if (!error) {
        const attorneyIds = Array.from(new Set((data ?? []).map((c: any) => c.attorney_id).filter(Boolean)))
        let attMap = new Map<string, any>()
        if (attorneyIds.length) {
          const { data: atts } = await db.from('attorneys').select('id, profile_id, headshot_url').in('id', attorneyIds)
          const pIds = Array.from(new Set((atts ?? []).map((a: any) => a.profile_id).filter(Boolean)))
          const { data: pfs } = pIds.length ? await db.from('profiles').select('id, full_name, email').in('id', pIds) : { data: [] }
          const pById = new Map((pfs ?? []).map((p: any) => [p.id, p]))
          for (const a of atts ?? []) {
            const p = pById.get((a as any).profile_id) as any
            attMap.set((a as any).id, { name: p?.full_name || p?.email || 'Attorney', avatar: (a as any).headshot_url })
          }
        }
        for (const c of data ?? []) {
          const att = attMap.get((c as any).attorney_id)
          conversations.push({
            type: 'attorney',
            id: (c as any).id,
            name: att?.name || 'Attorney',
            sub: (c as any).last_message || 'Attorney profile chat',
            avatar: att?.avatar || null,
            presence: (c as any).presence === 'online' ? 'online' : 'offline',
            pending: (c as any).pending_offers || 0,
            unread: (c as any).unread_for_client || 0,
            lastMessage: (c as any).last_message || null,
            lastFrom: null,
            lastAt: (c as any).last_message_at || null,
            archived: false,
            meta: { attorneyId: (c as any).attorney_id },
          })
        }
      }
    } catch {
      // table missing — skip
    }
  }

  // Sort by last activity (recency)
  conversations.sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0
    return tb - ta
  })

  // Filters
  let filtered = conversations
  if (filter === 'unread')   filtered = filtered.filter(c => c.unread > 0)
  if (filter === 'offers')   filtered = filtered.filter(c => (c.pending || 0) > 0)
  if (filter === 'archived') filtered = filtered.filter(c => c.archived)
  else if (filter === 'all') {
    // 'all' excludes archived by default; pass filter=archived explicitly to see them
    filtered = filtered.filter(c => !c.archived)
  }
  if (q) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.sub || '').toLowerCase().includes(q) ||
      (c.lastMessage || '').toLowerCase().includes(q)
    )
  }

  const total = filtered.length
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Headline counts for the tab badges (independent of current filter)
  const counts = {
    all:      conversations.filter(c => !c.archived).length,
    order:    conversations.filter(c => c.type === 'order' && !c.archived).length,
    attorney: conversations.filter(c => c.type === 'attorney' && !c.archived).length,
    unread:   conversations.filter(c => c.unread > 0).length,
    offers:   conversations.filter(c => (c.pending || 0) > 0).length,
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
