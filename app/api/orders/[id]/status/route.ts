import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const PROVIDER_TRANSITIONS: Record<string, string[]> = {
  created: ['in_progress', 'cancelled'],
  in_progress: ['under_review', 'cancelled'],
  revision_requested: ['in_progress', 'under_review', 'cancelled'],
}

const STUDENT_TRANSITIONS: Record<string, string[]> = {
  under_review: ['completed', 'revision_requested'],
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const nextStatus = String(body.status || '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 1200) : null

  const { data: order, error } = await auth.db.from('orders').select('*').eq('id', id).single()
  if (error || !order) return fail(error?.message || 'Order not found.', 404)

  const isStudent = order.client_id === auth.profileId
  const isProvider = order.consultant_id === auth.profileId || order.attorney_id === auth.profileId
  if (!isStudent && !isProvider && auth.role !== 'admin') return fail('Forbidden.', 403)

  const current = String(order.status || 'created')
  const allowed = auth.role === 'admin'
    ? true
    : isProvider
      ? (PROVIDER_TRANSITIONS[current] || []).includes(nextStatus)
      : (STUDENT_TRANSITIONS[current] || []).includes(nextStatus)
  if (!allowed) return fail(`Cannot move order from ${current} to ${nextStatus}.`, 409)

  const payload: Record<string, unknown> = {
    status: nextStatus,
    status_updated_at: new Date().toISOString(),
  }
  if (nextStatus === 'completed') payload.completed_at = new Date().toISOString()
  if (nextStatus === 'cancelled') payload.cancelled_at = new Date().toISOString()
  if (nextStatus === 'revision_requested') payload.revision_reason = note

  const { data: updated, error: updErr } = await auth.db
    .from('orders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (updErr || !updated) return fail(updErr?.message || 'Could not update order.', 500)

  await auth.db.from('order_events').insert({
    order_id: id,
    actor_id: auth.profileId,
    actor_role: auth.role,
    from_status: current,
    to_status: nextStatus,
    note,
  })

  return ok({ order: updated })
}
