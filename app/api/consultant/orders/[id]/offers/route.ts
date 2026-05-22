import { getCurrentConsultant } from '@/lib/consultant'
import { calculateOfferPricing, validateOfferInput } from '@/lib/offerPricing'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id: orderId } = await context.params
  const body = await req.json().catch(() => ({}))
  const parsed = validateOfferInput(body)
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id, consultant_id, status')
    .eq('id', orderId)
    .eq('consultant_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
  if (['cancelled', 'completed', 'released'].includes(String(order.status))) {
    return Response.json({ error: `Order is ${order.status}.` }, { status: 409 })
  }

  const pricing = await calculateOfferPricing('consultant', parsed.price, body.discount_percent)
  const expiresInDays = Number.isFinite(Number(body.expires_in_days)) ? Number(body.expires_in_days) : 7
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: offer, error } = await auth.db
    .from('consultant_offers')
    .insert({
      order_id: orderId,
      consultant_id: auth.consultant.id,
      consultant_profile_id: auth.profile.id,
      client_profile_id: order.client_id,
      title: parsed.title,
      description: parsed.description,
      original_price: pricing.originalPrice,
      price: pricing.price,
      discount_percent: pricing.discountPercent,
      platform_fee: pricing.platformFee,
      platform_fee_percent_snapshot: pricing.platformFeePercent,
      consultant_payout: pricing.providerPayout,
      consultant_fee_percent_snapshot: pricing.providerPayoutPercent,
      currency: pricing.currency,
      delivery_days: parsed.deliveryDays,
      revision_count: parsed.revisionCount,
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error || !offer) return Response.json({ error: error?.message || 'Could not create offer.' }, { status: 500 })

  await auth.db.from('order_messages').insert({
    order_id: orderId,
    sender_id: auth.profile.id,
    sender_role: 'system',
    body: `New consultant offer: "${parsed.title}" — $${pricing.price.toFixed(2)} total · ${pricing.providerPayoutPercent}% consultant payout · ${parsed.deliveryDays} day delivery`,
  })

  return Response.json({ offer })
}
