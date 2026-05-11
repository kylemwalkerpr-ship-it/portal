import { getCurrentStudent } from '@/lib/student'
import { messageBodyFromFormData } from '@/lib/messageAttachments'

export async function GET(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const orderId = url.searchParams.get('orderId')
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id')
    .eq('id', orderId)
    .eq('client_id', auth.profile.id)
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
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const contentType = req.headers.get('content-type') || ''
  let orderId = ''
  let text = ''
  let form: FormData | null = null
  if (contentType.includes('multipart/form-data')) {
    try {
      form = await req.formData()
      orderId = String(form.get('orderId') || '').trim()
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Expected multipart/form-data' }, { status: 400 })
    }
  } else {
    const body = await req.json().catch(() => ({}))
    orderId = String(body.orderId || '').trim()
    text = String(body.body || '').trim()
  }
  if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 })
  if (!form && !text) return Response.json({ error: 'body or file is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id')
    .eq('id', orderId)
    .eq('client_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  if (form) {
    try {
      text = await messageBodyFromFormData(form, auth.db, `orders/${orderId}`)
    } catch (err) {
      const status = (err as Error & { status?: number }).status || 500
      return Response.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, { status })
    }
    if (!text) return Response.json({ error: 'body or file is required' }, { status: 400 })
  }

  const { data, error } = await auth.db
    .from('order_messages')
    .insert({
      order_id: orderId,
      sender_id: auth.profile.id,
      sender_role: 'client',
      body: text,
    })
    .select('id, sender_id, sender_role, body, created_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ message: data })
}
