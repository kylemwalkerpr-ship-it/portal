/**
 * YQAA companion decision plane (DM + shared surfaces).
 *
 * Order of authority (PIPELINE.md §5, ARCHITECTURE.md §4.3):
 *   1. deterministic gates ALWAYS run first and always win,
 *   2. Jev (TypeSafe SystemOne) may then choose from the PRUNED posture / negotiation
 *      sets — an answer outside the pruned set is ignored,
 *   3. every number still comes from `lib/yqaaAdaptivePricing.ts`.
 *
 * Jev receives enums, buckets and counts only. Its payload never contains cents,
 * rates, floors or multipliers, and it never returns a price.
 */
import {
  requestCompanionJev,
  type JevNegotiationAction,
  type JevPosture,
  type JevTrigger,
} from '@/lib/jevAdvisory'
import type { KnowledgeChunk } from '@/lib/messengerSiteKnowledge'
import type { AdaptivePricingDecision, CounterClass, NegotiationAction, ScopeDepth } from '@/lib/yqaaAdaptivePricing'
import type { YqaaJourneyStage } from '@/lib/messengerConversationMemory'

export type CompanionPosture = JevPosture
export type CompanionChannel = 'dm' | 'public' | 'support'

export type CompanionJevSummary = {
  available: true
  posture: CompanionPosture | null
  negotiation_posture: NegotiationAction | null
  sufficient: boolean
  confidence: number
  needs_handoff: boolean
  market: string
  used: boolean
  ignored: string[]
}

export type CompanionDecision = {
  posture: CompanionPosture
  negotiationAction: NegotiationAction | null
  escalate: boolean
  reasons: string[]
  jev: CompanionJevSummary | null
}

export type CompanionDecisionArgs = {
  channel: CompanionChannel
  redactedQuery: string
  evidence?: KnowledgeChunk[]
  hostname?: string | null
  pricing?: AdaptivePricingDecision | null
  frustration: boolean
  duplicateRisk: boolean
  budgetGapExplained: boolean
  /** True when the client narrowed scope or made a counter this turn. */
  hasNewScopeOrCounter: boolean
  commerceIntent: boolean
  highStakes?: boolean
  supportIssue?: boolean
  thinEvidence?: boolean
  journeyStage?: string | null
  emotionBand?: string | null
  priorPosture?: string | null
  scopeDepth?: ScopeDepth | null
  counterClass?: CounterClass | null
  counterCount?: number | null
  triggers?: JevTrigger[]
  /** Injectable for tests / callers that must not hit the network. */
  jevRequest?: typeof requestCompanionJev
  jevTimeoutMs?: number
}

const ALL_POSTURES: CompanionPosture[] = [
  'EDUCATE',
  'DISCOVER',
  'EMPATHIZE',
  'COMMERCE',
  'NEGOTIATE',
  'ESCALATE_PROVIDER',
  'HANDOFF_SUPPORT',
  'ABSTAIN',
]

/**
 * Deterministic default negotiation action (PRICING-ADAPTIVE §3.5) — used when Jev
 * is unavailable, times out, or picks an option that was pruned away.
 */
export function defaultNegotiationAction(args: {
  counterClass: CounterClass | null | undefined
  eligible: NegotiationAction[]
  hasDownscopeOption: boolean
}): NegotiationAction | null {
  const eligible = args.eligible || []
  const pick = (candidates: NegotiationAction[]) => candidates.find((candidate) => eligible.includes(candidate)) || null
  switch (args.counterClass) {
    case 'reasonable':
      return pick(['ACCEPT']) || pick(['HOLD_VALUE'])
    case 'reasonable_meet':
      return pick(['MEET_MIDDLE', 'ACCEPT', 'HOLD_VALUE'])
    case 'stretch':
    case 'lowball':
      return pick(['DOWNSCOPE', 'ESCALATE_PROVIDER', 'HOLD_VALUE'])
    case 'abusive':
      return pick(['HOLD_VALUE', 'ESCALATE_PROVIDER'])
    case 'none':
      return pick(['QUOTE', 'HOLD_VALUE'])
    default:
      return pick(['HOLD_VALUE'])
  }
}

