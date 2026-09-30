/**
 * Pure domain rules for the proposed durable Studio run authority.
 * This module performs no persistence, lease RPC, provider call, or legacy job-lease check.
 * Physical uniqueness and compare-and-set guarantees depend on the schema/RPC proven by A0.3;
 * these pure identity/version conditions do not claim atomic uniqueness or concurrent CAS.
 */

export type DecisionOutcome = 'NO_ACTION' | 'ABSTAIN' | 'FAIL' | 'SELECTED_ACTION'

export interface DecisionTrace {
  schemaVersion: 'studio.decision-trace/1'
  decisionId: string
  outcome: DecisionOutcome
  rationale: string
  evidenceIds: readonly string[]
  rejectedChoices: readonly { choice: string; reasonCode: string; reason: string }[]
  uncertainty: readonly string[]
  selectedAction?: string
  blocker?: string
  errorClass?: string
}

export interface StageSnapshot {
  schemaVersion: 'studio.run-stage/1'
  runId: string
  stageId: string
  stageName: string
  inputHash: string
  policyVersion: string
  currentFence: number
  version: number
  leaseOwner: string | null
  leaseExpiresAt: string | null
  state: 'pending' | 'claimed' | 'running' | 'checkpointed' | 'done' | 'failed' | 'cancelled'
}

export type StageTransition =
  | { allowed: false; reason: 'STALE_FENCE' | 'LEASE_OWNER_MISMATCH' | 'LEASE_EXPIRED' | 'INVALID_STAGE_STATE' | 'PREDECESSOR_MISMATCH' }
  | { allowed: true; stage: StageSnapshot }

export type StageClaim =
  | { claimed: false; reason: 'LEASE_STILL_ACTIVE' | 'INVALID_STAGE_STATE' | 'INVALID_CLAIM' }
  | { claimed: true; stage: StageSnapshot }

/** Claims or recovers a stage with a strictly increasing execution fence. */
export function claimStage(
  current: StageSnapshot,
  request: { leaseOwner: string; now: string; leaseExpiresAt: string },
): StageClaim {
  const now = Date.parse(request.now)
  const requestedExpiry = Date.parse(request.leaseExpiresAt)
  if (!required(request.leaseOwner) || !Number.isFinite(now) || !Number.isFinite(requestedExpiry) || requestedExpiry <= now ||
    !Number.isSafeInteger(current.currentFence) || current.currentFence < 0 ||
    !Number.isSafeInteger(current.version) || current.version < 0 ||
    !Number.isSafeInteger(current.currentFence + 1) || !Number.isSafeInteger(current.version + 1)) {
    return { claimed: false, reason: 'INVALID_CLAIM' }
  }
  if (current.state === 'done' || current.state === 'failed' || current.state === 'cancelled') {
    return { claimed: false, reason: 'INVALID_STAGE_STATE' }
  }
  if (current.leaseOwner !== null || current.leaseExpiresAt !== null) {
    if (!current.leaseOwner || !current.leaseExpiresAt) return { claimed: false, reason: 'INVALID_STAGE_STATE' }
    const currentExpiry = Date.parse(current.leaseExpiresAt)
    if (!Number.isFinite(currentExpiry)) return { claimed: false, reason: 'INVALID_STAGE_STATE' }
    if (now < currentExpiry) return { claimed: false, reason: 'LEASE_STILL_ACTIVE' }
  }
  return {
    claimed: true,
    stage: {
      ...current,
      currentFence: current.currentFence + 1,
      version: current.version + 1,
      leaseOwner: request.leaseOwner,
      leaseExpiresAt: request.leaseExpiresAt,
      state: 'claimed',
    },
  }
}

