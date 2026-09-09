import { resolveMessengerGrokAuth } from '@/lib/messengerAi'

export type SystemAssistantTurn = {
  role: 'user' | 'assistant'
  content: string
}

const REQUEST_TIMEOUT_MS = 28_000
const MAX_OUTPUT_TOKENS = 1800
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
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
  attempts = 2,
): Promise<{ response: Response; text: string }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init)
      const text = await response.text()
      if (response.ok || !TRANSIENT_STATUS.has(response.status) || attempt === attempts - 1) {
        return { response, text }
      }
      await wait(350 * (attempt + 1))
    } catch (err) {
      lastError = err
      const timeout = err instanceof Error && err.name === 'AbortError'
      // A timed-out request should immediately try the independent protocol
      // fallback rather than repeating the same slow operation.
      if (timeout || attempt === attempts - 1) throw err
      await wait(350 * (attempt + 1))
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
 * Credentials/model are resolved through Messenger's existing SuperGrok path.
 * Reliability is handled here with bounded transient retry plus an independent
 * /responses protocol fallback. Each network attempt gets its own AbortSignal,
 * so a timeout on one protocol can never poison the fallback request.
 */
export async function callSystemSuperGrok(
  system: string,
  turns: SystemAssistantTurn[],
): Promise<{ text: string; model: string; authMode: string }> {
  const auth = await resolveMessengerGrokAuth()
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
      2,
    )
    chatStatus = chat.response.status
    chatDiagnostic = chat.text.slice(0, 240)
    if (chat.response.ok) {
      const content = parseChatContent(chat.text)
      if (content) return { text: content, model: auth.model, authMode: auth.authMode }
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
      2,
    )
    const content = response.response.ok ? parseResponsesContent(response.text) : ''
    if (content) return { text: content, model: auth.model, authMode: auth.authMode }
    throw new Error(`responses protocol returned ${response.response.status}: ${response.text.slice(0, 240)}`)
  } catch (err) {
    const fallbackDiagnostic = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Assistant model unavailable after recovery attempts (chat=${chatStatus || 'network'} ${chatDiagnostic}; responses=${fallbackDiagnostic})`,
    )
  }
}
