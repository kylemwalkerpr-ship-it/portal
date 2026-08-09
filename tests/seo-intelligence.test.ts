import {
  appendQueueLineageEvent,
  buildPredictiveSignal,
  confidenceFromEvidence,
  filterRegenerationCandidates,
  freshnessScore,
  type EvidenceLineage,
} from '@/lib/seoEngine/intelligence'

describe('SEO intelligence model', () => {
  const now = Date.parse('2026-08-09T00:00:00.000Z')
  const evidence: EvidenceLineage[] = [
    {
      kind: 'gsc',
      source: 'Google Search Console',
      observedAt: '2026-08-08T00:00:00.000Z',
      authority: 0.9,
    },
    {
      kind: 'knowledge',
      source: 'USCIS',
      url: 'https://www.uscis.gov/news',
      observedAt: '2026-08-07T00:00:00.000Z',
      authority: 0.98,
    },
  ]

  it('decays stale evidence predictably', () => {
    expect(freshnessScore('2026-08-09T00:00:00.000Z', now)).toBeCloseTo(1)
    expect(freshnessScore('2026-06-25T00:00:00.000Z', now, 45)).toBeCloseTo(0.5, 1)
    expect(freshnessScore('not-a-date', now)).toBe(0)
  })

  it('increases confidence with fresh, authoritative, independent evidence', () => {
    const fresh = confidenceFromEvidence(evidence, now)
    const stale = confidenceFromEvidence(
      evidence.map((item) => ({ ...item, observedAt: '2025-01-01T00:00:00.000Z' })),
      now,
    )
    expect(fresh).toBeGreaterThan(stale)
    expect(fresh).toBeLessThanOrEqual(1)
  })

  it('builds an explainable predictive signal and blocks cannibalized siblings', () => {
    const signal = buildPredictiveSignal(
      {
        topic: 'F-1 visa documents',
        play: 'cannibalization',
        opportunityScore: 82,
        difficultyScore: 44,
        signals: ['Two existing pages target this query'],
        sourcePage: '/us/f1-visa/',
      },
      evidence,
      now,
    )
    expect(signal.modelVersion).toBe('seo-intelligence-v1')
    expect(signal.evidence).toHaveLength(2)
    expect(signal.regenerationEligible).toBe(false)
    expect(signal.reasons.join(' ')).toMatch(/consolidate|canonical/i)
  })
})

describe('regeneration filters', () => {
  const items = [
    { topic: 'Study permit checklist', play: 'content_gap' as const, opportunityScore: 80, difficultyScore: 40, intent: 'informational', region: 'CA' },
    { topic: 'F-1 visa documents', play: 'cannibalization' as const, opportunityScore: 95, difficultyScore: 20, intent: 'informational', region: 'US' },
    { topic: 'Skilled worker requirements', play: 'refresh' as const, opportunityScore: 65, difficultyScore: 55, intent: 'procedural', region: 'UK' },
  ]

  it('never falls back to excluded or cannibalized items', () => {
    const result = filterRegenerationCandidates(items, {
      plays: ['content_gap'],
      minOpportunityScore: 70,
      excludeTopics: ['study permit checklist'],
    })
    expect(result).toEqual([])
  })

  it('supports score, difficulty, intent, and region constraints', () => {
    const result = filterRegenerationCandidates(items, {
      plays: ['refresh'],
      minOpportunityScore: 60,
      maxDifficultyScore: 60,
      intents: ['procedural'],
      region: 'UK',
    })
    expect(result.map((item) => item.topic)).toEqual(['Skilled worker requirements'])
  })
})

describe('queue lineage regression', () => {
  it('appends events without mutating history and keeps a bounded timeline', () => {
    const initial = appendQueueLineageEvent([], {
      status: 'pending', actor: 'engine', message: 'Job queued', ts: 10, id: 'one',
    })
    const next = appendQueueLineageEvent(initial, {
      status: 'drafting', actor: 'studio', message: 'Draft started', ts: 20, id: 'two',
    }, 2)
    expect(initial).toHaveLength(1)
    expect(next.map((event) => event.id)).toEqual(['one', 'two'])

    const bounded = appendQueueLineageEvent(next, {
      status: 'failed', actor: 'gate', message: 'Gate blocked', ts: 30, id: 'three',
    }, 2)
    expect(bounded.map((event) => event.id)).toEqual(['two', 'three'])
    expect(bounded[0].message).toBe('Draft started')
  })
})
