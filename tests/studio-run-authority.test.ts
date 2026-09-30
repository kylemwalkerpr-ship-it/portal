import {
  claimStage,
  evaluateDecision,
  planRunSubmission,
  transitionStage,
  type DecisionTrace,
  type RunSubmission,
  type StageSnapshot,
} from '@/lib/studioRunAuthority'

const stage: StageSnapshot = {
  schemaVersion: 'studio.run-stage/1',
  runId: 'run-1', stageId: 'stage-1', stageName: 'research', inputHash: 'input-hash',
  policyVersion: 'policy-1', currentFence: 4, version: 7, leaseOwner: 'worker-b',
  leaseExpiresAt: '2026-09-29T12:00:00.000Z', state: 'running',
}

const submission: RunSubmission = {
  projectId: 'project-1', runId: 'run-1', stageId: 'stage-1', actorId: 'actor-1',
  authorizationEvidenceId: 'auth-1', idempotencyKey: 'idem-1', authorityEpoch: 3,
  policyVersion: 'policy-1', inputHash: 'input-hash', submittedAt: '2026-09-29T11:00:00.000Z',
  outboxEventId: 'event-1', outboxSequence: 1, payloadRef: 'payload-1', decision: {
    schemaVersion: 'studio.decision-trace/1',
    decisionId: 'decision-1', outcome: 'SELECTED_ACTION', rationale: 'Eligible action selected',
    evidenceIds: ['evidence-1'], rejectedChoices: [], uncertainty: [], selectedAction: 'refresh-source',
  },
}

