/**
 * Ubersuggest MCP client for the Master Engine.
 *
 * Official endpoint: https://ubersuggest-mcp.neilpatelapi.com/mcp
 * Auth: OAuth/bearer token stored in seo_engine_config.ubersuggest.
 * Disconnect is an enabled=false toggle — the token is kept so reconnect
 * is one click.
 */
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { volumeToPlannerImpressions } from './keywordDemand'
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
}

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

export function parseUbersuggestKeywords(raw: unknown): Array<{ term: string; volume: number }> {
  const bag: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (['keywords', 'data', 'results', 'items']
          .map((k) => (raw as Record<string, unknown>)[k])
          .find((v) => Array.isArray(v)) as unknown[] | undefined) || [raw]
      : []
  const out: Array<{ term: string; volume: number }> = []
  for (const item of bag) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const term = String(rec.keyword || rec.term || rec.query || rec.phrase || '').trim()
    const volume = Number(rec.volume || rec.search_volume || rec.searchVolume || rec.monthly_searches || 0) || 0
    if (!term || volume < 20 || isJunkQuery(term)) continue
    out.push({ term, volume })
  }
  return out
}

const SEED_QUERIES = [
  'uk graduate visa',
  'f-1 visa',
  'canada study permit',
  'australia student visa',
  'skilled worker visa',
]

async function pickKeywordTool(cfg: UbersuggestConfig): Promise<string | null> {
  try {
    const listed = await ubersuggestRpc(cfg, 'tools/list', {}, 2) as { tools?: Array<{ name?: string }> }
    const names = (listed.tools || []).map((t) => String(t.name || ''))
    const hit = names.find((n) => /keyword/i.test(n) && /overview|research|idea|suggest|data/i.test(n))
      || names.find((n) => /keyword/i.test(n))
    return hit || null
  } catch {
    return 'keyword_overview'
  }
}

export async function pullUbersuggestSignals(): Promise<GscSignalInput[]> {
  const cfg = await loadUbersuggestConfig()
  if (!cfg.enabled || !cfg.accessToken) return []
  try {
    const tool = await pickKeywordTool(cfg)
    if (!tool) return []
    const collected: Array<{ term: string; volume: number }> = []
    for (const seed of SEED_QUERIES.slice(0, 4)) {
      try {
        const result = await ubersuggestRpc(cfg, 'tools/call', {
          name: tool,
          arguments: { keyword: seed, query: seed, country: 'us', loc_id: 2840 },
        }, 10)
        const content = result && typeof result === 'object' && Array.isArray((result as { content?: unknown[] }).content)
          ? (result as { content: Array<{ text?: string; json?: unknown }> }).content
          : null
        let payload: unknown = result
        if (content?.[0]?.text) {
          try { payload = JSON.parse(content[0].text) } catch { payload = content[0].text }
        } else if (content?.[0]?.json) {
          payload = content[0].json
        }
        collected.push(...parseUbersuggestKeywords(payload))
      } catch {
        /* one seed failing must not abort the rest */
      }
    }
    const best = new Map<string, { term: string; volume: number }>()
    for (const row of collected) {
      const k = row.term.toLowerCase()
      const prev = best.get(k)
      if (!prev || row.volume > prev.volume) best.set(k, row)
    }
    return Array.from(best.values()).slice(0, 40).map((row) => ({
      term: row.term,
      impressions: volumeToPlannerImpressions(row.volume),
      clicks: 0,
      position: 80,
      ctr: 0,
    }))
  } catch (err) {
    console.warn('[ubersuggest] pull failed', err instanceof Error ? err.message : err)
    return []
  }
}

export async function persistUbersuggestConfig(next: Partial<UbersuggestConfig>): Promise<UbersuggestConfig> {
  const current = await loadUbersuggestConfig()
  const merged: UbersuggestConfig = {
    ...current,
    ...next,
    accessToken: next.accessToken !== undefined ? next.accessToken : current.accessToken,
    mcpUrl: next.mcpUrl || current.mcpUrl || UBERSUGGEST_MCP_URL,
  }
  await saveEngineConfig('ubersuggest', {
    enabled: merged.enabled,
    accessToken: merged.accessToken,
    mcpUrl: merged.mcpUrl,
    connectedAt: merged.connectedAt ?? null,
    lastError: merged.lastError ?? null,
    toolCount: merged.toolCount ?? 0,
  })
  return merged
}
