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
import { sanitizeLeakedMarkup } from '@/lib/seoFactory/leakedMarkup'
import { stripLeakedJsonLdFromBody } from '@/lib/seoFactory/jsonLdBody'

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
  tone?: string | null
}

export type ReadabilityFix = { quote: string; suggestion: string; reason: string; words: number }

/**
 * Safe, high-frequency dense phrases → shorter words. Legal terms of art
 * (I-20, SEVIS, petition, consulate) are left alone — these only cut
 * syllable load so Flesch can move when sentences are already short.
 */
const PLAIN_ENGLISH: Array<[string, string]> = [
  ['in order to', 'to'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['in the event that', 'if'],
  ['with respect to', 'about'],
  ['in accordance with', 'under'],
  ['a number of', 'several'],
  ['it is important to note that', ''],
  ['it is essential to', 'you should'],
  ['it is recommended that you', 'you should'],
  ['due to the fact that', 'because'],
  ['for the purpose of', 'to'],
  ['in close proximity to', 'near'],
  ['at this point in time', 'now'],
  ['in a timely manner', 'promptly'],
  ['make a determination', 'decide'],
  ['provide assistance', 'help'],
  ['utilize', 'use'],
  ['utilisation', 'use'],
  ['utilization', 'use'],
  ['facilitate', 'help'],
  ['approximately', 'about'],
  ['subsequently', 'then'],
  ['additionally', 'also'],
  ['commence', 'start'],
  ['terminate', 'end'],
  ['necessitate', 'need'],
  ['pertaining to', 'about'],
  ['notwithstanding', 'despite'],
  ['endeavour', 'try'],
  ['endeavor', 'try'],
  ['ascertain', 'find out'],
  ['demonstrate', 'show'],
  ['indicate', 'show'],
  ['regarding', 'about'],
  ['assistance', 'help'],
  ['requirement', 'need'],
  ['requirements', 'needs'],
]

function suggestPlainEnglishFixes(md: string): ReadabilityFix[] {
  // Score wording on client-facing body only — never YAML / fences / JSON-LD.
  const body = stripNonClientChrome(md)
  const out: ReadabilityFix[] = []
  const seen = new Set<string>()
  for (const [from, to] of PLAIN_ENGLISH) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'i')
    const m = body.match(re)
    if (!m || seen.has(from)) continue
    const at = m.index ?? -1
    if (at < 0) continue
    seen.add(from)
    out.push({
      quote: m[0],
      suggestion: to,
      reason: `Dense wording — shorter form raises Flesch without changing the legal meaning`,
      words: from.split(/\s+/).length,
    })
    if (out.length >= 8) break
  }
  return out
}

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

/** YAML / editor-leak keys that must never enter Flesch (fenced or unfenced). */
const EDITOR_YAML_KEYS = 'title|description|content_type|primaryKeyword|region|canonicalUrl|robots|ogImage'
const EDITOR_YAML_LINE_RE = new RegExp(`^\\s*(?:${EDITOR_YAML_KEYS})\\s*:\\s*.*$`, 'i')
const EDITOR_YAML_INLINE_RE = new RegExp(
  `(?:^|\\s)(?:${EDITOR_YAML_KEYS})\\s*:\\s*(?:"[^"]*"|'[^']*'|\\S+)`,
  'gi',
)

/**
 * Drop YAML frontmatter and editor artifacts (KEEP---, duplicated unfenced
 * key lines) so readability scores client-facing body prose only.
 */
function stripEditorFrontmatter(md: string): string {
  let s = String(md || '').replace(/\uFEFF/g, '')
  s = s.replace(/\bKEEP---+/gi, '\n---\n')
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '\n')
    if (next === s) break
    s = next
  }
  // Unclosed opening fence at the top (KEEP--- / --- without a closer).
  s = s.replace(/^\s*---[ \t]*\r?\n?/, '\n')
  s = s.replace(/^\s*---+\s*$/gm, '')

  const h1 = s.match(/^#\s+.+$/m)
  if (h1 && h1.index != null) {
    s = s.slice(h1.index + h1[0].length)
  }

  const kept: string[] = []
  let leadingMeta = true
  for (const line of s.split(/\r?\n/)) {
    if (EDITOR_YAML_LINE_RE.test(line)) {
      if (leadingMeta) continue
      // Duplicated yaml-in-body (production leak): drop those lines too.
      continue
    }
    if (leadingMeta && /^\s*$/.test(line)) continue
    leadingMeta = false
    kept.push(line.replace(EDITOR_YAML_INLINE_RE, ' '))
  }
  return kept.join('\n')
}

/**
 * Drop markdown / editor chrome that must never enter Flesch or readability
 * Auto-fix: KEEP--- YAML, fenced code, <script>/JSON-LD, schema.org blobs.
 * Frontmatter is already removed by stripEditorFrontmatter.
 */
