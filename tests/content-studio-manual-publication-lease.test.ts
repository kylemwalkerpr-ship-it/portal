import { NextRequest, NextResponse } from 'next/server'
import { artifactContentHash } from '@/lib/seoFactory/publicationProof'
import { currentContentStudioExecution } from '@/lib/seoFactory/contentStudioExecutionContext'

const mockRequireAdminUser = jest.fn(async () => ({ profileId: 'admin-1', profile: { clerk_user_id: 'admin-1' } }))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))

const mockLegacyPatch = jest.fn()
jest.mock('@/app/api/content-studio/jobs/legacy', () => ({
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: (...args: unknown[]) => mockLegacyPatch(...args),
}))

const mockLoadWritingContract = jest.fn()
jest.mock('@/lib/seoFactory/writingContractStore', () => {
  const actual = jest.requireActual('@/lib/seoFactory/writingContractStore')
  return { ...actual, loadWritingContract: (...args: unknown[]) => mockLoadWritingContract(...args) }
})

const mockGithubFetch = jest.fn()
const mockGetRepoFileContent = jest.fn()
jest.mock('@/lib/githubContents', () => ({
  githubFetch: (...args: unknown[]) => mockGithubFetch(...args),
  getRepoFileContent: (...args: unknown[]) => mockGetRepoFileContent(...args),
}))

jest.mock('@/lib/seoFactory/storedJobExecution', () => ({ runStoredContentJob: jest.fn() }))

const approvedFile = 'export const metadata = { other: { "content-studio-revision": "marker-1" } }\nexport default function Page(){return <article>Approved article body.</article>}'
const jobId = '00000000-0000-0000-0000-000000000099'
const contract = {
  contractId: 'contract-manual-1',
  contractHash: 'hash-manual-1',
  opportunity: { id: 'opp-manual-1', jurisdiction: 'US' },
  ownership: {
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/manual/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/manual/',
  },
  requestedModel: null,
  brief: { outline: [] },
} as any
const manifest = {
  schemaVersion: 2,
  jobId,
  contractId: contract.contractId,
  contractHash: contract.contractHash,
  opportunityId: contract.opportunity.id,
  repoOwner: 'caseworks',
  repoName: 'caseworks',
  path: contract.ownership.filePath,
  canonical: contract.ownership.canonicalUrl,
  expectedMarker: 'marker-1',
  approvedContentHash: 'a'.repeat(64),
  approvedArtifactHash: artifactContentHash(approvedFile),
  approvedBodyHash: 'b'.repeat(64),
  approvedAt: '2026-09-15T00:00:00.000Z',
  approvalActor: 'admin-1',
  prNumber: 42,
  approvedHeadSha: 'approved-head-1',
  mergeSha: null,
  deploymentRunId: null,
  deploymentCommitSha: null,
  deploymentWorkflowId: null,
  deploymentWorkflowPath: null,
  deploymentJobId: null,
  deploymentEnvironment: null,
  lineageVerified: false,
  liveVerifiedAt: null,
}
const job = {
  id: jobId,
  contract_id: contract.contractId,
  contract_hash: contract.contractHash,
  opportunity_id: contract.opportunity.id,
  target_repo: 'caseworks/caseworks',
  content_path: contract.ownership.filePath,
  canonical_url: contract.ownership.canonicalUrl,
  expected_revision_marker: manifest.expectedMarker,
  pr_number: 42,
  status: 'pr_created',
  content: 'Approved article body.',
  audit_json: { publicationManifest: manifest },
}

function makeDb() {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const db: any = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'claim_content_studio_execution') {
        return { data: [{ execution_owner: 'manual-owner', execution_attempt: 3, execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString() }], error: null }
      }
      if (fn === 'release_content_studio_execution') return { data: true, error: null }
      if (fn === 'renew_content_studio_execution') {
        return { data: [{ execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString() }], error: null }
      }
      if (fn === 'check_content_studio_execution') return { data: true, error: null }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: jest.fn(() => {
      let mode: 'read' | 'update' = 'read'
      const q: any = {}
      q.select = jest.fn(() => q)
      q.update = jest.fn(() => { mode = 'update'; return q })
      q.eq = jest.fn(() => q)
      q.gt = jest.fn(() => q)
      q.single = jest.fn(async () => ({ data: mode === 'read' ? job : { id: jobId }, error: null }))
      q.maybeSingle = jest.fn(async () => ({ data: { id: jobId }, error: null }))
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
      return q
    }),
    __calls: calls,
  }
  return db
}

let db: ReturnType<typeof makeDb>
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => db) }))

import { PATCH } from '@/app/api/content-studio/jobs/route'

describe('contracted manual publication execution lease', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db = makeDb()
    mockLoadWritingContract.mockResolvedValue(contract)
    mockGithubFetch.mockResolvedValue({ head: { sha: manifest.approvedHeadSha } })
    mockGetRepoFileContent.mockResolvedValue(approvedFile)
    mockLegacyPatch.mockImplementation(async () => {
      const state = currentContentStudioExecution()
      expect(state).toMatchObject({
        strict: true,
        executionJobId: jobId,
        executionOwner: 'manual-owner',
        executionAttempt: 3,
        contractId: contract.contractId,
        contractHash: contract.contractHash,
      })
      return NextResponse.json({ ok: true, merge: { sha: 'merge-sha-1' } })
    })
  })

  test('merge_pr claims a fenced execution before delegating and releases the exact token afterward', async () => {
    const req = new NextRequest('http://localhost/api/content-studio/jobs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: jobId, action: 'merge_pr' }),
    })
    const response = await PATCH(req)
    expect(response.status).toBe(200)
    expect(mockLegacyPatch).toHaveBeenCalledTimes(1)
    expect(db.rpc).toHaveBeenCalledWith('claim_content_studio_execution', expect.objectContaining({
      p_job_id: jobId,
      p_contract_id: contract.contractId,
      p_contract_hash: contract.contractHash,
    }))
    expect(db.rpc).toHaveBeenCalledWith('release_content_studio_execution', expect.objectContaining({
      p_job_id: jobId,
      p_execution_owner: 'manual-owner',
      p_execution_attempt: 3,
    }))
  })
})
