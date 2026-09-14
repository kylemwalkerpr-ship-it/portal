/**
 * TinyFish research adapter using the documented Search REST API:
 *   GET https://api.search.tinyfish.ai?query=...
 *   X-API-Key: <TINYFISH_API_KEY>
 *
 * Search observations describe what the live web surfaced. They never become
 * keyword volume/rank/revenue evidence. Official-government results may be
 * labelled authoritative_source for downstream verification; all other search
 * results are competitor/web observations, not factual support by themselves.
 */

import { createHash } from 'crypto'

export type TinyfishEvidenceRole = 'authoritative_source' | 'competitor_observation'

export type TinyfishObservation = {
  url: string
  title?: string
  siteName?: string
  position?: number
  headings: string[]
  questions: string[]
  offers: string[]
  excerpt?: string
  observedAt: string
  jurisdiction?: string
  source: 'tinyfish'
  evidenceRole: TinyfishEvidenceRole
  runId: string
  checkpointId: string
}

export type TinyfishRun = {
  ok: boolean
  skipped: boolean
  reason?: string
  queriedAt: string
  query: string
  jurisdiction?: string
  runId: string
  checkpointId: string
  observations: TinyfishObservation[]
  gaps: string[]
  state: 'ok' | 'empty' | 'unavailable' | 'unconfigured'
}

export type TinyfishSearchFetch = (input: {
  endpoint: 'https://api.search.tinyfish.ai'
  query: string
  apiKey: string
  signal: AbortSignal
}) => Promise<{ ok: boolean; status: number; json: unknown }>

const TINYFISH_SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai' as const

function tinyfishKey(): string {
  return String(process.env.TINYFISH_API_KEY || '').trim()
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function officialSource(urlValue: string): boolean {
  try {
    const host = new URL(urlValue).hostname.toLowerCase()
    return (
      host.endsWith('.gov') ||
      host === 'gov.uk' || host.endsWith('.gov.uk') ||
      host === 'canada.ca' || host.endsWith('.canada.ca') ||
      host === 'homeaffairs.gov.au' || host.endsWith('.homeaffairs.gov.au') ||
      host === 'immi.homeaffairs.gov.au' ||
      host === 'uscis.gov' || host.endsWith('.uscis.gov') ||
      host === 'travel.state.gov'
    )
  } catch {
    return false
  }
}

function safeResultUrl(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname || /^(?:localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function collectTinyfishResearch(input: {
  query: string
  country?: string
  limit?: number
  fetchImpl?: TinyfishSearchFetch
}): Promise<TinyfishRun> {
  const queriedAt = new Date().toISOString()
  const query = String(input.query || '').trim()
  const jurisdiction = String(input.country || '').trim().toUpperCase() || undefined
  const runId = `tinyfish_${shortHash(`${query}|${jurisdiction || 'ALL'}|${queriedAt}`)}`
  const checkpointId = `search_${shortHash(`${query}|${jurisdiction || 'ALL'}`)}`
  const base = { queriedAt, query, jurisdiction, runId, checkpointId }

  if (!query) {
    return {
      ...base,
      ok: false,
      skipped: true,
      reason: 'empty research query',
      observations: [],
      gaps: ['TinyFish search query was empty'],
      state: 'empty',
    }
  }
  const apiKey = tinyfishKey()
  if (!apiKey && !input.fetchImpl) {
    return {
      ...base,
      ok: false,
      skipped: true,
      reason: 'TINYFISH_API_KEY not configured in Worker runtime',
      observations: [],
      gaps: ['TinyFish unavailable: Worker API key is not configured'],
      state: 'unconfigured',
    }
  }

  try {
    const fetchImpl = input.fetchImpl || defaultTinyfishSearch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const searchQuery = jurisdiction ? `${query} ${jurisdiction}` : query
      const res = await fetchImpl({
        endpoint: TINYFISH_SEARCH_ENDPOINT,
        query: searchQuery,
        apiKey,
        signal: controller.signal,
      })
      if (!res.ok) {
        const reason = res.status === 401 || res.status === 403
          ? `tinyfish auth failed (HTTP ${res.status})`
          : `tinyfish HTTP ${res.status}`
        return {
          ...base,
          ok: false,
          skipped: true,
          reason,
          observations: [],
          gaps: [`TinyFish search unavailable: ${reason}`],
          state: 'unavailable',
        }
      }
      const observations = normalizeTinyfishPayload(res.json, {
        observedAt: queriedAt,
        jurisdiction,
        runId,
        checkpointId,
        limit: input.limit || 8,
      })
      return {
        ...base,
        ok: true,
        skipped: false,
        observations,
        gaps: observations.length ? [] : ['TinyFish search returned no usable HTTP(S) results'],
        state: observations.length ? 'ok' : 'empty',
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 180) : 'tinyfish failed'
    return {
      ...base,
      ok: false,
      skipped: true,
      reason: message,
      observations: [],
      gaps: [`TinyFish search unavailable: ${message}`],
      state: 'unavailable',
    }
  }
}

export function normalizeTinyfishPayload(
  json: unknown,
  context: {
    observedAt: string
    jurisdiction?: string
    runId: string
    checkpointId: string
    limit?: number
  },
): TinyfishObservation[] {
  const rows = json && typeof json === 'object' && Array.isArray((json as { results?: unknown[] }).results)
    ? (json as { results: unknown[] }).results
    : Array.isArray(json)
      ? json
      : []
  const out: TinyfishObservation[] = []
  for (const row of rows.slice(0, Math.max(1, context.limit || 8))) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const url = safeResultUrl(r.url || r.link)
    if (!url) continue
    out.push({
      url,
      title: String(r.title || '').trim() || undefined,
      siteName: String(r.site_name || r.siteName || '').trim() || undefined,
      position: Number.isFinite(Number(r.position)) ? Number(r.position) : undefined,
      headings: [],
      questions: [],
      offers: [],
      excerpt: String(r.snippet || r.excerpt || '').trim() || undefined,
      observedAt: context.observedAt,
      jurisdiction: context.jurisdiction,
      source: 'tinyfish',
      evidenceRole: officialSource(url) ? 'authoritative_source' : 'competitor_observation',
      runId: context.runId,
      checkpointId: context.checkpointId,
    })
  }
  return out
}

async function defaultTinyfishSearch(input: {
  endpoint: typeof TINYFISH_SEARCH_ENDPOINT
  query: string
  apiKey: string
  signal: AbortSignal
}): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = new URL(input.endpoint)
  url.searchParams.set('query', input.query)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-API-Key': input.apiKey,
    },
    signal: input.signal,
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}
