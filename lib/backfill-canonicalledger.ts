/**
 * Backfill canonical_ledger from existing financial tables.
 *
 * Idempotent — uses ON CONFLICT DO NOTHING on the (source_table, source_id)
 * unique constraint, so it can be run multiple times safely.
 *
 * Run via: npx tsx lib/backfill-canonicalledger.ts
 * Or:      curl https://portal.yousafeconsultancy.com/api/admin/ledger/backfill
 *
 * Sources (in order):
 *   1. wallet_transactions  → topup, debit, refund, adjustment, purchase
 *   2. orders               → purchase (student side), fee (platform), payout (provider)
 *   3. escrow_events        → escrow_deposit, escrow_release, escrow_refund
 *   4. provider_earnings    → payout (provider side)
 *   5. refund_ledger        → refund entries
 */

import { createSupabaseAdminClient } from './supabase'

type Direction = 'debit' | 'credit'

type LedgerInsert = {
  profile_id: string | null
  counterparty_id: string | null
  amount_cents: number
  currency: string
  balance_after_cents: number
  entry_type: string
  direction: Direction
  source_table: string
  source_id: string
  order_id: string | null
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

const db = createSupabaseAdminClient()
const BATCH_SIZE = 250

/** Insert a batch of ledger rows, skipping duplicates. */
async function insertBatch(rows: LedgerInsert[]): Promise<number> {
  if (rows.length === 0) return 0
  // Use upsert with ignoreDuplicates to safely re-run the backfill.
  const { error } = await (db
    .from('canonical_ledger')
    .upsert(rows, { onConflict: 'source_table, source_id', ignoreDuplicates: true } as any) as any)
  if (error) {
    console.error('Batch insert error:', error.message)
    return 0
  }
  return rows.length
}

/** Build running balances from scratch for a set of rows ordered by created_at. */
function computeBalances(
  rows: LedgerInsert[]
): LedgerInsert[] {
  const balanceMap = new Map<string, number>()
  return rows.map(r => {
    const key = r.profile_id || '__platform__'
    const current = balanceMap.get(key) || 0
    const delta = r.direction === 'credit' ? r.amount_cents : -r.amount_cents
    const newBalance = Math.max(0, current + delta)
    balanceMap.set(key, newBalance)
    return { ...r, balance_after_cents: newBalance }
  })
}

// ─── 1. wallet_transactions ───────────────────────────────────────────────────
async function backfillWalletTransactions(): Promise<number> {
  let total = 0
  let offset = 0
  let hasMore = true

  const TYPE_MAP: Record<string, string> = {
    topup: 'topup',
    debit: 'purchase',
    refund: 'refund',
    adjustment: 'adjustment',
    purchase: 'purchase',
  }

  while (hasMore) {
    const { data, error } = await db
      .from('wallet_transactions')
      .select('id, profile_id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('wallet_transactions fetch error:', error.message); break }
    if (!data || data.length === 0) break

    const rows: LedgerInsert[] = data.map(t => {
      const entryType = TYPE_MAP[t.type] || 'adjustment'
      const direction: Direction = (t.signed_cents ?? t.amount_cents) >= 0 ? 'credit' : 'debit'
      return {
        profile_id: t.profile_id,
        counterparty_id: null,
        amount_cents: Math.abs(Number(t.amount_cents || t.signed_cents || 0)),
        currency: 'usd',
        balance_after_cents: Number(t.balance_after_cents || 0),
        entry_type: entryType,
        direction,
        source_table: 'wallet_transactions',
        source_id: t.id,
        order_id: null,
        description: t.description || `Wallet ${t.type}`,
        metadata: (t.metadata as Record<string, unknown>) || {},
        created_at: t.created_at,
      }
    })

    const inserted = await insertBatch(rows)
    total += inserted
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) hasMore = false
  }
  return total
}

// ─── 2. Orders ────────────────────────────────────────────────────────────────
async function backfillOrders(): Promise<number> {
  let total = 0
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await db
      .from('orders')
      .select('id, client_id, consultant_id, attorney_id, status, total_amount, platform_fee_amount, consultant_payout_amount, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('orders fetch error:', error.message); break }
    if (!data || data.length === 0) break

    const rows: LedgerInsert[] = []
    const validOrders = data.filter(o =>
      o.status !== 'cancelled' &&
      o.status !== 'refunded' &&
      Number(o.total_amount || 0) > 0
    )

    for (const o of validOrders) {
      const totalCents = Math.round(Number(o.total_amount || 0) * 100)
      const feeCents = Math.round(Number(o.platform_fee_amount || 0) * 100)
      const payoutCents = Math.round(Number(o.consultant_payout_amount || 0) * 100)
      const providerId = o.consultant_id || o.attorney_id

      // Student side: purchase (debit)
      if (o.client_id) {
        rows.push({
          profile_id: o.client_id,
          counterparty_id: providerId || null,
          amount_cents: totalCents,
          currency: 'usd',
          balance_after_cents: 0, // will be computed below
          entry_type: 'purchase',
          direction: 'debit',
          source_table: 'orders',
          source_id: `${o.id}-client`,
          order_id: o.id,
          description: 'Order purchase',
          metadata: { order_id: o.id, total_amount: o.total_amount },
          created_at: o.created_at,
        })
      }

      // Platform fee (credit to platform)
      if (feeCents > 0) {
        rows.push({
          profile_id: null, // platform
          counterparty_id: providerId || null,
          amount_cents: feeCents,
          currency: 'usd',
          balance_after_cents: 0,
          entry_type: 'fee',
          direction: 'credit',
          source_table: 'orders',
          source_id: `${o.id}-fee`,
          order_id: o.id,
          description: 'Platform fee',
          metadata: { order_id: o.id, platform_fee_amount: o.platform_fee_amount },
          created_at: o.created_at,
        })
      }

      // Provider payout (credit to provider) — only for released/paid orders
      if (providerId && payoutCents > 0 && ['released', 'completed', 'paid'].includes(o.status)) {
        rows.push({
          profile_id: providerId,
          counterparty_id: o.client_id || null,
          amount_cents: payoutCents,
          currency: 'usd',
          balance_after_cents: 0,
          entry_type: 'payout',
          direction: 'credit',
          source_table: 'orders',
          source_id: `${o.id}-payout`,
          order_id: o.id,
          description: 'Provider payout',
          metadata: { order_id: o.id, consultant_payout_amount: o.consultant_payout_amount },
          created_at: o.created_at,
        })
      }
    }

    const withBalances = computeBalances(rows)
    const inserted = await insertBatch(withBalances)
    total += inserted
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) hasMore = false
  }
  return total
}

