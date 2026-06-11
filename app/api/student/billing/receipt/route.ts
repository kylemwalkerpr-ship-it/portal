/**
 * GET /api/student/billing/receipt?tx=<ledgerId>
 *
 * Renders a bank-grade PDF receipt for any entry in the student billing
 * ledger. Ledger ids come from /api/student/billing/transactions:
 *   {orderId}-purchase | {orderId}-refund | {orderId}-wallet   (order-derived)
 *   wt-{walletTransactionId}                                   (wallet-side)
 *
 * Ownership-scoped: orders by client_id, wallet rows by profile_id.
 */
import { getCurrentStudent } from '@/lib/student'
import { getPlatformSettings } from '@/lib/platformConfig'
// Type-only import — erased at compile time, so pdf-lib never loads here.
// The receipt is rendered as print-perfect HTML (string templating, ~zero
// CPU) and the browser's native print → Save-as-PDF does the heavy work
// client-side. pdf-lib's doc.save() was blowing the host's CPU budget.
import type { ReceiptInput, ReceiptItem } from '@/lib/receipts'
import { renderReceiptHtml } from '@/lib/receiptHtml'
import { COUNTRY_LIST } from '@/lib/countryList'

function dollarsToCents(d: unknown) { return Math.round(Number(d || 0) * 100) }

function countryName(code: string | null | undefined): string {
  if (!code) return ''
  const hit = COUNTRY_LIST.find(c => c.code === String(code).toUpperCase())
  return hit?.name || String(code)
}

function billedToLines(p: Record<string, unknown>): string[] {
  const cityLine = [p.city, p.postal_code].filter(Boolean).join(' ')
  return [
    String(p.address_line1 || ''),
    String(p.address_line2 || ''),
    cityLine,
    String(p.country || '') || countryName(p.country_code as string),
    String(p.email || ''),
    p.phone ? String(p.phone) : '',
  ].filter(Boolean)
}

function receiptNumber(seed: string, date: Date): string {
  // Deterministic, human-quotable: R-YYYYMM-XXXXXX from the source row id.
  let h = 0
  for (const ch of seed) h = ((h << 5) - h + ch.charCodeAt(0)) | 0
  const tail = (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `R-${ym}-${tail}`
}

const receiptResponse = (input: ReceiptInput) =>
  new Response(renderReceiptHtml(input), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })

