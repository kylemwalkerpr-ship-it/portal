/**
 * Sealed briefing contract — no guesswork for the drafter.
 *
 * The brief owns thesis, takeaways, per-H2 purpose + bridge, FAQ questions,
 * and an unresolved list. Anything not in Discover intelligence is omitted,
 * never invented. The linear desk executes this plan in the same conversation.
 */

import { isBlogFamily, usesGuideApparatus } from './writingShape'

export type SealedChapterFormat =
  | 'takeaways'
  | 'lede'
  | 'prose'
  | 'table'
  | 'steps'
  | 'bullets'
  | 'faq'
  | 'sources'
  | 'toc'

export type SealedChapter = {
  heading: string
  purpose: string
  /** Empty only on the first content chapter. Later chapters MUST name the previous claim they continue. */
  bridgeFrom: string
  coverTopics: string[]
  format: SealedChapterFormat
}

export type SealedBrief = {
  thesis: string
  takeaways: string[]
  lede: string
  outline: SealedChapter[]
  faqQuestions: string[]
  unresolved: string[]
}

export type SealedBriefParse = {
  ok: boolean
  brief: SealedBrief | null
  issues: string[]
}

const STRUCTURAL = /^(in 60 seconds|key takeaways|table of contents|faq|sources|disclaimer)$/i

const DEFAULT_FAQ = [
  'What happens if a required document is missing at filing?',
  'Can I start this process while my current permission is still valid?',
  'Which official page should I re-check the week I file?',
  'What usually triggers a delay after the receipt notice?',
  'When is professional advice worth it versus filing yourself?',
  'What should I do if the decision is a refusal or a request for evidence?',
]

