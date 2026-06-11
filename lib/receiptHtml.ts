/**
 * HTML receipt renderer — CPU-light replacement for the pdf-lib engine.
 *
 * Server-side it is pure string templating (microseconds, safe on CPU-capped
 * runtimes like Workers). The page carries a print stylesheet sized to US
 * Letter, so "Download PDF" simply invokes the browser's native print →
 * Save-as-PDF, which runs on the user's machine, not the server.
 *
 * Mirrors the pdf-lib layout in lib/receipts.ts: header band + accent bar,
 * FROM / BILLED TO, itemized table, totals + status stamp, payment details.
 */
import type { ReceiptInput } from '@/lib/receipts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function money(cents: number, currency: string): string {
  const cur = (currency || 'usd').toUpperCase()
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents) / 100
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDateTime = (d: Date) =>
  `${fmtDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`

export function renderReceiptHtml(input: ReceiptInput): string {
  const { company, billedTo, items, totals, meta } = input
  const cur = meta.currency
  const isRefundish = /REFUNDED|CREDITED/i.test(meta.status)

  const detailRows: Array<[string, string]> = [
    ['Type', meta.kind],
    ['Transaction date', fmtDateTime(meta.transactionDate)],
    ...(meta.paymentMethod ? [['Payment method', meta.paymentMethod] as [string, string]] : []),
    ...(meta.orderNumber ? [['Order reference', meta.orderNumber] as [string, string]] : []),
    ...(meta.transactionId ? [['Transaction ID', meta.transactionId] as [string, string]] : []),
    ...(meta.gateway ? [['Processor', meta.gateway.toUpperCase()] as [string, string]] : []),
    ['Currency', cur.toUpperCase()],
  ]

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(meta.receiptNumber)} — ${esc(company.name)}</title>
<style>
  :root {
    --ink: #121729; --mid: #525e75; --soft: #8c96ab; --rule: #d6dee8;
    --accent: #41408A; --accent-soft: #ededf7;
    --paid: #1a6b45; --refund: #8c5e0a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f2f4f8; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--ink); }
  .sheet {
    max-width: 760px; margin: 28px auto; background: #fff; padding: 54px;
    box-shadow: 0 8px 32px rgba(15,23,42,0.12); border-radius: 6px;
  }
  .toolbar { max-width: 760px; margin: 18px auto 0; display: flex; justify-content: flex-end; gap: 10px; }
  .toolbar button {
    padding: 9px 20px; border-radius: 999px; border: 1.5px solid var(--accent);
    background: var(--accent); color: #fff; font: 600 13px/1 inherit; cursor: pointer;
  }
  .toolbar button.ghost { background: transparent; color: var(--accent); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
          border-left: 4px solid var(--accent); padding-left: 14px; margin-left: -18px; }
  .co-logo { width: 64px; height: 64px; display: block; margin-bottom: 10px; border-radius: 8px; }
  .co-name { font-size: 21px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
  .co-sub { font-size: 11px; color: var(--mid); margin-top: 5px; max-width: 320px; line-height: 1.5; }
  .co-contact { font-size: 10.5px; color: var(--soft); margin-top: 4px; }
  .r-title { font-size: 19px; font-weight: 700; color: var(--accent); text-align: right; }
  .r-num { font: 700 13px/1.4 ui-monospace, 'SF Mono', Menlo, monospace; text-align: right; margin-top: 4px; }
  .r-issued { font-size: 10.5px; color: var(--soft); text-align: right; margin-top: 3px; }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 22px 0; }
  .parties { display: flex; gap: 36px; }
  .party { flex: 1; min-width: 0; }
  .party .lbl { font-size: 9.5px; font-weight: 700; letter-spacing: .12em; color: var(--soft); }
  .party .nm { font-size: 14px; font-weight: 700; margin-top: 6px; }
  .party .ln { font-size: 11.5px; color: var(--mid); margin-top: 4px; line-height: 1.45; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead th {
    background: var(--accent-soft); font-size: 9.5px; font-weight: 700; letter-spacing: .08em;
    color: var(--mid); text-align: left; padding: 8px 10px;
  }
  table.items thead th.num, table.items td.num {
    text-align: right; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  table.items tbody td { padding: 11px 10px; font-size: 12.5px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  .totals { margin-top: 14px; margin-left: auto; width: 300px; }
  .totals .row { display: flex; justify-content: space-between; font-size: 12px; color: var(--mid); padding: 4px 0; }
  .totals .row .v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .totals .grand { border-top: 1.5px solid var(--ink); margin-top: 6px; padding-top: 8px;
                   font-size: 14.5px; font-weight: 700; color: var(--ink); }
  .stamp { display: inline-block; margin-top: 18px; padding: 8px 18px; border: 2px solid;
           font-size: 13px; font-weight: 800; letter-spacing: .06em; }
  .stamp.paid { color: var(--paid); border-color: var(--paid); }
  .stamp.refund { color: var(--refund); border-color: var(--refund); }
  .details { margin-top: 26px; }
  .details .lbl { font-size: 9.5px; font-weight: 700; letter-spacing: .12em; color: var(--soft); margin-bottom: 10px; }
  .details .row { display: flex; font-size: 11.5px; padding: 4px 0; }
  .details .k { width: 150px; color: var(--soft); flex-shrink: 0; }
  .details .v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: var(--ink); word-break: break-all; }
  .foot { margin-top: 34px; border-top: 1px solid var(--rule); padding-top: 12px;
          display: flex; justify-content: space-between; gap: 16px; }
  .foot .l { font-size: 10px; color: var(--mid); line-height: 1.6; }
  .foot .r { font: 9.5px ui-monospace, 'SF Mono', Menlo, monospace; color: var(--soft); white-space: nowrap; }
  @media print {
    html, body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; max-width: none; border-radius: 0; padding: 28px 34px; }
    .toolbar { display: none; }
    @page { size: letter; margin: 14mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="ghost" type="button" data-print>🖨 Print</button>
    <button type="button" data-print>⎙ Download PDF</button>
  </div>
  <script>
    // Deferred print: Safari can render a blank print preview (and leave the
    // page blank afterwards) when print() fires before layout settles or from
    // a popup-window context. Wait for full load + two frames, then print.
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
    <div class="head">
      <div>
        <img class="co-logo" src="/receipt-logo.svg" alt="" width="64" height="64">
        <div class="co-name">${esc(company.name)}</div>
        ${company.address ? `<div class="co-sub">${esc(company.address)}</div>` : ''}
        ${(company.website || company.email || company.phone) ? `<div class="co-contact">${esc([company.website, company.email, company.phone].filter(Boolean).join('  ·  '))}</div>` : ''}
      </div>
      <div>
        <div class="r-title">RECEIPT</div>
        <div class="r-num">${esc(meta.receiptNumber)}</div>
        <div class="r-issued">Issued ${esc(fmtDate(meta.issuedAt))}</div>
      </div>
    </div>
    <hr>
    <div class="parties">
      <div class="party">
        <div class="lbl">FROM</div>
        <div class="nm">${esc(company.name)}</div>
        ${[company.address, company.email, company.phone, company.website].filter(Boolean).map(l => `<div class="ln">${esc(l)}</div>`).join('')}
      </div>
      <div class="party">
        <div class="lbl">BILLED TO</div>
        <div class="nm">${esc(billedTo.name || '—')}</div>
        ${billedTo.lines.filter(Boolean).map(l => `<div class="ln">${esc(l)}</div>`).join('')}
      </div>
    </div>
    <hr>
    <table class="items">
      <thead>
        <tr><th>DESCRIPTION</th><th class="num">QTY</th><th class="num">UNIT PRICE</th><th class="num">AMOUNT</th></tr>
      </thead>
      <tbody>
        ${items.map(i => `<tr>
          <td>${esc(i.description)}</td>
          <td class="num">${esc(i.quantity)}</td>
          <td class="num">${esc(money(i.unitCents, cur))}</td>
          <td class="num">${esc(money(i.amountCents, cur))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span class="v">${esc(money(totals.subtotalCents, cur))}</span></div>
      ${typeof totals.feeCents === 'number' && totals.feeCents > 0
        ? `<div class="row"><span>Platform fee</span><span class="v">${esc(money(totals.feeCents, cur))}</span></div>` : ''}
      ${typeof totals.refundCents === 'number' && totals.refundCents > 0
        ? `<div class="row" style="color:var(--refund)"><span>Refunded</span><span class="v">${esc(money(-totals.refundCents, cur))}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span class="v">${esc(money(totals.totalCents, cur))}</span></div>
    </div>
    <div class="stamp ${isRefundish ? 'refund' : 'paid'}">${esc(meta.status.toUpperCase())}</div>
    <div class="details">
      <div class="lbl">PAYMENT DETAILS</div>
      ${detailRows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
    </div>
    <div class="foot">
      <div class="l">
        ${company.email ? `Questions about this receipt? Contact ${esc(company.email)}.<br>` : ''}
        This is a computer-generated receipt and is valid without a signature.
      </div>
      <div class="r">${esc(meta.receiptNumber)} · 1 of 1</div>
    </div>
  </div>
</body>
</html>`
}
