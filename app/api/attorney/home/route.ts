/**
 * GET /api/attorney/home
 * Composite endpoint for the attorney dashboard home — pulls slim signals
 * from earnings, orders, inquiries, messages, and gigs in one parallel-fetch
 * so the page renders in a single round trip.
 */
import { requireAttorney } from '@/lib/attorneyAuth'

const ACTIVE = ['active', 'in_progress']
const REVIEW = ['review', 'under_review']

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const [ordersRes, attorneyRes, ratingsRes, openInqRes, myMsgRes, myOfferRes] = await Promise.all([
    ctx.db
      .from('orders')
      .select('id, order_number, client_id, status, escrow_status, payout_status, total_amount, attorney_fee, deadline, completed_at, created_at, progress, source_offer_id, offer_id, requirements')
      .eq('consultant_id', ctx.profileId),
    ctx.db
      .from('attorneys')
      .select('available, headshot_url, tagline, starting_price')
      .eq('id', ctx.attorneyId)
      .single(),
    ctx.db.from('attorney_ratings').select('stars').eq('attorney_id', ctx.attorneyId),
    ctx.db
      .from('inquiries')
      .select('id, status, urgency, target_attorney_profile_id, created_at')
      .in('status', ['open', 'engaged', 'claimed'])
      .neq('source', 'portal_attorney_chat'),
    ctx.db.from('inquiry_messages').select('inquiry_id').eq('sender_profile_id', ctx.profileId).eq('sender_role', 'attorney'),
    ctx.db.from('attorney_offers').select('inquiry_id, status').eq('attorney_id', ctx.attorneyId),
  ])

  const orders: any[] = (ordersRes as any).data ?? []
  const attorney: any = (attorneyRes as any).data || null
  const ratings: any[] = (ratingsRes as any).data ?? []
  const openInqs: any[] = (openInqRes as any).data ?? []
  const myMsgs: any[] = (myMsgRes as any).data ?? []
  const myOffers: any[] = (myOfferRes as any).data ?? []

  // ── Order stats ─────────────────────────────────────────────────────────
  const now = Date.now()
  const day = 86_400_000
  const isCompleted = (o: any) => o.status === 'completed' || ['released', 'paid', 'completed'].includes(String(o.escrow_status || '').toLowerCase())
  const overdue = (o: any) => o.deadline && new Date(o.deadline).getTime() < now && o.status !== 'completed' && o.status !== 'cancelled'
  const dueSoon = (o: any) => o.deadline && new Date(o.deadline).getTime() > now && new Date(o.deadline).getTime() < now + 3 * day

  const transferred = orders.filter((o: any) => o.payout_status === 'transferred')
  const transferredAt = (o: any) => o.completed_at ? new Date(o.completed_at).getTime() : 0
  const transferred30d = transferred.filter((o: any) => transferredAt(o) >= now - 30 * day)
  const sumFee = (list: any[]) => list.reduce((s, o: any) => s + Number(o.attorney_fee || 0), 0)

  const orderStats = {
    total:             orders.length,
    active:            orders.filter((o: any) => ACTIVE.includes(o.status)).length,
    review:            orders.filter((o: any) => REVIEW.includes(o.status)).length,
    completed:         orders.filter((o: any) => o.status === 'completed').length,
    overdue:           orders.filter(overdue).length,
    dueSoon:           orders.filter(dueSoon).length,
    pendingPayoutFee:  sumFee(orders.filter((o: any) => isCompleted(o) && o.payout_status !== 'transferred' && o.payout_status !== 'refunded')),
    transferredLifetime: sumFee(transferred),
    transferred30d:    sumFee(transferred30d),
  }

  // ── Recent in-motion orders (top 5) ─────────────────────────────────────
  const inMotion = orders
    .filter((o: any) => [...ACTIVE, ...REVIEW].includes(o.status))
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // Hydrate clients + offer titles for the top 5
  const clientIds = Array.from(new Set(inMotion.map((o: any) => o.client_id).filter(Boolean)))
  const offerIds = Array.from(new Set(inMotion.map((o: any) => o.source_offer_id).filter(Boolean)))
  const unifiedIds = Array.from(new Set(inMotion.map((o: any) => o.offer_id).filter(Boolean)))
  const [{ data: profiles }, { data: offers }, { data: unified }] = await Promise.all([
    clientIds.length ? ctx.db.from('profiles').select('id, full_name, email, avatar_url').in('id', clientIds) : Promise.resolve({ data: [] }),
    offerIds.length ? ctx.db.from('attorney_offers').select('id, title').in('id', offerIds) : Promise.resolve({ data: [] }),
    unifiedIds.length ? ctx.db.from('offers').select('id, title').in('id', unifiedIds) : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const offerById = new Map((offers ?? []).map((o: any) => [o.id, o]))
  const unifiedById = new Map((unified ?? []).map((o: any) => [o.id, o]))

  const inMotionEnriched = inMotion.map((o: any) => {
    const client: any = o.client_id ? profileById.get(o.client_id) : null
    const offer: any = o.source_offer_id ? offerById.get(o.source_offer_id) : o.offer_id ? unifiedById.get(o.offer_id) : null
    const status = o.status === 'queued' ? 'pending'
      : o.status === 'created' ? 'created'
      : o.status === 'in_progress' ? 'active'
      : o.status === 'under_review' ? 'review'
      : o.status
    return {
      id: o.id,
      orderNumber: o.order_number || null,
      title: offer?.title || o.requirements || 'Custom engagement',
      clientName: client?.full_name || client?.email || 'Client',
      clientAvatar: client?.avatar_url || null,
      status,
      progress: Number.isFinite(Number(o.progress)) ? Number(o.progress) : (status === 'review' ? 90 : status === 'active' ? 50 : 10),
      attorneyFee: Number(o.attorney_fee || 0),
      deadlineAt: o.deadline || null,
      overdue: overdue(o),
    }
  })

  // ── Upcoming deadlines ──────────────────────────────────────────────────
  const upcoming = orders
    .filter((o: any) => o.deadline && !['completed', 'cancelled', 'refunded'].includes(o.status))
    .map((o: any) => {
      const item = inMotion.find((m: any) => m.id === o.id)
      return {
        id: o.id,
        title: item ? inMotionEnriched.find(m => m.id === o.id)?.title : (o.requirements || 'Order'),
        deadlineAt: o.deadline,
        daysAway: Math.ceil((new Date(o.deadline).getTime() - now) / day),
      }
    })
    .filter((d: any) => d.daysAway >= -2)
    .sort((a: any, b: any) => a.daysAway - b.daysAway)
    .slice(0, 4)

  // ── Inquiry stats ───────────────────────────────────────────────────────
  const myEngagedIds = new Set([
    ...myMsgs.map((r: any) => r.inquiry_id),
    ...myOffers.map((r: any) => r.inquiry_id),
  ])
  const inquiryStats = {
    open:              openInqs.length,
    targeted_to_me:    openInqs.filter((i: any) => i.target_attorney_profile_id === ctx.profileId).length,
    urgent:            openInqs.filter((i: any) => i.urgency === 'urgent' || i.urgency === 'high').length,
    fresh_24h:         openInqs.filter((i: any) => new Date(i.created_at).getTime() >= now - 24 * 3_600_000).length,
    my_engaged:        myEngagedIds.size,
    my_pending_offers: myOffers.filter((o: any) => !o.status || o.status === 'pending' || o.status === 'active').length,
  }

  // ── Messages: unread approximation (client messages on my orders in last 30d) ──
  let unreadConversations = 0
  if (orders.length > 0) {
    const orderIds = orders.map((o: any) => o.id)
    const { data: msgs } = await ctx.db
      .from('order_messages')
      .select('order_id, sender_role, created_at')
      .in('order_id', orderIds)
      .eq('sender_role', 'client')
      .gte('created_at', new Date(now - 30 * day).toISOString())
    const perOrder = new Set<string>()
    for (const m of msgs ?? []) perOrder.add((m as any).order_id)
    unreadConversations = perOrder.size
  }

  // ── Rating ──────────────────────────────────────────────────────────────
  const ratingAvg = ratings.length ? Number((ratings.reduce((s, r: any) => s + Number(r.stars || 0), 0) / ratings.length).toFixed(2)) : null

  return Response.json({
    attorney: {
      tagline: attorney?.tagline || null,
      headshot_url: attorney?.headshot_url || null,
      starting_price: attorney?.starting_price || null,
      available: attorney?.available !== false,
    },
    rating: ratings.length ? { count: ratings.length, avg: ratingAvg } : null,
    orderStats,
    inquiryStats,
    unreadConversations,
    inMotion: inMotionEnriched,
    upcoming,
  })
}
