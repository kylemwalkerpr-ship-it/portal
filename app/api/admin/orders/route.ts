import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const TERMINAL = ['completed', 'released', 'cancelled', 'refunded']

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)

  const status = searchParams.get('status')
  const escrow = searchParams.get('escrow')
  const payout = searchParams.get('payout')
  const q = searchParams.get('q')?.toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
  const sort = ['created_at', 'amount', 'status'].includes(searchParams.get('sort') || '')
    ? searchParams.get('sort')!
    : 'created_at'
  const dir = searchParams.get('dir') === 'asc' ? true : false

  let query = db.from('orders').select(
    'id, order_number, status, escrow_status, payout_status, total_amount, platform_fee_amount, consultant_payout_amount, stripe_payment_intent_id, stripe_transfer_id, delivery_deadline, cancelled_at, refunded_at, status_updated_at, created_at, updated_at, consultant_id, client_id, revision_reason, offer_id, attorney_id'
  )

  if (status) query = query.eq('status', status)
  if (escrow) query = query.eq('escrow_status', escrow)
  if (payout) query = query.eq('payout_status', payout)

  const sortCol = sort === 'amount' ? 'total_amount' : sort
  query = query.order(sortCol as any, { ascending: dir }).limit(limit)

  const { data: orders, error } = await query
  if (error) return fail(error.message, 500)

  const rows = (orders || []) as any[]
  const warnings: string[] = []

  // Filter by search term (client/provider name, order_number, service)
  let filtered = rows

  // Collect unique profile ids
  const profileIds = new Set<string>()
  rows.forEach(o => {
    if (o.client_id) profileIds.add(o.client_id)
    if (o.consultant_id) profileIds.add(o.consultant_id)
  })

  const profileMap: Record<string, any> = {}
  if (profileIds.size > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', Array.from(profileIds))
    ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p })
  }

  // Service titles via order_items
  const orderIds = rows.map(o => o.id)
  const serviceTitleMap: Record<string, string | null> = {}
  if (orderIds.length > 0) {
    try {
      const { data: items } = await db
        .from('order_items')
        .select('order_id, service_id')
        .in('order_id', orderIds)
      const serviceIds = [...new Set((items || []).map((i: any) => i.service_id).filter(Boolean))]
      let servicesMap: Record<string, string> = {}
      if (serviceIds.length > 0) {
        const { data: services } = await db
          .from('services')
          .select('id, title')
          .in('id', serviceIds)
        ;(services || []).forEach((s: any) => { servicesMap[s.id] = s.title })
      }
      ;(items || []).forEach((i: any) => {
        if (!serviceTitleMap[i.order_id]) {
          serviceTitleMap[i.order_id] = servicesMap[i.service_id] ?? null
        }
      })
    } catch {
      warnings.push('service_titles_unavailable')
    }
  }

  // Event counts
  const eventCountMap: Record<string, number> = {}
  if (orderIds.length > 0) {
    try {
      const { data: evts } = await db
        .from('order_events')
        .select('order_id')
        .in('order_id', orderIds)
      ;(evts || []).forEach((e: any) => {
        eventCountMap[e.order_id] = (eventCountMap[e.order_id] || 0) + 1
      })
    } catch {
      warnings.push('event_counts_unavailable')
    }
  }

  // Message counts (table may not exist)
  const msgCountMap: Record<string, number> = {}
  if (orderIds.length > 0) {
    try {
      const { data: msgs } = await db
        .from('order_messages')
        .select('order_id')
        .in('order_id', orderIds)
      ;(msgs || []).forEach((m: any) => {
        msgCountMap[m.order_id] = (msgCountMap[m.order_id] || 0) + 1
      })
    } catch {
      warnings.push('message_counts_unavailable')
    }
  }

  const now = new Date()
  const enriched = rows.map(o => {
    const client = profileMap[o.client_id] || {}
    const provider = profileMap[o.consultant_id] || {}
    const createdAt = new Date(o.created_at)
    const daysOpen = Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
    const isLate = !!(o.delivery_deadline && new Date(o.delivery_deadline) < now && !TERMINAL.includes(o.status))

    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      escrow_status: o.escrow_status,
      payout_status: o.payout_status,
      gross: Number(o.total_amount),
      fee: Number(o.platform_fee_amount),
      payout: Number(o.consultant_payout_amount),
      stripe_pi: o.stripe_payment_intent_id,
      stripe_transfer: o.stripe_transfer_id,
      deadline: o.delivery_deadline,
      cancelled_at: o.cancelled_at,
      refunded_at: o.refunded_at,
      created_at: o.created_at,
      updated_at: o.updated_at,
      client_id: o.client_id,
      client_name: client.full_name || null,
      client_email: client.email || null,
      provider_id: o.consultant_id,
      provider_name: provider.full_name || null,
      provider_email: provider.email || null,
      provider_role: provider.role || null,
      service_title: serviceTitleMap[o.id] ?? null,
      event_count: eventCountMap[o.id] || 0,
      message_count: msgCountMap[o.id] || 0,
      days_open: daysOpen,
      is_late: isLate,
      revision_reason: o.revision_reason,
      offer_id: o.offer_id,
    }
  })

  // Apply text search after enrichment
  if (q) {
    filtered = enriched.filter(o =>
      [o.order_number, o.client_name, o.client_email, o.provider_name, o.provider_email, o.service_title]
        .some(v => v && String(v).toLowerCase().includes(q))
    )
  } else {
    filtered = enriched
  }

  // Summary
  const statusCounts: Record<string, number> = {}
  let escrowHeldCount = 0, escrowHeldTotal = 0
  let escrowReleasedCount = 0, escrowReleasedTotal = 0
  let payoutPendingCount = 0, payoutTransferredCount = 0, payoutFailedCount = 0
  let lateCount = 0
  let totalGross = 0, totalFee = 0, totalPayout = 0

  enriched.forEach(o => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
    if (o.escrow_status === 'held') { escrowHeldCount++; escrowHeldTotal += o.gross }
    if (o.escrow_status === 'released') { escrowReleasedCount++; escrowReleasedTotal += o.gross }
    if (o.payout_status === 'pending') payoutPendingCount++
    if (o.payout_status === 'transferred') payoutTransferredCount++
    if (o.payout_status === 'failed') payoutFailedCount++
    if (o.is_late) lateCount++
    totalGross += o.gross
    totalFee += o.fee
    totalPayout += o.payout
  })

  const summary = {
    total: enriched.length,
    pending: statusCounts['pending'] || 0,
    in_progress: statusCounts['in_progress'] || 0,
    under_review: statusCounts['under_review'] || 0,
    revision_requested: statusCounts['revision_requested'] || 0,
    completed: statusCounts['completed'] || 0,
    released: statusCounts['released'] || 0,
    cancelled: statusCounts['cancelled'] || 0,
    refunded: statusCounts['refunded'] || 0,
    escrow_held_count: escrowHeldCount,
    escrow_held_total: escrowHeldTotal,
    escrow_released_count: escrowReleasedCount,
    escrow_released_total: escrowReleasedTotal,
    payout_pending_count: payoutPendingCount,
    payout_transferred_count: payoutTransferredCount,
    payout_failed_count: payoutFailedCount,
    late_count: lateCount,
    total_gross: totalGross,
    total_fee: totalFee,
    total_payout: totalPayout,
  }

  return ok({ orders: filtered, summary }, {}, warnings.length ? { data_warnings: warnings } : {})
}
