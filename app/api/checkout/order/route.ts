import { getClerkUserId } from '@/lib/auth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { createPaidOrder, resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { credit, debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'
import { getDefaultGatewayId, getPaymentProvider } from '@/lib/payments'
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  extractIdempotencyKey,
  recordPaymentIncident,
} from '@/lib/idempotency'

const VALID_SOURCE_TYPES = new Set(['unified_offer', 'attorney_offer', 'consultant_offer', 'gig'])

type Db = ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>
type Resolved = Exclude<Awaited<ReturnType<typeof resolveCheckoutItem>>, { error: string; status: number }>

/**
 * Credit the provider's earning; never lose it silently. On failure, record a
 * payment_incidents row so the reconciliation cron / admin view can replay it.
 */
async function creditEarningSafe(db: Db, resolved: Resolved, orderId: string, source: 'gig' | 'offer') {
  try {
    await creditEarning({
      providerId: resolved.providerProfileId,
      orderId,
      source,
      amountCents: resolved.netPayoutCents,
      feeCents: resolved.platformFeeCents,
    })
  } catch (earnErr) {
    console.error('[checkout/order] creditEarning failed:', earnErr)
    await recordPaymentIncident(db, {
      profileId: resolved.providerProfileId,
      kind: 'earning_credit_failed',
      amountCents: resolved.netPayoutCents,
      context: { orderId, source, clientProfileId: resolved.clientProfileId },
    })
  }
}

