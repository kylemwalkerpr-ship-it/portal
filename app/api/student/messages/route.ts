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

  const [{ data, error }, { data: offers, error: offersError }, { data: unifiedOffers }] = await Promise.all([
    auth.db
      .from('order_messages')
      .select('id, sender_id, sender_role, body, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    auth.db
      .from('consultant_offers')
      .select('*')
      .eq('order_id', orderId)
      .eq('client_profile_id', auth.profile.id)
      .order('created_at', { ascending: false }),
    auth.db
      .from('offers')
      .select('*')
      .eq('chat_id', orderId)
      .eq('recipient_id', auth.profile.id)
      .eq('sender_type', 'consultant')
      .order('created_at', { ascending: false }),
  ])
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (offersError && !/does not exist|schema cache/i.test(offersError.message)) {
    return Response.json({ error: offersError.message }, { status: 500 })
  }

  const normalized = (unifiedOffers ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    original_price: Number(o.price || 0) / 100,
    price: Number(o.discounted_price || o.price || 0) / 100,
    delivery_days: o.delivery_days,
    revision_count: o.revisions,
    status: o.status === 'pending' ? 'sent' : o.status,
    expires_at: o.expires_at,
    created_at: o.created_at,
  }))
  return Response.json({ messages: data ?? [], offers: [...normalized, ...(offers ?? [])] })
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
      text = await messageBodyFromFormData(form, auth.db, `orders/${orderId}`, auth.profile.id)
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
