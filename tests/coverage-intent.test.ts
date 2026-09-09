import { classifyCoverageIntent, bestOwnerMatch, collapseParaphraseDemand } from '@/lib/seoEngine/coverageIntent'
import { shippedOverlap, buildShippedStems, type ShippedPage } from '@/lib/seoEngine/shippedCoverage'
import { ubersuggestSignalsToDiscover } from '@/lib/seoEngine/ubersuggestDiscover'
import { verdictFor } from '@/lib/seoEngine/authorityPlaybook'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

describe('classifyCoverageIntent', () => {
  it('treats a titled paraphrase as the same owner', () => {
    expect(classifyCoverageIntent('uk graduate visa', 'UK Graduate Visa Guide')).toBe('paraphrase')
  })

  it('treats a tool/cost/vs modifier as a spoke, not a refresh', () => {
    expect(classifyCoverageIntent('express entry canada calculator', 'express entry canada')).toBe('spoke')
    expect(classifyCoverageIntent('australia student visa fee', 'australia student visa')).toBe('spoke')
    expect(classifyCoverageIntent('diy green card vs attorney', 'green card')).toBe('spoke')
  })

  it('treats audience/geo extras as a section expand, not a new URL', () => {
    expect(classifyCoverageIntent('f-1 visa interview questions for Nigerians', 'f-1 visa interview questions')).toBe(
      'section_expand',
    )
  })

  it('does not treat a broader query as a spoke of a narrower owner', () => {
    expect(classifyCoverageIntent('f-1 visa', 'f-1 visa interview questions')).toBe('unrelated')
    expect(bestOwnerMatch('f-1 visa', ['f-1 visa interview questions'])?.kind).not.toBe('spoke')
  })

  it('does not let a one-token owner swallow the whole estate', () => {
    expect(classifyCoverageIntent('express entry canada calculator', 'visa')).toBe('unrelated')
  })

  it('collapses fee/price/charges/increase onto the same commercial owner', () => {
    expect(classifyCoverageIntent('australia student visa price', 'australia student visa fee increase')).toBe('paraphrase')
    expect(classifyCoverageIntent('australia student visa charges', 'australia student visa fee')).toBe('paraphrase')
    expect(classifyCoverageIntent('australia student visa fee', 'australia student visa')).toBe('spoke')
  })

  it('collapses rules onto restrictions rather than shipping a sibling', () => {
    expect(classifyCoverageIntent('australia student visa rules', 'australia student visa restrictions')).toBe('paraphrase')
    expect(classifyCoverageIntent('australia student visa', 'australia student visa restrictions')).not.toBe('paraphrase')
  })

  it('attaches a requirements spoke to the pillar, not a sibling calculator', () => {
    const match = bestOwnerMatch('requirements express entry canada', [
      'express entry canada calculator',
      'express entry canada',
    ])
    expect(match?.kind).toBe('spoke')
    expect(match?.owner).toBe('express entry canada')
  })

  it('treats agency-name extras as the pillar, not a CIC spoke', () => {
    expect(classifyCoverageIntent('express entry canada cic', 'express entry canada')).toBe('paraphrase')
    expect(bestOwnerMatch('express entry canada cic', [
      'canada express entry crs international student graduates',
      'express entry canada',
    ])?.owner).toBe('express entry canada')
  })

  it('folds UK spelling and student-audience extras onto the same visa intent', () => {
    expect(classifyCoverageIntent('student dependant visa uk', 'dependent visa uk')).toBe('section_expand')
    expect(classifyCoverageIntent('uk dependent visa', 'dependent visa uk')).toBe('paraphrase')
    expect(classifyCoverageIntent('dependant visa uk', 'dependent visa uk')).toBe('paraphrase')
    expect(classifyCoverageIntent('marriage based green card timeline', 'marriage green card timeline')).toBe('paraphrase')
    expect(classifyCoverageIntent('child dependant visa uk requirements', 'dependent visa uk')).toBe('spoke')
  })
})

