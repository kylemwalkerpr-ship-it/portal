import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id: order_id } = await context.params
  const { db, profileId } = auth

  let body: { note?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  const noteText = body.note?.trim()
  if (!noteText) return fail('note must be a non-empty string', 422)

  // Load order to get current status
  const { data: order, error: loadErr } = await db
    .from('orders')
    .select('id, status')
    .eq('id', order_id)
    .single()

  if (loadErr || !order) return fail('Order not found', 404)

  const currentStatus = (order as any).status
  const fullNote = `[Admin note] ${noteText}`

  // Insert order_event
  const { data: event, error: eventErr } = await db
    .from('order_events')
    .insert({
      order_id,
      actor_id: profileId,
      actor_role: 'admin',
      from_status: currentStatus,
      to_status: currentStatus,
      note: fullNote,
    })
    .select('id')
    .single()

  if (eventErr) return fail(eventErr.message, 500)

  // Insert audit log
  await db.from('admin_audit_log').insert({
    admin_id: profileId,
    action_type: 'add_note',
    target_table: 'orders',
    target_id: order_id,
    payload_snapshot: { note: noteText },
    reason: noteText,
  })

  return ok({ ok: true, event_id: (event as any).id })
}
