/**
 * Tinyfish research adapter.
 * Observed competitor pages, SERP composition, headings, questions, offers.
 * Must not invent volume, difficulty, revenue, or Google rank.
 */

export type TinyfishObservation = {
  url: string
  title?: string
  headings: string[]
  questions: string[]
  offers: string[]
  excerpt?: string
  observedAt: string
  source: 'tinyfish'
}

export type TinyfishRun = {
  ok: boolean
  skipped: boolean
  reason?: string
  queriedAt: string
  observations: TinyfishObservation[]
  state: 'ok' | 'empty' | 'unavailable' | 'unconfigured'
}

export type TinyfishFetch = (input: { path: string; query?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: unknown }>

function tinyfishBase(): string {
  return String(process.env.TINYFISH_API_BASE || process.env.TINYFISH_BASE_URL || '').replace(/\/+$/, '')
}

function tinyfishKey(): string {
  return String(process.env.TINYFISH_API_KEY || process.env.TINYFISH_TOKEN || '').trim()
}

export async function collectTinyfishResearch(input: {
  query: string
  country?: string
  limit?: number
  fetchImpl?: TinyfishFetch
}): Promise<TinyfishRun> {
  const queriedAt = new Date().toISOString()
  const query = String(input.query || '').trim()
  if (!query) {
    return { ok: false, skipped: true, reason: 'empty research query', queriedAt, observations: [], state: 'empty' }
  }
  const configured = Boolean(tinyfishBase() && tinyfishKey()) || Boolean(input.fetchImpl)
  if (!configured) {
    return {
      ok: false,
      skipped: true,
      reason: 'TINYFISH_API_BASE / TINYFISH_API_KEY not configured',
      queriedAt,
      observations: [],
      state: 'unconfigured',
    }
  }
  try {
    const fetchImpl = input.fetchImpl || defaultTinyfishFetch
    const res = await fetchImpl({
      path: '/search',
      query: {
        q: query,
        country: input.country || '',
        limit: String(input.limit || 8),
      },
    })
    if (!res.ok) {
      return {
        ok: false,
        skipped: true,
        reason: `tinyfish HTTP ${res.status}`,
        queriedAt,
        observations: [],
        state: 'unavailable',
      }
    }
    const observations = normalizeTinyfishPayload(res.json, queriedAt)
    return {
      ok: true,
      skipped: false,
      queriedAt,
      observations,
      state: observations.length ? 'ok' : 'empty',
    }
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      reason: err instanceof Error ? err.message.slice(0, 180) : 'tinyfish failed',
      queriedAt,
      observations: [],
      state: 'unavailable',
    }
  }
}

export function normalizeTinyfishPayload(json: unknown, observedAt: string): TinyfishObservation[] {
  const rows = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { results?: unknown[] }).results)
      ? (json as { results: unknown[] }).results
      : []
  const out: TinyfishObservation[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const url = String(r.url || r.link || '').trim()
    if (!/^https?:\/\//i.test(url)) continue
    out.push({
      url,
      title: String(r.title || '').trim() || undefined,
      headings: asStringList(r.headings || r.h2 || r.h2s),
      questions: asStringList(r.questions || r.peopleAlsoAsk),
      offers: asStringList(r.offers || r.ctas),
      excerpt: String(r.excerpt || r.snippet || '').trim() || undefined,
      observedAt,
      source: 'tinyfish',
    })
  }
  return out
}

async function defaultTinyfishFetch(input: { path: string; query?: Record<string, string> }): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = new URL(tinyfishBase() + input.path)
  for (const [k, v] of Object.entries(input.query || {})) {
    if (v) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${tinyfishKey()}`,
    },
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 12)
}
