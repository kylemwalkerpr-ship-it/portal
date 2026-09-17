/**
 * P1 measurement integrity — gscMix qualified vs raw off-mission visibility.
 *
 * Additive contract:
 *   - `totals` stays RAW (pollution included) so the mix reconciles;
 *   - `qualified` excludes junk + off-mission + deep tail and is the ONLY
 *     aggregate plays / strike-distance / demand scoring may read;
 *   - `offMission` carries impressions + share (observable, non-actionable);
 *   - `eligible` is kept as a documented compatibility alias for `qualified`.
 *
 * No live GSC calls — rows are injected.
 */
import { computeGscMix } from '@/lib/seoFactory/gscMix'
import { scoreMaster } from '@/lib/seoFactory/masterEngine'
import { scoreTopicAuthority } from '@/lib/seoFactory/authorityScoring'
import { computeRankingScore } from '@/lib/seoEngine/rankingModel'

// ── Fixtures ──────────────────────────────────────────────────────────────────
/** Real demand that is NOT the YouSafe mission (campus housing / lifestyle). */
const OFF_MISSION_ROWS = [
  { term: 'university of the pacific student housing', impressions: 900, clicks: 0, ctr: 0, position: 9.8 },
  { term: 'campus dining plan prices', impressions: 300, clicks: 0, ctr: 0, position: 6 },
  { term: 'university parking rates', impressions: 200, clicks: 0, ctr: 0, position: 12 },
  // Deep + high-volume off-mission row: pre-P1 this played `deep_demand_build`.
  { term: 'university of the pacific dorms', impressions: 500, clicks: 0, ctr: 0, position: 30 },
  { term: 'student neighborhoods affordability location commute', impressions: 5, clicks: 0, ctr: 0, position: 30 },
]

const JUNK_ROWS = [
  {
    term: '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
    impressions: 2000,
    clicks: 0,
    ctr: 0,
    position: 3,
  },
]

const QUALIFIED_ROWS = [
  { term: 'canada express entry stem category 2026', impressions: 3288, clicks: 15, ctr: 0.0046, position: 53 },
  // Strike distance + click-proven on-mission row that MUST keep playing.
  { term: 'canada study permit processing time', impressions: 248, clicks: 4, ctr: 0.016, position: 10.2 },
]

const MIXED_ROWS = [...JUNK_ROWS, ...OFF_MISSION_ROWS, ...QUALIFIED_ROWS]

const OFF_MISSION_IMPRESSIONS = OFF_MISSION_ROWS.reduce((a, r) => a + r.impressions, 0)
const JUNK_IMPRESSIONS = JUNK_ROWS.reduce((a, r) => a + r.impressions, 0)
const QUALIFIED_IMPRESSIONS = QUALIFIED_ROWS.reduce((a, r) => a + r.impressions, 0)
const RAW_IMPRESSIONS = MIXED_ROWS.reduce((a, r) => a + r.impressions, 0)

const BASE_INPUT = {
  topic: 'canada study permit processing time',
  primaryKeyword: 'canada study permit processing time',
  content:
    'Canada study permit processing time guide. This page explains current IRCC timelines, biometrics, and required documents for 2026 applicants.',
}

