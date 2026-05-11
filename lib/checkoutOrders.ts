import Stripe from 'stripe'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi } from './fiverr'
import { getStripe } from './stripe'
import { getOrCreateStripeCustomer } from './stripeCustomer'

type Db = ReturnType<typeof import('./supabase').createSupabaseAdminClient>

export type CheckoutSourceType = 'unified_offer' | 'attorney_offer' | 'consultant_offer' | 'gig'

export type CheckoutItem = {
  sourceType: CheckoutSourceType
  sourceId: string
  title: string
  description: string
  currency: string
  subtotalCents: number
  platformFeeCents: number
  totalCents: number
  netPayoutCents: number
  providerProfileId: string
  providerType: 'attorney' | 'consultant'
  clientProfileId: string
  deliveryDays: number
  offerId?: string | null
  sourceOfferId?: string | null
  sourceConsultantOfferId?: string | null
  sourceInquiryId?: string | null
  gigId?: string | null
  tierId?: string | null
}

function sanitizeClientName(profile: Record<string, any> | null | undefined) {
  const raw = String(profile?.full_name || profile?.email?.split('@')[0] || 'Client')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return raw || 'Client'
}

async function nextOrderIdentity(db: Db, clientProfileId: string) {
  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('id', clientProfileId)
    .maybeSingle()

  const { data } = await db
    .from('orders')
    .select('order_sequence')
    .order('order_sequence', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const sequence = Number(data?.order_sequence || 0) + 1
  const padded = String(sequence).padStart(3, '0')
  return {
    order_sequence: sequence,
    order_number: `Yousafe-Legal-${sanitizeClientName(profile)}-${padded}`,
  }
}

async function providerAttorneyId(db: Db, item: CheckoutItem) {
  if (item.providerType !== 'attorney') return null
  const { data } = await db.from('attorneys').select('id').eq('profile_id', item.providerProfileId).maybeSingle()
  return data?.id || null
}

export async function resolveCheckoutItem(
  db: Db,
  sourceType: CheckoutSourceType,
  sourceId: string,
  clientProfileId: string,
  tierId?: string,
): Promise<CheckoutItem | { error: string; status: number }> {
  const settings = await getPaymentSettingsForApi()

  if (sourceType === 'unified_offer') {
    const { data: offer } = await db.from('offers').select('*').eq('id', sourceId).single()
    if (!offer) return { error: 'Offer not found.', status: 404 }
    if (offer.recipient_id !== clientProfileId) return { error: 'Forbidden.', status: 403 }
    if (offer.status !== 'pending') return { error: `Offer is ${offer.status}.`, status: 409 }
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
      await db.from('offers').update({ status: 'expired' }).eq('id', sourceId)
      return { error: 'Offer has expired.', status: 409 }
    }

    const subtotalCents = Number(offer.discounted_price || offer.price || 0)
    const platformFeeCents = computePlatformFeeCents(subtotalCents, offer.sender_type, settings)
    const totalCents = offer.sender_type === 'attorney' ? subtotalCents + platformFeeCents : subtotalCents
    return {
      sourceType,
      sourceId,
      title: offer.title,
      description: offer.description,
      currency: String(offer.currency || settings.primary_currency || 'usd').toLowerCase(),
      subtotalCents,
      platformFeeCents,
      totalCents,
      netPayoutCents: computeNetPayoutCents(subtotalCents, offer.sender_type, settings),
      providerProfileId: offer.sender_id,
      providerType: offer.sender_type,
      clientProfileId: offer.recipient_id,
      deliveryDays: Number(offer.delivery_days || 1),
      offerId: offer.id,
      gigId: offer.gig_id || null,
    }
  }

  if (sourceType === 'attorney_offer') {
    const { data: offer } = await db
      .from('attorney_offers')
      .select('*')
      .eq('id', sourceId)
      .single()
    if (!offer) return { error: 'Offer not found.', status: 404 }
    if (offer.client_profile_id && offer.client_profile_id !== clientProfileId) return { error: 'Forbidden.', status: 403 }
    if (offer.status !== 'sent') return { error: `Offer is ${offer.status}.`, status: 409 }
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
      await db.from('attorney_offers').update({ status: 'expired' }).eq('id', sourceId)
      return { error: 'Offer has expired.', status: 409 }
    }

    const attorneyFeeCents = Math.round(Number(offer.price || 0) * 100)
    const platformFeeCents = Math.round(Number(offer.platform_fee || 0) * 100)
    return {
      sourceType,
      sourceId,
      title: offer.title,
      description: offer.description,
      currency: String(offer.currency || settings.primary_currency || 'usd').toLowerCase(),
      subtotalCents: attorneyFeeCents,
      platformFeeCents,
      totalCents: attorneyFeeCents + platformFeeCents,
      netPayoutCents: attorneyFeeCents,
      providerProfileId: offer.attorney_profile_id,
      providerType: 'attorney',
      clientProfileId,
      deliveryDays: Number(offer.delivery_days || 7),
      sourceOfferId: offer.id,
      sourceInquiryId: offer.inquiry_id || null,
    }
  }

  if (sourceType === 'consultant_offer') {
    const { data: offer } = await db.from('consultant_offers').select('*').eq('id', sourceId).single()
    if (!offer) return { error: 'Offer not found.', status: 404 }
    if (offer.client_profile_id !== clientProfileId) return { error: 'Forbidden.', status: 403 }
    if (offer.status !== 'sent') return { error: `Offer is ${offer.status}.`, status: 409 }
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
      await db.from('consultant_offers').update({ status: 'expired' }).eq('id', sourceId)
      return { error: 'Offer has expired.', status: 409 }
    }

    const totalCents = Math.round(Number(offer.price || 0) * 100)
    const platformFeeCents = Math.round(Number(offer.platform_fee || 0) * 100)
    const payoutCents = Math.round(Number(offer.consultant_payout || 0) * 100) || Math.max(0, totalCents - platformFeeCents)
    return {
      sourceType,
      sourceId,
      title: offer.title,
      description: offer.description,
      currency: String(offer.currency || settings.primary_currency || 'usd').toLowerCase(),
      subtotalCents: totalCents,
      platformFeeCents,
      totalCents,
      netPayoutCents: payoutCents,
      providerProfileId: offer.consultant_profile_id,
      providerType: 'consultant',
      clientProfileId,
      deliveryDays: Number(offer.delivery_days || 7),
      sourceConsultantOfferId: offer.id,
    }
  }

  const { data: gig } = await db.from('gigs').select('*').eq('id', sourceId).eq('status', 'active').single()
  if (!gig) return { error: 'Gig not found.', status: 404 }
  if (gig.provider_id === clientProfileId) return { error: 'Providers cannot purchase their own gigs.', status: 403 }
  const { data: tier } = await db
    .from('gig_tiers')
    .select('*')
    .eq('id', tierId || '')
    .eq('gig_id', sourceId)
    .eq('is_active', true)
    .single()
  if (!tier) return { error: 'Tier not found.', status: 404 }

  const subtotalCents = Number(tier.price || 0)
  const platformFeeCents = computePlatformFeeCents(subtotalCents, gig.provider_type, settings)
  const totalCents = gig.provider_type === 'attorney' ? subtotalCents + platformFeeCents : subtotalCents
  return {
    sourceType,
    sourceId,
    title: `${gig.title} - ${tier.tier || tier.title || 'package'}`,
    description: tier.description || gig.description || gig.pitch || '',
    currency: settings.primary_currency,
    subtotalCents,
    platformFeeCents,
    totalCents,
    netPayoutCents: computeNetPayoutCents(subtotalCents, gig.provider_type, settings),
    providerProfileId: gig.provider_id,
    providerType: gig.provider_type,
    clientProfileId,
    deliveryDays: Number(tier.delivery_days || 1),
    gigId: gig.id,
    tierId: tier.id,
  }
}

