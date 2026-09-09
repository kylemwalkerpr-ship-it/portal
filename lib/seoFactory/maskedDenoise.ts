/**
 * Masked denoise — diffusion infill without a diffusion model.
 *
 * Geometry findings are the mask. Frozen remainder never goes to the writer.
 * Cycle loss = factsWerePreserved + no invented URLs + H1/H2 identity.
 * CFG: facts high, house register low. Max two steps. Not a humanizer.
 */

import { factsWerePreserved } from './cohesionCritique'
import { countBodyWords, unwrapWholeDocumentFence } from './contentDepth'
import { evaluateProseGeometry, type ProseGeometryFinding } from './proseGeometry'
import {
  extractRegisterCard,
  houseRegisterFor,
  registerCardPromptBlock,
  synthesizeThesis,
} from './registerCard'

export const DENOISE_SYSTEM = `You rewrite ONLY the marked mill spans of an immigration/education article. Return replacements for those spans and nothing else. Preserve facts, numbers, legal qualifiers, and claim-specific/protected URLs. A generic UNHCR/IOM/ILO/OECD/WHO homepage is a citation candidate, not a fact: if it does not support the span, you may remove it. Do not add URLs or numbers that were not in the span. Do not invent experience, fees, dates, or citations. Do not add, remove, or rename headings. Mix short and medium sentences. Second person. Named forms and agencies. FAQ questions must not paste an H2.`

export type DenoiseStrength = 'high' | 'mid'

export type DenoiseSpan = {
  id: string
  code: string
  t: DenoiseStrength
  start: number
  end: number
  original: string
  instruction: string
}

export type MaskedDenoiseResult = {
  content: string
  applied: boolean
  rejected: boolean
  passes: number
  spans: number
  reason?: string
}

const STRUCTURAL_H2 =
  /^(?:in 60 seconds|tldr|tl;?dr|key takeaways|faq|frequently asked questions|sources|official sources|disclaimer|table of contents|related guides?|references)$/i

const URL_RE = /https?:\/\/[^\s)\]>'"`]+/gi

export function shouldRunMaskedDenoise(opts: {
  contentType?: string | null
  indexable?: boolean
  words: number
}): boolean {
  if (opts.indexable === false) return false
  const t = String(opts.contentType || '').toLowerCase()
  if (t === 'marketplace_gig' || t === 'gig') return false
  return opts.words >= 650
}

