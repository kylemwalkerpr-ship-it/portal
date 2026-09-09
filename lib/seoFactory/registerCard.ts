/**
 * House register card — Biber-lite style target for YMYL guides.
 *
 * This is Gatys style loss, not authorship transfer. Content (facts, URLs,
 * legal qualifiers, outline identity) stays frozen. Style is involvement,
 * artefact density, hedges, and sentence rhythm. No LoRA, no humanizer,
 * no named-person clone.
 */

import {
  coefficientOfVariation,
  proseSentenceWordCounts,
  trigramUniqueRatio,
} from './proseGeometry'
import { isBlogFamily } from './writingShape'

export type RegisterCard = {
  burstinessCv: number
  trigramUniqueRatio: number
  youPerHundred: number
  hedgePerHundred: number
  artefactPerHundred: number
  contractionPerHundred: number
}

/** Legal-guide pole: involved, artefact-heavy, few contractions. */
export const HOUSE_REGISTER_GUIDE: RegisterCard = {
  burstinessCv: 0.22,
  trigramUniqueRatio: 0.52,
  youPerHundred: 1.8,
  hedgePerHundred: 1.2,
  artefactPerHundred: 1.5,
  contractionPerHundred: 0.35,
}

/** Blog pole: more burstiness and contractions; still second person. */
export const HOUSE_REGISTER_BLOG: RegisterCard = {
  burstinessCv: 0.32,
  trigramUniqueRatio: 0.58,
  youPerHundred: 2.2,
  hedgePerHundred: 0.8,
  artefactPerHundred: 1.1,
  contractionPerHundred: 1.1,
}

const ARTEFACT_RE =
  /\b(?:form\s+[a-z]{0,3}-?\d+[a-z]?|i-\d+|imm\s*\d+|uscis|ukvi|ircc|home affairs|department of home affairs|nvc|sevis|cas\b|coe\b|confirmation of enrolment|skilled worker|study permit)\b/gi
const YOU_RE = /\b(?:you|your|yours|yourself)\b/gi
const HEDGE_RE =
  /\b(?:must(?:\s+not)?|may(?:\s+not)?|cannot|can\s+not|should|check the official|verify|requirements vary)\b/gi
const CONTRACTION_RE =
  /\b(?:don't|doesn't|isn't|aren't|wasn't|weren't|won't|can't|couldn't|shouldn't|wouldn't|it's|you're|you'll|you've|we're|they're|that's|there's|let's)\b/gi

