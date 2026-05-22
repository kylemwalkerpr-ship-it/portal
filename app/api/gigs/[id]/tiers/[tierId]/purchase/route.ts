import { ok, fail } from '@/lib/apiEnvelope'
import { createPaidOrder, resolveCheckoutItem } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'

export async function POST(req: Request, context: { params: Promise<{ id: string; tierId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can purchase gigs.', 403)
  const { id, tierId } = await context.params

  try {
    const resolved = await resolveCheckoutItem(auth.db, 'gig', id, auth.profileId, tierId)
    if ('error' in resolved) return fail(resolved.error, resolved.status)

    const wallet = await getOrCreateWallet(auth.profileId)
    if (wallet.balance_cents < resolved.totalCents) {
      return fail('Insufficient wallet balance', 402, {
        balanceCents: wallet.balance_cents,
        requiredCents: resolved.totalCents,
      })
    }

    const tx = await debit(auth.profileId, resolved.totalCents, `Purchase: ${resolved.title}`)
    const order = await createPaidOrder(auth.db, resolved, { paymentMethod: 'wallet', actorId: auth.profileId })
    try {
      await creditEarning({
        providerId: resolved.providerProfileId,
        orderId: order.id,
        source: 'gig',
        amountCents: resolved.netPayoutCents,
        feeCents: resolved.platformFeeCents,
      })
    } catch (e) { console.error('[gigs/purchase] creditEarning failed:', e) }

    return ok({
      success: true,
      orderId: order.id,
      ledgerId: tx.id,
      breakdown: {
        subtotal: resolved.subtotalCents,
        platform_fee: resolved.platformFeeCents,
        tax: 0,
        total: resolved.totalCents,
      },
    })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not complete purchase.', 500)
  }
}
