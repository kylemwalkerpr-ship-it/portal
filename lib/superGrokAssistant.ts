import { resolveMessengerGrokAuth, type MessengerGrokAuth } from '@/lib/messengerAi'
import { XAI_API_BASE_DEFAULT } from '@/lib/xaiSuperGrokOAuth'

export type SystemAssistantTurn = {
  role: 'user' | 'assistant'
  content: string
}

const RESPONSES_TIMEOUT_MS = 18_000
const CHAT_TIMEOUT_MS = 10_000
const AUTH_TIMEOUT_MS = 7_000
const AUTH_CACHE_TTL_MS = 120_000
const MAX_OUTPUT_TOKENS = 1200
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const AUTH_FAILURE_STATUS = new Set([401, 403])
const CACHE_KEY = 'yqaa-public-assistant-v2'

let authCache: { value: MessengerGrokAuth; expiresAt: number } | null = null

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out after ${timeoutMs}ms`)
          error.name = 'AbortError'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function resolveCachedAuth(force = false): Promise<MessengerGrokAuth> {
  if (!force && authCache && authCache.expiresAt > Date.now()) return authCache.value
  const value = await withTimeout(resolveMessengerGrokAuth(), AUTH_TIMEOUT_MS, 'Assistant auth resolution')
  authCache = { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS }
  return value
}

function headersFor(auth: MessengerGrokAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-grok-conv-id': CACHE_KEY,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function postJsonWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempts = 2,
): Promise<{ response: Response; text: string }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs)
      const text = await response.text()
      if (response.ok || !TRANSIENT_STATUS.has(response.status) || attempt === attempts - 1) {
        return { response, text }
      }
      await wait(250 * (attempt + 1))
    } catch (err) {
      lastError = err
      const timeout = err instanceof Error && err.name === 'AbortError'
      // Timeouts switch protocol immediately instead of repeating a slow call.
      if (timeout || attempt === attempts - 1) throw err
      await wait(250 * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Assistant request failed')
}

function parseChatContent(text: string): string {
  try {
    const json = JSON.parse(text) as any
    return String(json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '').trim()
  } catch {
    return ''
  }
}

function parseResponsesContent(text: string): string {
  try {
    const json = JSON.parse(text) as any
    return String(
      json?.output_text ||
      (Array.isArray(json?.output)
        ? json.output
            .flatMap((item: any) => item?.content || [])
            .map((item: any) => item?.text || '')
            .join('\n')
        : '') ||
      json?.choices?.[0]?.message?.content ||
      '',
    ).trim()
  } catch {
    return ''
  }
}

async function callResponses(
  auth: MessengerGrokAuth,
  messages: Array<{ role: string; content: string }>,
) {
  return postJsonWithRetry(
    `${auth.baseURL}/responses`,
    {
      method: 'POST',
      headers: headersFor(auth),
      body: JSON.stringify({
        model: auth.model,
        input: messages,
        reasoning: { effort: 'low' },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        prompt_cache_key: CACHE_KEY,
        store: false,
      }),
    },
    RESPONSES_TIMEOUT_MS,
    2,
  )
}

async function callChatCompletions(
  auth: MessengerGrokAuth,
  messages: Array<{ role: string; content: string }>,
) {
  return postJsonWithRetry(
    `${auth.baseURL}/chat/completions`,
    {
      method: 'POST',
      headers: headersFor(auth),
      body: JSON.stringify({
        model: auth.model,
        temperature: 0.2,
        reasoning_effort: 'low',
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
      }),
    },
    CHAT_TIMEOUT_MS,
    1,
  )
}

/**
 * System-wide YouSafe assistant transport.
 *
 * YQAA is a latency-sensitive support workload, so Grok 4.6 is explicitly
 * run at low reasoning effort. The current xAI Responses API is primary;
 * legacy Chat Completions remains an independent bounded recovery path.
 * Authentication is cached briefly and refreshed once on 401/403.
 */
export async function callSystemSuperGrok(
  system: string,
  turns: SystemAssistantTurn[],
): Promise<{ text: string; model: string; authMode: string; latencyMs: number }> {
  const startedAt = Date.now()
  let auth = await resolveCachedAuth()
  const messages = [
    { role: 'system', content: system },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ]

  let responsesStatus = 0
  let responsesDiagnostic = ''
  try {
    let response = await callResponses(auth, messages)
    responsesStatus = response.response.status

    if (AUTH_FAILURE_STATUS.has(response.response.status)) {
      authCache = null
      auth = await resolveCachedAuth(true)
      response = await callResponses(auth, messages)
      responsesStatus = response.response.status
    }

    responsesDiagnostic = response.text.slice(0, 240)
    if (response.response.ok) {
      const content = parseResponsesContent(response.text)
      if (content) {
        return {
          text: content,
          model: auth.model,
          authMode: auth.authMode,
          latencyMs: Date.now() - startedAt,
        }
      }
    }
  } catch (err) {
    responsesDiagnostic = err instanceof Error ? err.message : String(err)
  }

  let chatStatus = 0
  let chatDiagnostic = ''
  try {
    const chat = await callChatCompletions(auth, messages)
    chatStatus = chat.response.status
    chatDiagnostic = chat.text.slice(0, 240)
    if (chat.response.ok) {
      const content = parseChatContent(chat.text)
      if (content) {
        return {
          text: content,
          model: auth.model,
          authMode: auth.authMode,
          latencyMs: Date.now() - startedAt,
        }
      }
    }
  } catch (err) {
    chatDiagnostic = err instanceof Error ? err.message : String(err)
  }

  throw new Error(
    `Assistant model unavailable after bounded recovery (responses=${responsesStatus || 'network'} ${responsesDiagnostic}; chat=${chatStatus || 'network'} ${chatDiagnostic})`,
  )
}

export function resetSystemAssistantAuthCache(): void {
  authCache = null
}

export type SystemWebSearchSource = {
  url: string
  title?: string
  snippet?: string
}

function sentenceBefore(text: string, index: number): string {
  const before = text.slice(Math.max(0, index - 900), Math.max(0, index))
  return before.split(/(?<=[.!?])\s+/).at(-1)?.trim() || before.trim()
}

export function parseSystemWebSearchResponse(raw: string): {
  text: string
  citations: string[]
  webSearchCalls: number
  sources: SystemWebSearchSource[]
} {
  const data = JSON.parse(raw) as Record<string, any>
  const text = parseResponsesContent(raw).slice(0, 5000)
  const citationSet = new Set<string>()
  const sources = new Map<string, SystemWebSearchSource>()
  const addSource = (candidate: unknown, title?: unknown, snippet?: unknown) => {
    const url = typeof candidate === 'string' ? candidate.trim() : ''
    if (!/^https:\/\//i.test(url)) return
    citationSet.add(url)
    const prior = sources.get(url)
    sources.set(url, {
      url,
      title: String(title || prior?.title || '').trim() || undefined,
      snippet: String(snippet || prior?.snippet || '').trim().slice(0, 1200) || undefined,
    })
  }

  if (Array.isArray(data.citations)) {
    for (const url of data.citations) addSource(url)
  }

  let outputWebSearchCalls = 0
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'web_search_call') {
      outputWebSearchCalls += 1
      const actionSources = item.action?.sources
      if (Array.isArray(actionSources)) {
        for (const source of actionSources) {
          addSource(source?.url || source?.link, source?.title || source?.name, source?.snippet || source?.text || source?.description)
        }
      }
    }
    if (item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!content || typeof content !== 'object') continue
      const blockText = typeof content.text === 'string' ? content.text : ''
      for (const annotation of Array.isArray(content.annotations) ? content.annotations : []) {
        const start = Number(annotation?.start_index)
        const snippet = Number.isFinite(start) && start >= 0 ? sentenceBefore(blockText, start) : ''
        addSource(annotation?.url, annotation?.title, snippet)
      }
    }
  }

  const inline = /\[\[\d+\]\]\((https:\/\/[^\s)]+)\)/g
  for (const match of text.matchAll(inline)) addSource(match[1], undefined, sentenceBefore(text, match.index || 0))

  const usageCalls = Number(
    data.usage?.server_side_tool_usage_details?.web_search_calls ??
    data.usage?.server_side_tool_usage?.web_search_calls ??
    0,
  )
  const webSearchCalls = Math.max(Number.isFinite(usageCalls) ? usageCalls : 0, outputWebSearchCalls)
  return { text, citations: [...citationSet], webSearchCalls, sources: [...sources.values()] }
}

function directXaiWebAuth(current: MessengerGrokAuth): MessengerGrokAuth | null {
  const apiKey = process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim() || ''
  if (!apiKey || apiKey === current.apiKey) return null
  return {
    apiKey,
    baseURL: XAI_API_BASE_DEFAULT,
    model: process.env.XAI_MODEL?.trim() || current.model,
    authMode: 'env',
  }
}

/** One bounded xAI Responses web call with current-schema source extraction and a direct-key retry. */
export async function callSystemSuperGrokWebSearch(
  question: string,
  allowedDomains?: string[],
): Promise<{ text: string; citations: string[]; webSearchCalls: number; sources: SystemWebSearchSource[] }> {
  let auth = await resolveCachedAuth()
  const request = (selectedAuth: MessengerGrokAuth) => postJsonWithRetry(
    `${selectedAuth.baseURL}/responses`,
    {
      method: 'POST',
      headers: headersFor(selectedAuth),
      body: JSON.stringify({
        model: selectedAuth.model,
        input: [
          { role: 'system', content: 'Research this public general question using web search. Use primary/official sources for regulated or YMYL topics. Summarize only verifiable facts from the requested jurisdiction. Cite source URLs. Do not give personalized legal advice or infer private facts.' },
          { role: 'user', content: question },
        ],
        tools: [{ type: 'web_search', ...(allowedDomains?.length ? { filters: { allowed_domains: allowedDomains.slice(0, 5) } } : {}) }],
        include: ['web_search_call.action.sources'],
        reasoning: { effort: 'low' },
        max_output_tokens: 900,
        store: false,
      }),
    },
    18_000,
    1,
  )

  let result = await request(auth)
  if (AUTH_FAILURE_STATUS.has(result.response.status)) {
    authCache = null
    auth = await resolveCachedAuth(true)
    result = await request(auth)
  }

  const parseIfUsable = (candidate: { response: Response; text: string }) => {
    if (!candidate.response.ok || candidate.text.length > 65_536) return null
    try {
      const parsed = parseSystemWebSearchResponse(candidate.text)
      return parsed.webSearchCalls > 0 && (parsed.sources.length > 0 || parsed.citations.length > 0) ? parsed : null
    } catch { return null }
  }

  const first = parseIfUsable(result)
  if (first) return first

  const fallbackAuth = directXaiWebAuth(auth)
  if (fallbackAuth) {
    const fallback = await request(fallbackAuth)
    const parsed = parseIfUsable(fallback)
    if (parsed) return parsed
    if (!fallback.response.ok) throw new Error(`Web research failed (${fallback.response.status})`)
  }

  if (!result.response.ok) throw new Error(`Web research failed (${result.response.status})`)
  throw new Error('Web research returned no citation-linked sources')
}
