/**
 * Server-side enforcement: the Content Studio jobs API must refuse to merge a
 * PR / bulk-approve a draft unless the job's persisted audit carries a CURRENT
 * ship-gate pass (shipReady === true && blockers === 0). Unknown audit state is
 * a FAIL — mergePullRequest must never run for an ungated row.
 *
 * Contracted success paths use a persisted contract identity, execution lease,
 * and a valid publication manifest. Requests use the real NextRequest
 * implementation so clone()/body semantics match the production route.
 */
import { NextRequest } from 'next/server'
import { PATCH, POST } from '@/app/api/content-studio/jobs/route'
import {
  artifactContentHash,
  buildExpectedRevisionMarker,
  buildPublicationApprovalManifest,
  publicationBodyHash,
  publicationMarkerForContent,
  recordPublicationRenderedArtifact,
} from '@/lib/seoFactory/publicationProof'

const mockRequireAdminUser = jest.fn(async () => ({
  db: {},
  profile: {},
  profileId: 'p_admin',
  role: 'admin',
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))

const mockMergePullRequest = jest.fn()
const mockShipContent = jest.fn()
jest.mock('@/lib/seoFactory/ship', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ship')
  return {
    ...actual,
    mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
    shipContent: (...args: unknown[]) => mockShipContent(...args),
  }
})

jest.mock('@/lib/seoFactory/deployMonitor', () => ({
  monitorContentJob: jest.fn(async () => ({ ok: true })),
}))

const mockLoadWritingContract = jest.fn()
const mockClaimExecution = jest.fn(async (_db?: unknown, input?: any) => {
  const leaseExpiresAt = new Date(Date.now() + 900_000).toISOString()
  const jobId = String(input?.jobId || '')
  const row = supabaseClient?.__builder?._rows?.get(jobId)
  if (row) {
    supabaseClient.__builder._rows.set(jobId, {
      ...row,
      execution_owner: 'test-execution-owner',
      execution_attempt: 5,
      execution_lease_expires_at: leaseExpiresAt,
    })
  }
  return {
    owner: 'test-execution-owner',
    attempt: 5,
    leaseExpiresAt,
  }
})
const mockAssertExecution = jest.fn(async (_db?: unknown, _input?: unknown) => undefined)
const mockReleaseExecution = jest.fn(async (_db?: unknown, _input?: unknown) => true)
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  loadWritingContract: (db: unknown, input: unknown) => mockLoadWritingContract(db, input),
  claimContentStudioExecution: (db: unknown, input: unknown) => mockClaimExecution(db, input),
  assertContentStudioExecution: (db: unknown, input: unknown) => mockAssertExecution(db, input),
  releaseContentStudioExecution: (db: unknown, input: unknown) => mockReleaseExecution(db, input),
}))

const mockGithubFetch = jest.fn()
const mockGetRepoFileContent = jest.fn()
jest.mock('@/lib/githubContents', () => {
  const actual = jest.requireActual('@/lib/githubContents')
  return {
    ...actual,
    githubFetch: (...args: unknown[]) => mockGithubFetch(...args),
    getRepoFileContent: (...args: unknown[]) => mockGetRepoFileContent(...args),
  }
})

const makeSupabaseClient = () => {
  const builder: Record<string, any> = {
    _updated: false,
    _rows: new Map<string, Record<string, any>>(),
    _key: '',
    _patch: null,
    select: () => builder,
    eq: (k: string, v: unknown) => {
      if (k === 'id') builder._key = String(v)
      return builder
    },
    gt: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    _resolve: () => {
      const prior = builder._rows.get(builder._key) ?? null
      if (!builder._updated) return prior
      if (!prior) return null
      const updated = { ...prior, ...(builder._patch || {}) }
      builder._rows.set(builder._key, updated)
      return updated
    },
    maybeSingle: () => Promise.resolve({ data: builder._resolve(), error: null }),
    single: () => Promise.resolve({ data: builder._resolve(), error: null }),
    update: (patch: Record<string, unknown>) => {
      builder._updated = true
      builder._patch = patch
      return builder
    },
    insert: () => builder,
    delete: () => builder,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: builder._resolve(), error: null }).then(resolve),
  }
  const client = {
    from: (_t: string) => {
      builder._updated = false
      builder._key = ''
      builder._patch = null
      return builder
    },
  }
  ;(client as any).__builder = builder
  return client
}