function bodyWords(content: string): string[] {
  return String(content || '')
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.+$/gm, ' ')
    .toLowerCase()
    .match(/[a-z0-9']+/g) || []
}

function perHundred(count: number, words: number): number {
  if (words < 40) return 0
  return (count / words) * 100
}

export function houseRegisterFor(contentType?: string | null): RegisterCard {
  return isBlogFamily(contentType) ? { ...HOUSE_REGISTER_BLOG } : { ...HOUSE_REGISTER_GUIDE }
}

export function extractRegisterCard(content: string): RegisterCard {
  const counts = proseSentenceWordCounts(content)
  const { ratio } = trigramUniqueRatio(content)
  const words = bodyWords(content)
  const n = words.length
  const text = words.join(' ')
  return {
    burstinessCv: coefficientOfVariation(counts),
    trigramUniqueRatio: ratio,
    youPerHundred: perHundred((text.match(YOU_RE) || []).length, n),
    hedgePerHundred: perHundred((text.match(HEDGE_RE) || []).length, n),
    artefactPerHundred: perHundred((text.match(ARTEFACT_RE) || []).length, n),
    contractionPerHundred: perHundred((text.match(CONTRACTION_RE) || []).length, n),
  }
}

/**
 * Cheap D_desk vs house card. Three or more drifted dimensions → warning.
 * Low burstiness / trigrams / you / artefacts, or high contractions on guides.
 */
export type RegisterDrift = {
  dimensions: string[]
  message: string
}

export function registerDrift(
  current: RegisterCard,
  house: RegisterCard,
  opts?: { contentType?: string | null },
): RegisterDrift | null {
  const blog = isBlogFamily(opts?.contentType)
  const hit: string[] = []
  if (current.burstinessCv + 0.02 < house.burstinessCv) hit.push('burstiness')
  if (current.trigramUniqueRatio + 0.04 < house.trigramUniqueRatio) hit.push('trigrams')
  if (current.youPerHundred + 0.4 < house.youPerHundred) hit.push('second_person')
  if (current.artefactPerHundred + 0.4 < house.artefactPerHundred) hit.push('artefacts')
  if (!blog && current.contractionPerHundred > house.contractionPerHundred + 1.2) hit.push('contractions')
  if (hit.length < 3) return null
  return {
    dimensions: hit,
    message: `Register drifts from house style (${hit.join(', ')})`,
  }
}

export function registerCardPromptBlock(house: RegisterCard, current?: RegisterCard | null): string {
  const cur = current
    ? ` Current draft: CV ${current.burstinessCv.toFixed(2)}, unique 3-grams ${(current.trigramUniqueRatio * 100).toFixed(0)}%, you/100 ${current.youPerHundred.toFixed(1)}, artefacts/100 ${current.artefactPerHundred.toFixed(1)}.`
    : ''
  return [
    'HOUSE REGISTER (style target — not a person to clone):',
    `- Sentence-length CV ≥ ${house.burstinessCv.toFixed(2)}. Mix a short sentence with a medium one. Do not write a page of 14-word sentences.`,
    `- Unique 3-gram ratio ≥ ${(house.trigramUniqueRatio * 100).toFixed(0)}%. Say an official-site reminder once, then advance.`,
    `- Second person about ${house.youPerHundred.toFixed(1)} uses per 100 words. Address the reader.`,
    `- Name forms, agencies, and instruments (about ${house.artefactPerHundred.toFixed(1)} per 100 words).`,
    `- Hedges/modals (~${house.hedgePerHundred.toFixed(1)} per 100 words): must / may / check the official page. No outcome promises.`,
    `- Contractions stay sparse on legal guides (~${house.contractionPerHundred.toFixed(2)} per 100 words).`,
    `- Contrastive shift: increase involvement and artefact density; keep information density; do not add narrative or invented experience.${cur}`,
  ].join('\n')
}

export function synthesizeThesis(opts: {
  thesis?: string | null
  primaryKeyword?: string | null
  reader?: string | null
  queryNeed?: string | null
  primaryQuery?: string | null
}): string {
  const given = String(opts.thesis || '').trim()
  if (given) return given
  const reader = String(opts.reader || 'you').trim() || 'you'
  const need =
    String(opts.queryNeed || '').trim() ||
    String(opts.primaryQuery || '').trim() ||
    String(opts.primaryKeyword || '').trim() ||
    'this process'
  return `${reader} can act on ${need} from official rules, not a forum checklist.`
}

export function resolveSectionPurpose(heading: string, purpose?: string | null): string {
  const p = String(purpose || '').trim()
  if (p && !/^(planner outline|brief outline)$/i.test(p)) return p
  return sectionPurposeFromHeading(heading)
}

export function sectionPurposeFromHeading(heading: string): string {
  const raw = String(heading || '').replace(/[#*_`]/g, '').trim()
  const h = raw.toLowerCase()
  if (!h) return 'Advance the argument with a new claim, step, or constraint'
  if (/^(in 60 seconds|tldr|tl;?dr)/.test(h)) return 'Answer first in 3–5 bullets; do not tease'
  if (/table of contents|on this page/.test(h)) return 'Link to content H2s in order'
  if (/faq|frequently asked/.test(h)) return 'Ask reader questions the content H2s did not already answer'
  if (/source/.test(h)) return 'Cite live official URLs only'
  if (/related/.test(h)) return 'Only verified estate links that earn a click'
  if (/eligib|who (this|it) is for|who qualifies/.test(h)) return 'Who this is for, and who should stop'
  if (/document|what to (bring|prepare)|checklist/.test(h)) return 'Named artefacts and windows, not a restated intro'
  if (/process|steps|how to|application/.test(h)) return 'The sequence from this point; do not restate eligibility'
  if (/timeline|processing|how long/.test(h)) return 'Current ranges and what delays a file; send the reader to the official tool'
  if (/cost|fee/.test(h)) return 'What is charged, by whom; no invented amounts'
  if (/risk|refus|mistak|if you/.test(h)) return 'What goes wrong and the next safe action'
  return `Advance the thesis under “${raw}” — new claim or next step, not a restatement`
}
