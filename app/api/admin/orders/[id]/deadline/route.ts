import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id: order_id } = await context.params
  const { db, profileId } = auth

  let body: { deadline?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  const { deadline, reason } = body
  if (!deadline) return fail('deadline is required', 422)
  if (isNaN(Date.parse(deadline))) return fail('deadline must be a valid ISO date string', 422)

  // Load order
  const { data: order, error: loadErr } = await db
    .from('orders')
    .select('id, status, delivery_deadline')
    .eq('id', order_id)
    .single()

  if (loadErr || !order) return fail('Order not found', 404)

  const terminalStatuses = ['cancelled', 'refunded']
  if (terminalStatuses.includes((order as any).status)) {
    return fail(`Cannot extend deadline on a ${(order as any).status} order`, 422)
  }

  // Update deadline
  const { data: updated, error: updateErr } = await db
    .from('orders')
    .update({ delivery_deadline: deadline, updated_at: new Date().toISOString() })
    .eq('id', order_id)
    .select('*')
    .single()

  if (updateErr) return fail(updateErr.message, 500)

  const note = reason
    ? `Admin extended deadline to ${deadline}: ${reason}`
    : `Admin extended deadline to ${deadline}`

  // Insert order_event
  await db.from('order_events').insert({
    order_id,
    actor_id: profileId,
    actor_role: 'admin',
    from_status: (order as any).status,
    to_status: (order as any).status,
    note,
  })

  // Insert audit log
  await db.from('admin_audit_log').insert({
    admin_id: profileId,
    action_type: 'extend_deadline',
    target_table: 'orders',
    target_id: order_id,
    payload_snapshot: { before: { delivery_deadline: (order as any).delivery_deadline }, after: { delivery_deadline: deadline }, reason },
    reason: note,
  })

  return ok({ order: updated })
}
