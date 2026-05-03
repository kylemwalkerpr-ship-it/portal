import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'

export async function POST() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    const setupIntent = await getStripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    })
    return Response.json({ clientSecret: setupIntent.client_secret })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/setup-intent]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