describe('collapseParaphraseDemand', () => {
  it('keeps the highest-impression UK dependent-visa representative and the requirements spoke', () => {
    const kept = collapseParaphraseDemand([
      { term: 'student dependent visa uk', impressions: 40 },
      { term: 'dependant visa uk', impressions: 38 },
      { term: 'dependent visa uk', impressions: 97 },
      { term: 'uk dependent visa', impressions: 74 },
      { term: 'student dependant visa uk', impressions: 73 },
      { term: 'child dependant visa uk requirements', impressions: 25 },
      { term: 'marriage green card timeline', impressions: 32 },
      { term: 'marriage based green card timeline', impressions: 30 },
    ])
    const terms = kept.map((r) => r.term)
    expect(terms).toContain('dependent visa uk')
    expect(terms).toContain('child dependant visa uk requirements')
    expect(terms).toContain('marriage green card timeline')
    expect(terms).not.toContain('uk dependent visa')
    expect(terms).not.toContain('student dependant visa uk')
    expect(terms).not.toContain('marriage based green card timeline')
    expect(terms.filter((t) => /dependent|dependant/.test(t) && !/requirements/.test(t))).toHaveLength(1)
  })
})

describe('shippedOverlap — same intent only', () => {
  const pages: ShippedPage[] = [
    {
      url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-visa-interview-questions-2026/',
      title: 'F-1 Visa Interview Questions (2026)',
      primaryKeyword: 'f-1 visa interview questions',
      status: 'merged',
    },
    {
      url: 'https://legal.yousafeconsultancy.com/ca/express-entry/',
      title: 'Express Entry Canada',
      primaryKeyword: 'express entry canada',
      status: 'merged',
    },
  ]
  const stems = buildShippedStems(pages)

  it('matches paraphrases of a live owner', () => {
    expect(shippedOverlap('F-1 visa interview questions', stems)).toBeTruthy()
    expect(shippedOverlap('f1 visa interview prep', stems)).toBeTruthy()
  })

  it('does not swallow a distinct SERP-intent spoke', () => {
    expect(shippedOverlap('express entry canada calculator', stems)).toBeNull()
  })
})

describe('Ubersuggest Discover — authority-safe plays', () => {
  it('emits a spoke gap for calculator demand on a shipped pillar', () => {
    const briefs = ubersuggestSignalsToDiscover(
      [
        { term: 'express entry canada calculator', impressions: 2715 },
        { term: 'express entry canada', impressions: 660 },
        { term: 'rates final.pdf', impressions: 9000 },
      ],
      { shippedKeywords: ['Express Entry Canada'], limit: 12 },
    )
    const calc = briefs.find((b) => b.topic === 'express entry canada calculator')
    const pillar = briefs.find((b) => b.topic === 'express entry canada')
    expect(calc?.play).toBe('content_gap')
    expect(calc?.coverageKind).toBe('spoke')
    expect(pillar?.play).toBe('refresh')
    expect(briefs.every((b) => !/\.pdf/i.test(b.topic))).toBe(true)
  })
})

