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
})
