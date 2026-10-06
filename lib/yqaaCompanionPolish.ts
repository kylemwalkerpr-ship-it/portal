/**
 * YQAA companion polish stage — deterministic rules only (no model call).
 *
 * Responsibilities (PIPELINE.md §7 / BRIEF-FOR-BRIDGE §4):
 *  - internal-number leak scrub (floors, bands, means, rates, weights, multipliers, % off talk),
 *  - stale-number guard: every currency amount in a reply must be server-allowed,
 *  - posture check: EDUCATE / DISCOVER must never open with a budget interrogation,
 *  - reduced-price replies must say what is included,
 *  - a near-duplicate reply forces an escalation handoff instead of a loop.
 *
 * The caller regenerates once on a violation and then falls back to a template built
 * from the server-approved number — the module never invents a number itself.
 */
import {
  isNearDuplicateReply,
  leaksInternalFloorLanguage,
} from '@/lib/messengerPricingAuthority'

export type CompanionPostureName =
  | 'EDUCATE'
  | 'DISCOVER'
  | 'EMPATHIZE'
  | 'COMMERCE'
  | 'NEGOTIATE'
  | 'ESCALATE_PROVIDER'
  | 'HANDOFF_SUPPORT'
  | 'ABSTAIN'

export type PolishAction =
  | 'none'
  | 'regenerate'
  | 'fallback_template'
  | 'strip_budget_ask'
  | 'append_includes'
  | 'force_escalation'

export type PolishInput = {
  reply: string
  posture?: CompanionPostureName | null
  /** Server-allowed currency amounts (cents): approved quote, client's own figures, public tier prices. */
  allowedAmountsCents?: number[] | null
  /** Server-approved number used to build the safe fallback template. */
  approvedPriceCents?: number | null
  currency?: string | null
  previousAiBodies?: string[] | null
  /** Bullets describing what the reduced price includes (from the scoped quote). */
  includes?: string[] | null
  /** Set by the caller after one regeneration attempt already happened. */
  regenerated?: boolean
  /** Handoff copy used when a duplicate would otherwise loop. */
  escalationReply?: string | null
}

export type PolishResult = {
  reply: string
  action: PolishAction
  escalate: boolean
  reasons: string[]
}

/**
 * Extra leak lexicon on top of `leaksInternalFloorLanguage`: any internal pricing
 * policy talk. Word boundaries keep legitimate prose ("husband", "bandwidth") safe.
 */
export const COMPANION_LEAK_PATTERNS: RegExp[] = [
  /\bfloor\b/i,
  /\bminimum i (?:can|am allowed)\b/i,
  /\blowest i can\b/i,
  /\bband\b/i,
  /\bmarketplace average\b/i,
  /\bmarket average\b/i,
  /\breference mean\b/i,
  /\brevenue[-\s]?safe\b/i,
  /\bhourly rate\b/i,
  /\bper hour(?: rate)?\b/i,
  /\bmultiplier\b/i,
  /\bweighted score\b/i,
  /\binternal rate\b/i,
  /\bmargin floor\b/i,
  /\bapproval band\b/i,
  /\bauto[-\s]?accept\b/i,
  /\bflex (?:band|policy|percentage)\b/i,
  /\bbelow what the evidence supports\b/i,
]

const PERCENT_BAND_RE = /\b\d{1,3}(?:\.\d+)?\s*%\s*(?:off|below|under|less|lower|discount|cheaper)\b/i
const PERCENT_OFF_WORDS_RE = /\b(?:percent|percentage)\s+off\b/i
const DISCOUNT_TALK_RE = /\b(?:discount|auto-?concession|concession)\s+(?:of|is|would be)?\s*\d/i

const MONEY_RE = /(?:\b(?:usd|cad)\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?))|(?:\$\s*(\d[\d,]*(?:\.\d{1,2})?))|(?:\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:usd|cad|dollars?|bucks?))/gi

/** Extended leak lexicon (string form, for callers that only want a boolean). */
export function leaksCompanionPricingLanguage(text: string): boolean {
  const source = String(text || '')
  if (!source) return false
  if (leaksInternalFloorLanguage(source)) return true
  const lower = source.toLowerCase()
  if (COMPANION_LEAK_PATTERNS.some((pattern) => pattern.test(lower))) return true
  if (PERCENT_BAND_RE.test(source)) return true
  if (PERCENT_OFF_WORDS_RE.test(source)) return true
  if (DISCOUNT_TALK_RE.test(source)) return true
  return false
}

/** Every currency amount in a reply, in cents. */
export function extractReplyAmountsCents(text: string): number[] {
  const source = String(text || '')
  const out: number[] = []
  MONEY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MONEY_RE.exec(source))) {
    const raw = match[1] || match[2] || match[3]
    if (!raw) continue
    const value = Number(String(raw).replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) continue
    out.push(Math.round(value * 100))
  }
  return out
}

