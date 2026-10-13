import type { CompanionDecision } from '@/lib/yqaaCompanionDecision'

/** Public evidence/safety adapter. It translates already-authorized public policy into the shared record contract. */
export function adaptPublicSafetyDecision(input: {
  answerAllowed: boolean
  reason: string
  triggers: string[]
}): CompanionDecision {
  const highStakes = input.reason === 'high_stakes_handoff'
  const posture: CompanionDecision['posture'] = highStakes
    ? 'HANDOFF_SUPPORT'
    : input.answerAllowed ? 'EDUCATE' : 'ABSTAIN'
  return {
    posture,
    negotiationAction: null,
    escalate: highStakes,
    reasons: [...new Set([input.reason, ...input.triggers])].slice(0, 16),
    jev: null,
  }
}

/** Support actuator adapter; identity and queue authorization remain at the caller. */
export function adaptSupportHandoffDecision(reason: string): CompanionDecision {
  return {
    posture: 'HANDOFF_SUPPORT',
    negotiationAction: null,
    escalate: true,
    reasons: [reason.slice(0, 80)],
    jev: null,
  }
}
