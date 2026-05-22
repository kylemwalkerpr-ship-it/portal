import { getClerkUserId } from '@/lib/auth'
import { createPaidOrder, resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'

const VALID_SOURCE_TYPES = new Set(['unified_offer', 'attorney_offer', 'consultant_offer', 'gig'])

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'client') return Response.json({ error: 'Only students can check out.' }, { status: 403 })

  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceType = String(body.sourceType || body.source_type || '') as CheckoutSourceType
  const sourceId = String(body.sourceId || body.source_id || '')
  const tierId = body.tierId || body.tier_id ? String(body.tierId || body.tier_id) : undefined

  if (!VALID_SOURCE_TYPES.has(sourceType) || !sourceId) {
    return Response.json({ error: 'Invalid checkout source.' }, { status: 400 })
  }

  if (body.acceptedTerms !== true || body.acceptedRefundPolicy !== true) {
    return Response.json(
      { error: 'You must accept the Terms of Service and Refund Policy before completing payment.' },
      { status: 400 },
    )
  }

  const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profileId, tierId)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  try {
    // Ensure wallet exists and check balance
    const wallet = await getOrCreateWallet(auth.profileId)
    if (wallet.balance_cents < resolved.totalCents) {
      return Response.json(
        {
          error: 'Insufficient wallet balance',
          balanceCents: wallet.balance_cents,
          requiredCents: resolved.totalCents,
        },
        { status: 402 }
      )
    }

    // Debit wallet
    const tx = await debit(
      auth.profileId,
      resolved.totalCents,
      `Purchase: ${resolved.title}`,
      undefined,
      { sourceType, sourceId, providerId: resolved.providerProfileId }
    )

    // Create the order
    const order = await createPaidOrder(auth.db, resolved, {
      paymentMethod: 'wallet',
      actorId: auth.profileId,
    })

    // Credit provider earning
    try {
      await creditEarning({
        providerId: resolved.providerProfileId,
        orderId: order.id,
        source: resolved.sourceType === 'gig' ? 'gig' : 'offer',
        amountCents: resolved.netPayoutCents,
        feeCents: resolved.platformFeeCents,
      })
    } catch (earnErr) {
      console.error('[checkout/order] creditEarning failed:', earnErr)
      // Non-fatal: order is paid, earning can be backfilled
    }

    return Response.json({ success: true, orderId: order.id, ledgerId: tx.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    console.error('[checkout/order]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
