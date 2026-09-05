/**
 * Outline coverage: canonical brief H2s into generate/audit, and the
 * insert-before-FAQ path that completes missing sections. EditorPatch cannot
 * add headings — missing_outline_section must use this insert path.
 */

import { missingOutlineSections } from './contentQualityGate'
import type { ContentSpec } from './contentSpec'
import { countBodyWords } from './contentDepth'

export type OutlineEntry = { heading: string; level?: number; purpose?: string }

export const MISSING_OUTLINE_SECTION_CODE = 'missing_outline_section'

export function canonicalOutlineForGate(
  spec?: { outline?: OutlineEntry[] | null } | ContentSpec | null,
  h2Outline?: string[] | null,
): OutlineEntry[] | null {
  if (spec?.outline && spec.outline.length) {
    return spec.outline.map((o) => ({
      heading: String(o.heading || '').trim(),
      level: o.level,
      purpose: o.purpose,
    })).filter((o) => o.heading)
  }
  const headings = (h2Outline || []).map((h) => String(h || '').trim()).filter(Boolean)
  if (!headings.length) return null
  return headings.map((heading) => ({ heading, level: 2, purpose: 'brief outline' }))
}

export function outlineHeadings(outline: OutlineEntry[] | null | undefined): string[] {
  return (outline || []).map((o) => o.heading).filter(Boolean)
}

/**
 * Insert a rendered section before ## FAQ / ## Sources (or append) so the
 * completed content lands in reading order. Deterministic — never a patch.
 */
export function insertSectionBeforeFaqOrSources(body: string, section: string): string {
  const sectionBlock = `${section}\n\n`
  const match = body.match(/^##\s+(?:faq|sources|official sources)\b/im)
  if (match) {
    const at = match.index ?? body.length
    return `${body.slice(0, at).trimEnd()}\n\n${sectionBlock}${body.slice(at).trimStart()}`
  }
  return `${body.trimEnd()}\n\n${sectionBlock}`.trimEnd()
}

export function buildOutlineSectionPrompt(opts: {
  article: string
  heading: string
  purpose?: string
  keyword?: string
  region?: string
}): { system: string; prompt: string } {
  const system = `You are a legal-content editor completing ONE section of an immigration article. Write natural, practitioner-grade prose for the reader — never a keyword string, never a stub. Respond with ONLY the section body (no heading line).`
  const prompt = `## Article (first 6000 chars for voice/context)

${opts.article.slice(0, 6000)}

## Section to write

## ${opts.heading}
${opts.purpose ? `\nPurpose (from the brief contract): ${opts.purpose}` : ''}
${opts.keyword ? `\nPrimary topic: ${opts.keyword}` : ''}
${opts.region ? `Region: ${opts.region}` : ''}

Write 180-350 words of plain, well-structured prose that completes this section's purpose and flows from the article above. Use the article's existing headings/voice. No promises of outcomes. No invented citations. If you reference a rule or deadline, name the issuing authority in plain text.`
  return { system, prompt }
}

export function parseGeneratedOutlineSection(raw: string): string | null {
  const clean = String(raw || '')
    .replace(/^```[\s\S]*?```\s*$/, '')
    .replace(/^(#+)\s+.*$/m, '')
    .trim()
  return clean.length >= 120 ? clean : null
}

export async function generateOutlineSection(opts: {
  article: string
  heading: string
  purpose?: string
  keyword?: string
  region?: string
  generateText: (system: string, prompt: string) => Promise<string>
}): Promise<string | null> {
  const { system, prompt } = buildOutlineSectionPrompt(opts)
  try {
    const raw = await opts.generateText(system, prompt)
    return parseGeneratedOutlineSection(raw)
  } catch {
    return null
  }
}

export async function completeMissingOutlineSections(opts: {
  content: string
  outline: OutlineEntry[] | null | undefined
  generateSection: (args: { article: string; heading: string; purpose?: string }) => Promise<string | null>
  maxPasses?: number
  maxSectionsPerPass?: number
  /** Hard page max — stop inserting once body words are at/over this (P0-GEN-3). */
  maxWords?: number
}): Promise<{ content: string; inserted: string[]; remaining: string[]; stoppedForBudget: boolean }> {
  const outline = opts.outline
  if (!outline?.length) {
    return { content: opts.content, inserted: [], remaining: [], stoppedForBudget: false }
  }
  let content = opts.content
  const inserted: string[] = []
  const maxPasses = opts.maxPasses ?? 2
  const maxSectionsPerPass = opts.maxSectionsPerPass ?? 3
  const maxWords = opts.maxWords != null && Number.isFinite(opts.maxWords) ? Number(opts.maxWords) : null
  let stoppedForBudget = false
  let remaining = missingOutlineSections(content, outline)
  let pass = 0
  while (remaining.length && pass < maxPasses) {
    if (maxWords != null && countBodyWords(content) >= maxWords) {
      stoppedForBudget = true
      break
    }
    const batch = remaining.slice(0, maxSectionsPerPass)
    let insertedThisPass = 0
    for (const heading of batch) {
      if (maxWords != null && countBodyWords(content) >= maxWords) {
        stoppedForBudget = true
        break
      }
      const entry = outline.find((o) => o.heading === heading)
      const section = await opts.generateSection({
        article: content,
        heading,
        purpose: entry?.purpose,
      })
      if (!section) continue
      content = insertSectionBeforeFaqOrSources(content, `## ${heading}\n\n${section}`)
      inserted.push(heading)
      insertedThisPass++
      if (maxWords != null && countBodyWords(content) >= maxWords) {
        stoppedForBudget = true
        break
      }
    }
    pass++
    remaining = missingOutlineSections(content, outline)
    if (stoppedForBudget || !insertedThisPass) break
  }
  remaining = missingOutlineSections(content, outline)
  return { content, inserted, remaining, stoppedForBudget }
}

export function outlineCompletionErrorMessage(headings: string[]): string {
  const list = headings.filter(Boolean).join('; ')
  return `Could not complete brief outline sections: ${list}. Insert these H2s before FAQ/Sources — EditorPatch cannot add headings.`
}
