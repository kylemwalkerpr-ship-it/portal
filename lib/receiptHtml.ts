/**
 * HTML receipt renderer — bank-grade layout, CPU-light.
 *
 * Server-side it is pure string templating (microseconds, safe on CPU-capped
 * runtimes like Workers). The page carries a print stylesheet sized to US
 * Letter, so "Download PDF" invokes the browser's native print → Save-as-PDF,
 * which runs on the user's machine, not the server.
 *
 * Design rules:
 *   - Watermark background: "YouSafe Consultancy" repeated diagonally as a
 *     subtle security feature.
 *   - Header band: full-width accent bar with company identity left, receipt
 *     meta right, separated by a thin rule.
 *   - Three-column footer: support contact, registered address, legal notice.
 *   - One type family, strict 8px vertical rhythm, tabular figures for all
 *     numerals, currency declared once in the table header — not per cell.
 *   - Explicit Tax line (0% renders too) for clean bookkeeping.
 */
import type { ReceiptInput } from '@/lib/receipts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function money(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents) / 100
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDateTime = (d: Date) =>
  `${fmtDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`

export function renderReceiptHtml(input: ReceiptInput): string {
  const { company, billedTo, items, totals, meta } = input
  const cur = (meta.currency || 'usd').toUpperCase()
  const isRefundish = /REFUNDED|CREDITED/i.test(meta.status)
  const taxCents = typeof totals.taxCents === 'number' ? totals.taxCents : 0

  const detailRows: Array<[string, string]> = [
    ['Transaction type', meta.kind],
    ['Transaction date', fmtDateTime(meta.transactionDate)],
    ...(meta.paymentMethod ? [['Payment method', meta.paymentMethod] as [string, string]] : []),
    ...(meta.orderNumber ? [['Order reference', meta.orderNumber] as [string, string]] : []),
    ...(meta.transactionId ? [['Transaction ID', meta.transactionId] as [string, string]] : []),
    ...(meta.gateway ? [['Processor', meta.gateway.toUpperCase()] as [string, string]] : []),
    ['Currency', cur],
  ]

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(meta.receiptNumber)} — ${esc(company.name)}</title>
<style>
  :root {
    --ink: #131722; --mid: #4b5563; --soft: #9aa3b2; --rule: #e3e7ee; --rule-strong: #131722;
    --accent: #2f2e63; --accent-light: #41408a; --wash: #f6f7fa;
    --paid: #156b43; --paid-wash: #ecf7f1; --refund: #8a5a0a; --refund-wash: #fbf3e3;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef0f4; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, 'Inter', sans-serif;
    color: var(--ink); font-size: 13px; line-height: 1.5;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; letter-spacing: 0; }

  /* ── Watermark ────────────────────────────────────────────────── */
  .sheet {
    position: relative;
    width: 8.5in;
    max-width: 100%;
    margin: 32px auto;
    background: #fff;
    padding: 0;
    box-shadow: 0 10px 40px rgba(15,23,42,0.10);
    overflow: hidden;
  }
  .sheet-watermark {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    overflow: hidden;
  }
  .sheet-watermark span {
    position: absolute;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.18em;
    color: rgba(47,46,99,0.10);
    text-transform: uppercase;
    white-space: nowrap;
    transform: rotate(-30deg);
    user-select: none;
  }
  .sheet-watermark span:nth-child(1)  { top: 5%;  left: -5%; }
  .sheet-watermark span:nth-child(2)  { top: 5%;  left: 28%; }
  .sheet-watermark span:nth-child(3)  { top: 5%;  left: 61%; }
  .sheet-watermark span:nth-child(4)  { top: 28%; left: -5%; }
  .sheet-watermark span:nth-child(5)  { top: 28%; left: 28%; }
  .sheet-watermark span:nth-child(6)  { top: 28%; left: 61%; }
  .sheet-watermark span:nth-child(7)  { top: 51%; left: -5%; }
  .sheet-watermark span:nth-child(8)  { top: 51%; left: 28%; }
  .sheet-watermark span:nth-child(9)  { top: 51%; left: 61%; }
  .sheet-watermark span:nth-child(10) { top: 74%; left: -5%; }
  .sheet-watermark span:nth-child(11) { top: 74%; left: 28%; }
  .sheet-watermark span:nth-child(12) { top: 74%; left: 61%; }

  .sheet-content {
    position: relative;
    z-index: 2;
    padding: 56px 64px 48px;
  }

  .toolbar { width: 8.5in; max-width: 100%; margin: 20px auto 0; display: flex; justify-content: flex-end; gap: 10px; }
  .toolbar button { padding: 10px 22px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font: 600 13px/1 inherit; cursor: pointer; }
  .toolbar button.ghost { background: #fff; color: var(--accent); }

  /* ── Header band ──────────────────────────────────────────────── */
  .header-band {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
    margin: -56px -64px 32px;
    padding: 32px 64px 28px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 32px;
  }
  .header-band .brand { display: flex; align-items: center; gap: 16px; }
  .header-band .brand img { width: 52px; height: 52px; display: block; border-radius: 6px; background: #fff; padding: 4px; }
  .header-band .brand .nm { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; color: #fff; }
  .header-band .brand .tag { font-size: 11px; color: rgba(255,255,255,0.70); margin-top: 2px; letter-spacing: 0.02em; }
  .header-band .doc { text-align: right; }
  .header-band .doc .t { font-size: 13px; font-weight: 700; letter-spacing: 0.18em; color: rgba(255,255,255,0.60); text-transform: uppercase; }
  .header-band .doc .n { font-size: 24px; font-weight: 700; color: #fff; margin-top: 2px; letter-spacing: -0.01em; }
  .header-band .doc .d { font-size: 11px; color: rgba(255,255,255,0.60); margin-top: 2px; }
  .header-band .doc .status { display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .header-band .doc .status.paid { color: var(--paid); background: var(--paid-wash); }
  .header-band .doc .status.refund { color: var(--refund); background: var(--refund-wash); }

  .header-rule { border: 0; border-top: 1px solid var(--rule); margin: 0 0 24px; }

  /* ── Parties ──────────────────────────────────────────────────── */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; padding: 24px 0; border-bottom: 1px solid var(--rule); }
  .lbl { font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--soft); text-transform: uppercase; }
  .party .nm { font-size: 13.5px; font-weight: 700; margin-top: 8px; }
  .party .ln { font-size: 12px; color: var(--mid); margin-top: 3px; }

  /* ── Items ────────────────────────────────────────────────────── */
  table.items { width: 100%; border-collapse: collapse; margin-top: 32px; }
  table.items th {
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--soft); text-transform: uppercase;
    text-align: left; padding: 0 12px 10px 0; border-bottom: 1.5px solid var(--rule-strong);
  }
  table.items th.r, table.items td.r { text-align: right; padding-right: 0; }
  table.items tbody tr:nth-child(even) td { background: var(--wash); }
  table.items td { padding: 14px 12px 14px 0; font-size: 12.5px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  table.items td.desc { width: 56%; color: var(--ink); }
  table.items td .cat { display: block; font-size: 10.5px; color: var(--soft); margin-top: 3px; letter-spacing: 0.04em; text-transform: uppercase; }

  /* ── Totals ───────────────────────────────────────────────────── */
  .totals-wrap { display: flex; justify-content: flex-end; }
  .totals { width: 320px; margin-top: 16px; }
  .totals .row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; font-size: 12.5px; color: var(--mid); }
  .totals .row.grand { border-top: 2px solid var(--rule-strong); margin-top: 8px; padding-top: 12px; font-size: 15px; font-weight: 700; color: var(--ink); }
  .totals .row.refund { color: var(--refund); }

  /* ── Payment details ──────────────────────────────────────────── */
  .details { margin-top: 40px; background: var(--wash); border-radius: 8px; padding: 20px 24px; }
  .details .lbl { margin-bottom: 12px; display: block; }
  .details .grid { display: grid; grid-template-columns: 170px 1fr; row-gap: 7px; column-gap: 16px; font-size: 12px; }
  .details .k { color: var(--mid); }
  .details .v { color: var(--ink); font-weight: 500; word-break: break-word; }

  /* ── Footer ───────────────────────────────────────────────────── */
  .foot {
    margin-top: 44px;
    border-top: 2px solid var(--accent);
    padding-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
  }
  .foot-col { font-size: 10px; color: var(--mid); line-height: 1.6; }
  .foot-col .hd { font-size: 9px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: var(--soft); margin-bottom: 4px; }
  .foot-col a { color: var(--accent); text-decoration: none; }
  .foot-col .r { text-align: right; }

  @media print {
    html, body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; width: auto; }
    .sheet-content { padding: 0.25in 0.2in; }
    .header-band { margin: -0.25in -0.2in 32px; padding: 28px 0.2in 24px; }
    .toolbar { display: none; }
    @page { size: letter; margin: 0.55in 0.6in; }
  }
  @media (max-width: 700px) {
    .sheet-content { padding: 28px 22px; }
    .header-band { margin: -28px -22px 24px; padding: 24px 22px 20px; flex-direction: column; gap: 16px; }
    .header-band .doc { text-align: left; }
    .parties { grid-template-columns: 1fr; gap: 20px; }
    .foot { grid-template-columns: 1fr; gap: 16px; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="ghost" type="button" data-print>Print</button>
    <button type="button" data-print>Download PDF</button>
  </div>
  <script>
    // Deferred print: Safari can render a blank print preview when print()
    // fires before layout settles. Wait for full load + two frames.
    (function () {
      function safePrint() {
        var go = function () {
          requestAnimationFrame(function () { requestAnimationFrame(function () { window.print() }) })
        }
        if (document.readyState === 'complete') go()
        else window.addEventListener('load', go, { once: true })
      }
      document.querySelectorAll('[data-print]').forEach(function (b) {
        b.addEventListener('click', safePrint)
      })
    })()
  </script>

  <div class="sheet">
    <!-- Watermark pattern -->
    <div class="sheet-watermark">
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
      <span>YouSafe Consultancy</span>
    </div>

    <div class="sheet-content">

      <!-- Header band -->
      <div class="header-band">
        <div class="brand">
          <img src="/receipt-logo.svg" alt="">
          <div>
            <div class="nm">${esc(company.name)}</div>
            <div class="tag">Your Safe Path to Success.</div>
          </div>
        </div>
        <div class="doc">
          <div class="t">Receipt</div>
          <div class="n num">${esc(meta.receiptNumber)}</div>
          <div class="d">Issued ${esc(fmtDate(meta.issuedAt))}</div>
          <span class="status ${isRefundish ? 'refund' : 'paid'}">${esc(meta.status.toUpperCase())}</span>
        </div>
      </div>

      <hr class="header-rule">

      <div class="parties">
        <div class="party">
          <span class="lbl">Remit from</span>
          <div class="nm">${esc(company.name)}</div>
          ${[company.address, company.email, company.phone, company.website].filter(Boolean).map(l => `<div class="ln">${esc(l)}</div>`).join('')}
        </div>
        <div class="party">
          <span class="lbl">Billed to</span>
          <div class="nm">${esc(billedTo.name || '—')}</div>
          ${billedTo.lines.filter(Boolean).map(l => `<div class="ln">${esc(l)}</div>`).join('')}
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Description</th>
            <th class="r">Qty</th>
            <th class="r">Unit price</th>
            <th class="r">Amount (${esc(cur)})</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => `<tr>
            <td class="desc">${esc(i.description)}<span class="cat">${esc(meta.kind.toUpperCase())} · ${esc(meta.receiptNumber)}</span></td>
            <td class="r num">${esc(i.quantity)}</td>
            <td class="r num">${esc(money(i.unitCents))}</td>
            <td class="r num">${esc(money(i.amountCents))}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals">
          <div class="row"><span>Subtotal</span><span class="num">${esc(money(totals.subtotalCents))}</span></div>
          ${typeof totals.feeCents === 'number' && totals.feeCents > 0
            ? `<div class="row"><span>Platform fee</span><span class="num">${esc(money(totals.feeCents))}</span></div>` : ''}
          <div class="row"><span>Tax${taxCents === 0 ? ' (0%)' : ''}</span><span class="num">${esc(money(taxCents))}</span></div>
          ${typeof totals.refundCents === 'number' && totals.refundCents > 0
            ? `<div class="row refund"><span>Refunded</span><span class="num">${esc(money(-totals.refundCents))}</span></div>` : ''}
          <div class="row grand"><span>Total ${esc(cur)}</span><span class="num">${esc(money(totals.totalCents))}</span></div>
        </div>
      </div>

      <div class="details">
        <span class="lbl">Payment details</span>
        <div class="grid">
          ${detailRows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v num">${esc(v)}</span>`).join('')}
        </div>
      </div>

      <!-- Footer -->
      <div class="foot">
        <div class="foot-col">
          <div class="hd">Support</div>
          ${company.email
            ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a><br>`
            : ''}
          ${company.phone ? esc(company.phone) : ''}
          ${company.website ? `<br><a href="${esc(company.website)}">${esc(company.website)}</a>` : ''}
        </div>
        <div class="foot-col">
          <div class="hd">Registered Address</div>
          ${esc(company.address || 'N/A')}
        </div>
        <div class="foot-col">
          <div class="hd">Legal</div>
          This is a computer-generated receipt and is valid without a signature.<br>
          <span class="num">${esc(meta.receiptNumber)} · Page 1 of 1</span>
        </div>
      </div>

    </div>
  </div>
</body>
</html>`
}
