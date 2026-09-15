// Public writing-contract store boundary. The byte-preserved implementation is
// retained in writingContractStoreCore; execution claims add an explicit recovery
// intent so failed jobs can be reacquired without making arbitrary terminal rows
// generally claimable.
export * from './writingContractStoreCore'

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import * as core from './writingContractStoreCore'

const recoveryClaim = new AsyncLocalStorage<boolean>()

export function runWithContentStudioRecoveryClaim<T>(fn: () => T): T {
  return recoveryClaim.run(true, fn)
}

function boundedLeaseSeconds(value?: number): number {
  return Math.max(60, Math.min(Number(value || core.DEFAULT_CONTENT_STUDIO_LEASE_SECONDS), 3600))
}

export async function claimContentStudioExecution(
  db: core.WritingContractDb,
  input: Parameters<typeof core.claimContentStudioExecution>[1] & { allowFailedRetry?: boolean },
): Promise<core.ContentStudioExecutionClaim> {
  const owner = String(input.owner || randomUUID()).trim()
  const allowFailedRetry = input.allowFailedRetry === true || recoveryClaim.getStore() === true
  const result = await db.rpc('claim_content_studio_execution', {
    p_job_id: input.jobId,
    p_contract_id: input.contractId,
    p_contract_hash: input.contractHash,
    p_execution_owner: owner,
    p_lease_seconds: boundedLeaseSeconds(input.leaseSeconds),
    p_allow_failed_retry: allowFailedRetry,
  })
  if (result.error) {
    throw new core.ContentStudioExecutionClaimError(`execution claim failed: ${result.error.message}`)
  }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as Record<string, unknown> | null
  if (!row?.execution_owner || !Number.isInteger(Number(row.execution_attempt))) {
    throw new core.ContentStudioExecutionClaimError('execution already active or not claimable for this contracted job')
  }
  return {
    owner: String(row.execution_owner),
    attempt: Number(row.execution_attempt),
    leaseExpiresAt: row.execution_lease_expires_at ? String(row.execution_lease_expires_at) : null,
  }
}
