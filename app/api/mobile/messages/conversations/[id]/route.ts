import { resolveMobileProfile, unauthorizedResponse, getMobileThread, sendMobileMessage } from '@/lib/mobileMessages'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * GET  /api/mobile/messages/conversations/[id] — thread messages + counterpart
 * POST /api/mobile/messages/conversations/[id] — send a text message
 * Both Bearer-verified, mirroring cookie /api/messages/conversations/[id].
 * Cookieless by design.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  if (req.signal.aborted) {
    return Response.json({ error: { message: 'Request cancelled by client' } }, { status: 499 })
  }
  const abortHandler = () => {}
  req.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await resolveMobileProfile(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthorizedResponse(auth.reason)
    if (auth.status === 'forbidden') {
      return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    }

    const { id } = await context.params
    if (!id) return Response.json({ error: { message: 'Conversation id required' } }, { status: 400 })

    const result = await getMobileThread(id, auth)
    if (result.kind === 'not_found') {
      return Response.json({ error: { message: 'Conversation not found' } }, { status: 404 })
    }
    if (result.kind === 'forbidden') {
      return Response.json({ error: { message: 'Forbidden' } }, { status: 403 })
    }
    return Response.json({ data: result.payload, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (req.signal.aborted) {
    return Response.json({ error: { message: 'Request cancelled by client' } }, { status: 499 })
  }
  const abortHandler = () => {}
  req.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await resolveMobileProfile(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthorizedResponse(auth.reason)
    if (auth.status === 'forbidden') {
      return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    }

    const { id } = await context.params
    if (!id) return Response.json({ error: { message: 'Conversation id required' } }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const result = await sendMobileMessage(id, body, auth)
    switch (result.kind) {
      case 'ok':
        return Response.json({ data: { message: result.message }, error: null })
      case 'not_found':
        return Response.json({ error: { message: 'Conversation not found' } }, { status: 404 })
      case 'forbidden':
        return Response.json({ error: { message: 'Forbidden' } }, { status: 403 })
      case 'bad_request':
        return Response.json({ error: { message: result.message } }, { status: 400 })
      case 'safety':
        return Response.json({ error: { message: result.message }, violations: result.violations }, { status: 422 })
      case 'error':
        return Response.json({ error: { message: result.message } }, { status: 500 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