export function transitionStage(
  current: StageSnapshot,
  request: {
    fence: number; leaseOwner: string; now: string; nextState: StageSnapshot['state']
    predecessor: { runId: string; stageId: string; version: number }
  },
): StageTransition {
  if (request.predecessor.runId !== current.runId || request.predecessor.stageId !== current.stageId ||
    !Number.isSafeInteger(request.predecessor.version) || request.predecessor.version !== current.version) {
    return { allowed: false, reason: 'PREDECESSOR_MISMATCH' }
  }
  if (!Number.isSafeInteger(request.fence) || request.fence !== current.currentFence) {
    return { allowed: false, reason: 'STALE_FENCE' }
  }
  if (!current.leaseOwner || request.leaseOwner !== current.leaseOwner) {
    return { allowed: false, reason: 'LEASE_OWNER_MISMATCH' }
  }
  const expires = current.leaseExpiresAt ? Date.parse(current.leaseExpiresAt) : Number.NaN
  const now = Date.parse(request.now)
  if (!Number.isFinite(expires) || !Number.isFinite(now) || now >= expires) {
    return { allowed: false, reason: 'LEASE_EXPIRED' }
  }
  if (!validTransition(current.state, request.nextState)) {
    return { allowed: false, reason: 'INVALID_STAGE_STATE' }
  }
  return { allowed: true, stage: { ...current, state: request.nextState, version: current.version + 1 } }
}

function validTransition(from: StageSnapshot['state'], to: StageSnapshot['state']): boolean {
  const transitions: Record<StageSnapshot['state'], readonly StageSnapshot['state'][]> = {
    pending: ['claimed', 'cancelled'], claimed: ['running', 'failed', 'cancelled'],
    running: ['checkpointed', 'done', 'failed', 'cancelled'],
    checkpointed: ['running', 'done', 'failed', 'cancelled'], done: [], failed: [], cancelled: [],
  }
  return transitions[from].includes(to)
}

export interface RunSubmission {
  projectId: string
  runId: string
  stageId: string
  actorId: string
  authorizationEvidenceId: string
  idempotencyKey: string
  authorityEpoch: number
  policyVersion: string
  inputHash: string
  submittedAt: string
  outboxEventId: string
  outboxSequence: number
  payloadRef: string
  decision: DecisionTrace
}

export interface SubmissionCommitPlan {
  run: {
    schemaVersion: 'studio.run/1'
    projectId: string; runId: string; actorId: string; authorizationEvidenceId: string
    idempotencyKey: string; authorityEpoch: number; policyVersion: string; createdAt: string
  }
  stage: {
    schemaVersion: 'studio.run-stage/1'
    stageId: string; runId: string; stageName: string; inputHash: string
    policyVersion: string; currentFence: number; version: number; state: 'pending'
  }
  outbox: {
    schemaVersion: 'studio.outbox-event/1'
    eventId: string; runId: string; stageId: string; sequence: number; payloadRef: string
    idempotencyKey: string; deliveryState: 'pending'; createdAt: string
  }
  decision: DecisionTrace
}

export type SubmissionPlan =
  | { accepted: false; reason: 'DUPLICATE_IDEMPOTENCY_KEY' | 'DUPLICATE_OUTBOX_EVENT' | 'INVALID_SUBMISSION' | 'INVALID_DECISION' }
  | { accepted: true; commit: SubmissionCommitPlan }

export function planRunSubmission(
  request: RunSubmission,
  existing: { existingIdempotencyKeys: readonly string[]; existingOutboxEventIds: readonly string[] },
): SubmissionPlan {
  if (!required(request.projectId, request.runId, request.stageId, request.actorId,
    request.authorizationEvidenceId, request.idempotencyKey, request.policyVersion,
    request.inputHash, request.outboxEventId, request.payloadRef) ||
    !Number.isSafeInteger(request.authorityEpoch) || request.authorityEpoch < 0 ||
    !Number.isSafeInteger(request.outboxSequence) || request.outboxSequence < 1 ||
    !Number.isFinite(Date.parse(request.submittedAt))) {
    return { accepted: false, reason: 'INVALID_SUBMISSION' }
  }
  if (existing.existingIdempotencyKeys.includes(request.idempotencyKey)) {
    return { accepted: false, reason: 'DUPLICATE_IDEMPOTENCY_KEY' }
  }
  if (existing.existingOutboxEventIds.includes(request.outboxEventId)) {
    return { accepted: false, reason: 'DUPLICATE_OUTBOX_EVENT' }
  }
  const decision = evaluateDecision(request.decision)
  if (!decision.accepted) return { accepted: false, reason: 'INVALID_DECISION' }

  // A single plan is returned for one transaction boundary. Callers must commit all four records or none.
  const commit: SubmissionCommitPlan = {
    run: {
      schemaVersion: 'studio.run/1',
      projectId: request.projectId, runId: request.runId, actorId: request.actorId,
      authorizationEvidenceId: request.authorizationEvidenceId, idempotencyKey: request.idempotencyKey,
      authorityEpoch: request.authorityEpoch, policyVersion: request.policyVersion, createdAt: request.submittedAt,
    },
    stage: {
      schemaVersion: 'studio.run-stage/1',
      stageId: request.stageId, runId: request.runId, stageName: 'initial', inputHash: request.inputHash,
      policyVersion: request.policyVersion, currentFence: 0, version: 0, state: 'pending',
    },
    outbox: {
      schemaVersion: 'studio.outbox-event/1',
      eventId: request.outboxEventId, runId: request.runId, stageId: request.stageId,
      sequence: request.outboxSequence, payloadRef: request.payloadRef,
      idempotencyKey: request.idempotencyKey, deliveryState: 'pending', createdAt: request.submittedAt,
    },
    decision: { ...request.decision },
  }
  return { accepted: true, commit }
}

