import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: order } = await ctx.db
    .from('orders')
    .select('id, client_id, consultant_id, status, escrow_status, total_amount, attorney_fee, platform_fee, requirements, progress, deadline, created_at, completed_at, source_offer_id, source_inquiry_id, payout_status, stripe_payment_intent_id')
    .eq('id', id)
    .single()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
  if (order.consultant_id !== ctx.profileId) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const [{ data: client }, { data: offer }, { data: messages }, { data: files }] = await Promise.all([
    ctx.db.from('profiles').select('id, full_name, email').eq('id', order.client_id).single(),
    order.source_offer_id
      ? ctx.db
          .from('attorney_offers')
          .select('id, title, description, delivery_days, expires_at')
          .eq('id', order.source_offer_id)
          .single()
      : Promise.resolve({ data: null }),
    ctx.db
      .from('order_messages')
      .select('id, sender_id, sender_role, body, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('order_files')
      .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ])

  return Response.json({
    order: {
      ...order,
      client_name: client?.full_name || client?.email?.split('@')[0] || 'Client',
      client_email: client?.email,
      offer,
    },
    messages: messages ?? [],
    files: files ?? [],
  })
}