export async function createPaidOrder(
  db: Db,
  item: CheckoutItem,
  opts: {
    paymentIntentId?: string | null
    paymentMethod: 'stripe' | 'wallet' | 'saved_card'
    actorId?: string | null
    acceptedAt?: string
  },
) {
  if (opts.paymentIntentId) {
    const { data: existing } = await db
      .from('orders')
      .select('id')
      .eq('stripe_payment_intent_id', opts.paymentIntentId)
      .maybeSingle()
    if (existing?.id) return existing
  }

  if (item.offerId) {
    const { data: existing } = await db.from('orders').select('id').eq('offer_id', item.offerId).maybeSingle()
    if (existing?.id) return existing
  }
  if (item.sourceOfferId) {
    const { data: existing } = await db.from('orders').select('id').eq('source_offer_id', item.sourceOfferId).maybeSingle()
    if (existing?.id) return existing
  }
  if (item.sourceConsultantOfferId) {
    const { data: existing } = await db.from('orders').select('id').eq('source_consultant_offer_id', item.sourceConsultantOfferId).maybeSingle()
    if (existing?.id) return existing
  }

  const acceptedAt = opts.acceptedAt || new Date().toISOString()
  const deadline = new Date(Date.now() + item.deliveryDays * 24 * 60 * 60 * 1000).toISOString()
  const attorneyId = await providerAttorneyId(db, item)
  const identity = await nextOrderIdentity(db, item.clientProfileId).catch(() => null)

  const orderInsert: Record<string, unknown> = {
    client_id: item.clientProfileId,
    consultant_id: item.providerProfileId,
    attorney_id: attorneyId,
    status: 'created',
    escrow_status: 'held',
    total_amount: item.totalCents / 100,
    amount_paid: item.totalCents,
    platform_fee: item.platformFeeCents / 100,
    platform_fee_amount: item.platformFeeCents,
    consultant_payout_amount: item.netPayoutCents,
    attorney_fee: item.providerType === 'attorney' ? item.netPayoutCents / 100 : null,
    net_payout: item.netPayoutCents,
    payout_status: 'pending',
    requirements: item.description || item.title,
    terms_accepted_at: acceptedAt,
    refund_policy_accepted_at: acceptedAt,
    stripe_payment_intent_id: opts.paymentIntentId || null,
    deadline,
    delivery_deadline: deadline,
    offer_id: item.offerId || null,
    source_offer_id: item.sourceOfferId || null,
    source_consultant_offer_id: item.sourceConsultantOfferId || null,
    source_inquiry_id: item.sourceInquiryId || null,
    gig_id: item.gigId || null,
    ...(identity || {}),
  }

  let { data: order, error } = await db.from('orders').insert(orderInsert).select('id').single()
  if (error && /order_number|order_sequence|terms_accepted_at|refund_policy_accepted_at|stripe_payment_intent_id|amount_paid|net_payout|delivery_deadline|offer_id|gig_id|source_/i.test(error.message)) {
    for (const key of ['order_number', 'order_sequence', 'terms_accepted_at', 'refund_policy_accepted_at', 'stripe_payment_intent_id', 'amount_paid', 'net_payout', 'delivery_deadline', 'offer_id', 'gig_id', 'source_offer_id', 'source_consultant_offer_id', 'source_inquiry_id']) {
      delete orderInsert[key]
    }
    const retry = await db.from('orders').insert(orderInsert).select('id').single()
    order = retry.data
    error = retry.error
  }
  if (error || !order) throw new Error(error?.message || 'Order creation failed.')

  await markSourcePaid(db, item, order.id, opts.paymentIntentId || null, acceptedAt)
  await db.from('order_events').insert({
    order_id: order.id,
    actor_id: opts.actorId || item.clientProfileId,
    actor_role: 'client',
    to_status: 'created',
    note: `Order created after ${opts.paymentMethod} payment for ${item.title}. Provider must start the order.`,
  })
  await db.from('order_status_history').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'created',
    changed_by_id: opts.actorId || item.clientProfileId,
    note: `Paid by ${opts.paymentMethod} - ${item.title}`,
  })

  if (item.gigId) {
    const { data: gig } = await db.from('gigs').select('order_count').eq('id', item.gigId).maybeSingle()
    await db.from('gigs').update({ order_count: Number(gig?.order_count || 0) + 1 }).eq('id', item.gigId)
  }

  return order
}