export function stripNonClientChrome(md: string): string {
  let s = stripEditorFrontmatter(sanitizeLeakedMarkup(String(md || '')))
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
  s = s.replace(/<script\b[^>]*>[\s\S]*$/gi, '\n')
  s = s.replace(/&lt;script\b[\s\S]*?(?:&lt;\/script&gt;|$)/gi, '\n')
  // All fenced code (json / ld+json / html / bare) — including an unclosed tail.
  s = s.replace(/```[\s\S]*?```/g, '\n')
  s = s.replace(/```[\s\S]*$/g, '\n')
  s = stripLeakedJsonLdFromBody(s).body
  // Residual schema-ish single lines (og-image / datePublished dumps without braces).
  s = s
    .split(/\r?\n/)
    .filter((line) => !isSchemaOrJsonChromeLine(line))
    .join('\n')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

function isSchemaOrJsonChromeLine(line: string): boolean {
  const t = String(line || '').trim()
  if (!t) return false
  if (/^<script\b/i.test(t) || /^<\/script>/i.test(t)) return true
  if (/application\/ld\+json/i.test(t)) return true
  if (/^[{}\[\],]+$/.test(t)) return true
  if (/^["']?@(?:context|type|id|graph)["']?\s*:/i.test(t)) return true
  // JSON-LD-only keys (safe unquoted). Ambiguous keys (name/url/image) need quotes.
  if (/^["']?(?:datePublished|dateModified|publisher|headline|mainEntity|acceptedAnswer|inLanguage|isPartOf|breadcrumb|ogImage|og:image)["']?\s*:/i.test(t)) return true
  if (/^["'](?:author|image|logo|url|name|sameAs)["']\s*:/i.test(t)) return true
  if (/^\{\s*["']@context["']/i.test(t)) return true
  if (/schema\.org/i.test(t) && /["']@type["']/i.test(t)) return true
  return false
}

/**
 * Extract prose from a markdown article: drops frontmatter, JSON-LD, code
 * fences, headings, list/toolbar markers, table pipes, links/emphasis, and
 * collapses the rest into plain sentences. Deterministic — used by both the
 * readability and (indirectly) grammar scoring.
 */
function yamlField(md: string | undefined, key: string): string {
  if (!md) return ''
  const m = String(md).match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)`, 'im'))
  return m ? m[1].trim().toLowerCase() : ''
}

/** Brief-informed Flesch floor: audience + tone + type, not a one-size legal 50. */
export function fleschTargetForBrief(hint?: EditorSeoHint, md?: string): number {
  const t = String(hint?.contentType || yamlField(md, 'content_type') || '').toLowerCase()
  const aud = `${hint?.audience || ''} ${yamlField(md, 'audience')} ${hint?.primaryKeyword || ''}`.toLowerCase()
  const tone = String(hint?.tone || yamlField(md, 'tone') || '').toLowerCase()
  const consumer = /student|applicant|parent|graduate|consumer|reader|family|hire |you\b/.test(aud)
  const plainTone = /educational|casual|friendly|plain/.test(tone)
  if (t === 'blog_post' || t === 'blog_summary' || t === 'blog') return 60
  if (t.startsWith('regional')) return 55
  if (consumer || plainTone) return 55
  return 50
}

export function extractProse(md: string): string {
  let s = stripNonClientChrome(md)
    .replace(/<[^>]+>/g, ' ')
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
function countWordSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  const core = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = core.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export function fleschReadingEase(text: string): { score: number; words: number; sentences: number } {
  const tokens = String(text || '').match(/[a-zA-Z][a-zA-Z'-]*/g) || []
  const words = tokens.length
  const sentences = Math.max(1, (String(text || '').match(/[.!?]+(\s|$)/g) || []).length)
  if (words < 10) return { score: 70, words, sentences }
  let syllables = 0
  for (const w of tokens) syllables += countWordSyllables(w)
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

  const required = listBriefKeywords(hint)
  if (required.length) {
    const covered = required.length - missingBriefKeywords(md, hint).length
    if (covered >= Math.max(1, Math.floor(required.length * 0.7))) pass.push(`${covered}/${required.length} brief keywords naturally present`)
    else fail.push(`Only ${covered}/${required.length} brief keywords present`)
  }

  const score = Math.max(5, Math.round((pass.length / Math.max(1, pass.length + fail.length)) * 100))
  return { score, pass, fail, warn }
}

export function listBriefKeywords(hint?: EditorSeoHint): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...(hint?.requiredShortKeywords || []), ...(hint?.requiredLongTailKeywords || [])]) {
    const k = String(raw || '').trim()
    if (!k) continue
    const key = k.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(k)
  }
  return out
}

export function missingBriefKeywords(md: string, hint?: EditorSeoHint): string[] {
  const prose = extractProse(md).toLowerCase()
  return listBriefKeywords(hint).filter((k) => !prose.includes(k.toLowerCase()))
}

