import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ledgerAmountLabel,
  STUDIO_RESOURCE_LEDGER_INTERFACE_VERSION,
  type StudioResourceLedgerSnapshot,
} from '@/lib/studioResourceLedger'
import { StudioEstateShell } from '@/components/studioEstateShell/StudioEstateShell'

// Synthetic display fixtures only. They are explicitly not live measurements.
const fixture: StudioResourceLedgerSnapshot = {
  interfaceVersion: STUDIO_RESOURCE_LEDGER_INTERFACE_VERSION,
  activation: 'disabled',
  projected: { state: 'unknown', reason: 'No verified estimate source in this fixture.' },
  observed: {
    state: 'known', value: 0, unit: 'CPU-seconds',
    evidence: { source: 'synthetic-test-fixture', observedAt: '2026-09-29T12:00:00Z', window: '2026-09-29T11:00:00Z/2026-09-29T12:00:00Z' },
  },
  charged: { state: 'unknown', reason: 'No billing evidence in this fixture.' },
}

describe('Studio resource ledger presentation contract', () => {
  it('renders UNKNOWN separately from evidence-backed numeric zero and keeps activation disabled', () => {
    const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: fixture,
      dependencies: [{ name: 'Billing telemetry', state: 'unavailable', reason: 'No source bound.' }],
      decision: { outcome: 'ABSTAIN', rationale: 'A required dependency is unavailable.' },
    }))

    expect(html).toContain('activation disabled')
    expect(html).toContain('>UNKNOWN<')
    expect(html).toContain('0 CPU-seconds')
    expect(html).toContain('Evidence source: synthetic-test-fixture')
    expect(html).toContain('Observed at: 2026-09-29T12:00:00Z')
    expect(html).toContain('Window: 2026-09-29T11:00:00Z/2026-09-29T12:00:00Z')
    expect(html).toContain('data-activation="disabled"')
    expect(html).toContain('data-outcome="ABSTAIN"')
  })

  it('does not coerce unknown amounts into zero or estimates into charges', () => {
    expect(ledgerAmountLabel({ state: 'unknown', reason: 'missing meter' })).toBe('UNKNOWN')
    expect(ledgerAmountLabel({
      state: 'estimated', value: 3, unit: 'seconds', method: 'fixture estimate', methodVersion: '1',
    })).toBe('Estimated 3 seconds')
  })

  it('fails closed for malformed estimated duration metadata while preserving legitimate zero', () => {
    const invalidEstimates = [
      { state: 'estimated', value: Number.NaN, unit: 'seconds', method: 'fixture', methodVersion: '1' },
      { state: 'estimated', value: Number.POSITIVE_INFINITY, unit: 'seconds', method: 'fixture', methodVersion: '1' },
      { state: 'estimated', value: -1, unit: 'seconds', method: 'fixture', methodVersion: '1' },
      { state: 'estimated', value: 3, unit: '   ', method: 'fixture', methodVersion: '1' },
      { state: 'estimated', value: 3, unit: 'seconds', method: '  ', methodVersion: '1' },
      { state: 'estimated', value: 3, unit: 'seconds', method: 'fixture', methodVersion: '\t' },
    ]
    for (const projected of invalidEstimates) {
      expect(ledgerAmountLabel(projected as StudioResourceLedgerSnapshot['projected'])).toBe('UNKNOWN')
      const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
        ledger: {
          ...fixture,
          projected,
          observed: fixture.observed,
          charged: { state: 'known', value: 0, unit: 'USD', currency: 'USD', evidence: { source: 'fixture', observedAt: '2026-09-29T12:00:00Z', window: 'monthly' } },
        } as StudioResourceLedgerSnapshot,
        dependencies: [{ name: 'Estate evidence', state: 'available' }],
        decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
      }))
      expect(html).toContain('aria-label="Projected: UNKNOWN"')
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('Estimated 3')
      expect(html).toContain('data-outcome="ABSTAIN"')
    }
    expect(ledgerAmountLabel({ state: 'estimated', value: 0, unit: 'seconds', method: 'fixture', methodVersion: '1' })).toBe('Estimated 0 seconds')
  })

  it('accepts fractional-second observedAt provenance', () => {
    const fractional = {
      state: 'known', value: 0, unit: 'CPU-seconds',
      evidence: { source: 'synthetic-test-fixture', observedAt: '2026-09-29T12:00:00.123Z', window: 'one hour' },
    }
    const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: { ...fixture, observed: fractional } as StudioResourceLedgerSnapshot,
      dependencies: [{ name: 'Estate evidence', state: 'available' }],
      decision: { outcome: 'ABSTAIN', rationale: 'Evidence is displayed.' },
    }))

    expect(html).toContain('>0 CPU-seconds<')
    expect(html).toContain('Observed at: 2026-09-29T12:00:00.123Z')
  })

  it('keeps NO_ACTION when all amounts and dependencies are complete', () => {
    const completeLedger: StudioResourceLedgerSnapshot = {
      ...fixture,
      projected: { state: 'estimated', value: 2, unit: 'CPU-seconds', method: 'fixture', methodVersion: '1' },
      observed: fixture.observed,
      charged: {
        state: 'known', value: 0, unit: 'USD', currency: 'USD',
        evidence: { source: 'synthetic-test-fixture', observedAt: '2026-09-29T12:00:00Z', window: 'monthly' },
      },
    }
    const noAction = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: completeLedger,
      dependencies: [{ name: 'Estate evidence', state: 'available' }],
      decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
    }))
    const abstain = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: fixture,
      dependencies: [{ name: 'Estate evidence', state: 'unknown', reason: 'Coverage incomplete.' }],
      decision: { outcome: 'ABSTAIN', rationale: 'Required evidence is incomplete.' },
    }))

    expect(noAction).toContain('data-outcome="NO_ACTION"')
    expect(noAction).toContain('Estimated 2 CPU-seconds')
    expect(abstain).toContain('data-outcome="ABSTAIN"')
    expect(abstain).toContain('Coverage incomplete.')
    expect(abstain).not.toContain('data-outcome="NO_ACTION"')
  })

  it('downgrades NO_ACTION when dependencies are available but ledger amounts are unknown', () => {
    const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: fixture,
      dependencies: [{ name: 'Estate evidence', state: 'available' }],
      decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
    }))

    expect(html).toContain('data-outcome="ABSTAIN"')
    expect(html).not.toContain('data-outcome="NO_ACTION"')
    expect(html).toContain('>UNKNOWN<')
    expect(html).toContain('Cannot conclude NO_ACTION without complete ledger amounts')
  })

  it('downgrades NO_ACTION when any known ledger amount is invalid', () => {
    const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: {
        ...fixture,
        projected: { state: 'known', value: 0, unit: 'CPU-seconds', evidence: { source: 'fixture', observedAt: 'invalid', window: 'one hour' } },
        observed: fixture.observed,
        charged: { state: 'known', value: 0, unit: 'USD', currency: 'USD', evidence: { source: 'fixture', observedAt: '2026-09-29T12:00:00Z', window: 'monthly' } },
      },
      dependencies: [{ name: 'Estate evidence', state: 'available' }],
      decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
    }))

    expect(html).toContain('data-outcome="ABSTAIN"')
    expect(html).toContain('>UNKNOWN<')
  })

  it('fails closed when a known zero has malformed or incomplete provenance', () => {
    const invalidAmounts = [
      { state: 'known', value: 0, unit: 'CPU-seconds', evidence: { source: 'invented', observedAt: 'fixture-time', window: 'anything' } },
      { state: 'known', value: 0, unit: 'CPU-seconds', evidence: { source: 'invented', observedAt: '2026-09-29T12:00:00Z', window: ' ' } },
      { state: 'known', value: 0, unit: 'CPU-seconds', evidence: { source: 'invented', observedAt: '2026-02-30T12:00:00Z', window: 'one hour' } },
    ]
    for (const observed of invalidAmounts) {
      const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
        ledger: { ...fixture, observed } as StudioResourceLedgerSnapshot,
        dependencies: [],
        decision: { outcome: 'ABSTAIN', rationale: 'Evidence is incomplete.' },
      }))
      expect(html).toContain('>UNKNOWN<')
      expect(html).not.toContain('>0 CPU-seconds<')
      expect(html).not.toContain('Evidence source: invented')
    }
  })

  it.each(['unknown', 'unavailable'] as const)(
    'downgrades conflicting NO_ACTION when a dependency is %s', (state) => {
      const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
        ledger: fixture,
        dependencies: [{ name: 'Estate evidence', state }],
        decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
      }))
      expect(html).toContain('data-outcome="ABSTAIN"')
      expect(html).not.toContain('data-outcome="NO_ACTION"')
    },
  )

  it('fails closed to ABSTAIN when no dependency observations are supplied', () => {
    const html = renderToStaticMarkup(React.createElement(StudioEstateShell, {
      ledger: fixture,
      dependencies: [],
      decision: { outcome: 'NO_ACTION', rationale: 'Sufficient evidence supports no intervention.' },
    }))

    expect(html).toContain('data-outcome="ABSTAIN"')
    expect(html).not.toContain('data-outcome="NO_ACTION"')
    expect(html).toContain('No dependency observations supplied; evidence is incomplete.')
  })
})