let supabaseClient: any
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => supabaseClient) }))

/**
 * Exact-live registry owner fixture (registry id 3, confirmed/keep; live URL
 * answers 200 exactly). The P0 global publication freeze re-resolves ownership
 * on direct existing-PR merges and requires both static authority and an exact
 * live existence proof, so this file mocks global fetch — no real network.
 */
const F1_KEYWORD = 'f-1 document checklist'
const F1_CANONICAL = 'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
const liveFetchMock = jest.fn()
const originalFetch = global.fetch

const APPROVED_HEAD_SHA = 'approved-head-sha-123'
function contractIdFor(id: string) { return `contract-${id}` }
function contractHashFor(id: string) { return `contract-hash-${id}` }

function mkContent(): string {
  const sections = ['Overview', 'Eligibility', 'Required Documents', 'Application Steps', 'Processing Times', 'Fees and Costs', 'Common Mistakes', 'FAQ']
  const para = (n: number) => Array.from(
    { length: n },
    (_, i) => `Canada study permit applicants must understand the eligibility rules and document requirements before submission ${i + 1}. Processing times vary by visa office and season, so start early.`,
  ).join(' ')
  const body = sections.map((s) => `## ${s}\n\n${para(30)}`).join('\n\n')
  return `---\ntitle: Canada Study Permit Guide 2026\ndescription: Step-by-step Canada study permit application guide\n---\n\n# Canada Study Permit Guide\n\nIn 60 seconds, here is the quick answer for study permit applicants.\n\n${body}\n`
}

function artifactFor(content: string, marker: string): string {
  return `export const metadata = { other: { "content-studio-revision": ${JSON.stringify(marker)} } }\n${content}`
}

function manifestFor(id: string, content: string, prNumber: number | null = 12) {
  const contractId = contractIdFor(id)
  const contractHash = contractHashFor(id)
  const opportunityId = `opportunity-${id}`
  const expectedMarker = buildExpectedRevisionMarker({ contractId, contractHash, opportunityId, content })
  const artifact = artifactFor(content, expectedMarker)
  return buildPublicationApprovalManifest({
    jobId: id,
    contractId,
    contractHash,
    opportunityId,
    repoOwner: 'caseworks',
    repoName: 'caseworks',
    path: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
    canonical: F1_CANONICAL,
    expectedMarker,
    content,
    approvedContentHash: artifactContentHash(content),
    approvedArtifactHash: artifactContentHash(artifact),
    approvedBodyHash: publicationBodyHash(content),
    approvalActor: 'p_admin',
    prNumber,
    approvedHeadSha: prNumber ? APPROVED_HEAD_SHA : null,
  })
}

function baseJob(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'j1',
    title: 'F-1 Document Checklist',
    // Exact-live registry-backed keyword (registry id 3) so the P0 global
    // publication freeze's fresh ownership re-resolution accepts the persisted
    // destination on direct existing-PR merges (a synthetic unowned destination
    // now fails closed; registry agreement alone is not live proof).
    topic: F1_KEYWORD,
    primary_keyword: F1_KEYWORD,
    content_type: 'legal_guide',
    region: 'US',
    status: 'pr_created',
    pr_number: 12,
    target_repo: 'caseworks/caseworks',
    canonical_url: F1_CANONICAL,
    content_path: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
    content: mkContent(),
    audit_json: { score: 96, blockers: [] },
    ai_provider: 'grok',
    actual_provider: 'grok',
    requested_model: 'grok-4.6',
    actual_model: 'grok-4.6',
    provider_error_class: null,
    ...overrides,
  }
}

function contractedJob(overrides: Record<string, unknown> = {}): Record<string, any> {
  const seed = baseJob(overrides)
  const id = String(seed.id)
  const content = String(seed.content || '')
  const existingAudit = seed.audit_json && typeof seed.audit_json === 'object' ? seed.audit_json : {}
  return {
    ...seed,
    contract_id: contractIdFor(id),
    contract_hash: contractHashFor(id),
    contract_version: 1,
    opportunity_id: `opportunity-${id}`,
    audit_json: { ...existingAudit, publicationManifest: manifestFor(id, content, seed.pr_number ? Number(seed.pr_number) : null) },
  }
}

