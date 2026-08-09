/**
 * LLM visibility fan-out audit bank + aeoGeo family feed.
 */
import { buildFanOutAuditQueries, type FanOutPlanRow } from '@/lib/seoEngine/llmVisibility'
import { computeRankingScore } from '@/lib/seoEngine/rankingModel'

describe('fan-out audit query builder', () => {
  const plans: FanOutPlanRow[] = [
    {
      cluster_id: 'seo-opt-stem',
      primary_term: 'opt stem extension',
      related_terms: ['opt stem extension requirements', 'opt stem extension documents', 'how long does opt stem extension take'],
      plan: {
        faq: [
          'What are the opt stem extension requirements?',
          'How long does opt stem extension last?',
          'Can you change employers on opt stem extension?',
        ],
      },
    },
    {
      cluster_id: 'seo-pgwp',
      primary_term: 'pgwp eligibility',
      related_terms: ['pgwp application documents'],
      plan: { faq: ['Who is eligible for a post-graduation work permit?'] },
    },
  ]

  it('emits FAQ questions first, then related terms, then the primary term', () => {
    const queries = buildFanOutAuditQueries(plans, { maxPlans: 10, maxPerPlan: 6 })
    const opt = queries.filter((q) => q.clusterId === 'seo-opt-stem')
    // subBudget = maxPerPlan − 1 = 5 → 3 faq + 2 related, primary is the guaranteed 6th.
    expect(opt.map((q) => q.source)).toEqual(['faq', 'faq', 'faq', 'related', 'related', 'primary'])
    expect(opt[0].query).toContain('requirements')
    expect(opt[opt.length - 1].query).toBe('opt stem extension')
  })

  it('de-duplicates within a cluster but audits shared sub-queries per cluster', () => {
    const dupPlans: FanOutPlanRow[] = [
      { cluster_id: 'a', primary_term: 'same term', related_terms: ['dup query'], plan: {} },
      { cluster_id: 'b', primary_term: 'other', related_terms: ['dup query'], plan: {} },
    ]
    const queries = buildFanOutAuditQueries(dupPlans)
    // Global dedup would attribute the shared query to only one cluster and
    // undercount the other's aeoGeo evidence. Per-cluster dedup audits it for
    // both — every cluster's cited/total reflects its own coverage.
    expect(queries.filter((q) => q.clusterId === 'a' && q.query === 'dup query')).toHaveLength(1)
    expect(queries.filter((q) => q.clusterId === 'b' && q.query === 'dup query')).toHaveLength(1)
    // Within a cluster, still no duplicates.
    for (const cluster of ['a', 'b']) {
      const qs = queries.filter((q) => q.clusterId === cluster).map((q) => q.query.toLowerCase())
      expect(new Set(qs).size).toBe(qs.length)
    }
  })

  it('is deterministic for identical inputs', () => {
    const a = buildFanOutAuditQueries(plans, { maxPerPlan: 6 })
    const b = buildFanOutAuditQueries(plans, { maxPerPlan: 6 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('caps per plan and drops unusable rows', () => {
    const capped = buildFanOutAuditQueries(plans, { maxPerPlan: 3 })
    // subBudget = 2 → 2 faq + primary.
    expect(capped.filter((q) => q.clusterId === 'seo-opt-stem').map((q) => q.source)).toEqual(['faq', 'faq', 'primary'])
    const bad = buildFanOutAuditQueries([
      { cluster_id: '', primary_term: 'x', related_terms: [], plan: {} },
      { cluster_id: 'ok', primary_term: '', related_terms: ['r'], plan: {} },
      { cluster_id: 'ok2', primary_term: 'fine', related_terms: ['tiny'], plan: {} },
    ])
    expect(bad.filter((q) => q.query.length < 5)).toHaveLength(0)
  })

  it('treats missing faq/related gracefully', () => {
    const queries = buildFanOutAuditQueries([
      { cluster_id: 'c', primary_term: 'study permit canada', related_terms: [], plan: null },
    ])
    expect(queries).toEqual([
      { clusterId: 'c', primaryTerm: 'study permit canada', query: 'study permit canada', source: 'primary' },
    ])
  })
})

describe('aeoGeo family · llmVisibility evidence', () => {
  const base = {
    topic: 'opt stem extension requirements',
    scope: 'plan' as const,
    subjectKey: 'seo-opt-stem',
    country: 'US',
    stage: 'work',
    gsc: { impressions: 1200, clicks: 40, position: 14 },
  }

  it('rewards measured fan-out citations and explains the bonus', () => {
    const cited = computeRankingScore({
      ...base,
      llmVisibility: { cited: 4, total: 6 },
    })
    const uncited = computeRankingScore({
      ...base,
      llmVisibility: { cited: 0, total: 6 },
    })
    expect(cited.families.aeoGeo.score).toBeGreaterThan(uncited.families.aeoGeo.score)
    expect(cited.families.aeoGeo.reasons.join(' ')).toMatch(/cited 4\/6/)
  })

  it('adds a gap reason when few sub-queries are cited', () => {
    const score = computeRankingScore({ ...base, llmVisibility: { cited: 1, total: 6 } })
    expect(score.families.aeoGeo.reasons.join(' ')).toMatch(/only 1\/6/)
  })

  it('nudges when explicitly zero audits; stays silent when no evidence was provided', () => {
    const zero = computeRankingScore({ ...base, llmVisibility: { cited: 0, total: 0 } })
    expect(zero.families.aeoGeo.reasons.join(' ')).toMatch(/No fan-out LLM audits yet/)
    // Absent input (e.g. a radar row that never carries visibility) must not
    // pollute reasons — the caller simply did not provide the evidence.
    const absent = computeRankingScore({ ...base })
    expect(absent.families.aeoGeo.reasons.join(' ')).not.toMatch(/fan-out/i)
  })

  it('keeps the aeoGeo family bounded at 100', () => {
    const strong = computeRankingScore({
      ...base,
      audit: {
        answerCapsule: true,
        faqBlock: true,
        questionsAsHeadings: true,
        statsPresent: true,
        schemaTypes: ['Article', 'FAQPage'],
        wordCount: 2600,
      },
      llmVisibility: { cited: 6, total: 6 },
    })
    expect(strong.families.aeoGeo.score).toBeLessThanOrEqual(100)
    expect(strong.families.aeoGeo.score).toBeGreaterThanOrEqual(0)
  })

  it('the bonus is monotone non-decreasing in the citation rate', () => {
    const low = computeRankingScore({ ...base, llmVisibility: { cited: 1, total: 6 } })
    const high = computeRankingScore({ ...base, llmVisibility: { cited: 5, total: 6 } })
    expect(high.families.aeoGeo.score).toBeGreaterThanOrEqual(low.families.aeoGeo.score)
  })
})
