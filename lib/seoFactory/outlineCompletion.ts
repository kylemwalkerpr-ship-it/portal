/**
 * Outline coverage: canonical brief H2s into generate/audit, and the
 * insert-before-FAQ path that completes missing sections. EditorPatch cannot
 * add headings — missing_outline_section must use this insert path.
 */

import { missingOutlineSections, stripOutlineHeadingDecorations } from './contentQualityGate'
import type { ContentSpec } from './contentSpec'
import { countBodyWords } from './contentDepth'

export type OutlineEntry = { heading: string; level?: number; purpose?: string }

export const MISSING_OUTLINE_SECTION_CODE = 'missing_outline_section'

export function isBlogLikeContentType(contentType: string): boolean {
  const t = (contentType || '').toLowerCase()
  return t === 'blog_post' || t === 'blog_summary' || t === 'news_summary' || t === 'blog'
}

export function canonicalOutlineForGate(
  spec?: { outline?: OutlineEntry[] | null } | ContentSpec | null,
  h2Outline?: string[] | null,
): OutlineEntry[] | null {
  const raw: OutlineEntry[] = spec?.outline && spec.outline.length
    ? spec.outline.map((o) => ({
        heading: String(o.heading || '').trim(),
        level: o.level,
        purpose: o.purpose,
      })).filter((o) => o.heading)
    : (h2Outline || []).map((heading) => ({ heading: String(heading || '').trim(), level: 2, purpose: 'brief outline' })).filter((o) => o.heading)
  if (!raw.length) return null
  const seen = new Set<string>()
  const out: OutlineEntry[] = []
  for (const entry of raw) {
    let heading = stripOutlineHeadingDecorations(entry.heading)
    if (/^in 60 seconds\b/i.test(heading) || /^tl;?dr\b/i.test(heading)) heading = 'In 60 seconds'
    const key = heading.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!heading || !key || seen.has(key)) continue
    seen.add(key)
    out.push({ heading, level: entry.level, purpose: entry.purpose })
  }
  return out.length ? out : null
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

/**
 * Cheap context window for a section closer: full article up to 12k chars;
 * otherwise opening thesis (2k) + latest sections (8k) so the closer sees
 * the argument it must advance, not a truncated mid-page slice.
 */
export function articleContextForSection(article: string, maxChars = 12000): string {
  const a = String(article || '')
  if (a.length <= maxChars) return a
  const head = a.slice(0, 2000)
  const tail = a.slice(-8000)
  return `${head}\n\n[…article continues…]\n\n${tail}`
}

export function buildOutlineSectionPrompt(opts: {
  article: string
  heading: string
  purpose?: string
  keyword?: string
  region?: string
}): { system: string; prompt: string } {
  const system = `You are completing ONE section of an existing article. Read the article so far. Do not re-explain what it has already established. Advance the argument. 180-350 words. No invented citations, no personal stories, no outcome promises.`
  const context = articleContextForSection(opts.article)
  const prompt = `## Article so far (opening thesis + latest sections)

${context}

## Section to write

## ${opts.heading}
${opts.purpose ? `\nPurpose (from the brief contract): ${opts.purpose}` : ''}
${opts.keyword ? `\nPrimary topic: ${opts.keyword}` : ''}
${opts.region ? `Region: ${opts.region}` : ''}

Write 180-350 words of plain, well-structured prose that completes this section's purpose and flows from the article above. Use the article's existing headings/voice. Do not restate the thesis the article has already established — advance it. No promises of outcomes. No invented citations. If you reference a rule or deadline, name the issuing authority in plain text.`
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
}): Promise<{
  content: string
  inserted: string[]
  remaining: string[]
  stoppedForBudget: boolean
  /** Set whenever remaining !== 0. Callers must fail closed — do not refine as complete. */
  error?: string
}> {
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
      const entry = outline.find((o) => {
        const raw = String(o.heading || '').trim()
        return raw === heading || stripOutlineHeadingDecorations(raw) === stripOutlineHeadingDecorations(heading)
      })
      const section = await opts.generateSection({
        article: content,
        heading: stripOutlineHeadingDecorations(heading) || heading,
        purpose: entry?.purpose,
      })
      if (!section) continue
      const publishedHeading = stripOutlineHeadingDecorations(heading) || heading
      content = insertSectionBeforeFaqOrSources(content, `## ${publishedHeading}\n\n${section}`)
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
  const error = remaining.length
    ? (stoppedForBudget
        ? `Outline completion stopped at word budget (${maxWords ?? 'max'}); remaining: ${remaining.join(', ')}`
        : outlineCompletionErrorMessage(remaining))
    : undefined
  return { content, inserted, remaining, stoppedForBudget, error }
}

export function outlineCompletionErrorMessage(headings: string[]): string {
  const list = headings.filter(Boolean).join('; ')
  return `Could not complete brief outline sections: ${list}. Insert these H2s before FAQ/Sources — EditorPatch cannot add headings.`
}

/** Fail-closed door: remaining outline headings are a generate error, not a warning. */
export function outlineCompletionFailClosedError(
  remaining: string[],
  opts?: { stoppedForBudget?: boolean; maxWords?: number; error?: string },
): string | null {
  if (opts?.error) return opts.error
  if (!remaining.length) return null
  if (opts?.stoppedForBudget) {
    return `Outline completion stopped at word budget (${opts.maxWords ?? 'max'}); remaining: ${remaining.join(', ')}`
  }
  return outlineCompletionErrorMessage(remaining)
}