function bodyStart(content: string): number {
  const m = String(content || '').match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/)
  return m ? m[0].length : 0
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function headingLines(content: string): string[] {
  return String(content || '')
    .split('\n')
    .filter((l) => /^#{1,2}\s+\S/.test(l.trim()))
    .map((l) => l.trim())
}

function laterHeadingFromEvidence(evidence?: string, message?: string): string {
  const ev = String(evidence || '')
  const m = ev.match(/later=(.+)$/)
  if (m) return m[1].trim()
  const q = String(message || '').match(/Adjacent H2s [“"]([^”"]+)[”"] and [“"]([^”"]+)[”"]/)
  return q ? q[2].trim() : ''
}

function evidenceValue(evidence: string | undefined, key: string): string {
  const m = String(evidence || '').match(new RegExp(`(?:^|;)${escapeRe(key)}=([^;]+)`))
  if (!m) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function findH2Body(content: string, heading: string): { start: number; end: number } | null {
  if (!heading) return null
  const re = new RegExp(`^##\\s+${escapeRe(heading)}\\s*$`, 'im')
  const m = re.exec(content)
  if (!m) return null
  const nl = content.indexOf('\n', m.index)
  const start = nl < 0 ? content.length : nl + 1
  const rest = content.slice(start)
  const next = rest.search(/^##\s+/m)
  const end = next < 0 ? content.length : start + next
  if (end - start < 40) return null
  return { start, end }
}

function findFirstProseParagraphInH2(content: string, heading: string): { start: number; end: number } | null {
  const body = findH2Body(content, heading)
  if (!body) return null
  const section = content.slice(body.start, body.end)
  const chunks = section.split(/(\n{2,})/)
  let offset = body.start
  for (const chunk of chunks) {
    const lead = chunk.length - chunk.trimStart().length
    const text = chunk.trim()
    const start = offset + lead
    const end = start + text.length
    offset += chunk.length
    if (!text || text.length < 24) continue
    if (/^#{1,6}\s/.test(text)) continue
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(text)) continue
    if (/^(?:```|<script)/i.test(text)) continue
    return { start, end }
  }
  return null
}

function findFaqQuestionLine(content: string, question: string): { start: number; end: number } | null {
  const q = String(question || '').trim()
  if (!q) return null
  const re = new RegExp(`^###\\s+${escapeRe(q)}\\s*$`, 'im')
  const m = re.exec(content)
  if (!m) return null
  const nl = content.indexOf('\n', m.index)
  const end = nl < 0 ? content.length : nl
  return { start: m.index, end }
}

function proseParagraphs(content: string): Array<{ start: number; end: number; text: string }> {
  const min = bodyStart(content)
  const chunks = content.split(/(\n{2,})/)
  const out: Array<{ start: number; end: number; text: string }> = []
  let idx = 0
  for (const chunk of chunks) {
    const lead = chunk.length - chunk.trimStart().length
    const text = chunk.trim()
    const start = idx + lead
    const end = start + text.length
    idx += chunk.length
    if (start < min) continue
    if (!text || text.length < 40) continue
    if (/^#{1,6}\s/.test(text)) continue
    if (/^[-*+]\s/m.test(text) && !text.includes('\n\n')) continue
    if (/^\d+[.)]\s/.test(text)) continue
    if (/^(?:---|<script|```)/.test(text)) continue
    if (STRUCTURAL_H2.test(text.replace(/^#+\s*/, '').split('\n')[0] || '')) continue
    out.push({ start, end, text })
  }
  return out
}

function firstFour(paragraph: string): string {
  return paragraph
    .replace(/[#>*_`[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, ''))
    .filter(Boolean)
    .join(' ')
}

function sentenceWordCounts(text: string): number[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
    .filter((n) => n >= 5 && n <= 60)
}

function cv(values: number[]): number {
  if (values.length < 2) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 0) return 0
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function urlsIn(text: string): Set<string> {
  const set = new Set<string>()
  for (const u of String(text || '').match(URL_RE) || []) {
    set.add(u.replace(/[.,;:]+$/, '').toLowerCase())
  }
  return set
}

function inventedUrls(original: string, revised: string): string[] {
  const orig = urlsIn(original)
  const extra: string[] = []
  for (const u of urlsIn(revised)) if (!orig.has(u)) extra.push(u)
  return extra
}

function mergeSpans(spans: DenoiseSpan[]): DenoiseSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: DenoiseSpan[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start < last.end) {
      if (s.t === 'high' && last.t !== 'high') last.t = 'high'
      last.end = Math.max(last.end, s.end)
      last.original = ''
      last.instruction = `${last.instruction} Also: ${s.instruction}`
      last.code = last.code === s.code ? last.code : `${last.code}+${s.code}`
      continue
    }
    out.push({ ...s })
  }
  return out
}

function fillOriginals(content: string, spans: DenoiseSpan[]): DenoiseSpan[] {
  return spans
    .map((s, i) => ({ ...s, id: `SPAN_${i + 1}`, original: content.slice(s.start, s.end) }))
    .filter((s) => s.original.trim().length >= 12)
}

export function collectDenoiseSpans(content: string, findings: ProseGeometryFinding[]): DenoiseSpan[] {
  const raw: DenoiseSpan[] = []
  const used = new Set<string>()
  const push = (span: Omit<DenoiseSpan, 'id' | 'original'>) => {
    if (span.start < bodyStart(content) || span.end <= span.start) return
    const key = `${span.start}:${span.end}`
    if (used.has(key)) return
    used.add(key)
    raw.push({ id: '', original: content.slice(span.start, span.end), ...span })
  }

  for (const f of findings) {
    if (f.code === 'adjacent_section_overlap_severe' || f.code === 'adjacent_section_overlap') {
      const loc = findH2Body(content, laterHeadingFromEvidence(f.evidence, f.message))
      if (loc) push({ code: f.code, t: 'high', ...loc, instruction: 'Rewrite this later H2 body so it advances a new claim, step, or constraint. Do not restate the previous section. Keep the heading above untouched.' })
    }
    if (f.code === 'faq_duplicates_h2') {
      const loc = findFaqQuestionLine(content, String(f.evidence || ''))
      if (loc) push({ code: f.code, t: 'high', ...loc, instruction: 'Rewrite as one reader question this H2 did not already ask. Keep a single ### line. Do not paste the heading.' })
    }
    if (f.code === 'repeated_paragraph_opener') {
      const opener = String(f.evidence || '').trim().toLowerCase()
      let seen = 0
      for (const p of proseParagraphs(content)) {
        if (firstFour(p.text) !== opener) continue
        if (++seen === 1) continue
        push({ code: f.code, t: 'mid', start: p.start, end: p.end, instruction: 'Rewrite this paragraph with a new opening actor, constraint, or next step. Keep the facts.' })
      }
    }
    if (f.code === 'stuffed_primary_opener') {
      const loc = findFirstProseParagraphInH2(content, evidenceValue(f.evidence, 'heading'))
      if (loc) push({ code: f.code, t: 'mid', ...loc, instruction: 'Rewrite this opening paragraph so the first sentence answers the section with a reader decision, constraint, or concrete fact. Do not mechanically restate the full primary keyword. Keep factual tokens and claim-specific citations.' })
    }
  }

  if (findings.some((f) => f.code === 'low_sentence_burstiness' || f.code === 'low_trigram_variety')) {
    const scored = proseParagraphs(content)
      .map((p) => ({ p, counts: sentenceWordCounts(p.text) }))
      .filter((x) => x.counts.length >= 3 && x.p.text.split(/\s+/).length >= 40)
      .map((x) => ({ ...x, cv: cv(x.counts) }))
      .filter((x) => x.cv < 0.12)
      .sort((a, b) => a.cv - b.cv)
      .slice(0, 2)
    for (const x of scored) push({ code: 'low_sentence_burstiness', t: 'mid', start: x.p.start, end: x.p.end, instruction: 'Rewrite this paragraph so sentence length varies. Follow a longer explanatory sentence with a short one. Keep every protected URL, number, and qualifier; remove a generic global homepage only when it is irrelevant.' })
  }

  const high = raw.filter((s) => s.t === 'high')
  const mid = raw.filter((s) => s.t !== 'high')
  return fillOriginals(content, mergeSpans([...high, ...mid]).slice(0, 4))
}

export function parseSpanReplacements(raw: string): Map<string, string> {
  const text = unwrapWholeDocumentFence(String(raw || '')).trim()
  const map = new Map<string, string>()
  const re = /===SPAN_(\d+)===\s*([\s\S]*?)(?====SPAN_\d+===|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const body = m[2].replace(/^\s*```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    if (body) map.set(`SPAN_${m[1]}`, body)
  }
  return map
}

export function replacementAllowed(span: DenoiseSpan, next: string, wholeOriginal: string): boolean {
  const revised = String(next || '').trim()
  if (revised.length < 8 || /<script/i.test(revised) || /===SPAN_/i.test(revised)) return false
  if (/^##\s/m.test(revised) && !/^##\s/m.test(span.original.trim())) return false
  if (span.code.includes('faq_duplicates_h2') && !/^###\s+\S/m.test(revised)) return false
  if (!factsWerePreserved(span.original, revised).ok) return false
  if (inventedUrls(wholeOriginal, revised).length) return false
  const prevWords = span.original.split(/\s+/).filter(Boolean).length
  const nextWords = revised.split(/\s+/).filter(Boolean).length
  return !(prevWords >= 80 && nextWords < prevWords * 0.4)
}

export function applySpanReplacements(content: string, spans: DenoiseSpan[], replacements: Map<string, string>): { content: string; applied: number } {
  let next = content
  let applied = 0
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    const rev = replacements.get(span.id)
    if (!rev || !replacementAllowed(span, rev, content)) continue
    let piece = rev.trim()
    const after = next.slice(span.end, span.end + 4)
    if ((span.original.endsWith('\n') || /^#{1,6}\s/.test(after) || after.startsWith('#')) && !piece.endsWith('\n')) piece += '\n'
    next = next.slice(0, span.start) + piece + next.slice(span.end)
    applied++
  }
  return { content: next, applied }
}

function annotateForPrompt(content: string, spans: DenoiseSpan[]): string {
  let out = content
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, span.start) + `<<<${span.id}>>>\n${span.original}\n<<<END_${span.id}>>>` + out.slice(span.end)
  }
  return out
}

function buildDenoisePrompt(opts: { content: string; spans: DenoiseSpan[]; contentType?: string | null; thesis?: string | null; primaryKeyword?: string | null; reader?: string | null; queryNeed?: string | null }): string {
  const house = houseRegisterFor(opts.contentType)
  const current = extractRegisterCard(opts.content)
  const thesis = synthesizeThesis({ thesis: opts.thesis, primaryKeyword: opts.primaryKeyword, reader: opts.reader, queryNeed: opts.queryNeed })
  return [
    'CFG — high on facts, low on cadence:',
    '- Keep every number, legal qualifier, and claim-specific/protected URL that appears inside a span.',
    '- Generic UNHCR/IOM/ILO/OECD/WHO homepages are not facts. If one is irrelevant to the span, remove it.',
    '- Do not add a URL or number that was not in that span.',
    '- Mix short and medium sentences. Second person. Named forms.',
    registerCardPromptBlock(house, current),
    `THESIS (do not restate; advance it in the later span if you touch a section body): ${thesis}`,
    '',
    'SPANS TO REWRITE:',
    opts.spans.map((s) => `${s.id} [${s.t}/${s.code}]: ${s.instruction}`).join('\n'),
    '',
    'Return ONLY blocks in the ===SPAN_N=== form and no other prose.',
    '',
    'ARTICLE (spans marked; rewrite only the marked regions):',
    annotateForPrompt(opts.content, opts.spans),
  ].join('\n')
}

function acceptPass(original: string, next: string): { ok: boolean; reason?: string } {
  if (next === original) return { ok: false, reason: 'unchanged' }
  const preserved = factsWerePreserved(original, next)
  if (!preserved.ok) return preserved
  if (inventedUrls(original, next).length) return { ok: false, reason: 'Invented URLs in denoise pass' }
  const prevH = headingLines(original)
  const nextH = headingLines(next)
  if (prevH.length !== nextH.length || prevH.some((h, i) => h !== nextH[i])) return { ok: false, reason: 'Heading identity changed' }
  const prevWords = countBodyWords(original)
  const nextWords = countBodyWords(next)
  if (prevWords >= 800 && nextWords < 800 && (nextWords < 400 || nextWords < prevWords * 0.4)) return { ok: false, reason: 'Denoise thinned the body' }
  return { ok: true }
}

export async function runMaskedDenoise(opts: { content: string; contentType?: string | null; thesis?: string | null; primaryKeyword?: string | null; reader?: string | null; queryNeed?: string | null; generateText: (system: string, prompt: string) => Promise<string>; maxPasses?: number }): Promise<MaskedDenoiseResult> {
  let current = String(opts.content || '')
  const maxPasses = opts.maxPasses ?? 2
  let passes = 0
  let spanCount = 0
  let appliedAny = false
  for (let i = 0; i < maxPasses; i++) {
    const geometry = evaluateProseGeometry(current, { contentType: opts.contentType, indexable: true })
    const spans = collectDenoiseSpans(current, geometry.findings)
    if (!spans.length) return { content: current, applied: appliedAny, rejected: false, passes, spans: spanCount, reason: appliedAny ? undefined : 'no mill spans' }
    spanCount += spans.length
    let raw = ''
    try {
      raw = await opts.generateText(DENOISE_SYSTEM, buildDenoisePrompt({ content: current, spans, contentType: opts.contentType, thesis: opts.thesis, primaryKeyword: opts.primaryKeyword, reader: opts.reader, queryNeed: opts.queryNeed }))
    } catch (err) {
      return { content: current, applied: appliedAny, rejected: !appliedAny, passes, spans: spanCount, reason: err instanceof Error ? err.message : 'Denoise generate failed' }
    }
    const spliced = applySpanReplacements(current, spans, parseSpanReplacements(raw))
    if (!spliced.applied) return { content: current, applied: appliedAny, rejected: !appliedAny, passes, spans: spanCount, reason: 'Denoise replacements rejected' }
    const check = acceptPass(current, spliced.content)
    if (!check.ok) return { content: current, applied: appliedAny, rejected: !appliedAny, passes, spans: spanCount, reason: check.reason }
    current = spliced.content
    appliedAny = true
    passes++
  }
  return { content: current, applied: appliedAny, rejected: false, passes, spans: spanCount }
}

export async function runFactoryMaskedDenoise(opts: { content: string; contentType: string; indexable: boolean; thesis?: string | null; primaryKeyword?: string | null; reader?: string | null; queryNeed?: string | null; generateText: (system: string, prompt: string) => Promise<string> }): Promise<MaskedDenoiseResult> {
  const words = countBodyWords(opts.content)
  if (!shouldRunMaskedDenoise({ contentType: opts.contentType, indexable: opts.indexable, words })) return { content: opts.content, applied: false, rejected: false, passes: 0, spans: 0, reason: 'denoise not applicable' }
  try {
    return await runMaskedDenoise({ ...opts })
  } catch (err) {
    return { content: opts.content, applied: false, rejected: true, passes: 0, spans: 0, reason: err instanceof Error ? err.message : 'Denoise failed' }
  }
}
