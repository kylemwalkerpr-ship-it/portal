/**
 * POST /api/orders/[id]/approve
 *
 * Client approves a delivered order ("Approve & release payment"). This is the
 * subsequent step after the provider submits for review:
 *   1. order under_review → completed
 *   2. escrow released  → provider earnings released (payout owed)
 *   3. escrow_event + a provider-visible note in the conversation
 *
 * Auth: requirePortalUser; caller must be the order's client.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { releaseEarningsForOrder } from '@/lib/earnings'
import { mirrorMessage } from '@/lib/conversations'

const APPROVABLE = ['under_review', 'review', 'delivered']

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const { data: order, error } = await db
    .from('orders')
    .select('id, status, escrow_status, escrow_amount, escrow_released_amount, client_id, consultant_id, title, requirements')
    .eq('id', orderId)
    .single() as any
  if (error || !order) return fail('Order not found.', 404)
  if (order.client_id !== profileId) return fail('Only the client can approve this order.', 403)
  if (!APPROVABLE.includes(String(order.status))) {
    return fail(`This order can't be approved from its current state (${order.status}).`, 409)
  }

  const warnings: string[] = []
  const previousEscrow = Number(order.escrow_amount || 0)

  // 1. Release provider earnings (payout becomes owed/available).
  let releasedCount = 0
  try {
    const released = await releaseEarningsForOrder(orderId)
    releasedCount = Array.isArray(released) ? released.length : 0
  } catch (e: any) {
    warnings.push(`earnings_release_failed: ${e?.message || 'unknown'}`)
  }

  // 2. Mark the order completed + escrow released. Setting escrow_status to
  //    'released' in the same update means the BEFORE UPDATE escrow trigger
  //    won't (re)schedule an auto-release.
  const { data: updated, error: updErr } = await db
    .from('orders')
    .update({
      status: 'completed',
      escrow_status: 'released',
      escrow_released_amount: Number(order.escrow_released_amount || 0) + previousEscrow,
      escrow_amount: 0,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('id, status, escrow_status')
    .single() as any
  if (updErr || !updated) return fail(updErr?.message || 'Could not approve the order.', 500)

  // 3. Escrow event (best-effort).
  try {
    await db.from('escrow_events').insert({
      order_id: orderId,
      event_type: 'client_release',
      amount: -1 * previousEscrow,
      balance_after: 0,
      actor_id: profileId,
      actor_role: 'client',
      reason: 'Client approved the deliverable — escrow released.',
      metadata: { released_earnings: releasedCount },
    })
  } catch (e: any) {
    warnings.push(`escrow_event_failed: ${e?.message || 'unknown'}`)
  }

  // 4. Tell the provider in the conversation.
  if (order.consultant_id) {
    try {
      await mirrorMessage(db, {
        participantA: profileId,
        participantB: order.consultant_id,
        senderId: profileId,
        body: '✅ I’ve approved the deliverable and released payment from escrow. Thank you!',
        contextKind: 'order',
        contextId: orderId,
        refOrderId: orderId,
      })
    } catch {
      /* non-fatal */
    }
  }

  return ok({ order: updated, released_earnings: releasedCount }, {}, warnings.length ? { data_warnings: warnings } : {})
}