// ─── 3. Escrow events ─────────────────────────────────────────────────────────
async function backfillEscrowEvents(): Promise<number> {
  let total = 0
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await db
      .from('escrow_events')
      .select('id, order_id, event_type, amount, balance_after, actor_id, actor_role, reason, metadata, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('escrow_events fetch error:', error.message); break }
    if (!data || data.length === 0) break

    const rows: LedgerInsert[] = []
    for (const e of data) {
      const absAmount = Math.abs(Number(e.amount || 0))
      if (absAmount <= 0) continue

      let entryType: string
      let direction: Direction

      if (['deposit', 'scope_increase'].includes(e.event_type)) {
        entryType = 'escrow_deposit'
        direction = 'debit'
      } else if (['full_release', 'partial_release', 'milestone_released', 'admin_force_release'].includes(e.event_type)) {
        entryType = 'escrow_release'
        direction = 'credit'
      } else if (['refund', 'dispute_resolved'].includes(e.event_type) && Number(e.amount || 0) < 0) {
        entryType = 'escrow_refund'
        direction = 'credit'
      } else continue

      rows.push({
        profile_id: null, // generic entry (order-level)
        counterparty_id: e.actor_id || null,
        amount_cents: absAmount,
        currency: 'usd',
        balance_after_cents: Math.round(Number(e.balance_after || 0) * 100),
        entry_type: entryType,
        direction,
        source_table: 'escrow_events',
        source_id: e.id,
        order_id: e.order_id || null,
        description: e.reason || `Escrow ${e.event_type}`,
        metadata: {
          event_type: e.event_type,
          actor_role: e.actor_role,
          ...((e.metadata as Record<string, unknown>) || {}),
        },
        created_at: e.created_at,
      })
    }

    const inserted = await insertBatch(rows)
    total += inserted
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) hasMore = false
  }
  return total
}

