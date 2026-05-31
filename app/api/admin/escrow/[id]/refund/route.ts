/**
 * POST /api/admin/escrow/[id]/refund
 * Admin refund of escrow funds. Wallet-paid orders → wallet credit for buyer.
 * Body: { amount?: number (dollars, full if omitted), amountCents?: number, reason: string }
 *
 * Auth: either (a) an admin Clerk session OR (b) `Authorization: Bearer <PORTAL_SERVICE_TOKEN>`
 * for service-to-service calls from the support-saas dashboard. The service-
 * token path uses a synthetic admin profile so wallet credits + audit rows
 * still attribute the action — set SUPPORT_SAAS_SYSTEM_PROFILE_ID to the
 * profile id we want to attribute service-token refunds to (typically a
 * dedicated 'system-support' admin account).
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { credit } from '@/lib/wallet'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function authViaServiceToken(req: Request) {
  const header = req.headers.get('authorization') || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  const provided = m?.[1]
  const expected = process.env.PORTAL_SERVICE_TOKEN
  if (!provided || !expected) return null
  if (provided !== expected) return null
  const profileId = process.env.SUPPORT_SAAS_SYSTEM_PROFILE_ID || null
  if (!profileId) return null
  return { db: createSupabaseAdminClient(), profileId }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Prefer service-token auth when the header is present; otherwise fall
  // back to admin Clerk session. The service-token path is what
  // yousafe-saas /api/support/orders/[id]/refund calls into.
  const serviceAuth = await authViaServiceToken(req)
  let db: ReturnType<typeof createSupabaseAdminClient>
  let profileId: string
  if (serviceAuth) {
    db = serviceAuth.db
    profileId = serviceAuth.profileId
  } else {
    const auth = await requireAdminUser()
    if ('error' in auth) return fail(auth.error, auth.status)
    db = auth.db
    profileId = auth.profileId
  }

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const reason: string = body.reason
  if (!reason) return fail('A reason is required.', 422)

  const warnings: string[] = []

  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_refunded_amount, client_id, amount_paid, total_amount')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  const currentEscrow = Number(order.escrow_amount || 0)
  // Accept either `amount` (dollars, legacy admin UI) or `amountCents`
  // (saas service path). amountCents wins if both present — it's the more
  // precise representation and matches the gateway-side unit.
  const requestedAmount =
    body.amountCents !== undefined && Number.isFinite(Number(body.amountCents))
      ? Number(body.amountCents) / 100
      : body.amount !== undefined
        ? Number(body.amount)
        : currentEscrow

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return fail('Refund amount must be positive.', 422)
  }
  if (requestedAmount > currentEscrow) {
    return fail(`Refund amount exceeds escrow balance (${currentEscrow}).`, 422)
  }

  const remaining = currentEscrow - requestedAmount
  const isFullRefund = remaining <= 0
  const newEscrowStatus = isFullRefund ? 'refunded' : 'partial_released'
  const refundCents = Math.round(requestedAmount * 100)

  // Credit buyer wallet if we have a client_id
  if (order.client_id && refundCents > 0) {
    try {
      await credit(
        order.client_id,
        refundCents,
        `Refund for order ${orderId}`,
        orderId,
        { reason, adminId: profileId }
      )
    } catch (err: any) {
      warnings.push(`wallet_credit_failed: ${err.message}`)
    }
  }

  try {
    const update: Record<string, any> = {
      escrow_amount: remaining,
      escrow_refunded_amount: Number(order.escrow_refunded_amount || 0) + requestedAmount,
      escrow_status: newEscrowStatus,
      updated_at: new Date().toISOString(),
    }
    if (isFullRefund) update.status = 'refunded'

    const { error: updErr } = await db.from('orders').update(update).eq('id', orderId)
    if (updErr) warnings.push(`order_update_failed: ${updErr.message}`)
  } catch (err: any) {
    warnings.push(`order_update_failed: ${err.message}`)
  }

  try {
    await db.from('escrow_events').insert({
      order_id: orderId,
      event_type: 'refund',
      amount: -1 * requestedAmount,
      balance_after: remaining,
      actor_id: profileId,
      actor_role: 'admin',
      reason,
      metadata: { full_refund: isFullRefund, refunded_cents: refundCents },
    })
  } catch (err: any) {
    warnings.push(`escrow_event_failed: ${err.message}`)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_refund',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: {
        previous_escrow_amount: currentEscrow,
        refund_amount: requestedAmount,
        remaining,
        full_refund: isFullRefund,
      },
      reason,
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  let updated: any = null
  try {
    const { data } = await db.from('orders').select('*').eq('id', orderId).single() as any
    updated = data
  } catch { warnings.push('order_refetch_failed') }

  return ok({ order: updated, refund_amount: requestedAmount, remaining, full_refund: isFullRefund }, {}, warnings.length ? { data_warnings: warnings } : {})
}
