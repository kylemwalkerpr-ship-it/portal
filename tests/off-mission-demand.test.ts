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

/**
 * H1 — generic process words are NOT mission anchors.
 *
 * `application`, `application deadline`, `status`, `eligibility`,
 * `requirements`, `move in checklist` and bare `permit` describe the PROCESS of
 * campus housing / dining / parking demand. They used to satisfy the mission
 * anchor regex and launder off-mission demand into the factory as if it were
 * immigration intent. Only genuinely topical anchors (immigration / visa /
 * F-1 / I-20 / SEVIS / study-or-work permit / PGWP / Express Entry / PNP /
 * permanent residence / sponsorship / university admission as such, or
 * tenancy-legal rights) may do that.
 */
describe('generic process words are never mission anchors (H1)', () => {
  const processOffMission = [
    'student housing application',
    'dorm application deadline',
    'meal plan status',
    'student housing eligibility requirements',
    'university dorm move in checklist',
    'student apartments application',
    'parking permit application',
  ]

  it('keeps campus-housing process demand off-mission but observable (not junk)', () => {
    for (const term of processOffMission) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(true)
      expect(isActionableDemandQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(true)
    }
  })

  it('still lets genuinely topical anchors qualify housing-adjacent demand', () => {
    const topical = [
      'f-1 student housing proof of address',
      'student housing discrimination rights',
      'canada study permit housing documents',
      'student visa accommodation evidence',
      'international student lease break rights',
      'university admission requirements for international students',
      'pgwp permanent residence student housing application',
    ]
    for (const term of topical) {
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
  })

  it('keeps the process words from rescuing a bare off-mission row in the signal filter', () => {
    const signals = [
      { term: 'student housing application', impressions: 900 },
      { term: 'parking permit application', impressions: 300 },
      { term: 'meal plan status', impressions: 250 },
      { term: 'f-1 student housing proof of address', impressions: 120 },
    ]
    expect(filterActionableDemandSignals(signals).map((s) => s.term)).toEqual([
      'f-1 student housing proof of address',
    ])
  })
})
