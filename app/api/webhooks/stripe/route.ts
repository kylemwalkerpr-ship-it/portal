import Stripe from 'stripe'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 })
  }

  const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() })
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) return new Response('Missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  // ── Wallet events ──────────────────────────────────────────────────────────
  if ((event.type as string) === 'customer.cash_balance.funds_available') {
    const obj = event.data.object as { customer: string }
    console.log(`[webhook] Wallet funds available for customer: ${obj.customer}`)
    return new Response('OK', { status: 200 })
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    console.error(`[webhook] PaymentIntent failed: ${pi.id} — ${pi.last_payment_error?.message}`)
    return new Response('OK', { status: 200 })
  }

  if (event.type === 'payment_method.detached') {
    const pm = event.data.object as Stripe.PaymentMethod
    console.log(`[webhook] PaymentMethod detached: ${pm.id}`)
    return new Response('OK', { status: 200 })
  }

  const eventType = event.type as string

  if (eventType === 'account.updated') {
    const account = event.data.object as Stripe.Account
    const consultantId = account.metadata?.consultantId
    if (consultantId && account.details_submitted && account.charges_enabled) {
      const db = createSupabaseAdminClient()
      await db
        .from('consultants')
        .update({ stripe_onboarding_complete: true })
        .eq('id', consultantId)
      console.log(`[webhook] Consultant ${consultantId} completed Stripe Connect onboarding`)
    }
    return new Response('OK', { status: 200 })
  }

  if (eventType === 'transfer.created') {
    const transfer = event.data.object as Stripe.Transfer
    console.log(`[webhook] Transfer created: ${transfer.id} for order ${transfer.metadata?.orderId ?? 'unknown'}`)
    return new Response('OK', { status: 200 })
  }

  if (eventType === 'transfer.failed') {
    const transfer = event.data.object as Stripe.Transfer
    const orderId = transfer.metadata?.orderId
    if (orderId) {
      const db = createSupabaseAdminClient()
      await db.from('orders').update({ payout_status: 'failed' }).eq('id', orderId)
      console.error(`[webhook] Transfer failed: ${transfer.id} for order ${orderId}`)
    }
    return new Response('OK', { status: 200 })
  }

  if (eventType !== 'checkout.session.completed') {
    return new Response('OK', { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const clerkUserId = session.client_reference_id
  const customerEmail = session.customer_details?.email ?? ''
  const amountTotal = (session.amount_total ?? 0) / 100

  const db = createSupabaseAdminClient()

  // ── Attorney offer payment path ────────────────────────────────────────────
  // If the session was created by /api/offers/[id]/checkout it carries the
  // offer_id / inquiry_id metadata. Create the order with consultant_id set to
  // the attorney's profile_id (attorneys reuse the consultant_id slot on
  // orders), mark the offer accepted, and link both directions.
  const offerId = session.metadata?.offer_id
  if (offerId) {
    const inquiryId = session.metadata?.inquiry_id
    const attorneyProfileId = session.metadata?.attorney_profile_id
    const clientProfileId = session.metadata?.client_profile_id
    const deliveryDays = Number(session.metadata?.delivery_days || 7)

    if (!attorneyProfileId || !clientProfileId) {
      console.error('[webhook] Offer payment missing required metadata', session.id)
      return new Response('OK', { status: 200 })
    }

    // Idempotency: if we already created an order for this offer, skip.
    const { data: existingOrder } = await db
      .from('orders')
      .select('id')
      .eq('source_offer_id', offerId)
      .maybeSingle()
    if (existingOrder) {
      return new Response('OK', { status: 200 })
    }

    const { data: offer } = await db
      .from('attorney_offers')
      .select('title, description')
      .eq('id', offerId)
      .single()

    const acceptedAt = new Date().toISOString()
    const deadline = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({
        client_id: clientProfileId,
        consultant_id: attorneyProfileId,
        status: 'queued',
        total_amount: amountTotal,
        requirements: offer?.description ?? `Custom attorney offer ${offerId}`,
        terms_accepted_at: acceptedAt,
        refund_policy_accepted_at: acceptedAt,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        deadline,
        source_inquiry_id: inquiryId ?? null,
        source_offer_id: offerId,
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      console.error('[webhook] Offer order create failed', orderErr?.message)
      return new Response('Order create failed', { status: 500 })
    }

    await db
      .from('attorney_offers')
      .update({ status: 'accepted', decided_at: acceptedAt, order_id: order.id, client_profile_id: clientProfileId })
      .eq('id', offerId)

    if (inquiryId) {
      await db
        .from('inquiries')
        .update({ status: 'converted', updated_at: new Date().toISOString() })
        .eq('id', inquiryId)

      await db.from('inquiry_messages').insert({
        inquiry_id: inquiryId,
        sender_role: 'system',
        sender_profile_id: clientProfileId,
        body: `Client accepted offer "${offer?.title ?? ''}". Order #${order.id} is now active.`,
      })
    }

    return new Response('OK', { status: 200 })
  }
  // ── /Attorney offer payment path ───────────────────────────────────────────

  // Find the user's profile — by clerk_user_id if we have it, otherwise by email
  let profile: { id: string; role?: string; status?: string } | null = null

  if (clerkUserId) {
    const { data } = await db
      .from('profiles')
      .select('id, role, status')
      .eq('clerk_user_id', clerkUserId)
      .single()
    profile = data
  }

  if (!profile && customerEmail) {
    const { data } = await db
      .from('profiles')
      .select('id, role, status')
      .eq('email', customerEmail)
      .single()
    profile = data
  }

  if (!profile) {
    // Guest checkout — create a minimal profile to attach the order to
    const { data } = await db
      .from('profiles')
      .insert({ clerk_user_id: `stripe_${session.id}`, email: customerEmail, role: 'client' })
      .select('id')
      .single()
    profile = data
  }

  if (!profile) {
    return new Response('Could not resolve profile', { status: 500 })
  }

  if (profile.role && (profile.role !== 'client' || profile.status === 'suspended')) {
    console.warn(`[webhook] Ignored checkout for non-client profile ${profile.id}`)
    return new Response('OK', { status: 200 })
  }

  // Get line items to extract service name
  const sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items'],
  })
  const lineItem = sessionWithItems.line_items?.data[0]
  const serviceName = lineItem?.description ?? lineItem?.price?.product?.toString() ?? 'Consultancy Service'

  // Prefer the service selected in the app checkout. Legacy payment links fall back to title matching.
  let serviceId: string
  const metadataServiceId = session.metadata?.service_id
  const { data: existingService } = metadataServiceId
    ? await db.from('services').select('id').eq('id', metadataServiceId).single()
    : await db
        .from('services')
        .select('id')
        .ilike('title', `%${serviceName.split(' ').slice(0, 3).join(' ')}%`)
        .single()

  if (existingService) {
    serviceId = existingService.id
  } else {
    const { data: newService } = await db
      .from('services')
      .insert({
        title: serviceName,
        price: amountTotal,
        delivery_days: 7,
        category: 'Immigration',
        is_active: true,
      })
      .select('id')
      .single()
    serviceId = newService?.id ?? ''
  }

  // Hosted Stripe Checkout includes ToS/refund acknowledgment via the consent_collection
  // page. The presence of session.payment_status === 'paid' is our trigger to record acceptance.
  const acceptedAt = new Date().toISOString()
  const orderInsert: Record<string, unknown> = {
    client_id: profile.id,
    status: 'queued',
    total_amount: amountTotal,
    requirements: `Stripe session: ${session.id}`,
    terms_accepted_at: acceptedAt,
    refund_policy_accepted_at: acceptedAt,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
  }

  let { data: order, error } = await db
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single()

  if (error && /terms_accepted_at|refund_policy_accepted_at|stripe_payment_intent_id/i.test(error.message)) {
    delete orderInsert.terms_accepted_at
    delete orderInsert.refund_policy_accepted_at
    delete orderInsert.stripe_payment_intent_id
    const retry = await db.from('orders').insert(orderInsert).select('id').single()
    order = retry.data
    error = retry.error
  }

  if (error || !order) {
    console.error('Order creation failed', error)
    return new Response('Order creation failed', { status: 500 })
  }

  // Create order item
  if (serviceId) {
    await db.from('order_items').insert({
      order_id: order.id,
      service_id: serviceId,
      quantity: 1,
      unit_price: amountTotal,
      subtotal: amountTotal,
    })
  }

  // Record initial status
  await db.from('order_status_history').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'queued',
    changed_by_id: profile.id,
    note: `Payment received via Stripe — session ${session.id}`,
  })

  console.log(`Order created: ${order.id} for ${customerEmail} — ${serviceName} — $${amountTotal}`)
  return new Response('OK', { status: 200 })
}