function request(method: 'PATCH' | 'POST', body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/content-studio/jobs', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function patch(body: Record<string, unknown>) { return PATCH(request('PATCH', body)) }
function post(body: Record<string, unknown>) { return POST(request('POST', body)) }

beforeEach(() => {
  jest.clearAllMocks()
  supabaseClient = makeSupabaseClient()
  liveFetchMock.mockReset()
  liveFetchMock.mockResolvedValue({ ok: true, status: 200, url: F1_CANONICAL })
  ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
  require('@/lib/seoFactory/broadCreateFreeze').resetBroadCreateLiveCache?.()
  mockMergePullRequest.mockResolvedValue({ merged: true, sha: 'sha123', message: 'merged' })
  mockLoadWritingContract.mockImplementation(async (_db: unknown, input: any) => ({
    schemaVersion: 2,
    contractVersion: 1,
    contractId: input.contractId,
    contractHash: input.contractHash,
    opportunity: { id: `opportunity-${String(input.jobId || 'j1')}`, jurisdiction: 'CA' },
    ownership: null,
    requestedModel: null,
    brief: null,
  }))
  mockGithubFetch.mockResolvedValue({ head: { sha: APPROVED_HEAD_SHA } })
  mockGetRepoFileContent.mockImplementation(async (_owner: string, _repo: string, _path: string, _ref: string) => {
    const content = mkContent()
    const marker = buildExpectedRevisionMarker({
      contractId: contractIdFor('j1'),
      contractHash: contractHashFor('j1'),
      opportunityId: 'opportunity-j1',
      content,
    })
    return artifactFor(content, marker)
  })
  mockShipContent.mockImplementation(async (opts: any) => {
    const content = String(opts.content || '')
    const marker = publicationMarkerForContent(content)
    recordPublicationRenderedArtifact(artifactFor(content, String(marker || '')), content)
    return {
      status: 'pr_created',
      path: 'app/ca/study-permit/page.tsx',
      canonicalUrl: 'https://yousafeconsultancy.com/ca/study-permit/',
      owner: 'caseworks',
      repo: 'caseworks',
      prUrl: 'https://github.com/caseworks/caseworks/pull/42',
      prNumber: 42,
      branch: 'content-studio/study-permit',
      commitSha: 'ship-head-sha-42',
      mode: 'pr',
    }
  })
})

afterAll(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
})

describe('PATCH merge_pr — refuses an ungated PR', () => {
  it('returns 409 and never calls mergePullRequest when audit_json has NO shipReady (UNKNOWN)', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob())
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('returns 409 when the audit explicitly reports shipReady=false', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 100, shipReady: false, blockers: 0 } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('returns 409 when blockers remain even at shipReady=true', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 100, shipReady: true, blockers: 1 } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(409)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('merges a contracted PR only when gate and persisted publication manifest both pass', async () => {
    supabaseClient.__builder._rows.set('j1', contractedJob({ audit_json: { score: 88, shipReady: true, blockers: 0 } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(200)
    expect(mockLoadWritingContract).toHaveBeenCalled()
    expect(mockGithubFetch).toHaveBeenCalled()
    expect(mockMergePullRequest).toHaveBeenCalledWith(expect.objectContaining({ owner: 'caseworks', repo: 'caseworks', prNumber: 12 }))
    expect(mockClaimExecution).toHaveBeenCalled()
    expect(mockReleaseExecution).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ owner: 'test-execution-owner', attempt: 5 }))
    expect((await res.json()).ok).toBe(true)
  })

  it('merges a contracted PR when blockers is an empty array and its manifest matches the PR head', async () => {
    supabaseClient.__builder._rows.set('j1', contractedJob({ audit_json: { score: 88, shipReady: true, blockers: [] } }))
    const res = await patch({ id: 'j1', action: 'merge_pr' })
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalled()
  })
})

