import { forceRefreshSuperGrokAccessToken } from '@/lib/xaiSuperGrokOAuth'
import {
  decodeJwtSubject,
  isXaiDeveloperApiKey,
  superGrokProxyHeaders,
  xaiUpstreamBaseForToken,
} from '@/lib/xaiGrokTransport'

export type XaiTransportPath = 'responses' | 'chat/completions' | 'models'

export interface XaiTransportRequest {
  method: 'GET' | 'POST'
  path: XaiTransportPath
  token: string
  query?: string
  headers?: HeadersInit
  body?: ArrayBuffer | Uint8Array | string | null
}

export interface XaiTransportDependencies {
  fetchImpl?: typeof fetch
  forceRefresh?: typeof forceRefreshSuperGrokAccessToken
}

const PASSTHROUGH_REQUEST_HEADERS = [
  'x-grok-conv-id',
  'x-grok-req-id',
  'x-grok-session-id',
  'x-grok-agent-id',
] as const

const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'retry-after',
  'x-request-id',
  'x-should-retry',
  'x-grok-context-window',
  'x-grok-max-completion-tokens',
  'x-models-etag',
] as const

type JsonBody = Record<string, unknown>
type StreamBridge = 'responses' | 'chat/completions' | null

function parseJsonBody(body: XaiTransportRequest['body']): JsonBody | null {
  if (body == null) return null
  try {
    const text = typeof body === 'string'
      ? body
      : new TextDecoder().decode(body)
    if (!text.trim()) return null
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonBody
      : null
  } catch {
    return null
  }
}

function modelFromBody(body: JsonBody | null): string | null {
  const value = body?.model
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function shouldBridgeStreaming(
  developerKey: boolean,
  method: string,
  path: string,
  body: JsonBody | null,
): StreamBridge {
  if (developerKey || method !== 'POST' || !body || body.stream === true) return null
  if (path === 'responses' || path === 'chat/completions') return path
  return null
}

function sseDataPayloads(buffer: string): { payloads: string[]; rest: string } {
  const chunks = buffer.split(/\r?\n\r?\n/)
  const rest = chunks.pop() || ''
  const payloads: string[] = []
  for (const chunk of chunks) {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload && payload !== '[DONE]') payloads.push(payload)
    }
  }
  return { payloads, rest }
}

function escapeJsonStringChunk(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function bridgeResponsesStream(
  body: ReadableStream<Uint8Array>,
  model: string | null,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = ''
      let status = 'completed'
      let incompleteReason = ''
      let emittedChars = 0

      controller.enqueue(encoder.encode('{"output_text":"'))

      const handlePayload = (payload: string) => {
        let event: Record<string, unknown>
        try {
          event = JSON.parse(payload) as Record<string, unknown>
        } catch {
          return
        }
        const type = String(event.type || '')
        if (type === 'response.output_text.delta' || type === 'response.text.delta') {
          const delta = typeof event.delta === 'string' ? event.delta : ''
          if (delta) {
            emittedChars += delta.length
            controller.enqueue(encoder.encode(escapeJsonStringChunk(delta)))
          }
          return
        }
        if (type === 'response.completed' || type === 'response.incomplete') {
          const response = event.response && typeof event.response === 'object'
            ? event.response as Record<string, unknown>
            : null
          if (response) {
            if (typeof response.status === 'string' && response.status) status = response.status
            const details = response.incomplete_details && typeof response.incomplete_details === 'object'
              ? response.incomplete_details as { reason?: unknown }
              : null
            if (details && typeof details.reason === 'string') incompleteReason = details.reason
            const finalText = typeof response.output_text === 'string' ? response.output_text : ''
            if (!emittedChars && finalText) {
              emittedChars += finalText.length
              controller.enqueue(encoder.encode(escapeJsonStringChunk(finalText)))
            }
          }
          if (type === 'response.incomplete') status = 'incomplete'
          return
        }
        if (type === 'response.failed' || type === 'error') {
          const error = event.error && typeof event.error === 'object'
            ? event.error as { message?: unknown }
            : null
          const message = error && typeof error.message === 'string'
            ? error.message
            : 'SuperGrok streaming response failed'
          throw new Error(message)
        }
      }

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const parsed = sseDataPayloads(buffer)
            buffer = parsed.rest
            for (const payload of parsed.payloads) handlePayload(payload)
          }
          buffer += decoder.decode()
          if (buffer.trim()) {
            const parsed = sseDataPayloads(`${buffer}\n\n`)
            for (const payload of parsed.payloads) handlePayload(payload)
          }
          const suffix =
            `","status":${JSON.stringify(status)},"model":${JSON.stringify(model || 'grok-4.6')}` +
            (incompleteReason
              ? `,"incomplete_details":{"reason":${JSON.stringify(incompleteReason)}}`
              : '') +
            '}'
          controller.enqueue(encoder.encode(suffix))
          controller.close()
        } catch (error) {
          try { await reader.cancel(error) } catch { /* best effort */ }
          controller.error(error)
        }
      })()
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

