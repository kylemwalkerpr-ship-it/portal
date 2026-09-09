/*
 * Blind editor critique.
 *
 * The critic sees only the current reader-facing document. It is deliberately
 * not shown keyword quotas, generation prompts, model provenance, prior Harper
 * findings or the desired answer. That prevents it from merely validating the
 * instructions that created the draft. It can identify spans; it cannot apply
 * edits. Masked denoise remains the only executor and still freezes facts.
 */

import type { EditorialNaturalnessReport } from './editorialNaturalness'

export interface BlindEditorFinding {
  quote: string
  issue: string
  instruction: string
  start: number
  end: number
}

export const BLIND_EDITOR_SYSTEM = `You are a senior copy editor doing a blind desk read. You are not told how this document was generated or what SEO instructions produced it.

Read only for editorial quality: passages an experienced editor would cut, compress, clarify, reorder locally, or rewrite because they repeat an earlier point, sound templated, stay abstract, jump between actors, bury the answer, or fail to advance the reader's understanding.

Do not judge authorship and do not try to defeat AI detectors. Do not request new facts. Do not remove numbers, legal qualifications, citations, source URLs, disclaimers, headings or supported distinctions.

Return ONLY JSON with this schema:
{"findings":[{"quote":"exact contiguous quote from the document, 30-420 characters","issue":"brief editorial diagnosis","instruction":"specific rewrite objective, not replacement prose"}]}

Rules:
- 0-4 findings; return an empty array when the prose is already strong.
- quote MUST be an exact contiguous substring of the document.
- Never quote a heading, URL-only line, frontmatter, code/schema block, table row or Sources entry.
- Prefer the smallest passage that demonstrates the problem.
- Do not write replacement prose. The executor will repair the quoted span under fact-preservation constraints.`

function extractJson(raw: string): unknown {
  const text = String(raw || '').trim()
  if (!text) return null
  const fence = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(fence.slice(start, end + 1)) } catch { return null }
}

function safeQuote(quote: string): boolean {
  const q = quote.trim()
  if (q.length < 30 || q.length > 420) return false
  if (/^\s*#{1,6}\s/m.test(q)) return false
  if (/^\s*(?:---|```|<script|\|)/i.test(q)) return false
  if (/^\s*https?:\/\//i.test(q)) return false
  return true
}

export function parseBlindEditorFindings(raw: string, content: string): BlindEditorFinding[] {
  const parsed = extractJson(raw)
  if (!parsed || typeof parsed !== 'object') return []
  const rows = Array.isArray((parsed as { findings?: unknown }).findings)
    ? (parsed as { findings: unknown[] }).findings
    : []
  const out: BlindEditorFinding[] = []
  const used: Array<{ start: number; end: number }> = []
  for (const row of rows.slice(0, 8)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const quote = typeof r.quote === 'string' ? r.quote.trim() : ''
    const issue = typeof r.issue === 'string' ? r.issue.trim() : ''
    const instruction = typeof r.instruction === 'string' ? r.instruction.trim() : ''
    if (!safeQuote(quote) || !issue || !instruction) continue
    const start = content.indexOf(quote)
    if (start < 0) continue
    const end = start + quote.length
    if (used.some((u) => start < u.end && end > u.start)) continue
    used.push({ start, end })
    out.push({ quote, issue: issue.slice(0, 240), instruction: instruction.slice(0, 300), start, end })
    if (out.length >= 4) break
  }
  return out
}

export function shouldRunBlindEditor(report: EditorialNaturalnessReport): boolean {
  if (report.score < 84) return true
  const highSignal = new Set([
    'semantic_repetition',
    'low_information_gain',
    'section_semantic_overlap',
    'discourse_monotony',
    'corpus_style_drift',
    'rejected_style_proximity',
  ])
  return report.findings.filter((f) => highSignal.has(f.code)).length >= 2
}

export async function runBlindEditorCritique(opts: {
  content: string
  report: EditorialNaturalnessReport
  generateText: (system: string, prompt: string) => Promise<string>
}): Promise<BlindEditorFinding[]> {
  if (!shouldRunBlindEditor(opts.report)) return []
  const content = String(opts.content || '')
  if (!content.trim()) return []
  try {
    const raw = await opts.generateText(
      BLIND_EDITOR_SYSTEM,
      `DOCUMENT\n\n${content}\n\nReturn only the blind-editor JSON.`,
    )
    return parseBlindEditorFindings(raw, content)
  } catch {
    return []
  }
}
