/**
 * Google Search Console — site-wide performance analytics.
 *
 * Separate from lib/gscKeywordSignals.ts (which pulls per-category keyword
 * signals for the gig-draft path). This module powers the admin dashboard's
 * Search tab: property-wide clicks / impressions / CTR / position, a daily
 * series, and top queries / pages / devices / countries.
 *
 * Reuses the same OAuth-refresh-token credentials already configured for the
 * keyword path (GSC_OAUTH_* + GSC_SITE_URL), falling back to the service
 * account JSON (GSC_SERVICE_ACCOUNT_JSON | GSC_SERVICE_ACCOUNT_KEY).
 * Edge-safe: plain fetch only.
 */

import { getGscAccess } from '@/lib/gscAuth'

export interface GscRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscAnalytics {
  configured: boolean
  range: { startDate: string; endDate: string; days: number }
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  totalsPrev: { clicks: number; impressions: number } | null
  daily: Array<{ date: string; clicks: number; impressions: number }>
  topQueries: GscRow[]
  topPages: GscRow[]
  topDevices: GscRow[]
  topCountries: GscRow[]
  warnings: string[]
}

function mapRows(rows: any[], keyIndex = 0): GscRow[] {
  return (rows ?? []).map((r) => ({
    key: (r.keys?.[keyIndex] ?? '').trim(),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

async function query(token: string, site: string, body: Record<string, unknown>): Promise<any[]> {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GSC query ${res.status}`)
  const json = (await res.json()) as { rows?: any[] }
  return json.rows ?? []
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export async function fetchSiteSearchAnalytics(days = 28): Promise<GscAnalytics> {
  const access = await getGscAccess()
  const site = access?.siteUrl ?? process.env.GSC_SITE_URL ?? null
  const warnings: string[] = []
  const endMs = Date.now()
  const startMs = endMs - days * 86400_000
  const prevStartMs = startMs - days * 86400_000
  const range = { startDate: ymd(startMs), endDate: ymd(endMs), days }

  const empty: GscAnalytics = {
    configured: false,
    range,
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    totalsPrev: null,
    daily: [],
    topQueries: [],
    topPages: [],
    topDevices: [],
    topCountries: [],
    warnings,
  }

  const token = access?.accessToken ?? null
  if (!token) {
    warnings.push('GSC credentials not configured (set GSC_SERVICE_ACCOUNT_JSON or OAuth bundle)')
    return empty
  }
  if (!site) {
    warnings.push('GSC property URL not set (GSC_SITE_URL, e.g. sc-domain:yousafeconsultancy.com)')
    return empty
  }

  const settled = await Promise.allSettled([
    query(token, site, { startDate: range.startDate, endDate: range.endDate }),                                   // totals
    query(token, site, { startDate: ymd(prevStartMs), endDate: range.startDate }),                                // prev totals
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['date'] }),             // daily
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['query'], rowLimit: 25 }),
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['page'], rowLimit: 25 }),
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['device'], rowLimit: 10 }),
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['country'], rowLimit: 10 }),
  ])

  const [totalsR, prevR, dailyR, queriesR, pagesR, devicesR, countriesR] = settled
  const grab = (r: PromiseSettledResult<any[]>, label: string): any[] => {
    if (r.status === 'fulfilled') return r.value
    warnings.push(`${label}: ${String((r as PromiseRejectedResult).reason).slice(0, 80)}`)
    return []
  }

  const t = grab(totalsR, 'totals')[0] ?? {}
  const p = grab(prevR, 'totalsPrev')[0]
  const daily = grab(dailyR, 'daily')
    .map((r) => ({ date: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    configured: true,
    range,
    totals: {
      clicks: t.clicks ?? 0,
      impressions: t.impressions ?? 0,
      ctr: t.ctr ?? 0,
      position: t.position ?? 0,
    },
    totalsPrev: p ? { clicks: p.clicks ?? 0, impressions: p.impressions ?? 0 } : null,
    daily,
    topQueries: mapRows(grab(queriesR, 'queries')).filter((r) => r.key),
    topPages: mapRows(grab(pagesR, 'pages')).filter((r) => r.key),
    topDevices: mapRows(grab(devicesR, 'devices')).filter((r) => r.key),
    topCountries: mapRows(grab(countriesR, 'countries')).filter((r) => r.key),
    warnings,
  }
}
