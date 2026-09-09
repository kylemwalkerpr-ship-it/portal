import { resolveMessengerGrokAuth, type MessengerGrokAuth } from '@/lib/messengerAi'

export type SystemAssistantTurn = {
  role: 'user' | 'assistant'
  content: string
}

const CHAT_TIMEOUT_MS = 11_000
const RESPONSES_TIMEOUT_MS = 8_000
const AUTH_TIMEOUT_MS = 4_000
const AUTH_CACHE_TTL_MS = 30_000
const MAX_OUTPUT_TOKENS = 1200
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

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

async function resolveCachedAuth(): Promise<MessengerGrokAuth> {
  if (authCache && authCache.expiresAt > Date.now()) return authCache.value
  const value = await withTimeout(resolveMessengerGrokAuth(), AUTH_TIMEOUT_MS, 'Assistant auth resolution')
  authCache = { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS }
  return value
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

/**
 * System-wide YouSafe assistant transport.
 *
 * The primary protocol gets a short bounded window, then an independent
 * protocol fallback. Combined model wait is therefore measured in seconds,
 * not a minute-plus chain of nested retries.
 */
export async function callSystemSuperGrok(
  system: string,
  turns: SystemAssistantTurn[],
): Promise<{ text: string; model: string; authMode: string; latencyMs: number }> {
  const startedAt = Date.now()
  const auth = await resolveCachedAuth()
  const messages = [
    { role: 'system', content: system },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ]
  const headers = {
    Authorization: `Bearer ${auth.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  let chatStatus = 0
  let chatDiagnostic = ''
  try {
    const chat = await postJsonWithRetry(
      `${auth.baseURL}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: auth.model,
          temperature: 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages,
        }),
      },
      CHAT_TIMEOUT_MS,
      2,
    )
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

  // Fresh controller/timer: a timeout above cannot pre-abort this fallback.
  try {
    const response = await postJsonWithRetry(
      `${auth.baseURL}/responses`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: auth.model,
          input: messages,
          max_output_tokens: MAX_OUTPUT_TOKENS,
        }),
      },
      RESPONSES_TIMEOUT_MS,
      1,
    )
    const content = response.response.ok ? parseResponsesContent(response.text) : ''
    if (content) {
      return {
        text: content,
        model: auth.model,
        authMode: auth.authMode,
        latencyMs: Date.now() - startedAt,
      }
    }
    throw new Error(`responses protocol returned ${response.response.status}: ${response.text.slice(0, 240)}`)
  } catch (err) {
    const fallbackDiagnostic = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Assistant model unavailable after bounded recovery (chat=${chatStatus || 'network'} ${chatDiagnostic}; responses=${fallbackDiagnostic})`,
    )
  }
}

export function resetSystemAssistantAuthCache(): void {
  authCache = null
}
