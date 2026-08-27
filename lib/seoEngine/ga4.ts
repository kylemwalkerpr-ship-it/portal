/**
 * Google Analytics 4 Data API — owned-site engagement demand for the
 * Master Engine. Complements GSC (queries) with landing-page sessions
 * and purchase revenue so ranking can prefer money over vanity traffic.
 *
 * Auth: same service-account JSON as GSC, scoped to analytics.readonly.
 * Property: GA4_PROPERTY_ID env or seo_engine_config.ga4.propertyId.
 */
import { getGscConfig } from '@/lib/gscConfig'
import { mintServiceAccountToken, parseServiceAccountJson } from '@/lib/gscAuth'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { loadEngineConfig, saveEngineConfig } from './engineConfig'
import { normalizePlannerTopic, type GscSignalInput } from './planner'

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export interface Ga4Config {
  enabled: boolean
  propertyId: string
  connectedAt?: string | null
  lastError?: string | null
}

export function normalizeGa4PropertyId(raw: string): string {
  const digits = String(raw || '').replace(/^properties\//, '').replace(/\D/g, '')
  return digits
}

/** `/uk/graduate-visa/` → `uk graduate visa` */
export function landingPathToTerm(path: string): string {
  return String(path || '')
    .split('?')[0]
    .toLowerCase()
    .replace(/\/+/g, ' ')
    .replace(/\.(html?|php|aspx)$/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function loadGa4Config(): Promise<Ga4Config> {
  const stored = await loadEngineConfig<Ga4Config>('ga4')
  const propertyId = normalizeGa4PropertyId(
    stored?.propertyId || process.env.GA4_PROPERTY_ID || '',
  )
  const enabled = stored?.enabled !== false && Boolean(propertyId)
  return {
    enabled,
    propertyId,
    connectedAt: stored?.connectedAt ?? null,
    lastError: stored?.lastError ?? null,
  }
}

export async function getGa4AccessToken(): Promise<string | null> {
  const cfg = await getGscConfig()
  const saJson =
    cfg.serviceAccountKey ||
    process.env.GSC_SERVICE_ACCOUNT_JSON ||
    process.env.GSC_SERVICE_ACCOUNT_KEY ||
    process.env.GA4_SERVICE_ACCOUNT_JSON ||
    ''
  if (!saJson) return null
  try {
    const sa = parseServiceAccountJson(saJson)
    return await mintServiceAccountToken(sa, GA4_SCOPE)
  } catch (err) {
    console.warn('[ga4] SA token failed', err instanceof Error ? err.message : err)
    return null
  }
}

export function ga4RowsToSignals(
  rows: Array<{
    path: string
    sessions: number
    engaged: number
    bounceRate: number
    revenue?: number
    purchases?: number
  }>,
): GscSignalInput[] {
  const out: GscSignalInput[] = []
  for (const row of rows) {
    const term = landingPathToTerm(row.path)
    if (!term || term.length < 4 || isJunkQuery(term)) continue
    const sessions = Math.max(0, Number(row.sessions) || 0)
    const revenue = Math.max(0, Number(row.revenue) || 0)
    const purchases = Math.max(0, Number(row.purchases) || 0)
    // Keep low-session pages that already convert — money beats vanity traffic.
    if (sessions < 5 && revenue <= 0) continue
    const engaged = Math.max(0, Number(row.engaged) || 0)
    const bounce = Math.min(1, Math.max(0, Number(row.bounceRate) || 0))
    const signal: GscSignalInput = {
      term,
      impressions: Math.max(sessions, revenue > 0 ? 5 : 0),
      clicks: engaged,
      position: Math.max(5, Math.round(bounce * 80) || 40),
      ctr: sessions ? engaged / sessions : 0,
      source: 'ga4',
    }
    if (revenue > 0) signal.revenue = Math.round(revenue * 100) / 100
    if (purchases > 0) signal.purchases = purchases
    out.push(signal)
  }
  return out
}


/** Match GA4 landing revenue onto GSC/query rows by normalized term overlap. */
export function attachGa4Revenue<T extends { term: string }>(
  rows: T[],
  ga4: Array<{ term: string; revenue?: number; purchases?: number }>,
): Array<T & { revenue?: number; purchases?: number }> {
  const indexed = ga4
    .map((g) => ({
      key: normalizePlannerTopic(g.term),
      revenue: Math.max(0, Number(g.revenue) || 0),
      purchases: Math.max(0, Number(g.purchases) || 0),
    }))
    .filter((g) => g.key && (g.revenue > 0 || g.purchases > 0))
  if (!indexed.length) return rows
  return rows.map((row) => {
    const key = normalizePlannerTopic(row.term)
    if (!key) return row
    let bestRev = 0
    let bestPurch = 0
    for (const g of indexed) {
      if (key === g.key || key.includes(g.key) || g.key.includes(key)) {
        if (g.revenue > bestRev) bestRev = g.revenue
        if (g.purchases > bestPurch) bestPurch = g.purchases
      }
    }
    if (bestRev <= 0 && bestPurch <= 0) return row
    return {
      ...row,
      revenue: bestRev || undefined,
      purchases: bestPurch || undefined,
    }
  })
}

export let lastGa4Pull: { reason?: string } | null = null

export async function pullGa4Signals(): Promise<GscSignalInput[]> {
  lastGa4Pull = null
  const cfg = await loadGa4Config()
  if (!cfg.enabled || !cfg.propertyId) {
    lastGa4Pull = { reason: 'not connected' }
    return []
  }
  const token = await getGa4AccessToken()
  if (!token) {
    lastGa4Pull = { reason: 'no service-account token' }
    return []
  }
  const postReport = async (withPurchases: boolean) => {
    const metrics = [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      ...(withPurchases
        ? [{ name: 'purchaseRevenue' }, { name: 'ecommercePurchases' }]
        : []),
    ]
    return fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
          dimensions: [{ name: 'landingPage' }],
          metrics,
          limit: 100,
          orderBys: [{ metric: { metricName: withPurchases ? 'purchaseRevenue' : 'sessions' }, desc: true }],
        }),
      },
    )
  }
  try {
    let withPurchases = true
    let res = await postReport(true)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Ecommerce metrics 400 on properties that never enabled purchases — retry sessions-only.
      console.warn('[ga4] purchase report failed, retrying sessions-only', res.status, text.slice(0, 180))
      withPurchases = false
      res = await postReport(false)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      lastGa4Pull = { reason: `GA4 ${res.status}` }
      console.warn('[ga4] runReport failed', res.status, text.slice(0, 180))
      return []
    }
    const data = (await res.json()) as {
      rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>
    }
    const mapped = (data.rows || []).map((r) => ({
      path: String(r.dimensionValues?.[0]?.value || ''),
      sessions: Number(r.metricValues?.[0]?.value) || 0,
      engaged: Number(r.metricValues?.[1]?.value) || 0,
      bounceRate: Number(r.metricValues?.[2]?.value) || 0,
      revenue: withPurchases ? Number(r.metricValues?.[3]?.value) || 0 : 0,
      purchases: withPurchases ? Number(r.metricValues?.[4]?.value) || 0 : 0,
    }))
    return ga4RowsToSignals(mapped)
  } catch (err) {
    lastGa4Pull = { reason: err instanceof Error ? err.message.slice(0, 120) : 'GA4 pull failed' }
    console.warn('[ga4] pull failed', err instanceof Error ? err.message : err)
    return []
  }
}

