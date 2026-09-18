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
 * PR #224 production proof — SELF-BRAND LEAK.
 *
 * The live `/api/content-studio/opportunities/score` response included the
 * estate's own brand query `you safe` as an actionable opportunity. Only the
 * run-together forms (`yousafe` / `yousafeconsultancy`) were junk, so the
 * spaced brand fell through every rule. The shared brand boundary now also
 * recognises the exact spaced forms — and must NOT recognise ordinary prose
 * that merely contains the words.
 */
describe('spaced self-brand navigational junk (PR #224 brand leak)', () => {
  it('treats the exact spaced brand forms as junk, never as demand', () => {
    for (const term of ['you safe', 'you safe consultancy']) {
      expect(isJunkQuery(term)).toBe(true)
      expect(isJunkTopic(term)).toBe(true)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(false)
    }
  })

  it('never junkes prose that merely contains "you safe" or "safe"', () => {
    // `isJunkTopic` has no word-count rule, so it isolates the brand boundary
    // for the full 9-word sentence; the word-count-safe variant proves the
    // same on the query guard and the action guard.
    expect(isJunkTopic('are you safe to travel on a student visa')).toBe(false)
    expect(isOffMissionDemandQuery('are you safe to travel on a student visa')).toBe(false)
    expect(isJunkQuery('are you safe to travel on a visa')).toBe(false)
    expect(isActionableDemandQuery('are you safe to travel on a visa')).toBe(true)
    // Place-safety demand keeps its existing off-mission classification: real
    // demand, observable, non-actionable — never junk because it says "safe".
    expect(isJunkQuery('is warwick safe for international students')).toBe(false)
    expect(isJunkTopic('is warwick safe for international students')).toBe(true)
    expect(isOffMissionDemandQuery('is warwick safe for international students')).toBe(true)
  })

  it('treats BOUNDED self-brand navigational forms as junk, never as demand', () => {
    // Review finding: the exact spaced brand was fixed, but `you safe login` /
    // `you safe portal` / `you safe consultancy london` still scored. The
    // shared boundary now covers the bounded navigational forms while leaving
    // brand-like prose alone.
    for (const term of [
      'you safe login',
      'you safe reviews',
      'you safe app',
      'you safe portal',
      'you safe contact',
      'you safe consultancy london',
      'you safe login page',
      'you safe app store',
      'you safe official website',
    ]) {
      expect(isJunkQuery(term)).toBe(true)
      expect(isJunkTopic(term)).toBe(true)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(false)
    }
    // Bounded, not `^you safe\b.*`: prose that starts with the brand words
    // stays real demand, and place-safety keeps its off-mission class.
    expect(isJunkTopic('you safe to travel on a student visa')).toBe(false)
    expect(isActionableDemandQuery('you safe to travel on a student visa')).toBe(true)
    expect(isJunkQuery('how do you safely apply for a visa')).toBe(false)
    expect(isActionableDemandQuery('how do you safely apply for a visa')).toBe(true)
    expect(isOffMissionDemandQuery('is warwick safe for international students')).toBe(true)
  })
})

/**
 * Review finding — the unambiguous `on OPT` status phrase is immigration
 * intent, while bare `opt` is NOT a mission anchor (`meal plan opt out` is
 * campus dining demand, and `opt out` is an ordinary English verb phrase).
 * Only the anchored `on opt` form qualifies.
 */
