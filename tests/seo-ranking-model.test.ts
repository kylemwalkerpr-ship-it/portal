import {
  FAMILY_WEIGHTS,
  RANKING_MODEL_VERSION,
  SIGNAL_FAMILIES,
  assembleLineageTimeline,
  buildForecast,
  classifyIntent,
  computeRankingScore,
  computeReward,
  creditOutcome,
  enrichQueueWithRanking,
  rankingForOpportunity,
  recalibrateWeights,
  sortByModelTotal,
  type RankingModelInput,
} from '@/lib/seoEngine/rankingModel'

describe('ranking model · intent taxonomy', () => {
  it('classifies procedural informational intent with reward alignment', () => {
    const intent = classifyIntent('How do I apply for a Canada study permit?')
    expect(intent.primary).toBe('informational')
    expect(intent.subType).toBe('procedural')
    expect(intent.reward.join(' ')).toMatch(/steps/i)
  })

  it('classifies comparative, document, and cost subtypes', () => {
    expect(classifyIntent('H-1B vs L-1 which is better').subType).toBe('comparative')
    expect(classifyIntent('Form I-765 documents required').subType).toBe('document')
    expect(classifyIntent('How much does a UK spouse visa cost').subType).toBe('cost')
  })

  it('flags navigational brand queries as low priority', () => {
    const intent = classifyIntent('yousafe portal login')
    expect(intent.primary).toBe('navigational')
  })

  it('ranks a hire/consult query above an informational how-to at equal demand', () => {
    const gsc = { impressions: 1200, clicks: 40, ctr: 0.033, position: 12 }
    const hire = computeRankingScore({ topic: 'hire an immigration lawyer', gsc })
    const howto = computeRankingScore({ topic: 'how to apply for a student visa', gsc })
    expect(hire.intent.primary).toBe('transactional')
    expect(howto.intent.primary).toBe('informational')
    expect(hire.total).toBeGreaterThan(howto.total)
  })

  it('GA4 purchase revenue beats a sessions-only twin', () => {
    const gsc = { impressions: 800, clicks: 24, ctr: 0.03, position: 14 }
    const paid = computeRankingScore({ topic: 'uk graduate visa', gsc, revenue: 2400 })
    const traffic = computeRankingScore({ topic: 'uk graduate visa', gsc, revenue: 0 })
    expect(paid.total).toBeGreaterThan(traffic.total)
  })
}
)

