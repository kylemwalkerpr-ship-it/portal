import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'
import {
  resolveCheckoutItem,
  createPaidOrder,
  type CheckoutSourceType,
} from './checkoutOrders'
import { extractIdempotencyKey, claimIdempotencyKey, completeIdempotencyKey, recordPaymentIncident } from './idempotency'
import { credit, debit, getOrCreateWallet } from './wallet'
import { creditEarning } from './earnings'
import { getDefaultGatewayId, getPaymentProvider } from './payments'

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────

export type MobileBuyerResult =
  | {
      status: 'authenticated'
      db: ReturnType<typeof createSupabaseAdminClient>
      profile: { id: string; role: string; status: string; email: string | null; full_name: string | null }
    }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }
  | { status: 'forbidden'; message: string; httpStatus: 403 | 404 }

export async function resolveMobileBuyer(
  authorizationHeader: string | null | undefined,
): Promise<MobileBuyerResult> {
  const auth = await verifyMobileBearer(authorizationHeader)
  if (auth.status !== 'authenticated') {
    return { status: 'unauthenticated', reason: auth.reason }
  }

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', auth.userId)
    .single()
  if (error || !profile) return { status: 'forbidden', message: 'Profile not found.', httpStatus: 404 }

  const isBuyer = profile.role === 'client' || profile.role === 'student'
  if (!isBuyer) return { status: 'forbidden', message: 'Forbidden', httpStatus: 403 }
  if (profile.status === 'suspended') return { status: 'forbidden', message: 'Account suspended', httpStatus: 403 }

  return { status: 'authenticated', db, profile }
}

export function unauthorizedResponse(reason: 'missing' | 'invalid') {
  const message =
    reason === 'missing'
      ? 'Missing session token. User must sign in.'
      : 'Invalid session token. User must sign in.'
  return Response.json({ error: { message }, signInRequired: true }, { status: 401 })
}

// ─────────────────────────────────────────────────────────────
// Checkout: POST /api/mobile/checkout/order
// ─────────────────────────────────────────────────────────────

type Resolved = Exclude<Awaited<ReturnType<typeof resolveCheckoutItem>>, { error: string; status: number }>

async function creditEarningSafe(
  db: ReturnType<typeof createSupabaseAdminClient>,
  resolved: Resolved,
  orderId: string,
) {
  try {
    await creditEarning({
      providerId: resolved.providerProfileId,
      orderId,
      source: 'gig',
      amountCents: resolved.netPayoutCents,
      feeCents: resolved.platformFeeCents,
    })
  } catch (earnErr) {
    console.error('[mobile/checkout] creditEarning failed:', earnErr)
    await recordPaymentIncident(db, {
      profileId: resolved.providerProfileId,
      kind: 'earning_credit_failed',
      amountCents: resolved.netPayoutCents,
      context: { orderId, source: 'gig', clientProfileId: resolved.clientProfileId },
    })
  }
}

