import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const TERMINAL = ['completed', 'released', 'cancelled', 'refunded']

export async function GET(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const warnings: string[] = []

  // Fetch all orders
  const { data: orders, error } = await db
    .from('orders')
    .select(
      'id, status, escrow_status, payout_status, total_amount, platform_fee_amount, consultant_payout_amount, delivery_deadline, created_at, status_updated_at, cancelled_at, refunded_at, attorney_id, consultant_id, revision_reason'
    )
  if (error) return fail(error.message, 500)

  const rows = (orders || []) as any[]
  const now = new Date()

  // by_status
  const byStatus: Record<string, number> = {}
  rows.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1 })

  // by_provider_type (attorney_id set = attorney, else consultant)
  let attyCount = 0, attyGross = 0, consCount = 0, consGross = 0
  rows.forEach(o => {
    if (o.attorney_id) {
      attyCount++; attyGross += Number(o.total_amount || 0)
    } else {
      consCount++; consGross += Number(o.total_amount || 0)
    }
  })

  // completion_rate, cancellation_rate
  const completedCount = rows.filter(o => o.status === 'completed' || o.status === 'released').length
  const cancelledCount = rows.filter(o => o.status === 'cancelled').length
  const refundedCount = rows.filter(o => o.status === 'refunded').length
  const denomCR = completedCount + cancelledCount
  const completion_rate = denomCR > 0 ? completedCount / denomCR : 0
  const cancellation_rate = denomCR > 0 ? cancelledCount / denomCR : 0

  // avg_order_value
  const totalGross = rows.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const avg_order_value = rows.length > 0 ? totalGross / rows.length : 0

  // avg_days_to_complete (completed orders only)
  const completedRows = rows.filter(o => (o.status === 'completed' || o.status === 'released') && o.status_updated_at && o.created_at)
  const avgDaysToComplete = completedRows.length > 0
    ? completedRows.reduce((s, o) => {
        const diff = (new Date(o.status_updated_at).getTime() - new Date(o.created_at).getTime()) / 86400000
        return s + diff
      }, 0) / completedRows.length
    : 0

  // revision_rate: orders that had revision_requested status / completed orders
  const revisedCount = rows.filter(o => o.revision_reason != null).length
  const revision_rate = completedRows.length > 0 ? revisedCount / completedRows.length : 0

  // late_delivery_count
  const late_delivery_count = rows.filter(o =>
    o.delivery_deadline && new Date(o.delivery_deadline) < now && !TERMINAL.includes(o.status)
  ).length

  // monthly_volume: last 12 months
  const monthlyMap: Record<string, { count: number; gross: number }> = {}
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 11)
  cutoff.setDate(1)
  cutoff.setHours(0, 0, 0, 0)
  rows.forEach(o => {
    const d = new Date(o.created_at)
    if (d >= cutoff) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyMap[key]) monthlyMap[key] = { count: 0, gross: 0 }
      monthlyMap[key].count++
      monthlyMap[key].gross += Number(o.total_amount || 0)
    }
  })
  const monthly_volume = Object.entries(monthlyMap)
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // top_services: join order_items → services
  let top_services: Array<{ title: string; count: number; gross: number }> = []
  try {
    const { data: items } = await db
      .from('order_items')
      .select('order_id, service_id')
    if (items && items.length > 0) {
      const serviceIds = [...new Set((items as any[]).map(i => i.service_id).filter(Boolean))]
      const { data: services } = await db.from('services').select('id, title').in('id', serviceIds)
      const servicesMap: Record<string, string> = {}
      ;(services || []).forEach((s: any) => { servicesMap[s.id] = s.title })

      // map order_id → service info
      const orderServiceMap: Record<string, string> = {}
      ;(items as any[]).forEach(i => {
        if (!orderServiceMap[i.order_id] && i.service_id) {
          orderServiceMap[i.order_id] = i.service_id
        }
      })

      // aggregate by service_id
      const serviceStats: Record<string, { title: string; count: number; gross: number }> = {}
      rows.forEach(o => {
        const sid = orderServiceMap[o.id]
        if (!sid) return
        const title = servicesMap[sid] || sid
        if (!serviceStats[sid]) serviceStats[sid] = { title, count: 0, gross: 0 }
        serviceStats[sid].count++
        serviceStats[sid].gross += Number(o.total_amount || 0)
      })

      top_services = Object.values(serviceStats)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    }
  } catch {
    warnings.push('top_services_unavailable')
  }

  // refund_stats
  const refundedRows = rows.filter(o => o.status === 'refunded' || o.refunded_at)
  const refundTotal = refundedRows.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const refund_stats = {
    count: refundedRows.length,
    total: refundTotal,
    rate: rows.length > 0 ? refundedRows.length / rows.length : 0,
  }

  return ok(
    {
      by_status: byStatus,
      by_provider_type: {
        attorney: { count: attyCount, gross: attyGross },
        consultant: { count: consCount, gross: consGross },
      },
      completion_rate,
      cancellation_rate,
      avg_order_value,
      avg_days_to_complete: avgDaysToComplete,
      revision_rate,
      late_delivery_count,
      monthly_volume,
      top_services,
      refund_stats,
    },
    {},
    warnings.length ? { data_warnings: warnings } : {}
  )
}
