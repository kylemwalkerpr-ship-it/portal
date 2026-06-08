/**
 * Wallet service — single source of truth for student balances.
 * All mutations go through Supabase RPC so the ledger stays consistent.
 */

import { createSupabaseAdminClient } from './supabase'

export type Wallet = {
  profile_id: string
  balance_cents: number
  currency: string
  updated_at: string
}

export type WalletTransaction = {
  id: string
  profile_id: string
  type: 'topup' | 'debit' | 'refund' | 'adjustment' | 'purchase'
  amount_cents: number
  signed_cents: number
  balance_after_cents: number
  description: string
  reference: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const db = () => createSupabaseAdminClient()

export async function getOrCreateWallet(profileId: string): Promise<Wallet> {
  const { data, error } = await db()
    .rpc('ensure_wallet', { p_profile_id: profileId })
    .single()

  if (error) throw new Error(`Wallet ensure failed: ${error.message}`)
  return data as Wallet
}

export async function getWallet(profileId: string): Promise<Wallet | null> {
  const { data, error } = await db()
    .from('student_wallets')
    .select('*')
    .eq('profile_id', profileId)
    .single()

  if (error && error.code === 'PGRST116') return null // no rows
  if (error) throw new Error(`Wallet read failed: ${error.message}`)
  return data as Wallet
}

export async function getBalanceCents(profileId: string): Promise<number> {
  const wallet = await getWallet(profileId)
  return wallet?.balance_cents ?? 0
}

export async function credit(
  profileId: string,
  amountCents: number,
  description: string,
  reference?: string,
  metadata?: Record<string, unknown>
): Promise<WalletTransaction> {
  const { data, error } = await db()
    .rpc('wallet_credit', {
      p_profile_id: profileId,
      p_amount_cents: amountCents,
      p_description: description,
      p_reference: reference ?? null,
      p_metadata: metadata ?? null,
    })
    .single()

  if (error) throw new Error(`Wallet credit failed: ${error.message}`)
  return data as WalletTransaction
}

export async function debit(
  profileId: string,
  amountCents: number,
  description: string,
  reference?: string,
  metadata?: Record<string, unknown>
): Promise<WalletTransaction> {
  const { data, error } = await db()
    .rpc('wallet_debit', {
      p_profile_id: profileId,
      p_amount_cents: amountCents,
      p_description: description,
      p_reference: reference ?? null,
      p_metadata: metadata ?? null,
    })
    .single()

  if (error) throw new Error(`Wallet debit failed: ${error.message}`)
  return data as WalletTransaction
}

export async function getTransactions(
  profileId: string,
  opts?: { type?: string; limit?: number; offset?: number }
): Promise<{ rows: WalletTransaction[]; count: number }> {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 25))
  const offset = Math.max(0, opts?.offset ?? 0)

  let q = db()
    .from('wallet_transactions')
    .select('*', { count: 'exact' })
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.type && opts.type !== 'all') {
    q = q.eq('type', opts.type)
  }

  const { data, error, count } = await q
  if (error) throw new Error(`Ledger read failed: ${error.message}`)
  return { rows: (data ?? []) as WalletTransaction[], count: count ?? 0 }
}

/** Thrown when a refund would return more money than the customer paid in. */
export class RefundCapError extends Error {
  constructor(public maxCents: number, public requestedCents: number) {
    super(
      `Refund of ${requestedCents}¢ exceeds the refundable ceiling of ${maxCents}¢. ` +
        `Refunds can never exceed what the customer actually paid in.`
    )
    this.name = 'RefundCapError'
  }
}

/**
 * Net amount still refundable to a customer's wallet without exceeding their
 * lifetime deposits, for refunds NOT tied to a specific order/charge (order
 * refunds are capped by the order's captured amount instead).
 *
 * ceiling = genuine wallet deposits − refunds already credited back.
 * Comp/loyalty/admin credits and prior refunds never raise this ceiling, so
 * no sequence of refunds can return more than the customer genuinely deposited.
 * A wallet topup is treated as a refund (not a deposit) when its metadata is
 * tagged `kind:'refund'`, carries a `refund_method`, or its description starts
 * with "Refund" — refunds issued through this module are always tagged.
 */
export async function walletRefundCeilingCents(profileId: string): Promise<number> {
  const { data, error } = await db()
    .from('wallet_transactions')
    .select('amount_cents, description, metadata')
    .eq('profile_id', profileId)
    .eq('type', 'topup')
  if (error) throw new Error(`Refund ceiling lookup failed: ${error.message}`)

  let deposits = 0
  let refunds = 0
  for (const row of data ?? []) {
    const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
    const isRefund =
      meta.kind === 'refund' ||
      !!meta.refund_method ||
      /^\s*refund/i.test(String(row.description || ''))
    if (isRefund) refunds += Number(row.amount_cents || 0)
    else deposits += Number(row.amount_cents || 0)
  }
  return Math.max(0, deposits - refunds)
}

/**
 * Issue a refund to a customer's wallet, enforcing that it never returns more
 * than they paid in. Pass `orderCapCents` when the refund is tied to an order
 * (= captured amount − already refunded); otherwise the lifetime-deposit
 * ceiling applies. Tags the ledger row `kind:'refund'`.
 */
export async function refundToWallet(
  profileId: string,
  amountCents: number,
  description: string,
  opts?: { reference?: string; metadata?: Record<string, unknown>; orderCapCents?: number }
): Promise<WalletTransaction> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Refund amount must be a positive integer (cents).')
  }
  const ceiling =
    typeof opts?.orderCapCents === 'number'
      ? Math.max(0, Math.floor(opts.orderCapCents))
      : await walletRefundCeilingCents(profileId)
  if (amountCents > ceiling) throw new RefundCapError(ceiling, amountCents)
  return credit(profileId, amountCents, description, opts?.reference, { ...(opts?.metadata ?? {}), kind: 'refund' })
}
