/**
 * GET /api/orders/[id]/escrow
 * Client/student view of their order's escrow status: milestones, pending
 * scope changes, and recent escrow event timeline.
 *
 * Auth: requirePortalUser; must own the order (auth.profileId === order.client_id)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const warnings: string[] = []

  // Load order + ownership check
  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, auto_release_eligible_at, client_id, consultant_id, attorney_id, total_amount')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  if (order.client_id !== profileId) return fail('Forbidden', 403)

  // Parallel fetch milestones, pending scope changes, last 20 events
  const [milestonesRes, scopeRes, eventsRes] = await Promise.allSettled([
    db.from('order_milestones').select('*').eq('order_id', orderId).order('sequence', { ascending: true }),
    db.from('order_scope_changes').select('*').eq('order_id', orderId).eq('status', 'pending').order('created_at', { ascending: false }),
    db.from('escrow_events').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
  ])

  let milestones: any[] = []
  if (milestonesRes.status === 'fulfilled') {
    milestones = (((milestonesRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('milestones_unavailable') }

  let pendingScopeChanges: any[] = []
  if (scopeRes.status === 'fulfilled') {
    pendingScopeChanges = (((scopeRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('scope_changes_unavailable') }

  let events: any[] = []
  if (eventsRes.status === 'fulfilled') {
    events = (((eventsRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('events_unavailable') }

  return ok({
    order: {
      id: order.id,
      status: order.status,
      escrow_status: order.escrow_status,
      escrow_amount: Number(order.escrow_amount || 0),
      escrow_released_amount: Number(order.escrow_released_amount || 0),
      escrow_refunded_amount: Number(order.escrow_refunded_amount || 0),
      auto_release_eligible_at: order.auto_release_eligible_at,
      total_amount: Number(order.total_amount || 0),
    },
    milestones,
    pending_scope_changes: pendingScopeChanges,
    events,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}
