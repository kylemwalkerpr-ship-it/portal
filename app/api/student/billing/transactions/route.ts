/**
 * GET /api/student/billing/transactions
 * Unified transaction ledger derived from the student's orders. Each order
 * produces 1–3 ledger entries (purchase, refund, wallet credit, escrow
 * release) depending on its lifecycle. Paginated + filterable.
 *
 * Query params:
 *   type     — purchase | refund | wallet_credit | release | all
 *   q        — search across order_number, requirements, service title
 *   from     — ISO date (inclusive)
 *   to       — ISO date (inclusive)
 *   page     — 1-indexed page (default 1)
 *   page_size — default 25, max 100
 *
 * Format: ?format=csv returns a CSV download instead of JSON.
 */
import { getCurrentStudent } from '@/lib/student'

type Tx = {
  id: string
  date: string
  type: 'purchase' | 'refund' | 'wallet_credit' | 'release' | 'topup'
  description: string
  orderId: string | null
  orderNumber: string | null
  amountCents: number
  signedCents: number
  status: string
  currency: string
  /** Where this entry came from: derived from an order vs the wallet ledger. */
  source?: 'order' | 'wallet'
  /** Plain-language description of the event that triggered the movement. */
  event?: string
  /** Wallet balance after this movement (wallet-side rows only). */
  balanceAfterCents?: number | null
  /** Underlying reference (order / offer / session id) when known. */
  reference?: string | null
  /** Stable id of the underlying row, quotable to support. */
  transactionId?: string | null
}

function dollarsToCents(d: unknown) { return Math.round(Number(d || 0) * 100) }

