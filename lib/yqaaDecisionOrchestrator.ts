/**
 * The one channel-aware entrypoint for YQAA decisions. Existing policy modules
 * remain authoritative: public safety still calls applyYqaaSafetyPolicy, DM
 * still calls buildCompanionDecision, and support only records the caller's
 * already-authorized handoff. This module enforces each channel's capabilities
 * at the boundary and returns a common decision record shape.
 */
import {
  applyYqaaSafetyPolicy,
  yqaaJevTriggers,
  type JevResult,
} from '@/lib/jevAdvisory'
import {
  buildCompanionDecision,
  type CompanionChannel,
  type CompanionDecision,
  type CompanionDecisionArgs,
} from '@/lib/yqaaCompanionDecision'
import type { KnowledgeChunk } from '@/lib/messengerSiteKnowledge'

export type CompanionChannelCapabilities = {
  allowCommerce: boolean
  allowNegotiation: boolean
  allowDmOffers: boolean
  allowLicensedHandoff: boolean
  allowSupportHandoff: boolean
  moneyAuthority: 'server' | 'none'
}

export const COMPANION_CHANNEL_CAPABILITIES = {
  dm: {
    allowCommerce: true,
    allowNegotiation: true,
    allowDmOffers: true,
    allowLicensedHandoff: true,
    allowSupportHandoff: true,
    moneyAuthority: 'server',
  },
  public: {
    allowCommerce: false,
    allowNegotiation: false,
    allowDmOffers: false,
    allowLicensedHandoff: true,
    allowSupportHandoff: true,
    moneyAuthority: 'none',
  },
  support: {
    allowCommerce: false,
    allowNegotiation: false,
    allowDmOffers: false,
    allowLicensedHandoff: false,
    allowSupportHandoff: true,
    moneyAuthority: 'none',
  },
} as const satisfies Record<CompanionChannel, CompanionChannelCapabilities>

type PublicDecisionInput = {
  channel: 'public'
  capabilities: typeof COMPANION_CHANNEL_CAPABILITIES.public
  context: { query: string; hostname?: string | null; evidence: KnowledgeChunk[] }
  jev: JevResult
  /** Post-retrieval failures are fail-closed and can only reduce answerability. */
  failClosedReason?: 'web_evidence_insufficient' | 'web_research_failed'
}

type DmDecisionInput = {
  channel: 'dm'
  capabilities: typeof COMPANION_CHANNEL_CAPABILITIES.dm
  decision: Omit<CompanionDecisionArgs, 'channel'>
}

type SupportDecisionInput = {
  channel: 'support'
  capabilities: typeof COMPANION_CHANNEL_CAPABILITIES.support
  reason: string
}

export type PublicDecisionResult = {
  channel: 'public'
  decision: CompanionDecision
  safety: { answer: boolean; reason: string }
}
export type DmDecisionResult = { channel: 'dm'; decision: CompanionDecision }
export type SupportDecisionResult = { channel: 'support'; decision: CompanionDecision }
export type CompanionDecisionResult = PublicDecisionResult | DmDecisionResult | SupportDecisionResult

function assertChannelCapabilities(
  channel: CompanionChannel,
  capabilities: CompanionChannelCapabilities,
): void {
  const allowed = COMPANION_CHANNEL_CAPABILITIES[channel]
  const keys: (keyof CompanionChannelCapabilities)[] = [
    'allowCommerce', 'allowNegotiation', 'allowDmOffers', 'allowLicensedHandoff', 'allowSupportHandoff', 'moneyAuthority',
  ]
  if (!capabilities) throw new TypeError(`Invalid capabilities for ${channel} companion decision`)
  const capabilityKeys = Object.keys(capabilities)
  if (capabilityKeys.length !== keys.length ||
      keys.some((key) => capabilities[key] !== allowed[key])) {
    throw new TypeError(`Invalid capabilities for ${channel} companion decision`)
  }
}

function publicDecision(safety: PublicDecisionResult['safety'], triggers: string[]): CompanionDecision {
  const highStakes = safety.reason === 'high_stakes_handoff'
  return {
    posture: highStakes ? 'HANDOFF_SUPPORT' : safety.answer ? 'EDUCATE' : 'ABSTAIN',
    negotiationAction: null,
    escalate: highStakes,
    reasons: [...new Set([safety.reason, ...triggers])].slice(0, 16),
    jev: null,
  }
}

export function runCompanionOrchestrator(input: PublicDecisionInput): Promise<PublicDecisionResult>
export function runCompanionOrchestrator(input: DmDecisionInput): Promise<DmDecisionResult>
export function runCompanionOrchestrator(input: SupportDecisionInput): Promise<SupportDecisionResult>
export async function runCompanionOrchestrator(input: PublicDecisionInput | DmDecisionInput | SupportDecisionInput): Promise<CompanionDecisionResult> {
  assertChannelCapabilities(input.channel, input.capabilities)

  if (input.channel === 'public') {
    const policySafety = applyYqaaSafetyPolicy(input.context, input.jev)
    const safety = input.failClosedReason
      ? { answer: false, reason: input.failClosedReason }
      : policySafety
    const triggers = yqaaJevTriggers(input.context)
    return { channel: 'public', safety, decision: publicDecision(safety, triggers) }
  }

  if (input.channel === 'dm') {
    const decision = await buildCompanionDecision({ ...input.decision, channel: 'dm' })
    return { channel: 'dm', decision }
  }

  return {
    channel: 'support',
    decision: {
      posture: 'HANDOFF_SUPPORT',
      negotiationAction: null,
      escalate: true,
      reasons: [input.reason.slice(0, 80)],
      jev: null,
    },
  }
}
