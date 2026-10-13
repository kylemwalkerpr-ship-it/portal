import {
  COMPANION_CHANNEL_CAPABILITIES,
  runCompanionOrchestrator,
} from '@/lib/yqaaDecisionOrchestrator'
import type { CompanionDecisionArgs } from '@/lib/yqaaCompanionDecision'

const clearJev = {
  available: true as const,
  advisory: {
    sufficient: true,
    confidence: 0.99,
    conflict: false,
    needsHandoff: false,
    market: 'global' as const,
  },
}

function dmArgs(overrides: Partial<CompanionDecisionArgs> = {}) {
  return {
    redactedQuery: 'How does this process work?',
    evidence: [],
    frustration: false,
    duplicateRisk: false,
    budgetGapExplained: false,
    hasNewScopeOrCounter: false,
    commerceIntent: false,
    jevRequest: async () => ({ available: false as const, reason: 'not_configured' as const }),
    ...overrides,
  }
}

describe('channel-aware YQAA decision orchestrator', () => {
  test('public turns cannot authorize commerce or negotiation', async () => {
    const result = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'I want to buy your service and negotiate the price', evidence: [] },
      jev: clearJev,
    })

    expect(result.decision.posture).toBe('ABSTAIN')
    expect(result.decision.negotiationAction).toBeNull()
    expect(COMPANION_CHANNEL_CAPABILITIES.public.allowCommerce).toBe(false)
    expect(COMPANION_CHANNEL_CAPABILITIES.public.allowNegotiation).toBe(false)
    expect(COMPANION_CHANNEL_CAPABILITIES.public.allowDmOffers).toBe(false)
  })

  test('a clear Jev result cannot clear deterministic high-stakes or evidence failures', async () => {
    const highStakes = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'What are my chances of winning my court case?', evidence: [{ body: 'A source', site: 'usa' } as any] },
      jev: clearJev,
    })
    const thinEvidence = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'What are the general steps?', evidence: [] },
      jev: clearJev,
    })

    expect(highStakes.safety).toEqual({ answer: false, reason: 'high_stakes_handoff' })
    expect(highStakes.decision.escalate).toBe(true)
    expect(thinEvidence.safety).toEqual({ answer: false, reason: 'low_evidence_handoff' })
    expect(thinEvidence.decision.posture).toBe('ABSTAIN')
  })

  test('Jev timeout falls back to the existing deterministic public policy', async () => {
    const result = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'How does a general process work?', evidence: [{ body: 'General public information.', site: 'global' } as any] },
      jev: { available: false, reason: 'timeout' },
    })

    expect(result.safety).toEqual({ answer: true, reason: 'deterministic_policy_clear' })
    expect(result.decision.posture).toBe('EDUCATE')
    expect(result.decision.reasons).toContain('deterministic_policy_clear')
  })

  test('a web retrieval failure stays fail-closed even when the earlier Jev was clear', async () => {
    const result = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'How does a general process work?', evidence: [{ body: 'General public information.', site: 'global' } as any] },
      jev: clearJev,
      failClosedReason: 'web_research_failed',
    })

    expect(result.safety).toEqual({ answer: false, reason: 'web_research_failed' })
    expect(result.decision.posture).toBe('ABSTAIN')
  })

  test('public high-stakes decisions retain the licensed handoff capability', async () => {
    const result = await runCompanionOrchestrator({
      channel: 'public',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.public,
      context: { query: 'What should I do about my eviction hearing tomorrow?', evidence: [{ body: 'Public source', site: 'usa' } as any] },
      jev: { available: false, reason: 'timeout' },
    })

    expect(COMPANION_CHANNEL_CAPABILITIES.public.allowLicensedHandoff).toBe(true)
    expect(result.decision.posture).toBe('HANDOFF_SUPPORT')
    expect(result.decision.escalate).toBe(true)
  })

  test('support handoff is a support decision and invalid channel capabilities are rejected', async () => {
    const support = await runCompanionOrchestrator({
      channel: 'support',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.support,
      reason: 'explicit_human_handoff',
    })
    expect(support.decision.posture).toBe('HANDOFF_SUPPORT')

    await expect(runCompanionOrchestrator({
      channel: 'public',
      capabilities: { ...COMPANION_CHANNEL_CAPABILITIES.public, allowDmOffers: true } as any,
      context: { query: 'General information', evidence: [] },
      jev: clearJev,
    })).rejects.toThrow('Invalid capabilities for public companion decision')
  })

  test('DM decisions keep money authority pinned to the server pricing caller', async () => {
    const result = await runCompanionOrchestrator({
      channel: 'dm',
      capabilities: COMPANION_CHANNEL_CAPABILITIES.dm,
      decision: dmArgs({ commerceIntent: true }),
    })
    expect(COMPANION_CHANNEL_CAPABILITIES.dm.moneyAuthority).toBe('server')
    expect(result.decision.posture).toBe('COMMERCE')
    expect(JSON.stringify(result.decision)).not.toMatch(/price|cents|amount/i)
  })
})
