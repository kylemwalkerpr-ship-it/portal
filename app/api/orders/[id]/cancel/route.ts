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
  UNSTARTED_STATUSES,
  type CancellationOrder,
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

  const { data, error: rpcErr } = await auth!.db.rpc('client_cancel_order', {
    p_order_id: id,
    p_caller_id: auth!.profileId,
    p_reason: reason,
  })

  // Migration not present on this environment — never silently degrade.
  if (rpcErr) {
    if (/function\s+(public\.)?client_cancel_order\s*\(/i.test(rpcErr.message || '')) {
      return fail(
        'Client cancellation is not enabled yet — the database migration has not been applied on this environment.',
        501,
        { deploy_required: true },
      )
    }
    console.error('[orders/cancel] client_cancel_order RPC failed:', rpcErr)
    return fail(rpcErr.message || 'Cancellation failed.', 500, { atomic_refund: true })
  }

  if (!data || data.ok !== true) {
    const code = String(data?.code || 'bad_request')
    return fail(data?.message || 'Order cannot be cancelled.', cancellationHttpStatus(code), { code })
  }

  return ok({
    order: { id, status: 'cancelled' },
    refund_cents: data.refund_cents,
    refund_method: data.refund_method,
    wallet_balance_cents: data.wallet_balance_cents,
    from_status: data.from_status,
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