import { extraClicks, killReason, pickNext, rankCrucible, scoreCrucible } from '@/lib/seoEngine/crucible'

describe('opportunity crucible', () => {
  it('kills junk, cannibal siblings, and brand-nav', () => {
    expect(killReason({ term: 'yousafe portal login' })).toMatch(/junk-query|brand-navigational/)
    expect(killReason({ term: 'uk dependent visa', play: 'cannibalization' })).toBe('cannibal-sibling')
    expect(killReason({ term: '' })).toBe('empty-term')
  })

  it('kills YMYL-critical with no statute path', () => {
    const score = scoreCrucible({
      term: 'british citizenship application',
      stage: 'citizenship',
      hasStatutoryAnchor: false,
      hasDisclaimerPath: true,
      hasAuthorPath: true,
      impressions: 2000,
      revenue: 5000,
    })
    expect(score.killed).toBe(true)
    expect(score.killReason).toBe('ymyl-critical-no-trust-path')
    expect(score.total).toBe(0)
  })

  it('lets money through when YMYL-critical has a trust path', () => {
    const score = scoreCrucible({
      term: 'hire immigration lawyer for citizenship',
      stage: 'citizenship',
      hasStatutoryAnchor: true,
      hasDisclaimerPath: true,
      hasAuthorPath: true,
      impressions: 400,
      clicks: 30,
      position: 11,
      revenue: 2400,
    })
    expect(score.killed).toBe(false)
    expect(score.service).toBeTruthy()
    expect(score.layers.moneyEV).toBeGreaterThan(0.4)
    expect(score.layers.searchIntent).toBeGreaterThan(0.8)
  })

  it('picks a converting marketplace query over a high-traffic how-to', () => {
    const next = pickNext([
      { term: 'what is an f-1 visa', impressions: 9000, clicks: 200, ctr: 0.022, position: 8, stage: 'intent', revenue: 0 },
      { term: 'hire immigration lawyer', impressions: 400, clicks: 30, ctr: 0.075, position: 11, stage: 'visa', revenue: 1800 },
    ])
    expect(next?.term).toBe('hire immigration lawyer')
    expect(next?.crucible.killed).toBe(false)
  })

  it('ranks GA4 revenue above sessions-only twins', () => {
    const ranked = rankCrucible([
      { term: 'uk graduate visa', impressions: 800, clicks: 20, position: 14, stage: 'visa', revenue: 0 },
      { term: 'uk graduate visa paid', impressions: 800, clicks: 20, position: 14, stage: 'visa', revenue: 2400 },
    ])
    expect(ranked[0].term).toBe('uk graduate visa paid')
    expect(ranked[0].crucible.total).toBeGreaterThan(ranked[1].crucible.total)
  })

  it('treats an uncited quotable query as an AI-visibility opportunity, not a penalty', () => {
    const dark = scoreCrucible({
      term: 'uk skilled worker visa requirements',
      stage: 'visa',
      impressions: 1200,
      position: 12,
      llmCited: 0,
      llmTotal: 6,
      hasStatutoryAnchor: true,
    })
    const cited = scoreCrucible({
      term: 'uk skilled worker visa requirements',
      stage: 'visa',
      impressions: 1200,
      position: 12,
      llmCited: 6,
      llmTotal: 6,
      hasStatutoryAnchor: true,
    })
    expect(dark.layers.geoGap).toBeGreaterThan(cited.layers.geoGap)
  })

  it('lets real keyword difficulty beat the rank-proxy on otherwise identical twins', () => {
    const open = scoreCrucible({
      term: 'uk graduate visa',
      stage: 'visa',
      impressions: 1200,
      position: 14,
      keywordDifficulty: 18,
    })
    const locked = scoreCrucible({
      term: 'uk graduate visa',
      stage: 'visa',
      impressions: 1200,
      position: 14,
      keywordDifficulty: 82,
    })
    expect(open.killed).toBe(false)
    expect(locked.killed).toBe(false)
    expect(open.layers.competitorOpen).toBeGreaterThan(locked.layers.competitorOpen)
    expect(open.total).toBeGreaterThan(locked.total)
  })

  it('still picks hire-lawyer over a lower-KD how-to', () => {
    const next = pickNext([
      { term: 'how to apply for a student visa', impressions: 4000, clicks: 80, position: 12, stage: 'intent', keywordDifficulty: 18, revenue: 0 },
      { term: 'hire immigration lawyer', impressions: 400, clicks: 30, position: 12, stage: 'visa', keywordDifficulty: 62, revenue: 1800 },
    ])
    expect(next?.term).toBe('hire immigration lawyer')
    expect(next?.crucible.killed).toBe(false)
    expect(next?.crucible.layers.searchIntent).toBeGreaterThan(0.8)
  })

  it('projects extra clicks from volume at a deep rank', () => {
    const clicks = extraClicks(1000, 15)
    expect(clicks).toBeGreaterThan(0)
    const score = scoreCrucible({
      term: 'uk graduate visa',
      stage: 'visa',
      volume: 1000,
      position: 15,
    })
    expect(score.extraClicks).toBeGreaterThan(0)
    expect(score.extraClicks).toBe(clicks)
  })

  it('scores a small referring-domain gap as more attainable than a huge one', () => {
    const close = scoreCrucible({
      term: 'uk graduate visa',
      stage: 'visa',
      impressions: 800,
      position: 14,
      referringDomains: 12,
      competitorReferringDomains: 15,
    })
    const far = scoreCrucible({
      term: 'uk graduate visa',
      stage: 'visa',
      impressions: 800,
      position: 14,
      referringDomains: 12,
      competitorReferringDomains: 92,
    })
    expect(close.layers.linkAttainability).toBeGreaterThan(far.layers.linkAttainability)
    expect(close.total).toBeGreaterThan(far.total)
  })
})