async function markSourcePaid(db: Db, item: CheckoutItem, orderId: string, paymentIntentId: string | null, acceptedAt: string) {
  if (item.offerId) {
    await db.from('offers').update({ status: 'paid', stripe_payment_intent_id: paymentIntentId, updated_at: acceptedAt }).eq('id', item.offerId)
  }
  if (item.sourceOfferId) {
    await db
      .from('attorney_offers')
      .update({ status: 'accepted', decided_at: acceptedAt, order_id: orderId, client_profile_id: item.clientProfileId })
      .eq('id', item.sourceOfferId)
    if (item.sourceInquiryId) {
      await db.from('inquiries').update({ status: 'converted', updated_at: acceptedAt }).eq('id', item.sourceInquiryId)
    }
  }
  if (item.sourceConsultantOfferId) {
    await db
      .from('consultant_offers')
      .update({ status: 'accepted', decided_at: acceptedAt, accepted_order_id: orderId, stripe_payment_intent_id: paymentIntentId })
      .eq('id', item.sourceConsultantOfferId)
  }
}

export async function payWithWallet(clerkUserId: string, item: CheckoutItem) {
  const customerId = await getOrCreateStripeCustomer(clerkUserId)
  const stripe = getStripe()
  const balance = await stripe.customers.retrieveCashBalance(customerId)
  const available = balance.available?.[item.currency] ?? balance.available?.usd ?? 0
  if (available < item.totalCents) throw new Error('Insufficient wallet balance.')
  const pi = await stripe.paymentIntents.create({
    amount: item.totalCents,
    currency: item.currency,
    customer: customerId,
    payment_method_types: ['customer_balance'],
    payment_method_data: { type: 'customer_balance' },
    confirm: true,
    metadata: checkoutMetadata(item, 'wallet'),
  })
  if (pi.status !== 'succeeded') throw new Error(`Payment is ${pi.status}. Please retry once it settles.`)
  return pi.id
}

