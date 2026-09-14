/**
 * Tinyfish research adapter.
 * Search + Fetch first. Agent/Browser only when interaction is required.
 * Never invent volume, difficulty, revenue, or Google rank.
 */

export type TinyfishSourceState =
  | 'disabled'
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'
  | 'empty'
  | 'malformed'
  | 'completed'

export type TinyfishSearchHit = {
  url: string
  title: string
  snippet?: string
  position?: number
  query: string
}

export type TinyfishFetchResult = {
  url: string
  title?: string
  headings: string[]
  excerpt?: string
}

export type TinyfishRunResult = {
  state: TinyfishSourceState
  remoteRunId?: string
  hits: TinyfishSearchHit[]
  pages: TinyfishFetchResult[]
  error?: string
}

export function tinyfishConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(String(env.TINYFISH_API_KEY || env.TINYFISH_TOKEN || '').trim())
}

export function classifyTinyfishError(status: number | null, body?: string): TinyfishSourceState {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate_limited'
  if (status && status >= 500) return 'unavailable'
  if (status === 404) return 'unavailable'
  if (body && /quota|limit/i.test(body)) return 'rate_limited'
  return 'unavailable'
}

export function isPublicHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local')) return false
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false
    return true
  } catch {
    return false
  }
}

export function quarantineTinyfishPayload(raw: unknown): { ok: boolean; hits: TinyfishSearchHit[]; state: TinyfishSourceState } {
  if (!raw || typeof raw !== 'object') return { ok: false, hits: [], state: 'malformed' }
  const rows = Array.isArray((raw as { results?: unknown }).results)
    ? (raw as { results: unknown[] }).results
    : Array.isArray(raw)
      ? raw
      : null
  if (!rows) return { ok: false, hits: [], state: 'malformed' }
  const hits: TinyfishSearchHit[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const url = String(rec.url || rec.link || '')
    if (!isPublicHttpsUrl(url)) continue
    const positionRaw = rec.position ?? rec.rank
    hits.push({
      url,
      title: String(rec.title || url),
      snippet: rec.snippet ? String(rec.snippet) : undefined,
      position: typeof positionRaw === 'number' ? positionRaw : undefined,
      query: String(rec.query || ''),
    })
  }
  if (!hits.length) return { ok: true, hits: [], state: 'empty' }
  return { ok: true, hits, state: 'completed' }
}

export async function runTinyfishSearch(opts: {
  query: string
  fetchImpl?: typeof fetch
  endpoint?: string
  apiKey?: string
}): Promise<TinyfishRunResult> {
  const apiKey = opts.apiKey || String(process.env.TINYFISH_API_KEY || process.env.TINYFISH_TOKEN || '').trim()
  if (!apiKey) return { state: 'disabled', hits: [], pages: [], error: 'TINYFISH_API_KEY not configured' }
  const endpoint = opts.endpoint || String(process.env.TINYFISH_SEARCH_URL || 'https://api.tinyfish.ai/v1/search')
  const fetchImpl = opts.fetchImpl || fetch
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: opts.query, limit: 5 }),
      signal: AbortSignal.timeout(12000),
    })
    const text = await res.text()
    if (!res.ok) {
      return { state: classifyTinyfishError(res.status, text), hits: [], pages: [], error: text.slice(0, 240) }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { state: 'malformed', hits: [], pages: [], error: 'Tinyfish response was not JSON' }
    }
    const quarantined = quarantineTinyfishPayload(parsed)
    return { state: quarantined.state, hits: quarantined.hits, pages: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { state: 'unavailable', hits: [], pages: [], error: message.slice(0, 240) }
  }
}
