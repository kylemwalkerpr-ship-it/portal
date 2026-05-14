import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

type Period = '30d' | '90d' | '365d'

function periodStart(period: Period): string {
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365
  return new Date(Date.now() - days * 86400_000).toISOString()
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { searchParams } = new URL(req.url)
  const period: Period = (searchParams.get('period') as Period) || '30d'
  const since = periodStart(period)

  const data_warnings: string[] = []

  // Orders in period
  let orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount, created_at, updated_at, client_id, consultant_id, escrow_status, amount_paid')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    if (error) throw error
    orders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e.message}`)
  }

  // By status
  const by_status: Record<string, number> = {}
  for (const o of orders) {
    by_status[o.status] = (by_status[o.status] ?? 0) + 1
  }

  const total = orders.length
  const completed  = by_status['completed']  ?? 0
  const cancelled  = by_status['cancelled']  ?? 0
  const completion_rate   = total ? (completed  / total) * 100 : 0
  const cancellation_rate = total ? (cancelled  / total) * 100 : 0

  const activeOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status))
  const amounts = activeOrders.map(o => Number(o.total_amount) || 0)
  const totalGross = amounts.reduce((s, a) => s + a, 0)
  const avg_order_value = amounts.length ? totalGross / amounts.length : 0
  const median_order_value = median(amounts)

  // Avg time to complete (days)
  const completedOrders = orders.filter(o => o.status === 'completed' && o.created_at && o.updated_at)
  const avgDays = completedOrders.length
    ? completedOrders.reduce((s, o) => {
        const diff = new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()
        return s + diff / 86400_000
      }, 0) / completedOrders.length
    : 0

  // By provider type
  let providerTypeMap: Record<string, string> = {}
  try {
    const cids = [...new Set(orders.map((o: any) => o.consultant_id).filter(Boolean))]
    if (cids.length) {
      const { data, error } = await db
        .from('profiles')
        .select('id, role')
        .in('id', cids)
      if (error) throw error
      for (const p of data ?? []) providerTypeMap[p.id] = p.role === 'attorney' ? 'attorney' : 'consultant'
    }
  } catch (e: any) {
    data_warnings.push(`profiles (provider_type): ${e.message}`)
  }

  const byProviderType: Record<string, { count: number; gross: number }> = {
    attorney:   { count: 0, gross: 0 },
    consultant: { count: 0, gross: 0 },
  }
  for (const o of activeOrders) {
    const pt = (o.consultant_id ? providerTypeMap[o.consultant_id] : null) || 'consultant'
    byProviderType[pt].count++
    byProviderType[pt].gross += Number(o.total_amount) || 0
  }

  // Recent 20 orders with names
  const recent20 = orders.slice(0, 20)
  let recent_orders: any[] = recent20.map(o => ({
    id:              o.id,
    status:          o.status,
    total_amount:    Number(o.total_amount) || 0,
    created_at:      o.created_at,
    student_name:    null as string | null,
    consultant_name: null as string | null,
    client_id:       o.client_id,
    consultant_id:   o.consultant_id,
  }))

  try {
    const allIds = [
      ...new Set([
        ...recent20.map(o => o.client_id),
        ...recent20.map(o => o.consultant_id),
      ].filter(Boolean))
    ]
    if (allIds.length) {
      const { data: profs, error } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allIds)
      if (error) throw error
      const profMap: Record<string, any> = {}
      for (const p of profs ?? []) profMap[p.id] = p

      recent_orders = recent_orders.map(o => ({
        ...o,
        student_name:    profMap[o.client_id]?.full_name || profMap[o.client_id]?.email || null,
        consultant_name: profMap[o.consultant_id]?.full_name || profMap[o.consultant_id]?.email || null,
        client_id:      undefined,
        consultant_id:  undefined,
      }))
    }
  } catch (e: any) {
    data_warnings.push(`recent_orders profiles: ${e.message}`)
  }

  // Escrow health
  const held     = orders.filter(o => o.escrow_status === 'held')
  const released = orders.filter(o => o.escrow_status === 'released')
  const escrow_health = {
    held_count:     held.length,
    held_total:     held.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
    released_count: released.length,
    released_total: released.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
  }

  return ok({
    by_status,
    completion_rate,
    cancellation_rate,
    avg_order_value,
    median_order_value,
    time_to_complete_days: avgDays,
    by_provider_type: byProviderType,
    recent_orders,
    escrow_health,
    data_warnings,
  })
}
