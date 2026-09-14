import { NextRequest } from 'next/server'
import { invokeXaiGrokRouter } from '@/lib/xaiGrokRouter'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ path: string[] }> }

async function forward(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path: segments } = await context.params
  const path = (segments || []).map((segment) => String(segment || '').trim()).filter(Boolean).join('/')
  const rawBody = request.method === 'GET' || request.method === 'HEAD'
    ? null
    : await request.arrayBuffer()

  return invokeXaiGrokRouter({
    method: request.method,
    path,
    search: request.nextUrl.search,
    authorization: request.headers.get('authorization'),
    accept: request.headers.get('accept'),
    contentType: request.headers.get('content-type'),
    requestHeaders: request.headers,
    body: rawBody,
  })
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context)
}
