import { resolveMobileProfile, unauthorizedResponse, listMobileConversations } from '@/lib/mobileMessages'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * GET /api/mobile/messages/conversations
 * Bearer-verified inbox list for the signed-in profile (same shape as
 * GET /api/messages/conversations). Cookieless by design.
 */
export async function GET(req: Request) {
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

    const payload = await listMobileConversations(req, auth)
    return Response.json({ data: payload, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
