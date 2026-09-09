/**
 * Prompt-safe keyword contract helpers.
 *
 * Kept off planner / engineAi on purpose: the studio client already imports
 * section-budget helpers from prompts.ts, and pulling the partitioner into
 * that graph drags undici `node:` builtins into the webpack client bundle.
 */
import {
  keywordTermList,
  type KeywordSource,
  type KeywordTerm,
} from '@/lib/seoEngine/keywordTerms'

export interface KeywordContractLists {
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  shortKeywordTerms: KeywordTerm[]
  longTailKeywordTerms: KeywordTerm[]
  backfilled: boolean
}

function demandTerms(terms: KeywordTerm[]): string[] {
  return terms.filter((t) => t.source === 'demand').map((t) => t.term)
}

function synthesizedTerms(terms: KeywordTerm[]): string[] {
  return terms.filter((t) => t.source === 'synthesized').map((t) => t.term)
}

/** Assemble a contract from already-sealed lists — never re-partition. */
export function keywordContractFromLists(input: {
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
}): KeywordContractLists {
  const short = Array.isArray(input.requiredShortKeywords)
    ? input.requiredShortKeywords.map(String).map((t) => t.trim()).filter(Boolean)
    : []
  const longTail = Array.isArray(input.requiredLongTailKeywords)
    ? input.requiredLongTailKeywords.map(String).map((t) => t.trim()).filter(Boolean)
    : []
  const shortKeywordTerms = input.shortKeywordTerms?.length
    ? input.shortKeywordTerms
    : short.map((term) => ({ term, source: 'demand' as KeywordSource }))
  const longTailKeywordTerms = input.longTailKeywordTerms?.length
    ? input.longTailKeywordTerms
    : longTail.map((term) => ({ term, source: 'demand' as KeywordSource }))
  return {
    requiredShortKeywords: shortKeywordTerms.map((entry) => entry.term),
    requiredLongTailKeywords: longTailKeywordTerms.map((entry) => entry.term),
    shortKeywordTerms,
    longTailKeywordTerms,
    backfilled: false,
  }
}

/**
 * The one keyword brief injected into briefing, drafting, and Harper.
 *
 * Demand shorts: coverage, not stuffing — recommended ≤3 natural placements.
 * Long-tails: meaning coverage (the question is answered), not a 6-word echo.
 * Synthesized floor-fill: discover-only. NEVER instruct the model to place it.
 */
export function renderKeywordContractBrief(
  contract: KeywordContractLists,
  primaryKeyword?: string,
): string {
  const primary = String(primaryKeyword || '').trim()
  const demandShort = demandTerms(contract.shortKeywordTerms)
  const demandLong = demandTerms(contract.longTailKeywordTerms)
  const synth = [
    ...synthesizedTerms(contract.shortKeywordTerms),
    ...synthesizedTerms(contract.longTailKeywordTerms),
  ]
  const bullet = (terms: string[]) => (terms.length ? terms.map((t) => `    - "${t}"`).join('\n') : '    - (none)')
  return [
    '## KEYWORD CONTRACT (single source of truth — brief, drafter, Harper, audit)',
    primary ? `- Primary keyword (title/H1 only; not a coverage checkbox): "${primary}"` : '',
    '- DEMAND short keywords (recommended ≤3 natural placements, 1–4 uses each, never as an H2 or FAQ question):',
    bullet(demandShort),
    '- Place demand shorts naturally. Missing a demand short is a HARD blocker for legal_guide/article/regional_*; for blog_post/blog_summary/news_summary it is a WARNING.',
    '- DEMAND long-tail keywords (meaning coverage, not exact 6-word string; 1–2 natural uses in prose or an FAQ ANSWER — never as the question text):',
    bullet(demandLong),
    '- A long-tail is satisfied if the meaning is answered, not only if the 6-word string appears.',
    '- SYNTHESIZED floor-fill (discover-only; do NOT place these phrases; never a ship blocker):',
    bullet(synth),
    '- Never instruct yourself to weave synthesized floor-fill. Those phrases are analytics-only — omitting them is not a defect.',
    '- Echo demand short phrases naturally. Do not invent replacements or extra required keywords.',
    '- If a term has no clean slot, omit it. Harper cannot honestly stuff it later.',
  ].filter(Boolean).join('\n')
}

export function demandKeywordPhrases(contract: KeywordContractLists): string[] {
  return [
    ...demandTerms(contract.shortKeywordTerms),
    ...demandTerms(contract.longTailKeywordTerms),
  ]
}

export function parseKeywordPhrases(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const list = raw.map((item) => String(item || '').trim()).filter(Boolean)
  return list.length ? list : undefined
}

export function parseKeywordTerms(raw: unknown): KeywordTerm[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const list = keywordTermList(raw as Array<string | KeywordTerm>)
  return list.length ? list : undefined
}

/**
 * Strip briefing H2s Harper cannot honestly rewrite: verbatim keyword pastes
 * and question-mark FAQ items listed as sibling sections. Structural headings
 * (In 60 seconds / FAQ / Sources / Worked Example / TOC) are kept.
 */
export function sanitizeBriefOutline(headings: string[], keywords: string[] = []): string[] {
  const keywordNorms = new Set(
    keywords
      .map((k) => String(k || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )
  const structural = /^(in 60 seconds|table of contents|faq|sources|worked example)$/i
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of headings || []) {
    const heading = String(raw || '').replace(/^#{1,3}\s*/, '').replace(/^H2:\s*/i, '').trim()
    if (!heading) continue
    const key = heading.toLowerCase()
    if (seen.has(key)) continue
    if (!structural.test(heading)) {
      if (/\?$/.test(heading)) continue
      const norm = heading.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      if (keywordNorms.has(norm)) continue
    }
    seen.add(key)
    out.push(heading)
  }
  return out
}
