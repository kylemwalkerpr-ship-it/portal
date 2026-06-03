/**
 * GET /api/admin/wallets/stats
 * Platform-wide wallet aggregates for the admin dashboard cards.
 *
 * Returns:
 *   total_balance_cents        — sum of every student_wallets.balance_cents
 *                                (this is the platform LIABILITY — most
 *                                important number)
 *   total_wallets              — count of wallet rows
 *   active_wallets_30d         — wallets with >= 1 transaction in last 30d
 *   transaction_volume_30d     — { topup, debit, refund, adjustment, purchase }
 *                                summed by amount_cents per type, 30-day window
 *   top_balances               — up to 10 highest balances joined with profile
 *   balance_distribution       — { zero, lt_50, lt_500, lt_5000, gte_5000 }
 *
 * No pagination — designed to be a single dashboard payload.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const TXN_TYPES = ['topup', 'debit', 'refund', 'adjustment', 'purchase'] as const

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const ago30 = new Date(Date.now() - 30 * 86400_000).toISOString()

  // ── 1. All wallets — needed for sum + distribution + top balances ──────────
  let wallets: Array<{ profile_id: string; balance_cents: number; currency?: string }> = []
  try {
    const { data, error } = await db
      .from('student_wallets')
      .select('profile_id, balance_cents, currency')
    if (error) throw error
    wallets = (data ?? []) as any[]
  } catch (e: any) {
    // Self-heal: maybe `currency` column missing
    if (/column .* does not exist/i.test(e?.message || '')) {
      data_warnings.push('schema_partial — student_wallets.currency missing; defaulting to USD')
      try {
        const { data, error } = await db
          .from('student_wallets')
          .select('profile_id, balance_cents')
        if (error) throw error
        wallets = (data ?? []) as any[]
      } catch (e2: any) {
        data_warnings.push(`wallets_unavailable: ${e2?.message || 'unknown'}`)
      }
    } else {
      data_warnings.push(`wallets_unavailable: ${e?.message || 'unknown'}`)
    }
  }

  const total_balance_cents = wallets.reduce((s, w) => s + Number(w.balance_cents || 0), 0)
  const total_wallets = wallets.length

  // Balance distribution buckets (in cents)
  const balance_distribution = { zero: 0, lt_50: 0, lt_500: 0, lt_5000: 0, gte_5000: 0 }
  for (const w of wallets) {
    const c = Number(w.balance_cents || 0)
    if (c <= 0) balance_distribution.zero += 1
    else if (c < 5_000) balance_distribution.lt_50 += 1
    else if (c < 50_000) balance_distribution.lt_500 += 1
    else if (c < 500_000) balance_distribution.lt_5000 += 1
    else balance_distribution.gte_5000 += 1
  }

  // Top 10 balances
  const top10 = [...wallets].sort((a, b) => Number(b.balance_cents) - Number(a.balance_cents)).slice(0, 10)
  const topIds = top10.map(w => w.profile_id)
  let topProfileMap: Record<string, any> = {}
  if (topIds.length > 0) {
    try {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', topIds)
      if (error) throw error
      for (const p of (data ?? []) as any[]) topProfileMap[p.id] = p
    } catch (e: any) {
      data_warnings.push(`top_profiles_unavailable: ${e?.message || 'unknown'}`)
    }
  }
  const top_balances = top10.map(w => {
    const p = topProfileMap[w.profile_id] || {}
    return {
      profile_id: w.profile_id,
      full_name: p.full_name || null,
      email: p.email || null,
      role: p.role || null,
      balance_cents: Number(w.balance_cents || 0),
      currency: (w as any).currency || 'USD',
    }
  })

  // ── 2. 30-day transactions ─────────────────────────────────────────────────
  let txns30: Array<{ profile_id: string; type: string; amount_cents: number }> = []
  try {
    const { data, error } = await db
      .from('wallet_transactions')
      .select('profile_id, type, amount_cents')
      .gte('created_at', ago30)
    if (error) throw error
    txns30 = (data ?? []) as any[]
  } catch (e: any) {
    data_warnings.push(`txn_volume_unavailable: ${e?.message || 'unknown'}`)
  }

  const transaction_volume_30d: Record<string, number> = {
    topup_cents: 0,
    debit_cents: 0,
    refund_cents: 0,
    adjustment_cents: 0,
    purchase_cents: 0,
  }
  const activeIds = new Set<string>()
  for (const t of txns30) {
    activeIds.add(t.profile_id)
    if ((TXN_TYPES as readonly string[]).includes(t.type)) {
      transaction_volume_30d[`${t.type}_cents`] += Number(t.amount_cents || 0)
    }
  }
  const active_wallets_30d = activeIds.size

  return ok(
    {
      total_balance_cents,
      total_wallets,
      active_wallets_30d,
      transaction_volume_30d,
      top_balances,
      balance_distribution,
    },
    {},
    data_warnings.length ? { data_warnings } : {}
  )
}
