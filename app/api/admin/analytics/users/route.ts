import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

type Period = '30d' | '90d' | '365d' | 'all'

function periodStart(period: Period): string | null {
  if (period === 'all') return null
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365
  return new Date(Date.now() - days * 86400_000).toISOString()
}

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { searchParams } = new URL(req.url)
  const period: Period = (searchParams.get('period') as Period) || '30d'
  const since = periodStart(period)

  const data_warnings: string[] = []

  // All profiles (for by_role, by_status, top_countries)
  let allProfiles: any[] = []
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, role, status, country, created_at')
    if (error) throw error
    allProfiles = data ?? []
  } catch (e: any) {
    data_warnings.push(`profiles: ${e.message}`)
  }

  // Growth series (profiles in period)
  const periodProfiles = since
    ? allProfiles.filter(p => p.created_at >= since)
    : allProfiles

  const dayBuckets: Record<string, number> = {}
  for (const p of periodProfiles) {
    const day = String(p.created_at).slice(0, 10)
    dayBuckets[day] = (dayBuckets[day] ?? 0) + 1
  }

  const sortedDays = Object.keys(dayBuckets).sort()
  let cumulative = 0
  const growth_series = sortedDays.map(date => {
    cumulative += dayBuckets[date]
    return { date, new_users: dayBuckets[date], cumulative }
  })

  // By role
  const by_role: Record<string, number> = { student: 0, consultant: 0, attorney: 0, support: 0 }
  for (const p of allProfiles) {
    if (p.role in by_role) by_role[p.role]++
  }

  // By status
  const by_status: Record<string, number> = { active: 0, pending: 0, suspended: 0 }
  for (const p of allProfiles) {
    const s = p.status || 'active'
    by_status[s] = (by_status[s] ?? 0) + 1
  }

  // Top countries
  const countryCounts: Record<string, number> = {}
  for (const p of allProfiles) {
    if (p.country) countryCounts[p.country] = (countryCounts[p.country] ?? 0) + 1
  }
  const top_countries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }))

  // Activation rate: students with at least 1 order / total students
  let studentOrderSet = new Set<string>()
  try {
    const { data, error } = await db.from('orders').select('client_id')
    if (error) throw error
    for (const o of data ?? []) if (o.client_id) studentOrderSet.add(o.client_id)
  } catch (e: any) {
    data_warnings.push(`orders (activation): ${e.message}`)
  }
  const students = allProfiles.filter(p => p.role === 'student')
  const activated = students.filter(p => studentOrderSet.has(p.id)).length
  const activation_rate = students.length ? (activated / students.length) * 100 : 0

  // New providers in last 30 days
  const ago30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const new_providers_30d = allProfiles.filter(
    p => (p.role === 'attorney' || p.role === 'consultant') && p.created_at >= ago30
  ).length

  // Churn risk: students whose last order was > 60 days ago
  let churn_risk_count = 0
  try {
    const ago60 = new Date(Date.now() - 60 * 86400_000).toISOString()
    const { data, error } = await db
      .from('orders')
      .select('client_id, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error

    const lastOrderByClient: Record<string, string> = {}
    for (const o of data ?? []) {
      if (o.client_id && !lastOrderByClient[o.client_id]) {
        lastOrderByClient[o.client_id] = o.created_at
      }
    }
    const studentIds = new Set(students.map(p => p.id))
    for (const [cid, lastAt] of Object.entries(lastOrderByClient)) {
      if (studentIds.has(cid) && lastAt < ago60) churn_risk_count++
    }
  } catch (e: any) {
    data_warnings.push(`churn_risk: ${e.message}`)
  }

  return ok({
    growth_series,
    by_role,
    by_status,
    top_countries,
    activation_rate,
    new_providers_30d,
    churn_risk_count,
    data_warnings,
  })
}
