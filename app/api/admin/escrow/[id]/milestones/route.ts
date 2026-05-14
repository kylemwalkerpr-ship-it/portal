/**
 * GET   /api/admin/escrow/[id]/milestones — list milestones for this order
 * POST  /api/admin/escrow/[id]/milestones — create a new milestone
 *   body: { sequence, title, description?, amount, due_date? }
 * PATCH /api/admin/escrow/[id]/milestones?milestone_id=… — update milestone status
 *   body: { status, rejection_reason? }
 *   Transitions: pending↔in_progress, in_progress→submitted,
 *                submitted→approved|rejected, approved→released (release_milestone RPC)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const VALID_STATUSES = ['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'released', 'cancelled']

const TRANSITIONS: Record<string, string[]> = {
  pending:     ['in_progress', 'cancelled'],
  in_progress: ['pending', 'submitted', 'cancelled'],
  submitted:   ['approved', 'rejected'],
  rejected:    ['in_progress'],
  approved:    ['released'],
  released:    [],
  cancelled:   [],
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  try {
    const { data, error } = await db
      .from('order_milestones')
      .select('*')
      .eq('order_id', orderId)
      .order('sequence', { ascending: true }) as any
    if (error) return fail(error.message, 500)
    return ok({ milestones: data ?? [] })
  } catch (err: any) {
    return fail(err.message || 'Milestone load failed.', 500)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const { sequence, title, description, amount, due_date } = body

  if (!Number.isFinite(Number(sequence))) return fail('sequence is required.', 422)
  if (!title) return fail('title is required.', 422)
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) return fail('amount must be >= 0.', 422)

  const warnings: string[] = []

  // Verify order exists
  try {
    const { data, error } = await db.from('orders').select('id').eq('id', orderId).single() as any
    if (error || !data) return fail('Order not found.', 404)
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  let created: any = null
  try {
    const { data, error } = await db
      .from('order_milestones')
      .insert({
        order_id: orderId,
        sequence: Number(sequence),
        title,
        description: description || null,
        amount: Number(amount),
        due_date: due_date || null,
      })
      .select('*')
      .single() as any
    if (error) return fail(error.message, 500)
    created = data
  } catch (err: any) {
    return fail(err.message || 'Milestone create failed.', 500)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_milestone_create',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { milestone: created },
      reason: 'Admin created milestone',
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  return ok({ milestone: created }, {}, warnings.length ? { data_warnings: warnings } : {})
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const milestoneId = new URL(req.url).searchParams.get('milestone_id')
  if (!milestoneId) return fail('milestone_id query param is required.', 400)

  const body = await req.json().catch(() => ({}))
  const newStatus: string = body.status
  const rejectionReason: string | undefined = body.rejection_reason

  if (!VALID_STATUSES.includes(newStatus)) return fail('Invalid status.', 422)

  const warnings: string[] = []

  // Load milestone
  let milestone: any
  try {
    const { data, error } = await db
      .from('order_milestones')
      .select('*')
      .eq('id', milestoneId)
      .eq('order_id', orderId)
      .single() as any
    if (error || !data) return fail('Milestone not found.', 404)
    milestone = data
  } catch (err: any) {
    return fail(err.message || 'Milestone load failed.', 500)
  }

  const allowed = TRANSITIONS[milestone.status] || []
  if (!allowed.includes(newStatus)) {
    return fail(`Invalid transition: ${milestone.status} → ${newStatus}`, 409)
  }

  // approved → released uses the RPC
  if (newStatus === 'released') {
    let rpcResult: any = null
    try {
      const { data, error } = await db.rpc('release_milestone', {
        p_milestone_id: milestoneId,
        p_actor_id: profileId,
      }) as any
      if (error) return fail(`release_milestone failed: ${error.message}`, 500)
      rpcResult = data
      if (rpcResult?.error) return fail(`release_milestone: ${rpcResult.error}`, 409)
    } catch (err: any) {
      return fail(err.message || 'release_milestone RPC failed.', 500)
    }

    try {
      await db.from('admin_audit_log').insert({
        admin_id: profileId,
        action_type: 'escrow_milestone_release',
        target_table: 'orders',
        target_id: orderId,
        payload_snapshot: { milestone_id: milestoneId, rpc_result: rpcResult },
        reason: body.reason || 'Admin released milestone',
      })
    } catch (err: any) {
      warnings.push(`audit_log_failed: ${err.message}`)
    }

    // Refetch
    let refetched: any = null
    try {
      const { data } = await db.from('order_milestones').select('*').eq('id', milestoneId).single() as any
      refetched = data
    } catch { warnings.push('milestone_refetch_failed') }

    return ok({ milestone: refetched, rpc_result: rpcResult }, {}, warnings.length ? { data_warnings: warnings } : {})
  }

  // Generic transition update
  const nowIso = new Date().toISOString()
  const update: Record<string, any> = { status: newStatus, updated_at: nowIso }

  if (newStatus === 'submitted') update.submitted_at = nowIso
  if (newStatus === 'approved') { update.approved_at = nowIso; update.approved_by = profileId }
  if (newStatus === 'rejected') {
    update.rejected_at = nowIso
    update.rejection_reason = rejectionReason || null
  }

  try {
    const { error: updErr } = await db
      .from('order_milestones')
      .update(update)
      .eq('id', milestoneId)
    if (updErr) return fail(updErr.message, 500)
  } catch (err: any) {
    return fail(err.message || 'Milestone update failed.', 500)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_milestone_update',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { milestone_id: milestoneId, previous_status: milestone.status, new_status: newStatus },
      reason: body.reason || `Admin transitioned milestone to ${newStatus}`,
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  let refetched: any = null
  try {
    const { data } = await db.from('order_milestones').select('*').eq('id', milestoneId).single() as any
    refetched = data
  } catch { warnings.push('milestone_refetch_failed') }

  return ok({ milestone: refetched }, {}, warnings.length ? { data_warnings: warnings } : {})
}
