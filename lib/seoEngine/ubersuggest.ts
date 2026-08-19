/**
 * Ubersuggest MCP client for the Master Engine.
 *
 * Official endpoint: https://ubersuggest-mcp.neilpatelapi.com/mcp
 * Auth: OAuth 2.0 + PKCE (public client) via Content Studio Configure.
 * A pasted bearer is a fallback only. Disconnect is enabled=false — tokens
 * stay so reconnect is one click.
 */
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { loadEngineConfig, saveEngineConfig } from './engineConfig'
import type { GscSignalInput } from './planner'
import { refreshUbersuggestToken, UBERSUGGEST_MCP_URL as DEFAULT_MCP_URL } from './ubersuggestOAuth'

export const UBERSUGGEST_MCP_URL = DEFAULT_MCP_URL
const MCP_PROTOCOL = '2025-03-26'

export interface UbersuggestConfig {
  enabled: boolean
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string | null
  clientId?: string
  oauth?: boolean
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
  const refreshToken = String(stored?.refreshToken || '').trim()
  const hasCreds = Boolean(accessToken || refreshToken)
  return {
    enabled: stored?.enabled === true && hasCreds,
    accessToken,
    refreshToken,
    tokenExpiresAt: stored?.tokenExpiresAt ?? null,
    clientId: String(stored?.clientId || '').trim(),
    oauth: stored?.oauth === true || Boolean(refreshToken),
    mcpUrl: String(stored?.mcpUrl || UBERSUGGEST_MCP_URL),
    connectedAt: stored?.connectedAt ?? null,
    lastError: stored?.lastError ?? null,
    toolCount: Number(stored?.toolCount) || 0,
    creditsExhaustedUntil: stored?.creditsExhaustedUntil ?? null,
    lastGoodAt: stored?.lastGoodAt ?? null,
    lastGoodSignals: Array.isArray(stored?.lastGoodSignals) ? stored.lastGoodSignals : [],
  }
}

export type RedactedUbersuggestConfig = Omit<UbersuggestConfig, 'accessToken' | 'refreshToken'> & {
  hasToken: boolean
  hasRefresh: boolean
  mode: 'oauth' | 'token' | null
}

export function redactUbersuggestConfig(cfg: UbersuggestConfig): RedactedUbersuggestConfig {
  const hasToken = Boolean(cfg.accessToken)
  const hasRefresh = Boolean(cfg.refreshToken)
  return {
    enabled: cfg.enabled,
    mcpUrl: cfg.mcpUrl,
    connectedAt: cfg.connectedAt,
    lastError: cfg.lastError,
    toolCount: cfg.toolCount,
    hasToken,
    hasRefresh,
    mode: cfg.oauth || hasRefresh ? 'oauth' : hasToken ? 'token' : null,
    oauth: cfg.oauth === true || hasRefresh,
    clientId: cfg.clientId || undefined,
    tokenExpiresAt: cfg.tokenExpiresAt ?? null,
    creditsExhaustedUntil: cfg.creditsExhaustedUntil ?? null,
    lastGoodAt: cfg.lastGoodAt ?? null,
  }
}

