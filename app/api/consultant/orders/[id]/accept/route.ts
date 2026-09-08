import { getCurrentConsultant } from '@/lib/consultant'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('id, status, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
  if (!['new', 'pending', 'queued', 'created'].includes(order.status)) {
    return Response.json({ error: `Order is already ${order.status}` }, { status: 409 })
  }

  // Conditional update: only start the order if it is STILL in the state we
  // just read. A client cancellation (or another actor) that commits between
  // the read and this write matches zero rows -> 409, so a cancelled order can
  // never be resurrected to 'in_progress'.
  const { data, error } = await auth.db
    .from('orders')
    .update({ status: 'in_progress', status_updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', order.status)
    .select('*')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Order status changed by another request — refresh and try again.' }, { status: 409 })

  await auth.db.from('order_status_history').insert({
    order_id: id,
    from_status: order.status,
    to_status: 'in_progress',
    changed_by_id: auth.profile.id,
    note: 'Started by consultant',
  })

  return Response.json({ order: data })
}
