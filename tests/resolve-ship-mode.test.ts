/**
 * resolve-ship-mode — Slice A1 regression tests for the SHARED ship-mode +
 * withhold closer (lib/seoFactory/resolveShipMode.ts) used by BOTH pipelines
 * (pipeline.ts JSON + pipelineStream.ts SSE).
 *
 * Proves:
 *   1. requested 'pr' is never quality-withheld (first-gate skip).
 *   2. merge request with failing quality, depth floor met, score ≥ 40 and no
 *      ownership blockers falls back to a review PR — the unified PR-fallback
 *      floor (stream's 40; JSON's drifted 30 is deleted).
 *   3. merge request with thin content is hard-held ('none' + gateHold).
 *   4. finalizeShipError never overwrites a specific ship-time error
 *      (Content-topic mismatch / path mismatch / Ship refused).
 *   5. finalizeShipError only fills the generic "Ship withheld · audit …"
 *      string when nothing specific went wrong AND the ship actually parked
 *      (shipMode === 'none').
 */
import {
  applyShipWithhold,
  finalizeShipError,
  resolveShipMode,
} from '../lib/seoFactory/resolveShipMode'
import { meetsDepthFloor, meetsShipQuality, type SeoFactoryAudit } from '../lib/seoFactory/audit'
import type { OwnerPlan } from '../lib/seoFactory/ownership'

function makeAudit(opts: {
  score: number
  wordCount: number
  humanScore?: number
  thin?: boolean
  blockers?: string[]
}): SeoFactoryAudit {
  const blockers: SeoFactoryAudit['blockers'] = []
  if (opts.thin) {
    blockers.push({
      code: 'word_count',
      severity: 'blocker',
      message: 'Word count below production floor',
    })
  }
  for (const code of opts.blockers || []) {
    blockers.push({ code, severity: 'blocker', message: `${code} blocker` })
  }
  return {
    score: opts.score,
    grade: opts.score >= 90 ? 'A' : opts.score >= 80 ? 'B' : opts.score >= 70 ? 'C' : opts.score >= 55 ? 'D' : 'F',
    blockers,
    warnings: [],
    passes: [],
    indexableRecommended: false,
    llmsRecommended: false,
    wordCount: opts.wordCount,
    humanScore: opts.humanScore ?? (blockers.length === 0 ? 80 : 40),
    primaryKeyword: 'test keyword',
    qualitySummary: '',
  } as unknown as SeoFactoryAudit
}

function makePlan(blockers: string[] = []): OwnerPlan {
  return {
    matched: null,
    matchScore: 0.7,
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/test/page.tsx',
    canonicalUrl: 'https://caseworks.com/test',
    indexable: true,
    action: '',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers,
    ymy: true,
    routingSource: 'content_type_default',
  } as unknown as OwnerPlan
}

describe('resolveShipMode', () => {
  it("requested 'merge' without ownership blockers stays merge", () => {
    expect(resolveShipMode('merge', makeAudit({ score: 90, wordCount: 2000 }), makePlan([]))).toBe('merge')
  })

  it("requested 'merge' with ownership blockers downgrades to pr", () => {
    expect(
      resolveShipMode(
        'merge',
        makeAudit({ score: 90, wordCount: 2000 }),
        makePlan(['ownership blocked_on_supply']),
      ),
    ).toBe('pr')
  })
})

