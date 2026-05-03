import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'

export async function GET() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    const list = await getStripe().paymentMethods.list({ customer: customerId, type: 'card' })

    const cards = list.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'unknown',
      last4: pm.card?.last4 ?? '????',
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
    }))

    return Response.json({ cards })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/payment-methods GET]', message)
    // Return empty list rather than 500 so the UI still renders
    return Response.json({ cards: [], _error: message })
}
