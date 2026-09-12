import {
  filterActionableDemandSignals,
  isActionableDemandQuery,
  isJunkQuery,
  isJunkTopic,
  isOffMissionDemandQuery,
} from '@/lib/seoFactory/queryNoise'

describe('off-mission demand guard', () => {
  it('separates real-but-off-mission campus lifestyle demand from junk', () => {
    const term = 'university of the pacific student housing'
    expect(isJunkQuery(term)).toBe(false)
    expect(isOffMissionDemandQuery(term)).toBe(true)
    expect(isActionableDemandQuery(term)).toBe(false)
  })

  it('suppresses the campus lifestyle families that polluted Search Console', () => {
    expect(isOffMissionDemandQuery('stockton room and meal plan rates')).toBe(true)
    expect(isOffMissionDemandQuery('student neighborhoods affordability location commute')).toBe(true)
    expect(isOffMissionDemandQuery('campus dining plan prices')).toBe(true)
    expect(isOffMissionDemandQuery('university parking rates')).toBe(true)
  })

  it('keeps immigration/document intent even when housing is mentioned', () => {
    expect(isOffMissionDemandQuery('f-1 student housing proof of address')).toBe(false)
    expect(isOffMissionDemandQuery('canada study permit housing documents')).toBe(false)
    expect(isOffMissionDemandQuery('student visa accommodation evidence')).toBe(false)
  })

  it('keeps tenancy and anti-discrimination legal intent', () => {
    expect(isOffMissionDemandQuery('student housing discrimination rights')).toBe(false)
    expect(isOffMissionDemandQuery('international student lease break rights')).toBe(false)
    expect(isOffMissionDemandQuery('tenant eviction rights for students')).toBe(false)
  })

  it('makes off-mission topics non-generatable without hiding them as malformed junk', () => {
    expect(isJunkTopic('university of the pacific student housing')).toBe(true)
    expect(isJunkTopic('stockton room and meal plan rates')).toBe(true)
    expect(isJunkTopic('f-1 student housing proof of address')).toBe(false)
  })

  it('filters actionable engine signals while retaining on-mission demand', () => {
    const signals = [
      { term: 'stockton room and meal plan rates', impressions: 1200 },
      { term: 'university of the pacific student housing', impressions: 900 },
      { term: 'canada study permit document checklist', impressions: 400 },
      { term: 'student housing discrimination rights', impressions: 120 },
      { term: '"rates final.pdf" pacific.edu/sites/default/files', impressions: 90 },
    ]

    expect(filterActionableDemandSignals(signals).map((s) => s.term)).toEqual([
      'canada study permit document checklist',
      'student housing discrimination rights',
    ])
  })
})
