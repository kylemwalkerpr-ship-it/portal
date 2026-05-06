import { getCurrentConsultant } from '@/lib/consultant'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const raw = Number(body.progress)
  if (!Number.isFinite(raw)) return Response.json({ error: 'progress must be a number' }, { status: 400 })
  const progress = Math.max(0, Math.min(100, Math.round(raw)))

  const { data: order } = await auth.db
    .from('orders')
    .select('id, status, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  const payload: Record<string, unknown> = { progress }
  if (progress >= 90 && order.status === 'active') payload.status = 'review'
  else if (progress > 0 && order.status === 'pending') payload.status = 'active'

  const { data, error } = await auth.db
    .from('orders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ order: data })
}
