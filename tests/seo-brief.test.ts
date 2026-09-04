import { buildSeoBrief, formatSeoBriefForWriter, inferSearchIntent } from '@/lib/seoFactory/seoBrief'
import { expandSeedTemplates } from '@/lib/seoFactory/keywordDiscover'
import { groupKeywords } from '@/lib/seoFactory/keywordGrouping'
import { scoreOpportunity } from '@/lib/seoFactory/opportunityScore'
import { classifyOpportunityAction } from '@/lib/seoFactory/opportunityAction'

describe('Phase 9 SEO brief from intel', () => {
  it('REFRESH brief tells the writer not to create a sibling and does not treat word count as ranking', () => {
    const candidates = expandSeedTemplates('canada study permit')
    candidates[0].sources = ['gsc', 'manual']
    const clusters = groupKeywords(candidates)
    const scored = scoreOpportunity({
      query: 'canada study permit',
      page: 'https://legal.example/permit',
      impressions: 4482,
      clicks: 63,
      ctr: 0.014,
      position: 11.8,
      coverageScore: 52,
    }, 5000)
    const opp = classifyOpportunityAction(scored, { pagesForQuery: 1, hasRelevantPage: true, coverageScore: 52 })
    const brief = buildSeoBrief({
      seed: 'canada study permit',
      candidates,
      clusters,
      coverage: { score: 52, keywordVariants: 50, entities: 50, subtopics: 50, questions: 50, internalLinks: 40, freshness: 70, reasons: [] },
      opportunity: opp,
      cannibals: [{
        pageA: 'https://legal.example/permit',
        pageB: 'https://legal.example/permit-guide',
        overlapScore: 80,
        sharedQueries: ['canada study permit'],
        sharedClusters: [],
        recommendedAction: 'merge',
        reasons: ['x'],
      }],
      links: [{ targetUrl: 'https://legal.example/pgwp', targetTitle: 'PGWP', relevance: 90, suggestedAnchor: 'post-graduation work permit', reason: 'related' }],
    })
    expect(brief.opportunityAction).toBe('REFRESH')
    expect(brief.warnings.some((w) => /sibling/i.test(w))).toBe(true)
    expect(brief.warnings.some((w) => /not an SEO ranking factor/i.test(w))).toBe(true)
    expect(brief.competingInternalPages.length).toBe(2)
    expect(brief.evidence.gscQueries.length).toBeGreaterThan(0)
    expect(brief.internalLinks[0].suggestedAnchor).toMatch(/work permit/i)
    const contract = formatSeoBriefForWriter(brief)
    expect(contract).toMatch(/MUST update the existing page/)
    expect(contract).not.toMatch(/ranking factor.*\d{4} words/)
  })

  it('CREATE green-card brief produces a complete writer contract without invented volume', () => {
    const candidates = expandSeedTemplates('how to apply for a green card')
    const clusters = groupKeywords(candidates)
    const scored = scoreOpportunity({
      query: 'how to apply for a green card',
      page: '',
      impressions: 4800,
      clicks: 120,
      ctr: 0.025,
      position: 12.1,
      coverageScore: 38,
    }, 5000)
    const opp = classifyOpportunityAction(scored, { pagesForQuery: 0, hasRelevantPage: false, coverageScore: 38 })
    const brief = buildSeoBrief({
      seed: 'how to apply for a green card',
      candidates,
      clusters,
      opportunity: opp,
      coverage: { score: 38, keywordVariants: 40, entities: 40, subtopics: 35, questions: 44, internalLinks: 30, freshness: 60, reasons: [] },
    })
    expect(brief.opportunityAction).toBe('CREATE')
    expect(brief.primaryTopic).toMatch(/green card/i)
    expect(brief.targetCluster).toContain('how to apply for a green card')
    expect(brief.questions.length).toBeGreaterThanOrEqual(5)
    expect(brief.warnings.some((w) => /CREATE/.test(w))).toBe(true)
    expect(brief.warnings.some((w) => /do not keyword-stuff/i.test(w))).toBe(true)
    const contract = formatSeoBriefForWriter(brief)
    expect(contract).toMatch(/SEO intelligence brief \(writer contract\)/)
    expect(contract).toMatch(/Opportunity action: CREATE/)
    expect(contract).toMatch(/Questions to answer:/)
    // £0 rule: never invent volume / KD / CPC — the contract only carries
    // first-party queries and editorial guidance.
    expect(contract).not.toMatch(/search volume|monthly volume|\bKD\b|^\s*CPC|0 volume/i)
  })

  it('infers intent without a network call', () => {
    expect(inferSearchIntent(['canada study permit requirements'])).toBe('informational')
    expect(inferSearchIntent(['study permit fees apply'])).toMatch(/transactional|mixed/)
  })
})
