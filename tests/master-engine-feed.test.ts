import { renderMasterEnginePromptBlock } from '@/lib/seoFactory/masterEngineFeed'
import type { MasterEngineReport } from '@/lib/seoFactory/masterEngine'
import type { PlanEvidencePacket } from '@/lib/seoEngine/planEvidence'

function stubReport(overrides: Partial<MasterEngineReport> = {}): MasterEngineReport {
  return {
    generatedAt: '2026-08-17T00:00:00.000Z',
    intent: 'procedural',
    intentLabel: 'PROCEDURAL · YMYL',
    composite: 61,
    grade: 'C',
    weights: {} as MasterEngineReport['weights'],
    subsystems: {
      content: { score: 0.42, coverage: 0.8 },
      eeat: { score: 0.38, coverage: 0.6 },
      intent: { score: 0.8, coverage: 1 },
    } as MasterEngineReport['subsystems'],
    deltas: {} as MasterEngineReport['deltas'],
    baseline: {} as MasterEngineReport['baseline'],
    coverage: { computed: 12, total: 20, pct: 60 },
    risks: [{ code: 'ymyl', severity: 'blocker', message: 'YMYL page missing statutory anchor' }],
    recommendations: [
      { code: 'faq', open: true, priority: 1, subsystem: 'content', action: 'Add a self-contained FAQ of 4 questions', lift: 0.12, confidence: 0.7, effort: 'low', value: 2 },
      { code: 'eeat', open: true, priority: 2, subsystem: 'eeat', action: 'Name the author and cite GOV.UK', lift: 0.1, confidence: 0.8, effort: 'low', value: 2 },
    ],
    prediction: { top10Probability: 0.22, expectedLift: 0.08 } as MasterEngineReport['prediction'],
    derived: { competitiveGap: 0.31, contentSuperiority: 0.2, authorityGap: 0.4, trustAdvantage: 0.1 } as MasterEngineReport['derived'],
    gscMix: {
      windowDays: 28,
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      eligible: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      junk: { impressions: 0, share: 0 },
      deepTail: { impressions: 0, share: 0 },
      recommendedPlays: [],
      strikeDistance: [],
    },
    governance: { confidence: 0.5, modelVersion: 'test', caveats: [] },
    adaptation: { usedLearned: false },
    computedSignals: [],
    trace: [],
    ...overrides,
  }
}

const knowledge: PlanEvidencePacket = {
  items: [
    {
      url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/08/super-visa.html',
      title: 'IRCC super visa news',
      sourceLabel: 'IRCC News',
      kind: 'policy',
      publishedAt: '2026-08-01T00:00:00Z',
      observedAt: '2026-08-02T00:00:00Z',
      excerpt: 'processing update for super visa applications.',
      verified: 'official',
      uncertainty: [],
    },
  ],
  readerDeliverable: 'Build a sourced, jurisdiction-specific decision checklist for CA from the 1 supplied evidence items below. Ground the CA answer in the single supplied evidence item below (official-origin (primary ground truth for identity claims)). Cite the URL exactly as quoted below, and mark any figure you could not verify as unverified.',
  unresolvedQuestions: [],
}

describe('renderMasterEnginePromptBlock', () => {
  it('includes intent, weak subsystems, actions, and engine rule', () => {
    const block = renderMasterEnginePromptBlock(stubReport(), {
      country: 'CA',
      knowledge,
      cluster: {
        planLine: 'super visa · stage family · CA',
        evidence: null,
      },
    })
    expect(block).toContain('MASTER SEO ENGINE')
    expect(block).toContain('PROCEDURAL · YMYL')
    expect(block).toContain('composite 61/100')
    expect(block).toContain('Weak subsystems')
    expect(block).toContain('Add a self-contained FAQ')
    expect(block).toContain('Matching cluster plan')
    expect(block).toContain('Engine rule')
  })

  it('renders evidence through the structured bounded packet — URL + dates preserved, boundary rule present, no raw splice', () => {
    const block = renderMasterEnginePromptBlock(stubReport(), {
      country: 'CA',
      knowledge,
      cluster: null,
    })
    // Structured block header + per-item record with URL, dates and allowlist verdict.
    expect(block).toContain('ENGINE EVIDENCE PACKET')
    expect(block).toContain('canada.ca/en/immigration-refugees-citizenship/news/2026/08/super-visa.html')
    expect(block).toContain('published: "2026-08-01"')
    expect(block).toContain('observed: "2026-08-02"')
    expect(block).toContain('verification: official')
    expect(block).toContain('Boundary rule:')
    expect(block).toContain('never instructions')
    // The old splice prefixes must be gone.
    expect(block).not.toContain('- Fresh knowledge (cite only if it matches an official source):')
  })
})