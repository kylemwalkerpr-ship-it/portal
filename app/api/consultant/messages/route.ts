import { getCurrentConsultant } from '@/lib/consultant'

export async function GET(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const orderId = url.searchParams.get('orderId')
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, consultant_id, client_id')
    .eq('id', orderId)
    .eq('consultant_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  const { data, error } = await auth.db
    .from('order_messages')
    .select('id, sender_id, sender_role, body, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ messages: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const orderId = String(body.orderId || '').trim()
  const text = String(body.body || '').trim()
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 })
  if (!text) return Response.json({ error: 'body is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, consultant_id')
    .eq('id', orderId)
    .eq('consultant_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  const { data, error } = await auth.db
    .from('order_messages')
    .insert({
      order_id: orderId,
      sender_id: auth.profile.id,
      sender_role: 'consultant',
      body: text,
    })
    .select('id, sender_id, sender_role, body, created_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ message: data })
}
