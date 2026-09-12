import { getCurrentConsultant } from '@/lib/consultant'
import { recordOrderActivity } from '@/lib/orderActivityAudit'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note : 'Declined by consultant'

  const { data: order } = await auth.db
    .from('orders')
    .select('id, status, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  const { data, error } = await auth.db
    .from('orders')
    .update({ status: 'queued', consultant_id: null })
    .eq('id', id)
    .eq('status', order.status)
    .select('*')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Order status changed by another request — refresh and try again.' }, { status: 409 })

  await recordOrderActivity(auth.db, {
    orderId: id,
    actorId: auth.profile.id,
    actorRole: 'consultant',
    fromStatus: order.status,
    toStatus: 'queued',
    note,
  })

  return Response.json({ order: data })
}