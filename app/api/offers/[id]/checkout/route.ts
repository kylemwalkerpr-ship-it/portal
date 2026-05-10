import { getStripe } from '@/lib/stripe'
import { requireClient } from '@/lib/clientAuth'

// ABA-compliant payment: client pays attorney_fee + platform_fee in one
// Stripe charge. Stripe destination charge routes the FULL attorney_fee to
// the attorney's Connect account; the platform_fee is the application_fee.
// No fee splitting of the attorney's own fee.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id: offerId } = await context.params

  const { data: offer } = await ctx.db
    .from('attorney_offers')
    .select('id, inquiry_id, attorney_id, attorney_profile_id, attorney_stripe_account_id, client_email, client_profile_id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at')
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

  if (!offer.attorney_stripe_account_id) {
    return Response.json({ error: 'Attorney is not configured for payouts.' }, { status: 412 })
  }

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
  const attorneyFee = Number(offer.price)
  const platformFee = Number(offer.platform_fee || 0)
  const total = attorneyFee + platformFee
  const totalCents = Math.round(total * 100)
  const platformFeeCents = Math.round(platformFee * 100)
  const currency = (offer.currency || 'usd').toLowerCase()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: ctx.email,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: totalCents,
          product_data: {
            name: offer.title,
            description: `${offer.description.slice(0, 400)}\n\nIncludes a $${platformFee.toFixed(2)} platform fee (${offer.platform_fee_percent_snapshot}%). The attorney's fee of $${attorneyFee.toFixed(2)} is paid in full to them.`,
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: offer.attorney_stripe_account_id },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      offer_id: offer.id,
      inquiry_id: offer.inquiry_id,
      attorney_id: offer.attorney_id,
      attorney_profile_id: offer.attorney_profile_id,
      client_profile_id: ctx.profileId,
      delivery_days: String(offer.delivery_days),
      attorney_fee: String(attorneyFee),
      platform_fee: String(platformFee),
    },
  })

  await ctx.db
    .from('attorney_offers')
    .update({ stripe_session_id: session.id })
    .eq('id', offerId)

  return Response.json({ url: session.url, session_id: session.id })
}
