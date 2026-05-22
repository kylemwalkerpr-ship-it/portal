/**
 * POST /api/admin/wallet/topup-refund
 * Refund a wallet top-up, capped at min(originalTopup, currentBalance).
 * NMI-first-then-debit ordering; out-of-band path skips NMI.
 */

import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { debit } from '@/lib/wallet'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const topupTxId = String(body.topupTxId || '')
  const amountCents = Number(body.amountCents)
  const reason = typeof body.reason === 'string' ? body.reason : undefined
  const outOfBand =
    body.outOfBand && typeof body.outOfBand === 'object'
      ? (body.outOfBand as { method?: string; reference?: string })
      : null

  if (!topupTxId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return Response.json({ error: 'topupTxId and positive amountCents are required' }, { status: 400 })
  }

  // 1. Look up the original top-up
  const { data: topup, error: topupErr } = await auth.db
    .from('wallet_transactions')
    .select('id, profile_id, amount_cents, reference, type')
    .eq('id', topupTxId)
    .eq('type', 'topup')
    .single()

  if (topupErr || !topup) {
    return Response.json({ error: 'Top-up transaction not found' }, { status: 404 })
  }
  if (!topup.reference) {
    return Response.json({ error: 'Top-up has no gateway reference (NMI tx id)' }, { status: 422 })
  }
  if (Number(topup.amount_cents) <= 0) {
    return Response.json({ error: 'Top-up amount is not positive' }, { status: 422 })
  }

  const profileId = topup.profile_id
  const originalTopup = Number(topup.amount_cents)
  const originalNmiTxId = topup.reference

  // 2. Resolve current balance
  const { data: walletRow, error: walletErr } = await auth.db
    .from('student_wallets')
    .select('balance_cents')
    .eq('profile_id', profileId)
    .single()

  if (walletErr || !walletRow) {
    return Response.json({ error: 'Could not read student wallet' }, { status: 500 })
  }

  const currentBalance = Number(walletRow.balance_cents)
  const cap = Math.min(originalTopup, currentBalance)

  if (amountCents > cap) {
    return Response.json(
      {
        error: 'Refund exceeds allowable cap',
        maxRefundCents: cap,
        balanceCents: currentBalance,
        originalCents: originalTopup,
      },
      { status: 400 }
    )
  }

  // 3. Card-refund path: NMI first, then debit wallet
  if (!outOfBand) {
    const provider = getPaymentProvider()
    const refundResult = await provider.refund(originalNmiTxId, amountCents)

    if (!refundResult.ok) {
      return Response.json(
        { error: refundResult.message || 'Gateway refund failed' },
        { status: 422 }
      )
    }

    // Debit wallet (ledger row type = refund)
    const tx = await debit(
      profileId,
      amountCents,
      reason || `Refund of top-up ${topupTxId}`,
      originalNmiTxId,
      { topupTxId, reason, gatewayRefundTx: refundResult.transactionId }
    )

    return Response.json({
      success: true,
      ledgerId: tx.id,
      balanceCents: tx.balance_after_cents,
      gatewayRefundTx: refundResult.transactionId,
    })
  }

  // 4. Out-of-band path: skip NMI, debit wallet as adjustment
  const method = String(outOfBand.method || 'manual')
  const oobRef = String(outOfBand.reference || '')
  const tx = await debit(
    profileId,
    amountCents,
    reason || `Out-of-band refund of top-up ${topupTxId}`,
    `${method}:${oobRef}`,
    { topupTxId, reason, outOfBand: { method, reference: oobRef } }
  )

  return Response.json({
    success: true,
    ledgerId: tx.id,
    balanceCents: tx.balance_after_cents,
  })
}
