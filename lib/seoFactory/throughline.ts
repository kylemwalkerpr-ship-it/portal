/**
 * Throughline desk hop — CycleGAN decoder for mill → one-author register.
 *
 * Full document in, full document out. Cycle loss = factsWerePreserved.
 * Style loss = house register card. Content loss = thesis + frozen outline
 * identity. Not Harper (finding-sweeper). Not a humanizer.
 */

import { countBodyWords, unwrapWholeDocumentFence } from './contentDepth'
import { critiqueCohesion, factsWerePreserved, type CohesionFinding } from './cohesionCritique'
import { DRAFT_HARD_MAX_CHARS } from './draftIntegrity'
import {
  extractRegisterCard,
  houseRegisterFor,
  registerCardPromptBlock,
  synthesizeThesis,
} from './registerCard'
import { isBlogFamily } from './writingShape'
import type { RevisionValidator } from './revisionQuality'

export const THROUGHLINE_SYSTEM = `You are a senior specialist revising ONE article so it is a coherent argument. Full markdown document in, full markdown document out. Preserve facts, numbers, legal qualifiers, disclaimer, sources that support the article, claim-specific/protected URLs, H1, and H2 heading text. A generic UNHCR/IOM/ILO/OECD/WHO homepage is a citation candidate, not a fact: remove it when it is unrelated to the article. Never invent or modify a URL. Merge overlapping section BODIES; never add, remove, or rename headings. Do not invent experience, fees, dates, or citations. FAQ questions must not paste an H2. Mix short and medium sentences. Named forms and agencies. Second person. Return ONLY the markdown document (no JSON wrapper, no fences).`

export type ThroughlineResult = {
  content: string
  applied: boolean
  rejected: boolean
  reason?: string
}

export function shouldRunThroughline(opts: {
  contentType?: string | null
  indexable?: boolean
  words: number
}): boolean {
  if (opts.indexable === false) return false
  const t = String(opts.contentType || '').toLowerCase()
  if (t === 'marketplace_gig' || t === 'gig') return false
  return opts.words >= 650
}

function thinRewrite(prevWords: number, nextWords: number): boolean {
  if (nextWords < 40) return true
  return prevWords >= 800 && nextWords < 800 && (nextWords < 400 || nextWords < prevWords * 0.4)
}

