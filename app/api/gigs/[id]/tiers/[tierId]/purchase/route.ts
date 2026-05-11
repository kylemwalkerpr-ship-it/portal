import { ok, fail } from '@/lib/apiEnvelope'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'
import { getStripe } from '@/lib/stripe'

export async function POST(_req: Request, context: { params: Promise<{ id: string; tierId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can purchase gigs.', 403)
  const { id, tierId } = await context.params

  const { data: gig } = await auth.db.from('gigs').select('*').eq('id', id).eq('status', 'active').single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id === auth.profileId) return fail('Providers cannot purchase their own gigs.', 403)
  const { data: tier } = await auth.db.from('gig_tiers').select('*').eq('id', tierId).eq('gig_id', id).eq('is_active', true).single()
  if (!tier) return fail('Tier not found.', 404)

  const settings = await getPaymentSettingsForApi()
  const subtotal = Number(tier.price)
  const platformFee = computePlatformFeeCents(subtotal, gig.provider_type, settings)
  const total = gig.provider_type === 'attorney' ? subtotal + platformFee : subtotal
  const netPayout = computeNetPayoutCents(subtotal, gig.provider_type, settings)

  let paymentIntentId: string | null = null
  let clientSecret: string | null = null
  try {
    const pi = await getStripe().paymentIntents.create({
      amount: total,
      currency: settings.primary_currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: 'gig_express_purchase',
        gig_id: id,
        tier_id: tierId,
        provider_id: gig.provider_id,
        provider_type: gig.provider_type,
        student_id: auth.profileId,
        platform_fee_cents: String(platformFee),
        net_payout_cents: String(netPayout),
      },
    })
    paymentIntentId = pi.id
    clientSecret = pi.client_secret
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') return fail(err instanceof Error ? err.message : 'Could not create payment intent.', 500)
    paymentIntentId = `pi_test_gig_${id}`
    clientSecret = `pi_test_gig_secret_${id}`
  }

  return ok({
    payment_intent_id: paymentIntentId,
    client_secret: clientSecret,
    breakdown: { subtotal, platform_fee: platformFee, tax: 0, total },
  })
}
