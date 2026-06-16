/**
 * Google Search Console — site-wide performance analytics.
 *
 * Separate from lib/gscKeywordSignals.ts (which pulls per-category keyword
 * signals for the gig-draft path). This module powers the admin dashboard's
 * Search tab: property-wide clicks / impressions / CTR / position, a daily
 * series, and top queries + pages.
 *
 * Reuses the same OAuth-refresh-token credentials already configured for the
 * keyword path (GSC_OAUTH_* + GSC_SITE_URL). Edge-safe: plain fetch only.
 */

import { getGscConfig } from '@/lib/gscConfig'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function getAccessToken(cfg: { refreshToken: string | null; clientId: string | null; clientSecret: string | null }): Promise<string | null> {
  const { refreshToken, clientId, clientSecret } = cfg
  if (!refreshToken || !clientId || !clientSecret) return null
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { access_token?: string }
    return json.access_token ?? null
  } catch {
    return null
  }
}

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
  const cfg = await getGscConfig()
  const site = cfg.siteUrl
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
    warnings,
  }

  const token = await getAccessToken(cfg)
  if (!token) { warnings.push('GSC OAuth credentials not configured'); return empty }
  if (!site) { warnings.push('GSC property URL not set'); return empty }

  const settled = await Promise.allSettled([
    query(token, site, { startDate: range.startDate, endDate: range.endDate }),                                   // totals
    query(token, site, { startDate: ymd(prevStartMs), endDate: range.startDate }),                                // prev totals
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['date'] }),             // daily
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['query'], rowLimit: 25 }),
    query(token, site, { startDate: range.startDate, endDate: range.endDate, dimensions: ['page'], rowLimit: 25 }),
  ])

  const [totalsR, prevR, dailyR, queriesR, pagesR] = settled
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
    warnings,
  }
}
