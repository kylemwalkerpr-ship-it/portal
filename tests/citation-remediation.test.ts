import {
  actionHeadings,
  buildCitationRemediation,
  buildCitationRemediations,
  matchAuditQuery,
  needsCitationFix,
  scoreQueryAgainstPage,
  type CoveragePage,
} from '@/lib/seoEngine/citationRemediation'
import { buildCitationActions } from '@/lib/seoEngine/llmVisibility'

const pages: CoveragePage[] = [
  {
    url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
    title: 'UK Graduate Route visa guide',
    primaryKeyword: 'uk graduate visa',
    jobId: 'job-grad',
  },
  {
    url: 'https://legal.yousafeconsultancy.com/us/f-1-visa/',
    title: 'F-1 student visa requirements',
    primaryKeyword: 'f-1 visa requirements',
    jobId: 'job-f1',
  },
  {
    url: null,
    title: 'opt stem extension',
    primaryKeyword: 'opt stem extension',
    clusterId: 'seo-opt',
  },
]

describe('citation remediation matcher', () => {
  it('matches a losing audit to the live URL with the same primary keyword', () => {
    const match = matchAuditQuery('What documents do I need for an F-1 visa?', pages)
    expect(match.mode).toBe('expand')
    expect(match.jobId).toBe('job-f1')
    expect(match.url).toContain('/us/f-1-visa/')
    expect(match.overlap).toBeTruthy()
  })

  it('prefers a live URL over a plan-only term when both overlap', () => {
    const mixed: CoveragePage[] = [
      { url: null, title: 'uk graduate visa', primaryKeyword: 'uk graduate visa', clusterId: 'plan-1' },
      pages[0],
    ]
    const match = matchAuditQuery('UK graduate visa requirements 2026', mixed)
    expect(match.url).toContain('graduate-route-visa')
    expect(match.jobId).toBe('job-grad')
    expect(match.mode).toBe('expand')
  })

  it('returns new when nothing in coverage overlaps', () => {
    const match = matchAuditQuery('Australia subclass 189 points test', pages)
    expect(match.mode).toBe('new')
    expect(match.url).toBeNull()
    expect(match.jobId).toBeNull()
  })

  it('skips cited full-share rows and builds a four-action brief for losers', () => {
    expect(needsCitationFix({ query: 'uk graduate visa', cited: true, shareOfVoice: 1 })).toBe(false)
    expect(needsCitationFix({ query: 'uk graduate visa', cited: false, shareOfVoice: 0 })).toBe(true)
    const actions = buildCitationActions({ shareOfVoice: 0, topCompetitorDomain: 'boundless.com', competitorShare: 0.8, cited: false })
    const item = buildCitationRemediation({
      id: 'a1',
      query: 'How long does a UK graduate visa last?',
      cited: false,
      shareOfVoice: 0,
      topCompetitor: 'boundless.com',
      actions,
    }, pages)
    expect(item).toBeTruthy()
    expect(item!.match.mode).toBe('expand')
    expect(item!.brief.play).toBe('refresh')
    expect(item!.brief.aeoRemediation.actions.length).toBeGreaterThanOrEqual(4)
    expect(item!.brief.sourcePage).toContain('graduate-route-visa')
    expect(actionHeadings(item!.actions).length).toBeGreaterThanOrEqual(3)
  })

  it('dedupes losing queries and ignores winners', () => {
    const list = buildCitationRemediations([
      { query: 'F-1 visa requirements', cited: false, shareOfVoice: 0 },
      { query: 'F-1 visa requirements', cited: false, shareOfVoice: 0 },
      { query: 'UK skilled worker visa 2026', cited: true, shareOfVoice: 1 },
    ], pages)
    expect(list).toHaveLength(1)
    expect(list[0].query).toMatch(/F-1/i)
  })

  it('scores exact primary-keyword hits above weak title overlap', () => {
    const exact = scoreQueryAgainstPage('f-1 visa requirements', pages[1])
    const weak = scoreQueryAgainstPage('f-1 visa requirements', pages[0])
    expect(exact.overlap).toBe('exact')
    expect(exact.score).toBeGreaterThan(weak.score)
  })
})
