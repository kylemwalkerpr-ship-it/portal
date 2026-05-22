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