describe('applyShipWithhold', () => {
  it("requested 'pr' + failing quality → still pr, no gateHold", () => {
    const audit = makeAudit({ score: 40, wordCount: 900, humanScore: 40, blockers: ['ai_slop'] })
    const plan = makePlan([])
    // Fixture really fails the quality gate (non-depth blocker) but keeps depth.
    expect(meetsShipQuality(audit)).toBe(false)
    expect(meetsDepthFloor(audit)).toBe(true)

    expect(resolveShipMode('pr', audit, plan)).toBe('pr')
    const r = applyShipWithhold({ requested: 'pr', shipMode: 'pr', audit, plan, minAudit: 65 })
    expect(r.shipMode).toBe('pr')
    expect(r.gateHold).toBeNull()
  })

  it("requested 'merge' + failing quality + depth ok + score ≥ 40 + no plan blockers → pr fallback, no gateHold", () => {
    const audit = makeAudit({ score: 45, wordCount: 1200, humanScore: 40, blockers: ['ai_slop'] })
    const plan = makePlan([])
    expect(meetsShipQuality(audit)).toBe(false)
    expect(meetsDepthFloor(audit)).toBe(true)
    expect(resolveShipMode('merge', audit, plan)).toBe('merge')

    const r = applyShipWithhold({ requested: 'merge', shipMode: 'merge', audit, plan, minAudit: 65 })
    expect(r.shipMode).toBe('pr')
    expect(r.gateHold).toBeNull()
  })

  it("requested 'merge' + failing quality + score below unified floor (e.g. 35) → hard hold", () => {
    const audit = makeAudit({ score: 35, wordCount: 1200, humanScore: 40, blockers: ['ai_slop'] })
    const plan = makePlan([])
    expect(meetsShipQuality(audit)).toBe(false)
    expect(meetsDepthFloor(audit)).toBe(true)

    const r = applyShipWithhold({ requested: 'merge', shipMode: 'merge', audit, plan, minAudit: 65 })
    expect(r.shipMode).toBe('none')
    expect(r.gateHold).not.toBeNull()
  })

  it("requested 'merge' + thin content → none + gateHold", () => {
    const audit = makeAudit({ score: 35, wordCount: 300, thin: true })
    const plan = makePlan([])
    expect(meetsDepthFloor(audit)).toBe(false)
    expect(resolveShipMode('merge', audit, plan)).toBe('merge')

    const r = applyShipWithhold({ requested: 'merge', shipMode: 'merge', audit, plan, minAudit: 65 })
    expect(r.shipMode).toBe('none')
    expect(r.gateHold).not.toBeNull()
  })

  it("requested 'merge' + quality ok but score < minAudit ≥ 50 → review PR, no gateHold", () => {
    const audit = makeAudit({ score: 55, wordCount: 2000 })
    const plan = makePlan([])
    expect(meetsShipQuality(audit)).toBe(true)

    const r = applyShipWithhold({ requested: 'merge', shipMode: 'merge', audit, plan, minAudit: 65 })
    expect(r.shipMode).toBe('pr')
    expect(r.gateHold).toBeNull()
  })
})

describe('finalizeShipError', () => {
  it("does not overwrite an existing 'Content-topic mismatch' error", () => {
    const audit = makeAudit({ score: 90, wordCount: 1500 })
    const specific =
      'Content-topic mismatch: primary keyword "canada express entry" not found in content'
    const r = finalizeShipError({ shipMode: 'merge', shipError: specific, gateHold: null, audit })
    expect(r).toBe(specific)

    // Even when the run also parked the ship, the specific error survives.
    const r2 = finalizeShipError({
      shipMode: 'none',
      shipError: specific,
      gateHold: 'Ship withheld (quality/depth blockers)',
      audit,
    })
    expect(r2).toBe(specific)
  })

  it("does not overwrite a 'Ship refused' error thrown by shipContent", () => {
    const audit = makeAudit({ score: 90, wordCount: 1500 })
    const refused = 'Ship refused: CTAPanel headline is empty'
    const r = finalizeShipError({ shipMode: 'merge', shipError: refused, gateHold: null, audit })
    expect(r).toBe(refused)
  })

  it("fills generic withhold only when shipMode is 'none' and shipError is empty", () => {
    const audit = makeAudit({ score: 45, wordCount: 800 })
    const r = finalizeShipError({ shipMode: 'none', shipError: null, gateHold: null, audit })
    expect(r).toMatch(/Ship withheld · audit 45 · words 800/)

    // Not parked → never invent a withhold message.
    expect(finalizeShipError({ shipMode: 'pr', shipError: null, gateHold: 'x', audit })).toBeNull()
    expect(
      finalizeShipError({ shipMode: 'merge', shipError: null, gateHold: 'x', audit }),
    ).toBeNull()
  })

  it("passes a specific gateHold through when the run parked on quality grounds", () => {
    const audit = makeAudit({ score: 35, wordCount: 300, thin: true })
    const r = finalizeShipError({
      shipMode: 'none',
      shipError: null,
      gateHold: 'Ship withheld (quality/depth blockers)',
      audit,
    })
    expect(r).toContain('Ship withheld (quality/depth blockers)')
  })
})