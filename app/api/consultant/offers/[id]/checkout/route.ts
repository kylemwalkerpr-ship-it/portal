import { getStripe } from '@/lib/stripe'
import { getCurrentStudent } from '@/lib/student'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: offer } = await auth.db
    .from('consultant_offers')
    .select('id, order_id, consultant_id, consultant_profile_id, client_profile_id, title, description, price, platform_fee, consultant_payout, currency, delivery_days, status, expires_at')
    .eq('id', id)
    .single()
  if (!offer) return Response.json({ error: 'Offer not found.' }, { status: 404 })
  if (offer.client_profile_id !== auth.profile.id) return Response.json({ error: 'Forbidden.' }, { status: 403 })
  if (offer.status !== 'sent') return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    await auth.db.from('consultant_offers').update({ status: 'expired' }).eq('id', id)
    return Response.json({ error: 'Offer has expired.' }, { status: 410 })
  }

  const body = await req.json().catch(() => ({}))
  const origin = req.headers.get('origin') || 'https://portal.yousafeconsultancy.com'
  const successUrl = body.return_url || `${origin}/dashboard?consultant_offer_paid=${offer.id}`
  const cancelUrl = body.cancel_url || `${origin}/dashboard?consultant_offer_cancelled=${offer.id}`
  const amountCents = Math.round(Number(offer.price) * 100)
  if (amountCents < 100) return Response.json({ error: 'Offer price is invalid.' }, { status: 400 })

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: auth.profile.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(offer.currency || 'usd').toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: offer.title,
            description: offer.description?.slice(0, 500) || undefined,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      consultant_offer_id: offer.id,
      source_order_id: offer.order_id,
      consultant_id: offer.consultant_id,
      consultant_profile_id: offer.consultant_profile_id,
      client_profile_id: auth.profile.id,
      delivery_days: String(offer.delivery_days),
      platform_fee: String(offer.platform_fee || 0),
      consultant_payout: String(offer.consultant_payout || 0),
    },
  })

  await auth.db.from('consultant_offers').update({ stripe_session_id: session.id }).eq('id', id)

  return Response.json({ url: session.url, session_id: session.id })
}
