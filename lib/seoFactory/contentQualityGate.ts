/**
 * Master content quality gate — language, tonality, compliance, human voice.
 *
 * Every factory/studio output that ships must pass these checks.
 * Approve / merge / autodeploy cannot bypass: shipContent calls assertQualityGate.
 *
 * Layers:
 *   1. Brand-safety / outcome promises (legal ethics + Google helpful content)
 *   2. AI-slop / banned tells (machine-sounding prose)
 *   3. Human voice heuristics (rhythm, filler, throat-clearing)
 *   4. Tone (calm practitioner; no hype / sales bait)
 *   5. Structure floors for indexable long-form
 */

import { BANNED_AI_TELLS, VOICE_PLAYBOOK } from '@/lib/seoVoice'
import { auditLinksSync } from './linkAudit'

import { BANNED_PHRASES } from '@/lib/seoKnowledgeBase'
import { countBodyWords } from './contentDepth'
import { EDITORIAL_FORMATTING_CONTRACT } from './editorialContract'

export type QualitySeverity = 'blocker' | 'warning'

export interface QualityFinding {
  code: string
  severity: QualitySeverity
  message: string
  fix?: string
  evidence?: string
}

export interface QualityGateResult {
  ok: boolean
  findings: QualityFinding[]
  blockers: QualityFinding[]
  warnings: QualityFinding[]
  humanScore: number
  summary: string
}

/** Multi-word AI tells — always blockers when present. */
const AI_SLOP_PHRASES: string[] = [
  ...BANNED_AI_TELLS.filter((p) => p.includes(' ') || p.includes("'")),
  'in conclusion',
  'to summarize',
  'in this article',
  'in this guide we will',
  'this comprehensive guide',
  'whether you are looking',
  'look no further',
  'at the end of the day',
  'it goes without saying',
  'needless to say',
  'without further ado',
  'a plethora of',
  'myriad of',
  'first and foremost',
  'last but not least',
  'due to the fact that',
  'at this point in time',
  'take your journey to the next level',
  'hassle-free',
  'stress-free experience',
  'one-stop shop',
  'state-of-the-art',
  'paradigm shift',
  'empowering you',
  'we understand that',
  'we know that navigating',
  'rest assured that',
  'it is important to note that',
  'it is worth noting that',
]

/** Single-token AI adjectives/verbs — whole-word match only. */
const AI_SLOP_WORDS = [
  'delve',
  'delves',
  'delving',
  'leverage',
  'leveraging',
  'robust',
  'seamless',
  'holistic',
  'bespoke',
  'streamline',
  'streamlines',
  'streamlining',
  'revolutionize',
  'revolutionizes',
  'game-changer',
  'gamechanger',
  'synergistic',
  'utilize',
  'utilizes',
  'utilizing',
  'plethora',
  'myriad',
  'aforementioned',
  'heretofore',
  'whilst', // prefer "while" for US/AU plain English (flag as warning tone)
]

/**
 * Broad disclaimer matcher — recognizes natural disclaimer phrasing the AI
 * actually writes (informational purposes only, does not constitute legal
 * advice, consult a qualified attorney, …), not just three literal strings.
 * A too-strict regex here made the gate re-block articles even after the
 * model (or a human) added a perfectly valid disclaimer.
 */
export const DISCLAIMER_RE =
  /(not legal advice|does not constitute legal advice|not a substitute for (professional )?legal advice|for (educational|informational|information)( and (editorial|informational|educational))? purposes? only|educational( and editorial| and informational)? only|editorial only|consult (an? )?(qualified |licensed |professional |immigration |experienced |registered )?(attorney|lawyer|solicitor|migration agent|immigration professional|regulator)|seek (the )?advice of (an? )?(qualified |licensed |professional |immigration )?(attorney|lawyer|solicitor|migration agent|regulator))/i

/**
 * Outcome / guarantee language — YMYL / bar-ethics risk.
 *
 * Only *immigration-outcome* promises are forbidden. A bare "guaranteed"
 * (e.g. "FY27 rates are guaranteed for the academic year", "the deposit is
 * guaranteed refundable") is factual, not a promise of approval, and must
 * never block a ship. The generic guarantee rule therefore requires an
 * outcome signal within the surrounding context (approval / visa / PR /
 * acceptance / success / refusal / decision / result) — the words a bar-
 * ethics violation would actually couple to.
 */
const OUTCOME_PROMISE_PATTERNS: Array<{ re: RegExp; label: string; needsOutcomeNearby?: boolean }> = [
  {
    // Coupled to an immigration outcome within ±60 chars of "guarantee*"
    re: /\bguarante(?:e|ed|es|eing)\b/i,
    label: 'guarantee language',
    needsOutcomeNearby: true,
  },
  { re: /\b100\s*%\s*(success|approval|acceptance|visa)\b/i, label: '100% success claim' },
  { re: /\bwe (will|can) (get|secure|ensure|guarantee) (you|your)\b/i, label: 'we will get you… promise' },
  { re: /\bensur(?:e|es|ing) (your )?(visa |application )?(approval|success|acceptance)\b/i, label: 'ensure approval' },
  { re: /\bapproved (for sure|every time|guaranteed)\b/i, label: 'approval certainty' },
  { re: /\bno risk of refusal\b/i, label: 'no risk of refusal' },
  { re: /\bfast[- ]track (your )?(visa|green card|pr|approval)\b/i, label: 'fast-track outcome' },
  { re: /\bvisa (is|will be) (easy|simple|guaranteed)\b/i, label: 'visa easy/guaranteed' },
  { re: /\bcertainly (qualify|approved|succeed)\b/i, label: 'certainty of outcome' },
  { re: /\bwe promise\b/i, label: 'we promise' },
]

/**
 * Words that couple "guarantee*" to an actual immigration/application
 * outcome. Factual guarantees (rates, fees, refunds, availability) do not
 * match, so housing-rate pages and university guides never false-positive.
 */
const OUTCOME_COUPLING = /\b(approval|approved|approve|visa|green\s*card|permanent\s*residen[ct]|pr\b|acceptance|accepted|success(?:ful)?|refusal|refused|denial|denied|decision|result(?:s)?|outcome|approval\s*rate|success\s*rate|sponsorship)\b/i

