/**
 * GET /api/admin/analytics/retention
 *
 * Monthly signup cohort table. For each of the trailing 12 months we report:
 *   - cohort size (profiles created that month)
 *   - active at 30/60/90 days after signup
 *
 * "Active at day N" means the profile placed an order OR sent an inquiry
 * in the [N-15, N+15] window after their signup date (a ±15-day slack so
 * a real touchpoint isn't missed by being one day off).
 *
 * Returns:
 *   cohorts  [{ month: 'YYYY-MM', size, active_30, active_60, active_90,
 *               pct_30, pct_60, pct_90 }]
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const MS = 86400_000

function ymKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const cohortStart = new Date(now - 365 * MS).toISOString()

  let profiles: Array<{ id: string; created_at: string; role: string }> = []
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, role, created_at')
      .eq('role', 'client')   // buyers carry role 'client' (shown as "students" in admin)
      .gte('created_at', cohortStart)
    if (error) throw error
    profiles = data ?? []
  } catch (e: any) {
    data_warnings.push(`profiles: ${e?.message || 'unavailable'}`)
  }
  const ids = profiles.map(p => p.id)

  let orders: Array<{ client_id: string; created_at: string }> = []
  let inquiries: Array<{ client_id: string; created_at: string }> = []
  if (ids.length) {
    try {
      const { data, error } = await db.from('orders').select('client_id, created_at').in('client_id', ids)
      if (error) throw error
      orders = (data ?? []).filter((r: any) => r.client_id && r.created_at)
    } catch (e: any) { data_warnings.push(`orders: ${e?.message || 'unavailable'}`) }
    try {
      const { data, error } = await db.from('inquiries').select('client_profile_id, created_at').in('client_profile_id', ids)
      if (error) throw error
      inquiries = (data ?? []).map((r: any) => ({ client_id: r.client_profile_id, created_at: r.created_at }))
        .filter((r: any) => r.client_id && r.created_at)
    } catch (e: any) { data_warnings.push(`inquiries: ${e?.message || 'unavailable'}`) }
  }

  // Build touchpoint index per client
  const touch: Record<string, number[]> = {}
  for (const r of orders)    (touch[r.client_id] ||= []).push(new Date(r.created_at).getTime())
  for (const r of inquiries) (touch[r.client_id] ||= []).push(new Date(r.created_at).getTime())

  // Bucket profiles by month, compute retention checkpoints
  const byMonth: Record<string, any[]> = {}
  for (const p of profiles) {
    const k = ymKey(new Date(p.created_at))
    ;(byMonth[k] ||= []).push(p)
  }

  type Cohort = {
    month: string
    size: number
    active_30: number; active_60: number; active_90: number
    pct_30: number;    pct_60: number;    pct_90: number
    mature_30: boolean; mature_60: boolean; mature_90: boolean
  }

  const cohorts: Cohort[] = []
  for (const [month, members] of Object.entries(byMonth)) {
    const size = members.length
    let a30 = 0, a60 = 0, a90 = 0
    for (const p of members) {
      const su = new Date(p.created_at).getTime()
      const events = touch[p.id] || []
      const has = (target: number) => events.some(t => Math.abs(t - (su + target * MS)) <= 15 * MS || (t > su && t <= su + target * MS))
      if (has(30)) a30++
      if (has(60)) a60++
      if (has(90)) a90++
    }
    // Maturity: only meaningful if month is old enough for the checkpoint to have passed
    const monthStart = new Date(`${month}-01T00:00:00Z`).getTime()
    cohorts.push({
      month,
      size,
      active_30: a30, active_60: a60, active_90: a90,
      pct_30: size ? (a30 / size) * 100 : 0,
      pct_60: size ? (a60 / size) * 100 : 0,
      pct_90: size ? (a90 / size) * 100 : 0,
      mature_30: (now - monthStart) >= 30 * MS,
      mature_60: (now - monthStart) >= 60 * MS,
      mature_90: (now - monthStart) >= 90 * MS,
    })
  }
  cohorts.sort((a, b) => b.month.localeCompare(a.month))

  return ok({ cohorts, data_warnings })
}
