import { resolveMobileBuyer, unauthorizedResponse, handleMobileCheckout } from '@/lib/mobileCheckout'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * POST /api/mobile/checkout/order
 * Bearer-verified gig checkout (sourceType: "gig" only).
 * Required Idempotency-Key header. Server-authoritative pricing.
 * Cookie /api/checkout/order is untouched.
 */
export async function POST(req: Request) {
  if (req.signal.aborted) {
    return Response.json({ error: { message: 'Request cancelled by client' } }, { status: 499 })
  }
  const abortHandler = () => {}
  req.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await resolveMobileBuyer(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthorizedResponse(auth.reason)
    if (auth.status === 'forbidden') {
      return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    }

    return await handleMobileCheckout(req, auth)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}