/** A "guarantee" mention only counts when an outcome word sits in its window. */
function guaranteeIsOutcomeCoupled(text: string, index: number): boolean {
  // Locate the sentence boundaries around the guarantee mention.
  const sentenceStart = Math.max(
    text.lastIndexOf('.', index - 1),
    text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1),
    text.lastIndexOf('\n', index - 1),
  ) + 1
  const sentenceEndCandidates = [
    text.indexOf('.', index),
    text.indexOf('!', index),
    text.indexOf('?', index),
    text.indexOf('\n', index),
  ].filter((value) => value >= 0)
  const sentenceEnd = sentenceEndCandidates.length ? Math.min(...sentenceEndCandidates) : text.length

  // Fast path: an outcome word within a tight window around the guarantee,
  // but bounded to the current sentence so cross-sentence spill-over never
  // false-positives (e.g. "guarantees you will understand" in sentence 1
  // and a nearby "visa result" in sentence 2 in a short paragraph).
  const windowStart = Math.max(sentenceStart, index - 60)
  const windowEnd = Math.min(sentenceEnd, index + 80)
  const windowText = text.slice(windowStart, windowEnd)
  if (OUTCOME_COUPLING.test(windowText)) return true

  // Fallback: the full sentence may carry the outcome beyond the tight
  // window (long clause before the promise). Sentence scope keeps factual
  // guarantees safe: "FY27 rates are guaranteed for the academic year" has
  // no outcome word anywhere in its sentence, while a real promise always
  // names approval / visa / success / result somewhere in its own sentence.
  return OUTCOME_COUPLING.test(text.slice(sentenceStart, sentenceEnd))
}

function isNegatedOutcomeMention(text: string, index: number): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf('.', index - 1),
    text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1),
    text.lastIndexOf('\n', index - 1),
  ) + 1
  const sentenceEndCandidates = [
    text.indexOf('.', index),
    text.indexOf('!', index),
    text.indexOf('?', index),
    text.indexOf('\n', index),
  ].filter((value) => value >= 0)
  const sentenceEnd = sentenceEndCandidates.length ? Math.min(...sentenceEndCandidates) : text.length
  const sentence = text.slice(sentenceStart, sentenceEnd).replace(/\s+/g, ' ').trim()

  // Educational disclaimers commonly explain that outcomes are not guaranteed.
  // They are safe and must not be mistaken for a promise. Affirmative claims
  // such as "we guarantee approval" still match the outcome patterns below.
  return (
    // Auxiliary + not directly before the guarantee ("we do not guarantee
    // approval"). Window kept tight (30 chars) so "do not just help — we
    // guarantee approval" style affirmative claims stay blocked.
    /\b(?:does|do|did|will|would|can|could|should|is|are|was|were)\s+not\b[^.!?]{0,30}\bguarante(?:e|ed|es|eing)\b/i.test(sentence) ||
    /\b(?:cannot|can't|can’t|never|no one can|no\s+(?:adviser|attorney|lawyer|firm|service|provider|person|agency)\s+can)\b[^.!?]{0,100}\bguarante(?:e|ed|es|eing)\b/i.test(sentence) ||
    /\bguarante(?:e|ed|es|eing)\b[^.!?]{0,60}\b(?:not|never)\b/i.test(sentence) ||
    // 2026-08-13 live-run false positive: compliant caveats like "these are
    // averages, not guarantees", "an average, not a guarantee", and "No
    // outcome is ever guaranteed" were hard-blocked because the negation
    // forms above missed bare "not"/"no [outcome]" before the guarantee.
    // The bare-not window is kept tight (30 chars) so "we do not just help,
    // we guarantee approval" style affirmative claims stay blocked.
    /\bnot\b[^.!?]{0,30}\bguarante(?:e|ed|es|eing)\b/i.test(sentence) ||
    /\bno\s+(?:outcome|approval|success|decision|visa|result)\b[^.!?]{0,80}\bguarante(?:e|ed|es|eing)\b/i.test(sentence) ||
    /\bno\s+guarante(?:e|ed|es|eing)\b/i.test(sentence)
  )
}

/** Hype / sales tone that breaks calm practitioner voice. */
const HYPE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bact now\b/i, label: 'act now' },
  { re: /\blimited time offer\b/i, label: 'limited time offer' },
  { re: /\bdon't miss out\b/i, label: "don't miss out" },
  { re: /\bexclusive (deal|offer|opportunity)\b/i, label: 'exclusive deal' },
  { re: /!{2,}/, label: 'multiple exclamation marks' },
  { re: /\bAMAZING\b|\bINCREDIBLE\b|\bUNBELIEVABLE\b/, label: 'shouting hype adjective' },
  { re: /\bclick here now\b/i, label: 'click here now' },
  { re: /\bbest (visa|immigration) (lawyer|service) (ever|in the world)\b/i, label: 'superlative bait' },
]

