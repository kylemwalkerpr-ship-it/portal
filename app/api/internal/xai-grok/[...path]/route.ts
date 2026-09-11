import { NextRequest } from 'next/server'
import {
  decodeJwtSubject,
  isXaiDeveloperApiKey,
  superGrokProxyHeaders,
  xaiUpstreamBaseForToken,
} from '@/lib/xaiGrokTransport'

export const dynamic = 'force-dynamic'

const ALLOWED_PATHS = new Set(['responses', 'chat/completions', 'models'])
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

type RouteContext = { params: Promise<{ path: string[] }> }

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function modelFromBody(raw: ArrayBuffer | null): string | null {
  if (!raw?.byteLength) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as { model?: unknown }
    return typeof parsed.model === 'string' && parsed.model.trim()
      ? parsed.model.trim()
      : null
  } catch {
    return null
  }
}

async function forward(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path: segments } = await context.params
  const path = (segments || []).map((segment) => String(segment || '').trim()).filter(Boolean).join('/')
  if (!ALLOWED_PATHS.has(path)) {
    return Response.json({ error: 'Unsupported xAI transport path' }, { status: 404 })
  }

  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'Missing xAI bearer credential' }, { status: 401 })
  }

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? null
    : await request.arrayBuffer()
  const model = modelFromBody(body)
  const developerKey = isXaiDeveloperApiKey(token)
  const upstreamBase = xaiUpstreamBaseForToken(token)
  const headers = new Headers()

  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', request.headers.get('accept') || 'application/json')
  if (body) headers.set('Content-Type', request.headers.get('content-type') || 'application/json')

  for (const name of PASSTHROUGH_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  if (!developerKey) {
    for (const [name, value] of Object.entries(superGrokProxyHeaders(model))) {
      headers.set(name, value)
    }
    const userId = decodeJwtSubject(token)
    if (userId) {
      // Current Grok clients use both spellings across inference/remote APIs.
      headers.set('x-userid', userId)
      headers.set('x-grok-user-id', userId)
    }
    if (!headers.has('x-grok-conv-id')) headers.set('x-grok-conv-id', `yousafe-${crypto.randomUUID()}`)
    if (!headers.has('x-grok-req-id')) headers.set('x-grok-req-id', crypto.randomUUID())
    if (!headers.has('x-grok-session-id')) headers.set('x-grok-session-id', `yousafe-${crypto.randomUUID()}`)
    if (!headers.has('x-grok-agent-id')) headers.set('x-grok-agent-id', 'yousafe-portal')
  }

  const upstream = await fetch(`${upstreamBase}/${path}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: body || undefined,
    redirect: 'manual',
    cache: 'no-store',
  })

  const responseHeaders = new Headers()
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  responseHeaders.set('x-yousafe-xai-transport', developerKey ? 'developer-api' : 'supergrok-oauth')

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context)
}
