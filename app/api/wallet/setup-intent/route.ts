import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'

export async function POST() {
  const clerkUserId = await getClerkUserId()
  console.log('[wallet/setup-intent] request', { clerkUserId })
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    console.log('[wallet/setup-intent] customerId', { customerId })
    const setupIntent = await getStripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    })
    console.log('[wallet/setup-intent] created', { setupIntentId: setupIntent.id })
    return Response.json({ clientSecret: setupIntent.client_secret })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/setup-intent] error', message, err)
    return Response.json({ error: message }, { status: 500 })
  }
}
