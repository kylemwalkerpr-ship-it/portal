import { resolveMobileBuyer, unauthorizedResponse } from '@/lib/mobileCheckout'
import { listCards } from '@/lib/payment-methods'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * GET /api/mobile/wallet/payment-methods
 * Bearer-verified saved card list. Same shape as cookie GET but WITHOUT vault_id.
 */
export async function GET(req: Request) {
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

    const cards = await listCards(auth.profile.id)
    return Response.json({
      cards: cards.map(c => ({
        id: c.id,
        brand: c.brand ?? 'card',
        last4: c.last4,
        exp_month: c.exp_month,
        exp_year: c.exp_year,
        is_default: c.is_default,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    console.error('[mobile/wallet/payment-methods]', message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}