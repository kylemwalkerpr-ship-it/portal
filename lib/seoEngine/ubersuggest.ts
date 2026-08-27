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
import { ubersuggestSpendPlan, type UberLayer } from './ubersuggestCatalog'

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
  lastIntel?: UbersuggestIntel | null
}

export interface UbersuggestIntel {
  pulledAt: string
  toolsUsed: string[]
  layers: UberLayer[]
  keywordCount: number
  calls: number
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
    lastIntel: stored?.lastIntel && typeof stored.lastIntel === 'object' ? stored.lastIntel : null,
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
    lastIntel: cfg.lastIntel ?? null,
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
    lastIntel: next.lastIntel !== undefined ? next.lastIntel : current.lastIntel,
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
    lastIntel: merged.lastIntel ?? null,
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

export function isTransientMcpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

export function isTransientMcpFailure(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /\b502\b|\b503\b|\b504\b|temporarily unavailable/.test(m)
}

/** One-line MCP errors — never dump HTML into the planner livestream. */
export function sanitizeMcpError(status: number, body: string): string {
  const raw = String(body || '')
  if (status === 503 || /temporarily unavailable/i.test(raw)) {
    return 'Ubersuggest MCP 503 (temporarily unavailable)'
  }
  if (status === 502) return 'Ubersuggest MCP 502 (upstream error)'
  if (status === 504) return 'Ubersuggest MCP 504 (upstream timeout)'
  if (!raw.trim() || /<\s*html|<!doctype/i.test(raw)) {
    return `Ubersuggest MCP ${status}`
  }
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return `Ubersuggest MCP ${status}: ${text.slice(0, 120)}`
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

  const timeoutMs = method === 'tools/call' ? 20_000 : 12_000
  let lastStatus = 0
  let lastText = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(cfg.mcpUrl || UBERSUGGEST_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) {
      mcpSessionId = sid
      mcpSessionToken = token
    }
    lastStatus = res.status
    lastText = await res.text()
    if (res.ok) {
      if (id === null) return null
      const rpc = parseMcpBody(lastText)
      if (rpc.error) throw new Error(rpc.error.message || `MCP error ${rpc.error.code}`)
      return rpc.result
    }
    if (!isTransientMcpStatus(res.status) || attempt === 1) break
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(sanitizeMcpError(lastStatus, lastText))
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

const KEYWORD_ARRAY_KEYS = [
  'keywords', 'data', 'results', 'items', 'suggestions', 'related', 'ideas', 'pages',
  'searched_keywords', 'organic', 'organicKeywords',
]

function collectKeywordBags(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return [raw]
  if (!raw || typeof raw !== 'object') return []
  const rec = raw as Record<string, unknown>
  const bags: unknown[] = []
  for (const k of KEYWORD_ARRAY_KEYS) {
    if (Array.isArray(rec[k])) bags.push(...(rec[k] as unknown[]))
  }
  bags.push(raw)
  return bags
}

export type ParsedUbersuggestKeyword = {
  term: string
  volume: number
  position?: number
  keywordDifficulty?: number
}

/** Pull 0–100 KD from the field names Ubersuggest actually ships. */
export function parseUbersuggestDifficulty(rec: Record<string, unknown>): number | undefined {
  const scale100 = ['sd', 'seo_difficulty', 'seoDifficulty', 'difficulty', 'keyword_difficulty', 'kd']
  for (const k of scale100) {
    const v = Number(rec[k])
    if (!Number.isFinite(v) || v < 0) continue
    return Math.round(Math.min(100, v <= 1 ? v * 100 : v))
  }
  const indexed = Number(rec.competition_index)
  if (Number.isFinite(indexed) && indexed >= 0) {
    return Math.round(Math.min(100, indexed <= 1 ? indexed * 100 : indexed))
  }
  const competition = Number(rec.competition)
  if (Number.isFinite(competition) && competition >= 0) {
    return Math.round(Math.min(100, competition <= 1 ? competition * 100 : competition))
  }
  return undefined
}

export function parseUbersuggestKeywords(
  raw: unknown,
  opts: { allowZeroVolume?: boolean } = {},
): ParsedUbersuggestKeyword[] {
  const bag = collectKeywordBags(raw)
  const out: ParsedUbersuggestKeyword[] = []
  for (const item of bag) {
    if (typeof item === 'string') {
      const term = item.trim()
      if (!term || isJunkQuery(term) || !opts.allowZeroVolume) continue
      out.push({ term, volume: 40 })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const term = String(rec.keyword || rec.term || rec.query || rec.phrase || rec.title || rec.kw || '').trim()
    const monthly = Array.isArray(rec.monthly_searches)
      ? Number((rec.monthly_searches[0] as { search_volume?: number } | undefined)?.search_volume)
      : 0
    let volume = Number(rec.volume || rec.search_volume || rec.searchVolume || rec.monthly_searches || rec.traffic || rec.visits || monthly || 0) || 0
    if (!term || isJunkQuery(term)) continue
    if (volume < 20) {
      if (!opts.allowZeroVolume) continue
      volume = Math.max(volume, 40)
    }
    const position = Number(rec.position || rec.rank || rec.pos)
    const keywordDifficulty = parseUbersuggestDifficulty(rec)
    out.push({
      term,
      volume,
      position: Number.isFinite(position) && position > 0 ? position : undefined,
      ...(keywordDifficulty != null ? { keywordDifficulty } : {}),
    })
  }
  return out
}

/** Market volume is the opportunity — cap heads, but keep Ubersuggest far above typical GSC gaps. */
export function ubersuggestVolumeToImpressions(volume: number): number {
  const v = Math.max(0, Number(volume) || 0)
  return Math.max(40, Math.min(4000, Math.round(v * 0.15)))
}

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
  await ubersuggestRpc(cfg, 'initialize', {
    protocolVersion: MCP_PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'yousafe-content-studio', version: '1.0' },
  }, 1)
  try { await ubersuggestRpc(cfg, 'notifications/initialized', {}, null) } catch { /* optional */ }
  const listed = await ubersuggestRpc(cfg, 'tools/list', {}, 2) as { tools?: Array<{ name?: string }> }
  return (listed.tools || []).map((t) => String(t.name || '')).filter(Boolean)
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

  const collected: ParsedUbersuggestKeyword[] = []
  let calls = 0
  let exhausted = false
  let transientDown = false
  let lastErr = ''
  const toolsUsed: string[] = []
  const layers = new Set<UberLayer>()

  const runCall = async (name: string, args: Record<string, unknown>, layer: UberLayer, allowZero = false) => {
    if (exhausted || transientDown || calls >= UBERSUGGEST_CALL_BUDGET) return
    calls += 1
    const parse = (raw: unknown) => parseUbersuggestKeywords(unwrapToolPayload(raw), { allowZeroVolume: allowZero || layer === 'keyword' && name === 'google_suggestions' })
    try {
      const result = await ubersuggestRpc(cfg, 'tools/call', { name, arguments: args }, 10 + calls)
      collected.push(...parse(result))
      toolsUsed.push(name)
      layers.add(layer)
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      if (isUnauthorizedMcp(err) && cfg.refreshToken) {
        try {
          const fresh = await refreshUbersuggestAccessToken(cfg, true)
          cfg = { ...cfg, accessToken: fresh }
          const result = await ubersuggestRpc(cfg, 'tools/call', { name, arguments: args }, 10 + calls)
          collected.push(...parse(result))
          toolsUsed.push(name)
          layers.add(layer)
          lastErr = ''
          return
        } catch (retryErr) {
          lastErr = retryErr instanceof Error ? retryErr.message : String(retryErr)
        }
      }
      if (isTransientMcpFailure(err)) transientDown = true
      if (isCreditOrAuthFailure(err)) exhausted = true
    }
  }

  try {
    const names = new Set(await listToolNames(cfg))
    for (const step of ubersuggestSpendPlan()) {
      if (exhausted || transientDown || calls >= UBERSUGGEST_CALL_BUDGET) break
      if (names.size && !names.has(step.name)) continue
      await runCall(step.name, step.args, step.layer, step.name === 'google_suggestions' || step.name === 'content_ideas')
    }
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
    if (isTransientMcpFailure(err)) transientDown = true
    if (isCreditOrAuthFailure(err)) exhausted = true
  }

  const best = new Map<string, ParsedUbersuggestKeyword>()
  for (const row of collected) {
    const k = row.term.toLowerCase()
    const prev = best.get(k)
    if (!prev || row.volume > prev.volume) best.set(k, row)
    else if (row.volume === prev.volume && prev.keywordDifficulty == null && row.keywordDifficulty != null) {
      prev.keywordDifficulty = row.keywordDifficulty
    }
  }
  const live: GscSignalInput[] = Array.from(best.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 80)
    .map((row) => {
      const signal: GscSignalInput = {
        term: row.term,
        impressions: ubersuggestVolumeToImpressions(row.volume),
        clicks: 0,
        position: row.position && row.position < 70 ? row.position : 55,
        ctr: 0,
        source: 'ubersuggest',
        volume: row.volume,
      }
      if (row.keywordDifficulty != null) signal.keywordDifficulty = row.keywordDifficulty
      return signal
    })

  const intel: UbersuggestIntel = {
    pulledAt: new Date().toISOString(),
    toolsUsed: [...new Set(toolsUsed)],
    layers: [...layers],
    keywordCount: live.length,
    calls,
  }

  if (exhausted) {
    const pauseUntil = new Date(Date.now() + 6 * 3600_000).toISOString()
    await persistUbersuggestConfig({
      lastError: lastErr || 'credits exhausted',
      creditsExhaustedUntil: pauseUntil,
      lastGoodSignals: live.length ? live.map((s) => ({ term: s.term, impressions: s.impressions })) : cfg.lastGoodSignals,
      lastGoodAt: live.length ? new Date().toISOString() : cfg.lastGoodAt,
      lastIntel: intel,
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
      lastIntel: intel,
    }).catch(() => undefined)
    lastUbersuggestPull = { usedCache: false, calls, exhausted: false }
    return live
  }

  const emptyReason = lastErr || (calls === 0 ? 'no MCP tools called' : 'empty live pull')
  await persistUbersuggestConfig({
    lastError: emptyReason,
    lastIntel: intel,
  }).catch(() => undefined)
  lastUbersuggestPull = { usedCache: true, calls, exhausted: false, reason: emptyReason }
  return cachedSignals(cfg)
}
