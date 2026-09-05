/**
 * Regression: the studio job modal must never claim a draft passes on score
 * alone. The green "Previous ship refusal is stale" banner, the blocker panel,
 * and the Approve/Ship-PR buttons all derive from ONE canonical snapshot whose
 * readiness requires the LATEST audit response to say `shipReady === true`
 * AND zero blockers. Unknown audit state never claims a pass.
 */
import {
  resolveShipRefusalBanner,
  contentFingerprint,
  normalizeShipBlockers,
  shipActionsEnabled,
  shipGateFromResponse,
  shipGateFromPersistedReview,
  shipGateReady,
  type ShipGate,
} from '../lib/seoFactory/currentGate'

describe('ship gate · canonical current-gate state', () => {
  it('score 100 + blocker + shipReady=false is ACTIVE: no stale-pass banner, Approve stays disabled', () => {
    const gate = shipGateFromResponse({ score: 100, shipReady: false, blockers: 1 })
    expect(gate).toEqual({ shipReady: false, blockers: 1 })
    expect(shipGateReady(gate)).toBe(false)
    // The stubborn case from the live defect: 100 score but UNLINKED_RELATED_GUIDE.
    expect(resolveShipRefusalBanner({ refused: true, gate })).toBe('active')
    expect(shipActionsEnabled(gate)).toBe(false)
  })

  it('score 100 + zero blockers + shipReady=true is CLEARED: stale-pass banner, Approve enabled', () => {
    const gate = shipGateFromResponse({ score: 100, shipReady: true, blockers: 0 })
    expect(gate).toEqual({ shipReady: true, blockers: 0 })
    expect(shipGateReady(gate)).toBe(true)
    expect(resolveShipRefusalBanner({ refused: true, gate })).toBe('cleared')
    expect(shipActionsEnabled(gate)).toBe(true)
  })

  it('blockers > 0 defeats shipReady=true — the snapshot is ANDed, never XORed', () => {
    const gate = shipGateFromResponse({ score: 100, shipReady: true, blockers: 1 })
    expect(gate).toEqual({ shipReady: false, blockers: 1 })
    expect(shipGateReady(gate)).toBe(false)
    expect(resolveShipRefusalBanner({ refused: true, gate })).toBe('active')
  })

  it('unknown audit state (no boolean shipReady) is UNKNOWN: never a false pass', () => {
    // A score-only response is exactly what the buggy banner trusted.
    const gate = shipGateFromResponse({ score: 100 })
    expect(gate).toBeNull()
    expect(shipGateReady(gate)).toBe(false)
    expect(resolveShipRefusalBanner({ refused: true, gate: null })).toBe('unknown')
    expect(shipActionsEnabled(null)).toBe(false)
  })

  it('no ship refusal on record falls through to the raw error display', () => {
    expect(resolveShipRefusalBanner({ refused: false, gate: { shipReady: true, blockers: 0 } })).toBe('none')
    expect(resolveShipRefusalBanner({ refused: false, gate: null })).toBe('none')
  })

  it('a raw boolean false (pre-refactor editor contract) is treated as active, not enabled', () => {
    const gate = shipGateFromResponse({ shipReady: false, blockers: 0 })
    expect(gate).toEqual({ shipReady: false, blockers: 0 })
    expect(shipGateReady(gate)).toBe(false)
  })

  it('null/undefined blockers default to 0 so a pass without a blocker count still enables', () => {
    const gate = shipGateFromResponse({ shipReady: true })
    expect(gate).toEqual({ shipReady: true, blockers: 0 })
    expect(shipActionsEnabled(gate)).toBe(true)
  })

  it('hydrates a persisted pass only for the exact audited content', () => {
    const content = '# Title\n\nAudited body.'
    const review = { contentFingerprint: contentFingerprint(content), shipReady: true, blockers: 0 }
    expect(shipGateFromPersistedReview(review, content)).toEqual({ shipReady: true, blockers: 0 })
    expect(shipGateFromPersistedReview(review, `${content}\nEdited`)).toBeNull()
  })

  it('hydrates a persisted blocker without enabling Approve', () => {
    const content = '# Title\n\nBlocked body.'
    const gate = shipGateFromPersistedReview(
      { contentFingerprint: contentFingerprint(content), shipReady: false, blockers: 1 },
      content,
    )
    expect(gate).toEqual({ shipReady: false, blockers: 1 })
    expect(shipActionsEnabled(gate)).toBe(false)
  })
})

describe('ship gate · modal decision wiring applied in render', () => {
  const refusedMessage = 'Ship refused: content quality gate failed syntax/structure checks'
  const gate: ShipGate = { shipReady: true, blockers: 0 }

  it('banner kind for the exact live-defect scenario', () => {
    // score was 100 (gate said one thing) but a blocker existed —
    // the canonical snapshot reports the blocker's shipReady=false.
    const liveDefectGate = shipGateFromResponse({ score: 100, shipReady: false, blockers: 1 })
    const kind = resolveShipRefusalBanner({ refused: /ship refused/i.test(refusedMessage), gate: liveDefectGate })
    expect(kind).toBe('active')
    expect(refusedMessage).toMatch(/ship refused/i)
  })

  it('approve enablement is the same snapshot the banner uses', () => {
    expect(shipActionsEnabled(gate)).toBe(true)
    expect(resolveShipRefusalBanner({ refused: true, gate })).toBe('cleared')
  })
})

describe('normalizeShipBlockers / array-safe shipGateFromResponse (P0-SHIP-4)', () => {
  it('treats an empty blockers array as zero — Approve must not stay locked', () => {
    expect(normalizeShipBlockers([])).toBe(0)
    expect(normalizeShipBlockers([{ code: 'x' }])).toBe(1)
    expect(shipGateFromResponse({ shipReady: true, blockers: [] })).toEqual({
      shipReady: true,
      blockers: 0,
    })
  })

  it('ANDs shipReady with a non-empty blockers array', () => {
    expect(shipGateFromResponse({ shipReady: true, blockers: [{ code: 'x' }] })).toEqual({
      shipReady: false,
      blockers: 1,
    })
  })
})
