/**
 * Server-side ship-gate enforcement for persisted job rows (lib/seoFactory/
 * jobShipGate.ts). The server must refuse merge_pr / bulk_approve unless the
 * job's CURRENT audited content cleared the ship gate — mirroring the editor's
 * canonical snapshot (shipReady === true AND blockers === 0). UNKNOWN (no
 * boolean shipReady in audit_json, or no audit_json at all) is a FAIL, never a
 * silent pass.
 */
import { jobPassesShipGate } from '../lib/seoFactory/jobShipGate'

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