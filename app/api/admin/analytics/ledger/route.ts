/**
 * GET /api/admin/analytics/ledger
 *
 * Unified canonical ledger query endpoint. Every tab in the admin Financials
 * dashboard reads from here — overview, revenue, liabilities, projections,
 * risk. This one endpoint replaces the previous split across
 *   - /api/admin/analytics/financial-overview
 *   - /api/admin/analytics/overview
 *   - /api/admin/analytics/liabilities
 *   - /api/admin/analytics/projections
 *   - /api/admin/analytics/risk
 *
 * Query params:
 *   view       — overview | revenue | liabilities | projections | risk | daily_series
 *   from       — ISO date (inclusive, default 30d ago for most views)
 *   to         — ISO date (inclusive, default now)
 *   type       — filter by entry_type (comma-separated)
 *   profile_id — filter by profile (comma-separated)
 *   group      — time grouping: daily | monthly | none (default: none for totals)
 *   page       — 1-indexed page (default 1, for raw ledger view)
 *   page_size  — rows per page (default 50, max 200)
 *
 * Returns ApiEnvelope `{ data, meta }`.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const ALLOWED_VIEWS = ['overview', 'revenue', 'liabilities', 'projections', 'risk', 'daily_series']
const ALLOWED_TYPES = [
  'purchase', 'refund', 'topup', 'payout',
  'fee', 'commission', 'adjustment', 'bonus', 'discount',
  'escrow_deposit', 'escrow_release', 'escrow_refund',
  'loyalty_credit', 'chargeback',
]

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { searchParams } = new URL(req.url)
  const view = (searchParams.get('view') || 'overview').toLowerCase()
  const fromISO = searchParams.get('from') || ''
  const toISO = searchParams.get('to') || ''
  const typeFilter = searchParams.get('type') || ''
  const profileFilter = searchParams.get('profile_id') || ''
  const timeGroup = (searchParams.get('group') || 'none').toLowerCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  if (!ALLOWED_VIEWS.includes(view)) {
    return fail(`Invalid view. Must be one of: ${ALLOWED_VIEWS.join(', ')}`, 400)
  }

  const now = Date.now()
  const defaultFrom = view === 'overview' || view === 'daily_series'
    ? new Date(now - 30 * 86400_000).toISOString()
    : view === 'projections'
      ? new Date(now - 90 * 86400_000).toISOString()
      : new Date(now - 365 * 86400_000).toISOString()

  const from = fromISO || defaultFrom
  const to = toISO || new Date(now).toISOString()

  // Build base query
  let q = db
    .from('canonical_ledger')
    .select('*', { count: 'exact' })
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })

  if (typeFilter) {
    const types = typeFilter.split(',').map(t => t.trim()).filter(t => ALLOWED_TYPES.includes(t))
    if (types.length > 0) q = q.in('entry_type', types)
  }

  if (profileFilter) {
    const profiles = profileFilter.split(',').map(p => p.trim()).filter(Boolean)
    if (profiles.length > 0) q = q.in('profile_id', profiles)
  }

  // Pagination for raw ledger view
  q = q.range((page - 1) * pageSize, page * pageSize - 1)

  const { data, error, count } = await q as any
  if (error) {
    const msg = String(error.message || '')
    if (/relation .* does not exist/i.test(msg)) {
      return fail('canonical_ledger table does not exist yet — run supabase/canonical_ledger.sql first.', 503)
    }
    return fail(`Ledger query failed: ${error.message}`, 500)
  }

  const rows = (data ?? []) as any[]

  // ── Response builder ─────────────────────────────────────────────────────────
  switch (view) {
    // ── OVERVIEW ────────────────────────────────────────────────────────────────
    case 'overview': {
      // Aggregate by entry_type + direction for the period
      const agg: Record<string, { direction: string; total_cents: number; count: number }> = {}
      for (const r of rows) {
        const key = `${r.entry_type}__${r.direction}`
        if (!agg[key]) agg[key] = { direction: r.direction, total_cents: 0, count: 0 }
        agg[key].total_cents += Number(r.amount_cents || 0)
        agg[key].count += 1
      }

      const gross30 = agg['purchase__debit']?.total_cents || 0
      const netTake = agg['fee__credit']?.total_cents || 0
      const payouts = agg['payout__credit']?.total_cents || 0
      const refunds = agg['refund__debit']?.total_cents ||
                      agg['refund__credit']?.total_cents ||
                      agg['refund']?.total_cents || 0
      const refundCount = agg['refund__debit']?.count ||
                          agg['refund__credit']?.count ||
                          agg['refund']?.count || 0
      const orderCount = agg['purchase__debit']?.count || 0
      const outstandingEscrow = agg['escrow_deposit__debit']?.total_cents || 0
      const escrowReleased = agg['escrow_release__credit']?.total_cents || 0
      const escrowRefunded = agg['escrow_refund__credit']?.total_cents || 0

      // Escrow breakdown
      const escrowHeldCents = agg['escrow_deposit__debit']?.total_cents || 0
      const escrowReleasedCents = agg['escrow_release__credit']?.total_cents || 0
      const escrowRefundedCents = agg['escrow_refund__credit']?.total_cents || 0
      const escrowHeldCount = agg['escrow_deposit__debit']?.count || 0
      const escrowReleasedCount = agg['escrow_release__credit']?.count || 0
      const escrowRefundedCount = agg['escrow_refund__credit']?.count || 0

      // Disputed escrow — rows where escrow_deposit metadata flags a dispute
      const escrowDisputedRows = rows.filter((r: any) =>
        r.entry_type === 'escrow_deposit' &&
        r.metadata?.event_type === 'dispute_opened'
      )
      const escrowDisputedCents = escrowDisputedRows.reduce((s: number, r: any) => s + Number(r.amount_cents || 0), 0)
      const escrowDisputedCount = escrowDisputedRows.length

      // ── Escrow aging — fetch ALL escrow_deposits from the last 365 days ──
      // so we can show how long outstanding funds have been sitting.
      let escrowAging: Record<string, { count: number; cents: number }> = {}
      try {
        const agingRes = await (db as any)
          .from('canonical_ledger')
          .select('amount_cents, created_at')
          .eq('entry_type', 'escrow_deposit')
          .eq('direction', 'debit')
          .gte('created_at', new Date(Date.now() - 365 * 86400_000).toISOString())
          .lte('created_at', new Date().toISOString())
        const agingRows = (agingRes?.data ?? []) as any[]
        const nowMs = Date.now()
        // Initialize buckets
        escrowAging = { '0_7': { count: 0, cents: 0 }, '8_30': { count: 0, cents: 0 }, '31_60': { count: 0, cents: 0 }, '60_plus': { count: 0, cents: 0 } }
        for (const r of agingRows) {
          const ageMs = nowMs - new Date(r.created_at).getTime()
          const ageDays = ageMs / 86400_000
          const bucket = ageDays <= 7 ? '0_7' : ageDays <= 30 ? '8_30' : ageDays <= 60 ? '31_60' : '60_plus'
          escrowAging[bucket].count += 1
          escrowAging[bucket].cents += Number(r.amount_cents || 0)
        }
      } catch {
        // Non-critical — aging will just show zeros
      }

      return ok({
        gross_30d_cents: gross30,
        net_take_30d_cents: netTake,
        payouts_30d_cents: payouts,
        refund_rate_30d_pct: orderCount > 0 ? Math.round((refundCount / orderCount) * 10000) / 100 : 0,
        chargeback_dollar_30d_cents: refunds,
        outstanding_escrow_cents: Math.max(0, outstandingEscrow - escrowReleased - escrowRefunded),
        // Granular escrow breakdown for the Overview tab's Escrow Summary section
        escrow_held_cents: escrowHeldCents,
        escrow_held_count: escrowHeldCount,
        escrow_released_cents: escrowReleasedCents,
        escrow_released_count: escrowReleasedCount,
        escrow_refunded_cents: escrowRefundedCents,
        escrow_refunded_count: escrowRefundedCount,
        escrow_net_outstanding_cents: Math.max(0, escrowHeldCents - escrowReleasedCents - escrowRefundedCents),
        // Disputed escrow breakdown
        escrow_disputed_cents: escrowDisputedCents,
        escrow_disputed_count: escrowDisputedCount,
        // Escrow aging — how long outstanding deposits have been held
        escrow_aging: escrowAging,
        // Legacy fields
        platform_fee_percent: 0,
        signups_30d: 0,
        revenue_per_acquired_user_cents: 0,
      })
    }

    // ── REVENUE ─────────────────────────────────────────────────────────────────
    case 'revenue': {
      // Group by entry_type for period
      const agg: Record<string, { total_cents: number; count: number }> = {}
      for (const r of rows) {
        if (!agg[r.entry_type]) agg[r.entry_type] = { total_cents: 0, count: 0 }
        agg[r.entry_type].total_cents += Number(r.amount_cents || 0)
        agg[r.entry_type].count += 1
      }

      // For monthly breakdown, group by month
      const monthly: Record<string, { gross: number; net: number; payouts: number; refunds: number; count: number }> = {}
      for (const r of rows) {
        const month = String(r.created_at || '').slice(0, 7)
        if (!month) continue
        if (!monthly[month]) monthly[month] = { gross: 0, net: 0, payouts: 0, refunds: 0, count: 0 }
        monthly[month].count += 1
        if (r.entry_type === 'purchase' && r.direction === 'debit') monthly[month].gross += Number(r.amount_cents || 0)
        if (r.entry_type === 'fee' && r.direction === 'credit') monthly[month].net += Number(r.amount_cents || 0)
        if (r.entry_type === 'payout' && r.direction === 'credit') monthly[month].payouts += Number(r.amount_cents || 0)
        if (r.entry_type === 'refund') monthly[month].refunds += Number(r.amount_cents || 0)
      }

      return ok({
        totals: agg,
        monthly_breakdown: Object.entries(monthly)
          .map(([month, v]) => ({ month, ...v }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      })
    }

    // ── LIABILITIES ─────────────────────────────────────────────────────────────
    case 'liabilities': {
      // Outstanding escrow = escrow_deposit debits minus escrow_release/refund credits
      const escrowHeld =
        rows
          .filter(r => r.entry_type === 'escrow_deposit' && r.direction === 'debit')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)
      const escrowReleasedTotal =
        rows
          .filter(r => r.entry_type === 'escrow_release' && r.direction === 'credit')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)
      const escrowRefundedTotal =
        rows
          .filter(r => r.entry_type === 'escrow_refund' && r.direction === 'credit')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)

      const outstandingEscrow = Math.max(0, escrowHeld - escrowReleasedTotal - escrowRefundedTotal)

      // Wallet liability — sum of wallet balances for all students
      // (approximated from topup entries minus debit entries)
      const walletTopups =
        rows
          .filter(r => r.entry_type === 'topup' && r.direction === 'credit')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)
      const walletDebits =
        rows
          .filter(r => r.entry_type === 'topup' && r.direction === 'debit')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)
      const walletLiability = Math.max(0, walletTopups - walletDebits)

      // Refund totals
      const refundTotal =
        rows
          .filter(r => r.entry_type === 'refund')
          .reduce((s, r) => s + Number(r.amount_cents || 0), 0)

      return ok({
        escrow_outstanding_cents: outstandingEscrow,
        wallet_liability_cents: walletLiability,
        total_liability_cents: outstandingEscrow + walletLiability,
        refund_total_cents: refundTotal,
      })
    }

    // ── PROJECTIONS ─────────────────────────────────────────────────────────────
    case 'projections': {
      // Compute 90-day run rate from the data
      const purchaseRows = rows.filter(r => r.entry_type === 'purchase')
      const totalPurchaseCents = purchaseRows.reduce((s, r) => s + Number(r.amount_cents || 0), 0)
      const daysCovered = purchaseRows.length > 0
        ? Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 86400_000)
        : 90
      const monthlyRunRate = (totalPurchaseCents / daysCovered) * 30
      const stdDev = Math.sqrt(
        purchaseRows.reduce((s, r) => {
          const diff = Number(r.amount_cents || 0) - (totalPurchaseCents / Math.max(1, purchaseRows.length))
          return s + diff * diff
        }, 0) / Math.max(1, purchaseRows.length)
      )

      // Forward 3 months
      const forward3m = Array.from({ length: 3 }, (_, i) => {
        const month = new Date()
        month.setMonth(month.getMonth() + i + 1)
        const monthLabel = month.toISOString().slice(0, 7)
        return {
          month: monthLabel,
          point_cents: Math.round(monthlyRunRate),
          lo_cents: Math.round(Math.max(0, monthlyRunRate - stdDev)),
          hi_cents: Math.round(monthlyRunRate + stdDev),
        }
      })

      return ok({
        run_rate_30d_cents: Math.round(monthlyRunRate),
        forward_3m: forward3m,
      })
    }

    // ── RISK ─────────────────────────────────────────────────────────────────────
    case 'risk': {
      const refundRows = rows.filter(r => r.entry_type === 'refund')
      const purchaseRows = rows.filter(r => r.entry_type === 'purchase')
      const disputedRows = rows.filter(r =>
        r.entry_type === 'escrow_deposit' &&
        r.metadata?.event_type === 'dispute_opened'
      )

      const refundRate = purchaseRows.length > 0
        ? Math.round((refundRows.length / purchaseRows.length) * 10000) / 100
        : 0

      // Monthly refund rate trend
      const monthlyRefunds: Record<string, { total: number; refunded: number }> = {}
      for (const r of rows) {
        const month = String(r.created_at || '').slice(0, 7)
        if (!month) continue
        if (!monthlyRefunds[month]) monthlyRefunds[month] = { total: 0, refunded: 0 }
        monthlyRefunds[month].total += 1
        if (r.entry_type === 'refund') monthlyRefunds[month].refunded += 1
      }

      const refundTrend = Object.entries(monthlyRefunds)
        .map(([month, v]) => ({
          month,
          total_orders: v.total,
          refunded: v.refunded,
          refund_rate_pct: v.total > 0 ? Math.round((v.refunded / v.total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month))

      return ok({
        disputed_count: disputedRows.length,
        disputed_dollar_cents: disputedRows.reduce((s, r) => s + Number(r.amount_cents || 0), 0),
        refund_rate_trend: refundTrend,
        refund_rate_current_month_pct: refundRate,
      })
    }

    // ── DAILY SERIES ────────────────────────────────────────────────────────────
    case 'daily_series': {
      // Build daily aggregates — respects from/to params, defaults to 30 days
      const fromDate = new Date(from).getTime()
      const toDate = new Date(to).getTime()
      const numDays = Math.max(1, Math.min(365, Math.ceil((toDate - fromDate) / 86400_000) + 1))
      const dayMap: Record<string, { gross: number; net: number; payouts: number; refunds: number }> = {}
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(toDate - i * 86400_000).toISOString().slice(0, 10)
        dayMap[d] = { gross: 0, net: 0, payouts: 0, refunds: 0 }
      }
      for (const r of rows) {
        const d = String(r.created_at || '').slice(0, 10)
        if (!dayMap[d]) continue
        if (r.entry_type === 'purchase' && r.direction === 'debit') dayMap[d].gross += Number(r.amount_cents || 0)
        if (r.entry_type === 'fee' && r.direction === 'credit') dayMap[d].net += Number(r.amount_cents || 0)
        if (r.entry_type === 'payout' && r.direction === 'credit') dayMap[d].payouts += Number(r.amount_cents || 0)
        if (r.entry_type === 'refund') dayMap[d].refunds += Number(r.amount_cents || 0)
      }

      const series = Object.entries(dayMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date))

      return ok({
        daily_series: series,
      })
    }

    default:
      return fail('Unsupported view.', 400)
  }
}
