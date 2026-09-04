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

  it('infers intent without a network call', () => {
    expect(inferSearchIntent(['canada study permit requirements'])).toBe('informational')
    expect(inferSearchIntent(['study permit fees apply'])).toMatch(/transactional|mixed/)
  })
})
