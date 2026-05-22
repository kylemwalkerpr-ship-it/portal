import { getClerkUserId } from '@/lib/auth'
import { createPaidOrder, resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'
import { getPaymentProvider } from '@/lib/payments'

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
  const paymentMethod = String(body.paymentMethod || body.payment_method || 'wallet')

  if (!VALID_SOURCE_TYPES.has(sourceType) || !sourceId) {
    return Response.json({ error: 'Invalid checkout source.' }, { status: 400 })
  }

  const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profileId, tierId)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  // For non-gig source types, we keep the original wallet-only behavior here.
  // Gigs support all three payment methods (wallet, saved_card, new_card).
  if (sourceType !== 'gig' && paymentMethod !== 'wallet') {
    return Response.json({ error: `Payment method ${paymentMethod} is only supported for gig purchases.` }, { status: 400 })
  }

  try {
    if (paymentMethod === 'saved_card') {
      const paymentMethodId = body.paymentMethodId || body.payment_method_id
      if (!paymentMethodId) {
        return Response.json({ error: 'Missing paymentMethodId' }, { status: 400 })
      }

      // Look up student_payment_methods row scoped to auth.profileId
      const { data: cardRow, error: cardErr } = await auth.db
        .from('student_payment_methods')
        .select('vault_id')
        .eq('id', paymentMethodId)
        .eq('profile_id', auth.profileId)
        .single()

      if (cardErr || !cardRow) {
        return Response.json({ error: 'Saved card not found.' }, { status: 404 })
      }

      const email = auth.profile.email || ''
      const name = auth.profile.full_name || ''
      const provider = getPaymentProvider()

      let result
      try {
        result = await provider.chargeVaulted({
          vaultId: cardRow.vault_id,
          amountCents: resolved.totalCents,
          currency: 'usd',
          customer: { email, name },
          metadata: { source: 'gig_checkout', gigId: resolved.gigId || null },
        })
      } catch (chargeErr) {
        console.error(`[checkout/order] card charge failed: ${resolved.gigId || resolved.sourceId}`, chargeErr)
        return Response.json({ error: chargeErr instanceof Error ? chargeErr.message : 'Card charge failed.' }, { status: 500 })
      }

      if (result.status !== 'paid' || !result.ok) {
        console.error(`[checkout/order] card charge failed: ${resolved.gigId || resolved.sourceId}`, result.message)
        return Response.json({ error: result.message || 'Payment was declined.' }, { status: 402 })
      }

      // Create the order
      const order = await createPaidOrder(auth.db, resolved, {
        paymentMethod: 'saved_card',
        actorId: auth.profileId,
      })

      // Credit provider earning
      try {
        await creditEarning({
          providerId: resolved.providerProfileId,
          orderId: order.id,
          source: 'gig',
          amountCents: resolved.netPayoutCents,
          feeCents: resolved.platformFeeCents,
        })
      } catch (earnErr) {
        console.error('[checkout/order] creditEarning failed:', earnErr)
      }

      return Response.json({ success: true, orderId: order.id, transactionId: result.transactionId })
    }

    if (paymentMethod === 'new_card') {
      const token = body.token
      if (!token) {
        return Response.json({ error: 'Missing card token.' }, { status: 400 })
      }

      const email = auth.profile.email || ''
      const name = auth.profile.full_name || ''
      const provider = getPaymentProvider()

      let result
      try {
        result = await provider.charge({
          token,
          amountCents: resolved.totalCents,
          currency: 'USD',
          items: [{
            sku: resolved.gigId || resolved.sourceId,
            name: resolved.title,
            unitAmountCents: resolved.totalCents,
            quantity: 1,
          }],
          customer: { email, name },
          metadata: { source: 'gig_checkout' },
        })
      } catch (chargeErr) {
        console.error(`[checkout/order] card charge failed: ${resolved.gigId || resolved.sourceId}`, chargeErr)
        return Response.json({ error: chargeErr instanceof Error ? chargeErr.message : 'Card charge failed.' }, { status: 500 })
      }

      if (result.status !== 'paid' || !result.ok) {
        console.error(`[checkout/order] card charge failed: ${resolved.gigId || resolved.sourceId}`, result.message)
        return Response.json({ error: result.message || 'Payment was declined.' }, { status: 402 })
      }

      // Create the order
      const order = await createPaidOrder(auth.db, resolved, {
        paymentMethod: 'new_card',
        actorId: auth.profileId,
      })

      // Credit provider earning
      try {
        await creditEarning({
          providerId: resolved.providerProfileId,
          orderId: order.id,
          source: 'gig',
          amountCents: resolved.netPayoutCents,
          feeCents: resolved.platformFeeCents,
        })
      } catch (earnErr) {
        console.error('[checkout/order] creditEarning failed:', earnErr)
      }

      return Response.json({ success: true, orderId: order.id, transactionId: result.transactionId })
    }

    // Default Wallet payment flow
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
    }

    return Response.json({ success: true, orderId: order.id, ledgerId: tx.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    console.error('[checkout/order]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