describe('computeGscMix — raw vs qualified vs off-mission', () => {
  it('keeps totals raw, excludes off-mission from qualified, and reports offMission share', () => {
    const mix = computeGscMix({ queryRows: MIXED_ROWS, windowDays: 90 })

    expect(mix.source).toBe('rows')
    expect(mix.windowDays).toBe(90)
    expect(mix.rowCount).toBe(MIXED_ROWS.length)

    // totals stays RAW.
    expect(mix.totals.impressions).toBe(RAW_IMPRESSIONS)

    // qualified = on-mission, signal-bearing rows only.
    expect(mix.qualified.impressions).toBe(QUALIFIED_IMPRESSIONS)
    expect(mix.qualified.clicks).toBe(19)
    expect(mix.qualified.rowCount).toBe(2)

    // off-mission demand stays observable with its own impressions + share.
    expect(mix.offMission.impressions).toBe(OFF_MISSION_IMPRESSIONS)
    expect(mix.offMission.share).toBeCloseTo(OFF_MISSION_IMPRESSIONS / RAW_IMPRESSIONS, 4)
    expect(mix.offMission.rowCount).toBe(OFF_MISSION_ROWS.length)

    expect(mix.junk.impressions).toBe(JUNK_IMPRESSIONS)
    expect(mix.junk.share).toBeCloseTo(JUNK_IMPRESSIONS / RAW_IMPRESSIONS, 4)
    expect(mix.deepTail.impressions).toBe(0)

    // Every raw impression lands in exactly one bucket.
    expect(
      mix.qualified.impressions + mix.offMission.impressions + mix.junk.impressions + mix.deepTail.impressions,
    ).toBe(mix.totals.impressions)

    expect(
      mix.qualified.share + mix.offMission.share + mix.junk.share + mix.deepTail.share,
    ).toBeCloseTo(1, 4)
  })

  it('keeps eligible as a documented compatibility alias for qualified', () => {
    const mix = computeGscMix({ queryRows: MIXED_ROWS })
    expect(mix.eligible.impressions).toBe(mix.qualified.impressions)
    expect(mix.eligible.clicks).toBe(mix.qualified.clicks)
    expect(mix.eligible.ctr).toBeCloseTo(mix.qualified.ctr, 8)
    expect(mix.eligible.position).toBeCloseTo(mix.qualified.position, 8)
  })

  it('never lets an off-mission row become a play or strike-distance URL', () => {
    const mix = computeGscMix({ queryRows: MIXED_ROWS, windowDays: 90 })
    const offMissionTerms = OFF_MISSION_ROWS.map((r) => r.term)
    const isOffMission = (value: string) => offMissionTerms.some((t) => value.includes(t))

    expect(mix.strikeDistance).toHaveLength(1)
    expect(mix.strikeDistance[0].url).toBe('canada study permit processing time')
    expect(mix.strikeDistance.every((s) => !isOffMission(s.url))).toBe(true)
    // The qualified deep row still plays; nothing off-mission may become a play.
    expect(mix.recommendedPlays.some((p) => p.play === 'deep_demand_build')).toBe(true)
    expect(mix.recommendedPlays.every((p) => !isOffMission(`${p.url || ''}${p.term || ''}`))).toBe(true)
  })

  it('keeps the aggregate-only pass-through contract for callers with no breakdown', () => {
    const mix = computeGscMix({ impressions: 5000, clicks: 20, ctr: 0.004, position: 31 })
    expect(mix.source).toBe('aggregate')
    expect(mix.totals.impressions).toBe(5000)
    expect(mix.qualified.impressions).toBe(5000)
    expect(mix.eligible.impressions).toBe(5000)
    expect(mix.offMission.impressions).toBe(0)
    expect(mix.offMission.share).toBe(0)
    expect(mix.junk.share).toBe(0)
    expect(mix.deepTail.share).toBe(0)
    expect(mix.rowCount).toBe(0)
  })
})

describe('demand consumers never count off-mission impressions', () => {
  const offMissionOnlyGsc = {
    impressions: OFF_MISSION_IMPRESSIONS,
    clicks: 0,
    ctr: 0,
    position: 10,
    queryRows: OFF_MISSION_ROWS,
  }

  it('rankingModel demand treats an off-mission-only property as no demand', () => {
    const offMission = computeRankingScore({ topic: 'canada study permit processing time', gsc: offMissionOnlyGsc })
    const noGsc = computeRankingScore({ topic: 'canada study permit processing time' })

    expect(offMission.families.demand.score).toBe(noGsc.families.demand.score)
    expect(offMission.families.demand.reasons.join(' ')).toMatch(/No GSC demand observed/i)
  })

  it('Master Engine SERP/serpMix reports off-mission separately and recommends nothing from it', () => {
    const report = scoreMaster({ ...BASE_INPUT, gsc: offMissionOnlyGsc })

    expect(report.gscMix.totals.impressions).toBe(OFF_MISSION_IMPRESSIONS)
    expect(report.gscMix.qualified.impressions).toBe(0)
    expect(report.gscMix.eligible.impressions).toBe(0)
    expect(report.gscMix.offMission.impressions).toBe(OFF_MISSION_IMPRESSIONS)
    expect(report.gscMix.offMission.share).toBe(1)

    const serpRecs = report.recommendations.filter((r) => r.subsystem === 'serp')
    expect(serpRecs.some((r) => /fix ctr/i.test(r.action))).toBe(false)
    expect(serpRecs.some((r) => /improve eligible rank/i.test(r.action))).toBe(false)
  })

  it('authorityScoring demand ignores off-mission rows', () => {
    const term = 'canada study permit processing time'
    const offMission = scoreTopicAuthority({
      term,
      impressions: OFF_MISSION_IMPRESSIONS,
      clicks: 0,
      ctr: 0,
      position: 10,
      queryRows: OFF_MISSION_ROWS,
    })
    const qualifiedSameVolume = scoreTopicAuthority({
      term,
      impressions: OFF_MISSION_IMPRESSIONS,
      clicks: 0,
      ctr: 0,
      position: 10,
    })

    expect(offMission.demand).toBeLessThan(qualifiedSameVolume.demand)
  })
})
