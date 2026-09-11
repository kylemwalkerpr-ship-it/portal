import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'

import {
  IMMIGRATION_SHOP_OFFICIAL_SOURCES,
  IMMIGRATION_SHOP_PRODUCTS,
} from '@/lib/immigration-shop-products'
import { generateTemplatePdf } from '@/lib/pdfGenerator'
import { getTemplatePack } from '@/lib/template-packs'
import { getManifest, listManifestSlugs } from '@/lib/templatePdfManifests'

const TEXT = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.36, 0.36, 0.43)
const BRAND = rgb(0.05, 0.32, 0.6)
const RULE = rgb(0.82, 0.82, 0.82)

function safeAscii(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\xff]/g, '?')
}

function breakToken(font: PDFFont, token: string, maxWidth: number, size: number): string[] {
  if (font.widthOfTextAtSize(token, size) <= maxWidth) return [token]
  const parts: string[] = []
  let current = ''
  for (const char of token) {
    const candidate = current + char
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current)
      current = char
    } else {
      current = candidate
    }
  }
  if (current) parts.push(current)
  return parts
}

function wrap(font: PDFFont, raw: string, maxWidth: number, size: number): string[] {
  const words = safeAscii(raw).split(/\s+/).flatMap((word) => breakToken(font, word, maxWidth, size))
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface PayhipExportResult {
  bytes: Uint8Array
  officialSourceCount: number
  pageCount: number
  fieldCount: number
}

/**
 * Generates the retail Payhip PDF for one immigration preparation product.
 *
 * The maintained fillable manifest is the content source of truth. A dedicated
 * guidance page is inserted after the cover so buyers receive the preparation
 * boundary and the exact authoritative government pages alongside the form.
 */
export async function generatePayhipProductPdf(
  slug: string,
  generatedAt = new Date(),
): Promise<PayhipExportResult> {
  const pack = getTemplatePack(slug)
  if (!pack) throw new Error(`Unknown template pack: ${slug}`)

  if (!listManifestSlugs().includes(slug)) {
    throw new Error(`Payhip export requires an explicit buyer-facing manifest: ${slug}`)
  }

  const manifest = getManifest(slug)
  if (!manifest) throw new Error(`Missing PDF manifest: ${slug}`)

  const baseBytes = await generateTemplatePdf({
    manifest,
    prefillValues: {},
    meta: {
      templateName: pack.name,
      templateBadge: pack.badge,
      templateDescription: pack.short_description,
      keywords: pack.includes,
      userFullName: '',
      userEmail: '',
      orderId: 'PAYHIP-MASTER',
      generationDate: generatedAt,
    },
  })

  const doc = await PDFDocument.load(baseBytes)
  const first = doc.getPage(0)
  const { width, height } = first.getSize()
  const guidance = doc.insertPage(1, [width, height])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 34
  const contentWidth = width - margin * 2
  let y = height - 44

  guidance.drawText('YOUSAFE CONSULTANCY', {
    x: margin,
    y,
    size: 11,
    font: bold,
    color: BRAND,
  })
  y -= 30

  guidance.drawText('Before you use this preparation pack', {
    x: margin,
    y,
    size: 18,
    font: bold,
    color: TEXT,
  })
  y -= 28

  const disclaimer =
    'This is an independent preparation and organization resource. It is not an official government form. It is not legal advice, legal representation, or a guarantee of approval. Government forms, fees, eligibility rules, filing windows, documentary requirements, and procedures can change. Verify the current instructions that apply to your facts before filing.'
  for (const line of wrap(regular, disclaimer, contentWidth, 10)) {
    guidance.drawText(line, { x: margin, y, size: 10, font: regular, color: TEXT })
    y -= 13
  }

  y -= 8
  guidance.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.6,
    color: RULE,
  })
  y -= 25

  guidance.drawText('What this file is for', {
    x: margin,
    y,
    size: 13,
    font: bold,
    color: BRAND,
  })
  y -= 19
  const purpose = `${pack.short_description} Use the fillable fields as a private working copy to organize facts and evidence before transferring information to the appropriate official process.`
  for (const line of wrap(regular, purpose, contentWidth, 9.5)) {
    guidance.drawText(line, { x: margin, y, size: 9.5, font: regular, color: TEXT })
    y -= 12
  }

  const immigrationProduct = IMMIGRATION_SHOP_PRODUCTS.find((product) => product.slug === slug)
  const sources = (immigrationProduct?.official_sources ?? [])
    .map((sourceId) => IMMIGRATION_SHOP_OFFICIAL_SOURCES[sourceId])
    .filter(Boolean)

  y -= 13
  guidance.drawText('Authoritative sources to check before filing', {
    x: margin,
    y,
    size: 13,
    font: bold,
    color: BRAND,
  })
  y -= 20

  if (sources.length === 0) {
    guidance.drawText('No source list is registered for this product. Keep this product on QA hold.', {
      x: margin,
      y,
      size: 9.5,
      font: bold,
      color: TEXT,
    })
    y -= 15
  } else {
    for (const source of sources) {
      const labelLines = wrap(bold, source.label, contentWidth - 12, 9)
      for (const line of labelLines) {
        guidance.drawText(line, { x: margin + 12, y, size: 9, font: bold, color: TEXT })
        y -= 11
      }
      const urlLines = wrap(regular, source.url, contentWidth - 12, 7.5)
      for (const line of urlLines) {
        guidance.drawText(line, { x: margin + 12, y, size: 7.5, font: regular, color: MUTED })
        y -= 9
      }
      y -= 7
    }
  }

  const footerY = 30
  guidance.drawLine({
    start: { x: margin, y: footerY + 14 },
    end: { x: width - margin, y: footerY + 14 },
    thickness: 0.5,
    color: RULE,
  })
  guidance.drawText(`Payhip master generated ${isoDate(generatedAt)} - verify official requirements again on the day of filing.`, {
    x: margin,
    y: footerY,
    size: 7.5,
    font: regular,
    color: MUTED,
  })

  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    officialSourceCount: sources.length,
    pageCount: doc.getPageCount(),
    fieldCount: doc.getForm().getFields().length,
  }
}
