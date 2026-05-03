import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import Stripe from 'stripe'

export async function GET() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    if (!customerId) {
      return Response.json({ available: 0, pending: 0 }, { status: 200 })
    }

    try {
      const balance = await getStripe().customers.retrieveCashBalance(customerId)
      const currency = Object.keys(balance.available ?? {})[0] || 'usd'
      return Response.json({
        available: (balance.available?.[currency] || 0) / 100,
        pending: (balance.pending?.[currency] || 0) / 100,
      })
    } catch (balanceErr) {
      if (balanceErr instanceof Stripe.errors.StripeInvalidRequestError) {
        return Response.json({ available: 0, pending: 0 }, { status: 200 })
      }
      console.error('[Stripe] retrieveCashBalance error:', balanceErr instanceof Error ? balanceErr.message : balanceErr)
      return Response.json({ error: balanceErr instanceof Error ? balanceErr.message : 'Stripe balance error' }, { status: 500 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/balance]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