/**
 * Weave missing brief keywords into a short body paragraph (never as an H2 —
 * pasted-keyword headings fail the quality gate). Inserted before FAQ/Sources
 * so coverage rises without stuffing the title.
 */
export function injectMissingBriefKeywords(
  md: string,
  hint?: EditorSeoHint,
): { content: string; applied: number; inserted: string[] } {
  const missing = missingBriefKeywords(md, hint).slice(0, 8)
  if (!missing.length) return { content: String(md || ''), applied: 0, inserted: [] }
  const listed = missing.length === 1
    ? missing[0]
    : missing.length === 2
      ? `${missing[0]} and ${missing[1]}`
      : `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`
  const para = `The same document and school-rule checks apply if you are comparing ${listed}. Use the institution’s written instructions, not a vendor checklist, as the source of truth.`
  const src = String(md || '')
  const faq = src.search(/^##\s+.*faq/im)
  const sources = src.search(/^##\s+.*sources/im)
  const at = faq >= 0 ? faq : sources >= 0 ? sources : -1
  const chunk = `\n\n${para}\n\n`
  const next = at >= 0 ? src.slice(0, at) + chunk + src.slice(at) : src.replace(/\s*$/, chunk)
  return { content: next, applied: missing.length, inserted: missing }
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
function splitLongSentence(sentence: string, minWords = 22): string | null {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (words.length < minWords) return null
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

function collectReadableParagraphs(md: string): string[] {
  // Body-only: JSON-LD / fences / KEEP--- already removed so Auto-fix never
  // proposes splits on schema keys (datePublished, publisher, og-image).
  const body = stripNonClientChrome(md)
  const paras: string[] = []
  let buf: string[] = []
  const flush = () => {
    const p = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (p && !isSchemaOrJsonChromeLine(p) && !/schema\.org|datePublished|acceptedAnswer/i.test(p)) paras.push(p)
    buf = []
  }
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t) { flush(); continue }
    if (/^#{1,4}\s+/.test(t)) { flush(); continue }
    if (/^table of contents\b/i.test(t)) { flush(); continue }
    if (/^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) { flush(); continue }
    if (/^</.test(t) || /^```/.test(t) || isSchemaOrJsonChromeLine(t)) { flush(); continue }
    buf.push(t.replace(/^>\s?/, ''))
  }
  flush()
  return paras
}

function isTocOrSourceDump(s: string): boolean {
  if ((s.match(/\bUSCIS\b/g) || []).length >= 3) return true
  if (!/[.?!]/.test(s) && s.split(/\s+/).length >= 12) return true
  return false
}

export function suggestReadabilityFixes(md: string, hint?: EditorSeoHint): ReadabilityFix[] {
  const target = fleschTargetForBrief(hint, md)
  const minWords = target >= 58 ? 18 : 22
  const out: ReadabilityFix[] = []
  for (const para of collectReadableParagraphs(md)) {
    if (isTocOrSourceDump(para)) continue
    const sentences = para.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
    for (const s of sentences) {
      const words = s.trim().split(/\s+/).filter(Boolean).length
      if (words < minWords) continue
      if (isTocOrSourceDump(s)) continue
      const suggestion = splitLongSentence(s, minWords)
      if (!suggestion || suggestion === s.trim()) continue
      if (!md.includes(s.trim()) && !para.includes(s.trim())) continue
      out.push({
        quote: s.trim(),
        suggestion,
        reason: `${words}-word sentence — brief target is 15–22 words for a ${hint?.audience || 'consumer'} reader`,
        words,
      })
      if (out.length >= 8) return out
    }
  }
  if (out.length < 8) {
    for (const extra of suggestPlainEnglishFixes(md)) {
      if (out.some((f) => f.quote.toLowerCase() === extra.quote.toLowerCase())) continue
      out.push(extra)
      if (out.length >= 8) break
    }
  }
  return out
}

export function applyReadabilityFixes(md: string, fixes: ReadabilityFix[]): { content: string; applied: number } {
  let next = String(md || '')
  let applied = 0
  for (const fx of fixes || []) {
    const quote = String(fx.quote || '').trim()
    const suggestion = String(fx.suggestion || '').trim()
    if (!quote || quote === suggestion) continue
    if (next.includes(quote)) {
      next = next.replace(quote, suggestion)
      applied++
      continue
    }
    const words = quote.split(/\s+/).filter(Boolean).slice(0, 10)
    if (words.length < 5) continue
    const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i')
    const m = next.match(re)
    if (!m || m.index == null) continue
    next = next.slice(0, m.index) + suggestion + next.slice(m.index + m[0].length)
    applied++
  }
  return { content: next, applied }
}

export function computeEditorMetrics(md: string, lints: Array<{ kind: string }>, hint?: EditorSeoHint): EditorMetrics {
  const prose = extractProse(md)
  const ease = fleschReadingEase(prose)
  const target = fleschTargetForBrief(hint, md)
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