describe('ranking model · composite score', () => {
  const baseInput: RankingModelInput = {
    topic: 'F-1 OPT STEM extension requirements',
    country: 'US',
    stage: 'work',
    gsc: { impressions: 2400, clicks: 60, ctr: 0.025, position: 12 },
    audit: {
      hasAuthor: true,
      hasGovCitation: true,
      hasDisclaimer: true,
      wordCount: 2600,
      answerCapsule: true,
      faqBlock: true,
      statsPresent: true,
      questionsAsHeadings: true,
      schemaTypes: ['Article', 'FAQPage'],
      crawlable: true,
      canonicalOk: true,
      llmsTxt: true,
    },
    links: { internalLinks: 14, referringDomains: 2, backlinkAuthority: 62 },
  }

  it('weights sum to 1.0 and every family is present', () => {
    const sum = SIGNAL_FAMILIES.reduce((s, fam) => s + FAMILY_WEIGHTS[fam], 0)
    expect(sum).toBeCloseTo(1, 3)
    const score = computeRankingScore(baseInput)
    for (const fam of SIGNAL_FAMILIES) {
      expect(score.families[fam].score).toBeGreaterThanOrEqual(0)
      expect(score.families[fam].score).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic for identical inputs', () => {
    const a = computeRankingScore(baseInput)
    const b = computeRankingScore(baseInput)
    expect(a.total).toBe(b.total)
    expect(JSON.stringify(a.families)).toBe(JSON.stringify(b.families))
  })

  it('rewards a well-rounded page above a thin one', () => {
    const strong = computeRankingScore(baseInput)
    const weak = computeRankingScore({
      topic: 'F-1 OPT STEM extension requirements',
      gsc: { impressions: 40, clicks: 1, ctr: 0.02, position: 55 },
      audit: { wordCount: 400, crawlable: true },
    })
    expect(strong.total).toBeGreaterThan(weak.total)
    expect(strong.total).toBeGreaterThanOrEqual(0)
    expect(strong.total).toBeLessThanOrEqual(100)
  })

  it('suggests targeted actions for weak families', () => {
    const score = computeRankingScore({ topic: 'Express Entry points calculator', gsc: { impressions: 3000, position: 18 } })
    expect(score.recommendedActions.length).toBeGreaterThan(0)
    expect(score.recommendedActions.join(' ')).toMatch(/answer capsule|FAQ|canonical|interlink|depth/i)
  })

  it('carries the model version and an explicit intent object', () => {
    const score = computeRankingScore(baseInput)
    expect(score.modelVersion).toBe(RANKING_MODEL_VERSION)
    expect(score.intent.subType).toBe('checklist')
  })
})

describe('ranking model · forecast', () => {
  it('projects monotonic improvement as actions compound over horizons', () => {
    const forecast = buildForecast({
      position: 18,
      impressions: 1200,
      clicks: 30,
      modelTotal: 78,
      plannedActions: [
        { action: 'funnel_climb', strength: 2 },
        { action: 'authority_anchor', strength: 2 },
        { action: 'funnel_new', strength: 1 },
      ],
    })
    expect(forecast.points).toHaveLength(3)
    const [p30, p60, p90] = forecast.points
    // Each horizon is distinct: full effect lands at 90 days (30 ≈ ⅓, 60 ≈ ⅔).
    expect(p60.projectedPosition).toBeLessThan(p30.projectedPosition)
    expect(p90.projectedPosition).toBeLessThan(p60.projectedPosition)
    expect(p90.projectedPosition).toBeGreaterThanOrEqual(1)
    expect(p60.projectedImpressions).toBeGreaterThan(p30.projectedImpressions)
    expect(forecast.assumptions.length).toBeGreaterThan(0)
  })

  it('stays bounded and never projects negative traffic', () => {
    const forecast = buildForecast({ position: 4, impressions: 500, clicks: 60, modelTotal: 90, plannedActions: [] })
    for (const p of forecast.points) {
      expect(p.projectedPosition).toBeGreaterThanOrEqual(1)
      expect(p.projectedImpressions).toBeGreaterThanOrEqual(0)
      expect(p.projectedClicks).toBeGreaterThanOrEqual(0)
      expect(p.probabilityOfTop10).toBeGreaterThanOrEqual(0)
      expect(p.probabilityOfTop10).toBeLessThanOrEqual(1)
    }
  })

  it('a stronger model score yields a better position projection', () => {
    const weak = buildForecast({ position: 18, impressions: 1000, modelTotal: 40, plannedActions: [{ action: 'funnel_climb', strength: 2 }] })
    const strong = buildForecast({ position: 18, impressions: 1000, modelTotal: 85, plannedActions: [{ action: 'funnel_climb', strength: 2 }] })
    expect(strong.points[2].projectedPosition).toBeLessThanOrEqual(weak.points[2].projectedPosition)
  })
})

describe('ranking model · reward loop', () => {
  it('computes reward from deltas, weighting position gains hardest', () => {
    const gain = computeReward({ deltaImpressions: 400, deltaClicks: 40, deltaPosition: -6 })
    const flat = computeReward({})
    const loss = computeReward({ deltaClicks: -10, deltaPosition: 3 })
    expect(gain).toBeGreaterThan(flat)
    expect(gain).toBeLessThanOrEqual(1)
    expect(loss).toBeLessThan(gain)
    expect(flat).toBe(0)
  })

  it('credits an outcome to its action family with secondary attribution', () => {
    const event = creditOutcome({
      pageUrl: 'https://legal.yousafeconsultancy.com/us/opt-stem-extension/',
      topic: 'OPT STEM extension',
      action: 'backlink',
      deltaImpressions: 900,
      deltaClicks: 70,
      deltaPosition: -8,
    })
    expect(event.reward).toBeGreaterThan(0)
    expect(event.attribution.linkEquity).toBeGreaterThan(0)
    expect(event.attribution.topicalAuthority).toBeGreaterThan(0)
  })

  it('recalibrates weights within bounds and keeps the sum at 1.0', () => {
    const events = [1, 2, 3].map((i) =>
      creditOutcome({
        pageUrl: `https://example.com/p${i}`,
        action: i === 1 ? 'funnel_new' : i === 2 ? 'authority_anchor' : 'kill_or_merge',
        deltaImpressions: 500 * i,
        deltaClicks: 20 * i,
        deltaPosition: -3 * i,
      }),
    )
    const next = recalibrateWeights(FAMILY_WEIGHTS, events, 0.02)
    const sum = SIGNAL_FAMILIES.reduce((s, fam) => s + next[fam], 0)
    // Hard invariants: sum ≈ 1 and every family inside its [base ± 0.05] band
    // (small epsilon for 3-decimal rounding only).
    expect(sum).toBeGreaterThanOrEqual(0.99)
    expect(sum).toBeLessThanOrEqual(1.01)
    for (const fam of SIGNAL_FAMILIES) {
      expect(next[fam]).toBeGreaterThanOrEqual(FAMILY_WEIGHTS[fam] - 0.05 - 0.001)
      expect(next[fam]).toBeLessThanOrEqual(FAMILY_WEIGHTS[fam] + 0.05 + 0.001)
    }
  })
})

describe('ranking model · opportunity enrichment (radar + autopilot)', () => {
  it('scores every radar row and sorts picks by model total', () => {
    const queue = [
      { term: 'H-1B cap-gap rules', impressions: 3000, clicks: 90, ctr: 0.03, position: 9, region: 'US', priorityScore: 80 },
      { term: 'Generic visa essay', impressions: 60, clicks: 2, ctr: 0.03, position: 60, region: 'US', priorityScore: 40 },
    ]
    const { queue: enriched, modelAvg } = enrichQueueWithRanking(queue)
    expect(enriched).toHaveLength(2)
    for (const o of enriched) {
      expect(o.ranking.total).toBeGreaterThanOrEqual(0)
      expect(o.ranking.total).toBeLessThanOrEqual(100)
      expect(o.ranking.forecast.points).toHaveLength(3)
    }
    expect(modelAvg).toBeGreaterThanOrEqual(0)
    const sorted = sortByModelTotal(enriched, (o) => o.priorityScore || 0)
    expect(sorted[0].ranking.total).toBeGreaterThanOrEqual(sorted[1].ranking.total)
    // The stronger opportunity must beat the thin one regardless of order.
    expect(rankingForOpportunity(queue[0]).total).toBeGreaterThan(rankingForOpportunity(queue[1]).total)
  })
})

describe('ranking model · lineage timeline', () => {
  it('walks the regeneration chain back to origin and interleaves events by time', () => {
    const nodes = [
      { id: 'job-c', sourceJobId: 'job-b', status: 'merged', createdAt: '2026-08-08T10:00:00.000Z', topic: 'OPT extension', regenerationMode: 'refresh', regenerationReason: 'CTR decay' },
      { id: 'job-b', sourceJobId: 'job-a', status: 'merged', createdAt: '2026-07-20T10:00:00.000Z', topic: 'OPT extension', regenerationMode: 'expand', regenerationReason: 'thin content' },
      { id: 'job-a', sourceJobId: null, status: 'merged', createdAt: '2026-06-01T10:00:00.000Z', topic: 'OPT extension' },
    ]
    const events = [
      { id: 'e2', ts: Date.parse('2026-08-09T00:00:00.000Z'), status: 'blocked', actor: 'gate', message: 'Gate blocked: no disclaimer' },
      { id: 'e1', ts: Date.parse('2026-07-21T00:00:00.000Z'), status: 'passed', actor: 'gate', message: 'Gate cleared' },
    ]
    const timeline = assembleLineageTimeline(nodes, events)
    // Original job first, then regenerations, gate events merged in time order
    expect(timeline[0].kind).toBe('node')
    expect(timeline[0].label).toContain('OPT extension')
    expect(timeline.filter((t) => t.kind === 'node')).toHaveLength(3)
    expect(timeline.some((t) => t.mode === 'refresh' && t.reason === 'CTR decay')).toBe(true)
    const times = timeline.map((t) => t.ts)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})