export async function handleMobileCheckout(
  req: Request,
  auth: Extract<MobileBuyerResult, { status: 'authenticated' }>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}))
  const sourceType = String(body.sourceType || body.source_type || '') as CheckoutSourceType
  const sourceId = String(body.sourceId || body.source_id || '')
  const tierId = body.tierId || body.tier_id ? String(body.tierId || body.tier_id) : undefined
  const paymentMethod = String(body.paymentMethod || body.payment_method || 'wallet')

  // ── Source type: gig only ────────────────────────────────────────
  if (sourceType !== 'gig' || !sourceId) {
    return Response.json({ error: { message: 'Invalid checkout source. Mobile checkout only supports gig purchases.' } }, { status: 400 })
  }
  if (!tierId) {
    return Response.json({ error: { message: 'A package/tier must be selected.' } }, { status: 400 })
  }

  // ── Idempotency guard (REQUIRED on mobile) ───────────────────────
  const idemKey = extractIdempotencyKey(req, body)
  if (!idemKey) {
    return Response.json({ error: { message: 'Missing Idempotency-Key header.' } }, { status: 400 })
  }

  const claim = await claimIdempotencyKey(auth.db, auth.profile.id, idemKey)
  if (claim.kind === 'replay') return Response.json(claim.response, { status: claim.statusCode })
  if (claim.kind === 'in_flight') {
    return Response.json({ error: { message: 'A checkout with this key is already in progress.' } }, { status: 409 })
  }

  const respond = async (payload: Record<string, unknown>, status: number, orderId?: string | null) => {
    await completeIdempotencyKey(auth.db, auth.profile.id, idemKey, payload, status, orderId)
    return Response.json(payload, { status })
  }

  // ── Resolve item (server-authoritative pricing) ───────────────────
  const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profile.id, tierId)
  if ('error' in resolved) return respond({ error: { message: resolved.error } }, resolved.status)

  try {
    // ── Card payment (saved_card / new_card) ──────────────────────
    if (paymentMethod === 'saved_card' || paymentMethod === 'new_card') {
      const email = auth.profile.email || ''
      const name = auth.profile.full_name || ''

      let chargeFn: () => Promise<{ ok: boolean; status: string; message?: string; transactionId?: string | null }>

      if (paymentMethod === 'saved_card') {
        const paymentMethodId = body.paymentMethodId || body.payment_method_id
        if (!paymentMethodId) return respond({ error: { message: 'Missing paymentMethodId for saved card.' } }, 400)

        const { data: cardRow, error: cardErr } = await auth.db
          .from('student_payment_methods')
          .select('vault_id, gateway')
          .eq('id', paymentMethodId)
          .eq('profile_id', auth.profile.id)
          .single()
        if (cardErr || !cardRow) return respond({ error: { message: 'Saved card not found.' } }, 404)

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
        if (!token) return respond({ error: { message: 'Missing card token.' } }, 400)

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
        console.error(`[mobile/checkout] card charge failed: ${resolved.gigId || resolved.sourceId}`, chargeErr)
        return respond({ error: { message: chargeErr instanceof Error ? chargeErr.message : 'Card charge failed.' } }, 500)
      }

      if (result.status !== 'paid' || !result.ok) {
        console.error(`[mobile/checkout] card charge declined: ${resolved.gigId || resolved.sourceId}`, result.message)
        return respond({ error: { message: result.message || 'Payment was declined.' } }, 402)
      }

      let order
      try {
        order = await createPaidOrder(auth.db, resolved, { paymentMethod, actorId: auth.profile.id })
      } catch (orderErr) {
        console.error('[mobile/checkout] order creation failed AFTER charge:', orderErr)
        await recordPaymentIncident(auth.db, {
          profileId: auth.profile.id,
          kind: 'charge_without_order',
          transactionId: result.transactionId ?? null,
          amountCents: resolved.totalCents,
          context: { sourceType, sourceId, tierId: tierId ?? null, paymentMethod },
        })
        return respond(
          {
            error: { message: 'Your payment was received but order creation failed. Support has been notified — do not retry payment.' },
            transactionId: result.transactionId,
          },
          500,
        )
      }

      await creditEarningSafe(auth.db, resolved, order.id)
      return respond({ success: true, orderId: order.id, transactionId: result.transactionId }, 200, order.id)
    }

    // ── Wallet payment ──────────────────────────────────────────
    if (paymentMethod !== 'wallet') {
      return respond({ error: { message: `Unsupported payment method: ${paymentMethod}` } }, 400)
    }

    const wallet = await getOrCreateWallet(auth.profile.id)
    if (wallet.balance_cents < resolved.totalCents) {
      return respond(
        {
          error: { message: 'Insufficient wallet balance' },
          balanceCents: wallet.balance_cents,
          requiredCents: resolved.totalCents,
        },
        402,
      )
    }

    const tx = await debit(
      auth.profile.id,
      resolved.totalCents,
      `Purchase: ${resolved.title}`,
      `checkout:${idemKey}`,
      { sourceType, sourceId, providerId: resolved.providerProfileId },
    )

    let order
    try {
      order = await createPaidOrder(auth.db, resolved, { paymentMethod: 'wallet', actorId: auth.profile.id })
    } catch (orderErr) {
      console.error('[mobile/checkout] order creation failed AFTER wallet debit — refunding:', orderErr)
      try {
        await credit(
          auth.profile.id,
          resolved.totalCents,
          `Refund: failed checkout for ${resolved.title}`,
          `refund:${tx.id}`,
          { reason: 'order_creation_failed', debitTxId: tx.id },
        )
      } catch (refundErr) {
        console.error('[mobile/checkout] compensation refund ALSO failed:', refundErr)
        await recordPaymentIncident(auth.db, {
          profileId: auth.profile.id,
          kind: 'debit_without_order',
          transactionId: tx.id,
          amountCents: resolved.totalCents,
          context: { sourceType, sourceId, tierId: tierId ?? null },
        })
      }
      return respond({ error: { message: 'Checkout failed; your wallet was not charged.' } }, 500)
    }

    await creditEarningSafe(auth.db, resolved, order.id)
    return respond({ success: true, orderId: order.id, ledgerId: tx.id }, 200, order.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    console.error('[mobile/checkout]', message)
    return respond({ error: { message } }, 500)
  }
}