export async function persistUbersuggestConfig(next: Partial<UbersuggestConfig>): Promise<UbersuggestConfig> {
  const current = await loadUbersuggestConfig()
  const merged: UbersuggestConfig = {
    ...current,
    ...next,
    accessToken: next.accessToken !== undefined ? next.accessToken : current.accessToken,
    refreshToken: next.refreshToken !== undefined ? next.refreshToken : current.refreshToken,
    tokenExpiresAt: next.tokenExpiresAt !== undefined ? next.tokenExpiresAt : current.tokenExpiresAt,
    clientId: next.clientId !== undefined ? next.clientId : current.clientId,
    oauth: next.oauth !== undefined ? next.oauth : current.oauth,
    mcpUrl: next.mcpUrl || current.mcpUrl || UBERSUGGEST_MCP_URL,
    lastGoodSignals: next.lastGoodSignals !== undefined ? next.lastGoodSignals : current.lastGoodSignals,
  }
  await saveEngineConfig('ubersuggest', {
    enabled: merged.enabled,
    accessToken: merged.accessToken,
    refreshToken: merged.refreshToken || '',
    tokenExpiresAt: merged.tokenExpiresAt ?? null,
    clientId: merged.clientId || '',
    oauth: merged.oauth === true,
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

let mcpSessionId: string | null = null
let mcpSessionToken: string | null = null

export function resetUbersuggestMcpSession(): void {
  mcpSessionId = null
  mcpSessionToken = null
}

function tokenStillFresh(expiresAt?: string | null, skewMs = 60_000): boolean {
  if (!expiresAt) return true
  const exp = Date.parse(expiresAt)
  return Number.isFinite(exp) && exp - skewMs > Date.now()
}

export async function refreshUbersuggestAccessToken(cfg: UbersuggestConfig, force = false): Promise<string> {
  if (!force && cfg.accessToken && tokenStillFresh(cfg.tokenExpiresAt)) return cfg.accessToken
  const refreshToken = String(cfg.refreshToken || '').trim()
  if (!refreshToken) {
    if (cfg.accessToken) return cfg.accessToken
    throw new Error('Ubersuggest MCP is not authorized')
  }
  const tokens = await refreshUbersuggestToken({
    refreshToken,
    clientId: cfg.clientId || undefined,
  })
  resetUbersuggestMcpSession()
  await persistUbersuggestConfig({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    clientId: tokens.clientId || cfg.clientId,
    oauth: true,
    lastError: null,
  })
  return tokens.accessToken
}

export async function ubersuggestRpc(
  cfg: Pick<UbersuggestConfig, 'accessToken' | 'mcpUrl'>,
  method: string,
  params: Record<string, unknown> = {},
  id: number | null = 1,
): Promise<unknown> {
  const token = String(cfg.accessToken || '').trim()
  if (!token) throw new Error('Ubersuggest MCP is not authorized')
  if (mcpSessionToken && mcpSessionToken !== token) resetUbersuggestMcpSession()
  if (method === 'initialize') resetUbersuggestMcpSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
    'MCP-Protocol-Version': MCP_PROTOCOL,
  }
  if (mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId

  const payload = id === null
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id, method, params }

  const res = await fetch(cfg.mcpUrl || UBERSUGGEST_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  })
  const sid = res.headers.get('mcp-session-id')
  if (sid) {
    mcpSessionId = sid
    mcpSessionToken = token
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`Ubersuggest MCP ${res.status}: ${text.slice(0, 180)}`)
  if (id === null) return null
  const rpc = parseMcpBody(text)
  if (rpc.error) throw new Error(rpc.error.message || `MCP error ${rpc.error.code}`)
  return rpc.result
}

function isUnauthorizedMcp(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /401|invalid_token|unauthorized|expired/.test(m)
}

export async function ubersuggestRpcAuthed(
  method: string,
  params: Record<string, unknown> = {},
  id: number | null = 1,
): Promise<unknown> {
  let cfg = await loadUbersuggestConfig()
  const token = await refreshUbersuggestAccessToken(cfg).catch(() => cfg.accessToken)
  try {
    return await ubersuggestRpc({ ...cfg, accessToken: token }, method, params, id)
  } catch (err) {
    if (!isUnauthorizedMcp(err) || !cfg.refreshToken) throw err
    const fresh = await refreshUbersuggestAccessToken(cfg, true)
    cfg = await loadUbersuggestConfig()
    return ubersuggestRpc({ ...cfg, accessToken: fresh }, method, params, id)
  }
}

export async function probeUbersuggest(accessToken: string, mcpUrl?: string): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  const cfg = { accessToken, mcpUrl: mcpUrl || UBERSUGGEST_MCP_URL }
  try {
    const result = await ubersuggestRpc(
      cfg,
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'yousafe-content-studio', version: '1.0' },
      },
    )
    try {
      await ubersuggestRpc(cfg, 'notifications/initialized', {}, null)
    } catch {
      /* some MCP servers ignore the initialized notification */
    }
    let toolCount = 0
    try {
      const listed = await ubersuggestRpc(cfg, 'tools/list', {}, 2) as { tools?: unknown[] }
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
    await ubersuggestRpc(cfg, 'initialize', {
      protocolVersion: MCP_PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'yousafe-content-studio', version: '1.0' },
    }, 1)
    try { await ubersuggestRpc(cfg, 'notifications/initialized', {}, null) } catch { /* optional */ }
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
  const loaded = await loadUbersuggestConfig()
  if (!loaded.enabled || (!loaded.accessToken && !loaded.refreshToken)) {
    lastUbersuggestPull.reason = 'disconnected'
    return []
  }
  let cfg = loaded
  try {
    const token = await refreshUbersuggestAccessToken(loaded)
    cfg = { ...loaded, accessToken: token }
  } catch (err) {
    lastUbersuggestPull.reason = err instanceof Error ? err.message : 'not authorized'
    return cachedSignals(loaded)
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
      if (isUnauthorizedMcp(err) && cfg.refreshToken) {
        try {
          const fresh = await refreshUbersuggestAccessToken(cfg, true)
          cfg = { ...cfg, accessToken: fresh }
          const result = await ubersuggestRpc(cfg, 'tools/call', { name, arguments: args }, 10 + calls)
          collected.push(...parseUbersuggestKeywords(unwrapToolPayload(result)))
          lastErr = ''
          return
        } catch (retryErr) {
          lastErr = retryErr instanceof Error ? retryErr.message : String(retryErr)
        }
      }
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
