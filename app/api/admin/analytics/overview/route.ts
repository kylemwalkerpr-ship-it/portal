import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DEFAULT_FEE = 30

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []

  const now = new Date()
  const ago30 = new Date(now.getTime() - 30 * 86400_000).toISOString()
  const ago7  = new Date(now.getTime() -  7 * 86400_000).toISOString()

  // Platform fee
  let platformFee = DEFAULT_FEE
  try {
    const { data: settings } = await db
      .from('platform_settings')
      .select('value')
      .eq('key', 'default')
      .single()
    if (settings?.value?.platform_fee_percent) {
      platformFee = Number(settings.value.platform_fee_percent)
    }
  } catch {
    data_warnings.push('platform_settings unavailable; using default fee')
  }

  // Profiles
  let profiles: any[] = []
  try {
    const { data, error } = await db.from('profiles').select('id, role, status, created_at')
    if (error) throw error
    profiles = data ?? []
  } catch (e: any) {
    data_warnings.push(`profiles: ${e.message}`)
  }

  const byRole: Record<string, number> = {}
  for (const p of profiles) {
    byRole[p.role] = (byRole[p.role] ?? 0) + 1
  }
  const new_users_30d = profiles.filter(p => p.created_at >= ago30).length
  const new_users_7d  = profiles.filter(p => p.created_at >= ago7).length

  // Orders
  let orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount, created_at')
    if (error) throw error
    orders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e.message}`)
  }

  const activeOrders   = orders.filter(o => !['cancelled', 'refunded'].includes(o.status))
  const total_orders   = orders.length
  const orders_30d     = orders.filter(o => o.created_at >= ago30).length
  const orders_7d      = orders.filter(o => o.created_at >= ago7).length
  const gross_revenue  = activeOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
  const net_revenue    = gross_revenue * (platformFee / 100)
  const gross_30d      = activeOrders.filter(o => o.created_at >= ago30).reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
  const gross_7d       = activeOrders.filter(o => o.created_at >= ago7).reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
  const avg_order_value = activeOrders.length ? gross_revenue / activeOrders.length : 0

  const completed   = orders.filter(o => o.status === 'completed').length
  const cancelled   = orders.filter(o => o.status === 'cancelled').length
  const completion_rate   = total_orders ? (completed / total_orders) * 100 : 0
  const cancellation_rate = total_orders ? (cancelled / total_orders) * 100 : 0

  // Gigs
  let gigs: any[] = []
  try {
    const { data, error } = await db.from('gigs').select('id, status').is('deleted_at', null)
    if (error) throw error
    gigs = data ?? []
  } catch (e: any) {
    data_warnings.push(`gigs: ${e.message}`)
  }
  const active_gigs = gigs.filter(g => g.status === 'active').length
  const total_gigs  = gigs.length

  // Inquiries
  let total_inquiries = 0
  try {
    const { count, error } = await db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    total_inquiries = count ?? 0
  } catch (e: any) {
    data_warnings.push(`inquiries: ${e.message}`)
  }

  return ok({
    total_users: {
      student:    byRole['client']     ?? byRole['student'] ?? 0,
      consultant: byRole['consultant'] ?? 0,
      attorney:   byRole['attorney']   ?? 0,
      support:    byRole['support']    ?? 0,
      admin:      byRole['admin']      ?? 0,
      total:      profiles.length,
    },
    new_users_30d,
    new_users_7d,
    total_orders,
    orders_30d,
    orders_7d,
    gross_revenue,
    net_revenue,
    gross_30d,
    gross_7d,
    active_gigs,
    total_gigs,
    total_inquiries,
    avg_order_value,
    completion_rate,
    cancellation_rate,
    platform_fee_percent: platformFee,
    data_warnings,
  })
}