/** Postures the server is willing to honour for this turn (forbidden ones are REMOVED). */
export function eligiblePostures(args: {
  channel: CompanionChannel
  pricing?: AdaptivePricingDecision | null
  highStakes?: boolean
  supportIssue?: boolean
  commerceIntent?: boolean
  thinEvidence?: boolean
}): CompanionPosture[] {
  const postures = new Set<CompanionPosture>(ALL_POSTURES)
  if (args.channel === 'public') {
    postures.delete('NEGOTIATE')
    postures.delete('COMMERCE')
  }
  const pricingInPlay = Boolean(
    args.pricing &&
    args.pricing.channel === 'dm' &&
    args.pricing.eligible_actions.length > 0 &&
    args.pricing.status !== 'need_budget',
  )
  if (!pricingInPlay) postures.delete('NEGOTIATE')
  if (!args.supportIssue) postures.delete('HANDOFF_SUPPORT')
  if (!args.thinEvidence) postures.delete('ABSTAIN')
  if (args.highStakes) {
    // High-stakes: the only safe postures are escalation or an honest abstain.
    return ['ESCALATE_PROVIDER', 'ABSTAIN']
  }
  return ALL_POSTURES.filter((posture) => postures.has(posture))
}

/** Deterministic gate order — the first gate that matches decides the outcome. */
export function deterministicCompanionGate(args: {
  channel: CompanionChannel
  frustration: boolean
  duplicateRisk: boolean
  budgetGapExplained: boolean
  hasNewScopeOrCounter: boolean
  highStakes?: boolean
  supportIssue?: boolean
}): { posture: CompanionPosture; escalate: boolean; reason: string } | null {
  if (args.supportIssue) {
    return { posture: 'HANDOFF_SUPPORT', escalate: false, reason: 'support_issue_handoff' }
  }
  if (args.frustration) {
    return { posture: 'EMPATHIZE', escalate: true, reason: 'client_frustration_or_exit' }
  }
  if (args.highStakes) {
    return { posture: 'ESCALATE_PROVIDER', escalate: true, reason: 'high_stakes_ymyl' }
  }
  if (args.duplicateRisk) {
    return { posture: 'ESCALATE_PROVIDER', escalate: true, reason: 'duplicate_reply_risk' }
  }
  if (args.budgetGapExplained && !args.hasNewScopeOrCounter) {
    return { posture: 'ESCALATE_PROVIDER', escalate: true, reason: 'budget_gap_already_explained' }
  }
  return null
}

