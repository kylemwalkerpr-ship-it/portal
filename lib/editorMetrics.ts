/**
 * editorMetrics — deterministic, dependency-light quality metrics for the
 * editorial drafting surface.
 *
 *  - Grammar / spelling / punctuation: scores a list of Harper.js lints
 *    (Harper runs on-device; we never ship article text to a third party for
 *    grammar).
 *  - Readability: Flesch Reading Ease computed on extracted prose.
 *  - SEO: local deterministic score — keyword presence, structure, meta,
 *    FAQ, internal links, depth. Mirrors the ship gates' signal set for the
 *    human working in the editor.
 *
 * These scores are advisory (the AUDIT gate remains the shipping authority);
 * they exist so the operator sees live quality feedback while typing.
 */

import { AHREFS_META_MAX, AHREFS_META_MIN, clampMetaToAhrefs, metaDescriptionLength } from '@/lib/seoFactory/ahrefsIssues'

/** Brief / SERP sweet spot. The ship gate is Ahrefs 70–160; prompts ask 140–160. */
export const BRIEF_META_MIN = 140
export const BRIEF_META_MAX = AHREFS_META_MAX

export type EditorMetrics = {
  grammar: { score: number; errors: number; suggestions: number; sample: Array<{ kind: string; problem: string; message: string }> }
  readability: { score: number; words: number; sentences: number; target: number; pass: boolean; fixes: ReadabilityFix[] }
  seo: { score: number; pass: string[]; fail: string[]; warn: string[] }
}

export type EditorSeoHint = {
  primaryKeyword?: string | null
  targetWords?: number
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  region?: string | null
  contentType?: string | null
  audience?: string | null
}

export type ReadabilityFix = { quote: string; suggestion: string; reason: string; words: number }

/** Harper lint severity buckets (order matters: more serious first). */
const HARPER_ERROR_KINDS = new Set(['Spelling', 'Grammar', 'Repetition'])
const HARPER_STYLE_KINDS = new Set(['Style', 'Register', 'Semicolon', 'ComplexWord', 'PassiveVoice'])

/**
 * Score Harper lints into 0–100. Spelling/grammar/repetition errors are
 * weighted ~3× a style suggestion; the ceiling drops quickly with any hard
 * error so a human takes the draft back to the editor before shipping.
 */
export function scoreHarperLints(lints: Array<{ kind: string }>): { score: number; errors: number; suggestions: number } {
  const errors = lints.filter((l) => HARPER_ERROR_KINDS.has(l.kind)).length
  const suggestions = lints.filter((l) => !HARPER_ERROR_KINDS.has(l.kind)).length
  let score = 100
  score -= Math.min(50, errors * 8) // 100→50 at ~7 hard errors
  score -= Math.min(30, suggestions * 2) // style noise costs up to 30
  score = Math.max(10, Math.round(score))
  return { score, errors, suggestions }
}

/**
 * Extract prose from a markdown article: drops frontmatter, JSON-LD, code
 * fences, headings, list/toolbar markers, table pipes, links/emphasis, and
 * collapses the rest into plain sentences. Deterministic — used by both the
 * readability and (indirectly) grammar scoring.
 */
/** Brief-informed Flesch floor: blogs scan easier; legal guides may sit lower. */
export function fleschTargetForBrief(hint?: EditorSeoHint): number {
  const t = String(hint?.contentType || '').toLowerCase()
  if (t === 'blog_post' || t === 'blog_summary') return 60
  if (t === 'regional_page' || t === 'regional_from' || t === 'regional_university') return 55
  return 50
}

