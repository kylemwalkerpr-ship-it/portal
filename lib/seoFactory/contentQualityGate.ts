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
import { BANNED_PHRASES } from '@/lib/seoKnowledgeBase'
import { countBodyWords } from './contentDepth'

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

/** Outcome / guarantee language — YMYL / bar-ethics risk. */
const OUTCOME_PROMISE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bguarante(?:e|ed|es|eing)\b/i, label: 'guarantee language' },
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
export function evaluateContentQuality(opts: {
  content: string
  contentType?: string
  primaryKeyword?: string
  /** Indexable long-form gets stricter structure. */
  indexable?: boolean
}): QualityGateResult {
  const contentType = (opts.contentType || 'legal_guide').toLowerCase()
  const indexable = opts.indexable !== false
  const body = stripForScan(opts.content)
  const words = countBodyWords(opts.content)
  const findings: QualityFinding[] = []

  const add = (f: QualityFinding) => findings.push(f)

  // ── 1. Outcome promises (always blocker) ─────────────────────────────────
  for (const { re, label } of OUTCOME_PROMISE_PATTERNS) {
    const m = body.match(re)
    if (m) {
      add({
        code: 'outcome_promise',
        severity: 'blocker',
        message: `Outcome / guarantee language forbidden: ${label}`,
        fix: 'Rewrite without promising visa approval, success rates, or guaranteed results. Educational only.',
        evidence: m[0],
      })
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

  // Repeated sentence starts (This / It is / There are)
  // Ignore markdown list items and headings (enumerations, not prose rhythm)
  // and strip bold/code markers, so a bullet list like "* **For the X
  // stream:**" does not false-positive as repeated sentence openings.
  const isMarkdownStructure = (s: string) =>
    /^\s*(?:[-*+]|\d+[.)])\s/.test(s) || /^\s*#{1,6}\s/.test(s)
  const stripMarkdown = (s: string) => s.trim().replace(/\*\*|__|`/g, '').trim()
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && !isMarkdownStructure(s))
    .map(stripMarkdown)
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

  // Keyword stuffing: primary keyword exact-match spam
  const pk = (opts.primaryKeyword || '').trim()
  if (pk.length >= 4) {
    const n = countOccurrences(body, pk)
    if (n >= 12) {
      humanScore -= 15
      add({
        code: 'keyword_stuffing',
        severity: 'blocker',
        message: `Primary keyword exact-match spam (${n}×): "${pk}"`,
        fix: 'Use the primary keyword a few times naturally; then synonyms and entities.',
        evidence: pk,
      })
    } else if (n >= 8) {
      humanScore -= 8
      add({
        code: 'keyword_density_high',
        severity: 'warning',
        message: `Primary keyword appears ${n}× — edge of stuffing`,
        fix: 'Reduce exact repeats; prefer semantic variants.',
      })
    }
  }

  // ── 5. Structure for indexable long-form ─────────────────────────────────
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
    if (!/^##\s+.*faq/im.test(body) && !/^###\s+.+\?/m.test(body)) {
      add({
        code: 'missing_faq',
        severity: 'blocker',
        message: 'Missing FAQ section',
        fix: 'Add ## FAQ with 4–6 Q&A pairs (self-contained answers).',
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
    if (!/not legal advice|educational only|consult (an? )?(attorney|lawyer|solicitor|regulated)/i.test(body)) {
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
    '## NON-NEGOTIABLE QUALITY GATES (output is machine-audited; failures are discarded)',
    VOICE_PLAYBOOK,
    '',
    'Q1. HUMAN VOICE. Write like a calm immigration specialist explaining a process to a client. Concrete nouns. Varied sentence length. Second person ("you"). No brochure voice.',
    'Q2. ZERO AI TELLS. Never use: delve, leverage, robust, seamless, holistic, game-changer, navigate the complexities, in today\'s fast-paced, tapestry, unlock the potential, rest assured, it\'s worth noting, furthermore, moreover (as filler), in conclusion.',
    'Q3. ZERO OUTCOME PROMISES. Never guarantee visas, approvals, timelines, or success rates. Educational only.',
    'Q4. ZERO HYPE. No "act now", "limited time", stacked exclamation marks, or superlative bait.',
    'Q5. RHYTHM. Vary EVERY sentence opening. The audit counts how often the first ~12 characters of a sentence repeat: 5+ repeats is a warning, 7+ hard-blocks the ship. Never start more than two sentences with the same word or phrase ("the department", "it is", "there are", "applicants"). Mix short and medium sentences. Lead with the reader\'s situation or a concrete noun (agency, form, document, step). ZERO em dashes (\u2014) and en dashes (\u2013): never use them; use periods or commas instead. Active voice.',
    'Q6. KEYWORD DISCIPLINE. Primary keyword a few times naturally — never stuff.',
    'Q7. If a sentence sounds like ChatGPT wrote it, delete and rewrite with a specific form, agency, document, or step.',
  ].join('\n')
}

/** For refine notes when quality fails. */
export function qualityToRefineNotes(result: QualityGateResult): string {
  const lines = [
    `Quality gate: ${result.summary}`,
    `Human-voice score: ${result.humanScore}/100.`,
    'Rewrite the FULL page. Keep facts; fix every blocker below. Sound human.',
  ]
  for (const b of result.blockers.slice(0, 12)) {
    lines.push(`- BLOCKER [${b.code}]: ${b.message}${b.fix ? ` → ${b.fix}` : ''}`)
  }
  for (const w of result.warnings.slice(0, 6)) {
    lines.push(`- WARNING [${w.code}]: ${w.message}${w.fix ? ` → ${w.fix}` : ''}`)
  }
  return lines.join('\n')
}
