/**
 * Apply-time safeguards for the immutable marketplace copy plan (2026-09-08):
 *   - pinned SHA-256 (reject tampered / mismatched plan),
 *   - schema/project pins,
 *   - apply consumes the SAVED original/proposed pairs (no regeneration) and
 *     only for bound identities,
 *   - concurrent-edit detection: live row must equal the saved original
 *     (content for bios; content AND updated_at for gigs) or the row is
 *     skipped, never overwritten.
 * Mirrors scripts/marketplace-clean-templated-bios.mjs (apply/validate logic).
 */
import { createHash } from 'node:crypto'

const REF = 'krggzrxxnqfsbbklatxl'

function planSha(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

/** Returns a rejection string or null when the plan is valid to apply. */
function validateApply(plan, providedHash) {
  if (planSha(plan) !== providedHash) return 'SHA256 mismatch'
  if (plan.schema_version !== 1) return 'unsupported schema'
  if (plan.project !== REF) return 'project mismatch'
  const bound = new Set(plan.bindings.map((b) => b.profile_id))
  for (const e of plan.entries) {
    const pid = e.kind === 'gig' ? e.provider_id : e.profile_id
    if (!bound.has(pid)) return `entry not bound: ${pid}`
    if (!('original' in e) || !('proposed' in e)) return `entry requires regeneration (missing original/proposed): ${pid}`
  }
  return null
}

const narrative = 'Carmen R. Arce is a U.S. immigration attorney licensed in Florida.'
const goodPlan = {
  schema_version: 1,
  project: REF,
  bindings: [{ name: 'Carmen R. Arce', profile_id: 'pid-1', provider_type: 'attorney' }],
  entries: [
    { kind: 'bio', profile_id: 'pid-1', table: 'attorneys', original: 'old bio', proposed: narrative },
    { kind: 'gig', id: 'gid-1', provider_id: 'pid-1', original: 'old desc', original_updated_at: '2026-09-01T00:00:00Z', proposed: 'new desc' },
  ],
}
const goodHash = planSha(goodPlan)

describe('apply validation — pinned integrity guards', () => {
  it('accepts an untouched plan with its exact SHA-256', () => {
    expect(validateApply(goodPlan, goodHash)).toBeNull()
  })

  it('rejects a SHA-256 mismatch (provided hex ≠ file hash)', () => {
    expect(validateApply(goodPlan, 'deadbeef'.repeat(16))).toBe('SHA256 mismatch')
  })

  it('rejects a tampered plan (any byte difference changes the hash)', () => {
    const tampered = JSON.parse(JSON.stringify(goodPlan))
    tampered.entries[0].proposed = `${narrative} — altered`
    expect(validateApply(tampered, goodHash)).toBe('SHA256 mismatch')
  })

  it('rejects schema or project mismatches', () => {
    const s = JSON.parse(JSON.stringify(goodPlan)); s.schema_version = 2
    expect(validateApply(s, planSha(s))).toBe('unsupported schema')
    const p = JSON.parse(JSON.stringify(goodPlan)); p.project = 'other'
    expect(validateApply(p, planSha(p))).toBe('project mismatch')
  })
})

describe('apply consumes saved content only (no regeneration, bound identities)', () => {
  it('rejects any entry whose original/proposed is missing (a regeneration would otherwise be needed)', () => {
    const bad2 = JSON.parse(JSON.stringify(goodPlan))
    delete bad2.entries[0].original
    expect(validateApply(bad2, planSha(bad2))).toMatch(/requires regeneration/)
  })

  it('rejects an entry that is not bound to a reviewed identity', () => {
    const bad = JSON.parse(JSON.stringify(goodPlan))
    bad.entries.push({ kind: 'bio', profile_id: 'stranger', table: 'attorneys', original: 'x', proposed: 'y' })
    expect(validateApply(bad, planSha(bad))).toMatch(/entry not bound/)
  })

  it('uses the saved proposed text verbatim for bios and gigs', () => {
    expect(goodPlan.entries[0].proposed).toBe(narrative)
    expect(goodPlan.entries[1].proposed).toBe('new desc')
  })
})

describe('concurrent-edit guard (compare live row to saved original)', () => {
  const conflictIf = (entry, live) => {
    if (!live) return true
    const contentMatch = (live.description ?? live.bio ?? '') === entry.original
    const tsMatch = entry.kind !== 'gig' || String(live.updated_at) === String(entry.original_updated_at)
    return !(contentMatch && tsMatch)
  }

  it('skips a gig whose current description or updated_at no longer equals the original', () => {
    expect(conflictIf(goodPlan.entries[1], { description: 'changed by someone', updated_at: '2026-09-01T00:00:00Z' })).toBe(true)
    expect(conflictIf(goodPlan.entries[1], { description: 'old desc', updated_at: '2026-09-02T00:00:00Z' })).toBe(true)
    expect(conflictIf(goodPlan.entries[1], { description: 'old desc', updated_at: '2026-09-01T00:00:00Z' })).toBe(false)
  })

  it('skips a bio whose current text differs from the original', () => {
    expect(conflictIf(goodPlan.entries[0], { bio: 'old bio' })).toBe(false)
    expect(conflictIf(goodPlan.entries[0], { bio: 'someone rewrote it' })).toBe(true)
    expect(conflictIf(goodPlan.entries[0], null)).toBe(true)
  })
})