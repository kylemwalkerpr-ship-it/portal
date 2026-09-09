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

/** 2–3 token named immigration programs that must stay intact as phrases. */
export const NAMED_IMMIGRATION_PROGRAMS = [
  'express entry',
  'study permit',
  'skilled worker',
  'comprehensive ranking',
  'green card',
  'work permit',
  'visitor visa',
  'student visa',
  'permanent residence',
  'spousal sponsorship',
  'family class',
] as const

const MILL_SUFFIXES = new Set([
  'requirements',
  'eligibility',
  'application',
  'documents',
  'timeline',
  'guide',
  'rules',
  'process',
  'checklist',
  'fees',
  'cost',
  'costs',
])

/** Trailing 2-word windows that are not a topic by themselves. */
const GENERIC_WINDOWS = new Set([
  'processing time',
  'processing times',
  'letter template',
  'card timeline',
  'wait time',
  'wait times',
  'writing service',
  'editing service',
])

const EXPLAINER_PRIMARY =
  /\b(calculator|processing time|processing times|timeline|template|checklist|score|points?|service)\b/

const APPLY_TARGET =
  /\b(visa|permit|green card|sponsorship|petition|application|work permit|study permit|permanent residence)\b/

function normPhrase(value: string): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * True when the primary is something a reader actually applies for
 * (visa / permit / petition). False for calculators, processing-time
 * explainers, templates, checklists, score tools, and hired services —
 * those must never receive "how to apply for {primary}" mill long-tails.
 */
export function isApplyTargetPrimary(primary: string): boolean {
  const p = normPhrase(primary)
  if (!p) return false
  if (EXPLAINER_PRIMARY.test(p)) return false
  if (/\bhow\b.{0,40}\bworks\b/.test(p)) return false
  return APPLY_TARGET.test(p)
}

/**
 * Drop mill fragments: a 1-token term that is a subset of a multi-word
 * primary, or `{program-first-token} {mill-suffix}` when the primary contains
 * a named 2–3 token immigration program (express entry → "express" /
 * "express requirements").
 */
export function rejectFragmentKeyword(term: string, primary: string): boolean {
  const t = normPhrase(term)
  const pk = normPhrase(primary)
  if (!t || !pk) return false
  const termTokens = t.split(/\s+/).filter(Boolean)
  const primaryTokens = pk.split(/\s+/).filter(Boolean)
  if (primaryTokens.length < 2) return false

  if (termTokens.length === 1 && primaryTokens.includes(termTokens[0])) return true

  if (termTokens.length === 2 && GENERIC_WINDOWS.has(t) && pk !== t && pk.includes(t)) return true

  if (termTokens.length === 2 && MILL_SUFFIXES.has(termTokens[1])) {
    for (const program of NAMED_IMMIGRATION_PROGRAMS) {
      if (!pk.includes(program)) continue
      const progTokens = program.split(/\s+/).filter(Boolean)
      if (progTokens.length < 2) continue
      if (termTokens[0] === progTokens[0] && !t.includes(program)) return true
    }
  }

  // Incomplete named-program shorts: "australia student" when the primary
  // contains "student visa"; "canada spousal" when it contains "spousal
  // sponsorship".
  if (termTokens.length >= 2) {
    for (const program of NAMED_IMMIGRATION_PROGRAMS) {
      if (!pk.includes(program)) continue
      const progTokens = program.split(/\s+/).filter(Boolean)
      if (progTokens.length < 2) continue
      if (t.includes(program)) continue
      if (!termTokens.includes(progTokens[0])) continue
      // Country / qualifier + program-first-token, missing the rest of the program.
      return true
    }
  }
  return false
}

export function dropFragmentKeywordTerms<T extends { term: string }>(terms: T[], primary: string): T[] {
  return terms.filter((entry) => !rejectFragmentKeyword(entry.term, primary))
}

export function dropFragmentKeywords(terms: string[], primary: string): string[] {
  return terms.filter((term) => !rejectFragmentKeyword(term, primary))
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
  primaryKeyword?: string
}): KeywordContractLists {
  const primary = String(input.primaryKeyword || '').trim()
  const short = dropFragmentKeywords(
    Array.isArray(input.requiredShortKeywords)
      ? input.requiredShortKeywords.map(String).map((t) => t.trim()).filter(Boolean)
      : [],
    primary,
  )
  const longTail = dropFragmentKeywords(
    Array.isArray(input.requiredLongTailKeywords)
      ? input.requiredLongTailKeywords.map(String).map((t) => t.trim()).filter(Boolean)
      : [],
    primary,
  )
  const shortKeywordTerms = dropFragmentKeywordTerms(
    input.shortKeywordTerms?.length
      ? input.shortKeywordTerms
      : short.map((term) => ({ term, source: 'demand' as KeywordSource })),
    primary,
  )
  const longTailKeywordTerms = dropFragmentKeywordTerms(
    input.longTailKeywordTerms?.length
      ? input.longTailKeywordTerms
      : longTail.map((term) => ({ term, source: 'demand' as KeywordSource })),
    primary,
  )
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

/** Local twin of gate stripOutlineHeadingDecorations — this file stays client-safe. */
function stripBriefHeadingDecorations(heading: string): string {
  return String(heading || '')
    .replace(/^#+\s*/, '')
    .replace(
      /\s*\((?:\d+\s*[–-]\s*\d+\s+words?|\d+\s+words?|\d+\s*[–-]\s*\d+\s*q\s*&\s*a|[^)]*q\s*&\s*a[^)]*|\d+\s*[–-]\s*\d+\s+bullets?|\d+\s*[–-]\s*\d+)\s*\)\s*$/i,
      '',
    )
    .replace(/\s+\d+\s*[–-]\s*\d+\s+words?\s*$/i, '')
    .trim()
}

/**
 * Strip briefing H2s Harper cannot honestly rewrite: verbatim keyword pastes
 * and question-mark FAQ items listed as sibling sections. Structural headings
 * (In 60 seconds / FAQ / Sources / Worked Example / TOC) are kept.
 * Any In 60 seconds variant (word-count parentheticals, a second copy) collapses
 * to a single `In 60 seconds` heading. Marketplace CTA headings are dropped —
 * they are not outline sections.
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
    let heading = stripBriefHeadingDecorations(
      String(raw || '').replace(/^#{1,3}\s*/, '').replace(/^H2:\s*/i, '').trim(),
    )
    if (!heading) continue
    if (/^need professional help\b/i.test(heading)) continue
    if (/^in 60 seconds\b/i.test(heading) || /^tl;?dr\b/i.test(heading)) {
      heading = 'In 60 seconds'
    }
    if (/^table of contents\b/i.test(heading)) heading = 'Table of contents'
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
