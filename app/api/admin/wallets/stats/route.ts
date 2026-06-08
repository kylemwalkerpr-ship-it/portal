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
  // Classify by INTENT, not the raw `type` column. Purchases are recorded as
  // `debit` rows (there is no `purchase` type), and refunds/admin comps are
  // recorded as `topup` credits — so bucketing purely by `type` reports $0
  // purchases and lumps comps + refunds into "top-ups". We re-classify so the
  // dashboard's "top-ups" means genuine student deposits and "purchases" means
  // genuine spend; comps and refunds are tracked separately and excluded from
  // the headline volume.
  let txns30: Array<{ profile_id: string; type: string; amount_cents: number; description?: string; metadata?: any }> = []
  try {
    const { data, error } = await db
      .from('wallet_transactions')
      .select('profile_id, type, amount_cents, description, metadata')
      .gte('created_at', ago30)
    if (error) throw error
    txns30 = (data ?? []) as any[]
  } catch (e: any) {
    data_warnings.push(`txn_volume_unavailable: ${e?.message || 'unknown'}`)
  }

  const classifyTxn = (t: { type: string; description?: string; metadata?: any }): 'deposit' | 'purchase' | 'refund' | 'adjustment' => {
    const m = t.metadata && typeof t.metadata === 'object' ? t.metadata : {}
    const desc = String(t.description || '')
    const isRefund = m.kind === 'refund' || /^\s*refund/i.test(desc) || m.reason === 'order_create_failed'
    if (t.type === 'topup') {
      if (isRefund) return 'refund'
      // Admin-issued credits (comps / manual adjustments) carry an admin_id or
      // refund_method and are NOT student-funded top-ups.
      if (m.admin_id || m.refund_method) return 'adjustment'
      return 'deposit'
    }
    if (t.type === 'debit') {
      // A top-up reversal (topupTxId) or anything refund-flagged is money out as
      // a refund, not a purchase.
      if (m.topupTxId || isRefund) return 'refund'
      return 'purchase'
    }
    if (t.type === 'refund') return 'refund'
    if (t.type === 'purchase') return 'purchase'
    return 'adjustment'
  }

  const transaction_volume_30d: Record<string, number> = {
    topup_cents: 0, // genuine student deposits
    purchase_cents: 0, // genuine spend
    refund_cents: 0, // refunds (credited back or reversed)
    adjustment_cents: 0, // admin comps / manual credits
    debit_cents: 0, // raw debit total (retained for reference / back-compat)
  }
  const activeIds = new Set<string>()
  for (const t of txns30) {
    activeIds.add(t.profile_id)
    const amt = Number(t.amount_cents || 0)
    if (t.type === 'debit') transaction_volume_30d.debit_cents += amt
    switch (classifyTxn(t)) {
      case 'deposit': transaction_volume_30d.topup_cents += amt; break
      case 'purchase': transaction_volume_30d.purchase_cents += amt; break
      case 'refund': transaction_volume_30d.refund_cents += amt; break
      case 'adjustment': transaction_volume_30d.adjustment_cents += amt; break
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
