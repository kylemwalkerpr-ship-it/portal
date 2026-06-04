/**
 * GET /api/admin/analytics/projections
 *
 * 3-month forward revenue projection from 90-day run rate, broken out by
 * provider-role. We don't have enough monthly history for fancy ARIMA, so
 * we use:
 *   point estimate = mean monthly gross from last 90 days
 *   confidence band = ± 1 standard deviation across the 3 monthly buckets
 *
 * Returns:
 *   by_role  {
 *     attorney:   { run_rate_30d_cents, lo_cents, hi_cents, monthly_buckets },
 *     consultant: { run_rate_30d_cents, lo_cents, hi_cents, monthly_buckets },
 *     total:      { run_rate_30d_cents, lo_cents, hi_cents, monthly_buckets },
 *   }
 *   forward_3m  [{ month: 'YYYY-MM', point_cents, lo_cents, hi_cents, role: 'total' }]
 *
 * Cents end-to-end.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DAY = 86400_000

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

function ymKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago90 = new Date(now - 90 * DAY).toISOString()
  const toCents = (n: any) => Math.round((Number(n) || 0) * 100)

  // ── Pull active orders + their provider role ────────────────────────────────
  let orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount, consultant_id, created_at')
      .gte('created_at', ago90)
      .not('status', 'in', '(cancelled,refunded)')
    if (error) throw error
    orders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e?.message || 'unavailable'}`)
  }

  const consultantIds = [...new Set(orders.map(o => o.consultant_id).filter(Boolean))]
  const roleMap: Record<string, string> = {}
  try {
    if (consultantIds.length) {
      const { data, error } = await db.from('profiles').select('id, role').in('id', consultantIds)
      if (error) throw error
      for (const p of data ?? []) roleMap[p.id] = p.role === 'attorney' ? 'attorney' : 'consultant'
    }
  } catch (e: any) {
    data_warnings.push(`profiles (provider_type): ${e?.message || 'unavailable'}`)
  }

  // Bucket gross_cents by month + role (last 3 months only)
  const monthsTracked: string[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now - i * 30 * DAY)
    monthsTracked.push(ymKey(d))
  }

  type Buckets = Record<string, number>
  const byRoleMonth: Record<string, Buckets> = {
    attorney:   Object.fromEntries(monthsTracked.map(m => [m, 0])),
    consultant: Object.fromEntries(monthsTracked.map(m => [m, 0])),
    total:      Object.fromEntries(monthsTracked.map(m => [m, 0])),
  }
  for (const o of orders) {
    const k = ymKey(new Date(o.created_at))
    if (!(k in byRoleMonth.total)) continue
    const cents = toCents(o.total_amount)
    const role = (o.consultant_id ? roleMap[o.consultant_id] : null) || 'consultant'
    byRoleMonth[role][k] += cents
    byRoleMonth.total[k] += cents
  }

  function summary(role: 'attorney' | 'consultant' | 'total') {
    const buckets = byRoleMonth[role]
    const vals = Object.values(buckets)
    const mean = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0
    const sd = stddev(vals)
    return {
      run_rate_30d_cents: Math.round(mean),
      lo_cents: Math.max(0, Math.round(mean - sd)),
      hi_cents: Math.round(mean + sd),
      monthly_buckets: buckets,
    }
  }

  const by_role = {
    attorney:   summary('attorney'),
    consultant: summary('consultant'),
    total:      summary('total'),
  }

  // Forward 3 months (total)
  const forward_3m: Array<{ month: string; point_cents: number; lo_cents: number; hi_cents: number }> = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now + i * 30 * DAY)
    forward_3m.push({
      month: ymKey(d),
      point_cents: by_role.total.run_rate_30d_cents,
      lo_cents:    by_role.total.lo_cents,
      hi_cents:    by_role.total.hi_cents,
    })
  }

  return ok({ by_role, forward_3m, months_tracked: monthsTracked, data_warnings })
}
