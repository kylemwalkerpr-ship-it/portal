import { resolveMobileBuyer, unauthorizedResponse } from '@/lib/mobileCheckout'
import { getOrCreateWallet } from '@/lib/wallet'
import { getPlatformSettings } from '@/lib/platformConfig'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

/**
 * GET /api/mobile/wallet/balance
 * Bearer-verified wallet balance. Same shape as cookie GET /api/wallet/balance.
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

    const wallet = await getOrCreateWallet(auth.profile.id)
    const settings = await getPlatformSettings().catch(() => null)
    const topupEnabled = (settings as any)?.wallet_topup_enabled !== false

    return Response.json({
      balanceCents: wallet.balance_cents,
      currency: wallet.currency,
      available: wallet.balance_cents / 100,
      pending: 0,
      topupEnabled,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    console.error('[mobile/wallet/balance]', message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}