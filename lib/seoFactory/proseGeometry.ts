/**
 * Model-free prose geometry — burstiness, trigram variety, cohesion holds.
 *
 * These are quality signals for "does this read as one authored argument",
 * not an AI-detector. No scorer LLM, no GPTZero/Pangram/Binoculars. YMYL
 * legal English is allowed to be flatter than a blog; only kit-glue and
 * looping n-grams hold ship.
 */

import { critiqueCohesion } from './cohesionCritique'
import { isBlogFamily } from './writingShape'

export type ProseGeometrySeverity = 'blocker' | 'warning'

export type ProseGeometryFinding = {
  code:
    | 'adjacent_section_overlap'
    | 'adjacent_section_overlap_severe'
    | 'faq_duplicates_h2'
    | 'repeated_paragraph_opener'
    | 'low_sentence_burstiness'
    | 'low_trigram_variety'
    | 'stuffed_primary_opener'
  severity: ProseGeometrySeverity
  message: string
  fix?: string
  evidence?: string
}

export type ProseGeometryReport = {
  sentenceCount: number
  meanSentenceWords: number
  burstinessCv: number
  trigramUniqueRatio: number
  tokenCount: number
  findings: ProseGeometryFinding[]
}

const STRUCTURAL_H2 =
  /^(?:in 60 seconds|tldr|tl;?dr|key takeaways|faq|frequently asked questions|sources|official sources|disclaimer|table of contents|related guides?|references)$/i

function stripYamlAndFences(content: string): string {
  let body = String(content || '')
  body = body.replace(/^\uFEFF/, '')
  body = body.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
  body = body.replace(/```[\s\S]*?```/g, '\n')
  return body
}

function isHeadingLine(s: string): boolean {
  return /^\s*#{1,6}\s/.test(s)
}

function stripListMarker(s: string): string {
  return s.replace(/^\s*(?:[-*+]|\d+[.)])\s/, '')
}

/** Word counts of prose sentences in the 5–60 word band (real rhythm, not packing). */
export function proseSentenceWordCounts(content: string): number[] {
  const body = stripYamlAndFences(content)
  const chunks = body
    .split(/\n\s*\n/)
    .flatMap((para) =>
      para
        .split('\n')
        .filter((line) => !isHeadingLine(line))
        .join('\n')
        .split(/(?<=[.!?])\s+/),
    )
    .map((s) => stripListMarker(s.replace(/<[^>]+>/g, ' ').replace(/\*\*|__|`/g, '')).replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20 && !/^(?:https?:\/\/|www\.)/i.test(s))
  const counts: number[] = []
  for (const s of chunks) {
    const n = s.split(/\s+/).filter(Boolean).length
    if (n >= 5 && n <= 60) counts.push(n)
  }
  return counts
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 0) return 0
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function dropStructuralSections(body: string): string {
  const parts = String(body || '').split(/^(##\s+)/m)
  if (parts.length < 3) return body
  let out = parts[0]
  for (let i = 1; i < parts.length; i += 2) {
    const headingAndBody = parts[i + 1] || ''
    const heading = headingAndBody.split('\n')[0] || ''
    if (STRUCTURAL_H2.test(heading.replace(/[#*_`]/g, '').trim())) continue
    out += `## ${headingAndBody}`
  }
  return out
}

export function trigramUniqueRatio(content: string): { ratio: number; tokens: number } {
  const body = dropStructuralSections(stripYamlAndFences(content))
    .replace(/^#{1,6}\s+.+$/gm, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .toLowerCase()
  const tokens = body.match(/[a-z0-9']+/g) || []
  if (tokens.length < 80) return { ratio: 1, tokens: tokens.length }
  const grams = new Set<string>()
  let total = 0
  for (let i = 0; i < tokens.length - 2; i++) {
    grams.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
    total++
  }
  return { ratio: total ? grams.size / total : 1, tokens: tokens.length }
}

function jaccardFromEvidence(evidence?: string): number {
  const m = String(evidence || '').match(/jaccard=([0-9.]+)/)
  return m ? Number(m[1]) : 0
}

const TOPIC_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'your', 'you',
  'how', 'what', 'why', 'who', 'when', 'where', 'works', 'work', 'guide', 'complete', '2026',
])

function topicWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 2 && !TOPIC_STOP.has(w))
}

