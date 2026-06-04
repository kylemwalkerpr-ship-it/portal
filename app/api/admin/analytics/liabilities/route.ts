/**
 * GET /api/admin/analytics/liabilities
 *
 * Combined platform liability snapshot:
 *   - escrow held (orders) broken down by age
 *   - wallet liability (sum of student_wallets.balance_cents)
 *
 * Returns:
 *   escrow_outstanding_cents  total cents held across all escrow_status in
 *                             ('held','partial_released','disputed','frozen')
 *   escrow_aging              {
 *                               '0_7':   { count, cents },
 *                               '8_30':  { count, cents },
 *                               '31_60': { count, cents },
 *                               '60_plus': { count, cents },
 *                             }
 *   wallet_liability_cents    sum of student_wallets.balance_cents
 *                             (or null if wallets table unavailable)
 *   wallet_count              total wallets
 *   total_liability_cents     escrow + wallet
 *   held_orders               list of held orders sorted by age (top 25)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DAY = 86400_000

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const toCents = (n: any) => Math.round((Number(n) || 0) * 100)

  // ── Escrow held / partial / disputed / frozen ───────────────────────────────
  let escrow_outstanding_cents = 0
  const aging = {
    '0_7':     { count: 0, cents: 0 },
    '8_30':    { count: 0, cents: 0 },
    '31_60':   { count: 0, cents: 0 },
    '60_plus': { count: 0, cents: 0 },
  }
  let held_orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, order_number, status, escrow_status, escrow_amount, total_amount, client_id, consultant_id, auto_release_eligible_at, created_at')
      .in('escrow_status', ['held', 'partial_released', 'disputed', 'frozen'])
      .order('created_at', { ascending: true })
    if (error) throw error
    const rows = data ?? []
    held_orders = rows.slice(0, 25)
    for (const o of rows) {
      const cents = toCents(o.escrow_amount || o.total_amount || 0)
      escrow_outstanding_cents += cents
      const ageDays = Math.floor((now - new Date(o.created_at).getTime()) / DAY)
      const bucket = ageDays <= 7 ? '0_7' : ageDays <= 30 ? '8_30' : ageDays <= 60 ? '31_60' : '60_plus'
      aging[bucket].count += 1
      aging[bucket].cents += cents
    }
  } catch (e: any) {
    data_warnings.push(`escrow: ${e?.message || 'unavailable'}`)
  }

  // ── Wallet liability — try the existing stats route's table directly ────────
  let wallet_liability_cents: number | null = null
  let wallet_count = 0
  try {
    const { data, error } = await db.from('student_wallets').select('balance_cents')
    if (error) throw error
    wallet_liability_cents = (data ?? []).reduce((s, w: any) => s + (Number(w.balance_cents) || 0), 0)
    wallet_count = (data ?? []).length
  } catch (e: any) {
    data_warnings.push(`student_wallets: ${e?.message || 'unavailable'}`)
  }

  // ── Resolve names for the held-orders table ─────────────────────────────────
  let nameMap: Record<string, string> = {}
  try {
    const ids = [
      ...new Set([
        ...held_orders.map(o => o.client_id),
        ...held_orders.map(o => o.consultant_id),
      ].filter(Boolean)),
    ]
    if (ids.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', ids)
      for (const p of profs ?? []) nameMap[p.id] = p.full_name || p.email || ''
    }
  } catch (e: any) {
    data_warnings.push(`held_order_names: ${e?.message || 'unavailable'}`)
  }

  const held_orders_out = held_orders.map(o => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    escrow_status: o.escrow_status,
    age_days: Math.floor((now - new Date(o.created_at).getTime()) / DAY),
    amount_cents: toCents(o.escrow_amount || o.total_amount || 0),
    client_name: nameMap[o.client_id] || null,
    consultant_name: nameMap[o.consultant_id] || null,
    created_at: o.created_at,
    auto_release_eligible_at: o.auto_release_eligible_at,
  }))

  const total_liability_cents = escrow_outstanding_cents + (wallet_liability_cents ?? 0)

  return ok({
    escrow_outstanding_cents,
    escrow_aging: aging,
    wallet_liability_cents,
    wallet_count,
    total_liability_cents,
    held_orders: held_orders_out,
    data_warnings,
  })
}