describe('studio run authority domain contract', () => {
  const advance = (current: StageSnapshot, nextState: StageSnapshot['state'] = 'done') => transitionStage(current, {
    fence: current.currentFence, leaseOwner: current.leaseOwner ?? '', now: '2026-09-29T11:30:00.000Z', nextState,
    predecessor: { runId: current.runId, stageId: current.stageId, version: current.version },
  })
  test('stage recovery increments its fence so the previous worker becomes stale', () => {
    const recovered = claimStage({ ...stage, leaseExpiresAt: '2026-09-29T10:00:00.000Z' }, {
      leaseOwner: 'worker-c', now: '2026-09-29T11:00:00.000Z', leaseExpiresAt: '2026-09-29T12:00:00.000Z',
    })
    expect(recovered.claimed).toBe(true)
    if (!recovered.claimed) throw new Error('expected recovery claim')
    expect(recovered.stage.currentFence).toBe(5)
    expect(transitionStage(recovered.stage, { fence: 4, leaseOwner: 'worker-b', now: '2026-09-29T11:30:00.000Z', nextState: 'done', predecessor: { runId: recovered.stage.runId, stageId: recovered.stage.stageId, version: recovered.stage.version } }))
      .toEqual({ allowed: false, reason: 'STALE_FENCE' })
  })

  test('does not let a second worker claim an unexpired stage lease', () => {
    expect(claimStage(stage, {
      leaseOwner: 'worker-c', now: '2026-09-29T11:30:00.000Z', leaseExpiresAt: '2026-09-29T13:00:00.000Z',
    })).toEqual({ claimed: false, reason: 'LEASE_STILL_ACTIVE' })
  })

  test('rejects claims when fence or version cannot be safely incremented', () => {
    const expiredStage = { ...stage, leaseExpiresAt: '2026-09-29T10:00:00.000Z' }
    const request = {
      leaseOwner: 'worker-c', now: '2026-09-29T11:00:00.000Z', leaseExpiresAt: '2026-09-29T12:00:00.000Z',
    }
    expect(claimStage({ ...expiredStage, currentFence: Number.MAX_SAFE_INTEGER }, request))
      .toEqual({ claimed: false, reason: 'INVALID_CLAIM' })
    expect(claimStage({ ...expiredStage, version: Number.MAX_SAFE_INTEGER }, request))
      .toEqual({ claimed: false, reason: 'INVALID_CLAIM' })
  })

  test('rejects stale run-stage fence even when a legacy job lease could be valid', () => {
    const result = transitionStage(stage, { fence: 3, leaseOwner: 'worker-a', now: '2026-09-29T11:30:00.000Z', nextState: 'done', predecessor: { runId: stage.runId, stageId: stage.stageId, version: stage.version } })
    expect(result).toEqual({ allowed: false, reason: 'STALE_FENCE' })
    expect(stage.currentFence).toBe(4)
  })

  test('rejects expired lease and wrong owner independently of the current fence', () => {
    expect(transitionStage(stage, { fence: 4, leaseOwner: 'worker-b', now: '2026-09-29T12:00:00.000Z', nextState: 'done', predecessor: { runId: stage.runId, stageId: stage.stageId, version: stage.version } }))
      .toEqual({ allowed: false, reason: 'LEASE_EXPIRED' })
    expect(transitionStage(stage, { fence: 4, leaseOwner: 'worker-a', now: '2026-09-29T11:30:00.000Z', nextState: 'done', predecessor: { runId: stage.runId, stageId: stage.stageId, version: stage.version } }))
      .toEqual({ allowed: false, reason: 'LEASE_OWNER_MISMATCH' })
  })

  test('treats an outbox duplicate as a submission conflict with no partial transaction plan', () => {
    const result = planRunSubmission(submission, { existingIdempotencyKeys: [], existingOutboxEventIds: ['event-1'] })
    expect(result).toEqual({ accepted: false, reason: 'DUPLICATE_OUTBOX_EVENT' })
  })

  test('builds the run, initial stage, outbox, and immutable decision as one conceptual commit', () => {
    const result = planRunSubmission(submission, { existingIdempotencyKeys: [], existingOutboxEventIds: [] })
    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error('expected submission plan')
    expect(result.commit).toMatchObject({
      run: { runId: 'run-1', projectId: 'project-1', authorityEpoch: 3 },
      stage: { schemaVersion: 'studio.run-stage/1', stageId: 'stage-1', runId: 'run-1', currentFence: 0, version: 0, state: 'pending' },
      outbox: { schemaVersion: 'studio.outbox-event/1', eventId: 'event-1', idempotencyKey: 'idem-1', deliveryState: 'pending' },
      decision: { decisionId: 'decision-1', outcome: 'SELECTED_ACTION' },
    })
    expect(Object.keys(result.commit)).toEqual(['run', 'stage', 'outbox', 'decision'])
  })

  test('distinguishes sufficient-evidence NO_ACTION from ABSTAIN and FAIL', () => {
    const trace = (outcome: DecisionTrace['outcome'], overrides: Partial<DecisionTrace> = {}): DecisionTrace => ({
      schemaVersion: 'studio.decision-trace/1',
      decisionId: `decision-${outcome}`, outcome, rationale: 'Recorded rationale',
      evidenceIds: ['evidence-1'], rejectedChoices: [], uncertainty: [],
      ...(outcome === 'SELECTED_ACTION' ? { selectedAction: 'refresh-source' } : {}),
      ...(outcome === 'ABSTAIN' ? { blocker: 'SOURCE_UNAVAILABLE' } : {}),
      ...(outcome === 'FAIL' ? { errorClass: 'INVARIANT_VIOLATION' } : {}),
      ...overrides,
    })
    expect(evaluateDecision(trace('NO_ACTION'))).toEqual({ accepted: true, downstream: 'NO_OP' })
    expect(evaluateDecision(trace('ABSTAIN')))
      .toEqual({ accepted: true, downstream: 'BLOCKED' })
    expect(evaluateDecision(trace('ABSTAIN', { blocker: undefined }))).toEqual({ accepted: false, reason: 'ABSTAIN_REQUIRES_BLOCKER' })
    expect(evaluateDecision(trace('FAIL')))
      .toEqual({ accepted: true, downstream: 'FAILED' })
    expect(evaluateDecision(trace('FAIL', { errorClass: undefined }))).toEqual({ accepted: false, reason: 'FAIL_REQUIRES_ERROR_CLASS' })
  })

  test('rejects outcome-specific fields that contradict the decision outcome', () => {
    const trace = (outcome: DecisionTrace['outcome'], overrides: Partial<DecisionTrace> = {}): DecisionTrace => ({
      schemaVersion: 'studio.decision-trace/1', decisionId: `decision-${outcome}`, outcome,
      rationale: 'Recorded rationale', evidenceIds: ['evidence-1'], rejectedChoices: [], uncertainty: [],
      ...(outcome === 'SELECTED_ACTION' ? { selectedAction: 'refresh-source' } : {}),
      ...(outcome === 'ABSTAIN' ? { blocker: 'SOURCE_UNAVAILABLE' } : {}),
      ...(outcome === 'FAIL' ? { errorClass: 'INVARIANT_VIOLATION' } : {}),
      ...overrides,
    })
    expect(evaluateDecision(trace('NO_ACTION', { selectedAction: 'refresh-source' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision(trace('NO_ACTION', { blocker: 'SOURCE_UNAVAILABLE' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision(trace('NO_ACTION', { errorClass: 'INVARIANT_VIOLATION' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision(trace('ABSTAIN', { errorClass: 'INVARIANT_VIOLATION' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision(trace('FAIL', { blocker: 'SOURCE_UNAVAILABLE' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision(trace('SELECTED_ACTION', { errorClass: 'INVARIANT_VIOLATION' })))
      .toEqual({ accepted: false, reason: 'INVALID_TRACE' })
  })

  test('fails closed for illegal transitions and malformed expiry recovery', () => {
    expect(advance(stage, 'pending')).toEqual({ allowed: false, reason: 'INVALID_STAGE_STATE' })
    expect(claimStage({ ...stage, leaseExpiresAt: 'not-a-date' }, {
      leaseOwner: 'worker-c', now: '2026-09-29T11:00:00.000Z', leaseExpiresAt: '2026-09-29T12:00:00.000Z',
    })).toEqual({ claimed: false, reason: 'INVALID_STAGE_STATE' })
    expect(claimStage({ ...stage, leaseExpiresAt: null }, {
      leaseOwner: 'worker-c', now: '2026-09-29T11:00:00.000Z', leaseExpiresAt: '2026-09-29T12:00:00.000Z',
    })).toEqual({ claimed: false, reason: 'INVALID_STAGE_STATE' })
  })

  test('requires exact predecessor run, stage, and version for advancement', () => {
    expect(transitionStage(stage, { fence: 4, leaseOwner: 'worker-b', now: '2026-09-29T11:30:00.000Z', nextState: 'done', predecessor: { runId: 'other-run', stageId: stage.stageId, version: stage.version } }))
      .toEqual({ allowed: false, reason: 'PREDECESSOR_MISMATCH' })
    expect(transitionStage(stage, { fence: 4, leaseOwner: 'worker-b', now: '2026-09-29T11:30:00.000Z', nextState: 'done', predecessor: { runId: stage.runId, stageId: stage.stageId, version: stage.version - 1 } }))
      .toEqual({ allowed: false, reason: 'PREDECESSOR_MISMATCH' })
  })

  test('rejects malformed evidence, rejected choices, uncertainty, and missing selected action', () => {
    const valid: DecisionTrace = submission.decision
    expect(evaluateDecision({ ...valid, evidenceIds: [' '] })).toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision({ ...valid, rejectedChoices: [{ choice: ' ', reasonCode: 'R1', reason: 'reason' }] })).toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision({ ...valid, uncertainty: [''] })).toEqual({ accepted: false, reason: 'INVALID_TRACE' })
    expect(evaluateDecision({ ...valid, selectedAction: undefined })).toEqual({ accepted: false, reason: 'SELECTED_ACTION_REQUIRES_ACTION' })
    expect(evaluateDecision({ ...valid, outcome: 'NO_ACTION', selectedAction: undefined, evidenceIds: [] })).toEqual({ accepted: false, reason: 'NO_ACTION_REQUIRES_EVIDENCE' })
  })
})
