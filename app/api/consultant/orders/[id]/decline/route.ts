import { getCurrentConsultant } from '@/lib/consultant'

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
    .select('*')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  await auth.db.from('order_status_history').insert({
    order_id: id,
    from_status: order.status,
    to_status: 'queued',
    changed_by_id: auth.profile.id,
    note,
  })

  return Response.json({ order: data })
}
