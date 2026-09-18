/**
 * P1 measurement integrity — visibility CLASSIFICATION.
 *
 * Raw GSC rows must be preserved and classified into four deterministic
 * buckets: junk, off-mission real demand, deep tail, qualified. Junk is
 * malformed input; off-mission is REAL demand outside the YouSafe mission
 * (campus housing / lifestyle with no immigration-document anchor) — it stays
 * observable in reporting and can never become an action.
 *
 * `classifyGscQuery` keeps its shipped 3-class contract (`eligible` =
 * pre-qualification) so existing callers/tests are unaffected; the visibility
 * split lives beside it and reuses the SAME primitives.
 */
import {
  classifyGscQuery,
  classifyGscVisibility,
  isActionableDemandQuery,
  isJunkQuery,
  isOffMissionDemandQuery,
} from '@/lib/seoFactory/queryNoise'

describe('GSC visibility classification', () => {
  it('keeps malformed rows junk — junk outranks every other bucket', () => {
    const topPosition = { impressions: 2000, position: 3, clicks: 0 }
    expect(classifyGscVisibility('pacific.edu/sites/default/files/rates-2026.pdf', topPosition)).toBe('junk')
    expect(
      classifyGscVisibility(
        '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
        topPosition,
      ),
    ).toBe('junk')
    expect(classifyGscVisibility('yousafe', topPosition)).toBe('junk')
    expect(classifyGscVisibility('', topPosition)).toBe('junk')
    // A leaked document title is junk even though the phrase itself is
    // off-mission — malformed input wins so the pollution story stays honest.
    expect(isOffMissionDemandQuery('stockton room and meal plan rates')).toBe(true)
    expect(classifyGscVisibility('stockton room and meal plan rates', topPosition)).toBe('junk')
  })

  it('separates real-but-off-mission demand from both junk and qualified', () => {
    const row = { impressions: 400, position: 9.8, clicks: 1 }
    expect(isJunkQuery('university of the pacific student housing')).toBe(false)
    // Shipped contract: 'eligible' is pre-qualification, not "on mission".
    expect(classifyGscQuery('university of the pacific student housing', row)).toBe('eligible')
    expect(classifyGscVisibility('university of the pacific student housing', row)).toBe('off_mission')
    expect(classifyGscVisibility('campus dining plan prices', row)).toBe('off_mission')
    expect(classifyGscVisibility('university parking rates', { impressions: 200, position: 12, clicks: 0 })).toBe('off_mission')
  })

  it('keeps on-mission immigration/document demand qualified at any signal strength', () => {
    expect(
      classifyGscVisibility('canada express entry stem category 2026', { impressions: 3288, position: 53, clicks: 15 }),
    ).toBe('qualified')
    expect(classifyGscVisibility('f-1 student housing proof of address', { impressions: 400, position: 9, clicks: 2 })).toBe('qualified')
    expect(classifyGscVisibility('student housing discrimination rights', { impressions: 120, position: 12, clicks: 3 })).toBe('qualified')
  })

  it('keeps deep tail its own bucket and never hides off-mission inside it', () => {
    expect(
      classifyGscVisibility('study permit biometrics appointment ottawa', { impressions: 5, position: 30, clicks: 0 }),
    ).toBe('deep_tail')
    // Same negligible signal, but off-mission-ness is a topical fact, not a
    // signal-strength fact — it must not be laundered into the deep tail.
    expect(
      classifyGscVisibility('student neighborhoods affordability location commute', { impressions: 5, position: 30, clicks: 0 }),
    ).toBe('off_mission')
    // H1: generic process words (application/status/eligibility/checklist/bare
    // permit) must never anchor campus-housing demand into the on-mission
    // buckets — not even at signal strength that would otherwise qualify it.
    const strongSignal = { impressions: 900, position: 8, clicks: 12 }
    expect(classifyGscVisibility('student housing application', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('university dorm move in checklist', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('parking permit application', strongSignal)).toBe('off_mission')
    // Near-variants of campus housing/lifestyle intent must not bypass the
    // boundary merely because they omit the exact phrase `student housing`.
    expect(classifyGscVisibility('university of the pacific housing', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('graduate housing near ubc', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('dormitory availability', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('student dormitory', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('ubc student residence', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('halls of residence', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('residence life at university', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('international student homestay', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('student flatshare near campus', strongSignal)).toBe('off_mission')
    // `opt` is an ordinary verb in campus-life searches. Bare `opt` must not
    // masquerade as Optional Practical Training and re-qualify the row.
    expect(classifyGscVisibility('meal plan opt out', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('student housing opt out form', strongSignal)).toBe('off_mission')
    // Explicit immigration OPT language remains a real mission anchor.
    expect(classifyGscVisibility('stem opt student housing proof of address', strongSignal)).toBe('qualified')
    expect(classifyGscVisibility('optional practical training housing proof of address', strongSignal)).toBe('qualified')
  })

  it('agrees with the action guard: qualified is actionable, off-mission never is', () => {
    const row = { impressions: 400, position: 9, clicks: 1 }
    const offMission = 'university of the pacific student housing'
    expect(classifyGscVisibility(offMission, row)).toBe('off_mission')
    expect(isActionableDemandQuery(offMission)).toBe(false)

    const qualified = 'canada study permit document checklist'
    expect(classifyGscVisibility(qualified, row)).toBe('qualified')
    expect(isActionableDemandQuery(qualified)).toBe(true)
  })

  it('classifies the PR #224 production residual exactly: real campus demand off-mission, fiscal-year artifact junk', () => {
    const strongSignal = { impressions: 900, position: 8, clicks: 12 }
    const residualOffMission = [
      'student rentals near university of south carolina',
      'student rentals near florida international university',
      'student living university of south carolina',
      'international student storage cornell',
      'is warwick safe for international students',
    ]
    for (const term of residualOffMission) {
      expect(isJunkQuery(term)).toBe(false)
      expect(classifyGscVisibility(term, strongSignal)).toBe('off_mission')
    }
    // The quoted Pacific fiscal-year housing-rate row is malformed input, not
    // real demand — junk outranks signal strength.
    expect(classifyGscVisibility('"fy27_stk_housing_rates" pacific', strongSignal)).toBe('junk')
    // Mission/legal anchors keep the same families qualified, not blocked.
    expect(classifyGscVisibility('f-1 student rentals near university of south carolina', strongSignal)).toBe('qualified')
    expect(classifyGscVisibility('student housing discrimination rights', strongSignal)).toBe('qualified')
  })

  it('keeps the tightened place/activity-safety and tenancy boundaries out of off_mission (PR #224 review)', () => {
    const row = { impressions: 900, position: 8, clicks: 12 }
    // Place safety stays off_mission.
    expect(classifyGscVisibility('is warwick safe for international students', row)).toBe('off_mission')
    // Activity-safety mission questions are not campus lifestyle AND are
    // exempt from the pasted-text guard (final review finding): they qualify
    // at their natural length.
    for (const term of [
      'is it safe for international students to work in the uk',
      'is it safe for international students to study in canada',
      'is it safe for international students to travel while on a visa',
    ]) {
      expect(isOffMissionDemandQuery(term)).toBe(false)
      expect(classifyGscVisibility(term, row)).toBe('qualified')
    }
    expect(classifyGscVisibility('is it safe for international students to work', row)).toBe('qualified')
    expect(classifyGscVisibility('is it safe for international students to study', row)).toBe('qualified')
    // Tenancy instruments are qualified legal intent.
    for (const term of [
      'student rental agreement',
      'student rent agreement',
      'student rental deposit',
      'student security deposit rights',
    ]) {
      expect(classifyGscVisibility(term, row)).toBe('qualified')
    }
    // Bounded near-campus variants are off_mission, never junk.
    for (const term of [
      'student rent near university',
      'rooms near university campus',
      'international student self storage',
    ]) {
      expect(isJunkQuery(term)).toBe(false)
      expect(classifyGscVisibility(term, row)).toBe('off_mission')
    }
  })

  it('classifies the spaced self-brand query as junk while prose containing "you safe" stays real demand', () => {
    const strongSignal = { impressions: 1200, position: 2, clicks: 0 }
    // PR #224 production proof: `you safe` reached /opportunities/score as an
    // actionable opportunity although the run-together brand forms were junk.
    expect(isJunkQuery('you safe')).toBe(true)
    expect(classifyGscVisibility('you safe', strongSignal)).toBe('junk')
    expect(classifyGscVisibility('you safe consultancy', strongSignal)).toBe('junk')
    // Exact-term matching only — prose keeps its real classification. The full
    // 9-word sentence exceeds the unrelated >8-word pasted-text guard, so the
    // brand boundary is proved on the topic-level guard and on a
    // word-count-safe variant.
    expect(isJunkQuery('is warwick safe for international students')).toBe(false)
    expect(classifyGscVisibility('is warwick safe for international students', strongSignal)).toBe('off_mission')
    expect(isOffMissionDemandQuery('are you safe to travel on a student visa')).toBe(false)
    expect(classifyGscVisibility('are you safe to travel on a visa', { impressions: 400, position: 9, clicks: 1 })).toBe(
      'qualified',
    )
    // The PR #224 residual classifications are unchanged.
    expect(classifyGscVisibility('"fy27_stk_housing_rates" pacific', strongSignal)).toBe('junk')
    expect(classifyGscVisibility('student rentals near university of south carolina', strongSignal)).toBe('off_mission')
    expect(classifyGscVisibility('f-1 student rentals near university of south carolina', strongSignal)).toBe('qualified')
  })

  it('classifies bounded self-brand navigational forms as junk while brand-like prose stays qualified', () => {
    const strongSignal = { impressions: 900, position: 2, clicks: 0 }
    // Review finding: the exact spaced brand was junk, but `you safe login` /
    // `you safe portal` / `you safe consultancy london` still classified
    // qualified and reached the action surface.
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
      expect(classifyGscVisibility(term, strongSignal)).toBe('junk')
    }
    // Prose that only starts with the brand words keeps its real bucket.
    expect(isJunkQuery('you safe to travel on a student visa')).toBe(false)
    expect(
      classifyGscVisibility('you safe to travel on a student visa', { impressions: 300, position: 9, clicks: 1 }),
    ).toBe('qualified')
  })

  it('qualifies the `on opt` status question without making bare `opt` a mission anchor', () => {
    const row = { impressions: 400, position: 7, clicks: 3 }
    // Review finding: `on OPT` is unambiguous immigration status.
    expect(classifyGscVisibility('is it safe for international students on opt', row)).toBe('qualified')
    expect(classifyGscVisibility('is it safe for international students while on opt', row)).toBe('qualified')
    // Bare `opt` is not an anchor: dining opt-out stays off-mission, and
    // campus lifestyle with no immigration/legal anchor stays off-mission.
    expect(classifyGscVisibility('meal plan opt out', row)).toBe('off_mission')
    // Diff review finding: the anchor must not be read out of the ordinary verb
    // in "opt out" / "opt-in" process demand.
    expect(classifyGscVisibility('meal plan information on opt out', row)).toBe('off_mission')
    expect(classifyGscVisibility('meal plan details on opt-out', row)).toBe('off_mission')
    expect(classifyGscVisibility('student housing details on opt-in', row)).toBe('off_mission')
    expect(classifyGscVisibility('student housing details on opt in', row)).toBe('off_mission')
    // Final review finding: living-cost questions are NOT campus lifestyle —
    // only housing/lodging context makes `student living` off-mission.
    expect(classifyGscVisibility('student living expenses canada', row)).toBe('qualified')
    expect(classifyGscVisibility('student living university of south carolina', row)).toBe('off_mission')
  })
})
