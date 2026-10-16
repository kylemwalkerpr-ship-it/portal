import { isAdmissionResult, type AdmissionResult, type RunCommandInput, type VerifiedCommandContext } from './contracts'

export interface RpcTransport {
  rpc(name: 'studio_core.admit_run', args: {
    p_command: RunCommandInput
    p_context: VerifiedCommandContext
    p_request_hash: string
    p_run_id: string
    p_stage_id: string
    p_event_id: string
  }): Promise<{ data: unknown; error: unknown | null }>
}
export interface StudioRunRepository {
  admit(command: RunCommandInput, context: VerifiedCommandContext, requestHash: string,
    ids: { runId: string; stageId: string; eventId: string }): Promise<AdmissionResult>
}

/** One typed RPC only; this adapter never emulates a transaction with REST inserts. */
export function createStudioRunRepository(transport: RpcTransport): StudioRunRepository {
  return {
    async admit(command, context, requestHash, ids) {
      const result = await transport.rpc('studio_core.admit_run', {
        p_command: command, p_context: context, p_request_hash: requestHash,
        p_run_id: ids.runId, p_stage_id: ids.stageId, p_event_id: ids.eventId,
      })
      if (result.error || !isAdmissionResult(result.data)) throw new Error('ADMISSION_UNAVAILABLE')
      return result.data
    },
  }
}
