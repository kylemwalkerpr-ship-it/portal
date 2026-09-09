export interface ContentStructureIntegrityResult {
  ok: boolean
  errors: string[]
}

function decodeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#123;/g, '{')
    .replace(/&#125;/g, '}')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectHeadingIds(content: string): string[] {
  const ids: string[] = []
  const re = /<h[2-6]\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) ids.push(match[1].trim().toLowerCase())
  return ids.filter(Boolean)
}

function faqBlock(content: string): string | null {
  const start = content.search(/<h2\b[^>]*>\s*(?:Frequently asked questions|FAQ)\s*<\/h2>/i)
  if (start < 0) return null
  const remainder = content.slice(start)
  const next = remainder.slice(1).search(/<h2\b/i)
  return next < 0 ? remainder : remainder.slice(0, next + 1)
}

function checkTableShape(content: string, errors: string[]): void {
  const tables = content.match(/<table\b[\s\S]*?<\/table>/gi) || []
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index]
    if (!/<thead\b/i.test(table) || !/<tbody\b/i.test(table)) {
      errors.push(`table ${index + 1} must retain semantic <thead> and <tbody> structure`)
      continue
    }
    const headRow = table.match(/<thead\b[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1] || ''
    const columnCount = (headRow.match(/<th\b/gi) || []).length
    if (columnCount < 1) {
      errors.push(`table ${index + 1} has no header cells`)
      continue
    }
    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || ''
    const rows = body.match(/<tr\b[\s\S]*?<\/tr>/gi) || []
    if (!rows.length) errors.push(`table ${index + 1} has no body rows`)
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const cells = (rows[rowIndex].match(/<td\b/gi) || []).length
      if (cells !== columnCount) {
        errors.push(
          `table ${index + 1} row ${rowIndex + 1} has ${cells} cells but header has ${columnCount}; preserve column alignment`,
        )
      }
    }
  }
}

function checkParagraphResidue(content: string, errors: string[]): void {
  const paragraphs = content.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []
  for (const paragraph of paragraphs) {
    const text = decodeText(paragraph)
    if (!text) continue
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(text)) {
      errors.push(`list marker leaked into paragraph instead of semantic <li>: ${text.slice(0, 90)}`)
    }
    if (/^\|.*\|$/.test(text) || /\|\s*:?-{3,}:?\s*\|/.test(text)) {
      errors.push(`markdown table syntax leaked into paragraph instead of semantic <table>: ${text.slice(0, 90)}`)
    }
    if (/\s[-*+]\s+(?=(?:\*\*)?[A-Z0-9])/.test(text) && /^(?:[-*+]\s+|\d+[.)]\s+)/.test(text)) {
      errors.push(`multiple list items appear collapsed into one paragraph: ${text.slice(0, 110)}`)
    }
  }
}

function checkReviewProvenance(content: string, errors: string[]): void {
  const review = content.match(/reviewStatus\s*:\s*["']([^"']+)["']/)?.[1]
  if (!review) {
    errors.push('Caseworks ArticleMeta must declare reviewStatus explicitly')
    return
  }
  if (!['editorial-only', 'attorney-reviewed', 'needs_attorney_review'].includes(review)) {
    errors.push(`unsupported reviewStatus "${review}"`)
    return
  }
  if (review !== 'attorney-reviewed') return

  const reviewerBlock = content.match(/reviewer\s*:\s*\{([\s\S]*?)\}/)?.[1] || ''
  const reviewerName = reviewerBlock.match(/name\s*:\s*["']([^"']+)["']/)?.[1] || ''
  const genericReviewer = !reviewerName || /editorial|team|pending|staff|caseworks/i.test(reviewerName)
  const hasCredential = /\b(barNumber|role|state|certifiedSpecialty)\s*:/.test(reviewerBlock)
  if (genericReviewer || !hasCredential) {
    errors.push(
      'attorney-reviewed content requires a specific named reviewer plus credential metadata; editorial/generic reviewers must use editorial-only',
    )
  }
}

/**
 * Fail-closed structural contract for Content Studio → Caseworks rendered pages.
 * This intentionally validates the rendered JSX, because that is the exact
 * artifact a reader, crawler and mobile browser will receive after the
 * markdown converter has had its chance to lose structure.
 */
export function validateCaseworksRenderedStructure(content: string): ContentStructureIntegrityResult {
  const errors: string[] = []
  const source = String(content || '')

  // Older Studio drafts can still contain a manual "Table of contents" H2.
  // Caseworks' shared SectionTracker now suppresses that legacy block and owns
  // the canonical rendered TOC. Do not make those legacy drafts unshippable;
  // validate the meaningful document headings/structure below instead.

  const headingIds = collectHeadingIds(source)
  const seen = new Set<string>()
  for (const id of headingIds) {
    if (seen.has(id)) errors.push(`duplicate heading id "${id}" would create ambiguous TOC anchors`)
    seen.add(id)
  }

  checkParagraphResidue(source, errors)
  checkTableShape(source, errors)

  const faq = faqBlock(source)
  if (faq) {
    const questions = faq.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi) || []
    if (questions.length < 3) {
      errors.push(`FAQ section has ${questions.length} semantic H3 question(s); require at least 3 to avoid flattened/broken FAQ prose`)
    }
    for (const heading of questions) {
      const question = decodeText(heading)
      if (question && !question.endsWith('?')) {
        errors.push(`FAQ H3 is not a reader question: ${question.slice(0, 100)}`)
      }
    }
  }

  checkReviewProvenance(source, errors)

  // Generated article markup should never carry desktop-only inline sizing
  // that can force the long-form column wider than the phone viewport.
  if (/\b(?:minWidth|width)\s*:\s*["']?\d{3,}px/i.test(source) || /whiteSpace\s*:\s*["']nowrap["']/i.test(source)) {
    errors.push('rendered article contains fixed-width/nowrap inline styling that can break mobile layout')
  }

  return { ok: errors.length === 0, errors }
}

export function assertCaseworksRenderedStructure(content: string): void {
  const result = validateCaseworksRenderedStructure(content)
  if (!result.ok) {
    throw new Error(`Caseworks document-integrity gate failed:\n- ${result.errors.join('\n- ')}`)
  }
}