/**
 * P1 — mandatory-evidence verdicts are binding at ship.
 *
 * gate.ts's AUTHORITATIVE mandatory result (not the advisory `passed` flag)
 * drives ship.ts, and one missing required item (statutory anchor OR the
 * professional disclaimer) holds a YMYL-critical mission — legal AND regional.
 * A thrown mandatory evaluation becomes a hold with a reason, never the old
 * non-blocking catch.
 */
import {
  evaluateMandatoryEvidence,
  enforceGate,
  extractComplianceSignals,
  MandatoryGateHeldError,
} from '@/lib/seoEngine/gate'
import { mandatoryShipHold } from '@/lib/seoFactory/ship'

jest.mock('@/lib/supabase', () => {
  const thenable = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: null, count: 0 })),
    catch: () => Promise.resolve({ data: null, error: null, count: 0 }),
  }
  const chain = (): unknown =>
    new Proxy(thenable, {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch') return target[prop as 'then' | 'catch']
        return () => chain()
      },
    })
  return { createSupabaseAdminClient: () => ({ from: () => chain() }) }
})

const NO_EVIDENCE = { ymyl_statutory: false, ymyl_disclaimer: false }
const ONLY_CITATION = { ymyl_statutory: true, ymyl_disclaimer: false }
const ONLY_DISCLAIMER = { ymyl_statutory: false, ymyl_disclaimer: true }
const BOTH = { ymyl_statutory: true, ymyl_disclaimer: true }

describe('evaluateMandatoryEvidence — strict-OR on critical stages', () => {
  it('fails when neither statutory citation nor disclaimer is present', () => {
    const r = evaluateMandatoryEvidence(NO_EVIDENCE, { critical: true, stageLabel: 'visa' })
    expect(r.applicable).toBe(true)
    expect(r.met).toBe(false)
    expect(r.missing).toHaveLength(2)
  })

  it('fails on ONLY the citation (a single missing required item holds the ship)', () => {
    const r = evaluateMandatoryEvidence(ONLY_CITATION, { critical: true })
    expect(r.met).toBe(false)
    expect(r.missing).toEqual(['professional disclaimer'])
  })

  it('fails on ONLY the disclaimer', () => {
    const r = evaluateMandatoryEvidence(ONLY_DISCLAIMER, { critical: true })
    expect(r.met).toBe(false)
    expect(r.missing).toEqual(['statutory anchor cited'])
  })

  it('passes when both are present (does not claim factual legal accuracy)', () => {
    const r = evaluateMandatoryEvidence(BOTH, { critical: true })
    expect(r.met).toBe(true)
    expect(r.missing).toHaveLength(0)
  })

  it('is advisory (not applicable) for non-critical stages', () => {
    const r = evaluateMandatoryEvidence(NO_EVIDENCE, { critical: false })
    expect(r.applicable).toBe(false)
    expect(r.met).toBe(true)
  })
})

describe('enforceGate returns the authoritative mandatory verdict', () => {
  it('reports applicable+not met for a critical stage with only a statute', async () => {
    const draft = '## In 60 seconds\n# How long does a UK visa take?\n\nINA § 316 is the governing statute for naturalization proceedings in the United States.'
    const signals = { ...extractComplianceSignals(draft, { stage: 'visa', country: 'US' }), ymyl_statutory: true, ymyl_disclaimer: false }
    const verdict = await enforceGate(
      { subjectType: 'draft', stage: 'visa', country: 'US' },
      draft,
      { stage: 'visa', country: 'US', title: 'Visa Guide' },
      signals,
    )
    expect(verdict.mandatory.applicable).toBe(true)
    expect(verdict.mandatory.met).toBe(false)
    expect(verdict.mandatory.missing).toContain('professional disclaimer')
  })

  it('passes the mandatory check when both required items are present', async () => {
    const draft = '## In 60 seconds\nUK Graduate Visa lets students stay for 2 years.\nImmigration Rules Appendix FM is cited here for completeness.\n\nThis guide is informational only and is not legal advice.'
    const signals = { ...extractComplianceSignals(draft, { stage: 'visa', country: 'UK' }), ymyl_statutory: true, ymyl_disclaimer: true }
    const verdict = await enforceGate(
      { subjectType: 'draft', stage: 'visa', country: 'UK' },
      draft,
      { stage: 'visa', country: 'UK', title: 'Graduate Visa Guide' },
      signals,
    )
    expect(verdict.mandatory.met).toBe(true)
  })
})

describe('mandatoryShipHold — ship.ts binding', () => {
  it('returns a BLOCKING hold when only one of the two required items is missing', () => {
    const hold = mandatoryShipHold({ applicable: true, met: false, missing: ['professional disclaimer'] }, 'visa')
    expect(hold).toBeInstanceOf(Error)
    expect(hold!.message).toContain('compliance gate BLOCKED')
    expect(hold!.message).toContain('professional disclaimer')
  })

  it('returns null when both required items are present (other gates still apply)', () => {
    expect(mandatoryShipHold({ applicable: true, met: true, missing: [] }, 'visa')).toBeNull()
  })

  it('does not bind advisory/non-critical verdicts', () => {
    expect(mandatoryShipHold({ applicable: false, met: true, missing: [] }, 'blog')).toBeNull()
  })

  it('a mandatory-evaluation FAILURE is a hold with a reason (MandatoryGateHeldError)', () => {
    const held = new MandatoryGateHeldError('Held ship: mandatory compliance evaluation failed for "x" (stage visa): boom')
    expect(held).toBeInstanceOf(Error)
    expect(held.message).toContain('Held ship: mandatory compliance evaluation failed')
  })
})