export function extractProse(md: string): string {
  let s = String(md || '')
    .replace(/\s*---[\s\S]*?\n---\s*/g, '\n')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,4}\s+.*$/gm, ' ')
    .replace(/table of contents[\s\S]{0,400}?(?=\n##\s|\n#\s|$)/gi, ' ')
    .replace(/^\s*[|>-]\s?/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*\d+[.)]\s+/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/---/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Keep only sentences with a noun-ish core: drop pure junk rows.
  s = s
    .split(/(?<=[.!?])\s+/)
    .filter((sent) => /[a-zA-Z]{3,}/.test(sent))
    .join(' ')
  return s
}

/**
 * Flesch Reading Ease — 0–100 (90+ = very easy, 60–70 = plain English,
 * <30 = postgraduate). Computed on extracted prose; clamps to a friendly band
 * for a consumer audience.
 */
export function fleschReadingEase(text: string): { score: number; words: number; sentences: number } {
  const words = (String(text || '').match(/[a-zA-Z][a-zA-Z'-]*/g) || []).length
  const sentences = Math.max(1, (String(text || '').match(/[.!?]+(\s|$)/g) || []).length)
  if (words < 10) return { score: 70, words, sentences } // too little text — neutral
  const syllables = (String(text || '').match(/[aeiouyAEIOUY]+/g) || []).length
  const raw = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / Math.max(1, words))
  return { score: Math.max(5, Math.min(100, Math.round(raw))), words, sentences }
}

const count = (md: string, re: RegExp) => (String(md || '').match(re) || []).length

/**
 * Local SEO posture score (0–100). Each bullet maps 1:1 to a ship-gate
 * signal so the editor preview and the actual audit agree in direction.
 */
export function computeSeoScore(md: string, hint?: EditorSeoHint): { score: number; pass: string[]; fail: string[]; warn: string[] } {
  const pass: string[] = []
  const fail: string[] = []
  const warn: string[] = []
  const primary = String(hint?.primaryKeyword || '').trim().toLowerCase()
  const target = hint?.targetWords
  const words = count(md, /[a-zA-Z][a-zA-Z'-]*/g)

  if (!primary) {
    pass.push('No primary keyword supplied — SEO review is partial')
  } else {
    if (new RegExp(`#{1}\\s+[^\\n]*${escapeRegExp(primary)}`, 'i').test(md)) pass.push('Primary keyword in H1')
    else fail.push('Primary keyword missing from H1')
    const first100 = extractProse(md).slice(0, 1000).toLowerCase()
    if (first100.includes(primary)) pass.push('Primary keyword answered in the opening')
    else fail.push('Opening does not answer the primary keyword early')
  }

  const h2s = count(md, /^##\s+/gm)
  if (h2s >= 4) pass.push(`${h2s} H2 sections`)
  else fail.push(`Only ${h2s} H2 sections (need ≥4)`)

  if (/^##\s+.*faq/im.test(md)) pass.push('FAQ section present')
  else fail.push('Missing FAQ section')

  if (count(md, /^##\s+.*sources/im) >= 1) pass.push('Sources section present')
  else fail.push('Missing Sources section')

  const links = count(md, /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)
  if (links >= 2) pass.push(`${links} external URLs`)
  else fail.push(`Only ${links} URLs (need ≥2)`)

  if (target) {
    if (words >= target * 0.85) pass.push(`Depth in range (${words} words)`)
    else fail.push(`Thin: ${words} words (target ~${target})`)
  }

  const { desc: metaDesc } = readYamlDescription(md)
  const metaLen = metaDescriptionLength(metaDesc)
  if (!metaDesc) {
    fail.push('No meta description yet')
  } else if (metaLen < AHREFS_META_MIN || metaLen > AHREFS_META_MAX) {
    fail.push(`Meta description ${metaLen} chars (ship gate ${AHREFS_META_MIN}–${AHREFS_META_MAX})`)
  } else if (metaLen < BRIEF_META_MIN) {
    warn.push(`Meta ${metaLen} chars — ship-ok (${AHREFS_META_MIN}–${AHREFS_META_MAX}); brief SERP target ${BRIEF_META_MIN}–${BRIEF_META_MAX}`)
  } else {
    pass.push(`Meta description ${metaLen} chars (${BRIEF_META_MIN}–${BRIEF_META_MAX} SERP band)`)
  }

  const required = [...(hint?.requiredShortKeywords || []), ...(hint?.requiredLongTailKeywords || [])].map((k) => k.toLowerCase()).filter(Boolean)
  if (required.length) {
    const covered = required.filter((k) => extractProse(md).toLowerCase().includes(k)).length
    if (covered >= Math.max(1, Math.floor(required.length * 0.7))) pass.push(`${covered}/${required.length} brief keywords naturally present`)
    else fail.push(`Only ${covered}/${required.length} brief keywords present`)
  }

  const score = Math.max(5, Math.round((pass.length / Math.max(1, pass.length + fail.length)) * 100))
  return { score, pass, fail, warn }
}

function stripYamlQuotes(v: string): string {
  const t = String(v || '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

export function readYamlDescription(md: string): { desc: string; rawLine: string | null } {
  const block = String(md || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block) return { desc: '', rawLine: null }
  const line = block[1].match(/^description:\s*(.*)$/m)
  if (!line) return { desc: '', rawLine: null }
  return { desc: stripYamlQuotes(line[1]), rawLine: line[0] }
}

/** Lengthen YAML description into the brief 140–160 SERP band without breaking the 70–160 ship gate. */
export function expandMetaToBriefTarget(md: string, hint?: EditorSeoHint): { content: string; applied: boolean; length: number } {
  const raw = String(md || '')
  const { desc, rawLine } = readYamlDescription(raw)
  const titleMatch = raw.match(/^title:\s*(.+)$/m)
  const title = stripYamlQuotes(titleMatch?.[1] || '')
  const pk = String(hint?.primaryKeyword || '').trim()
  let next = clampMetaToAhrefs(desc || `${title} — practical guidance.`, title, pk)
  const pad = ` Verify official ${pk || 'immigration'} rules and documents before you apply.`
  let guard = 0
  while (metaDescriptionLength(next) < BRIEF_META_MIN && guard++ < 6) {
    next = `${next}${pad}`.replace(/\s+/g, ' ').trim()
    if (metaDescriptionLength(next) > AHREFS_META_MAX) {
      next = clampMetaToAhrefs(next, title, pk)
      break
    }
  }
  next = clampMetaToAhrefs(next, title, pk)
  const length = metaDescriptionLength(next)
  const yamlLine = `description: ${JSON.stringify(next)}`
  let content = raw
  if (rawLine) content = raw.replace(rawLine, yamlLine)
  else if (/^---\r?\n/.test(raw)) content = raw.replace(/^---\r?\n/, `---\ndescription: ${JSON.stringify(next)}\n`)
  else content = `---\ndescription: ${JSON.stringify(next)}\n---\n\n${raw}`
  return { content, applied: content !== raw && length >= AHREFS_META_MIN, length }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Full editor quality pack: readability + SEO locally, grammar from Harper
 * lints. Pure — the caller picks how it sources lints (browser Harper).
 */
function splitLongSentence(sentence: string): string | null {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (words.length < 28) return null
  const raw = sentence.trim()
  const mid = Math.floor(raw.length / 2)
  const windows = ['; ', ': ', ', and ', ', but ', ', which ', ' — ', ' – ']
  let at = -1
  let sep = '. '
  for (const w of windows) {
    const left = raw.lastIndexOf(w, mid + 40)
    const right = raw.indexOf(w, Math.max(0, mid - 40))
    const hit = [left, right].filter((i) => i >= 12 && i < raw.length - 12).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]
    if (hit != null) {
      at = hit
      sep = w
      break
    }
  }
  if (at < 0) return null
  const a = raw.slice(0, at).trim().replace(/[,;:]$/, '')
  const b = raw.slice(at + sep.length).trim().replace(/^[a-z]/, (ch) => ch.toUpperCase())
  if (a.split(/\s+/).length < 6 || b.split(/\s+/).length < 6) return null
  return `${a}. ${b}`
}

export function suggestReadabilityFixes(md: string, hint?: EditorSeoHint): ReadabilityFix[] {
  const prose = extractProse(md)
  const sentences = prose.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  const out: ReadabilityFix[] = []
  for (const s of sentences) {
    const words = s.trim().split(/\s+/).filter(Boolean).length
    if (words < 28) continue
    const suggestion = splitLongSentence(s)
    if (!suggestion) continue
    out.push({
      quote: s.trim().slice(0, 280),
      suggestion,
      reason: `${words}-word sentence — brief target is 15–22 words for a ${hint?.audience || 'consumer'} reader`,
      words,
    })
    if (out.length >= 8) break
  }
  return out
}

export function computeEditorMetrics(md: string, lints: Array<{ kind: string }>, hint?: EditorSeoHint): EditorMetrics {
  const prose = extractProse(md)
  const ease = fleschReadingEase(prose)
  const target = fleschTargetForBrief(hint)
  const grammar = scoreHarperLints(lints)
  const seo = computeSeoScore(md, hint)
  return {
    grammar: { ...grammar, sample: [] },
    readability: {
      ...ease,
      target,
      pass: ease.score >= target,
      fixes: suggestReadabilityFixes(md, hint),
    },
    seo,
  }
}