export async function GET(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const txId = new URL(req.url).searchParams.get('tx') || ''
  if (!txId) return Response.json({ error: 'tx parameter is required' }, { status: 400 })

  const settings = await getPlatformSettings()
  const company = {
    name: String((settings as any).platform_name || 'YouSafe Consultancy LLC'),
    address: String((settings as any).platform_address || '906 Donne Ct, Virginia Beach, VA 23462'),
    email: String((settings as any).support_email || 'support@yousafeconsultancy.com'),
    phone: String((settings as any).platform_phone || '(757) 804-3263'),
    website: String((settings as any).platform_website || 'https://yousafeconsultancy.com'),
  }

  // Student party: pull the full address block (self-healing on old schemas).
  let me: Record<string, unknown> = { full_name: profile.full_name, email: profile.email }
  {
    const r = await db
      .from('profiles')
      .select('full_name, email, phone, address_line1, address_line2, city, postal_code, country, country_code')
      .eq('id', profile.id)
      .single()
    if (!r.error && r.data) me = r.data as Record<string, unknown>
    else {
      const r2 = await db.from('profiles').select('full_name, email, country_code').eq('id', profile.id).single()
      if (!r2.error && r2.data) me = r2.data as Record<string, unknown>
    }
  }
  const billedTo = { name: String(me.full_name || me.email || 'Student'), lines: billedToLines(me) }

  // ── Wallet-side entries: wt-{id} ─────────────────────────────────────
  if (txId.startsWith('wt-')) {
    const id = txId.slice(3)
    const { data: w, error } = await db
      .from('wallet_transactions')
      .select('id, type, amount_cents, signed_cents, description, reference, metadata, created_at')
      .eq('id', id)
      .eq('profile_id', profile.id)
      .single()
    if (error || !w) return Response.json({ error: 'Transaction not found' }, { status: 404 })

    const date = new Date(w.created_at)
    const cents = Math.abs(Number(w.amount_cents ?? w.signed_cents ?? 0))
    const rawType = String(w.type || '').toLowerCase()
    const kind =
      rawType === 'topup' ? 'Wallet top-up' :
      rawType === 'refund' ? 'Wallet refund' :
      rawType === 'debit' || rawType === 'purchase' ? 'Wallet payment' : 'Wallet credit'
    const status =
      rawType === 'refund' ? 'REFUNDED' :
      rawType === 'credit' || rawType === 'adjustment' ? 'CREDITED' : 'PAID'

    const input: ReceiptInput = {
      company,
      billedTo,
      items: [{
        description: String(w.description || kind),
        quantity: 1,
        unitCents: cents,
        amountCents: cents,
      }],
      totals: { subtotalCents: cents, totalCents: cents },
      meta: {
        receiptNumber: receiptNumber(String(w.id), date),
        issuedAt: new Date(),
        transactionDate: date,
        currency: 'usd',
        status,
        kind,
        paymentMethod: rawType === 'topup' ? 'Card' : 'Wallet',
        transactionId: String(w.id),
        orderNumber: w.reference ? String(w.reference).slice(0, 18) : null,
      },
    }
    return receiptResponse(input)
  }

  // ── Order-derived entries: {orderId}-purchase|refund|wallet ──────────
  const m = txId.match(/^(.+)-(purchase|refund|wallet|release)$/)
  if (!m) return Response.json({ error: 'Unrecognised transaction id' }, { status: 400 })
  const [, orderId, entryKind] = m

  let order: any = null
  {
    const r = await db
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('client_id', profile.id)
      .single()
    if (r.error || !r.data) return Response.json({ error: 'Order not found' }, { status: 404 })
    order = r.data
  }

  const currency = String(order.currency || 'usd').toLowerCase()
  const totalCents = order.total_cents != null ? Number(order.total_cents) : dollarsToCents(order.total_amount)

  // Itemize from order_items + services; fall back to a single line.
  let items: ReceiptItem[] = []
  try {
    const { data: rows } = await db
      .from('order_items')
      .select('service_id, quantity, unit_price')
      .eq('order_id', orderId)
    if (rows && rows.length > 0) {
      const svcIds = rows.map((r: any) => r.service_id).filter(Boolean)
      const { data: svcs } = svcIds.length
        ? await db.from('services').select('id, title').in('id', svcIds)
        : { data: [] as any[] }
      const titleById = new Map((svcs ?? []).map((s: any) => [s.id, s.title]))
      // unit_price is cents in the card-checkout flow and dollars in some
      // legacy rows — disambiguate against the order total.
      const rawSum = rows.reduce((acc: number, r: any) => acc + Number(r.unit_price || 0) * Math.max(1, Number(r.quantity || 1)), 0)
      const centsScale = totalCents > 0 && Math.abs(rawSum - totalCents) <= Math.abs(rawSum * 100 - totalCents) ? 1 : 100
      items = rows.map((r: any) => {
        const qty = Math.max(1, Number(r.quantity || 1))
        const unitCents = Math.round(Number(r.unit_price || 0) * centsScale)
        return {
          description: titleById.get(r.service_id) || 'Service',
          quantity: qty,
          unitCents,
          amountCents: unitCents * qty,
        }
      })
    }
  } catch { /* fall through to single-line */ }
  if (items.length === 0) {
    items = [{
      description: String(order.requirements || 'Order').slice(0, 140),
      quantity: 1,
      unitCents: totalCents,
      amountCents: totalCents,
    }]
  }

  const date = new Date(order.created_at)
  const refundCents = dollarsToCents(order.refunded_amount)
  const creditCents = dollarsToCents(order.wallet_credit_amount)

  let kind = 'Service purchase'
  let status = 'PAID'
  let receiptTotal = totalCents
  let extraTotals: { refundCents?: number } = {}
  let txDate = date

  if (entryKind === 'refund') {
    kind = 'Refund'
    status = 'REFUNDED'
    receiptTotal = refundCents || totalCents
    txDate = order.refunded_at ? new Date(order.refunded_at) : date
    items = [{ description: `Refund — ${items[0].description}`, quantity: 1, unitCents: receiptTotal, amountCents: receiptTotal }]
  } else if (entryKind === 'wallet') {
    kind = 'Wallet credit'
    status = 'CREDITED'
    receiptTotal = creditCents || refundCents || totalCents
    txDate = order.refunded_at ? new Date(order.refunded_at) : date
    items = [{ description: `Wallet credit — ${items[0].description}`, quantity: 1, unitCents: receiptTotal, amountCents: receiptTotal }]
  } else if (entryKind === 'release') {
    kind = 'Escrow release'
    status = 'RELEASED'
    receiptTotal = dollarsToCents(order.escrow_released_amount) || totalCents
  } else if (refundCents > 0) {
    // Purchase receipt on a later-refunded order: show the refund line.
    extraTotals = { refundCents }
  }

  const input: ReceiptInput = {
    company,
    billedTo,
    items,
    totals: {
      subtotalCents: items.reduce((a, i) => a + i.amountCents, 0),
      totalCents: receiptTotal,
      ...extraTotals,
    },
    meta: {
      receiptNumber: receiptNumber(`${orderId}:${entryKind}`, txDate),
      issuedAt: new Date(),
      transactionDate: txDate,
      currency,
      status,
      kind,
      paymentMethod: order.payment_method
        ? String(order.payment_method).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
        : undefined,
      transactionId: order.transaction_id || null,
      orderNumber: order.order_number || String(orderId).slice(0, 18),
      gateway: order.gateway || null,
    },
  }

  return receiptResponse(input)
}
