/**
 * Receipt engine — bank-grade PDF receipts for student transactions.
 *
 * Layout (US Letter):
 *   ┌──────────────────────────────────────────────┐
 *   │ ▌COMPANY NAME            RECEIPT  #R-XXXXXX  │  header band + accent bar
 *   │  address · website        issued  date       │
 *   ├──────────────────────────────────────────────┤
 *   │  FROM (company block)     BILLED TO (student)│  both parties
 *   ├──────────────────────────────────────────────┤
 *   │  DESCRIPTION        QTY   UNIT      AMOUNT   │  itemized table
 *   │  …                                           │
 *   │                       Subtotal / Total  PAID │  totals + status stamp
 *   ├──────────────────────────────────────────────┤
 *   │  Payment details (method, txn id, order #)   │
 *   │  footer: support contact + generated notice  │
 *   └──────────────────────────────────────────────┘
 *
 * Pure pdf-lib (no fontkit) so it runs in any server runtime.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

export interface ReceiptParty {
  label: string            // 'FROM' | 'BILLED TO'
  name: string
  lines: string[]          // address / contact lines, blanks skipped
}

export interface ReceiptItem {
  description: string
  quantity: number
  unitCents: number
  amountCents: number
}

export interface ReceiptTotals {
  subtotalCents: number
  feeCents?: number        // platform/processing fee when known
  refundCents?: number     // for refund receipts (negative display)
  totalCents: number
}

export interface ReceiptMeta {
  receiptNumber: string
  issuedAt: Date
  transactionDate: Date
  currency: string         // 'usd' | 'cad' | …
  status: string           // 'PAID' | 'REFUNDED' | 'CREDITED' | 'POSTED'
  kind: string             // human label: 'Service purchase', 'Wallet top-up'…
  paymentMethod?: string
  transactionId?: string | null
  orderNumber?: string | null
  gateway?: string | null
}

export interface ReceiptInput {
  company: { name: string; address?: string; email?: string; phone?: string; website?: string }
  billedTo: { name: string; lines: string[] }
  items: ReceiptItem[]
  totals: ReceiptTotals
  meta: ReceiptMeta
}

// ── palette (print-safe, bank-statement restraint) ────────────────────────
const INK = rgb(0.07, 0.09, 0.16)        // near-black slate
const MID = rgb(0.32, 0.37, 0.46)
const SOFT = rgb(0.55, 0.59, 0.67)
const RULE = rgb(0.84, 0.87, 0.91)
const ACCENT = rgb(0.255, 0.251, 0.541)  // #41408A — matches portal accent
const ACCENT_SOFT = rgb(0.93, 0.93, 0.97)
const PAID_GREEN = rgb(0.10, 0.42, 0.27)
const REFUND_AMBER = rgb(0.55, 0.37, 0.04)

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54

function money(cents: number, currency: string): string {
  const cur = (currency || 'usd').toUpperCase()
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents) / 100
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`
}

/** Wrap text to a max width, returning the drawn line count. */
function drawWrapped(
  page: PDFPage, text: string, x: number, y: number,
  font: PDFFont, size: number, color: ReturnType<typeof rgb>, maxWidth: number, lineHeight: number,
): number {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  let line = ''
  let lines = 0
  const flush = () => {
    if (!line) return
    page.drawText(line, { x, y: y - lines * lineHeight, size, font, color })
    lines += 1
    line = ''
  }
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) flush()
    line = line ? `${line} ${w}` : w
  }
  flush()
  return Math.max(1, lines)
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Receipt ${input.meta.receiptNumber}`)
  doc.setAuthor(input.company.name)
  doc.setSubject(input.meta.kind)
  doc.setCreator(`${input.company.name} receipt engine`)

  const page = doc.addPage([PAGE_W, PAGE_H])
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const monoBold = await doc.embedFont(StandardFonts.CourierBold)

  const right = PAGE_W - MARGIN
  let y = PAGE_H - MARGIN

  // ── Header band ──────────────────────────────────────────────────────
  // Accent bar down the left edge of the header block.
  page.drawRectangle({ x: MARGIN - 14, y: y - 46, width: 4, height: 52, color: ACCENT })

  page.drawText(input.company.name.toUpperCase(), { x: MARGIN, y: y - 6, size: 19, font: bold, color: INK })
  let headLine = y - 24
  if (input.company.address) {
    const used = drawWrapped(page, input.company.address, MARGIN, headLine, helv, 9, MID, 280, 12)
    headLine -= used * 12
  }
  const contact = [input.company.website, input.company.email].filter(Boolean).join('  ·  ')
  if (contact) {
    page.drawText(contact, { x: MARGIN, y: headLine, size: 9, font: helv, color: SOFT })
    headLine -= 12
  }

  // Right side: RECEIPT + number + issue date, right-aligned.
  const rTitle = 'RECEIPT'
  page.drawText(rTitle, { x: right - bold.widthOfTextAtSize(rTitle, 17), y: y - 6, size: 17, font: bold, color: ACCENT })
  const numLine = input.meta.receiptNumber
  page.drawText(numLine, { x: right - monoBold.widthOfTextAtSize(numLine, 11), y: y - 24, size: 11, font: monoBold, color: INK })
  const issued = `Issued ${fmtDate(input.meta.issuedAt)}`
  page.drawText(issued, { x: right - helv.widthOfTextAtSize(issued, 9), y: y - 38, size: 9, font: helv, color: SOFT })

  y = Math.min(headLine, y - 52) - 16
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE })
  y -= 24

  // ── Parties ──────────────────────────────────────────────────────────
  const colW = (right - MARGIN - 30) / 2
  const parties: ReceiptParty[] = [
    {
      label: 'FROM',
      name: input.company.name,
      lines: [input.company.address || '', input.company.email || '', input.company.website || ''].filter(Boolean),
    },
    { label: 'BILLED TO', name: input.billedTo.name, lines: input.billedTo.lines.filter(Boolean) },
  ]
  let partiesBottom = y
  parties.forEach((p, i) => {
    const x = MARGIN + i * (colW + 30)
    page.drawText(p.label, { x, y, size: 8, font: bold, color: SOFT })
    page.drawText(p.name || '—', { x, y: y - 16, size: 12, font: bold, color: INK })
    let py = y - 31
    for (const line of p.lines) {
      const used = drawWrapped(page, line, x, py, helv, 9.5, MID, colW, 13)
      py -= used * 13
    }
    partiesBottom = Math.min(partiesBottom, py)
  })
  y = partiesBottom - 12
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE })
  y -= 26

  // ── Items table ──────────────────────────────────────────────────────
  const C_DESC = MARGIN
  const C_QTY = right - 218
  const C_UNIT = right - 150
  const C_AMT = right // right-aligned

  // Table header on a soft band.
  page.drawRectangle({ x: MARGIN - 8, y: y - 6, width: right - MARGIN + 16, height: 22, color: ACCENT_SOFT })
  page.drawText('DESCRIPTION', { x: C_DESC, y, size: 8, font: bold, color: MID })
  page.drawText('QTY', { x: C_QTY, y, size: 8, font: bold, color: MID })
  page.drawText('UNIT PRICE', { x: C_UNIT, y, size: 8, font: bold, color: MID })
  const amtH = 'AMOUNT'
  page.drawText(amtH, { x: C_AMT - bold.widthOfTextAtSize(amtH, 8), y, size: 8, font: bold, color: MID })
  y -= 24

  for (const item of input.items) {
    const used = drawWrapped(page, item.description, C_DESC, y, helv, 10.5, INK, C_QTY - C_DESC - 16, 14)
    const qty = String(item.quantity)
    page.drawText(qty, { x: C_QTY, y, size: 10, font: mono, color: INK })
    const unit = money(item.unitCents, input.meta.currency)
    page.drawText(unit, { x: C_UNIT, y, size: 10, font: mono, color: INK })
    const amt = money(item.amountCents, input.meta.currency)
    page.drawText(amt, { x: C_AMT - mono.widthOfTextAtSize(amt, 10), y, size: 10, font: mono, color: INK })
    y -= used * 14 + 8
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: RULE })
    y -= 10
  }

  // ── Totals ───────────────────────────────────────────────────────────
  const totalsX = right - 240
  const totalRow = (label: string, cents: number, opts?: { strong?: boolean; color?: ReturnType<typeof rgb> }) => {
    const f = opts?.strong ? bold : helv
    const mf = opts?.strong ? monoBold : mono
    const size = opts?.strong ? 12 : 10
    const color = opts?.color || (opts?.strong ? INK : MID)
    page.drawText(label, { x: totalsX, y, size, font: f, color })
    const v = money(cents, input.meta.currency)
    page.drawText(v, { x: C_AMT - mf.widthOfTextAtSize(v, size), y, size, font: mf, color })
    y -= opts?.strong ? 22 : 17
  }
  y -= 4
  totalRow('Subtotal', input.totals.subtotalCents)
  if (typeof input.totals.feeCents === 'number' && input.totals.feeCents > 0) {
    totalRow('Platform fee', input.totals.feeCents)
  }
  if (typeof input.totals.refundCents === 'number' && input.totals.refundCents > 0) {
    totalRow('Refunded', -input.totals.refundCents, { color: REFUND_AMBER })
  }
  page.drawLine({ start: { x: totalsX, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 1, color: INK })
  y -= 6
  totalRow('Total', input.totals.totalCents, { strong: true })

  // Status stamp — boxed, bank style.
  const stamp = input.meta.status.toUpperCase()
  const stampColor = stamp === 'REFUNDED' || stamp === 'CREDITED' ? REFUND_AMBER : PAID_GREEN
  const stampW = bold.widthOfTextAtSize(stamp, 13) + 24
  page.drawRectangle({
    x: MARGIN, y: y + 2, width: stampW, height: 28,
    borderColor: stampColor, borderWidth: 1.5,
  })
  page.drawText(stamp, { x: MARGIN + 12, y: y + 11, size: 13, font: bold, color: stampColor })
  y -= 34

  // ── Payment details ──────────────────────────────────────────────────
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE })
  y -= 20
  page.drawText('PAYMENT DETAILS', { x: MARGIN, y, size: 8, font: bold, color: SOFT })
  y -= 16
  const details: Array<[string, string]> = [
    ['Type', input.meta.kind],
    ['Transaction date', fmtDateTime(input.meta.transactionDate)],
    ...(input.meta.paymentMethod ? [['Payment method', input.meta.paymentMethod] as [string, string]] : []),
    ...(input.meta.orderNumber ? [['Order reference', input.meta.orderNumber] as [string, string]] : []),
    ...(input.meta.transactionId ? [['Transaction ID', input.meta.transactionId] as [string, string]] : []),
    ...(input.meta.gateway ? [['Processor', input.meta.gateway.toUpperCase()] as [string, string]] : []),
    ['Currency', input.meta.currency.toUpperCase()],
  ]
  for (const [k, v] of details) {
    page.drawText(k, { x: MARGIN, y, size: 9, font: helv, color: SOFT })
    page.drawText(String(v), { x: MARGIN + 130, y, size: 9, font: mono, color: INK })
    y -= 15
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const footY = MARGIN - 6
  page.drawLine({ start: { x: MARGIN, y: footY + 26 }, end: { x: right, y: footY + 26 }, thickness: 0.5, color: RULE })
  const f1 = input.company.email
    ? `Questions about this receipt? Contact ${input.company.email}.`
    : 'Keep this receipt for your records.'
  page.drawText(f1, { x: MARGIN, y: footY + 12, size: 8.5, font: helv, color: MID })
  page.drawText(
    'This is a computer-generated receipt and is valid without a signature.',
    { x: MARGIN, y: footY, size: 8, font: helv, color: SOFT },
  )
  const pageTag = `${input.meta.receiptNumber} · 1 of 1`
  page.drawText(pageTag, { x: right - mono.widthOfTextAtSize(pageTag, 8), y: footY, size: 8, font: mono, color: SOFT })

  return doc.save()
}
