import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DEFAULT_FEE = 30

type Period = '30d' | '90d' | '365d' | 'all'
type Granularity = 'day' | 'week' | 'month'

function periodStart(period: Period): string | null {
  if (period === 'all') return null
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365
  return new Date(Date.now() - days * 86400_000).toISOString()
}

function bucketKey(date: string, granularity: Granularity): string {
  const d = new Date(date)
  if (granularity === 'day') return d.toISOString().slice(0, 10)
  if (granularity === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  // week: ISO week Monday
  const day = d.getUTCDay() || 7
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - day + 1)
  return monday.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { searchParams } = new URL(req.url)
  const period: Period      = (searchParams.get('period') as Period)      || '30d'
  const granularity: Granularity = (searchParams.get('granularity') as Granularity) || 'day'

  const data_warnings: string[] = []
  const since = periodStart(period)

  // Platform fee
  let platformFee = DEFAULT_FEE
  let consultantFee = 80
  try {
    const { data: settings } = await db
      .from('platform_settings')
      .select('value')
      .eq('key', 'default')
      .single()
    if (settings?.value?.platform_fee_percent)  platformFee   = Number(settings.value.platform_fee_percent)
    if (settings?.value?.consultant_fee_percent) consultantFee = Number(settings.value.consultant_fee_percent)
  } catch {
    data_warnings.push('platform_settings unavailable; using defaults')
  }

  // Orders in period
  let orders: any[] = []
  try {
    let q = db
      .from('orders')
      .select('id, status, total_amount, created_at, consultant_id, gig_id')
    if (since) q = q.gte('created_at', since)
    const { data, error } = await q
    if (error) throw error
    orders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e.message}`)
  }

  const validOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status))

  // Time series
  const buckets: Record<string, { gross: number; count: number }> = {}
  for (const o of validOrders) {
    const key = bucketKey(o.created_at, granularity)
    if (!buckets[key]) buckets[key] = { gross: 0, count: 0 }
    buckets[key].gross += Number(o.total_amount) || 0
    buckets[key].count += 1
  }
  const time_series = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { gross, count }]) => ({
      date,
      gross,
      net: gross * (platformFee / 100),
      order_count: count,
      avg_order_value: count ? gross / count : 0,
    }))

  // By category — join via gig_id
  let gigCategoryMap: Record<string, string> = {}
  try {
    const gigIds = [...new Set(validOrders.map(o => o.gig_id).filter(Boolean))]
    if (gigIds.length) {
      const { data, error } = await db
        .from('gigs')
        .select('id, category')
        .in('id', gigIds)
      if (error) throw error
      for (const g of data ?? []) gigCategoryMap[g.id] = g.category || 'uncategorized'
    }
  } catch (e: any) {
    data_warnings.push(`gigs (category): ${e.message}`)
  }

  const catBuckets: Record<string, { gross: number; count: number }> = {}
  for (const o of validOrders) {
    const cat = (o.gig_id ? gigCategoryMap[o.gig_id] : null) || 'uncategorized'
    if (!catBuckets[cat]) catBuckets[cat] = { gross: 0, count: 0 }
    catBuckets[cat].gross += Number(o.total_amount) || 0
    catBuckets[cat].count += 1
  }
  const by_category = Object.entries(catBuckets)
    .map(([category, { gross, count }]) => ({ category, gross, count }))
    .sort((a, b) => b.gross - a.gross)

  // By provider type — need provider_type from gigs or profiles
  let providerTypeMap: Record<string, string> = {}
  try {
    const cids = [...new Set(validOrders.map(o => o.consultant_id).filter(Boolean))]
    if (cids.length) {
      const { data, error } = await db
        .from('profiles')
        .select('id, role')
        .in('id', cids)
      if (error) throw error
      for (const p of data ?? []) {
        providerTypeMap[p.id] = p.role === 'attorney' ? 'attorney' : 'consultant'
      }
    }
  } catch (e: any) {
    data_warnings.push(`profiles (provider_type): ${e.message}`)
  }

  const byProviderType: Record<string, { gross: number; count: number }> = {
    attorney:   { gross: 0, count: 0 },
    consultant: { gross: 0, count: 0 },
  }
  for (const o of validOrders) {
    const ptype = (o.consultant_id ? providerTypeMap[o.consultant_id] : null) || 'consultant'
    byProviderType[ptype].gross += Number(o.total_amount) || 0
    byProviderType[ptype].count += 1
  }

  // All-time cumulative
  let allOrders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount')
      .not('status', 'in', '(cancelled,refunded)')
    if (error) throw error
    allOrders = data ?? []
  } catch (e: any) {
    data_warnings.push(`cumulative orders: ${e.message}`)
  }
  const cumulativeGross = allOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)

  return ok({
    time_series,
    by_category,
    by_provider_type: byProviderType,
    cumulative: {
      gross: cumulativeGross,
      net: cumulativeGross * (platformFee / 100),
    },
    fee_settings: {
      platform_fee_percent:   platformFee,
      consultant_fee_percent: consultantFee,
    },
    data_warnings,
  })
}