export type DecisionEvaluation =
  | { accepted: true; downstream: 'NO_OP' | 'BLOCKED' | 'FAILED' | 'PROPOSAL' }
  | { accepted: false; reason: 'INVALID_TRACE' | 'MISSING_DECISION_ID' | 'MISSING_RATIONALE' | 'NO_ACTION_REQUIRES_EVIDENCE' | 'ABSTAIN_REQUIRES_BLOCKER' | 'FAIL_REQUIRES_ERROR_CLASS' | 'SELECTED_ACTION_REQUIRES_ACTION' }

export function evaluateDecision(trace: DecisionTrace): DecisionEvaluation {
  if (trace.schemaVersion !== 'studio.decision-trace/1' || !Array.isArray(trace.evidenceIds) ||
    !trace.evidenceIds.every(isNonEmptyString) || new Set(trace.evidenceIds).size !== trace.evidenceIds.length ||
    !Array.isArray(trace.rejectedChoices) || !trace.rejectedChoices.every((choice) => choice &&
      required(choice.choice, choice.reasonCode, choice.reason)) ||
    !Array.isArray(trace.uncertainty) || !trace.uncertainty.every(isNonEmptyString) ||
    !optionalStringValid(trace.selectedAction) || !optionalStringValid(trace.blocker) || !optionalStringValid(trace.errorClass) ||
    !['NO_ACTION', 'ABSTAIN', 'FAIL', 'SELECTED_ACTION'].includes(trace.outcome)) {
    return { accepted: false, reason: 'INVALID_TRACE' }
  }
  if (!required(trace.decisionId)) return { accepted: false, reason: 'MISSING_DECISION_ID' }
  if (!required(trace.rationale)) return { accepted: false, reason: 'MISSING_RATIONALE' }
  switch (trace.outcome) {
    case 'NO_ACTION':
      if (trace.selectedAction !== undefined || trace.blocker !== undefined || trace.errorClass !== undefined) {
        return { accepted: false, reason: 'INVALID_TRACE' }
      }
      return trace.evidenceIds.length > 0
        ? { accepted: true, downstream: 'NO_OP' }
        : { accepted: false, reason: 'NO_ACTION_REQUIRES_EVIDENCE' }
    case 'ABSTAIN':
      if (trace.selectedAction !== undefined || trace.errorClass !== undefined) {
        return { accepted: false, reason: 'INVALID_TRACE' }
      }
      return required(trace.blocker)
        ? { accepted: true, downstream: 'BLOCKED' }
        : { accepted: false, reason: 'ABSTAIN_REQUIRES_BLOCKER' }
    case 'FAIL':
      if (trace.selectedAction !== undefined || trace.blocker !== undefined) {
        return { accepted: false, reason: 'INVALID_TRACE' }
      }
      return required(trace.errorClass)
        ? { accepted: true, downstream: 'FAILED' }
        : { accepted: false, reason: 'FAIL_REQUIRES_ERROR_CLASS' }
    case 'SELECTED_ACTION':
      if (trace.blocker !== undefined || trace.errorClass !== undefined) {
        return { accepted: false, reason: 'INVALID_TRACE' }
      }
      return required(trace.selectedAction)
        ? { accepted: true, downstream: 'PROPOSAL' }
        : { accepted: false, reason: 'SELECTED_ACTION_REQUIRES_ACTION' }
    default: {
      const exhaustive: never = trace.outcome
      return exhaustive
    }
  }
}

function required(...values: string[]): boolean {
  return values.every(isNonEmptyString)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalStringValid(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value)
}
