import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { createSupabaseAdminClient } from '@/lib/supabase'

function isTemplateProduct(service: Record<string, unknown>) {
  return String(service.product_type || '').toLowerCase() === 'template'
}

function expectedAmountCents(service: Record<string, unknown>) {
  const source = isTemplateProduct(service) ? service.usd_price ?? service.price : service.price
  return Math.round(Number(source || 0) * 100)
}

async function insertPaidOrder(db: ReturnType<typeof createSupabaseAdminClient>, {
  profileId,
  service,
  amountCents,
  title,
  note,
  paymentIntentId,
}: {
  profileId: string
  service: Record<string, unknown>
  amountCents: number
  title: string
  note: string
  paymentIntentId?: string
}) {
  const template = isTemplateProduct(service)
  const acceptedAt = new Date().toISOString()
  const orderInsert: Record<string, unknown> = {
    client_id: profileId,
    status: template ? 'completed' : 'queued',
    total_amount: amountCents / 100,
    requirements: template
      ? `Digital template purchase — ${title}`
      : note,
    terms_accepted_at: acceptedAt,
    refund_policy_accepted_at: acceptedAt,
    ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
  }

  if (template) {
    orderInsert.escrow_status = 'released'
    orderInsert.payout_status = 'not_applicable'
    orderInsert.completed_at = acceptedAt
  }

  let orderResult = await db.from('orders').insert(orderInsert).select('id').single()
  if (orderResult.error && /terms_accepted_at|refund_policy_accepted_at|stripe_payment_intent_id|escrow_status|payout_status|completed_at/i.test(orderResult.error.message)) {
    delete orderInsert.terms_accepted_at
    delete orderInsert.refund_policy_accepted_at
    delete orderInsert.stripe_payment_intent_id
    delete orderInsert.escrow_status
    delete orderInsert.payout_status
    delete orderInsert.completed_at
    orderResult = await db.from('orders').insert(orderInsert).select('id').single()
  }

  if (orderResult.error || !orderResult.data) {
    return { error: orderResult.error?.message || 'Order creation failed.' }
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
    to_status: template ? 'completed' : 'queued',
    changed_by_id: profileId,
    note: template ? `Digital template purchased — ${title}` : note,
  })

  return { orderId: orderResult.data.id }
}

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    title,
    amountCents,
    serviceId,
    templateId,
    productType,
    acceptedTerms,
    acceptedRefundPolicy,
  } = body
  const requestedServiceId = templateId || serviceId
  const requestedType = templateId || String(productType || '').toLowerCase() === 'template' ? 'template' : 'service'

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

    let query = db
      .from('services')
      .select('*')
      .eq('id', requestedServiceId)
      .eq('is_active', true)
    if (requestedType === 'template') {
      query = query.eq('product_type', 'template').eq('status', 'active')
    } else {
      query = query.or('product_type.is.null,product_type.eq.service')
    }
    const { data: service } = await query.single()

    if (!service) {
      return Response.json({ error: requestedType === 'template' ? 'Template not found' : 'Service not found' }, { status: 404 })
    }

    const expected = expectedAmountCents(service)
    if (expected !== amountCents) {
      return Response.json({ error: `${requestedType === 'template' ? 'Template' : 'Service'} price changed. Please refresh and try again.` }, { status: 409 })
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
      const created = await insertPaidOrder(db, {
        profileId: profile.id,
        service,
        amountCents,
        title,
        note: `Wallet credit payment — ${title}`,
      })
      if ('error' in created) return Response.json({ error: created.error }, { status: 500 })
      await db
        .from('orders')
        .update({ refund_status: 'wallet_credit_used', wallet_credit_amount: 0 })
        .in('id', (walletCredits ?? []).map(row => row.id))
      return Response.json({ success: true, orderId: created.orderId })
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
        product_type: isTemplateProduct(service) ? 'template' : 'service',
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

    const created = await insertPaidOrder(db, {
      profileId: profile.id,
      service,
      amountCents,
      title,
      note: `Wallet payment — Stripe PI: ${pi.id}`,
      paymentIntentId: pi.id,
    })
    if ('error' in created) {
      console.error('[checkout/wallet] order insert failed', created.error)
      return Response.json({ error: 'Order creation failed after successful payment. Contact support.' }, { status: 500 })
    }

    return Response.json({ success: true, orderId: created.orderId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[checkout/wallet]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