export async function buildCompanionDecision(args: CompanionDecisionArgs): Promise<CompanionDecision> {
  const reasons: string[] = []
  const pricing = args.pricing || null
  const gate = deterministicCompanionGate({
    channel: args.channel,
    frustration: args.frustration,
    duplicateRisk: args.duplicateRisk,
    budgetGapExplained: args.budgetGapExplained,
    hasNewScopeOrCounter: args.hasNewScopeOrCounter,
    highStakes: args.highStakes,
    supportIssue: args.supportIssue,
  })

  const postures = eligiblePostures({
    channel: args.channel,
    pricing,
    highStakes: args.highStakes,
    supportIssue: args.supportIssue,
    commerceIntent: args.commerceIntent,
    thinEvidence: args.thinEvidence,
  })
  const eligible = pricing?.eligible_actions ?? []
  const negotiationOptions: JevNegotiationAction[] = eligible.filter(
    (action): action is JevNegotiationAction => action !== 'QUOTE',
  )

  // Jev is advisory: it runs even when a deterministic gate already decided, but it
  // can never clear a gate, raise a price, or pick a pruned option.
  let jev: CompanionJevSummary | null = null
  const jevRequest = args.jevRequest || requestCompanionJev
  try {
    const result = await jevRequest(
      {
        query: args.redactedQuery,
        hostname: args.hostname ?? null,
        evidence: args.evidence || [],
        channel: args.channel,
        journeyStage: args.journeyStage ?? null,
        emotionBand: args.emotionBand ?? null,
        scopeDepth: args.scopeDepth ?? pricing?.scope.depth ?? 'unknown',
        counterBucket: args.counterClass ?? pricing?.counter_class ?? 'none',
        counterCount: args.counterCount ?? pricing?.negotiation.counter_count ?? 0,
        frustration: args.frustration,
        duplicateRisk: args.duplicateRisk,
        budgetStatus: pricing?.status ?? 'unknown',
        triggers: args.triggers,
        postureOptions: postures,
        negotiationOptions,
      },
      fetch,
      { timeoutMs: args.jevTimeoutMs },
    )
    if (result.available) {
      jev = {
        available: true,
        posture: result.posture,
        negotiation_posture: (result.negotiationPosture as NegotiationAction | null) ?? null,
        sufficient: result.sufficient,
        confidence: result.confidence,
        needs_handoff: result.needsHandoff,
        market: result.market,
        used: false,
        ignored: result.ignored,
      }
      if (result.ignored.length) reasons.push('jev_option_pruned')
    } else if (result.available === false) {
      reasons.push(`jev_unavailable_${result.reason}`)
    }
  } catch {
    // Jev must never break a turn: fall back to deterministic policy only.
    reasons.push('jev_unavailable_exception')
    jev = null
  }

  let posture: CompanionPosture
  let escalate: boolean
  let negotiationAction: NegotiationAction | null = null

  if (gate) {
    posture = gate.posture
    escalate = gate.escalate
    reasons.push(gate.reason)
    if (gate.reason === 'client_frustration_or_exit') {
      // Frustration -> DOWNSCOPE when a fitting smaller scope exists (never a repeat template).
      negotiationAction = eligible.includes('DOWNSCOPE')
        ? 'DOWNSCOPE'
        : eligible.includes('ESCALATE_PROVIDER') ? 'ESCALATE_PROVIDER' : null
    }
  } else {
    const negotiating =
      Boolean(pricing) &&
      args.channel === 'dm' &&
      (args.hasNewScopeOrCounter || (pricing?.counter_class || 'none') !== 'none')

    let deterministic: CompanionPosture
    if (negotiating) deterministic = 'NEGOTIATE'
    else if (args.commerceIntent && pricing?.approved_price_cents) deterministic = 'COMMERCE'
    else if (args.thinEvidence) deterministic = 'ABSTAIN'
    else if (args.commerceIntent) deterministic = 'COMMERCE'
    else if ((args.scopeDepth || pricing?.scope.depth) === 'unknown') deterministic = 'DISCOVER'
    else deterministic = 'EDUCATE'
    posture = deterministic
    escalate = false

    if (jev?.posture) {
      if (postures.includes(jev.posture)) {
        posture = jev.posture
        jev.used = true
        reasons.push(`jev_posture_${jev.posture}`)
      } else {
        reasons.push(`jev_posture_not_eligible_${jev.posture}`)
      }
    }
    if (jev?.needs_handoff && !escalate) {
      escalate = true
      if (posture !== 'ESCALATE_PROVIDER' && posture !== 'HANDOFF_SUPPORT') posture = 'ESCALATE_PROVIDER'
      reasons.push('jev_needs_handoff')
    }
  }

  if (posture === 'NEGOTIATE' || gate?.reason === 'client_frustration_or_exit') {
    const fallback = defaultNegotiationAction({
      counterClass: args.counterClass ?? pricing?.counter_class ?? 'none',
      eligible,
      hasDownscopeOption: eligible.includes('DOWNSCOPE'),
    })
    let chosen = fallback
    if (jev?.negotiation_posture) {
      if (eligible.includes(jev.negotiation_posture)) {
        chosen = jev.negotiation_posture
        jev.used = true
        reasons.push(`jev_negotiation_${jev.negotiation_posture}`)
      } else {
        reasons.push('jev_negotiation_not_eligible')
      }
    }
    negotiationAction = chosen
    if (posture === 'NEGOTIATE' && chosen === 'ESCALATE_PROVIDER') {
      escalate = true
      posture = 'ESCALATE_PROVIDER'
      reasons.push('negotiation_escalates')
    }
    if (posture === 'NEGOTIATE' && chosen === 'HOLD_VALUE' && pricing?.policy.negotiation_enabled === false) {
      reasons.push('negotiation_disabled_hold')
    }
  }

  if (args.channel === 'public' && posture === 'NEGOTIATE') posture = 'EDUCATE'
  if (args.channel === 'dm' && pricing?.approval_required && posture === 'NEGOTIATE') {
    escalate = true
    reasons.push('pricing_approval_required')
  }

  return { posture, negotiationAction, escalate, reasons, jev }
}

