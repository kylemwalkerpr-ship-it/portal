import { requireAttorney } from '@/lib/attorneyAuth'
import { messageBodyFromFormData } from '@/lib/messageAttachments'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  const contentType = req.headers.get('content-type') || ''
  let text = ''
  let form: FormData | null = null
  if (contentType.includes('multipart/form-data')) {
    try {
      form = await req.formData()
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Expected multipart/form-data' }, { status: 400 })
    }
  } else {
    const body = await req.json().catch(() => ({}))
    text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''
  }
  if (!form && !text) return Response.json({ error: 'Message body or file required.' }, { status: 400 })

  const { data: order } = await ctx.db
    .from('orders')
    .select('id, client_id, consultant_id')
    .eq('id', id)
    .single()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consultant_id !== ctx.profileId) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  if (form) {
    try {
      text = await messageBodyFromFormData(form, ctx.db, `orders/${id}`, ctx.profileId)
    } catch (err) {
      const status = (err as Error & { status?: number }).status || 500
      return Response.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, { status })
    }
    if (!text) return Response.json({ error: 'Message body or file required.' }, { status: 400 })
  }

  const { data: msg, error: insErr } = await ctx.db
    .from('order_messages')
    .insert({ order_id: id, sender_id: ctx.profileId, sender_role: 'consultant', body: text })
    .select('id, sender_id, sender_role, body, created_at')
    .single()
  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send.' }, { status: 500 })

  // Mirror into the unified inbox (best-effort).
  if ((order as any).client_id) {
    const { mirrorMessage } = await import('@/lib/conversations')
    await mirrorMessage(ctx.db, {
      participantA: ctx.profileId,
      participantB: (order as any).client_id,
      senderId:     ctx.profileId,
      body:         String(text || ''),
      contextKind:  'order',
      contextId:    id,
      refOrderId:   id,
      refMessageId: (msg as any).id,
    })
  }

  return Response.json({ message: msg })
}
