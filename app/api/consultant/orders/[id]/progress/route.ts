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
  if (progress >= 90 && ['active', 'in_progress'].includes(order.status)) payload.status = 'under_review'
  else if (progress > 0 && ['pending', 'queued', 'created', 'new'].includes(order.status)) payload.status = 'in_progress'

  // Conditional update: only progress the order if it is STILL in the state we
  // read. If the client cancels between the read and this write, zero rows
  // match and we return 409 — a cancelled order can never be brought back to
  // 'in_progress'/'under_review' by a stale progress save.
  const { data, error } = await auth.db
    .from('orders')
    .update(payload)
    .eq('id', id)
    .eq('status', order.status)
    .select('*')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Order status changed by another request — refresh and try again.' }, { status: 409 })

  return Response.json({ order: data })
}
