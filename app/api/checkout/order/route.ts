import { getClerkUserId } from '@/lib/auth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { createPaidOrder, resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { guardBuyer } from '@/lib/payments/buyerGuard'
import { readAttributionToken } from '@/lib/attribution/cookies'
import { credit, debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'
import { getPaymentProvider } from '@/lib/payments'
import { assertMethodAllowed, MethodUnavailableError } from '@/lib/payments/availability'
import { createInvoiceRequestOrder } from '@/lib/payments/invoiceRequest'
import { getConfiguredDefaultGateway } from '@/lib/payments/settings'
import { marketplaceOrdersHref } from '@/lib/orderLinks'
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
  const buyerError = guardBuyer(auth)
  if (buyerError) return Response.json({ error: buyerError.error }, { status: buyerError.status })

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

  if (paymentMethod === 'invoice' || paymentMethod === 'invoice_request') {
    try {
      await assertMethodAllowed('manual:invoice', {
        profile: { id: auth.profileId }, currency: 'USD', amount: resolved.totalCents / 100, purpose: sourceType === 'gig' ? 'order' : 'offer',
      }, auth.db)
    } catch (error) {
      if (error instanceof MethodUnavailableError) {
        if (!error.invoiceRequestFallback) return respond({ error: error.message, code: error.code }, error.status)
        try {
          const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profileId)
          return respond({ error: error.message, code: error.code, fallback: 'invoice_request', orderId: invoiceOrder.id }, error.status, invoiceOrder.id)
        } catch (invoiceError) {
          console.error('[checkout/order] invoice fallback failed:', invoiceError)
          return respond({ error: 'No payment method is available and an invoice could not be requested.', code: error.code }, 503)
        }
      }
      throw error
    }
    try {
      const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profileId, { alertAdmin: false })
      return respond({ success: true, method: 'invoice_request', status: 'pending_invoice', orderId: invoiceOrder.id }, 201, invoiceOrder.id)
    } catch (invoiceError) {
      console.error('[checkout/order] invoice request failed:', invoiceError)
      return respond({ error: 'The invoice request could not be created.' }, 500)
    }
  }

  // Unified offers use their atomic accept endpoint for wallet/card payments.
  // Legacy attorney and consultant quotes share this route's existing charge flow.
  if (sourceType === 'unified_offer' && paymentMethod !== 'wallet') {
    return respond({ error: 'Use the offer acceptance flow for this payment method.' }, 400)
  }
  const methodPurpose = sourceType === 'gig' ? 'order' : 'offer'

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

        try {
          await assertMethodAllowed(`${String(cardRow.gateway || '').toLowerCase()}:card`, {
            profile: { id: auth.profileId }, currency: 'USD', amount: resolved.totalCents / 100, purpose: methodPurpose,
          }, auth.db)
        } catch (error) {
          if (error instanceof MethodUnavailableError) {
            if (error.invoiceRequestFallback) {
              try {
                const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profileId)
                return respond({ error: error.message, code: error.code, fallback: 'invoice_request', orderId: invoiceOrder.id }, error.status, invoiceOrder.id)
              } catch (invoiceError) {
                console.error('[checkout/order] invoice fallback failed:', invoiceError)
                return respond({ error: 'No payment method is available and an invoice could not be requested.', code: error.code }, 503)
              }
            }
            return respond({ error: error.message, code: error.code, ...(error.invoiceRequestFallback ? { fallback: 'invoice_request' } : {}) }, error.status)
          }
          throw error
        }
        const provider = getPaymentProvider(cardRow.gateway)
        chargeFn = () =>
          provider.chargeVaulted({
            vaultId: cardRow.vault_id,
            amountCents: resolved.totalCents,
            currency: 'usd',
            customer: { email, name },
            metadata: { source: sourceType, sourceId: resolved.sourceId },
          })
      } else {
        const token = body.token
        if (!token) return respond({ error: 'Missing card token.' }, 400)

        const gateway = typeof body.gateway === 'string' && body.gateway ? body.gateway : await getConfiguredDefaultGateway(auth.profileId, auth.db)
        try {
          await assertMethodAllowed(`${gateway.toLowerCase()}:card`, {
            profile: { id: auth.profileId }, currency: 'USD', amount: resolved.totalCents / 100, purpose: methodPurpose,
          }, auth.db)
        } catch (error) {
          if (error instanceof MethodUnavailableError) {
            if (error.invoiceRequestFallback) {
              try {
                const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profileId)
                return respond({ error: error.message, code: error.code, fallback: 'invoice_request', orderId: invoiceOrder.id }, error.status, invoiceOrder.id)
              } catch (invoiceError) {
                console.error('[checkout/order] invoice fallback failed:', invoiceError)
                return respond({ error: 'No payment method is available and an invoice could not be requested.', code: error.code }, 503)
              }
            }
            return respond({ error: error.message, code: error.code, ...(error.invoiceRequestFallback ? { fallback: 'invoice_request' } : {}) }, error.status)
          }
          throw error
        }
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
            metadata: { source: sourceType },
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
        order = await createPaidOrder(auth.db, resolved, {
          paymentMethod,
          actorId: auth.profileId,
          // P10: the paid-order binder records the real event exactly once and
          // attributes it only when this browser presented a consented session.
          attributionToken: readAttributionToken(req),
        })
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

      await creditEarningSafe(auth.db, resolved, order.id, resolved.sourceType === 'gig' ? 'gig' : 'offer')
      return respond({ success: true, orderId: order.id, url: marketplaceOrdersHref(order.id), transactionId: result.transactionId }, 200, order.id)
    }

    // ── Default wallet payment flow ─────────────────────────────────────────
    // Wallet funds are already held by the portal; gateway availability
    // settings govern external payment methods and must not block a wallet
    // debit after the checkout has verified the customer's balance.
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
      order = await createPaidOrder(auth.db, resolved, {
        paymentMethod: 'wallet',
        actorId: auth.profileId,
        attributionToken: readAttributionToken(req),
      })
    } catch (orderErr) {
      console.error('[checkout/order] order creation failed AFTER wallet debit — refunding:', orderErr)
      try {
        await credit(
          auth.profileId,
          resolved.totalCents,
          `Refund: failed checkout for ${resolved.title}`,
          `autorefund:${sourceId}:${tx.id}`,
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
    return respond({ success: true, orderId: order.id, url: marketplaceOrdersHref(order.id), ledgerId: tx.id }, 200, order.id)
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
