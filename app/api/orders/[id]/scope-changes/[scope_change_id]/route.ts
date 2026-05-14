/**
 * PATCH /api/orders/[id]/scope-changes/[scope_change_id]
 * Client approves or rejects a pending scope change.
 *
 * Body: { action: 'approve'|'reject', reason?: string }
 * Auth: requirePortalUser; must own the order (auth.profileId === order.client_id)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; scope_change_id: string }> }
) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId, scope_change_id: scopeChangeId } = await params
  if (!orderId || !scopeChangeId) return fail('Order id and scope_change_id are required.', 400)

  const body = await req.json().catch(() => ({}))
  const action: string = body.action
  const reason: string | undefined = body.reason

  if (!['approve', 'reject'].includes(action)) return fail('action must be approve or reject.', 422)

  const warnings: string[] = []

  // Ownership check
  let order: any
  try {
    const { data, error } = await db.from('orders').select('id, client_id').eq('id', orderId).single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  if (order.client_id !== profileId) return fail('Forbidden', 403)

  // Verify scope change exists, belongs to order, and is pending
  let sc: any
  try {
    const { data, error } = await db
      .from('order_scope_changes')
      .select('*')
      .eq('id', scopeChangeId)
      .eq('order_id', orderId)
      .single() as any
    if (error || !data) return fail('Scope change not found.', 404)
    sc = data
  } catch (err: any) {
    return fail(err.message || 'Scope change load failed.', 500)
  }

  if (sc.status !== 'pending') return fail(`Scope change already ${sc.status}.`, 409)

  const nowIso = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  try {
    const { error: updErr } = await db
      .from('order_scope_changes')
      .update({
        status: newStatus,
        client_decision_at: nowIso,
        client_decision_by: profileId,
        client_reason: reason || null,
        updated_at: nowIso,
      })
      .eq('id', scopeChangeId)
    if (updErr) return fail(updErr.message, 500)
  } catch (err: any) {
    return fail(err.message || 'Scope change update failed.', 500)
  }

  // Apply scope change if approved — RPC handles escrow_events insert
  let rpcResult: any = null
  if (action === 'approve') {
    try {
      const { data, error } = await db.rpc('apply_scope_change', { p_scope_change_id: scopeChangeId }) as any
      if (error) {
        warnings.push(`apply_scope_change_failed: ${error.message}`)
      } else {
        rpcResult = data
        if (rpcResult?.error) warnings.push(`apply_scope_change: ${rpcResult.error}`)
      }
    } catch (err: any) {
      warnings.push(`apply_scope_change_failed: ${err.message}`)
    }
  }

  let refetched: any = null
  try {
    const { data } = await db.from('order_scope_changes').select('*').eq('id', scopeChangeId).single() as any
    refetched = data
  } catch { warnings.push('scope_change_refetch_failed') }

  return ok({ scope_change: refetched, action, rpc_result: rpcResult }, {}, warnings.length ? { data_warnings: warnings } : {})
}
