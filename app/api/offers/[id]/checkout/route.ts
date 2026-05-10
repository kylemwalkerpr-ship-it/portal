import { getStripe } from '@/lib/stripe'
import { requireClient } from '@/lib/clientAuth'


// Create a Stripe Checkout Session for accepting a custom attorney offer.
// On `checkout.session.completed`, the existing webhook (extended for offer
// metadata) creates the order and links it back to the offer.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id: offerId } = await context.params

  const { data: offer } = await ctx.db
    .from('attorney_offers')
    .select('id, inquiry_id, attorney_id, attorney_profile_id, client_email, client_profile_id, title, description, price, currency, delivery_days, status, expires_at')
    .eq('id', offerId)
    .single()

  if (!offer) return Response.json({ error: 'Offer not found.' }, { status: 404 })

  const ownsByProfile = offer.client_profile_id === ctx.profileId
  const ownsByEmail = offer.client_email === ctx.email
  if (!ownsByProfile && !ownsByEmail) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  if (offer.status !== 'sent') {
    return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })
  }
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    await ctx.db.from('attorney_offers').update({ status: 'expired' }).eq('id', offerId)
    return Response.json({ error: 'Offer has expired.' }, { status: 410 })
  }

  // Lazy-link the client profile_id if missing (anonymous → signed-in path).
  if (!ownsByProfile) {
    await ctx.db.from('attorney_offers').update({ client_profile_id: ctx.profileId }).eq('id', offerId)
  }

  let body: { return_url?: string; cancel_url?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const origin = req.headers.get('origin') || 'https://portal.yousafeconsultancy.com'
  const successUrl = body.return_url || `${origin}/dashboard?inquiry=${offer.inquiry_id}&offer_paid=${offer.id}`
  const cancelUrl = body.cancel_url || `${origin}/dashboard?inquiry=${offer.inquiry_id}&offer_cancelled=${offer.id}`

  const stripe = getStripe()
  const amountCents = Math.round(Number(offer.price) * 100)
  const currency = (offer.currency || 'usd').toLowerCase()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: ctx.email,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: offer.title,
            description: offer.description.slice(0, 500),
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      offer_id: offer.id,
      inquiry_id: offer.inquiry_id,
      attorney_id: offer.attorney_id,
      attorney_profile_id: offer.attorney_profile_id,
      client_profile_id: ctx.profileId,
      delivery_days: String(offer.delivery_days),
    },
  })

  await ctx.db
    .from('attorney_offers')
    .update({ stripe_session_id: session.id })
    .eq('id', offerId)

  return Response.json({ url: session.url, session_id: session.id })
}