export async function persistGa4Config(next: Partial<Ga4Config>): Promise<Ga4Config> {
  const current = await loadGa4Config()
  const propertyId = normalizeGa4PropertyId(next.propertyId ?? current.propertyId)
  const merged: Ga4Config = {
    enabled: next.enabled !== undefined ? next.enabled : Boolean(propertyId),
    propertyId,
    connectedAt: next.connectedAt !== undefined ? next.connectedAt : current.connectedAt,
    lastError: next.lastError !== undefined ? next.lastError : current.lastError,
  }
  await saveEngineConfig('ga4', merged as unknown as Record<string, unknown>)
  return merged
}

export async function probeGa4(propertyId: string): Promise<{ ok: boolean; error?: string; sessions?: number }> {
  const id = normalizeGa4PropertyId(propertyId)
  if (!id) return { ok: false, error: 'Enter a GA4 numeric property ID' }
  const token = await getGa4AccessToken()
  if (!token) return { ok: false, error: 'No Google service-account key (reuse GSC JSON or set GA4_SERVICE_ACCOUNT_JSON)' }
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        metrics: [{ name: 'sessions' }],
        limit: 1,
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: `GA4 ${res.status}: ${text.slice(0, 180)}` }
  }
  const data = (await res.json()) as { rows?: Array<{ metricValues?: Array<{ value?: string }> }> }
  const sessions = Number(data.rows?.[0]?.metricValues?.[0]?.value) || 0
  return { ok: true, sessions }
}