function stripForScan(content: string): string {
  return String(content || '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
}

function findPhrase(haystack: string, phrase: string): boolean {
  const h = haystack.toLowerCase()
  const p = phrase.toLowerCase()
  return h.includes(p)
}

function countOccurrences(haystack: string, phrase: string): number {
  const h = haystack.toLowerCase()
  const p = phrase.toLowerCase()
  if (!p) return 0
  let n = 0
  let i = 0
  while ((i = h.indexOf(p, i)) !== -1) {
    n++
    i += p.length
  }
  return n
}

/**
 * Count occurrences of `phrase` in `haystack` that do NOT fall inside any
 * occurrence of `primary`. Fixes sub-phrase double-counting: when a short or
 * long-tail keyword is a substring of the primary (e.g. "uk dependent" inside
 * "uk dependent visa documents checklist"), every natural primary usage was
 * counted as an independent repetition and blew the per-keyword density cap.
 * The primary phrase is exempt; its sub-phrases should not be penalized for
 * the primary's own usage.
 */
function countOccurrencesOutsidePrimary(haystack: string, phrase: string, primary: string): number {
  const h = haystack.toLowerCase()
  const p = phrase.toLowerCase()
  const pr = (primary || '').trim().toLowerCase()
  if (!p) return 0
  if (!pr || pr === p) return countStandalonePhrase(h, p)
  // Mark spans covered by the primary phrase.
  const masked = new Array<boolean>(h.length).fill(false)
  let i = 0
  while ((i = h.indexOf(pr, i)) !== -1) {
    for (let j = i; j < i + pr.length && j < h.length; j++) masked[j] = true
    i += pr.length
  }
  let n = 0
  i = 0
  while ((i = h.indexOf(p, i)) !== -1) {
    let inside = false
    for (let j = i; j < i + p.length && j < h.length; j++) {
      if (masked[j]) { inside = true; break }
    }
    // Also skip compound extensions: "uk dependent" inside "uk dependent
    // visa" or "uk dependent timeline" is a semantic VARIANT, not a repeat
    // of the bare term — the gate's own fix text tells models to prefer
    // these. Only a phrase that stands alone (followed by punctuation, a
    // closing bracket, or a word-boundary at end of text) counts as a hit.
    if (!inside && !isExtendedPhrase(h, i, p.length)) n++
    i += p.length
  }
  return n
}

/**
 * True when the text right after `[start, start+len)` continues with more
 * word characters on the SAME line (skipping spaces, hyphens, slashes), i.e.
 * the matched phrase is the HEAD of a longer compound term rather than a
 * standalone keyword use. E.g. "uk dependent visa" → true for "uk dependent".
 * A newline or bullet boundary terminates the phrase, so "- f-1 documents"
 * followed by another bullet is a standalone use, not an extended compound.
 */
function isExtendedPhrase(text: string, start: number, len: number): boolean {
  let i = start + len
  while (i < text.length && /[ \t/–—-]/.test(text[i])) i++
  if (i >= text.length) return false
  if (text[i] === '\n' || text[i] === '\r') return false
  return /[a-z0-9]/.test(text[i])
}

/**
 * Count only STANDALONE uses of `phrase` (not extended into a longer
 * compound). Used when the phrase IS the primary, so title/H1/H2 usage that
 * reads as part of a bigger heading still counts, but "study abroad" inside
 * "study abroad statement of purpose" variants doesn't.
 */
function countStandalonePhrase(haystack: string, phrase: string): number {
  const h = haystack.toLowerCase()
  const p = phrase.toLowerCase()
  if (!p) return 0
  let n = 0
  let i = 0
  while ((i = h.indexOf(p, i)) !== -1) {
    if (!isExtendedPhrase(h, i, p.length)) n++
    i += p.length
  }
  return n
}

function wordBoundaryHit(text: string, word: string): boolean {
  try {
    return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  } catch {
    return false
  }
}

/**
 * Run the full quality gate on markdown (or pre-render body).
 */
export interface CompetingPage {
  url: string
  title: string
  primaryKeyword?: string | null
  /** Higher = stronger competitor (optional tiebreak). */
  impressions?: number | null
}

export function evaluateContentQuality(opts: {
  content: string
  contentType?: string
  primaryKeyword?: string
  /** Indexable long-form gets stricter structure. */
  indexable?: boolean
  /** Required short keywords (≤3 words). The brief supplies at least 5. */
  requiredShortKeywords?: string[]
  /** Required long-tail keywords (≥4 words). The brief supplies at least 4. */
  requiredLongTailKeywords?: string[]
  minShortKeywords?: number
  minLongTailKeywords?: number
  /** Verified internal URLs from the brief — internal links outside this set are flagged. */
  linkAllowlist?: string[]
  /** Existing estate pages targeting the same primary keyword — cannibalization 
   *  risk detection. The brief/planner supplies these from the coverage map. */
  competingUrls?: CompetingPage[]
  /** The target URL for this draft — competing pages at different URLs are 
   *  cannibalization risks; self-references (same canonical) are ignored. */
  targetUrl?: string
}): QualityGateResult {
  const contentType = (opts.contentType || 'legal_guide').toLowerCase()
  const indexable = opts.indexable !== false
  const body = stripForScan(opts.content)
  const words = countBodyWords(opts.content)
  const findings: QualityFinding[] = []

  const add = (f: QualityFinding) => findings.push(f)

  // ── 1. Outcome promises (always blocker) ─────────────────────────────────
  // Scan EVERY match, not just the first: a page can carry a factual
  // "guaranteed rates" line AND a real "guaranteed approval" promise.
  for (const { re, label, needsOutcomeNearby } of OUTCOME_PROMISE_PATTERNS) {
    for (const m of body.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
      const at = m.index ?? 0
      // A bare "guarantee" must be coupled to an immigration outcome to count.
      // "Rates are guaranteed for the academic year" is a fact, not a promise.
      if (needsOutcomeNearby && !guaranteeIsOutcomeCoupled(body, at)) continue
      if (!isNegatedOutcomeMention(body, at)) {
        add({
          code: 'outcome_promise',
          severity: 'blocker',
          message: `Outcome / guarantee language forbidden: ${label}`,
          fix: 'Rewrite without promising visa approval, success rates, or guaranteed results. Educational only.',
          evidence: m[0],
        })
      }
    }
  }

  // Brand-safety multi-word phrases only (single tokens like "navigate" false-positive)
  for (const phrase of BANNED_PHRASES) {
    if (typeof phrase !== 'string' || phrase.length < 8 || !phrase.includes(' ')) continue
    if (findPhrase(body, phrase)) {
      add({
        code: 'banned_brand_phrase',
        severity: 'blocker',
        message: `Banned brand-safety phrase: "${phrase}"`,
        fix: 'Remove the phrase; use accurate, non-promissory language.',
        evidence: phrase,
      })
    }
  }
  // High-risk single brand tokens
  for (const phrase of ['high success rate', 'fast PR', 'land of opportunity', 'your dreams abroad'] as const) {
    if (findPhrase(body, phrase)) {
      add({
        code: 'banned_brand_phrase',
        severity: 'blocker',
        message: `Banned brand-safety phrase: "${phrase}"`,
        fix: 'Remove the phrase; use accurate, non-promissory language.',
        evidence: phrase,
      })
    }
  }

  // ── 2. AI slop phrases (blocker) ─────────────────────────────────────────
  const slopHits: string[] = []
  for (const phrase of AI_SLOP_PHRASES) {
    if (findPhrase(body, phrase)) slopHits.push(phrase)
  }
  for (const word of AI_SLOP_WORDS) {
    if (word === 'whilst') continue // warning only below
    if (wordBoundaryHit(body, word)) slopHits.push(word)
  }
  // Cap evidence list
  if (slopHits.length) {
    const unique = [...new Set(slopHits)].slice(0, 8)
    add({
      code: 'ai_slop',
      severity: 'blocker',
      message: `Machine-sounding / banned AI phrasing (${unique.length}+ hit/s): ${unique.map((u) => `"${u}"`).join(', ')}`,
      fix: 'Rewrite in plain practitioner English. Cut throat-clearing, clichés, and thesaurus verbs. Sound like a calm specialist talking to a client.',
      evidence: unique.join('; '),
    })
  }
  if (wordBoundaryHit(body, 'whilst')) {
    add({
      code: 'tone_whilst',
      severity: 'warning',
      message: 'Prefer "while" over "whilst" for plain international English',
      fix: 'Replace whilst → while',
    })
  }

  // ── 3. Hype / sales tone ─────────────────────────────────────────────────
  for (const { re, label } of HYPE_PATTERNS) {
    const m = body.match(re)
    if (m) {
      add({
        code: 'hype_tone',
        severity: 'blocker',
        message: `Sales/hype tone not allowed: ${label}`,
        fix: 'Use calm, precise, second-person educational tone. No urgency bait.',
        evidence: m[0],
      })
    }
  }

  // ── 4. Human voice heuristics ────────────────────────────────────────────
  let humanScore = 100

  // Em-dash / en-dash spam (classic LLM tell)
  const dashCount = (body.match(/[—–]/g) || []).length
  if (dashCount >= 8 || (words > 0 && dashCount / words > 0.012)) {
    humanScore -= 15
    add({
      code: 'emdash_spam',
      severity: dashCount >= 12 ? 'blocker' : 'warning',
      message: `Overuse of em/en dashes (${dashCount}) — common machine cadence`,
      fix: 'Rewrite with periods or commas. Prefer short sentences over dash chains.',
    })
  }

  // Colon-heavy "Here's what" openers
  const heresCount = countOccurrences(body, "here's") + countOccurrences(body, 'here is what')
  if (heresCount >= 4) {
    humanScore -= 10
    add({
      code: 'heres_spam',
      severity: 'warning',
      message: `"Here's…" openers overused (${heresCount})`,
      fix: 'Vary openers; start with the fact or the step.',
    })
  }

  // Repeated sentence starts (This / It is / There are) — PROSE sentences AND
  // list items (TL;DR bullets, FAQ answers) count, so robotic bullet blocks
  // fire too. List markers are STRIPPED before the 12-char key (a bullet
  // "- The UK dependent visa …" and a prose sentence "The UK dependent visa
  // …" aggregate under ONE key) — exactly the aggregation smoothSentenceRhythm
  // uses, so whatever this gate flags, the deterministic repair clears.
  // Headings stay excluded (structure, not rhythm). Bold/code markers are
  // stripped so "* **For the X stream:**" label lists don't false-positive.
  //
  // Drop HEADING LINES first (mirroring smoothSentenceRhythm's span regex,
  // which never includes a heading line in a sentence match). A whole-body
  // split on (?<=[.!?])\s+ — or even a paragraph-first split — glues a
  // heading to the next line ("## In 60 seconds\n- The UK …" with no blank
  // line between them) and the merged chunk starts with #, so it is dropped
  // as a heading and the FIRST bullet/sentence is silently lost from the
  // count. Removing heading lines before splitting keeps every bullet and
  // sentence its own chunk.
  const isHeadingLine = (s: string) => /^\s*#{1,6}\s/.test(s)
  const stripListMarker = (s: string) => s.replace(/^\s*(?:[-*+]|\d+[.)])\s/, '')
  const stripMarkdown = (s: string) => s.trim().replace(/\*\*|__|`/g, '').trim()
  const sentences = body
    .split(/\n\s*\n/)
    .flatMap((para) =>
      para
        .split('\n')
        .filter((line) => !isHeadingLine(line))
        .join('\n')
        .split(/(?<=[.!?])\s+/),
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && !isHeadingLine(s))
    .map((s) => stripListMarker(stripMarkdown(s)))
  if (sentences.length >= 8) {
    const starts = sentences.map((s) => s.slice(0, 12).toLowerCase())
    const freq = new Map<string, number>()
    for (const s of starts) freq.set(s, (freq.get(s) || 0) + 1)
    let worst = 0
    let worstKey = ''
    for (const [k, v] of freq) {
      if (v > worst) {
        worst = v
        worstKey = k
      }
    }
    if (worst >= 5) {
      humanScore -= 12
      add({
        code: 'sentence_start_repetition',
        severity: worst >= 7 ? 'blocker' : 'warning',
        message: `Same sentence opening repeated ${worst}× ("${worstKey}…") — robotic rhythm`,
        fix: 'Vary sentence openings. Mix short and medium sentences. Lead with the reader’s situation or a concrete noun.',
        evidence: worstKey,
      })
    }
  }

  // Passive-voice density (rough heuristic: " is/are/was/were + past participle-ish")
  const passiveish = (body.match(/\b(is|are|was|were|be|been)\s+\w+ed\b/gi) || []).length
  if (words > 400 && passiveish / (words / 100) > 4) {
    humanScore -= 8
    add({
      code: 'passive_density',
      severity: 'warning',
      message: 'High passive-voice density — sounds stiff / machine-translated',
      fix: 'Prefer active voice: "You submit the form" not "The form is submitted by you".',
    })
  }

  // Second person for educational long-form (you/your)
  if (indexable && contentType !== 'marketplace_gig' && words >= 400) {
    const youHits = (body.match(/\b(you|your|you're|you'll|you've)\b/gi) || []).length
    if (youHits < 5) {
      humanScore -= 10
      add({
        code: 'missing_second_person',
        severity: 'warning',
        message: 'Little or no second person ("you") — reads abstract / brochure-like',
        fix: 'Address the reader directly in plain English.',
      })
    }
  }

  // Contractions optional for legal tone — do not force, but penalize extreme formality walls
  // of "do not" / "cannot" / "will not" stacked
  const formalNeg = (body.match(/\b(do not|does not|cannot|will not|should not)\b/gi) || []).length
  const contractions = (body.match(/\b(don't|doesn't|can't|won't|shouldn't|it's|you're|you'll)\b/gi) || []).length
  if (words > 800 && formalNeg >= 12 && contractions === 0) {
    humanScore -= 8
    add({
      code: 'stiff_formality',
      severity: 'warning',
      message: 'Uniformly stiff formality with zero contractions — less human in educational prose',
      fix: 'Allow natural contractions in body paragraphs while keeping precision on legal terms.',
    })
  }

  // Keyword stuffing: primary keyword exact-match spam.
  // Density-aware: a raw count of 12 in a 2200+ word legal guide (~2.5% of a
  // 5-word primary) is natural usage; the same 12 in a 900-word blog is
  // stuffing. The ratio is `primary-words / body-words`; ≥4.5% is spam,
  // ≥3.5% is a warning. 2026-08-13 live-run: GLM Fast guides with a long
  // primary hit the raw ≥12 ceiling without being dense — false blocker.
  const pk = (opts.primaryKeyword || '').trim()
  if (pk.length >= 4 && words > 0) {
    const n = countOccurrences(body, pk)
    const pkWords = (pk.match(/[A-Za-z0-9'-]+/g) || []).length || 1
    const density = (n * pkWords) / words
    if (n >= 8 && density >= 0.045) {
      humanScore -= 15
      add({
        code: 'keyword_stuffing',
        severity: 'blocker',
        message: `Primary keyword exact-match spam (${n}×, ${(density * 100).toFixed(1)}% of body): "${pk}"`,
        fix: 'Use the primary keyword a few times naturally; then synonyms and entities.',
        evidence: pk,
      })
    } else if (n >= 8 && density >= 0.035) {
      humanScore -= 8
      add({
        code: 'keyword_density_high',
        severity: 'warning',
        message: `Primary keyword appears ${n}× (${(density * 100).toFixed(1)}%) — edge of stuffing`,
        fix: 'Reduce exact repeats; prefer semantic variants.',
      })
    }
  }

  // ── 5. Reader engagement and structure ─────────────────────────────────────
  // Warnings keep the format query-led while still catching walls of prose.
  if (indexable && contentType !== 'marketplace_gig' && words >= 650) {
    const proseBlocks = body
      .split(/\n\s*\n/)
      .map((block) => block
        .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+).*$/gm, '')
        .replace(/\|[^\n]*\|/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      )
      .filter((block) => block.length > 180)
    const longBlocks = proseBlocks.filter((block) => {
      const sentences = (block.match(/[.!?](?:\s|$)/g) || []).length
      return block.length > 520 || sentences >= 5
    })
    if (longBlocks.length >= 2) {
      add({
        code: 'wall_of_text',
        severity: 'warning',
        message: `Several prose blocks are too dense (${longBlocks.length} long blocks)`,
        fix: 'Break dense paragraphs into 1–3 sentence units and add a useful list, step, table, example, or callout where it improves comprehension.',
      })
    }
    const hasList = /(?:^|\n)\s*(?:[-*+]\s+|\d+[.)]\s+)/m.test(body)
    const hasTable = /\|[^\n]+\|\n\|\s*:?-{2,}/.test(body)
    if (!hasList && !hasTable) {
      add({
        code: 'missing_visual_break',
        severity: 'warning',
        message: 'Long-form page has no useful list or comparison table',
        fix: 'Add a genuine checklist, numbered process, or comparison table only where it makes the information easier to scan.',
      })
    }
    if (words >= 1100 && !/table of contents|contents|on this page/i.test(body)) {
      add({
        code: 'missing_reader_path',
        severity: 'warning',
        message: 'Long guide has no visible reading path / contents aid',
        fix: 'Add a concise table of contents or “On this page” list linked to the major sections.',
      })
    }
    if (words >= 800 && !/\b(?:for example|for instance|e\.g\.|example:)\b/i.test(body)) {
      add({
        code: 'missing_concrete_example',
        severity: 'warning',
        message: 'Long-form page has no concrete example marker',
        fix: 'Add one accurate, clearly labeled example or scenario; do not invent a case outcome.',
      })
    }
  }

  // ── 6. Structure for indexable long-form ─────────────────────────────────
  if (indexable && contentType !== 'marketplace_gig') {
    if (!/in 60 seconds|tldr|key takeaways|quick answer/i.test(body)) {
      add({
        code: 'missing_tldr',
        severity: 'blocker',
        message: 'Missing "In 60 seconds" / TL;DR answer block',
        fix: 'Add ## In 60 seconds with 3–5 direct bullets.',
      })
    }
    const h2s = (body.match(/^##\s+/gm) || []).length
    if (h2s < 4) {
      add({
        code: 'structure_h2',
        severity: 'blocker',
        message: `Need ≥4 H2 sections (found ${h2s})`,
        fix: 'Add procedure, documents, risks/timelines, FAQ sections.',
      })
    }
    if (
      !/^##\s+.*faq/im.test(body) &&
      !/^###\s+.+\?/m.test(body) &&
      // Collapsible FAQ: <details><summary>Question?</summary>…
      !/<summary>\s*[^<]*\?\s*<\/summary>/i.test(body)
    ) {
      add({
        code: 'missing_faq',
        severity: 'blocker',
        message: 'Missing FAQ section',
        fix: 'Add ## FAQ with 4–6 Q&A pairs (self-contained answers, plain or collapsible <details>).',
      })
    }
    if (!/\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk/i.test(body)) {
      add({
        code: 'missing_official_sources',
        severity: 'blocker',
        message: 'Missing official government source URLs',
        fix: 'Cite USCIS / IRCC / UKVI / Home Affairs with full https URLs.',
      })
    }
    if (!DISCLAIMER_RE.test(body)) {
      add({
        code: 'missing_disclaimer',
        severity: 'blocker',
        message: 'Missing educational / not-legal-advice disclaimer',
        fix: 'Add a short disclaimer: educational only, not legal advice.',
      })
    }
  }

  // Meta: "As an AI" / LLM self-reference
  if (/\bas an ai\b|\blanguage model\b|\bi (was|am) (trained|an ai)\b/i.test(body)) {
    add({
      code: 'ai_self_reference',
      severity: 'blocker',
      message: 'Model self-reference in content',
      fix: 'Remove any AI/self-referential language. Write as editorial staff only.',
    })
  }

  // ── 7. Keyword coverage: brief-supplied short + long-tail arrays ─────────
  // Backwards-compat: only enforce the keyword floor AND per-keyword presence
  // when the caller supplied the arrays. The legacy pipeline never produced
  // these arrays, so missing input must not silently block pre-existing drafts
  // (the partitioner now backfills ≥5/≥4 from a bare primary, see planner.ts).
  if (indexable && contentType !== 'marketplace_gig') {
    const hasShort = Array.isArray(opts.requiredShortKeywords)
    const hasLong = Array.isArray(opts.requiredLongTailKeywords)
    if (!hasShort && !hasLong) {
      // Skip the keyword coverage gate entirely — legacy pipeline / reaudit
      // calls without the arrays continue to behave as before.
    } else {
      const minShort = Math.max(0, opts.minShortKeywords ?? 5)
      const minLongTail = Math.max(0, opts.minLongTailKeywords ?? 4)
      const shortArr = (opts.requiredShortKeywords || []).map((s) => String(s || '').trim()).filter(Boolean)
      const longArr = (opts.requiredLongTailKeywords || []).map((s) => String(s || '').trim()).filter(Boolean)

      if (shortArr.length && shortArr.length < minShort) {
        add({
          code: 'insufficient_short_keywords',
          severity: 'blocker',
          message: `Brief shipped only ${shortArr.length} short keyword(s); need at least ${minShort} (≤3 words each). The keyword partitioner must backfill before the draft can pass.`,
          fix: 'Re-run the planner / brief builder to synthesize the missing short keywords (modifiers around the primary term: "guide", "requirements", "application", "eligibility", "documents", "timeline", "rules"…).',
        })
      }
      if (longArr.length && longArr.length < minLongTail) {
        add({
          code: 'insufficient_long_tail_keywords',
          severity: 'blocker',
          message: `Brief shipped only ${longArr.length} long-tail keyword(s); need at least ${minLongTail} (≥4 words each).`,
          fix: 'Re-run the planner / brief builder to synthesize the missing long-tail queries (prefixes: "how to", "what is"; suffixes: "for international students", "step by step", "in 2026", "checklist and timeline").',
        })
      }

      const blank = (s: string) => !s.replace(/[^a-z0-9]/gi, '').trim()
      const missingShort = shortArr.filter((t) => blank(t) || body.toLowerCase().indexOf(t.toLowerCase()) === -1)
      const missingLongTail = longArr.filter((t) => blank(t) || body.toLowerCase().indexOf(t.toLowerCase()) === -1)
    if (missingShort.length) {
      add({
        code: 'missing_short_keyword',
        severity: 'blocker',
        message: `Required short keyword(s) absent: ${missingShort.slice(0, 6).map((t) => `"${t}"`).join(', ')}`,
        fix: 'Use each short keyword at least once in context, naturally — title, first H2, In 60 seconds, or as a checklist item.',
        evidence: missingShort.slice(0, 8).join(' | '),
      })
    }
    if (missingLongTail.length) {
      add({
        code: 'missing_long_tail_keyword',
        severity: 'blocker',
        message: `Required long-tail keyword(s) absent: ${missingLongTail.slice(0, 6).map((t) => `"${t}"`).join(', ')}`,
        fix: 'Use each long-tail keyword at least once, naturally — in FAQ, a heading, an answer block, or a step description. Do not force-fit; if no clean slot exists, mark it for review.',
        evidence: missingLongTail.slice(0, 8).join(' | '),
      })
    }

    // Per-keyword density caps: ≤4 hits per short keyword, ≤2 hits per long-tail keyword.
    // The PRIMARY keyword is exempt from these per-keyword caps — it has its own
    // dedicated keyword_stuffing check (≥12 hits = blocker, ≥8 = warning) above,
    // and it naturally appears in the title, H1, first H2, and FAQ of any valid
    // article. Requiring the primary to stay under the 2-hit long-tail cap made
    // every well-formed article about a long primary ("study abroad statement of
    // purpose") fail shipping.
    const primaryL = (opts.primaryKeyword || '').trim().toLowerCase()
    const isPrimary = (t: string) => t.toLowerCase() === primaryL
    const overShort: Array<{ term: string; hits: number }> = []
    for (const t of shortArr) {
      if (blank(t) || isPrimary(t)) continue
      // Count only hits OUTSIDE primary spans — a short keyword that is a
      // sub-phrase of the primary is not independently repeated when the
      // primary is used naturally (2026-08 live-run regression).
      const hits = countOccurrencesOutsidePrimary(body, t.toLowerCase(), primaryL)
      if (hits > 4) overShort.push({ term: t, hits })
    }
    const overLong: Array<{ term: string; hits: number }> = []
    for (const t of longArr) {
      if (blank(t) || isPrimary(t)) continue
      const hits = countOccurrencesOutsidePrimary(body, t.toLowerCase(), primaryL)
      if (hits > 2) overLong.push({ term: t, hits })
    }
    if (overShort.length) {
      add({
        code: 'short_keyword_density_violation',
        severity: 'blocker',
        message: `Short keyword(s) over the 4-hit cap: ${overShort.slice(0, 6).map((o) => `"${o.term}" (×${o.hits})`).join(', ')}`,
        fix: 'Reduce exact repeats; prefer the natural term once or twice and use semantic variants where possible.',
        evidence: overShort.slice(0, 8).map((o) => `${o.term}=${o.hits}`).join(', '),
      })
    }
    if (overLong.length) {
      add({
        code: 'long_tail_density_violation',
        severity: 'blocker',
        message: `Long-tail keyword(s) over the 2-hit cap: ${overLong.slice(0, 6).map((o) => `"${o.term}" (×${o.hits})`).join(', ')}`,
        fix: 'Long-tail phrases read like spam when repeated. Use the full phrase at most twice, in different contexts.',
        evidence: overLong.slice(0, 8).map((o) => `${o.term}=${o.hits}`).join(', '),
      })
    }
    }
  }

  humanScore = Math.max(0, Math.min(100, humanScore))

  // If humanScore collapses, escalate to blocker
  if (humanScore < 55 && !findings.some((f) => f.code === 'ai_slop' && f.severity === 'blocker')) {
    add({
      code: 'inhuman_voice',
      severity: 'blocker',
      message: `Human-voice score too low (${humanScore}/100) — cadence/filler patterns fail practitioner standard`,
      fix: 'Full rewrite: second person, varied sentence length, concrete procedures, no AI clichés.',
    })
  }

  // ── Link integrity (2026-08: the AI invented example.com URLs that shipped) ──
  // Structural checks only (sync): placeholders, malformed URLs, insecure
  // http:// internal links, and — when the brief supplies a verified set —
  // internal paths not known to be live. Live HTTP verification runs in the
  // async audit (auditLinksLive) merged at the reaudit/ship call sites.
  {
    const linkFindings = auditLinksSync(opts.content || '', opts.linkAllowlist?.length ? opts.linkAllowlist : undefined)
    for (const f of linkFindings) {
      add({
        code: f.code as QualityFinding['code'],
        severity: f.severity as QualityFinding['severity'],
        message: f.message,
        fix: f.code === 'placeholder_link'
          ? 'Replace with a verified estate URL from the INTERNAL LINK ALLOWLIST (research stage) or remove the link.'
          : f.code === 'malformed_link'
            ? 'Fix the link syntax — full https URL or estate-relative path.'
            : f.code === 'insecure_internal_link'
              ? 'Upgrade to https://.'
              : 'Re-verify the URL against the live site before shipping.',
      })
    }
  }

  // ── 8. Cannibalization risk (warning — not a shipping blocker) ─────────
  // When the planner/radar detects existing estate pages targeting the same
  // primary keyword, this draft may split ranking signals across sibling
  // pages instead of consolidating them on a single canonical. The gate
  // warns so the admin can differentiate or merge before publishing.
  if (pk.length >= 4 && Array.isArray(opts.competingUrls) && opts.competingUrls.length) {
    const targetNormal = (opts.targetUrl || '').trim().toLowerCase().replace(/\/+$/, '')
    const competing = opts.competingUrls.filter((c) => {
      const cu = (c.url || '').trim().toLowerCase().replace(/\/+$/, '')
      return cu && cu !== targetNormal
    })
    if (competing.length) {
      // Tokenization: normalise "f-1" → "f1" before splitting so visa codes
      // retain their meaning rather than becoming ["f","1"]→filtered. Same
      // transform as the planner's checkCompetingPages for parity.
      const tokenize = (s: string) =>
        s.toLowerCase().replace(/\b([a-z])-(\d)\b/gi, '$1$2').split(/[^a-z0-9]+/).filter((t) => t.length > 1)
      const pkTokens = new Set(tokenize(pk))
      const highOverlap = competing.filter((c) => {
        const ct = (c.title || c.primaryKeyword || '')
        const ctTokens = tokenize(ct)
        let shared = 0
        for (const t of ctTokens) if (pkTokens.has(t)) shared++
        return shared >= Math.max(2, pkTokens.size * 0.5)
      })
      const exactMatch = competing.filter((c) =>
        (c.primaryKeyword || '').toLowerCase().trim() === pk.toLowerCase(),
      )

      if (exactMatch.length) {
        add({
          code: 'cannibalization_exact_match',
          severity: 'warning',
          message: `Primary keyword "${pk}" exactly matches ${exactMatch.length} existing page(s): ${exactMatch.map((c) => `\`${c.url}\``).join(', ')}. Ranking signals will split — differentiate or merge.`,
          fix: 'Differentiate: narrow the title/H1 to a sub-topic (e.g. add a qualifier like "for students", "step-by-step", "2026 checklist"). Or merge: redirect the weaker page to this one via the cannibal merge tool.',
          evidence: exactMatch.map((c) => c.url).join(', '),
        })
      } else if (highOverlap.length) {
        add({
          code: 'cannibalization_high_overlap',
          severity: 'warning',
          message: `High keyword overlap with ${highOverlap.length} existing page(s): ${highOverlap.map((c) => `\`${c.url}\``).join(', ')}. May dilute ranking signals.`,
          fix: 'Add a differentiation note: "How this differs from…" hero block. Narrow the focus to a specific sub-topic or audience segment. Or approve if the pages serve genuinely different intents.',
          evidence: highOverlap.map((c) => `${c.url}=${c.title}`).join('; '),
        })
      } else if (competing.length) {
        add({
          code: 'cannibalization_low_overlap',
          severity: 'warning',
          message: `${competing.length} competing page(s) share the primary keyword area but have low title overlap. Review before publishing.`,
          fix: 'Verify the pages serve different search intents. If yes, the overlap is safe — approve. If not, differentiate or merge.',
          evidence: competing.slice(0, 3).map((c) => c.url).join(', '),
        })
      }
    }
  }

  const blockers = findings.filter((f) => f.severity === 'blocker')
  const warnings = findings.filter((f) => f.severity === 'warning')
  const ok = blockers.length === 0

  const summary = ok
    ? `Quality OK · human ${humanScore}/100 · ${warnings.length} warning(s)`
    : `Quality BLOCKED · ${blockers.length} blocker(s) · human ${humanScore}/100 — ${blockers
        .slice(0, 3)
        .map((b) => b.code)
        .join(', ')}`

  return { ok, findings, blockers, warnings, humanScore, summary }
}

/** Throw before GitHub write — cannot be skipped by human approve. */
export function assertQualityGate(opts: {
  content: string
  contentType?: string
  primaryKeyword?: string
  indexable?: boolean
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  minShortKeywords?: number
  minLongTailKeywords?: number
  linkAllowlist?: string[]
  competingUrls?: CompetingPage[]
  targetUrl?: string
}): QualityGateResult {
  const r = evaluateContentQuality(opts)
  if (!r.ok) {
    const lines = r.blockers.map((b) => `${b.message}${b.fix ? ` → ${b.fix}` : ''}`)
    throw new Error(
      `Ship refused — content quality gate (voice / tone / compliance):\n- ${lines.join('\n- ')}`,
    )
  }
  return r
}

/** Inject into system prompts for every generation. */
export function qualityPromptBlock(): string {
  return [
    '## MANDATORY QUALITY RULES — YOUR OUTPUT IS MACHINE-AUDITED BEFORE SHIPPING',
    '',
    'Every article you write is scanned by an automated quality gate. Articles that fail',
    'any of these rules are blocked from shipping. Follow these rules from the FIRST',
    'sentence — do not rely on post-generation fixes. Targeted rework is expensive.',
    '',
    '━━━ CRITICAL (hard blockers — article WILL be rejected) ━━━',
    '',
    'Q1. VARIED SENTENCE OPENINGS. This is the #1 rejection reason. The scanner counts',
    '    how often the first ~12 chars of each sentence repeat. 5+ repeats = warning.',
    '    7+ repeats = HARD BLOCK. Never start >2 consecutive sentences with the same',
    '    prefix like "You need to", "The department", "Applicants must". Mix:',
    '    - Lead with a concrete noun: "USCIS requires...", "Form I-765 lists..."',
    '    - Lead with a time reference: "After filing...", "Before your start date..."',
    '    - Lead with a condition: "If your employer...", "When the SEVIS record..."',
    '    - Vary short (8-15 word) and medium (15-25 word) sentences.',
    '',
    'Q2. ZERO AI PATTERNS. Never use these words or phrases in ANY context:',
    '    delve, leverage, robust, seamless, holistic, game-changer, revolutionize,',
    '    bespoke, navigate the complexities, "In today\'s fast-paced", tapestry,',
    '    unlock the potential, rest assured, "it\'s worth noting", furthermore,',
    '    moreover (as filler), in conclusion, streamline.',
    '',
    'Q3. ZERO OUTCOME PROMISES. Never claim visas, approvals, timelines, or results',
    '    are guaranteed, certain, fast-tracked, or easy. Educational tone only.',
    '    Forbidden examples: guaranteed approval, 100% success, no risk of refusal,',
    '    we will get you a visa, fast-track your approval, or you will certainly qualify.',
    '    Safe framing: requirements vary, an authority decides the application, check',
    '    current official guidance, and a qualified professional can review your facts.',
    '    Before returning, silently scan every heading, paragraph, CTA, FAQ, and metadata',
    '    line for promises. Do not repeat a forbidden phrase even while making a claim.',
    '    Note: a factual guarantee (\"FY27 rates are guaranteed for the academic year\",',
    '    \"deposits are guaranteed refundable\") is allowed — the scanner only blocks',
    '    guarantee language coupled to an immigration outcome such as approval or a visa.',
    '',
    'Q4. PRACTITIONER VOICE. Write like a calm immigration specialist briefing a',
    '    client. Second person ("you"). Concrete nouns (agency, form, document).',
    '    One idea per sentence. Explain procedures, not aspirations.',
    '',
    '━━━ IMPORTANT (warnings — degrade the score) ━━━',
    '',
    'Q5. NO HYPE. No "act now", "limited time", stacked exclamation marks,',
    '    or superlative bait ("best ever", "ultimate guide").',
    '',
    'Q6. KEYWORD DISCIPLINE. Include the primary keyword naturally 2-4 times,',
    '    including once in the first H2. Never keyword-stuff.',
    '',
    'Q7. NO EMDASHES. Use periods or commas, never em dashes or en dashes.',
    '',
    '━━━ FORMAT (reader legibility — required structure) ━━━',
    '',
    'Q8. TABLE OF CONTENTS. For guides with 4+ H2 sections, open with exactly:',
    '    ## Table of contents',
    '    - [First section](#first-section)',
    '    - [Second section](#second-section)',
    '    The anchor must be the heading\'s slug: lowercase, spaces and punctuation',
    '    become hyphens ("Eligibility requirements" → #eligibility-requirements).',
    '    The slug MUST equal the heading you write below it, or the scanner will',
    '    flag a broken reader path.',
    '',
    'Q9. HEADING HIERARCHY. Exactly one H1 (the page title). Use ## for major',
    '    sections, ### only nested under a ##, never skip levels (no H1→H3), and',
    '    never use #### or deeper. Every ## and ### needs a plain text id that',
    '    matches its TOC slug.',
    '',
    'Q10. COLLAPSIBLE SECTIONS. For long optional reading (full fee tables,',
    '    lengthy checklists, deep FAQ answers) use HTML <details> blocks so the',
    '    page stays scannable:',
    '    <details>',
    '    <summary>Full fee breakdown</summary>',
    '    - Item one',
    '    - Item two',
    '    </details>',
    '    The renderer passes these through — never wrap them in code fences.',
    '',
    VOICE_PLAYBOOK,
    '',
    EDITORIAL_FORMATTING_CONTRACT,
  ].join('\n')
}

/** For refine notes when quality fails. */
/** For refine notes when quality fails. */
export function qualityToRefineNotes(result: QualityGateResult): string {
  const lines = [
    `Quality gate: ${result.summary}`,
    `Human-voice score: ${result.humanScore}/100.`,
  ]
  // Targeted sweep mode: give specific fix instructions per blocker
  for (const b of result.blockers.slice(0, 12)) {
    if (b.code === 'outcome_promise') {
      lines.push('- BLOCKER [outcome_promise]: Remove affirmative promises about approval, success, timelines, or results. Do not repeat the flagged wording or discuss this instruction in the article.')
    } else if (b.code === 'sentence_start_repetition') {
      lines.push(`- BLOCKER [sentence_start_repetition]: Your sentence openings are repetitive. The pattern "${b.evidence || '?'}…" repeats too often. TARGETED FIX: scan the article for sentences starting with this prefix and rewrite every other one with a different opening word. Vary between nouns (agency names), time references, conditions, and direct instructions. Do NOT regenerate the full article — only fix the repetitive openings.`)
    } else if (b.code === 'missing_disclaimer') {
      lines.push(
        '- BLOCKER [missing_disclaimer]: The page has NO disclaimer and YMYL rules forbid shipping without one. Add this exact block near the end (before or inside Sources):\n' +
          '  ```\n  **Disclaimer:** This page is educational and editorial only. It is **not legal advice**. ' +
          'Immigration rules change; verify every requirement against official government sources and consult a ' +
          'licensed attorney, solicitor, or registered migration agent for your situation.\n  ```',
      )
    } else {
      lines.push(`- BLOCKER [${b.code}]: ${b.message}${b.fix ? ` → ${b.fix}` : ''}`)
    }
  }
  for (const w of result.warnings.slice(0, 6)) {
    lines.push(`- WARNING [${w.code}]: ${w.message}${w.fix ? ` → ${w.fix}` : ''}`)
  }
  return lines.join('\n')
}

