/**
 * GET  /api/admin/escrow/[id]/scope-changes — list scope changes for this order
 * POST /api/admin/escrow/[id]/scope-changes — admin approves/rejects on behalf of client
 *   body: { scope_change_id, action: 'approve'|'reject', reason? }
 *   approve → updates scope_change.status, then calls apply_scope_change RPC
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  try {
    const { data, error } = await db
      .from('order_scope_changes')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }) as any
    if (error) return fail(error.message, 500)
    return ok({ scope_changes: data ?? [] })
  } catch (err: any) {
    return fail(err.message || 'Scope changes load failed.', 500)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const scopeChangeId: string = body.scope_change_id
  const action: string = body.action
  const reason: string | undefined = body.reason

  if (!scopeChangeId) return fail('scope_change_id is required.', 422)
  if (!['approve', 'reject'].includes(action)) return fail('action must be approve or reject.', 422)

  const warnings: string[] = []

  // Verify scope change belongs to this order and is pending
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

  // If approved, apply the scope change via RPC
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

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: action === 'approve' ? 'scope_change_approve' : 'scope_change_reject',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { scope_change_id: scopeChangeId, action, rpc_result: rpcResult },
      reason: reason || `Admin ${action} scope change on behalf of client`,
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  let refetched: any = null
  try {
    const { data } = await db.from('order_scope_changes').select('*').eq('id', scopeChangeId).single() as any
    refetched = data
  } catch { warnings.push('scope_change_refetch_failed') }

  return ok({ scope_change: refetched, action, rpc_result: rpcResult }, {}, warnings.length ? { data_warnings: warnings } : {})
}
