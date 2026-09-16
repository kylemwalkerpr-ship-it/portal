import { NextRequest } from 'next/server'
import { artifactContentHash, publicationBodyHash, buildExpectedRevisionMarker, buildPublicationApprovalManifest, publicationMarkerForContent, recordPublicationRenderedArtifact } from '@/lib/seoFactory/publicationProof'

const mockRequireAdminUser = jest.fn(async () => ({
  profileId: 'admin-1',
  profile: { clerk_user_id: 'admin-1' },
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))

const mockLoadWritingContract = jest.fn()
jest.mock('@/lib/seoFactory/writingContractStore', () => {
  const actual = jest.requireActual('@/lib/seoFactory/writingContractStore')
  return { ...actual, loadWritingContract: (...args: unknown[]) => mockLoadWritingContract(...args) }
})

const mockShipContent = jest.fn()
const mockMergePullRequest = jest.fn()
jest.mock('@/lib/seoFactory/ship', () => ({
  shipContent: (...args: unknown[]) => mockShipContent(...args),
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  revertContent: jest.fn(),
  parseRepoSlug: (value: string) => {
    const [owner = 'kylemwalkerpr-ship-it', repo = 'portal'] = String(value || '').replace(/^https?:\/\/github\.com\//, '').split('/')
    return { owner, repo }
  },
}))

const plan = {
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/manual/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/manual/',
  indexable: true,
  blockers: [],
  // Genuine existing owner for the P0 global publication freeze: the direct
  // merge gate re-resolves via this mocked resolver and requires the persisted
  // canonical to equal the matched registry owner URL.
  matched: { id: 1, owner_url: 'https://legal.yousafeconsultancy.com/us/manual/' },
  routingSource: 'registry_owner_url',
  action: 'expand',
}
jest.mock('@/lib/seoFactory/ownership', () => ({ resolveOwner: jest.fn(async () => plan) }))
jest.mock('@/lib/seoFactory/audit', () => ({
  auditContent: jest.fn(() => ({ score: 100, wordCount: 320, blockers: [], warnings: [] })),
}))
jest.mock('@/lib/seoFactory/editorialScaffold', () => ({
  applyDeterministicRepairs: jest.fn(({ content }: { content: string }) => ({ content, applied: [] })),
}))
jest.mock('@/lib/seoFactory/keywordContract', () => ({
  resolveKeywordContract: jest.fn(() => ({
    requiredShortKeywords: [], requiredLongTailKeywords: [], backfilled: false,
    shortKeywordTerms: [], longTailKeywordTerms: [],
  })),
}))
jest.mock('@/lib/seoFactory/deployMonitor', () => ({ monitorContentJob: jest.fn(async () => ({ ok: true })) }))
jest.mock('@/lib/seoFactory/specialistFeeds', () => ({ enqueueAuthorityMultiplexerSignal: jest.fn(async () => undefined) }))
jest.mock('@/lib/seoFactory/storedJobExecution', () => ({ runStoredContentJob: jest.fn() }))
jest.mock('@/lib/githubContents', () => ({ githubFetch: jest.fn(), getRepoFileContent: jest.fn() }))
jest.mock('@/lib/seoFactory/jobShipGate', () => {
  const actual = jest.requireActual('@/lib/seoFactory/jobShipGate')
  return { ...actual, jobPassesShipGate: jest.fn(() => true) }
})

/**
 * The P0 global publication freeze re-checks an exact live existence proof for
 * the resolved owner on direct existing-PR merges. This file's resolver is
 * mocked with a synthetic owner, so the live probe is mocked as an exact 200 —
 * no real network request is ever made.
 */
const liveFetchMock = jest.fn(async (url: string) => ({ ok: true, status: 200, url: String(url) }))
const originalFetch = global.fetch
;(global as unknown as { fetch: unknown }).fetch = liveFetchMock

afterAll(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
})

const jobId = '00000000-0000-0000-0000-000000000199'
const contract = {
  contractId: 'contract-manual-fence-1',
  contractHash: 'hash-manual-fence-1',
  opportunity: { id: 'opp-manual-fence-1', jurisdiction: 'US' },
  ownership: plan,
  requestedModel: null,
  brief: { outline: [] },
} as any

function baseJob() {
  return {
    id: jobId,
    contract_id: contract.contractId,
    contract_hash: contract.contractHash,
    opportunity_id: contract.opportunity.id,
    execution_owner: null,
    execution_attempt: 2,
    execution_lease_expires_at: null,
    target_repo: 'caseworks/caseworks',
    owner_host: plan.host,
    content_path: plan.filePath,
    canonical_url: plan.canonicalUrl,
    status: 'drafting',
    content: 'Approved article body with enough substance for the manual publication path.',
    title: 'Manual publication fencing guide',
    topic: 'manual publication fencing guide',
    primary_keyword: 'manual publication fencing guide',
    region: 'US',
    content_type: 'legal_guide',
    tone: 'educational',
    indexable: true,
    audit_json: { shipReady: true, blockersCount: 0, score: 100 },
    pr_number: null,
    pr_url: null,
    branch_name: null,
    deploy_sha: null,
    merged_at: null,
    deployed_at: null,
    error_message: null,
    ship_mode: 'autodeploy',
    required_short_keywords: [],
    required_long_tail_keywords: [],
    short_keyword_terms: [],
    long_tail_keyword_terms: [],
  } as Record<string, any>
}

type Condition = { kind: 'eq' | 'gt'; key: string; value: unknown }

function makeDb() {
  const state = { row: baseJob(), updates: [] as Array<Record<string, unknown>> }
  const db: any = {
    rpc: jest.fn(async (fn: string, args: Record<string, any>) => {
      if (fn === 'claim_content_studio_execution') {
        state.row.execution_owner = String(args.p_execution_owner || 'manual-owner-a')
        state.row.execution_attempt = 3
        state.row.execution_lease_expires_at = new Date(Date.now() + 900_000).toISOString()
        return {
          data: [{
            execution_owner: state.row.execution_owner,
            execution_attempt: state.row.execution_attempt,
            execution_lease_expires_at: state.row.execution_lease_expires_at,
          }],
          error: null,
        }
      }
      if (fn === 'check_content_studio_execution') {
        const ok = state.row.id === args.p_job_id
          && state.row.contract_id === args.p_contract_id
          && state.row.contract_hash === args.p_contract_hash
          && state.row.execution_owner === args.p_execution_owner
          && state.row.execution_attempt === args.p_execution_attempt
          && Date.parse(String(state.row.execution_lease_expires_at || '')) > Date.now()
        return { data: ok, error: null }
      }
      if (fn === 'release_content_studio_execution') {
        const ok = state.row.id === args.p_job_id
          && state.row.execution_owner === args.p_execution_owner
          && state.row.execution_attempt === args.p_execution_attempt
        return { data: ok, error: null }
      }
      if (fn === 'renew_content_studio_execution') {
        return { data: [{ execution_lease_expires_at: state.row.execution_lease_expires_at }], error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: jest.fn((table: string) => {
      if (table !== 'content_jobs') throw new Error(`unexpected table ${table}`)
      let mode: 'read' | 'update' = 'read'
      let patch: Record<string, unknown> = {}
      const conditions: Condition[] = []
      const q: any = {}
      q.select = jest.fn(() => q)
      q.update = jest.fn((value: Record<string, unknown>) => {
        mode = 'update'
        patch = value
        return q
      })
      q.eq = jest.fn((key: string, value: unknown) => {
        conditions.push({ kind: 'eq', key, value })
        return q
      })
      q.gt = jest.fn((key: string, value: unknown) => {
        conditions.push({ kind: 'gt', key, value })
        return q
      })
      const matches = () => conditions.every((condition) => {
        if (condition.kind === 'eq') return state.row[condition.key] === condition.value
        return String(state.row[condition.key] || '') > String(condition.value || '')
      })
      const execute = () => {
        const matched = matches()
        if (mode === 'update' && matched) {
          state.updates.push({ ...patch })
          Object.assign(state.row, patch)
        }
        return { data: matched ? { ...state.row } : null, error: null }
      }
      q.single = jest.fn(async () => {
        const result = execute()
        return result.data ? result : { data: null, error: { message: 'no rows' } }
      })
      q.maybeSingle = jest.fn(async () => execute())
      q.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(execute()).then(resolve, reject)
      return q
    }),
    __state: state,
  }
  return db
}

let db: ReturnType<typeof makeDb>
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => db) }))

import { PATCH } from '@/app/api/content-studio/jobs/route'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/content-studio/jobs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('manual publication write fencing through the real legacy handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db = makeDb()
    mockLoadWritingContract.mockResolvedValue(contract)
  })

  test('stale attempt A cannot mark replacement attempt B failed after ship/Git rejection', async () => {
    mockShipContent.mockImplementation(async () => {
      db.__state.row.execution_owner = 'manual-owner-b'
      db.__state.row.execution_attempt = 4
      db.__state.row.execution_lease_expires_at = new Date(Date.now() + 900_000).toISOString()
      db.__state.row.status = 'processing'
      db.__state.row.error_message = null
      throw new Error('stale Git lease rejected before write')
    })

    const response = await PATCH(request({ id: jobId, action: 'approve', dryRun: true }))
    expect(response.status).toBe(422)
    expect(db.__state.row.execution_owner).toBe('manual-owner-b')
    expect(db.__state.row.execution_attempt).toBe(4)
    expect(db.__state.row.status).toBe('processing')
    expect(db.__state.row.error_message).toBeNull()
  })

  test('the current owner can persist successful manual finalization', async () => {
    mockShipContent.mockImplementation(async (input: any) => {
      const marker = publicationMarkerForContent(input.content)
      recordPublicationRenderedArtifact('<article data-content-studio-revision="' + marker + '">' + input.content + '</article>', input.content)
      return {
      status: 'deployed',
      mode: 'autodeploy',
      canonicalUrl: plan.canonicalUrl,
      path: plan.filePath,
      owner: 'caseworks',
      repo: 'caseworks',
      commitSha: 'commit-sha-current-owner',
      mergeCommitSha: 'commit-sha-current-owner',
    }})

    const response = await PATCH(request({ id: jobId, action: 'approve', dryRun: false }))
    expect(response.status).toBe(200)
    expect(db.__state.row.status).toBe('merged')
    expect(db.__state.row.error_message).toBeNull()
    expect(db.__state.updates.some((patch) => patch.status === 'merged')).toBe(true)
  })
  test.each(['merge_pr', 'approve'])('%s dry-run cannot merge an existing PR or finalize publication', async (action) => {
    const content = db.__state.row.content
    const marker = buildExpectedRevisionMarker({ contractId: contract.contractId, contractHash: contract.contractHash, content })
    const artifact = '<article data-content-studio-revision="' + marker + '">' + content + '</article>'
    const manifest = buildPublicationApprovalManifest({
      jobId, contractId: contract.contractId, contractHash: contract.contractHash,
      repoOwner: 'caseworks', repoName: 'caseworks', path: plan.filePath,
      canonical: plan.canonicalUrl, content, expectedMarker: marker,
      approvedContentHash: artifactContentHash(content),
      approvedArtifactHash: artifactContentHash(artifact),
      approvedBodyHash: publicationBodyHash(content),
      prNumber: 42, approvedHeadSha: 'approved-head',
    })
    Object.assign(db.__state.row, { status: 'pr_created', pr_number: 42, audit_json: { shipReady: true, publicationManifest: manifest } })
    const github = jest.requireMock('@/lib/githubContents')
    github.githubFetch.mockResolvedValue({ head: { sha: 'approved-head' } })
    github.getRepoFileContent.mockResolvedValue(artifact)
    mockMergePullRequest.mockResolvedValue({ merged: true, sha: 'unexpected-merge' })
    const response = await PATCH(request({ id: jobId, action, dryRun: true }))
    expect(response.status).toBe(200)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(db.__state.row.status).toBe('pr_created')
    expect(db.__state.updates).toEqual([])
  })

})
