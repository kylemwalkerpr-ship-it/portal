import { getCurrentStudent } from '@/lib/student'

function dollarsFromCents(cents: unknown) {
  return Number(cents || 0) / 100
}

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile } = auth

  const [ordersRes, itemsRes, servicesRes, profilesRes] = await Promise.all([
    db.from('orders').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }),
    db.from('order_items').select('*'),
    db.from('services').select('*'),
    db.from('profiles').select('id, email, full_name, role'),
  ])

  const error = ordersRes.error || itemsRes.error || servicesRes.error || profilesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const orderRows = ordersRes.data ?? []
  const orderIds = orderRows.map(o => o.id)

  let fileCountByOrder = new Map<string, number>()
  let lastMessageByOrder = new Map<string, string>()
  if (orderIds.length > 0) {
    const [{ data: fileRows }, { data: msgRows }] = await Promise.all([
      db.from('order_files').select('order_id').in('order_id', orderIds),
      db.from('order_messages').select('order_id, created_at').in('order_id', orderIds).order('created_at', { ascending: false }),
    ])
    if (fileRows) {
      fileCountByOrder = fileRows.reduce((m, r) => {
        m.set(r.order_id, (m.get(r.order_id) || 0) + 1)
        return m
      }, new Map<string, number>())
    }
    if (msgRows) {
      for (const m of msgRows) {
        if (!lastMessageByOrder.has(m.order_id)) {
          lastMessageByOrder.set(m.order_id, m.created_at)
        }
      }
    }
  }

  const itemsByOrder = new Map((itemsRes.data ?? []).map(item => [item.order_id, item]))
  const serviceById = new Map((servicesRes.data ?? []).map(service => [service.id, service]))
  const profileById = new Map((profilesRes.data ?? []).map(p => [p.id, p]))

  const orders = orderRows.map(order => {
    const item = itemsByOrder.get(order.id)
    const service = serviceById.get(item?.service_id)
    const consultant = order.consultant_id ? profileById.get(order.consultant_id) : null
    const totalCents = Math.round(Number(order.total_amount || 0) * 100)
    const storedProgress = Number.isFinite(Number(order.progress)) ? Number(order.progress) : null
    const fallbackProgress = order.status === 'completed' ? 100 : order.status === 'review' ? 90 : order.status === 'active' ? 50 : 0
    return {
      id: order.id,
      service: service?.title || 'Service',
      serviceId: service?.id ?? null,
      deliverable: service?.title || 'Deliverable',
      consultant: consultant?.full_name || consultant?.email || (order.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
      consultantId: order.consultant_id ?? null,
      status: order.status === 'queued' ? 'pending' : order.status || 'pending',
      date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
      createdAt: order.created_at || null,
      deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : '—',
      progress: storedProgress ?? fallbackProgress,
      price: `$${dollarsFromCents(totalCents).toFixed(2)}`,
      totalCents,
      payoutStatus: order.payout_status || 'pending',
      escrowStatus: order.escrow_status || 'held',
      messages: 0,
      fileCount: fileCountByOrder.get(order.id) || 0,
      lastMessageAt: lastMessageByOrder.get(order.id) || null,
      termsAcceptedAt: order.terms_accepted_at || null,
      refundPolicyAcceptedAt: order.refund_policy_accepted_at || null,
    }
  })

  return Response.json({
    profile: {
      id: profile.id,
      name: profile.full_name || '',
      email: profile.email || '',
      // Vertical lets the dashboard scope its catalogue ('legal' = MyCaseworks,
      // 'study_abroad' = YouSafe). Default for legacy rows is study_abroad.
      vertical: profile.vertical || 'study_abroad',
    },
    orders,
  })
}
