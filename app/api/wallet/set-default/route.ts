import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { isActiveClient } from '@/lib/roleGuards'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isActiveClient(clerkUserId))) {
    return Response.json({ error: 'Student wallet requires an active student account' }, { status: 403 })
  }

  const { paymentMethodId } = await req.json()

  if (!paymentMethodId?.startsWith('pm_')) {
    return Response.json({ error: 'Invalid payment method ID' }, { status: 400 })
  }

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

    // Verify ownership
    const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
    if (pm.customer !== customerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await getStripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    return Response.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/set-default]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
