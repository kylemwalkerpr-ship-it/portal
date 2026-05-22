/**
 * POST /api/wallet/topup
 * Body:
 *   { cardId, amountCents }          — charge a saved card
 *   { token, amountCents, saveCard } — charge a new card token (Collect.js)
 *
 * On successful charge → wallet.credit() with reference = NMI transaction_id.
 */
import { getCurrentStudent } from '@/lib/student'
import { getPaymentProvider } from '@/lib/payments'
import { credit, getOrCreateWallet } from '@/lib/wallet'
import { addCard } from '@/lib/payment-methods'
import { createSupabaseAdminClient } from '@/lib/supabase'

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

  const provider = getPaymentProvider()
  const profile = auth.profile
  const customer = { id: profile.id, email: profile.email, name: profile.full_name }

  try {
    let chargeResult

    // ── Saved card path ─────────────────────────────────────────────────────
    if (typeof body.cardId === 'string' && body.cardId) {
      const db = createSupabaseAdminClient()
      const { data: cardRow, error: cardErr } = await db
        .from('student_payment_methods')
        .select('vault_id')
        .eq('id', body.cardId)
        .eq('profile_id', profile.id)
        .single()

      if (cardErr || !cardRow) {
        return Response.json({ error: 'Card not found' }, { status: 404 })
      }

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
      chargeResult = await provider.charge({
        token: body.token,
        amountCents,
        currency: 'usd',
        items: [],
        customer,
        metadata: { source: 'wallet_topup', profile_id: profile.id },
      })

      // Optionally vault the card for future use
      if (body.saveCard === true && provider.supportsVault) {
        try {
          await addCard(profile.id, body.token, {
            brand: typeof body.brand === 'string' ? body.brand : undefined,
            last4: typeof body.last4 === 'string' ? body.last4 : undefined,
            expMonth: typeof body.exp_month === 'number' ? body.exp_month : undefined,
            expYear: typeof body.exp_year === 'number' ? body.exp_year : undefined,
          })
        } catch (vaultErr) {
          // Non-fatal: the top-up succeeded, card vaulting is a convenience
          console.warn('[wallet/topup] vaultCard failed after charge:', vaultErr)
        }
      }
    }

    else {
      return Response.json({ error: 'Provide either cardId (saved card) or token (new card)' }, { status: 400 })
    }

    if (!chargeResult.ok || chargeResult.status !== 'paid') {
      return Response.json(
        { error: chargeResult.message || 'Payment declined' },
        { status: chargeResult.status === 'declined' ? 402 : 500 }
      )
    }

    // Credit the wallet
    const tx = await credit(
      profile.id,
      amountCents,
      `Wallet top-up via ${body.cardId ? 'saved card' : 'new card'}`,
      chargeResult.transactionId ?? undefined
    )

    return Response.json({
      success: true,
      transactionId: chargeResult.transactionId,
      ledgerId: tx.id,
      balanceCents: tx.balance_after_cents,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Top-up failed'
    console.error('[wallet/topup]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
