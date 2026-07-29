import { getCurrentConsultant } from '@/lib/consultant'
import { messageBodyFromFormData } from '@/lib/messageAttachments'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi } from '@/lib/fiverr'
import { safetyGuard } from '@/lib/safety'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
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

  const [{ data, error }, { data: offers, error: offersError }, { data: unifiedOffers }, settings] = await Promise.all([
    auth.db
      .from('order_messages')
      .select('id, sender_id, sender_role, body, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    auth.db
      .from('consultant_offers')
      .select('*')
      .eq('order_id', orderId)
      .eq('consultant_id', auth.consultant.id)
      .order('created_at', { ascending: false }),
    auth.db
      .from('offers')
      .select('*')
      .eq('chat_id', orderId)
      .eq('sender_id', auth.profile.id)
      .eq('sender_type', 'consultant')
      .order('created_at', { ascending: false }),
    getPaymentSettingsForApi(),
  ])
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (offersError && !/does not exist|schema cache/i.test(offersError.message)) {
    return Response.json({ error: offersError.message }, { status: 500 })
  }

  const normalized = (unifiedOffers ?? []).map((o) => {
    const effectivePrice = Number(o.discounted_price || o.price || 0)
    const platformFee = computePlatformFeeCents(effectivePrice, 'consultant', settings)
    const payout = computeNetPayoutCents(effectivePrice, 'consultant', settings)
    return {
    id: o.id,
    source_type: 'unified_offer',
    title: o.title,
    description: o.description,
    original_price: Number(o.price || 0) / 100,
    price: effectivePrice / 100,
    platform_fee: platformFee / 100,
    platform_fee_percent_snapshot: settings.platform_fee_percent,
    consultant_payout: payout / 100,
    consultant_fee_percent_snapshot: settings.consultant_fee_percent,
    delivery_days: o.delivery_days,
    revision_count: o.revisions,
    status: o.status === 'pending' ? 'sent' : o.status === 'cancelled' ? 'withdrawn' : o.status,
    expires_at: o.expires_at,
    created_at: o.created_at,
    }
  })
  return Response.json({ messages: data ?? [], offers: [...normalized, ...((offers ?? []).map((o) => ({ ...o, source_type: 'consultant_offer' })))] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const postAbortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', postAbortHandler)

  try {
  const auth = await getCurrentConsultant()
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
    .select('id, consultant_id, client_id')
    .eq('id', orderId)
    .eq('consultant_id', auth.profile.id)
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

  {
    const s = safetyGuard(text)
    if (!s.ok) return Response.json({ error: s.error, violations: s.violations }, { status: 422 })
  }

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

  const counterpart = (order as any).client_id
  if (counterpart) {
    const { mirrorMessage } = await import('@/lib/conversations')
    await mirrorMessage(auth.db, {
      participantA: auth.profile.id,
      participantB: counterpart,
      senderId:     auth.profile.id,
      body:         text,
      contextKind:  'order',
      contextId:    orderId,
      refOrderId:   orderId,
      refMessageId: (data as any).id,
    })
  }

  return Response.json({ message: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', postAbortHandler)
  }
}