describe('authority playbook ranking', () => {
  it('ranks CTR goldmines and BOFU spokes above housekeeping refreshes', () => {
    const harvest = verdictFor({
      topic: 'uk graduate visa',
      play: 'refresh',
      impressions: 2800,
      clicks: 12,
      ctr: 0.004,
      position: 11,
      coverageKind: 'paraphrase',
    })
    const spoke = verdictFor({
      topic: 'express entry canada calculator',
      play: 'content_gap',
      impressions: 2715,
      coverageKind: 'spoke',
      intent: 'commercial',
    })
    const house = verdictFor({
      topic: 'bookkeeping service for llc',
      play: 'refresh',
      impressions: 8,
      clicks: 0,
      position: 48,
      coverageKind: 'paraphrase',
    })
    expect(harvest.move).toBe('harvest_impressions')
    expect(harvest.hideByDefault).toBe(false)
    expect(spoke.move).toBe('fill_spoke')
    expect(house.move).toBe('housekeeping')
    expect(house.hideByDefault).toBe(true)
    expect(harvest.deskScore).toBeGreaterThan(house.deskScore)
    expect(spoke.deskScore).toBeGreaterThan(house.deskScore)
  })

  it('promotes high-demand Express Entry owners as YMYL freshness, not hidden housekeeping', () => {
    const v = verdictFor({
      topic: 'express entry canada calculator',
      play: 'refresh',
      impressions: 2715,
      coverageKind: 'exact',
    })
    expect(v.move).toBe('ymyl_freshness')
    expect(v.hideByDefault).toBe(false)
  })

  it('never recommends a doorway conversion', () => {
    const v = verdictFor({ topic: 'hire immigration lawyer', play: 'content_gap', coverageKind: 'unrelated' })
    expect(v.conversionLine).toMatch(/never the H1/i)
    expect(v.qualityLine).toMatch(/people-first|YMYL|one URL/i)
  })

  it('hides thin TOFU knowledge-corpus gaps but keeps BOFU even at low impressions', () => {
    const thin = verdictFor({
      topic: 'what is a visa',
      play: 'content_gap',
      impressions: 1,
      coverageKind: 'unrelated',
    })
    const bofu = verdictFor({
      topic: 'hire immigration lawyer',
      play: 'content_gap',
      impressions: 8,
      coverageKind: 'unrelated',
    })
    const zero = verdictFor({
      topic: 'what makes a good personal statement',
      play: 'content_gap',
      impressions: 0,
      coverageKind: 'unrelated',
    })
    expect(thin.move).toBe('housekeeping')
    expect(thin.hideByDefault).toBe(true)
    expect(zero.move).toBe('housekeeping')
    expect(zero.hideByDefault).toBe(true)
    expect(bofu.move).toBe('fill_pillar')
    expect(bofu.hideByDefault).toBe(false)
    expect(bofu.conversionLine).toMatch(/never the H1/i)
  })

  it('hides speculative TOFU campus leftovers but keeps MOFU spokes above remaining TOFU pillars', () => {
    const housing = verdictFor({
      topic: 'apartments near portland state university',
      play: 'content_gap',
      impressions: 30,
      clicks: 0,
      ctr: 0,
      position: 33,
      coverageKind: 'unrelated',
    })
    const spoke = verdictFor({
      topic: 'marriage green card timeline',
      play: 'content_gap',
      impressions: 32,
      clicks: 0,
      position: 53,
      coverageKind: 'spoke',
      intent: 'commercial',
    })
    const pillar = verdictFor({
      topic: 'dependent visa uk',
      play: 'content_gap',
      impressions: 97,
      clicks: 0,
      position: 80,
      coverageKind: 'unrelated',
    })
    expect(housing.hideByDefault).toBe(true)
    expect(spoke.hideByDefault).toBe(false)
    expect(spoke.move).toBe('fill_spoke')
    expect(pillar.hideByDefault).toBe(false)
    expect(spoke.deskScore).toBeGreaterThan(pillar.deskScore)
  })

  it('ranks the live persisted-GSC mix with spokes and MOFU above leftover TOFU', () => {
    const ranked = [
      { topic: '"fy27 stk housing rates" pacific pdf', play: 'quick_win', impressions: 39, clicks: 0, ctr: 0, position: 1 },
      { topic: 'apartments near portland state university', play: 'content_gap', impressions: 30, clicks: 0, ctr: 0, position: 33 },
      { topic: 'student insurance comparison', play: 'content_gap', impressions: 78, clicks: 0, ctr: 0, position: 52, intent: 'commercial' },
      { topic: 'marriage green card timeline', play: 'content_gap', impressions: 32, clicks: 0, ctr: 0, position: 53, coverageKind: 'spoke' as const, intent: 'commercial' },
      { topic: 'visa appeal consultant', play: 'content_gap', impressions: 36, clicks: 0, ctr: 0, position: 84, intent: 'transactional' },
      { topic: 'dependent visa uk', play: 'content_gap', impressions: 97, clicks: 0, ctr: 0, position: 80 },
    ]
      .filter((row) => !isJunkQuery(row.topic))
      .map((row) => ({ ...row, ...verdictFor(row) }))
      .filter((row) => !row.hideByDefault)
      .sort((a, b) => b.deskScore - a.deskScore)
    expect(ranked.map((r) => r.topic)).not.toContain('"fy27 stk housing rates" pacific pdf')
    expect(ranked.map((r) => r.topic)).not.toContain('apartments near portland state university')
    expect(ranked[0].topic).not.toBe('dependent visa uk')
    expect(ranked.some((r) => r.topic === 'marriage green card timeline' && r.move === 'fill_spoke')).toBe(true)
    expect(ranked.some((r) => r.topic === 'student insurance comparison' && r.funnel === 'mofu')).toBe(true)
    expect(ranked.some((r) => r.topic === 'visa appeal consultant' && r.funnel === 'bofu')).toBe(true)
  })
})
