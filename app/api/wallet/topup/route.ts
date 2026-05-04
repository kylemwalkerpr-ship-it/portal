import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { isActiveClient } from '@/lib/roleGuards'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isActiveClient(clerkUserId))) {
    return Response.json({ error: 'Student wallet requires an active student account' }, { status: 403 })
  }

  const body = await req.json()
  const { paymentMethodId, amount } = body

  if (!paymentMethodId?.startsWith('pm_')) {
    return Response.json({ error: 'Invalid payment method ID' }, { status: 400 })
  }
  if (!Number.isInteger(amount) || amount < 100) {
    return Response.json({ error: 'Amount must be a positive integer (minimum 100 cents)' }, { status: 400 })
  }

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

    // Verify ownership
    const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
    if (pm.customer !== customerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pi = await getStripe().paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
    })

    return Response.json({ success: true, paymentIntentId: pi.id })
  } catch (err: unknown) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return Response.json({ error: err.message }, { status: 402 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/topup]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