function bridgeChatCompletionsStream(
  body: ReadableStream<Uint8Array>,
  model: string | null,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = ''
      let finishReason: string | null = null
      controller.enqueue(encoder.encode('{"choices":[{"message":{"role":"assistant","content":"'))

      const handlePayload = (payload: string) => {
        let event: Record<string, unknown>
        try {
          event = JSON.parse(payload) as Record<string, unknown>
        } catch {
          return
        }
        const choices = Array.isArray(event.choices) ? event.choices : []
        const first = choices[0] && typeof choices[0] === 'object'
          ? choices[0] as Record<string, unknown>
          : null
        if (!first) return
        const delta = first.delta && typeof first.delta === 'object'
          ? first.delta as { content?: unknown }
          : null
        const text = delta && typeof delta.content === 'string' ? delta.content : ''
        if (text) controller.enqueue(encoder.encode(escapeJsonStringChunk(text)))
        if (typeof first.finish_reason === 'string') finishReason = first.finish_reason
      }

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const parsed = sseDataPayloads(buffer)
            buffer = parsed.rest
            for (const payload of parsed.payloads) handlePayload(payload)
          }
          buffer += decoder.decode()
          if (buffer.trim()) {
            const parsed = sseDataPayloads(`${buffer}\n\n`)
            for (const payload of parsed.payloads) handlePayload(payload)
          }
          const suffix =
            `"},"finish_reason":${JSON.stringify(finishReason)} }],"model":${JSON.stringify(model || 'grok-4.6')}}`
          controller.enqueue(encoder.encode(suffix))
          controller.close()
        } catch (error) {
          try { await reader.cancel(error) } catch { /* best effort */ }
          controller.error(error)
        }
      })()
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

function normalizedQuery(query?: string): string {
  const value = String(query || '').trim()
  if (!value) return ''
  return value.startsWith('?') ? value : `?${value}`
}

function normalizedFetchBody(
  method: XaiTransportRequest['method'],
  body: XaiTransportRequest['body'],
): BodyInit | undefined {
  if (method === 'GET' || body == null) return undefined
  if (typeof body === 'string' || body instanceof ArrayBuffer) return body

  // TypeScript's DOM definitions allow Uint8Array to be backed by
  // SharedArrayBuffer, while fetch BodyInit requires ArrayBuffer-backed data.
  // Copy into a fresh ArrayBuffer so server callers can pass Uint8Array safely.
  const copy = new Uint8Array(body.byteLength)
  copy.set(body)
  return copy.buffer
}

