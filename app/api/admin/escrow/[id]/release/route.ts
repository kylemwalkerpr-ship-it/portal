/**
 * POST /api/admin/escrow/[id]/release
 * Admin force-release escrow for an order. Releases provider earnings.
 * Body: { reason?: string }
 *
 * Auth: either (a) an admin Clerk session OR (b) `Authorization: Bearer <PORTAL_SERVICE_TOKEN>`
 * for service-to-service calls from the support-saas dispute triage flow
 * (split / release decisions). The service-token path uses
 * SUPPORT_SAAS_SYSTEM_PROFILE_ID for actor attribution. Mirrors the
 * dual-auth pattern on the parallel /api/admin/escrow/[id]/refund endpoint.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { releaseEarningsForOrder } from '@/lib/earnings'
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
  const reason: string = body.reason || 'Admin force release'

  const warnings: string[] = []

  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_released_amount, total_amount, consultant_id')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  if (!['held', 'partial_released', 'frozen'].includes(order.escrow_status)) {
    return fail(`Escrow status '${order.escrow_status}' is not releasable.`, 409)
  }

  const previousEscrowAmount = Number(order.escrow_amount || 0)

  // Release earnings for this order
  let released: any[] = []
  try {
    released = await releaseEarningsForOrder(orderId)
  } catch (err: any) {
    warnings.push(`earnings_release_failed: ${err.message || 'unknown'}`)
  }

  try {
    const { error: updErr } = await db
      .from('orders')
      .update({
        escrow_status: 'released',
        escrow_released_amount: Number(order.escrow_released_amount || 0) + previousEscrowAmount,
        escrow_amount: 0,
        status: 'released',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
    if (updErr) warnings.push(`order_update_failed: ${updErr.message}`)
  } catch (err: any) {
    warnings.push(`order_update_failed: ${err.message}`)
  }

  try {
    await db.from('escrow_events').insert({
      order_id: orderId,
      event_type: 'admin_force_release',
      amount: -1 * previousEscrowAmount,
      balance_after: 0,
      actor_id: profileId,
      actor_role: 'admin',
      reason,
      metadata: { released_earnings: released.length },
    })
  } catch (err: any) {
    warnings.push(`escrow_event_failed: ${err.message}`)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_force_release',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { previous_escrow_amount: previousEscrowAmount, released_earnings: released.length },
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

  return ok({ order: updated, released_earnings: released.length }, {}, warnings.length ? { data_warnings: warnings } : {})
}