export async function GET(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { searchParams } = new URL(req.url)
  const type      = searchParams.get('type')      || 'all'
  const q         = searchParams.get('q')?.trim() || ''
  const fromISO   = searchParams.get('from')      || ''
  const toISO     = searchParams.get('to')        || ''
  const page      = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize  = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const format    = (searchParams.get('format') || 'json').toLowerCase()

  // Load orders (we synthesize the ledger from these). For a heavy-user
  // student this could be a lot of rows; we cap at 1000 ledger entries
  // pre-pagination which covers ~500 orders — plenty for in-app review.
  let { data: orderRows, error } = await db
    .from('orders')
    .select('id, order_number, status, requirements, created_at, total_amount, currency, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, refund_status, refunded_at, refunded_amount, wallet_credit_amount')
    .eq('client_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error && /column .* does not exist/i.test(error.message || '')) {
    // Strip the offending column from the SELECT and retry.
    const m = error.message.match(/column .*\.(\w+) does not exist/i)
    const bad = m?.[1]
    const baseCols = ['id', 'order_number', 'status', 'requirements', 'created_at', 'total_amount']
    const optional = ['currency', 'escrow_status', 'escrow_amount', 'escrow_released_amount', 'escrow_refunded_amount', 'refund_status', 'refunded_at', 'refunded_amount', 'wallet_credit_amount']
    const cols = [...baseCols, ...optional.filter(c => c !== bad)].join(', ')
    const r = await db
      .from('orders')
      .select(cols)
      .eq('client_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(500)
    // If the retry still fails on another missing column, fall back to SELECT *
    if (r.error && /column .* does not exist/i.test(r.error.message || '')) {
      const r2 = await db.from('orders').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(500)
      orderRows = r2.data as any
      error = r2.error as any
    } else {
      orderRows = r.data as any
      error = r.error as any
    }
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hydrate service titles for nicer descriptions
  const orderIds = (orderRows ?? []).map(o => o.id)
  const itemsRes = orderIds.length
    ? await db.from('order_items').select('order_id, service_id').in('order_id', orderIds)
    : { data: [] }
  const items = itemsRes.data ?? []
  const serviceIds = items.map((i: any) => i.service_id).filter(Boolean)
  const servicesRes = serviceIds.length
    ? await db.from('services').select('id, title').in('id', serviceIds)
    : { data: [] }
  const services = servicesRes.data ?? []
  const itemByOrder = new Map(items.map((i: any) => [i.order_id, i]))
  const serviceById = new Map(services.map((s: any) => [s.id, s]))

  // Build ledger
  const ledger: Tx[] = []
  for (const o of orderRows ?? []) {
    const item = itemByOrder.get(o.id)
    const svc = item ? serviceById.get((item as any).service_id) : null
    const label = (svc as any)?.title || o.requirements || 'Order'
    const cur = String(o.currency || 'usd').toLowerCase()

    // Purchase
    const purchaseCents = dollarsToCents(o.total_amount)
    if (purchaseCents > 0) {
      ledger.push({
        id: `${o.id}-purchase`,
        date: o.created_at,
        type: 'purchase',
        description: label,
        orderId: o.id,
        orderNumber: o.order_number || null,
        amountCents: purchaseCents,
        signedCents: -purchaseCents, // money out
        status: o.status || 'completed',
        currency: cur,
        source: 'order',
        event: 'You placed this order. Payment is held in escrow until you approve delivery.',
        reference: o.id,
        transactionId: o.id,
      })
    }

    // Refund (if any)
    const refundCents = dollarsToCents(o.refunded_amount)
    if (refundCents > 0 && o.refunded_at) {
      ledger.push({
        id: `${o.id}-refund`,
        date: o.refunded_at,
        type: 'refund',
        description: `Refund — ${label}`,
        orderId: o.id,
        orderNumber: o.order_number || null,
        amountCents: refundCents,
        signedCents: +refundCents, // money in
        status: o.refund_status || 'refunded',
        currency: cur,
        source: 'order',
        event: 'This order was refunded to you.',
        reference: o.id,
        transactionId: o.id,
      })
    }

    // Wallet credit (refund routed to wallet)
    const creditCents = dollarsToCents(o.wallet_credit_amount)
    if (creditCents > 0 && o.refund_status && o.refund_status.startsWith('wallet_credit')) {
      ledger.push({
        id: `${o.id}-wallet`,
        date: o.refunded_at || o.created_at,
        type: 'wallet_credit',
        description: `Wallet credit — ${label}`,
        orderId: o.id,
        orderNumber: o.order_number || null,
        amountCents: creditCents,
        signedCents: +creditCents,
        status: o.refund_status,
        currency: cur,
        source: 'order',
        event: 'A refund for this order was credited to your wallet instead of your card.',
        reference: o.id,
        transactionId: o.id,
      })
    }

    // Escrow release — informational entry (no cash movement to student)
    const releasedCents = dollarsToCents(o.escrow_released_amount)
    if (releasedCents > 0 && o.escrow_status === 'released') {
      ledger.push({
        id: `${o.id}-release`,
        date: o.created_at, // we lack an "escrow released at" timestamp on the order row
        type: 'release',
        description: `Escrow released — ${label}`,
        orderId: o.id,
        orderNumber: o.order_number || null,
        amountCents: releasedCents,
        signedCents: 0, // not a cash movement
        status: 'released',
        currency: cur,
        source: 'order',
        event: 'You approved delivery — escrow was released to your consultant. No new charge to you.',
        reference: o.id,
        transactionId: o.id,
      })
    }
  }

  // ── Wallet-side transactions (top-ups, admin credits, adjustments) ──────────
  // Anything that moved the wallet balance independently of an order needs to
  // surface here too, otherwise students see a $20 balance with no record of
  // how it got there. We pull from wallet_transactions and skip rows that are
  // already represented by an order-derived entry (any debit whose `reference`
  // matches an order id we just synthesized).
  try {
    const orderIdSet = new Set(orderIds)
    // Orders that already produced an order-derived refund / wallet-credit
    // entry above — their wallet-side refund row would be a DOUBLE entry.
    const refundedOrderIds = new Set(
      (orderRows ?? [])
        .filter((o: any) => dollarsToCents(o.refunded_amount) > 0 || dollarsToCents(o.wallet_credit_amount) > 0)
        .map((o: any) => o.id),
    )
    const { data: walletRows, error: wErr } = await db
      .from('wallet_transactions')
      .select('id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (!wErr) {
      for (const w of walletRows ?? []) {
        const isOrderDebit = (w.type === 'debit' || w.type === 'purchase') && w.reference && orderIdSet.has(w.reference)
        if (isOrderDebit) continue
        const rawType = String(w.type || '').toLowerCase()
        const meta = (w.metadata && typeof w.metadata === 'object' ? (w.metadata as any) : {}) as Record<string, any>
        const kind = (meta.kind ?? null) as string | null
        const desc = String(w.description || '')
        let mapped: Tx['type']
        // Refunds FIRST: refundToWallet routes through the wallet_credit RPC,
        // which stamps the row `type='topup'` — the truth lives in
        // metadata.kind. Without this check refunds render as "Top up".
        // The description heuristic catches legacy rows written before
        // kind tagging existed.
        if (kind === 'refund' || rawType === 'refund' || /^refund\b/i.test(desc)) mapped = 'refund'
        else if (rawType === 'topup') mapped = 'topup'
        else if (rawType === 'credit' || rawType === 'adjustment' || kind === 'admin_topup' || kind === 'loyalty_credit' || kind === 'manual_credit') mapped = 'wallet_credit'
        else if (rawType === 'debit' || rawType === 'purchase') mapped = 'purchase'
        else mapped = 'wallet_credit'
        // Skip wallet refund rows already represented by the order-derived
        // refund entry — otherwise admin refunds show twice and the ledger
        // appears to credit money that doesn't exist.
        if (mapped === 'refund' && w.reference && refundedOrderIds.has(w.reference)) continue
        // Event context: what triggered this movement, in plain language.
        const event =
          mapped === 'refund'
            ? (meta.reason === 'order_create_failed'
                ? 'Automatic refund — your payment was returned because the order could not be created.'
                : 'Refund returned to your wallet.')
            : mapped === 'topup' ? 'You added funds to your wallet.'
            : mapped === 'purchase' ? (meta.offerId ? 'Wallet payment for an accepted offer.' : 'Wallet payment.')
            : kind === 'admin_topup' ? 'Credit added by YouSafe support.'
            : kind === 'loyalty_credit' ? 'Loyalty credit from YouSafe.'
            : kind === 'manual_credit' ? 'Manual credit recorded by support.'
            : 'Credit applied to your wallet.'
        ledger.push({
          id: `wt-${w.id}`,
          date: w.created_at,
          type: mapped,
          description: desc || (mapped === 'topup' ? 'Wallet top-up' : mapped === 'refund' ? 'Refund to wallet' : mapped === 'wallet_credit' ? 'Wallet credit' : 'Wallet activity'),
          orderId: w.reference && orderIdSet.has(w.reference) ? w.reference : null,
          orderNumber: null,
          amountCents: Math.abs(Number(w.amount_cents || w.signed_cents || 0)),
          signedCents: Number(w.signed_cents || 0),
          status: 'posted',
          currency: 'usd',
          source: 'wallet',
          event,
          balanceAfterCents: w.balance_after_cents != null ? Number(w.balance_after_cents) : null,
          reference: w.reference || meta.offerId || null,
          transactionId: String(w.id),
        })
      }
    }
  } catch {
    // Self-heal: if wallet_transactions is unreachable we still return the
    // order-derived ledger rather than 500ing the whole tab.
  }

  // Filter
  let filtered = ledger
  if (type !== 'all') filtered = filtered.filter(t => t.type === type)
  if (q) {
    const qLower = q.toLowerCase()
    filtered = filtered.filter(t =>
      (t.description || '').toLowerCase().includes(qLower) ||
      (t.orderNumber || '').toLowerCase().includes(qLower)
    )
  }
  if (fromISO) {
    const from = new Date(fromISO).getTime()
    filtered = filtered.filter(t => new Date(t.date).getTime() >= from)
  }
  if (toISO) {
    const to = new Date(toISO).getTime() + 86_400_000 // end-of-day inclusive
    filtered = filtered.filter(t => new Date(t.date).getTime() <= to)
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // CSV export
  if (format === 'csv') {
    const header = ['Date', 'Type', 'Description', 'Order #', 'Amount (cents)', 'Signed (cents)', 'Status', 'Currency'].join(',')
    const rows = filtered.map(t =>
      [
        new Date(t.date).toISOString(),
        t.type,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.orderNumber || t.orderId || '',
        t.amountCents,
        t.signedCents,
        t.status,
        t.currency.toUpperCase(),
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="yousafe-transactions-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    })
  }

  // Paginate
  const total = filtered.length
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return Response.json({
    transactions: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  })
}