function money(cents: number, currency = 'usd') {
  const symbol = String(currency || 'usd').toLowerCase() === 'usd' ? '$' : `${String(currency).toUpperCase()} `
  return `${symbol}${(Math.round(cents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/**
 * Safe templated sentence built ONLY from the server-approved number.
 * Never contains floors, rates, weights or policy talk.
 */
export function safeApprovedPriceTemplate(args: {
  approvedPriceCents: number
  currency?: string | null
  includes?: string[] | null
  clientFigureCents?: number | null
}) {
  const price = money(args.approvedPriceCents, args.currency || 'usd')
  const includes = (args.includes || []).slice(0, 3)
  const parts = [
    `I can put this together for ${price} for the scope we just narrowed down.`,
    includes.length ? `That includes ${includes.join(', ')}.` : '',
    args.clientFigureCents && args.clientFigureCents > 0
      ? `That is the server-approved number for this scope with the budget you mentioned.`
      : '',
    'Want me to send it over as an offer?',
  ]
  return parts.filter(Boolean).join(' ')
}

const BUDGET_INTERROGATION_RE = /\b(budget|how much can you|how much are you (?:able|willing)|price range|what can you spend|spend range)\b/i

function firstSentence(text: string) {
  const source = String(text || '').trim()
  if (!source) return ''
  const match = /^[\s\S]{0,240}?[.!?\n]/.exec(source)
  return match ? match[0] : source.slice(0, 240)
}

function opensWithBudgetInterrogation(reply: string) {
  const opener = firstSentence(reply)
  return /\?/.test(opener) && BUDGET_INTERROGATION_RE.test(opener)
}

/** Remove a leading budget question (EDUCATE/DISCOVER must lead with substance). */
function stripBudgetInterrogation(reply: string): string {
  const source = String(reply || '')
  const sentences = source.split(/(?<=[.!?])\s+/)
  const kept = sentences.filter((sentence, index) => {
    if (index > 1) return true
    return !(BUDGET_INTERROGATION_RE.test(sentence) && /\?/.test(sentence))
  })
  return kept.join(' ').trim()
}

export function polishCompanionReply(input: PolishInput): PolishResult {
  const reasons: string[] = []
  let reply = String(input.reply || '').trim()
  if (!reply) return { reply, action: 'none', escalate: false, reasons }

  const previous = input.previousAiBodies || []

  // 1. Duplicate of a prior YQAA message → escalate instead of looping.
  if (previous.length && isNearDuplicateReply(reply, previous)) {
    reasons.push('duplicate_reply')
    return {
      reply: input.escalationReply ? String(input.escalationReply) : reply,
      action: 'force_escalation',
      escalate: true,
      reasons,
    }
  }

  // 2. Internal pricing language.
  if (leaksCompanionPricingLanguage(reply)) {
    reasons.push('internal_pricing_language')
    if (!input.regenerated) return { reply, action: 'regenerate', escalate: false, reasons }
    if (input.approvedPriceCents && input.approvedPriceCents > 0) {
      reply = safeApprovedPriceTemplate({
        approvedPriceCents: input.approvedPriceCents,
        currency: input.currency,
        includes: input.includes,
      })
      return { reply, action: 'fallback_template', escalate: false, reasons }
    }
    return { reply, action: 'regenerate', escalate: false, reasons }
  }

  // 3. Stale / unapproved number: every $ amount must be server-allowed.
  const allowed = new Set((input.allowedAmountsCents || []).map((cents) => Math.round(Number(cents))).filter((c) => c > 0))
  const amounts = extractReplyAmountsCents(reply)
  const unapproved = amounts.filter((cents) => !allowed.has(cents))
  if (amounts.length && unapproved.length) {
    reasons.push(`unapproved_amount:${unapproved.slice(0, 3).join('|')}`)
    if (!input.regenerated) return { reply, action: 'regenerate', escalate: false, reasons }
    if (input.approvedPriceCents && input.approvedPriceCents > 0) {
      reply = safeApprovedPriceTemplate({
        approvedPriceCents: input.approvedPriceCents,
        currency: input.currency,
        includes: input.includes,
        clientFigureCents: allowed.size ? [...allowed][0] : null,
      })
    } else {
      // No approved number to fall back to: drop the sentence carrying the amount.
      reply = reply
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !extractReplyAmountsCents(sentence).some((cents) => !allowed.has(cents)))
        .join(' ')
        .trim()
    }
    return { reply, action: 'fallback_template', escalate: false, reasons }
  }

  // 4. Posture check: EDUCATE/DISCOVER must not open with a budget interrogation.
  const posture = input.posture || null
  if ((posture === 'EDUCATE' || posture === 'DISCOVER') && opensWithBudgetInterrogation(reply)) {
    reasons.push('budget_interrogation_opener')
    const stripped = stripBudgetInterrogation(reply)
    if (stripped.length >= 40) {
      return { reply: stripped, action: 'strip_budget_ask', escalate: false, reasons }
    }
    return { reply, action: 'regenerate', escalate: false, reasons }
  }

  // 5. A reduced price must say what is included.
  const includes = (input.includes || []).filter(Boolean)
  const mentionsPrice = amounts.length > 0 && input.approvedPriceCents
    ? amounts.some((cents) => cents <= Number(input.approvedPriceCents))
    : false
  if (mentionsPrice && includes.length && !includes.some((item) => reply.toLowerCase().includes(String(item).toLowerCase().slice(0, 18)))) {
    reasons.push('missing_includes')
    const bullets = includes.slice(0, 3).map((item) => `• ${item}`).join('\n')
    return { reply: `${reply}\n\nWhat that includes:\n${bullets}`, action: 'append_includes', escalate: false, reasons }
  }

  return { reply, action: 'none', escalate: false, reasons }
}

/**
 * Full polish pass with one regeneration attempt, then the templated fallback.
 * `regenerate` is injected so this stays testable and free of model dependencies.
 */
export async function polishWithRegeneration(
  input: PolishInput,
  regenerate: (reasons: string[]) => Promise<string | null> | string | null,
): Promise<PolishResult> {
  const first = polishCompanionReply(input)
  if (first.action !== 'regenerate') return first
  const regeneratedReply = await regenerate(first.reasons)
  if (regeneratedReply && String(regeneratedReply).trim()) {
    return polishCompanionReply({ ...input, reply: String(regeneratedReply), regenerated: true })
  }
  return polishCompanionReply({ ...input, regenerated: true })
}
