/**
 * POST /api/orders/[id]/cancel — owning client cancels a genuinely unstarted
 *     order. Server-authoritative: POST delegates the full eligibility check
 *     AND the atomic refund/settlement to the `client_cancel_order` Postgres
 *     RPC (supabase/client_order_cancellation.sql) — a single lock+transaction.
 *     There is deliberately NO fallback to a non-atomic multi-step refund here.
 *
 * GET  /api/orders/[id]/cancel — read-only eligibility verdict (shared with
 *     the student order-detail UI, lib/orderCancellation.ts).
 *
 * Refund destination: the client's wallet (matches existing admin escrow
 *     refunds). Amount = the order's captured `amount_paid` (cents), exactly
 *     once, never exceeding what was captured and never when the order shows
 *     work/milestone/release/dispute evidence.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import {
  getClientCancellationEligibility,
  cancellationHttpStatus,
  runClientCancelRpc,
  UNSTARTED_STATUSES,
} from '@/lib/orderCancellation'

async function authClient() {
  const auth = await requirePortalUser()
  if ('error' in auth) return { auth: null, error: fail(auth.error, auth.status) }
  if (auth.role !== 'client') return { auth: null, error: fail('Only clients can cancel orders.', 403) }
  return { auth, error: null }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { auth, error } = await authClient()
  if (error) return error

  const { id } = await context.params
  if (!id) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  const result = await runClientCancelRpc(auth!.db, {
    orderId: id,
    callerId: auth!.profileId,
    reason,
  })

  if (result.kind === 'deploy_required') {
    return fail(result.message, 501, { deploy_required: true })
  }
  if (result.kind === 'rpc_error') {
    console.error('[orders/cancel] client_cancel_order RPC failed:', result.message)
    return fail(result.message, 500, { atomic_refund: true })
  }
  if (result.kind === 'denied') {
    return fail(result.message, cancellationHttpStatus(result.code), { code: result.code })
  }

  return ok({
    order: { id, status: 'cancelled' },
    refund_cents: result.refund_cents,
    refund_method: result.refund_method,
    wallet_balance_cents: result.wallet_balance_cents,
    from_status: result.from_status,
  })
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  if (!id) return fail('Order id is required.', 400)

  // Load the order (ownership enforced here for read eligibility too).
  const { data: order, error: orderErr } = await auth.db
    .from('orders')
    .select('id, client_id, status, progress, currency, amount_paid, total_amount, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, escrow_disputed_at, escrow_frozen_at, auto_release_eligible_at, cancelled_at, refunded_amount, refund_status, payout_status')
    .eq('id', id)
    .single()
  if (orderErr) return fail(orderErr.message || 'Order not found.', 404)
  if (order.client_id !== auth.profileId) return fail('Forbidden.', 403)

  if (!(UNSTARTED_STATUSES as readonly string[]).includes(String(order.status || ''))) {
    const verdict = getClientCancellationEligibility(order, { callerId: auth.profileId })
    return ok({ cancellable: verdict.cancellable, ...verdict })
  }

  // Only probe work/payout evidence when the order looks unstarted.
  const [milestonesRes, earningsRes] = await Promise.all([
    auth.db.from('order_milestones').select('status').eq('order_id', id),
    auth.db.from('provider_earnings').select('status').eq('order_id', id),
  ])
  const evidence = {
    milestoneWork: ((milestonesRes.data ?? []) as Array<{ status: string }>).some(
      (m) => m.status !== 'pending' && m.status !== 'cancelled',
    ),
    earningReleased: ((earningsRes.data ?? []) as Array<{ status: string }>).some((e) =>
      ['releasable', 'paid'].includes(e.status),
    ),
  }

  const verdict = getClientCancellationEligibility(order, { callerId: auth.profileId, ...evidence })
  return ok({ cancellable: verdict.cancellable, ...verdict })
}
