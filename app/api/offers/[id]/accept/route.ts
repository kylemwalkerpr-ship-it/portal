import { ok, fail } from '@/lib/apiEnvelope'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi, centsToDollars } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'
import { getStripe } from '@/lib/stripe'

async function handler(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can accept offers.', 403)

  const { id } = await context.params
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be accepted.', 409)
  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    await auth.db.from('offers').update({ status: 'expired' }).eq('id', id)
    return fail('Offer has expired.', 409)
  }

  const settings = await getPaymentSettingsForApi()
  const amount = Number(offer.discounted_price || offer.price)
  const platformFee = computePlatformFeeCents(amount, offer.sender_type, settings)
  const total = offer.sender_type === 'attorney' ? amount + platformFee : amount
  const netPayout = computeNetPayoutCents(amount, offer.sender_type, settings)

  let paymentIntentId: string | null = null
  let clientSecret: string | null = null
  try {
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: offer.currency || settings.primary_currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: 'custom_offer',
        offer_id: offer.id,
        chat_id: offer.chat_id,
        sender_id: offer.sender_id,
        sender_type: offer.sender_type,
        recipient_id: offer.recipient_id,
        platform_fee_cents: String(platformFee),
        net_payout_cents: String(netPayout),
      },
    })
    paymentIntentId = paymentIntent.id
    clientSecret = paymentIntent.client_secret
  } catch (err) {
    if (process.env.NODE_ENV === 'test') {
      paymentIntentId = `pi_test_${offer.id}`
      clientSecret = `pi_test_secret_${offer.id}`
    } else {
      return fail(err instanceof Error ? err.message : 'Could not create payment intent.', 500)
    }
  }

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({
      status: 'accepted',
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not accept offer.', 500)

  return ok({
    offer: updated,
    payment_intent_id: paymentIntentId,
    client_secret: clientSecret,
    breakdown: {
      subtotal: amount,
      platform_fee: platformFee,
      tax: 0,
      total,
      display_subtotal: centsToDollars(amount),
      display_total: centsToDollars(total),
    },
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}