export async function POST(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
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

  // ── Idempotency guard ────────────────────────────────────────────────────
  // A client-generated key (header `Idempotency-Key` or body `idempotencyKey`)
  // makes retries/double-clicks safe: the duplicate request replays the stored
  // outcome instead of charging again. Key is optional during rollout; once
  // all clients send it, flip REQUIRE_KEY to true.
  const REQUIRE_KEY = false
  const idemKey = extractIdempotencyKey(req, body)
  if (REQUIRE_KEY && !idemKey) {
    return Response.json({ error: 'Missing Idempotency-Key header.' }, { status: 400 })
  }
  if (idemKey) {
    const claim = await claimIdempotencyKey(auth.db, auth.profileId, idemKey)
    if (claim.kind === 'replay') return Response.json(claim.response, { status: claim.statusCode })
    if (claim.kind === 'in_flight') {
      return Response.json({ error: 'A checkout with this key is already in progress.' }, { status: 409 })
    }
  }

  /** Persist outcome under the idempotency key (if provided), then respond. */
  const respond = async (payload: Record<string, unknown>, status: number, orderId?: string | null) => {
    if (idemKey) await completeIdempotencyKey(auth.db, auth.profileId, idemKey, payload, status, orderId)
    return Response.json(payload, { status })
  }

  const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profileId, tierId)
  if ('error' in resolved) return respond({ error: resolved.error }, resolved.status)

  // For non-gig source types, we keep the original wallet-only behavior here.
  // Gigs support all three payment methods (wallet, saved_card, new_card).
  if (sourceType !== 'gig' && paymentMethod !== 'wallet') {
    return respond({ error: `Payment method ${paymentMethod} is only supported for gig purchases.` }, 400)
  }

  try {
    if (paymentMethod === 'saved_card' || paymentMethod === 'new_card') {
      const email = auth.profile.email || ''
      const name = auth.profile.full_name || ''

      let chargeFn: () => Promise<{ ok: boolean; status: string; message?: string; transactionId?: string | null }>

      if (paymentMethod === 'saved_card') {
        const paymentMethodId = body.paymentMethodId || body.payment_method_id
        if (!paymentMethodId) return respond({ error: 'Missing paymentMethodId' }, 400)

        const { data: cardRow, error: cardErr } = await auth.db
          .from('student_payment_methods')
          .select('vault_id, gateway')
          .eq('id', paymentMethodId)
          .eq('profile_id', auth.profileId)
          .single()
        if (cardErr || !cardRow) return respond({ error: 'Saved card not found.' }, 404)

        const provider = getPaymentProvider(cardRow.gateway)
        chargeFn = () =>
          provider.chargeVaulted({
            vaultId: cardRow.vault_id,
            amountCents: resolved.totalCents,
            currency: 'usd',
            customer: { email, name },
            metadata: { source: 'gig_checkout', gigId: resolved.gigId || null },
          })
      } else {
        const token = body.token
        if (!token) return respond({ error: 'Missing card token.' }, 400)

        const gateway = typeof body.gateway === 'string' && body.gateway ? body.gateway : getDefaultGatewayId()
        const provider = getPaymentProvider(gateway)
        chargeFn = () =>
          provider.charge({
            token,
            amountCents: resolved.totalCents,
            currency: 'USD',
            items: [
              {
                sku: resolved.gigId || resolved.sourceId,
                name: resolved.title,
                unitAmountCents: resolved.totalCents,
                quantity: 1,
              },
            ],
            customer: { email, name },
            metadata: { source: 'gig_checkout' },
          })
      }

      let result
      try {
        result = await chargeFn()
      } catch (chargeErr) {
        console.error(`[checkout/order] card charge failed: ${resolved.gigId || resolved.sourceId}`, chargeErr)
        return respond({ error: chargeErr instanceof Error ? chargeErr.message : 'Card charge failed.' }, 500)
      }

      if (result.status !== 'paid' || !result.ok) {
        console.error(`[checkout/order] card charge declined: ${resolved.gigId || resolved.sourceId}`, result.message)
        return respond({ error: result.message || 'Payment was declined.' }, 402)
      }

      // Money has moved. From here on, any failure must be recorded as an
      // incident (charge_without_order) so it can be reconciled — never
      // surface a bare 500 with a captured charge and no trace.
      let order
      try {
        order = await createPaidOrder(auth.db, resolved, { paymentMethod, actorId: auth.profileId })
      } catch (orderErr) {
        console.error('[checkout/order] order creation failed AFTER charge:', orderErr)
        await recordPaymentIncident(auth.db, {
          profileId: auth.profileId,
          kind: 'charge_without_order',
          transactionId: result.transactionId ?? null,
          amountCents: resolved.totalCents,
          context: { sourceType, sourceId, tierId: tierId ?? null, paymentMethod },
        })
        return respond(
          {
            error: 'Your payment was received but order creation failed. Support has been notified — do not retry payment.',
            transactionId: result.transactionId,
          },
          500,
        )
      }

      await creditEarningSafe(auth.db, resolved, order.id, 'gig')
      return respond({ success: true, orderId: order.id, transactionId: result.transactionId }, 200, order.id)
    }

    // ── Default wallet payment flow ─────────────────────────────────────────
    const wallet = await getOrCreateWallet(auth.profileId)
    if (wallet.balance_cents < resolved.totalCents) {
      return respond(
        { error: 'Insufficient wallet balance', balanceCents: wallet.balance_cents, requiredCents: resolved.totalCents },
        402,
      )
    }

    const tx = await debit(
      auth.profileId,
      resolved.totalCents,
      `Purchase: ${resolved.title}`,
      idemKey ? `checkout:${idemKey}` : undefined,
      { sourceType, sourceId, providerId: resolved.providerProfileId },
    )

    // Debit succeeded. If order creation fails, compensate: refund the wallet
    // so the student is never out of pocket with no order.
    let order
    try {
      order = await createPaidOrder(auth.db, resolved, { paymentMethod: 'wallet', actorId: auth.profileId })
    } catch (orderErr) {
      console.error('[checkout/order] order creation failed AFTER wallet debit — refunding:', orderErr)
      try {
        await credit(
          auth.profileId,
          resolved.totalCents,
          `Refund: failed checkout for ${resolved.title}`,
          `refund:${tx.id}`,
          { reason: 'order_creation_failed', debitTxId: tx.id },
        )
      } catch (refundErr) {
        console.error('[checkout/order] compensation refund ALSO failed:', refundErr)
        await recordPaymentIncident(auth.db, {
          profileId: auth.profileId,
          kind: 'debit_without_order',
          transactionId: tx.id,
          amountCents: resolved.totalCents,
          context: { sourceType, sourceId, tierId: tierId ?? null },
        })
      }
      return respond({ error: 'Checkout failed; your wallet was not charged.' }, 500)
    }

    await creditEarningSafe(auth.db, resolved, order.id, resolved.sourceType === 'gig' ? 'gig' : 'offer')
    return respond({ success: true, orderId: order.id, ledgerId: tx.id }, 200, order.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    console.error('[checkout/order]', message)
    return respond({ error: message }, 500)
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
