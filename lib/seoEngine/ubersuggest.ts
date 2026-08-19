/**
 * Ubersuggest MCP client for the Master Engine.
 *
 * Official endpoint: https://ubersuggest-mcp.neilpatelapi.com/mcp
 * Auth: OAuth/bearer token stored in seo_engine_config.ubersuggest.
 * Disconnect is an enabled=false toggle — the token is kept so reconnect
 * is one click.
 */
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { loadEngineConfig, saveEngineConfig } from './engineConfig'
import type { GscSignalInput } from './planner'

export const UBERSUGGEST_MCP_URL = 'https://ubersuggest-mcp.neilpatelapi.com/mcp'

export interface UbersuggestConfig {
  enabled: boolean
  accessToken: string
  mcpUrl: string
  connectedAt?: string | null
  lastError?: string | null
  toolCount?: number
  creditsExhaustedUntil?: string | null
  lastGoodAt?: string | null
  lastGoodSignals?: Array<{ term: string; impressions: number }>
}

/** Budget of MCP tool calls per planner run — spend them, then stop. */
export const UBERSUGGEST_CALL_BUDGET = 16

export interface UbersuggestPullMeta {
  usedCache: boolean
  calls: number
  reason?: string
  exhausted: boolean
}

export let lastUbersuggestPull: UbersuggestPullMeta | null = null

export async function loadUbersuggestConfig(): Promise<UbersuggestConfig> {
  const stored = await loadEngineConfig<UbersuggestConfig>('ubersuggest')
  const accessToken = String(
    stored?.accessToken || process.env.UBERSUGGEST_MCP_TOKEN || process.env.UBERSUGGEST_API_KEY || '',
  ).trim()
  return {
    enabled: stored?.enabled === true && Boolean(accessToken),
    accessToken,
    mcpUrl: String(stored?.mcpUrl || UBERSUGGEST_MCP_URL),
    connectedAt: stored?.connectedAt ?? null,
    lastError: stored?.lastError ?? null,
    toolCount: Number(stored?.toolCount) || 0,
    creditsExhaustedUntil: stored?.creditsExhaustedUntil ?? null,
    lastGoodAt: stored?.lastGoodAt ?? null,
    lastGoodSignals: Array.isArray(stored?.lastGoodSignals) ? stored.lastGoodSignals : [],
  }
}

export function redactUbersuggestConfig(cfg: UbersuggestConfig): Omit<UbersuggestConfig, 'accessToken'> & { hasToken: boolean } {
  return {
    enabled: cfg.enabled,
    mcpUrl: cfg.mcpUrl,
    connectedAt: cfg.connectedAt,
    lastError: cfg.lastError,
    toolCount: cfg.toolCount,
    hasToken: Boolean(cfg.accessToken),
    creditsExhaustedUntil: cfg.creditsExhaustedUntil ?? null,
  }
}

interface JsonRpc {
  jsonrpc?: string
  id?: number
  result?: unknown
  error?: { message?: string; code?: number }
}

function parseMcpBody(text: string): JsonRpc {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as JsonRpc
  // SSE: data: {...}
  const line = trimmed.split('\n').find((l) => l.startsWith('data:'))
  if (line) return JSON.parse(line.slice(5).trim()) as JsonRpc
  throw new Error('Ubersuggest MCP returned a non-JSON body')
}