export function normalizeHeading(value: string): string {
  return String(value || '')
    .replace(/^#{1,3}\s*/, '')
    .replace(/^H2:\s*/i, '')
    .replace(/[“”"']/g, '')
    .trim()
}

function looksLikeCompleteClaim(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length > 240) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length < 8) return false
  if (/^(that|this|it|these|those)\b/i.test(t)) return false
  return true
}

function headingTokens(value: string): Set<string> {
  return new Set(
    normalizeHeading(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

function faqDuplicatesHeading(question: string, heading: string): boolean {
  const q = headingTokens(question)
  const h = headingTokens(heading)
  if (!q.size || !h.size) return false
  const overlap = [...h].filter((t) => q.has(t)).length
  return overlap >= Math.max(3, Math.ceil(h.size * 0.7))
}

export function chapterFormatFor(heading: string, explicit?: string): SealedChapterFormat {
  const h = normalizeHeading(heading).toLowerCase()
  const raw = String(explicit || '').toLowerCase()
  if (/in 60 seconds|key takeaway/.test(h) || raw.includes('bullet') && /60 seconds|takeaway/.test(h)) return 'takeaways'
  if (/table of contents/.test(h)) return 'toc'
  if (/^faq$/.test(h) || raw.includes('faq')) return 'faq'
  if (/source/.test(h)) return 'sources'
  if (/step|process/.test(h) || raw.includes('step')) return 'steps'
  if (/cost|fee|vs|compar|timeline/.test(h) || raw.includes('table')) return 'table'
  if (/checklist|document/.test(h) || raw.includes('checklist')) return 'bullets'
  return 'prose'
}

export function validateSealedBrief(
  brief: SealedBrief,
  opts?: { primaryKeyword?: string; contentType?: string },
): string[] {
  const issues: string[] = []
  const thesis = String(brief.thesis || '').replace(/\s+/g, ' ').trim()
  if (thesis.length < 24) issues.push('thesis: missing or too short — the drafter would have to invent the argument')
  const primary = String(opts?.primaryKeyword || '').trim().toLowerCase()
  if (primary && thesis.toLowerCase() === primary) issues.push('thesis: must not be the raw primary keyword')

  const takeaways = (brief.takeaways || []).map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (takeaways.length < 3) issues.push('takeaways: need 3–5 complete claims')
  takeaways.forEach((t, i) => {
    if (!looksLikeCompleteClaim(t)) issues.push(`takeaways[${i}]: must be a complete claim, not a keyword fragment`)
  })

  if (!String(brief.lede || '').trim() || String(brief.lede).trim().length < 40) {
    issues.push('lede: missing — opening must answer the question in 2–3 sentences of plan, not guesswork')
  }

  const outline = brief.outline || []
  const contentChapters = outline.filter((c) => !STRUCTURAL.test(normalizeHeading(c.heading)))
  const minChapters = isBlogFamily(opts?.contentType) ? 3 : 4
  if (contentChapters.length < minChapters) {
    issues.push(`outline: need at least ${minChapters} content H2s with purpose`)
  }
  const firstContent = outline.findIndex((c) => !STRUCTURAL.test(normalizeHeading(c.heading)))
  outline.forEach((c, i) => {
    if (!normalizeHeading(c.heading)) issues.push(`outline[${i}]: heading missing`)
    if (!String(c.purpose || '').trim()) issues.push(`outline[${i}]: purpose missing — drafter would guess the section`)
    const structural = STRUCTURAL.test(normalizeHeading(c.heading))
    if (!structural && i !== firstContent && !String(c.bridgeFrom || '').trim()) {
      issues.push(`outline[${i}] (${c.heading}): bridgeFrom missing — later H2s must continue the previous claim`)
    }
  })

  const faq = (brief.faqQuestions || []).map((q) => String(q || '').trim()).filter(Boolean)
  if (usesGuideApparatus(opts?.contentType) && faq.length < 4) {
    issues.push('faqQuestions: guides need 4–6 reader questions the H2s did not already settle')
  }
  for (const q of faq) {
    for (const c of contentChapters) {
      if (faqDuplicatesHeading(q, c.heading)) {
        issues.push(`faqQuestions: “${q}” restates H2 “${c.heading}”`)
      }
    }
  }

  // unresolved is a success of no-guesswork — omit those items, do not fail the brief.
  return issues
}

export function parseSealedBrief(
  raw: string,
  opts?: { contentType?: string; primaryKeyword?: string },
): SealedBriefParse {
  const text = String(raw || '').trim()
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, brief: null, issues: ['brief is not JSON'] }
  let parsed: unknown
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return { ok: false, brief: null, issues: ['brief JSON did not parse'] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, brief: null, issues: ['brief JSON must be an object'] }
  }
  const o = parsed as Record<string, unknown>
  const outlineRaw = Array.isArray(o.outline) ? o.outline : []
  const brief: SealedBrief = {
    thesis: String(o.thesis || '').trim(),
    takeaways: Array.isArray(o.takeaways) ? o.takeaways.map((t) => String(t || '').trim()).filter(Boolean) : [],
    lede: String(o.lede || '').trim(),
    outline: outlineRaw.map((row) => {
      const c = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const heading = normalizeHeading(String(c.heading || ''))
      return {
        heading,
        purpose: String(c.purpose || '').trim(),
        bridgeFrom: String(c.bridgeFrom || '').trim(),
        coverTopics: Array.isArray(c.coverTopics) ? c.coverTopics.map((t) => String(t || '').trim()).filter(Boolean) : [],
        format: chapterFormatFor(heading, String(c.format || '')),
      }
    }).filter((c) => c.heading),
    faqQuestions: Array.isArray(o.faqQuestions) ? o.faqQuestions.map((q) => String(q || '').trim()).filter(Boolean) : [],
    unresolved: Array.isArray(o.unresolved) ? o.unresolved.map((u) => String(u || '').trim()).filter(Boolean) : [],
  }
  const issues = validateSealedBrief(brief, opts)
  return { ok: issues.length === 0, brief, issues }
}

export function sealBriefFromAssembly(input: {
  title?: string
  primaryKeyword: string
  audience?: string
  contentType?: string
  h2Outline?: string[]
  kwH2Map?: Record<string, string>
  sectionPlan?: Array<{ heading: string; intent?: string; format?: string; keywords?: string[] }>
  thesis?: string
  takeaways?: string[]
  faqQuestions?: string[]
  lede?: string
}): SealedBrief {
  const primary = String(input.primaryKeyword || '').trim()
  const audience = String(input.audience || 'the reader').trim()
  const headings = (input.h2Outline || []).map(normalizeHeading).filter(Boolean)
  const planByHeading = new Map(
    (input.sectionPlan || []).map((s) => [normalizeHeading(s.heading).toLowerCase(), s]),
  )
  const kwH2Map = input.kwH2Map || {}
  const outline: SealedChapter[] = headings.map((heading, i) => {
    const plan = planByHeading.get(heading.toLowerCase())
    const coverTopics = Object.entries(kwH2Map)
      .filter(([, h]) => normalizeHeading(h).toLowerCase() === heading.toLowerCase())
      .map(([k]) => k)
    const prev = headings[i - 1] || ''
    const structural = STRUCTURAL.test(heading)
    return {
      heading,
      purpose: String(plan?.intent || '').trim() || defaultPurpose(heading, primary),
      bridgeFrom: structural || i === 0 ? '' : `Continue from “${prev}” — next constraint or decision, not a restated intro.`,
      coverTopics: (plan?.keywords || coverTopics).filter(Boolean),
      format: chapterFormatFor(heading, plan?.format),
    }
  })
  const takeaways = (input.takeaways || []).map((t) => String(t).trim()).filter(Boolean)
  while (takeaways.length < 3) {
    const extra = outline[takeaways.length]
    if (!extra) break
    takeaways.push(`${audience.replace(/^./, (c) => c.toUpperCase())} must treat “${extra.heading}” as a decision, not a definition dump.`)
  }
  const faq = (input.faqQuestions || []).map((q) => String(q).trim()).filter(Boolean)
  for (const q of DEFAULT_FAQ) {
    if (faq.length >= 6) break
    if (outline.some((c) => faqDuplicatesHeading(q, c.heading))) continue
    if (faq.some((existing) => existing.toLowerCase() === q.toLowerCase())) continue
    faq.push(q)
  }
  const thesis = String(input.thesis || '').trim()
    || `${primary} is a procedure with documents, constraints, and a next decision — not a definition to restate under every heading.`
  const lede = String(input.lede || '').trim()
    || `Open by answering what ${audience} must do first for ${primary}, then name the constraint that usually surprises them. Do not restate the H1.`
  return {
    thesis,
    takeaways: takeaways.slice(0, 5),
    lede,
    outline,
    faqQuestions: faq.slice(0, 6),
    unresolved: [],
  }
}

function defaultPurpose(heading: string, primary: string): string {
  const h = heading.toLowerCase()
  if (/in 60 seconds|key takeaway/.test(h)) return 'Three to five complete claims the busy reader can act on.'
  if (/table of contents/.test(h)) return 'Scan path matching the H2 slugs exactly.'
  if (/^faq$/.test(h)) return 'Reader questions the content H2s did not already settle.'
  if (/source/.test(h)) return 'Official URLs already on the allowlist, verbatim.'
  if (/eligib|who/.test(h)) return `Who this ${primary} path is actually for, with the constraint that disqualifies guesswork.`
  if (/document|evidence|checklist/.test(h)) return 'Named artefacts to gather, in the order a case officer will look for them.'
  if (/process|step/.test(h)) return 'The filing sequence as numbered steps, each depending on the previous.'
  if (/cost|fee|tim/.test(h)) return 'What it costs and how long each stage takes, with the issuing body named.'
  return `Advance the argument under “${heading}” — a new claim or next step, not a restatement.`
}

export function sealedBriefPromptBlock(opts: {
  contentType?: string
  minWords: number
  maxWords: number
}): string {
  const guide = usesGuideApparatus(opts.contentType)
  return [
    'SEALED BRIEF — return ONLY a JSON object. No article yet. No guesswork.',
    '{',
    '  "thesis": "one sentence the whole article argues",',
    '  "takeaways": ["complete claim 1", "complete claim 2", "complete claim 3"],',
    '  "lede": "2–3 sentences the opening MUST answer — not a keyword restatement",',
    '  "outline": [{ "heading": "...", "purpose": "...", "bridgeFrom": "previous claim this H2 continues", "coverTopics": ["topic"], "format": "prose|table|steps|bullets|takeaways|faq|sources" }],',
    '  "faqQuestions": ["reader question the H2s did not already settle"],',
    '  "unresolved": ["anything you would have to invent — these will be OMITTED"]',
    '}',
    'RULES:',
    '- Use ONLY Discover intelligence. If a fee, date, URL, form, or statistic is not in Discover, put it in unresolved and omit it from the article.',
    '- Takeaways are complete claims, never keyword fragments.',
    '- Every later content H2 has bridgeFrom naming the previous claim.',
    '- FAQ questions must not restate an H2.',
    guide
      ? `- Guides keep In 60 seconds, FAQ, Sources. Page window ${opts.minWords}–${opts.maxWords} words.`
      : `- Blogs: Key takeaways + 3–6 purpose-led H2s. No kit FAQ unless Discover needs it. Page window ${opts.minWords}–${opts.maxWords} words.`,
    '- Do not write the article in this turn.',
  ].join('\n')
}

export function executeBriefPrompt(brief: SealedBrief): string {
  return [
    'EXECUTE the sealed brief. Write the complete article now. The ship gates in the system prompt still apply — they have not changed.',
    '',
    'THESIS:',
    brief.thesis,
    '',
    'LEDE MUST ANSWER:',
    brief.lede,
    '',
    'TAKEAWAYS (complete claims, in this order):',
    ...brief.takeaways.map((t, i) => `${i + 1}. ${t}`),
    '',
    'OUTLINE (exact H2s, each continues the previous):',
    ...brief.outline.map((c, i) => {
      const topics = c.coverTopics.length ? ` · cover topics: ${c.coverTopics.join(', ')}` : ''
      const bridge = c.bridgeFrom ? ` · bridge: ${c.bridgeFrom}` : ''
      return `${i + 1}. ## ${c.heading} [${c.format}] — ${c.purpose}${bridge}${topics}`
    }),
    '',
    brief.faqQuestions.length
      ? ['FAQ QUESTIONS (do not rewrite into H2s):', ...brief.faqQuestions.map((q) => `- ${q}`)].join('\n')
      : '',
    brief.unresolved.length
      ? `OMIT rather than invent: ${brief.unresolved.join(' · ')}`
      : 'Unresolved is empty — do not invent fees, dates, URLs, or statistics beyond Discover.',
    '',
    'Return the complete markdown article only. No JSON. No preamble.',
  ].filter(Boolean).join('\n')
}
