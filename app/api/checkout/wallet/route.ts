import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, amountCents, serviceId: requestedServiceId } = await req.json()

  if (!title || !Number.isInteger(amountCents) || amountCents < 100) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
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

    if (String(service.currency || 'usd').toLowerCase() !== 'usd') {
      return Response.json({ error: 'Wallet payments are only available for USD services' }, { status: 400 })
    }

    const expectedAmountCents = Math.round(Number(service.price || 0) * 100)
    if (expectedAmountCents !== amountCents) {
      return Response.json({ error: 'Service price changed. Please refresh and try again.' }, { status: 409 })
    }

    const stripe = getStripe()
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

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
    })

    const serviceId = service.id

    const { data: order } = await db
      .from('orders')
      .insert({
        client_id: profile.id,
        status: 'queued',
        total_amount: amountCents / 100,
        requirements: `Wallet payment — Stripe PI: ${pi.id}`,
      })
      .select('id')
      .single()

    if (order && serviceId) {
      await db.from('order_items').insert({
        order_id: order.id,
        service_id: serviceId,
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
    }

    return Response.json({ success: true, orderId: order?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[checkout/wallet]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
