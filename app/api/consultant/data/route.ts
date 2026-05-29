import { getCurrentConsultant } from '@/lib/consultant'

function dollarsFromCents(cents: unknown) {
  return Number(cents || 0) / 100
}

export async function GET() {
  try {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile, consultant } = auth

  const ordersRes = await db
    .from('orders')
    // Column was renamed in DB to `delivery_deadline` — alias it back to
    // `deadline` so the existing client + return shape stays unchanged.
    .select('id, order_number, client_id, status, requirements, created_at, updated_at, completed_at, deadline:delivery_deadline, progress, total_amount, consultant_payout_amount, payout_status')
    .eq('consultant_id', profile.id)
    .order('created_at', { ascending: false })

  if (ordersRes.error) return Response.json({ error: ordersRes.error.message }, { status: 500 })

  const orderRows = ordersRes.data ?? []
  const orderIds = orderRows.map(o => o.id)
  const clientIds = Array.from(new Set(orderRows.map(o => o.client_id).filter(Boolean)))

  const [itemsRes] = await Promise.all([
    orderIds.length
      ? db.from('order_items').select('order_id, service_id').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const serviceIds = Array.from(new Set((itemsRes.data ?? []).map(item => item.service_id).filter(Boolean)))
  const servicesRes = serviceIds.length
    ? await db.from('services').select('id, title').in('id', serviceIds)
    : { data: [], error: null }

  // Profiles select tolerates legacy schemas that don't yet have the `country` column.
  let profilesRes = clientIds.length
    ? await db.from('profiles').select('id, email, full_name, country').in('id', clientIds)
    : { data: [], error: null }
  if (profilesRes.error && /column .*country/i.test(profilesRes.error.message)) {
    profilesRes = await db.from('profiles').select('id, email, full_name').in('id', clientIds)
  }

  const error = itemsRes.error || servicesRes.error || profilesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let fileCountByOrder = new Map<string, number>()
  if (orderIds.length > 0) {
    const { data: fileRows } = await db
      .from('order_files')
      .select('order_id')
      .in('order_id', orderIds)
    if (fileRows) {
      fileCountByOrder = fileRows.reduce((m, r) => {
        m.set(r.order_id, (m.get(r.order_id) || 0) + 1)
        return m
      }, new Map<string, number>())
    }
  }

  const itemsByOrder = new Map((itemsRes.data ?? []).map(item => [item.order_id, item]))
  const serviceById = new Map((servicesRes.data ?? []).map(service => [service.id, service]))
  const profileById = new Map((profilesRes.data ?? []).map(p => [p.id, p]))

  const orders = orderRows.map(order => {
    const item = itemsByOrder.get(order.id)
    const service = serviceById.get(item?.service_id)
    const student = profileById.get(order.client_id)
    const payoutCents = Number(order.consultant_payout_amount || Math.round(Number(order.total_amount || 0) * 80))
    const storedProgress = Number.isFinite(Number(order.progress)) ? Number(order.progress) : null
    const fallbackProgress = order.status === 'completed' ? 100 : ['review', 'under_review'].includes(order.status) ? 90 : ['active', 'in_progress'].includes(order.status) ? 50 : 0
    return {
      id: order.id,
      orderNumber: order.order_number || null,
      service: service?.title || order.requirements || 'Custom engagement',
      student: student?.full_name || student?.email || 'Unknown student',
      clientId: order.client_id,
      country: student?.country || '—',
      status: ['queued', 'created'].includes(order.status) ? 'new' : order.status === 'in_progress' ? 'active' : order.status === 'under_review' ? 'review' : order.status || 'pending',
      date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
      createdAt: order.created_at || null,
      completedAt: order.completed_at || null,
      deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : '—',
      progress: storedProgress ?? fallbackProgress,
      earn: `$${dollarsFromCents(payoutCents).toFixed(2)}`,
      payoutStatus: order.payout_status || 'pending',
      consultantPayoutAmount: payoutCents,
      fileCount: fileCountByOrder.get(order.id) || 0,
    }
  })

  // Daily earnings for the last 30 days, based on completed orders with transferred or pending payouts
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: { date: string; cents: number; orders: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push({ date: d.toISOString().slice(0, 10), cents: 0, orders: 0 })
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]))

  for (const order of orderRows) {
    if (order.status !== 'completed') continue
    const ts = order.completed_at || order.updated_at || order.created_at
    if (!ts) continue
    const key = new Date(ts).toISOString().slice(0, 10)
    const idx = dayIndex.get(key)
    if (idx === undefined) continue
    days[idx].cents += Number(order.consultant_payout_amount || 0)
    days[idx].orders += 1
  }

  const defaultNotifPrefs = { orders: true, messages: true, payments: true }

  return Response.json({
    consultant: {
      name: profile.full_name || consultant.full_name || consultant.name || '',
      email: profile.email || consultant.email || '',
      bio: consultant.bio || '',
      avatarUrl: consultant.avatar_url || consultant.headshot_url || consultant.photo_url || '',
      available: consultant.available !== false,
      autoWithdraw: Boolean(consultant.auto_withdraw),
      notifPrefs: { ...defaultNotifPrefs, ...(consultant.notif_prefs || {}) },
    },
    orders,
    earningsByDay: days,
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[consultant/data] unhandled error:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
