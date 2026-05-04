import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'client' || profile.status !== 'active') {
    return Response.json({ error: 'Student wallet requires an active student account' }, { status: 403 })
  }

  // The wallet UI must always render — never throw a 500. Worst case: show $0.
  try {
    const customerId = await getOrCreateStripeCustomer(clerkUserId)
    if (!customerId) return Response.json({ available: 0, pending: 0 })

    const balance = await getStripe().customers.retrieveCashBalance(customerId)
    const currency = Object.keys(balance.available ?? {})[0] || 'usd'
    const pending = (balance as { pending?: Record<string, number> }).pending ?? {}

    return Response.json({
      available: (balance.available?.[currency] || 0) / 100,
      pending: (pending[currency] || 0) / 100,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wallet/balance] returning $0 due to:', message)
    // Always return zero balance instead of erroring — UI keeps working
    return Response.json({ available: 0, pending: 0, _note: message })
  }
}