// ─── 4. Provider earnings → payout entries ────────────────────────────────────
async function backfillProviderEarnings(): Promise<number> {
  let total = 0
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await db
      .from('provider_earnings')
      .select('id, provider_id, order_id, amount_cents, fee_cents, status, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('provider_earnings fetch error:', error.message); break }
    if (!data || data.length === 0) break

    const rows: LedgerInsert[] = []
    for (const e of data) {
      const amt = Number(e.amount_cents || 0)
      if (amt <= 0) continue

      // Only 'paid' or 'releasable' earnings represent actual money movement
      if (!['paid', 'releasable'].includes(e.status)) continue

      rows.push({
        profile_id: e.provider_id,
        counterparty_id: null,
        amount_cents: amt,
        currency: 'usd',
        balance_after_cents: 0,
        entry_type: 'payout',
        direction: 'credit',
        source_table: 'provider_earnings',
        source_id: e.id,
        order_id: e.order_id ? (e.order_id as any) : null,
        description: 'Provider earnings',
        metadata: {
          fee_cents: e.fee_cents,
          status: e.status,
          earnings_id: e.id,
        },
        created_at: e.created_at,
      })
    }

    const inserted = await insertBatch(rows)
    total += inserted
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) hasMore = false
  }
  return total
}

// ─── 5. Refund ledger ─────────────────────────────────────────────────────────
async function backfillRefundLedger(): Promise<number> {
  let total = 0
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await db
      .from('refund_ledger')
      .select('id, order_id, initiated_by, amount, method, status, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('refund_ledger fetch error:', error.message); break }
    if (!data || data.length === 0) break

    const rows: LedgerInsert[] = []
    for (const r of data) {
      const amt = Math.round(Number(r.amount || 0) * 100)
      if (amt <= 0) continue
      if (r.status !== 'succeeded') continue

      rows.push({
        profile_id: null,
        counterparty_id: null,
        amount_cents: amt,
        currency: 'usd',
        balance_after_cents: 0,
        entry_type: 'refund',
        direction: 'debit', // refund is a debit against the platform
        source_table: 'refund_ledger',
        source_id: r.id,
        order_id: r.order_id || null,
        description: `Refund (${r.method})`,
        metadata: {
          initiated_by: r.initiated_by,
          method: r.method,
          status: r.status,
        },
        created_at: r.created_at,
      })
    }

    const inserted = await insertBatch(rows)
    total += inserted
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) hasMore = false
  }
  return total
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Backfilling canonical_ledger ===\n')

  console.log('1. wallet_transactions...')
  const wtCount = await backfillWalletTransactions()
  console.log(`   → ${wtCount} rows inserted\n`)

  console.log('2. orders...')
  const oCount = await backfillOrders()
  console.log(`   → ${oCount} rows inserted\n`)

  console.log('3. escrow_events...')
  const eeCount = await backfillEscrowEvents()
  console.log(`   → ${eeCount} rows inserted\n`)

  console.log('4. provider_earnings...')
  const peCount = await backfillProviderEarnings()
  console.log(`   → ${peCount} rows inserted\n`)

  console.log('5. refund_ledger...')
  const rlCount = await backfillRefundLedger()
  console.log(`   → ${rlCount} rows inserted\n`)

  const total = wtCount + oCount + eeCount + peCount + rlCount
  console.log(`=== Done. ${total} total canonical_ledger rows inserted ===`)
}

// Only run as script, not when imported
const isDirectRun = import.meta.url === `file://${process.argv[1]}`
if (isDirectRun) {
  main().catch(err => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
}

export {
  backfillWalletTransactions,
  backfillOrders,
  backfillEscrowEvents,
  backfillProviderEarnings,
  backfillRefundLedger,
}
