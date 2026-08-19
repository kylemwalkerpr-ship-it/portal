import { resolveMobileStudent, unauthorizedResponse, getMobileOrderDetail } from '@/lib/mobileOrders'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * GET /api/mobile/orders/[id]
 * Bearer-verified student order detail (same shape as GET /api/student/orders/[id],
 * including files minted as short-lived signed URLs). Cookieless by design.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  if (req.signal.aborted) {
    return Response.json({ error: { message: 'Request cancelled by client' } }, { status: 499 })
  }
  const abortHandler = () => {}
  req.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await resolveMobileStudent(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthorizedResponse(auth.reason)
    if (auth.status === 'forbidden') {
      return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    }

    const { id } = await context.params
    if (!id) return Response.json({ error: { message: 'Order id required' } }, { status: 400 })

    const result = await getMobileOrderDetail(id, auth)
    if (result.kind === 'not_found') {
      return Response.json({ error: { message: 'Order not found' } }, { status: 404 })
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