const POSTURE_SUMMARY: Record<CompanionPosture, string> = {
  EDUCATE: 'Answer the substance first (options, pathway, documents, realistic timelines). No budget push.',
  DISCOVER: 'Ask at most one or two high-value clarifying questions, then answer with what you already know.',
  EMPATHIZE: "Acknowledge the client's frustration or fear first, keep it brief, hand to the provider.",
  COMMERCE: 'Move toward a concrete, server-priced next step without overselling.',
  NEGOTIATE: "Respond to the client's narrowed scope or counter using only the server-approved number.",
  ESCALATE_PROVIDER: 'Explain briefly that the human provider is taking this over. Do not practise law or promise outcomes.',
  HANDOFF_SUPPORT: 'Route platform/refund/account issues to support, warmly and briefly.',
  ABSTAIN: 'Say the evidence is thin, stay honest, and invite the provider rather than guessing.',
}

/** Model-facing decision block: posture + reasons + commerce/escalate state. */
export function renderDecisionAuthority(decision: CompanionDecision) {
  const lines = [
    '# DECISION AUTHORITY — SERVER',
    `posture: ${decision.posture}`,
    `posture_guidance: ${POSTURE_SUMMARY[decision.posture]}`,
    decision.negotiationAction ? `negotiation_action: ${decision.negotiationAction}` : 'negotiation_action: none',
    `escalate: ${decision.escalate ? 'true' : 'false'}`,
    `commerce: ${decision.posture === 'COMMERCE' || decision.posture === 'NEGOTIATE' ? 'allowed_with_server_approved_numbers' : 'blocked_until_orientation_complete'}`,
    `reasons: ${decision.reasons.join('; ') || 'none'}`,
    decision.jev
      ? `jev: posture=${decision.jev.posture || 'n/a'} confidence=${decision.jev.confidence} sufficient=${decision.jev.sufficient} handoff=${decision.jev.needs_handoff}`
      : 'jev: unavailable_this_turn (deterministic policy only)',
    'Follow this posture. The server re-checks escalate/commerce after your draft, and it owns every number.',
  ]
  return lines.join('\n')
}

/** Journey stage classifier (rules only; used for memory + posture context). */
export function inferJourneyStage(args: {
  latestClientText: string
  frustration: boolean
  hasOffer: boolean
  pricingStatus?: string | null
  scopeDepth?: ScopeDepth | null
  documentMentions?: boolean
}): YqaaJourneyStage {
  const text = String(args.latestClientText || '')
  if (args.frustration) return 'exit_risk'
  if (/\b(removal|deport|arrest|criminal|court date|asylum deadline|eviction notice)\b/i.test(text)) return 'crisis'
  if (args.hasOffer || args.pricingStatus === 'negotiating') return 'post_offer'
  if (args.pricingStatus === 'ready' || args.pricingStatus === 'provider_approval_required') return 'commerce'
  if (args.scopeDepth === 'consult' || args.scopeDepth === 'review') return 'consult_ready'
  if (args.documentMentions || /\b(documents?|paperwork|transcripts?|forms?)\b/i.test(text)) return 'docs_gather'
  if (/\b(options?|pathway|going rates?|how does|what are my options)\b/i.test(text)) return 'pathway_map'
  return 'orienting'
}
