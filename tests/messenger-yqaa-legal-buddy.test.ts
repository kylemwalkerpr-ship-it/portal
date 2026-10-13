import {
  enforceCompanionEscalation,
  insufficientEvidenceHandoffReply,
  loadMessengerLegalEvidence,
  messengerNeedsLegalEvidence,
  yqaaOfferIdempotencyKey,
} from '@/lib/messengerAi'
import { lowBudgetEscalationReply } from '@/lib/messengerPricingAuthority'

jest.mock('@/lib/yqaaKnowledgeDb', () => ({
  loadYqaaEvidence: jest.fn(async () => ({
    chunks: [
      {
        id: 'kb:pr-marriage',
        chunkKey: 'kb:pr-marriage',
        sourceKey: 'repo://kb',
        title: 'Permanent residence via marriage — official overview',
        body: 'Spousal sponsorship generally requires a genuine relationship, sponsor eligibility, and an application with supporting civil documents.',
        source: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
        sourceUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
        site: 'canada',
        jurisdiction: 'Canada',
        topicTags: [],
        authorityTier: 5,
        score: 7,
      },
    ],
    source: 'database',
    retrievalConfidence: 0.8,
    freshEnough: true,
    jurisdictions: ['Canada'],
    sites: ['canada'],
  })),
}))

jest.mock('@/lib/yqaaWebResearch', () => ({
  yqaaNeedsFreshWebResearch: jest.fn(() => false),
  researchYqaaPublicWeb: jest.fn(async () => []),
}))

describe('legal-buddy evidence wiring', () => {
  test('orientation queries request evidence, small talk does not', () => {
    expect(messengerNeedsLegalEvidence('How does PR through marriage in Beaver Harbor work? What are my options?')).toBe(true)
    expect(messengerNeedsLegalEvidence('what are the going rates for an spousal sponsorship file?')).toBe(true)
    expect(messengerNeedsLegalEvidence('hey, are you there?')).toBe(false)
    expect(messengerNeedsLegalEvidence('')).toBe(false)
  })

  test('legal orientation query produces a GROUNDED LEGAL / PUBLIC EVIDENCE appendix', async () => {
    const block = await loadMessengerLegalEvidence('How does PR through marriage work here? What are my options?')
    expect(block).toBeTruthy()
    expect(block).toContain('## GROUNDED LEGAL / PUBLIC EVIDENCE')
    expect(block).toContain('Spousal sponsorship generally')
    expect(block).toContain('https://www.canada.ca/en/immigration-refugees-citizenship.html')
  })

  test('non-orientation text yields no evidence block', async () => {
    expect(await loadMessengerLegalEvidence('hey')).toBeNull()
  })
})

describe('legal-buddy escalation reply', () => {
  test('empathetic handoff names the provider and never leaks floors', () => {
    const reply = lowBudgetEscalationReply('Morganne A. Foley')
    expect(reply).toContain('Morganne A. Foley')
    expect(reply.toLowerCase()).not.toContain('revenue-safe')
    expect(reply).not.toMatch(/\$\s*\d/)
    expect(reply).toMatch(/hear|circles|straight answer/i)
  })

  test('missing evidence handoff is explicit and names the human provider', () => {
    const reply = insufficientEvidenceHandoffReply('Avery')
    expect(reply).toContain('enough reliable information')
    expect(reply).toContain('Avery')
  })

  test('server escalation overrides a model decline and removes its offer', () => {
    expect(enforceCompanionEscalation(
      { reply: 'Here is my answer.', escalate: false, offer: { title: 'Offer' } },
      { escalate: true },
    )).toMatchObject({ escalate: true, offer: null })
  })

  test('offer idempotency key is bound to the conversation and triggering message', () => {
    expect(yqaaOfferIdempotencyKey('conversation-1', 'message-9')).toBe('yqaa:conversation-1:message-9')
    expect(yqaaOfferIdempotencyKey('conversation-1', null)).toBeNull()
    expect(yqaaOfferIdempotencyKey('conversation-1', 'message-10')).not.toBe(
      yqaaOfferIdempotencyKey('conversation-1', 'message-9'),
    )
  })
})