function primaryTopic(content: string): string {
  const raw = String(content || '')
  const fm = raw.match(/^primaryKeyword:\s*["']?(.+?)["']?\s*$/mi)
  if (fm?.[1]) return fm[1].trim()
  const h1 = stripYamlAndFences(raw).match(/^#\s+(.+)$/m)
  return h1?.[1]?.replace(/[*_`]/g, '').trim() || ''
}

function longestOrderedRun(needle: string[], haystack: string[]): number {
  if (!needle.length || !haystack.length) return 0
  let best = 0
  for (let i = 0; i < needle.length; i++) {
    for (let j = 0; j < haystack.length; j++) {
      let run = 0
      while (needle[i + run] && haystack[j + run] && needle[i + run] === haystack[j + run]) run++
      if (run > best) best = run
    }
  }
  return best
}

function stuffedPrimaryOpeners(content: string): Array<{ heading: string; opener: string }> {
  const primary = topicWords(primaryTopic(content))
  if (primary.length < 3) return []
  const body = stripYamlAndFences(content)
  const re = /^##\s+(.+)$/gm
  const marks: Array<{ index: number; heading: string; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    marks.push({ index: m.index, heading: m[1].trim(), end: re.lastIndex })
  }
  const out: Array<{ heading: string; opener: string }> = []
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]
    if (STRUCTURAL_H2.test(mark.heading.replace(/[#*_`]/g, '').trim())) continue
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length
    const section = body.slice(mark.end, end).trim()
    const para = section
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .find((p) => p && !/^#{1,6}\s/.test(p) && !/^(?:[-*+]\s+|\d+[.)]\s+)/.test(p))
    if (!para) continue
    const opener = (para.split(/(?<=[.!?])\s+/)[0] || '').replace(/\s+/g, ' ').trim()
    if (!/^(?:the|this)\b/i.test(opener)) continue
    const firstWords = topicWords(opener).slice(0, 14)
    const run = longestOrderedRun(primary, firstWords)
    const overlap = primary.filter((w) => firstWords.includes(w)).length / primary.length
    const weakVerb = /\b(?:is|are|means|restates|covers|explains|provides|shows|helps|offers|gives|summari[sz]es)\b/i.test(opener)
    if (weakVerb && (run >= 4 || (primary.length <= 6 && overlap >= 0.8))) {
      out.push({ heading: mark.heading, opener })
    }
  }
  return out
}

/**
 * Geometry floors: blogs must vary more; guides may be flatter YMYL English.
 * Severe adjacent-section overlap is the only ship hold — that is mill glue.
 */
export function evaluateProseGeometry(
  content: string,
  opts?: { contentType?: string | null; indexable?: boolean },
): ProseGeometryReport {
  const findings: ProseGeometryFinding[] = []
  const blog = isBlogFamily(opts?.contentType)
  const counts = proseSentenceWordCounts(content)
  const burstinessCv = coefficientOfVariation(counts)
  const meanSentenceWords = counts.length
    ? counts.reduce((a, b) => a + b, 0) / counts.length
    : 0
  const { ratio: trigramRatio, tokens } = trigramUniqueRatio(content)

  if (opts?.indexable === false) {
    return {
      sentenceCount: counts.length,
      meanSentenceWords,
      burstinessCv,
      trigramUniqueRatio: trigramRatio,
      tokenCount: tokens,
      findings,
    }
  }

  const cohesion = critiqueCohesion(content)
  for (const finding of cohesion.findings) {
    if (finding.code === 'adjacent_section_overlap') {
      const j = jaccardFromEvidence(finding.evidence)
      if (j >= 0.65) {
        findings.push({
          code: 'adjacent_section_overlap_severe',
          severity: 'blocker',
          message: `Adjacent H2s repeat the same argument (${finding.message})`,
          fix: 'Rewrite the later section so it advances a new claim, step, or constraint. Do not restate the previous H2.',
          evidence: finding.evidence,
        })
      } else {
        findings.push({
          code: 'adjacent_section_overlap',
          severity: 'warning',
          message: finding.message,
          fix: 'Give the later section a distinct job. Overlapping adjacent H2s read as mill glue.',
          evidence: finding.evidence,
        })
      }
      continue
    }
    if (finding.code === 'faq_duplicates_h2') {
      findings.push({
        code: 'faq_duplicates_h2',
        severity: 'warning',
        message: finding.message,
        fix: 'Ask a reader question the H2 did not already answer. Do not paste the heading into the FAQ.',
        evidence: finding.evidence,
      })
      continue
    }
    if (finding.code === 'repeated_paragraph_opener') {
      findings.push({
        code: 'repeated_paragraph_opener',
        severity: 'warning',
        message: finding.message,
        fix: 'Vary paragraph openings. Lead with a new actor, constraint, or next step.',
        evidence: finding.evidence,
      })
    }
  }

  for (const stuffed of stuffedPrimaryOpeners(content)) {
    findings.push({
      code: 'stuffed_primary_opener',
      severity: 'warning',
      message: `The first sentence under “${stuffed.heading}” mechanically restates the primary topic instead of answering the section.`,
      fix: 'Open with the reader decision, constraint, or concrete fact. Use the full primary phrase only where it reads naturally.',
      evidence: `heading=${encodeURIComponent(stuffed.heading)};opener=${encodeURIComponent(stuffed.opener.slice(0, 180))}`,
    })
  }

  if (counts.length >= 12) {
    const floor = blog ? 0.28 : 0.16
    if (burstinessCv < floor) {
      findings.push({
        code: 'low_sentence_burstiness',
        severity: 'warning',
        message: blog
          ? `Sentence length is too uniform (CV ${burstinessCv.toFixed(2)}, blog floor ${floor}) — mill rhythm`
          : `Sentence length is unusually uniform (CV ${burstinessCv.toFixed(2)}, guide floor ${floor}) — mix short and medium sentences`,
        fix: 'Follow a longer explanatory sentence with a short one. Do not write a page of 14-word sentences.',
        evidence: `cv=${burstinessCv.toFixed(3)};mean=${meanSentenceWords.toFixed(1)};n=${counts.length}`,
      })
    }
  }

  if (tokens >= 200) {
    const floor = blog ? 0.55 : 0.45
    if (trigramRatio < floor) {
      findings.push({
        code: 'low_trigram_variety',
        severity: 'warning',
        message: blog
          ? `Phrasal variety is low (${(trigramRatio * 100).toFixed(0)}% unique 3-grams, blog floor 55%)`
          : `Phrasal variety is low (${(trigramRatio * 100).toFixed(0)}% unique 3-grams, guide floor 45%) — looping mill phrases`,
        fix: 'Cut repeated three-word loops ("confirm the current", "on the official site"). Say it once, then advance.',
        evidence: `ratio=${trigramRatio.toFixed(3)};tokens=${tokens}`,
      })
    }
  }

  return {
    sentenceCount: counts.length,
    meanSentenceWords,
    burstinessCv,
    trigramUniqueRatio: trigramRatio,
    tokenCount: tokens,
    findings,
  }
}