describe('OPT mission anchor: `on opt` only, never bare `opt` (PR #224 review)', () => {
  it('keeps the unambiguous `on opt` status question on-mission and actionable', () => {
    const term = 'is it safe for international students on opt'
    expect(isJunkQuery(term)).toBe(false) // 8 words: under the pasted-text guard
    expect(isOffMissionDemandQuery(term)).toBe(false)
    expect(isActionableDemandQuery(term)).toBe(true)
    expect(isJunkTopic(term)).toBe(false)
    expect(isOffMissionDemandQuery('is student housing covered on opt')).toBe(false)
    // The same status phrase at natural question length (9 words) must also
    // survive the pasted-text guard: `on opt` is an explicit immigration
    // anchor, and bare `opt` remains a non-anchor.
    const whileOnOpt = 'is it safe for international students while on opt'
    expect(isJunkQuery(whileOnOpt)).toBe(false)
    expect(isOffMissionDemandQuery(whileOnOpt)).toBe(false)
    expect(isActionableDemandQuery(whileOnOpt)).toBe(true)
  })

  it('does not reintroduce bare `opt` as a generic mission anchor', () => {
    // Dining process demand stays off-mission: "opt out" is not "on OPT".
    expect(isJunkQuery('meal plan opt out')).toBe(false)
    expect(isOffMissionDemandQuery('meal plan opt out')).toBe(true)
    expect(isActionableDemandQuery('meal plan opt out')).toBe(false)
    expect(isOffMissionDemandQuery('student housing opt out form')).toBe(true)
  })

  it('does not let the `on opt` anchor rescue opt-out / opt-in process forms', () => {
    // Diff review finding: `on\s+opt` matched the ordinary verb inside
    // "opt out" / "opt-in", so campus dining/housing PROCESS queries were
    // laundered back into the mission. `on OPT` is the immigration status
    // phrase and must reject a following opt-out / opt-in form (hyphenated,
    // spaced, or mixed).
    const rescuedByAnchor = [
      'meal plan information on opt out',
      'meal plan details on opt-out',
      'student housing details on opt-in',
      'student housing details on opt in',
    ]
    for (const term of rescuedByAnchor) {
      expect(isJunkQuery(term)).toBe(false) // real demand: still observable
      expect(isOffMissionDemandQuery(term)).toBe(true)
      expect(isActionableDemandQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(true)
    }
    // The status phrase itself keeps its anchor, and a housing question ABOUT
    // the status stays on-mission.
    expect(isOffMissionDemandQuery('is it safe for international students on opt')).toBe(false)
    expect(isActionableDemandQuery('is it safe for international students on opt')).toBe(true)
    expect(isActionableDemandQuery('is it safe for international students while on opt')).toBe(true)
    expect(isOffMissionDemandQuery('is student housing covered on opt')).toBe(false)
    // Bare dining opt-out is unchanged (no `on opt` at all).
    expect(isOffMissionDemandQuery('meal plan opt out')).toBe(true)
    expect(isActionableDemandQuery('meal plan opt out')).toBe(false)
  })

  it('keeps cost/budget living questions out of the campus-lifestyle family', () => {
    // Final review finding: `student living` was a bare family token, so the
    // living-COST family (mission-relevant: proof of funds / budgeting) was
    // treated as campus lifestyle. Only housing/lodging context may do that.
    const livingCosts = [
      'student living expenses canada',
      'student living costs uk',
      'student living budget canada',
    ]
    for (const term of livingCosts) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
    // Housing/lodging context still belongs to the off-mission family.
    expect(isOffMissionDemandQuery('student living university of south carolina')).toBe(true)
    expect(isActionableDemandQuery('student living university of south carolina')).toBe(false)
    expect(isOffMissionDemandQuery('student living accommodation costs')).toBe(true)
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

/**
 * PR #224 production proof — residual non-qualified GSC queries that still
 * reached the opportunity score ACTION surface as `qualified`.
 *
 * These are real campus/lifestyle searches, so they stay observable as
 * off-mission demand (never junk); they simply must not become an action.
 * Mission/legal anchors still outrank the family.
 */
describe('production residual campus/lifestyle demand (PR #224 follow-up)', () => {
  const residualOffMission = [
    'student rentals near university of south carolina',
    'student rentals near florida international university',
    'student living university of south carolina',
    'international student storage cornell',
    'is warwick safe for international students',
  ]

  it('classifies the residual rows off-mission and non-actionable, but never junk', () => {
    for (const term of residualOffMission) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(true)
      expect(isActionableDemandQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(true)
    }
  })

  it('keeps the same families actionable when a mission/legal anchor is present', () => {
    const anchored = [
      'f-1 student rentals near university of south carolina',
      'study permit student living costs',
      'student visa storage document requirements',
      'is it safe to report housing discrimination',
      'international student lease break rights',
      'tenant rights student housing warwick',
    ]
    for (const term of anchored) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
  })
})

/**
 * PR #224 follow-up review — the campus-safety family was too coarse.
 *
 * "is warwick safe for international students" is place-safety (off-mission),
 * but the same surface phrase with an infinitive purpose clause is a genuine
 * mission question. The boundary is tightened in the campus-safety pattern
 * itself — bare `work` / `study` are deliberately NOT added as mission anchors,
 * because they are ordinary words in campus-lifestyle demand too.
 */
describe('campus-safety boundary: place safety vs activity safety (PR #224 review)', () => {
  it('keeps place-safety questions off-mission', () => {
    expect(isOffMissionDemandQuery('is warwick safe for international students')).toBe(true)
    expect(isOffMissionDemandQuery('is warwick campus safe for international students')).toBe(true)
  })

  it('never classifies activity-safety mission questions as campus lifestyle', () => {
    const activitySafety = [
      'is it safe for international students to work in the uk',
      'is it safe for international students to study in canada',
      'is it safe for international students to travel while on a visa',
    ]
    for (const term of activitySafety) {
      expect(isOffMissionDemandQuery(term)).toBe(false)
      // These are natural long-tail questions, not pasted text: the
      // pasted-text guard must not junk them.
      expect(isJunkQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
    // No generic `work`/`study` anchor is involved: the campus-safety pattern
    // itself no longer matches.
    const actionable = [
      'is it safe for international students to work',
      'is it safe for international students to study',
    ]
    for (const term of actionable) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
  })
})

/**
 * PR #224 follow-up review — tenancy instruments are legitimate legal intent.
 * "rental agreement" / "rental deposit" are narrow anchored tenancy phrases,
 * not a licence for campus demand in general.
 */
describe('tenancy instruments are legal intent, not campus lifestyle (PR #224 review)', () => {
  const tenancy = [
    'student rental agreement',
    'student rent agreement',
    'student rental deposit',
    'student security deposit rights',
  ]

  it('keeps ordinary tenancy/legal phrases out of the off-mission family', () => {
    for (const term of tenancy) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
  })
})

/**
 * PR #224 follow-up review — bounded near-campus variants.
 *
 * `student rent near university`, `rooms near university campus` and
 * `international student self storage` are unambiguous campus-lifestyle
 * demand, but bare `rent` / `room` / `storage` must stay ordinary keywords:
 * only an explicit near-campus frame (or `self`/`student storage`) enters the
 * off-mission family.
 */
describe('bounded near-campus variants stay off-mission without universal tokens (PR #224 review)', () => {
  const nearCampus = [
    'student rent near university',
    'rooms near university campus',
    'international student self storage',
  ]

  it('classifies explicit near-campus demand off-mission, never junk', () => {
    for (const term of nearCampus) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isOffMissionDemandQuery(term)).toBe(true)
      expect(isActionableDemandQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(true)
    }
  })

  it('keeps bare rent/room/storage out of the family without a campus frame', () => {
    const ordinary = [
      'rent increase notice period',
      'room cleaning checklist',
      'storage locker rental prices',
    ]
    for (const term of ordinary) {
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
  })
})