export async function ubersuggestRpc(
  cfg: Pick<UbersuggestConfig, 'accessToken' | 'mcpUrl'>,
  method: string,
  params: Record<string, unknown> = {},
  id = 1,
): Promise<unknown> {
  const res = await fetch(cfg.mcpUrl || UBERSUGGEST_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(12_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ubersuggest MCP ${res.status}: ${text.slice(0, 180)}`)
  const rpc = parseMcpBody(text)
  if (rpc.error) throw new Error(rpc.error.message || `MCP error ${rpc.error.code}`)
  return rpc.result
}

export async function probeUbersuggest(accessToken: string, mcpUrl?: string): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  try {
    const result = await ubersuggestRpc(
      { accessToken, mcpUrl: mcpUrl || UBERSUGGEST_MCP_URL },
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'yousafe-seo-engine', version: '1.0' },
      },
    )
    let toolCount = 0
    try {
      const listed = await ubersuggestRpc(
        { accessToken, mcpUrl: mcpUrl || UBERSUGGEST_MCP_URL },
        'tools/list',
        {},
        2,
      ) as { tools?: unknown[] }
      toolCount = Array.isArray(listed?.tools) ? listed.tools.length : 0
    } catch {
      toolCount = result ? 1 : 0
    }
    return { ok: true, toolCount }
  } catch (err) {
    return { ok: false, toolCount: 0, error: err instanceof Error ? err.message : 'probe failed' }
  }
}

export function isCreditOrAuthFailure(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /401|403|429|quota|credit|limit exceeded|exhaust|payment required|upgrade|not connected|unauthorized|forbidden|insufficient/.test(m)
}

export function parseUbersuggestKeywords(raw: unknown): Array<{ term: string; volume: number }> {
  const bag: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (['keywords', 'data', 'results', 'items', 'suggestions', 'related']
          .map((k) => (raw as Record<string, unknown>)[k])
          .find((v) => Array.isArray(v)) as unknown[] | undefined) || [raw]
      : []
  const out: Array<{ term: string; volume: number }> = []
  for (const item of bag) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const term = String(rec.keyword || rec.term || rec.query || rec.phrase || rec.title || '').trim()
    const volume = Number(rec.volume || rec.search_volume || rec.searchVolume || rec.monthly_searches || rec.traffic || 0) || 0
    if (!term || volume < 20 || isJunkQuery(term)) continue
    out.push({ term, volume })
  }
  return out
}

/** Market volume is the opportunity — cap heads, but keep Ubersuggest far above typical GSC gaps. */
export function ubersuggestVolumeToImpressions(volume: number): number {
  const v = Math.max(0, Number(volume) || 0)
  return Math.max(40, Math.min(4000, Math.round(v * 0.15)))
}

const SEEDS: Array<{ q: string; loc: number; country: string }> = [
  { q: 'uk graduate visa', loc: 2826, country: 'uk' },
  { q: 'uk student visa', loc: 2826, country: 'uk' },
  { q: 'uk spouse visa', loc: 2826, country: 'uk' },
  { q: 'skilled worker visa uk', loc: 2826, country: 'uk' },
  { q: 'f-1 visa', loc: 2840, country: 'us' },
  { q: 'opt stem', loc: 2840, country: 'us' },
  { q: 'h-1b visa', loc: 2840, country: 'us' },
  { q: 'green card', loc: 2840, country: 'us' },
  { q: 'canada study permit', loc: 2124, country: 'ca' },
  { q: 'express entry canada', loc: 2124, country: 'ca' },
  { q: 'canada spousal sponsorship', loc: 2124, country: 'ca' },
  { q: 'australia student visa', loc: 2036, country: 'au' },
  { q: '485 visa', loc: 2036, country: 'au' },
  { q: 'subclass 189', loc: 2036, country: 'au' },
]

function unwrapToolPayload(result: unknown): unknown {
  const content = result && typeof result === 'object' && Array.isArray((result as { content?: unknown[] }).content)
    ? (result as { content: Array<{ text?: string; json?: unknown }> }).content
    : null
  if (content?.[0]?.json) return content[0].json
  if (content?.[0]?.text) {
    try { return JSON.parse(content[0].text) } catch { return content[0].text }
  }
  return result
}

function cachedSignals(cfg: UbersuggestConfig): GscSignalInput[] {
  return (cfg.lastGoodSignals || []).map((row) => ({
    term: row.term,
    impressions: row.impressions,
    clicks: 0,
    position: 55,
    ctr: 0,
    source: 'ubersuggest' as const,
  }))
}

async function listToolNames(cfg: UbersuggestConfig): Promise<string[]> {
  try {
    const listed = await ubersuggestRpc(cfg, 'tools/list', {}, 2) as { tools?: Array<{ name?: string }> }
    return (listed.tools || []).map((t) => String(t.name || '')).filter(Boolean)
  } catch {
    return []
  }
}

function pickTools(names: string[]): { keyword: string[]; domain: string[] } {
  const keyword = names.filter((n) => /keyword|suggest|idea|question|related|overview/i.test(n)).slice(0, 4)
  const domain = names.filter((n) => /domain|organic|top.?page|competitor/i.test(n) && !keyword.includes(n)).slice(0, 2)
  if (!keyword.length) keyword.push('keyword_overview')
  return { keyword, domain }
}

export async function pullUbersuggestSignals(): Promise<GscSignalInput[]> {
  lastUbersuggestPull = { usedCache: false, calls: 0, exhausted: false }
  const cfg = await loadUbersuggestConfig()
  if (!cfg.enabled || !cfg.accessToken) {
    lastUbersuggestPull.reason = 'disconnected'
    return []
  }

  const until = cfg.creditsExhaustedUntil ? Date.parse(cfg.creditsExhaustedUntil) : 0
  if (until && Date.now() < until) {
    lastUbersuggestPull = { usedCache: true, calls: 0, exhausted: true, reason: `credits paused until ${cfg.creditsExhaustedUntil}` }
    return cachedSignals(cfg)
  }

  const collected: Array<{ term: string; volume: number }> = []
  let calls = 0
  let exhausted = false
  let lastErr = ''

  const runCall = async (name: string, args: Record<string, unknown>) => {
    if (exhausted || calls >= UBERSUGGEST_CALL_BUDGET) return
    calls += 1
    try {
      const result = await ubersuggestRpc(cfg, 'tools/call', { name, arguments: args }, 10 + calls)
      collected.push(...parseUbersuggestKeywords(unwrapToolPayload(result)))
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      if (isCreditOrAuthFailure(err)) exhausted = true
    }
  }

  try {
    const names = await listToolNames(cfg)
    const tools = pickTools(names)
    for (const seed of SEEDS) {
      if (exhausted || calls >= UBERSUGGEST_CALL_BUDGET) break
      const tool = tools.keyword[calls % Math.max(1, tools.keyword.length)]
      await runCall(tool, {
        keyword: seed.q,
        query: seed.q,
        country: seed.country,
        loc_id: seed.loc,
        location: seed.country,
      })
    }
    if (!exhausted && calls < UBERSUGGEST_CALL_BUDGET && tools.domain[0]) {
      await runCall(tools.domain[0], { domain: 'yousafeconsultancy.com', url: 'https://yousafeconsultancy.com' })
    }
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
    if (isCreditOrAuthFailure(err)) exhausted = true
  }

  const best = new Map<string, { term: string; volume: number }>()
  for (const row of collected) {
    const k = row.term.toLowerCase()
    const prev = best.get(k)
    if (!prev || row.volume > prev.volume) best.set(k, row)
  }
  const live: GscSignalInput[] = Array.from(best.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 80)
    .map((row) => ({
      term: row.term,
      impressions: ubersuggestVolumeToImpressions(row.volume),
      clicks: 0,
      position: 55,
      ctr: 0,
      source: 'ubersuggest' as const,
    }))

  if (exhausted) {
    const pauseUntil = new Date(Date.now() + 6 * 3600_000).toISOString()
    await persistUbersuggestConfig({
      lastError: lastErr || 'credits exhausted',
      creditsExhaustedUntil: pauseUntil,
      lastGoodSignals: live.length ? live.map((s) => ({ term: s.term, impressions: s.impressions })) : cfg.lastGoodSignals,
      lastGoodAt: live.length ? new Date().toISOString() : cfg.lastGoodAt,
    }).catch(() => undefined)
    lastUbersuggestPull = {
      usedCache: live.length === 0,
      calls,
      exhausted: true,
      reason: lastErr || 'credits exhausted',
    }
    return live.length ? live : cachedSignals(cfg)
  }

  if (live.length) {
    await persistUbersuggestConfig({
      lastError: null,
      creditsExhaustedUntil: null,
      lastGoodSignals: live.map((s) => ({ term: s.term, impressions: s.impressions })),
      lastGoodAt: new Date().toISOString(),
    }).catch(() => undefined)
    lastUbersuggestPull = { usedCache: false, calls, exhausted: false }
    return live
  }

  lastUbersuggestPull = { usedCache: true, calls, exhausted: false, reason: lastErr || 'empty live pull' }
  return cachedSignals(cfg)
}

export async function persistUbersuggestConfig(next: Partial<UbersuggestConfig>): Promise<UbersuggestConfig> {
  const current = await loadUbersuggestConfig()
  const merged: UbersuggestConfig = {
    ...current,
    ...next,
    accessToken: next.accessToken !== undefined ? next.accessToken : current.accessToken,
    mcpUrl: next.mcpUrl || current.mcpUrl || UBERSUGGEST_MCP_URL,
    lastGoodSignals: next.lastGoodSignals !== undefined ? next.lastGoodSignals : current.lastGoodSignals,
  }
  await saveEngineConfig('ubersuggest', {
    enabled: merged.enabled,
    accessToken: merged.accessToken,
    mcpUrl: merged.mcpUrl,
    connectedAt: merged.connectedAt ?? null,
    lastError: merged.lastError ?? null,
    toolCount: merged.toolCount ?? 0,
    creditsExhaustedUntil: merged.creditsExhaustedUntil ?? null,
    lastGoodAt: merged.lastGoodAt ?? null,
    lastGoodSignals: (merged.lastGoodSignals || []).slice(0, 80),
  })
  return merged
}