/**
 * Formatting requirements shared by every remediation path — the exact same
 * contract the model sees at generation, so fixes and first passes agree.
 */
export function formattingRequirementsBlock(): string {
  return [
    '## FORMATTING REQUIREMENTS (all jobs, all models)',
    '',
    '- TABLE OF CONTENTS: for guides with 4+ H2 sections, emit exactly:',
    '    ## Table of contents',
    '    - [Section one](#section-one)',
    '    - [Section two](#section-two)',
    '  Anchor = heading slug: lowercase, spaces/punctuation → hyphens. The slug',
    '  MUST match the heading you write. Never emit raw markdown link text in a',
    '  way that cannot resolve.',
    '',
    '- HEADINGS: one H1 only; ## for major sections; ### nested under ## only;',
    '  never skip heading levels; no #### or deeper.',
    '',
    '- COLLAPSIBLE SECTIONS: use <details><summary>…</summary>…</details> for',
    '  long optional reading (fee tables, big checklists, deep FAQ answers).',
    '  Do not fence them in code blocks.',
    '',
    '- LANGUAGE LEVEL: plain English for a general reader (~8th-grade level).',
    '  Define legal/technical terms on first use, prefer short sentences, keep',
    '  the active voice, and write directly to the reader ("you").',
    '',
    '- SCANNABILITY: 1–3 sentence paragraphs, bullets for sets, numbered steps',
    '  for sequences, one comparison/checklist table only where it earns its',
    '  space, FAQ answers self-contained for answer engines.',
  ].join('\n')
}

