import { resolveMobileStudent, unauthorizedResponse } from '@/lib/mobileOrders'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import {
  cancellationHttpStatus,
  runClientCancelRpc,
} from '@/lib/orderCancellation'

/**
 * POST /api/mobile/orders/[id]/cancel
 * Bearer-verified twin of POST /api/orders/[id]/cancel. Same atomic RPC,
 * same financial outcome (wallet refund of captured amount_paid).
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
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
    if (!id) return Response.json({ error: { message: 'Order id is required.' } }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

    const result = await runClientCancelRpc(auth.db, {
      orderId: id,
      callerId: auth.profile.id,
      reason,
    })

    if (result.kind === 'deploy_required') {
      return Response.json(
        { error: { message: result.message, deploy_required: true } },
        { status: 501 },
      )
    }
    if (result.kind === 'rpc_error') {
      console.error('[mobile/orders/cancel] client_cancel_order RPC failed:', result.message)
      return Response.json({ error: { message: result.message, atomic_refund: true } }, { status: 500 })
    }
    if (result.kind === 'denied') {
      return Response.json(
        { error: { message: result.message, code: result.code } },
        { status: cancellationHttpStatus(result.code) },
      )
    }

    return Response.json({
      data: {
        order: { id, status: 'cancelled' },
        refund_cents: result.refund_cents,
        refund_method: result.refund_method,
        wallet_balance_cents: result.wallet_balance_cents,
        from_status: result.from_status,
      },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
