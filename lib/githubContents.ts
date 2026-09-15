import { createSupabaseAdminClient } from '@/lib/supabase'
import { currentContentStudioExecutionStore } from '@/lib/seoFactory/contentStudioExecutionContext'
import { renewContentStudioExecution } from '@/lib/seoFactory/writingContractStore'
import * as core from './githubContentsCore'

export * from './githubContentsCore'

/**
 * Strict Content Studio writes are fenced at the Git mutation door, not merely
 * when authoring starts. Renewing here both proves the exact owner/attempt is
 * still current and gives the following bounded Git operation a fresh lease.
 * Legacy/non-Content-Studio callers retain the historical helper behavior.
 */
async function assertGitMutationLease(): Promise<void> {
  const store = currentContentStudioExecutionStore()
  if (!store?.state.strict) return
  if (!store.active) {
    throw new Error('strict Content Studio Git mutation blocked: execution window already closed')
  }
  const state = store.state
  if (state.executionLeaseLostReason) {
    throw new Error(`strict Content Studio Git mutation blocked: execution lease lost: ${state.executionLeaseLostReason}`)
  }
  if (
    !state.executionJobId
    || !state.contractId
    || !state.contractHash
    || !state.executionOwner
    || !Number.isInteger(state.executionAttempt)
  ) {
    throw new Error('strict Content Studio Git mutation blocked: execution fencing identity is incomplete')
  }

  const expiresAt = await renewContentStudioExecution(createSupabaseAdminClient(), {
    jobId: state.executionJobId,
    contractId: state.contractId,
    contractHash: state.contractHash,
    owner: state.executionOwner,
    attempt: Number(state.executionAttempt),
  })
  state.executionLeaseExpiresAt = expiresAt
}

export async function githubFetch(
  path: Parameters<typeof core.githubFetch>[0],
  init: Parameters<typeof core.githubFetch>[1] = {},
): ReturnType<typeof core.githubFetch> {
  const method = String(init?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') await assertGitMutationLease()
  return core.githubFetch(path, init)
}

export async function createBranchFrom(
  ...args: Parameters<typeof core.createBranchFrom>
): ReturnType<typeof core.createBranchFrom> {
  await assertGitMutationLease()
  return core.createBranchFrom(...args)
}

export async function deleteRepoFile(
  ...args: Parameters<typeof core.deleteRepoFile>
): ReturnType<typeof core.deleteRepoFile> {
  await assertGitMutationLease()
  return core.deleteRepoFile(...args)
}

export async function putRepoFile(
  ...args: Parameters<typeof core.putRepoFile>
): ReturnType<typeof core.putRepoFile> {
  await assertGitMutationLease()
  return core.putRepoFile(...args)
}

export async function updatePullRequestBranch(
  ...args: Parameters<typeof core.updatePullRequestBranch>
): ReturnType<typeof core.updatePullRequestBranch> {
  await assertGitMutationLease()
  return core.updatePullRequestBranch(...args)
}

export async function mergePullRequest(
  ...args: Parameters<typeof core.mergePullRequest>
): ReturnType<typeof core.mergePullRequest> {
  await assertGitMutationLease()
  return core.mergePullRequest(...args)
}

export async function openPullRequest(
  ...args: Parameters<typeof core.openPullRequest>
): ReturnType<typeof core.openPullRequest> {
  await assertGitMutationLease()
  return core.openPullRequest(...args)
}
