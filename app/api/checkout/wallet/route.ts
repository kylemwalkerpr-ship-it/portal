import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { title, amountCents, serviceId: requestedServiceId, acceptedTerms, acceptedRefundPolicy } = body

  if (!title || !Number.isInteger(amountCents) || amountCents < 100) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
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
      .select('id, role, status')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'client' || profile.status !== 'active') {
      return Response.json({ error: 'Student checkout requires an active student account' }, { status: 403 })
    }

    const { data: service } = await db
      .from('services')
      .select('*')
      .eq('id', requestedServiceId)
      .eq('is_active', true)
      .single()

    if (!service) {
      return Response.json({ error: 'Service not found' }, { status: 404 })
    }

    const expectedAmountCents = Math.round(Number(service.price || 0) * 100)
    if (expectedAmountCents !== amountCents) {
      return Response.json({ error: 'Service price changed. Please refresh and try again.' }, { status: 409 })
    }

    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

    const { data: walletCredits } = await db
      .from('orders')
      .select('id, wallet_credit_amount')
      .eq('client_id', profile.id)
      .eq('refund_status', 'wallet_credit_pending')
    const walletCreditCents = Math.round((walletCredits ?? []).reduce((sum, row) => sum + Number(row.wallet_credit_amount || 0), 0) * 100)

    if (walletCreditCents >= amountCents) {
      const acceptedAt = new Date().toISOString()
      const orderInsert: Record<string, unknown> = {
        client_id: profile.id,
        status: 'queued',
        total_amount: amountCents / 100,
        requirements: `Wallet credit payment — ${title}`,
        terms_accepted_at: acceptedAt,
        refund_policy_accepted_at: acceptedAt,
      }
      const orderResult = await db.from('orders').insert(orderInsert).select('id').single()
      if (orderResult.error || !orderResult.data) {
        return Response.json({ error: orderResult.error?.message || 'Order creation failed.' }, { status: 500 })
      }
      await db.from('order_items').insert({
        order_id: orderResult.data.id,
        service_id: service.id,
        quantity: 1,
        unit_price: amountCents / 100,
        subtotal: amountCents / 100,
      })
      await db.from('order_status_history').insert({
        order_id: orderResult.data.id,
        from_status: null,
        to_status: 'queued',
        changed_by_id: profile.id,
        note: `Paid from wallet credit — ${title}`,
      })
      await db
        .from('orders')
        .update({ refund_status: 'wallet_credit_used', wallet_credit_amount: 0 })
        .in('id', (walletCredits ?? []).map(row => row.id))
      return Response.json({ success: true, orderId: orderResult.data.id })
    }

    // Check available balance
    const balance = await stripe.customers.retrieveCashBalance(customerId)
    const available = balance.available?.usd ?? 0
    if (available < amountCents) {
      return Response.json({ error: 'Insufficient wallet balance' }, { status: 400 })
    }

    // Charge from wallet (customer cash balance)
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['customer_balance'],
      payment_method_data: { type: 'customer_balance' },
      confirm: true,
      metadata: {
        clerk_user_id: clerkUserId,
        service_id: String(service.id),
        funding_source: 'wallet',
      },
    })

    if (pi.status !== 'succeeded') {
      console.warn(`[checkout/wallet] PaymentIntent ${pi.id} did not succeed (status: ${pi.status}) — order not created`)
      return Response.json(
        { error: `Payment is ${pi.status}. Please retry once it settles.`, paymentIntentId: pi.id, paymentIntentStatus: pi.status },
        { status: 402 },
      )
    }

    const acceptedAt = new Date().toISOString()

    const orderInsert: Record<string, unknown> = {
      client_id: profile.id,
      status: 'queued',
      total_amount: amountCents / 100,
      requirements: `Wallet payment — Stripe PI: ${pi.id}`,
      terms_accepted_at: acceptedAt,
      refund_policy_accepted_at: acceptedAt,
      stripe_payment_intent_id: pi.id,
    }

    let orderResult = await db.from('orders').insert(orderInsert).select('id').single()

    if (orderResult.error && /terms_accepted_at|refund_policy_accepted_at|stripe_payment_intent_id/i.test(orderResult.error.message)) {
      // Legacy schema without acknowledgment columns — retry without them
      delete orderInsert.terms_accepted_at
      delete orderInsert.refund_policy_accepted_at
      delete orderInsert.stripe_payment_intent_id
      orderResult = await db.from('orders').insert(orderInsert).select('id').single()
    }

    if (orderResult.error || !orderResult.data) {
      console.error('[checkout/wallet] order insert failed', orderResult.error)
      return Response.json({ error: 'Order creation failed after successful payment. Contact support.' }, { status: 500 })
    }

    const order = orderResult.data
    await db.from('order_items').insert({
      order_id: order.id,
      service_id: service.id,
      quantity: 1,
      unit_price: amountCents / 100,
      subtotal: amountCents / 100,
    })
    await db.from('order_status_history').insert({
      order_id: order.id,
      from_status: null,
      to_status: 'queued',
      changed_by_id: profile.id,
      note: `Paid from wallet — ${title}`,
    })

    return Response.json({ success: true, orderId: order.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[checkout/wallet]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
