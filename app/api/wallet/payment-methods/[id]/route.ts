import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: paymentMethodId } = await params

  if (!paymentMethodId?.startsWith('pm_')) {
    return Response.json({ error: 'Invalid payment method ID' }, { status: 400 })
  }

  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)

    // Verify ownership — the PM must belong to this customer
    const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
    if (pm.customer !== customerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await getStripe().paymentMethods.detach(paymentMethodId)
    return Response.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/payment-methods DELETE]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