export async function runThroughline(opts: {
  content: string
  thesis?: string | null
  contentType?: string | null
  primaryKeyword?: string | null
  reader?: string | null
  queryNeed?: string | null
  cohesionFindings?: CohesionFinding[]
  eeatDirectives?: string[]
  generateText: (system: string, prompt: string) => Promise<string>
  minWords?: number
  maxWords?: number
  validateRevision?: RevisionValidator
}): Promise<ThroughlineResult> {
  const original = String(opts.content || '')
  const prevWords = countBodyWords(original)
  if (original.length > DRAFT_HARD_MAX_CHARS || prevWords < 40) {
    return {
      content: original,
      applied: false,
      rejected: true,
      reason: 'Throughline skipped — body too short or over the hard character cap',
    }
  }

  const house = houseRegisterFor(opts.contentType)
  const current = extractRegisterCard(original)
  const thesis = synthesizeThesis({
    thesis: opts.thesis,
    primaryKeyword: opts.primaryKeyword,
    reader: opts.reader,
    queryNeed: opts.queryNeed,
  })
  const findings = (opts.cohesionFindings || []).filter((f) => f.code || f.message)
  const prompt = JSON.stringify({
    thesis,
    houseRegister: registerCardPromptBlock(house, current),
    cohesionFindings: findings.slice(0, 12),
    eeatDirectives: (opts.eeatDirectives || []).slice(0, 8),
    citationRule: 'Preserve claim-specific/protected URLs. Irrelevant generic intergovernmental homepages may be removed. Do not invent or alter URLs.',
    blog: isBlogFamily(opts.contentType),
    wordBudget: { minWords: opts.minWords, maxWords: opts.maxWords },
    lengthRule: 'Keep the body within wordBudget. Improve clarity without padding or removing useful detail. If the draft is already outside the window, move toward it without making the violation worse.',
    document: original,
  })

  let raw = ''
  try {
    raw = await opts.generateText(THROUGHLINE_SYSTEM, prompt)
  } catch (err) {
    return {
      content: original,
      applied: false,
      rejected: true,
      reason: err instanceof Error ? err.message : 'Throughline generate failed',
    }
  }

  const revised = unwrapWholeDocumentFence(String(raw || '')).trim()
  const nextWords = countBodyWords(revised)
  if (thinRewrite(prevWords, nextWords)) {
    return {
      content: original,
      applied: false,
      rejected: true,
      reason: 'Throughline rejected — revised body too thin',
    }
  }
  const preserved = factsWerePreserved(original, revised)
  if (!preserved.ok) {
    return {
      content: original,
      applied: false,
      rejected: true,
      reason: preserved.reason,
    }
  }
  if (opts.minWords != null && nextWords < Math.min(opts.minWords, prevWords)) {
    return {
      content: original,
      applied: false,
      rejected: true,
      reason: 'Throughline rejected — word floor shrank',
    }
  }
  const reject = (reason: string): ThroughlineResult => ({ content: original, applied: false, rejected: true, reason })
  if (revised.length > DRAFT_HARD_MAX_CHARS) return reject('Throughline rejected — character cap exceeded')
  if (opts.maxWords != null && nextWords > Math.max(opts.maxWords, prevWords)) {
    return reject('Throughline rejected — word ceiling grew')
  }
  const headings = (text: string) => text.split('\n').filter(line => /^#{1,2}\s+\S/.test(line.trim())).map(line => line.trim())
  if (JSON.stringify(headings(original)) !== JSON.stringify(headings(revised))) {
    return reject('Throughline rejected — heading identity changed')
  }
  const urls = (text: string) => text.match(/https?:\/\/[^\s)\]>'"`]+/gi) || []
  const originalUrls = new Set(urls(original))
  if (urls(revised).some(url => !originalUrls.has(url))) return reject('Throughline rejected — invented URL')
  const validation = opts.validateRevision?.(original, revised)
  if (validation && !validation.ok) return reject(validation.reason || 'Throughline rejected — publishing quality regressed')
  return { content: revised, applied: true, rejected: false }
}

/** Pipeline/stream door: skip kit types, attach cohesion findings, never throw. */
export async function runFactoryThroughline(opts: {
  content: string
  contentType: string
  indexable: boolean
  thesis?: string | null
  primaryKeyword?: string | null
  reader?: string | null
  queryNeed?: string | null
  minWords?: number
  maxWords?: number
  validateRevision?: RevisionValidator
  generateText: (system: string, prompt: string) => Promise<string>
}): Promise<ThroughlineResult> {
  const words = countBodyWords(opts.content)
  if (!shouldRunThroughline({ contentType: opts.contentType, indexable: opts.indexable, words })) {
    return { content: opts.content, applied: false, rejected: false, reason: 'throughline not applicable' }
  }
  try {
    const cohesion = critiqueCohesion(opts.content)
    return await runThroughline({
      content: opts.content,
      thesis: opts.thesis,
      contentType: opts.contentType,
      primaryKeyword: opts.primaryKeyword,
      reader: opts.reader,
      queryNeed: opts.queryNeed,
      cohesionFindings: cohesion.findings,
      generateText: opts.generateText,
      minWords: opts.minWords,
      maxWords: opts.maxWords,
      validateRevision: opts.validateRevision,
    })
  } catch (err) {
    return {
      content: opts.content,
      applied: false,
      rejected: true,
      reason: err instanceof Error ? err.message : 'Throughline failed',
    }
  }
}
