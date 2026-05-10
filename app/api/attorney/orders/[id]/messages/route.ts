import { requireAttorney } from '@/lib/attorneyAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  let body: { body?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''
  if (!text) return Response.json({ error: 'Message body required.' }, { status: 400 })

  const { data: order } = await ctx.db
    .from('orders')
    .select('id, consultant_id')
    .eq('id', id)
    .single()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consultant_id !== ctx.profileId) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const { data: msg, error: insErr } = await ctx.db
    .from('order_messages')
    .insert({ order_id: id, sender_id: ctx.profileId, sender_role: 'consultant', body: text })
    .select('id, sender_id, sender_role, body, created_at')
    .single()
  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send.' }, { status: 500 })
  return Response.json({ message: msg })
}
