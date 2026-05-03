import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import Stripe from 'stripe'

export async function GET() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

    let available: Record<string, number> = {}
    try {
      const balance = await getStripe().customers.retrieveCashBalance(customerId)
      available = Object.fromEntries(
        Object.entries(balance.available ?? {}).map(([currency, amount]) => [
          currency,
          (amount as number) / 100,
        ])
      )
    } catch (balanceErr) {
      // Cash balance not enabled on this Stripe account — return zero
      if (balanceErr instanceof Stripe.errors.StripeInvalidRequestError) {
        available = {}
      } else {
        throw balanceErr
      }
    }

    return Response.json({ available })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/balance]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
