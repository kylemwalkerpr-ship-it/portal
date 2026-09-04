import { pickOpportunityForSeed, scoreAndClassify } from '@/lib/seoFactory/opportunityAction'
import { scoreOpportunity, type OpportunityEvidence } from '@/lib/seoFactory/opportunityScore'
import { classifyOpportunityAction } from '@/lib/seoFactory/opportunityAction'

const base = (over: Partial<OpportunityEvidence>): OpportunityEvidence => ({
  query: 'canada study permit',
  page: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
  impressions: 4482,
  clicks: 63,
  ctr: 0.014,
  position: 11.8,
  ...over,
})

describe('Phase 7 action classification', () => {
  it('REFRESH when a page exists at ~12 with weak CTR/coverage', () => {
    const scored = scoreOpportunity(base({ coverageScore: 52 }), 5000)
    const c = classifyOpportunityAction(scored, {
      pagesForQuery: 1,
      hasRelevantPage: true,
      coverageScore: 52,
      internalLinkCandidates: 4,
    })
    expect(c.action).toBe('REFRESH')
    expect(c.actionReasons.join('\n')).toMatch(/4,482 impressions/)
    expect(c.actionReasons.join('\n')).toMatch(/11\.8/)
    expect(c.actionReasons.join('\n')).toMatch(/coverage 52/)
    expect(c.actionReasons.join('\n')).toMatch(/4 high-relevance/)
  })

  it('DEFEND when already page-one strong', () => {
    const scored = scoreOpportunity(base({ position: 2, ctr: 0.16, impressions: 3000, coverageScore: 88 }), 5000)
    const c = classifyOpportunityAction(scored, { pagesForQuery: 1, hasRelevantPage: true, coverageScore: 88 })
    expect(c.action).toBe('DEFEND')
    expect(c.actionReasons.some((r) => /strong/i.test(r))).toBe(true)
  })

  it('CREATE when demand exists without a covering URL', () => {
    const scored = scoreOpportunity(base({ page: undefined, position: 42, coverageScore: 10, impressions: 900 }), 5000)
    const c = classifyOpportunityAction(scored, { pagesForQuery: 0, hasRelevantPage: false, coverageScore: 10 })
    expect(c.action).toBe('CREATE')
  })

  it('CONSOLIDATE when the same query splits across URLs', () => {
    const list = scoreAndClassify([
      base({ page: 'https://a.example/one', impressions: 2000, position: 12 }),
      base({ page: 'https://a.example/two', impressions: 1500, position: 18 }),
    ])
    expect(list.every((o) => o.action === 'CONSOLIDATE')).toBe(true)
    expect(list[0].actionReasons.join(' ')).toMatch(/2 URLs/)
  })

  it('pickOpportunityForSeed keeps CONSOLIDATE from the full GSC window', () => {
    const classified = scoreAndClassify([
      base({ query: 'f-1 visa', page: 'https://a.example/one', impressions: 2000, position: 12 }),
      base({ query: 'f-1 visa', page: 'https://a.example/two', impressions: 1500, position: 18 }),
      base({ query: 'unrelated', page: 'https://a.example/other', impressions: 800, position: 20 }),
    ])
    const picked = pickOpportunityForSeed(classified, 'f-1 visa')
    expect(picked?.action).toBe('CONSOLIDATE')
    const subsetOnly = scoreAndClassify([
      base({ query: 'f-1 visa', page: 'https://a.example/one', impressions: 2000, position: 12 }),
    ])
    expect(subsetOnly[0].action).not.toBe('CONSOLIDATE')
  })

  it('WATCH when evidence is thin', () => {
    const scored = scoreOpportunity(base({ impressions: 3, clicks: 0, ctr: 0, position: 70 }), 5000)
    const c = classifyOpportunityAction(scored, { pagesForQuery: 1, hasRelevantPage: true })
    expect(c.action).toBe('WATCH')
  })
})
