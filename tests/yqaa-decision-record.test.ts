import fs from 'node:fs'
import path from 'node:path'
import { toYqaaDecisionRecord } from '@/lib/yqaaDecisionRecord'
import { evaluateYqaaGoldSet } from '@/lib/yqaaOfflineEvaluator'
import { adaptPublicSafetyDecision } from '@/lib/yqaaDecisionOrchestrator'
import { buildCompanionDecision } from '@/lib/yqaaCompanionDecision'

describe('versioned YQAA decision records', () => {
  it('stores decision enums, reason/evidence IDs and a one-way interaction reference without raw input', async () => {
    const record = await toYqaaDecisionRecord({
      channel: 'dm', interactionKey: 'conversation-1:message-7',
      decision: { posture: 'EDUCATE', negotiationAction: null, escalate: false, reasons: ['orientation_query'] },
      evidenceIds: ['kb:uscis:1', 'https://private.example/raw?email=x'],
      providerKey: 'provider-secret-id', categoryKey: 'immigration',
    })
    expect(record).toMatchObject({ record_version: 1, channel: 'dm', posture: 'EDUCATE' })
    expect(record.evidence_ids).toHaveLength(1)
    expect(record.evidence_ids[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(record.interaction_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(record)).not.toContain('conversation-1')
    expect(JSON.stringify(record)).not.toContain('private.example')
    expect(JSON.stringify(record)).not.toContain('uscis')
    expect(JSON.stringify(record)).not.toContain('provider-secret-id')
    expect(record.provider_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(record.category_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stratifies offline metrics and holds all false-safe calibration proposals', () => {
    const cases = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `safe-${i}`, stratum: 'public', predictedSafe: true, humanSafe: true, labelSource: 'licensed_expert' as const, rubricVersion: 'r1' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `unsafe-${i}`, stratum: 'high-stakes', predictedSafe: i > 0, humanSafe: false, labelSource: 'licensed_expert' as const, rubricVersion: 'r1' })),
    ]
    const result = evaluateYqaaGoldSet(cases, 5, ['public', 'high-stakes'])
    expect(result.strata.public.count).toBe(5)
    expect(result.strata['high-stakes'].falseSafeCount).toBe(4)
    expect(result.promotion).toBe('HOLD_FALSE_SAFE')
    expect(result.proposal.eligible).toBe(false)
    expect(evaluateYqaaGoldSet(cases, 5, ['public', 'high-stakes', 'missing-stratum']).promotion).toBe('HOLD_FALSE_SAFE')
    expect(evaluateYqaaGoldSet(cases, 5, ['public', 'high-stakes', 'missing-stratum']).strata['missing-stratum'].count).toBe(0)
  })

  it('keeps decision storage private to the service role in the new migration', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261013190000_yqaa_decision_records.sql'), 'utf8')
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/force row level security/i)
    expect(sql).toMatch(/revoke all on table public\.yqaa_decision_records from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert on table public\.yqaa_decision_records to service_role/i)
    expect(sql).not.toMatch(/grant .*authenticated/i)
  })

  it('preserves the shared high-stakes escalation posture across public and DM adapters', async () => {
    const publicDecision = adaptPublicSafetyDecision({ answerAllowed: false, reason: 'high_stakes_handoff', triggers: ['high_stakes'] })
    const dmDecision = await buildCompanionDecision({
      channel: 'dm', redactedQuery: 'What are my odds?', highStakes: true,
      frustration: false, duplicateRisk: false, budgetGapExplained: false,
      hasNewScopeOrCounter: false, commerceIntent: false,
      jevRequest: async () => ({ available: false, reason: 'not_configured' }),
    })
    expect(publicDecision.escalate).toBe(true)
    expect(dmDecision.escalate).toBe(true)
    expect(publicDecision.posture).toBe('HANDOFF_SUPPORT')
    expect(dmDecision.posture).toBe('ESCALATE_PROVIDER')
  })
})