function buildUpstreamHeaders(
  input: XaiTransportRequest,
  developerKey: boolean,
  streamBridge: StreamBridge,
  model: string | null,
): Headers {
  const incoming = new Headers(input.headers)
  const headers = new Headers()

  headers.set('Authorization', `Bearer ${input.token}`)
  headers.set('Accept', streamBridge ? 'text/event-stream' : incoming.get('accept') || 'application/json')
  if (input.body != null) {
    headers.set('Content-Type', incoming.get('content-type') || 'application/json')
  }

  for (const name of PASSTHROUGH_REQUEST_HEADERS) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }

  if (!developerKey) {
    for (const [name, value] of Object.entries(superGrokProxyHeaders(model))) {
      headers.set(name, value)
    }

    const userId = decodeJwtSubject(input.token)
    if (userId) {
      headers.set('x-userid', userId)
      headers.set('x-grok-user-id', userId)
    }

    if (!headers.has('x-grok-conv-id')) {
      headers.set('x-grok-conv-id', `yousafe-${crypto.randomUUID()}`)
    }
    if (!headers.has('x-grok-req-id')) {
      headers.set('x-grok-req-id', crypto.randomUUID())
    }
    if (!headers.has('x-grok-session-id')) {
      headers.set('x-grok-session-id', `yousafe-${crypto.randomUUID()}`)
    }
    if (!headers.has('x-grok-agent-id')) {
      headers.set('x-grok-agent-id', 'yousafe-portal')
    }
  }

  return headers
}

function responseHeadersFrom(
  upstream: Response,
  developerKey: boolean,
  streamBridge: StreamBridge,
): Headers {
  const headers = new Headers()
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    if (streamBridge && name === 'content-type') continue
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('x-yousafe-xai-transport', developerKey ? 'developer-api' : 'supergrok-oauth')
  return headers
}

export async function forwardXaiRequest(
  input: XaiTransportRequest,
  deps: XaiTransportDependencies = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl || fetch
  const forceRefresh = deps.forceRefresh || forceRefreshSuperGrokAccessToken
  const developerKey = isXaiDeveloperApiKey(input.token)
  const upstreamBase = xaiUpstreamBaseForToken(input.token)
  const jsonBody = parseJsonBody(input.body)
  const model = modelFromBody(jsonBody)
  const streamBridge = shouldBridgeStreaming(developerKey, input.method, input.path, jsonBody)
  const headers = buildUpstreamHeaders(input, developerKey, streamBridge, model)
  const query = normalizedQuery(input.query)
  const upstreamUrl = `${upstreamBase}/${input.path}${query}`
  const upstreamBody = streamBridge && jsonBody
    ? JSON.stringify({ ...jsonBody, stream: true })
    : normalizedFetchBody(input.method, input.body)
  const requestInit: RequestInit = {
    method: input.method,
    headers,
    body: upstreamBody,
    redirect: 'manual',
    cache: 'no-store',
  }

  let upstream = await fetchImpl(upstreamUrl, requestInit)

  // The subscription service can invalidate a locally-fresh OAuth token.
  // Match Grok CLI recovery: force-refresh once, replay once, then return.
  // Developer API keys and 403 policy/quota responses never enter this path.
  if (!developerKey && upstream.status === 401) {
    const refreshed = await forceRefresh()
    if (refreshed?.accessToken) {
      try { await upstream.body?.cancel() } catch { /* best effort */ }

      headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
      const refreshedUserId = decodeJwtSubject(refreshed.accessToken)
      if (refreshedUserId) {
        headers.set('x-userid', refreshedUserId)
        headers.set('x-grok-user-id', refreshedUserId)
      } else {
        headers.delete('x-userid')
        headers.delete('x-grok-user-id')
      }

      upstream = await fetchImpl(upstreamUrl, requestInit)
    }
  }

  const responseHeaders = responseHeadersFrom(upstream, developerKey, streamBridge)

  if (streamBridge && upstream.ok && upstream.body) {
    responseHeaders.set('content-type', 'application/json; charset=utf-8')
    responseHeaders.set('x-yousafe-xai-stream-bridge', streamBridge)
    const bridgedBody = streamBridge === 'responses'
      ? bridgeResponsesStream(upstream.body, model)
      : bridgeChatCompletionsStream(upstream.body, model)
    return new Response(bridgedBody, {
      status: 200,
      headers: responseHeaders,
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