/**
 * Build a targeted sweep prompt that asks the AI to fix ONLY the flagged issues
 * without regenerating the entire article. This is used when a draft is close to
 * passing but has specific blocker patterns (sentence openings, AI tells, etc.).
 */
export function buildTargetedSweepPrompt(
  content: string,
  result: QualityGateResult,
): string {
  const issues: string[] = []
  for (const b of result.blockers) {
    if (b.code === 'sentence_start_repetition' && b.evidence) {
      issues.push(
        `FIX ONLY THIS: Rewrite every sentence that starts with "${b.evidence}…".` +
        ` Keep the same facts but vary the opening word or phrase. Alternate between` +
        ` concrete nouns, time references, conditions, and procedural verbs. Do NOT` +
        ` modify any other part of the article.`,
      )
    }
  }
  // Generic blocker fixes
  const otherBlockers = result.blockers.filter((b) => b.code !== 'sentence_start_repetition')
  if (otherBlockers.length) {
    issues.push('Also fix these issues (only the affected text, not the whole article):')
    for (const b of otherBlockers) {
      issues.push(`- ${b.code}: ${b.message} → ${b.fix || 'remove or rewrite the flagged text'}`)
    }
  }
  if (!issues.length) return ''
  return [
    '## TARGETED SWEEP — fix ONLY the specific issues below',
    'Do NOT regenerate the full article. Make the smallest possible edits to fix:',
    '',
    ...issues,
    '',
    'Return the complete article with only the targeted fixes applied. Preserve all',
    'headings, structure, facts, official citations, and unchanged paragraphs.',
    '',
    'CURRENT ARTICLE:',
    content.slice(0, 20000),
  ].join('\n')
}
