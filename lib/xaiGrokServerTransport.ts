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

function normalizedQuery(query?: string): string {
  const value = String(query || '').trim()
  if (!value) return ''
  return value.startsWith('?') ? value : `?${value}`
}

function buildUpstreamHeaders(input: XaiTransportRequest, developerKey: boolean): Headers {
  const incoming = new Headers(input.headers)
  const headers = new Headers()

  headers.set('Authorization', `Bearer ${input.token}`)
  headers.set('Accept', incoming.get('accept') || 'application/json')
  if (input.body != null) {
    headers.set('Content-Type', incoming.get('content-type') || 'application/json')
  }

  for (const name of PASSTHROUGH_REQUEST_HEADERS) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }

  if (!developerKey) {
    const model = modelFromBody(parseJsonBody(input.body))
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

function responseHeadersFrom(upstream: Response, developerKey: boolean): Headers {
  const headers = new Headers()
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
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
  const developerKey = isXaiDeveloperApiKey(input.token)
  const upstreamBase = xaiUpstreamBaseForToken(input.token)
  const headers = buildUpstreamHeaders(input, developerKey)
  const query = normalizedQuery(input.query)
  const body = input.method === 'GET' ? undefined : input.body ?? undefined

  const upstream = await fetchImpl(`${upstreamBase}/${input.path}${query}`, {
    method: input.method,
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeadersFrom(upstream, developerKey),
  })
}
