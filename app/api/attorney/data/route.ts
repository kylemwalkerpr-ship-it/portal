import { requireAttorney } from '@/lib/attorneyAuth'

// Aggregate dashboard data for the attorney's overview + active orders +
// earnings views. Mirrors /api/consultant/data shape so the UI patterns line
// up, but uses the additive fee model (attorney_fee, not 80/20 split).
export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const [ordersRes, openInquiriesRes, mineInquiriesRes, ratingsRes, attorneyRes] = await Promise.all([
    ctx.db
      .from('orders')
      .select('id, order_number, client_id, status, escrow_status, total_amount, attorney_fee, platform_fee, progress, deadline, created_at, completed_at, source_offer_id, source_inquiry_id, offer_id, payout_status, stripe_payment_intent_id')
      .eq('consultant_id', ctx.profileId)
      .not('source_offer_id', 'is', null)
      .order('created_at', { ascending: false }),
    ctx.db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'engaged', 'claimed']),
    ctx.db
      .from('inquiry_messages')
      .select('inquiry_id')
      .eq('sender_role', 'attorney')
      .eq('sender_profile_id', ctx.profileId),
    ctx.db.from('attorney_ratings').select('stars').eq('attorney_id', ctx.attorneyId),
    ctx.db
      .from('attorneys')
      .select('stripe_account_id, stripe_onboarding_complete, available')
      .eq('id', ctx.attorneyId)
      .single(),
  ])

  // Be defensive — partial migrations (e.g. orders missing source_offer_id)
  // shouldn't blank out the whole dashboard. Log internally and degrade.
  if (ordersRes.error) console.error('[attorney/data] orders query failed', ordersRes.error.message)
  if (openInquiriesRes.error) console.error('[attorney/data] open-inquiries failed', openInquiriesRes.error.message)
  if (mineInquiriesRes.error) console.error('[attorney/data] mine-inquiries failed', mineInquiriesRes.error.message)
  if (ratingsRes.error) console.error('[attorney/data] ratings failed', ratingsRes.error.message)
  if (attorneyRes.error) console.error('[attorney/data] attorney row failed', attorneyRes.error.message)

  const orderRows = ordersRes.data ?? []
  const orderIds = orderRows.map((o) => o.id)
  const offerIds = orderRows.map((o) => o.source_offer_id).filter(Boolean) as string[]
  const unifiedOfferIds = orderRows.map((o) => o.offer_id).filter(Boolean) as string[]

  const [{ data: clients }, { data: offers }, { data: unifiedOffers }, { data: messageCounts }] = await Promise.all([
    orderRows.length
      ? ctx.db.from('profiles').select('id, full_name, email').in('id', orderRows.map((o) => o.client_id))
      : Promise.resolve({ data: [] }),
    offerIds.length
      ? ctx.db.from('attorney_offers').select('id, title, description').in('id', offerIds)
      : Promise.resolve({ data: [] }),
    unifiedOfferIds.length
      ? ctx.db.from('offers').select('id, title, description').in('id', unifiedOfferIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? ctx.db.from('order_messages').select('order_id').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]))
  const offerById = new Map((offers ?? []).map((o) => [o.id, o]))
  const unifiedOfferById = new Map((unifiedOffers ?? []).map((o) => [o.id, o]))
  const msgCountByOrder = (messageCounts ?? []).reduce((m, r) => {
    m.set(r.order_id, (m.get(r.order_id) || 0) + 1)
    return m
  }, new Map<string, number>())

  const orders = orderRows.map((o) => {
    const client = clientById.get(o.client_id)
    const offer = o.source_offer_id ? offerById.get(o.source_offer_id) : o.offer_id ? unifiedOfferById.get(o.offer_id) : null
    const attorneyFee = Number(o.attorney_fee || 0)
    const platformFee = Number(o.platform_fee || 0)
    const isComplete = o.status === 'completed' || ['released', 'paid', 'completed'].includes(String(o.escrow_status || '').toLowerCase())
    const fallbackProgress = isComplete ? 100 : ['review', 'under_review'].includes(o.status) ? 90 : ['active', 'in_progress'].includes(o.status) ? 50 : 10
    return {
      id: o.id,
      order_number: o.order_number || null,
      title: offer?.title || 'Custom engagement',
      description: offer?.description || null,
      status: ['queued', 'created'].includes(o.status) ? 'created' : o.status === 'in_progress' ? 'active' : o.status === 'under_review' ? 'review' : o.status || 'created',
      escrow_status: o.escrow_status,
      attorney_fee: attorneyFee,
      platform_fee: platformFee,
      total: attorneyFee + platformFee,
      progress: Number.isFinite(Number(o.progress)) ? Number(o.progress) : fallbackProgress,
      deadline: o.deadline,
      created_at: o.created_at,
      completed_at: o.completed_at,
      payout_status: o.payout_status || 'pending',
      client_name: client?.full_name || client?.email?.split('@')[0] || 'Client',
      client_email: client?.email || null,
      messages: msgCountByOrder.get(o.id) || 0,
      is_complete: isComplete,
    }
  })

  // Earnings — based on attorney_fee since fee is not split.
  const completed = orders.filter((o) => o.is_complete)
  const active = orders.filter((o) => !o.is_complete)
  const earnings_lifetime = completed.reduce((s, o) => s + o.attorney_fee, 0)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const earnings_month = completed
    .filter((o) => o.completed_at && new Date(o.completed_at) >= monthStart)
    .reduce((s, o) => s + o.attorney_fee, 0)

  // Daily earnings trend, last 30 days.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const trend: { date: string; amount: number; orders: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const next = new Date(d)
    next.setDate(d.getDate() + 1)
    const orders_in_day = completed.filter((o) => {
      if (!o.completed_at) return false
      const c = new Date(o.completed_at)
      return c >= d && c < next
    })
    trend.push({
      date: d.toISOString().slice(0, 10),
      amount: orders_in_day.reduce((s, o) => s + o.attorney_fee, 0),
      orders: orders_in_day.length,
    })
  }

  const ratingRows = ratingsRes.data ?? []
  const rating_count = ratingRows.length
  const rating_avg = rating_count ? Number((ratingRows.reduce((s, r) => s + r.stars, 0) / rating_count).toFixed(2)) : null

  const attorney = (attorneyRes.data ?? {}) as { stripe_account_id?: string | null; stripe_onboarding_complete?: boolean | null; available?: boolean | null }

  return Response.json({
    orders,
    summary: {
      active_orders: active.length,
      completed_orders: completed.length,
      open_inquiries: openInquiriesRes.count ?? 0,
      my_engaged_inquiries: new Set((mineInquiriesRes.data ?? []).map((r) => r.inquiry_id)).size,
      earnings_lifetime,
      earnings_month,
      rating_count,
      rating_avg,
    },
    trend,
    connect: {
      has_account: Boolean(attorney.stripe_account_id),
      onboarding_complete: Boolean(attorney.stripe_onboarding_complete),
      available: attorney.available !== false,
    },
  })
}
