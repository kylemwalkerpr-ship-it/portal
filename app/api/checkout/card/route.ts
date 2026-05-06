import Stripe from 'stripe'
import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { dollarsToCents } from '@/lib/money'

async function createOrderForPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Cannot create order — payment status is ${paymentIntent.status}`)
  }

  const clerkUserId = paymentIntent.metadata?.clerk_user_id
  const serviceId = paymentIntent.metadata?.service_id
  const acceptedTerms = paymentIntent.metadata?.accepted_terms === 'true'
  const acceptedRefundPolicy = paymentIntent.metadata?.accepted_refund_policy === 'true'

  if (!clerkUserId || !serviceId) throw new Error('Payment metadata is missing')
  if (!acceptedTerms || !acceptedRefundPolicy) {
    throw new Error('Payment is missing Terms of Service / Refund Policy acknowledgment')
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile) throw new Error('Profile not found')
  if (profile.role !== 'client' || profile.status !== 'active') {
    throw new Error('Student checkout requires an active student account')
  }

  const { data: service } = await db
    .from('services')
    .select('id, title, price, currency')
    .eq('id', serviceId)
    .single()

  if (!service) throw new Error('Service not found')

  const amount = (paymentIntent.amount_received || paymentIntent.amount) / 100

  // Idempotency: if an order already exists for this PaymentIntent, return it.
  try {
    const { data: existingByPi } = await db
      .from('orders')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .maybeSingle()
    if (existingByPi) return existingByPi.id
  } catch {
    /* legacy schema without stripe_payment_intent_id — fall through */
  }

  const { data: existingByReq } = await db
    .from('orders')
    .select('id')
    .eq('requirements', `Saved card payment - Stripe PI: ${paymentIntent.id}`)
    .maybeSingle()

  if (existingByReq) return existingByReq.id

  const acceptedAt = new Date(
    paymentIntent.metadata?.acknowledged_at
      ? Number(paymentIntent.metadata.acknowledged_at) * 1000
      : Date.now(),
  ).toISOString()

  const orderInsert: Record<string, unknown> = {
    client_id: profile.id,
    status: 'queued',
    total_amount: amount,
    requirements: `Saved card payment - Stripe PI: ${paymentIntent.id}`,
    terms_accepted_at: acceptedAt,
    refund_policy_accepted_at: acceptedAt,
    stripe_payment_intent_id: paymentIntent.id,
  }

  let { data: order, error } = await db.from('orders').insert(orderInsert).select('id').single()

  if (error && /terms_accepted_at|refund_policy_accepted_at|stripe_payment_intent_id/i.test(error.message)) {
    delete orderInsert.terms_accepted_at
    delete orderInsert.refund_policy_accepted_at
    delete orderInsert.stripe_payment_intent_id
    const retry = await db.from('orders').insert(orderInsert).select('id').single()
    order = retry.data
    error = retry.error
  }

  if (error || !order) throw new Error(error?.message || 'Order creation failed')

  await db.from('order_items').insert({
    order_id: order.id,
    service_id: service.id,
    quantity: 1,
    unit_price: amount,
    subtotal: amount,
  })

  await db.from('order_status_history').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'queued',
    changed_by_id: profile.id,
    note: `Paid with saved card - ${service.title}`,
  })

  return order.id
}

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { serviceId, paymentMethodId, acceptedTerms, acceptedRefundPolicy } = body
  if (!serviceId || !paymentMethodId) {
    return Response.json({ error: 'Missing service or payment method' }, { status: 400 })
  }

  if (acceptedTerms !== true || acceptedRefundPolicy !== true) {
    return Response.json(
      { error: 'You must accept the Terms of Service and Refund Policy before completing payment.' },
      { status: 400 },
    )
  }

  try {
    const db = createSupabaseAdminClient()
    const { data: profile } = await db
      .from('profiles')
      .select('role, status')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (profile?.role !== 'client' || profile.status !== 'active') {
      return Response.json({ error: 'Student checkout requires an active student account' }, { status: 403 })
    }

    const { data: service } = await db
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('is_active', true)
      .single()

    if (!service) return Response.json({ error: 'Service not found' }, { status: 404 })

    const amount = dollarsToCents(service.price)
    const currency = String(service.currency || 'usd').toLowerCase()
    if (amount < 100) return Response.json({ error: 'Service price is invalid' }, { status: 400 })

    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

    if (paymentMethod.customer !== customerId) {
      return Response.json({ error: 'Payment method does not belong to this customer' }, { status: 403 })
    }

    const acknowledgedAt = Math.floor(Date.now() / 1000)

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        clerk_user_id: clerkUserId,
        service_id: String(service.id),
        accepted_terms: 'true',
        accepted_refund_policy: 'true',
        acknowledged_at: String(acknowledgedAt),
      },
    })

    if (paymentIntent.status === 'succeeded') {
      const orderId = await createOrderForPaymentIntent(paymentIntent)
      return Response.json({ success: true, orderId })
    }

    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
      return Response.json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      })
    }

    return Response.json({ error: `Payment is ${paymentIntent.status}` }, { status: 402 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[checkout/card]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { paymentIntentId } = await req.json()
  if (!paymentIntentId) return Response.json({ error: 'Missing payment intent' }, { status: 400 })

  try {
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.metadata?.clerk_user_id !== clerkUserId) {
      return Response.json({ error: 'Payment intent does not belong to this user' }, { status: 403 })
    }

    if (paymentIntent.status !== 'succeeded') {
      return Response.json({ error: `Payment is ${paymentIntent.status}` }, { status: 402 })
    }

    const orderId = await createOrderForPaymentIntent(paymentIntent)
    return Response.json({ success: true, orderId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[checkout/card PATCH]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
