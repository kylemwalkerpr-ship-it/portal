/**
 * POST /api/wallet/topup
 * Body:
 *   { cardId, amountCents }          — charge a saved card
 *   { token, amountCents, saveCard } — charge a new card token (Collect.js)
 *
 * On successful charge → wallet.credit() with reference = NMI transaction_id.
 */
import { getCurrentStudent } from '@/lib/student'
import { getDefaultGatewayId, getPaymentProvider } from '@/lib/payments'
import { credit, getOrCreateWallet } from '@/lib/wallet'
import { addCard } from '@/lib/payment-methods'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  extractIdempotencyKey,
  recordPaymentIncident,
} from '@/lib/idempotency'

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const amountCents = Number(body.amountCents)
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    return Response.json({ error: 'Amount must be an integer of at least 100 cents (USD 1.00)' }, { status: 400 })
  }

  // Idempotency: a duplicate request (double-click / retry) with the same key
  // replays the stored outcome instead of charging the card again.
  const adminDb = createSupabaseAdminClient()
  const idemKey = extractIdempotencyKey(req, body)
  if (idemKey) {
    const claim = await claimIdempotencyKey(adminDb, auth.profile.id, idemKey)
    if (claim.kind === 'replay') return Response.json(claim.response, { status: claim.statusCode })
    if (claim.kind === 'in_flight') {
      return Response.json({ error: 'A top-up with this key is already in progress.' }, { status: 409 })
    }
  }
  const respond = async (payload: Record<string, unknown>, status: number) => {
    if (idemKey) await completeIdempotencyKey(adminDb, auth.profile.id, idemKey, payload, status)
    return Response.json(payload, { status })
  }

  const profile = auth.profile
  const customer = { id: profile.id, email: profile.email, name: profile.full_name }
  const newCardGateway = (typeof body.gateway === 'string' && body.gateway ? body.gateway : getDefaultGatewayId()).toLowerCase()

  try {
    let chargeResult

    // ── Saved card path ─────────────────────────────────────────────────────
    if (typeof body.cardId === 'string' && body.cardId) {
      const db = createSupabaseAdminClient()
      const { data: cardRow, error: cardErr } = await db
        .from('student_payment_methods')
        .select('vault_id, gateway')
        .eq('id', body.cardId)
        .eq('profile_id', profile.id)
        .single()

      if (cardErr || !cardRow) {
        return respond({ error: 'Card not found' }, 404)
      }

      const provider = getPaymentProvider(cardRow.gateway)
      chargeResult = await provider.chargeVaulted({
        vaultId: cardRow.vault_id,
        amountCents,
        currency: 'usd',
        customer,
        metadata: { source: 'wallet_topup', profile_id: profile.id },
      })
    }

    // ── New card token path ─────────────────────────────────────────────────
    else if (typeof body.token === 'string' && body.token) {
      const provider = getPaymentProvider(newCardGateway)
      chargeResult = await provider.charge({
        token: body.token,
        amountCents,
        currency: 'usd',
        items: [],
        customer,
        metadata: { source: 'wallet_topup', profile_id: profile.id },
      })

      // Optionally vault the card for future use — pin to the same gateway
      // we just charged through so the saved card and the in-flight token
      // share an issuer.
      if (body.saveCard === true && provider.supportsVault) {
        try {
          await addCard(
            profile.id,
            body.token,
            {
              brand: typeof body.brand === 'string' ? body.brand : undefined,
              last4: typeof body.last4 === 'string' ? body.last4 : undefined,
              expMonth: typeof body.exp_month === 'number' ? body.exp_month : undefined,
              expYear: typeof body.exp_year === 'number' ? body.exp_year : undefined,
            },
            newCardGateway,
          )
        } catch (vaultErr) {
          // Non-fatal: the top-up succeeded, card vaulting is a convenience
          console.warn('[wallet/topup] vaultCard failed after charge:', vaultErr)
        }
      }
    }

    else {
      return respond({ error: 'Provide either cardId (saved card) or token (new card)' }, 400)
    }

    if (!chargeResult.ok || chargeResult.status !== 'paid') {
      return respond(
        { error: chargeResult.message || 'Payment declined' },
        chargeResult.status === 'declined' ? 402 : 500
      )
    }

    // Credit the wallet. The card has been charged — if the credit fails
    // (e.g. unique-reference conflict from a replayed gateway callback, or a
    // transient DB error) we must record an incident, never lose the money.
    let tx
    try {
      tx = await credit(
        profile.id,
        amountCents,
        `Wallet top-up via ${body.cardId ? 'saved card' : 'new card'}`,
        chargeResult.transactionId ?? undefined
      )
    } catch (creditErr) {
      console.error('[wallet/topup] credit failed AFTER charge:', creditErr)
      await recordPaymentIncident(adminDb, {
        profileId: profile.id,
        kind: 'charge_without_order',
        transactionId: chargeResult.transactionId ?? null,
        amountCents,
        context: { source: 'wallet_topup' },
      })
      return respond(
        { error: 'Your card was charged but the wallet credit failed. Support has been notified — do not retry.', transactionId: chargeResult.transactionId },
        500
      )
    }

    return respond({
      success: true,
      transactionId: chargeResult.transactionId,
      ledgerId: tx.id,
      balanceCents: tx.balance_after_cents,
    }, 200)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Top-up failed'
    console.error('[wallet/topup]', msg)
    return respond({ error: msg }, 500)
  }
}
