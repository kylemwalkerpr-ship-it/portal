/**
 * Server-side ship-gate enforcement for persisted job rows (lib/seoFactory/
 * jobShipGate.ts). The server must refuse merge_pr / bulk_approve unless the
 * job's CURRENT audited content cleared the ship gate — mirroring the editor's
 * canonical snapshot (shipReady === true AND blockers === 0). UNKNOWN (no
 * boolean shipReady in audit_json, or no audit_json at all) is a FAIL, never a
 * silent pass.
 */
import { jobPassesShipGate, mergeAuditJsonPreservingGate } from '../lib/seoFactory/jobShipGate'

function job(auditJson: unknown): Record<string, unknown> {
  return { id: 'j1', title: 'Study Permit Guide', topic: 'canada study permit', audit_json: auditJson }
}

describe('jobPassesShipGate', () => {
  it('passes when audit_json records shipReady=true and zero blockers', () => {
    expect(jobPassesShipGate(job({ score: 88, shipReady: true, blockers: 0 }))).toBe(true)
  })

  it('passes when blockers are an empty findings array (client normalization)', () => {
    expect(jobPassesShipGate(job({ score: 96, shipReady: true, blockers: [] }))).toBe(true)
  })

  it('fails when shipReady=true but blockers > 0 — the snapshot is ANDed', () => {
    expect(jobPassesShipGate(job({ score: 100, shipReady: true, blockers: 1 }))).toBe(false)
    expect(jobPassesShipGate(job({ score: 100, shipReady: true, blockers: [{ code: 'x' }] }))).toBe(false)
  })

  it('fails on a score-only audit — 100/100 WITHOUT a boolean shipReady is UNKNOWN', () => {
    // The classic defect: a high score meant "ready" to the old gate.
    expect(jobPassesShipGate(job({ score: 100, blockers: [] }))).toBe(false)
    expect(jobPassesShipGate(job({ score: 96 }))).toBe(false)
  })

  it('fails when the audit explicitly says shipReady=false', () => {
    expect(jobPassesShipGate(job({ score: 88, shipReady: false, blockers: 0 }))).toBe(false)
  })

  it('fails when there is no audit_json at all (unknown state)', () => {
    expect(jobPassesShipGate({ id: 'j1', content: '...' })).toBe(false)
  })

  it('fails on null / non-object audit_json', () => {
    expect(jobPassesShipGate(job(null))).toBe(false)
    expect(jobPassesShipGate(job('not an object'))).toBe(false)
  })

  it('fails on a null job', () => {
    expect(jobPassesShipGate(null)).toBe(false)
    expect(jobPassesShipGate(undefined)).toBe(false)
  })

  it('treats missing blockers as zero — a declared pass without a count passes', () => {
    expect(jobPassesShipGate(job({ score: 90, shipReady: true }))).toBe(true)
  })
})

describe('mergeAuditJsonPreservingGate', () => {
  it('preserves shipReady / contentSpec / contentLoop when overlay omits them', () => {
    const prior = {
      score: 88,
      shipReady: true,
      blockers: [],
      contentSpec: { version: 'cs-1', outline: [] },
      contentLoop: { action: 'fix_until_gates', status: 'cleared' },
      model: 'grok',
    }
    const merged = mergeAuditJsonPreservingGate(prior, {
      score: 90,
      blockers: [{ code: 'x' }],
      wordCount: 1200,
      model: 'grok',
    })
    expect(merged.shipReady).toBe(true)
    expect(merged.contentSpec).toEqual(prior.contentSpec)
    expect(merged.contentLoop).toEqual(prior.contentLoop)
    expect(merged.score).toBe(90)
    expect(merged.blockers).toEqual([{ code: 'x' }])
    // Fresh audit overlay must still be readable by the server gate AND:
    // blockers>0 means jobPassesShipGate fails even with preserved shipReady.
    expect(jobPassesShipGate(job(merged))).toBe(false)
  })

  it('lets an explicit overlay shipReady win (recompute path)', () => {
    const prior = { score: 88, shipReady: true, contentSpec: { version: 'cs-1' } }
    const merged = mergeAuditJsonPreservingGate(prior, { score: 70, shipReady: false, blockers: 2 })
    expect(merged.shipReady).toBe(false)
    expect(merged.contentSpec).toEqual({ version: 'cs-1' })
  })

  it('works when prior is missing — overlay alone', () => {
    const merged = mergeAuditJsonPreservingGate(null, { score: 80, blockers: [] })
    expect(merged).toEqual({ score: 80, blockers: [] })
    expect(jobPassesShipGate(job(merged))).toBe(false)
  })

  it('keeps a cleared gate when Save rebuilds from bare auditContent()', () => {
    // Regression for P0-SHIP-2: { ...audit, model } wiped shipReady.
    const prior = {
      score: 96,
      shipReady: true,
      blockers: [],
      contentSpec: { version: 'cs-1' },
      contentLoop: { status: 'cleared' },
      model: 'x',
    }
    const bareAudit = { score: 96, blockers: [], wordCount: 1400, humanScore: 70 }
    const merged = mergeAuditJsonPreservingGate(prior, { ...bareAudit, model: prior.model })
    expect(jobPassesShipGate(job(merged))).toBe(true)
    expect(merged.contentSpec).toEqual(prior.contentSpec)
    expect(merged.contentLoop).toEqual(prior.contentLoop)
  })
})