export async function payWithSavedCard(clerkUserId: string, item: CheckoutItem, paymentMethodId: string) {
  const stripe = getStripe()
  const customerId = await getOrCreateStripeCustomer(clerkUserId)
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  if (paymentMethod.customer !== customerId) throw new Error('Payment method does not belong to this customer.')
  const pi = await stripe.paymentIntents.create({
    amount: item.totalCents,
    currency: item.currency,
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: checkoutMetadata(item, 'saved_card'),
  })
  return pi
}

export function checkoutMetadata(item: CheckoutItem, paymentMethod: string) {
  return {
    checkout_source_type: item.sourceType,
    checkout_source_id: item.sourceId,
    checkout_tier_id: item.tierId || '',
    payment_method: paymentMethod,
    client_profile_id: item.clientProfileId,
    provider_profile_id: item.providerProfileId,
    provider_type: item.providerType,
    platform_fee_cents: String(item.platformFeeCents),
    net_payout_cents: String(item.netPayoutCents),
  }
}

export async function createHostedCheckoutSession(req: Request, item: CheckoutItem) {
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://portal.yousafeconsultancy.com'
  return getStripe().checkout.sessions.create({
    mode: 'payment',
    success_url: `${origin}/dashboard?checkout=success&source=${item.sourceType}&id=${item.sourceId}`,
    cancel_url: `${origin}/dashboard?checkout=cancelled&source=${item.sourceType}&id=${item.sourceId}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: item.currency,
          unit_amount: item.totalCents,
          product_data: {
            name: item.title,
            description: item.description?.slice(0, 500) || undefined,
          },
        },
      },
    ],
    consent_collection: { terms_of_service: 'required' },
    metadata: checkoutMetadata(item, 'stripe'),
  })
}

export async function createOrderFromCheckoutSession(db: Db, session: Stripe.Checkout.Session) {
  const sourceType = session.metadata?.checkout_source_type as CheckoutSourceType | undefined
  const sourceId = session.metadata?.checkout_source_id
  if (!sourceType || !sourceId) return null
  const clientProfileId = session.metadata?.client_profile_id
  if (!clientProfileId) return null
  const resolved = await resolveCheckoutItem(db, sourceType, sourceId, clientProfileId, session.metadata?.checkout_tier_id || undefined)
  if ('error' in resolved) throw new Error(resolved.error)
  return createPaidOrder(db, resolved, {
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    paymentMethod: 'stripe',
    actorId: clientProfileId,
  })
}
