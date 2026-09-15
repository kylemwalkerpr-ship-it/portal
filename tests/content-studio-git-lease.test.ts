jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/githubContentsCore', () => ({
  githubFetch: jest.fn(),
  createBranchFrom: jest.fn(),
  deleteRepoFile: jest.fn(),
  putRepoFile: jest.fn(),
  updatePullRequestBranch: jest.fn(),
  mergePullRequest: jest.fn(),
  openPullRequest: jest.fn(),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import * as core from '@/lib/githubContentsCore'
import { putRepoFile } from '@/lib/githubContents'
import {
  createContentStudioExecutionState,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'

function strictState() {
  return createContentStudioExecutionState(true, {
    contractId: 'contract-1',
    contractHash: 'hash-1',
    opportunityId: 'opp-1',
    executionJobId: '00000000-0000-0000-0000-000000000001',
    executionOwner: 'owner-a',
    executionAttempt: 4,
    executionLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
}

const putArgs = {
  owner: 'owner',
  repo: 'repo',
  path: 'app/page.tsx',
  branch: 'feature/test',
  content: 'article',
  message: 'test',
}

describe('Git mutation execution fencing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(core.putRepoFile).mockResolvedValue({
      commitSha: 'a'.repeat(40),
      updated: false,
      path: putArgs.path,
      branch: putArgs.branch,
      attempts: 1,
    })
  })

  test('renews the exact owner/attempt immediately before a strict Git write', async () => {
    const db = {
      rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe('renew_content_studio_execution')
        expect(args).toMatchObject({
          p_execution_owner: 'owner-a',
          p_execution_attempt: 4,
          p_contract_id: 'contract-1',
          p_contract_hash: 'hash-1',
        })
        return { data: [{ execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString() }], error: null }
      }),
      from: jest.fn(),
    } as any
    jest.mocked(createSupabaseAdminClient).mockReturnValue(db)

    await runInContentStudioExecution(strictState(), async () => {
      await expect(putRepoFile(putArgs)).resolves.toMatchObject({ commitSha: 'a'.repeat(40) })
    })
    expect(core.putRepoFile).toHaveBeenCalledTimes(1)
  })

  test('a stale/expired owner is blocked before the core Git write', async () => {
    const db = {
      rpc: jest.fn(async () => ({ data: [], error: null })),
      from: jest.fn(),
    } as any
    jest.mocked(createSupabaseAdminClient).mockReturnValue(db)

    await expect(runInContentStudioExecution(strictState(), async () => {
      await putRepoFile(putArgs)
    })).rejects.toThrow(/stale|expired|lease/i)
    expect(core.putRepoFile).not.toHaveBeenCalled()
  })

  test('a delayed callback inherited from a completed execution cannot write Git', async () => {
    const db = {
      rpc: jest.fn(async () => ({ data: [{ execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString() }], error: null })),
      from: jest.fn(),
    } as any
    jest.mocked(createSupabaseAdminClient).mockReturnValue(db)

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let delayed!: Promise<unknown>
    await runInContentStudioExecution(strictState(), async () => {
      delayed = gate.then(() => putRepoFile(putArgs))
    })

    release()
    await expect(delayed).rejects.toThrow(/window already closed/i)
    expect(core.putRepoFile).not.toHaveBeenCalled()
  })
})