describe('PATCH approve — PR-merge shortcut (no editor content) refuses an ungated PR', () => {
  it('returns 409 instead of merging the existing PR when the gate is not cleared', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 96, blockers: [] } }))
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('returns 409 when shipping content was requested but persisted gate is not cleared (P1-SHIP-1)', async () => {
    supabaseClient.__builder._rows.set('j1', baseJob({ audit_json: { score: 96, blockers: [] } }))
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true, content: 'approved full body content' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ship gate not cleared')
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('ships contracted content and persists exact-renderer publication proof when gate is true', async () => {
    supabaseClient.__builder._rows.set('j1', contractedJob({ status: 'drafting', pr_number: null, audit_json: { score: 96, shipReady: true, blockers: [] } }))
    const res = await patch({ id: 'j1', action: 'approve', humanApproved: true, content: mkContent() })
    expect(res.status).toBe(200)
    expect(mockLoadWritingContract).toHaveBeenCalled()
    expect(mockShipContent).toHaveBeenCalled()
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect((await res.json()).ok).toBe(true)
    expect(supabaseClient.__builder._patch.audit_json.publicationManifest).toEqual(expect.objectContaining({
      contractId: contractIdFor('j1'),
      approvedContentHash: expect.any(String),
      approvedArtifactHash: expect.any(String),
      approvedBodyHash: expect.any(String),
    }))
  })
})

describe('POST bulk_approve — never ships an ungated row', () => {
  it('returns 409 when every requested id failed the ship gate', async () => {
    supabaseClient.__builder._rows.set('g1', baseJob({ id: 'g1', audit_json: { score: 100, blockers: [] } }))
    supabaseClient.__builder._rows.set('g2', baseJob({ id: 'g2', audit_json: { score: 88, shipReady: false, blockers: 0 } }))
    const res = await post({ action: 'bulk_approve', ids: ['g1', 'g2'] })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Ship gate not cleared')
    expect(body.skipped).toEqual(['g1', 'g2'])
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('skips only the failing id and ships the contracted gated one, returning skipped in JSON', async () => {
    supabaseClient.__builder._rows.set('bad', baseJob({ id: 'bad', audit_json: { score: 100, blockers: [] } }))
    supabaseClient.__builder._rows.set('good', contractedJob({ id: 'good', status: 'drafting', pr_number: null, audit_json: { score: 88, shipReady: true, blockers: 0 } }))
    const res = await post({ action: 'bulk_approve', ids: ['bad', 'good'] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toEqual(['bad'])
    expect(body.succeeded).toBe(1)
    expect(body.failed).toBe(0)
    expect(mockShipContent).toHaveBeenCalledTimes(1)
    const results = body.results as Array<{ id: string; skipped?: boolean; ok: boolean; error?: string }>
    expect(results.find((r) => r.id === 'bad')).toMatchObject({ ok: false, skipped: true, error: 'Ship gate not cleared' })
    expect(results.find((r) => r.id === 'good')?.ok).toBe(true)
  })
})

describe('PATCH save — protects gate state and accepted content', () => {
  it('merges bare auditContent overlay over prior gate fields', async () => {
    const priorAudit = {
      score: 96,
      shipReady: true,
      blockers: [],
      contentSpec: { version: 'cs-1', outline: [{ heading: 'Overview' }] },
      contentLoop: { action: 'fix_until_gates', status: 'cleared' },
      model: 'grok',
    }
    supabaseClient.__builder._rows.set('j1', baseJob({ status: 'drafting', pr_number: null, audit_json: priorAudit }))
    const res = await patch({ id: 'j1', action: 'save', content: mkContent() })
    expect(res.status).toBe(200)
    const patchWritten = supabaseClient.__builder._patch
    expect(patchWritten).toBeTruthy()
    expect(patchWritten.audit_json.shipReady).toBe(true)
    expect(patchWritten.audit_json.contentSpec).toEqual(priorAudit.contentSpec)
    expect(patchWritten.audit_json.contentLoop).toEqual(priorAudit.contentLoop)
  })

  it('refuses a thin public PATCH overwrite of a substantial accepted draft', async () => {
    const substantial = 'Applicants must confirm current eligibility and documentary requirements before filing. '.repeat(180)
    supabaseClient.__builder._rows.set('j1', baseJob({ status: 'drafting', pr_number: null, content: substantial, word_count: 1248 }))
    const res = await patch({ id: 'j1', action: 'save', content: 'This is a failed replacement stub. '.repeat(25) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('thin_overwrite_refused')
    expect(body.error).toMatch(/Refused thin overwrite/)
    expect(supabaseClient.__builder._updated).toBe(false)
  })
})