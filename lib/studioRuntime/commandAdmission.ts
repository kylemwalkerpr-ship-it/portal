import { randomUUID } from 'node:crypto'
import { hashRunCommand, type AdmissionResult, type RunCommandInput, type VerifiedCommandContext, type VerifiedIdentity } from './contracts'
import type { StudioRunRepository } from './repository'

export interface AdmissionDependencies {
  authorizeCommand(input: RunCommandInput, identity: VerifiedIdentity): Promise<VerifiedCommandContext>
  repository: StudioRunRepository
  ids?: () => { runId: string; stageId: string; eventId: string }
}
export async function admitRun(input: RunCommandInput, identity: VerifiedIdentity, deps: AdmissionDependencies): Promise<AdmissionResult> {
  let context: VerifiedCommandContext
  try { context = await deps.authorizeCommand(input, identity) } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    if (reason === 'AUTHORIZATION_REQUIRED' || reason === 'COMMAND_FORBIDDEN' || reason === 'EXPECTED_VERSION_CONFLICT' || reason === 'INPUT_SCOPE_MISMATCH') {
      return { kind: 'rejected', reason }
    }
    return { kind: 'rejected', reason: 'AUTHORITY_BINDING_UNAVAILABLE' }
  }
  if (!context?.actor?.issuer || !context.actor.subject || context.actor.issuer !== identity.issuer || context.actor.subject !== identity.subject ||
      !context.projectId || !context.decisionId || !context.snapshotRef) {
    return { kind: 'rejected', reason: 'AUTHORITY_BINDING_UNAVAILABLE' }
  }
  if (context.authorityEpoch !== input.expectedAuthorityEpoch || context.ownerVersion !== input.expectedOwnerVersion ||
      context.policyVersion !== input.expectedPolicyVersion) return { kind: 'rejected', reason: 'EXPECTED_VERSION_CONFLICT' }
  try {
    const ids = (deps.ids || (() => ({ runId: randomUUID(), stageId: randomUUID(), eventId: randomUUID() })))()
    return await deps.repository.admit(input, context, hashRunCommand(input), ids)
  } catch {
    return { kind: 'rejected', reason: 'ADMISSION_UNAVAILABLE' }
  }
}
