/**
 * GET /api/student/home
 * Composite endpoint for the student dashboard home — pulls a slim signal
 * from each section so the home page can render at-a-glance tiles without
 * issuing 7 separate requests on every load.
 *
 * Aggregates:
 *   • orders     — counts (active / awaiting approval / completed),
 *                  escrow held, lifetime spend, top 5 in-motion orders
 *   • inquiries  — open + responding + pending offers
 *   • messages   — unread conversation count
 *   • documents  — total + last-7-days uploads
 *   • deadlines  — next 3 upcoming order deadlines
 *   • wallet     — Stripe balance (best-effort)
 */
import { getCurrentStudent } from '@/lib/student'

const ACTIVE_STATUSES = ['active', 'in_progress', 'review', 'under_review']
const REVIEW_STATUSES = ['review', 'under_review']
const PENDING_STATUSES = ['queued', 'created', 'pending']

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  // ── Orders ─────────────────────────────────────────────────────────────
  let { data: orderRows, error: ordersErr } = await db
    .from('orders')
    .select('id, order_number, status, requirements, total_amount, escrow_status, escrow_amount, progress, deadline, consultant_id, created_at')
    .eq('client_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (ordersErr && /column .* does not exist/i.test(ordersErr.message || '')) {
    const r = await db.from('orders').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(200)
    orderRows = r.data as any
    ordersErr = r.error as any
  }
  if (ordersErr) return Response.json({ error: ordersErr.message }, { status: 500 })
  const orders: any[] = orderRows ?? []

  // Hydrate service titles + consultant names for in-motion preview
  const inMotion = orders.filter(o => !['completed', 'cancelled', 'refunded'].includes(o.status)).slice(0, 5)
  const inMotionIds = inMotion.map(o => o.id)
  const consultantIds = Array.from(new Set(inMotion.map(o => o.consultant_id).filter(Boolean)))
  const [itemsRes, profilesRes] = await Promise.all([
    inMotionIds.length ? db.from('order_items').select('order_id, service_id').in('order_id', inMotionIds) : Promise.resolve({ data: [] }),
    consultantIds.length ? db.from('profiles').select('id, full_name, email, avatar_url').in('id', consultantIds) : Promise.resolve({ data: [] }),
  ])
  const items = itemsRes.data ?? []
  const serviceIds = Array.from(new Set(items.map((i: any) => i.service_id).filter(Boolean)))
  const services = serviceIds.length
    ? (await db.from('services').select('id, title').in('id', serviceIds)).data ?? []
    : []
  const serviceById = new Map(services.map((s: any) => [s.id, s]))
  const itemByOrder = new Map(items.map((i: any) => [i.order_id, i]))
  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))

  const inMotionEnriched = inMotion.map(o => {
    const item = itemByOrder.get(o.id) as any
    const svc = item ? serviceById.get(item.service_id) : null
    const consultant: any = o.consultant_id ? profileById.get(o.consultant_id) : null
    return {
      id: o.id,
      orderNumber: o.order_number || null,
      title: (svc as any)?.title || o.requirements || 'Order',
      consultant: consultant?.full_name || consultant?.email || (o.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
      consultantAvatar: consultant?.avatar_url || null,
      status: o.status === 'queued' ? 'pending'
        : o.status === 'created' ? 'created'
        : o.status === 'in_progress' ? 'active'
        : o.status === 'under_review' ? 'review'
        : o.status || 'pending',
      progress: Number.isFinite(Number(o.progress)) ? Number(o.progress)
        : o.status === 'review' || o.status === 'under_review' ? 90
        : ACTIVE_STATUSES.includes(o.status) ? 50 : 0,
      deadlineAt: o.deadline || null,
      createdAt: o.created_at,
    }
  })

  // Upcoming deadlines: any non-final order with a future deadline
  const now = Date.now()
  const upcoming = orders
    .filter(o => o.deadline && !['completed', 'cancelled', 'refunded'].includes(o.status))
    .map(o => ({
      id: o.id,
      title: (() => {
        const it = items.find((i: any) => i.order_id === o.id) as any
        return (it ? (serviceById.get(it.service_id) as any)?.title : null) || o.requirements || 'Order'
      })(),
      deadlineAt: o.deadline,
      daysAway: Math.ceil((new Date(o.deadline).getTime() - now) / 86_400_000),
    }))
    .filter(d => d.daysAway >= -1)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 3)

  const orderStats = {
    total:            orders.length,
    active:           orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length,
    pending:          orders.filter(o => PENDING_STATUSES.includes(o.status)).length,
    awaitingApproval: orders.filter(o => REVIEW_STATUSES.includes(o.status)).length,
    completed:        orders.filter(o => o.status === 'completed').length,
    escrowHeld:       orders.filter(o => o.escrow_status === 'held').reduce((s: number, o: any) => s + Number(o.escrow_amount || 0), 0),
    lifetimeSpend:    orders.filter(o => ['completed', ...ACTIVE_STATUSES].includes(o.status)).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0),
  }

  // ── Inquiries ──────────────────────────────────────────────────────────
  let inquiryStats = { open: 0, engaged: 0, pendingOffers: 0 }
  try {
    const { data: inqs } = await db
      .from('inquiries')
      .select('id, status')
      .eq('client_profile_id', profile.id)
      .neq('source', 'portal_attorney_chat')
    const inqList: any[] = inqs ?? []
    inquiryStats.open    = inqList.filter(i => i.status === 'open').length
    inquiryStats.engaged = inqList.filter(i => i.status === 'engaged').length

    if (inqList.length > 0) {
      const ids = inqList.map(i => i.id)
      const { data: offers } = await db.from('offers').select('id, status').in('inquiry_id', ids)
      inquiryStats.pendingOffers = (offers ?? []).filter((o: any) => !o.status || o.status === 'pending' || o.status === 'active').length
    }
  } catch { /* inquiries schema may be pending */ }

  // ── Conversations (unread) ─────────────────────────────────────────────
  // Approximated as messages from non-clients in the last 30 days on the
  // student's orders (matches /conversations endpoint's signal).
  let unreadConversations = 0
  if (orders.length > 0) {
    const ids = orders.map(o => o.id)
    const { data: msgs } = await db
      .from('order_messages')
      .select('order_id, sender_role, created_at')
      .in('order_id', ids)
      .neq('sender_role', 'client')
      .gte('created_at', new Date(now - 30 * 86_400_000).toISOString())
    const perOrder = new Map<string, number>()
    for (const m of msgs ?? []) {
      perOrder.set((m as any).order_id, (perOrder.get((m as any).order_id) || 0) + 1)
    }
    unreadConversations = perOrder.size
  }

  // ── Documents ──────────────────────────────────────────────────────────
  let docStats = { total: 0, last7d: 0 }
  if (orders.length > 0) {
    const ids = orders.map(o => o.id)
    const { data: files } = await db.from('order_files').select('id, created_at').in('order_id', ids)
    const fl: any[] = files ?? []
    docStats.total = fl.length
    docStats.last7d = fl.filter(f => new Date(f.created_at).getTime() >= now - 7 * 86_400_000).length
  }

  // ── Wallet (best-effort, never blocks) ─────────────────────────────────
  // We avoid the Stripe API round-trip here; the home tile fetches
  // /api/wallet/balance separately. Just expose the numeric scaffolding so
  // the UI can show a placeholder if Stripe is slow.

  return Response.json({
    profile: {
      id:        profile.id,
      full_name: profile.full_name,
      email:     profile.email,
    },
    orderStats,
    inquiryStats,
    unreadConversations,
    docStats,
    inMotion: inMotionEnriched,
    upcoming,
  })
}
