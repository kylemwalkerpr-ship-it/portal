import { ok, fail } from '@/lib/apiEnvelope'
import { createHostedCheckoutSession, resolveCheckoutItem } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string; tierId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can purchase gigs.', 403)
  const { id, tierId } = await context.params

  try {
    const resolved = await resolveCheckoutItem(auth.db, 'gig', id, auth.profileId, tierId)
    if ('error' in resolved) return fail(resolved.error, resolved.status)
    const session = await createHostedCheckoutSession(req, resolved)
    return ok({
      url: session.url,
      session_id: session.id,
      breakdown: {
        subtotal: resolved.subtotalCents,
        platform_fee: resolved.platformFeeCents,
        tax: 0,
        total: resolved.totalCents,
      },
    })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not create checkout.', 500)
  }
}
