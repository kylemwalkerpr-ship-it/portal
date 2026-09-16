/**
 * P0 global publication freeze — every DIRECT existing-PR merge path must
 * re-resolve current ownership (primaryKeyword/contentType/region, no hints)
 * and compare the persisted destination (`job.canonical_url`) to that
 * authority BEFORE calling mergePullRequest. Unowned / mismatched / blank
 * destinations fail closed; the explicit P13 unlock is the only bypass.
 *
 * Covered implementations:
 *   - legacyCore PATCH action=merge_pr
 *   - legacyCore PATCH action=approve (existing-PR shortcut)
 *   - strictManualPublication mergeExistingPr (merge_pr / approve)
 */
import { NextRequest } from 'next/server'
import { BROAD_CREATE_UNLOCK_ENV } from '@/lib/seoFactory/broadCreateFreeze'

const mockRequireAdminUser = jest.fn(async () => ({
  profileId: 'admin-1',
  profile: { clerk_user_id: 'admin-1' },
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: () => mockRequireAdminUser() }))

const mockMergePullRequest = jest.fn(async (..._args: unknown[]) => ({
  merged: true,
  sha: 'merge-sha',
  message: 'merged',
}))
const mockShipContent = jest.fn(async (..._args: unknown[]) => ({ status: 'deployed' }))
jest.mock('@/lib/seoFactory/ship', () => ({
  shipContent: (...args: unknown[]) => mockShipContent(...args),
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  revertContent: jest.fn(),
  parseRepoSlug: (value: string) => {
    const raw = String(value || '')
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
    if (raw.includes('/')) {
      const [owner, repo] = raw.split('/')
      return { owner, repo }
    }
    return { owner: 'kylemwalkerpr-ship-it', repo: raw }
  },
}))

jest.mock('@/lib/seoFactory/deployMonitor', () => ({
  monitorContentJob: jest.fn(async () => ({ ok: true })),
}))
jest.mock('@/lib/seoFactory/specialistFeeds', () => ({
  enqueueAuthorityMultiplexerSignal: jest.fn(async () => undefined),
}))
jest.mock('@/lib/seoFactory/jobShipGate', () => {
  const actual = jest.requireActual('@/lib/seoFactory/jobShipGate')
  return { ...actual, jobPassesShipGate: jest.fn(() => true) }
})
jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  assertContentStudioExecution: jest.fn(async () => undefined),
}))
jest.mock('@/lib/seoFactory/editorialScaffold', () => ({
  applyDeterministicRepairs: jest.fn((o: { content: string }) => ({ applied: [], content: o.content })),
}))
jest.mock('@/lib/seoFactory/audit', () => ({
  auditContent: jest.fn(() => ({ score: 100, wordCount: 320, blockers: [], warnings: [] })),
}))
jest.mock('@/lib/seoFactory/keywordContract', () => ({
  resolveKeywordContract: jest.fn(() => ({
    requiredShortKeywords: [],
    requiredLongTailKeywords: [],
    backfilled: false,
    shortKeywordTerms: [],
    longTailKeywordTerms: [],
  })),
}))

const mockStrictState = {
  strict: true,
  executionJobId: 'job-merge-freeze-1',
  contractId: 'contract-merge-freeze-1',
  contractHash: 'hash-merge-freeze-1',
  opportunityId: 'opp-merge-freeze-1',
  executionOwner: 'merge-owner-1',
  executionAttempt: 2,
  contractOwnership: null,
}
jest.mock('@/lib/seoFactory/contentStudioExecutionContext', () => {
  const actual = jest.requireActual('@/lib/seoFactory/contentStudioExecutionContext')
  return { ...actual, currentContentStudioExecution: jest.fn(() => mockStrictState) }
})

const JOB_ID = 'job-merge-freeze-1'
/**
 * Current EXACT-LIVE registry owner (registry id 3, confirmed/keep; live URL
 * currently answers 200 exactly). Id 58 (uk spouse visa checklist) redirects
 * to a different destination today, so it is only a failure fixture.
 */
const REGISTRY_KEYWORD = 'f-1 document checklist'
const REGISTRY_OWNER_URL =
  'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
const REGISTRY_REGION = 'US'
const UNMATCHED_KEYWORD = 'uk graduate visa requirements'
const REDIRECT_TARGET_URL =
  'https://legal.yousafeconsultancy.com/ca/family/canada-spousal-sponsorship-document-checklist-2026/'

const liveFetchMock = jest.fn()
const originalFetch = global.fetch

function resetFreezeLiveCache(): void {
  const mod = require('@/lib/seoFactory/broadCreateFreeze') as {
    resetBroadCreateLiveCache?: () => void
  }
  mod.resetBroadCreateLiveCache?.()
}

function mockLive(response: { status: number; url: string }) {
  liveFetchMock.mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    url: response.url,
  })
}

function baseJob(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: JOB_ID,
    status: 'pr_created',
    pr_number: 42,
    target_repo: 'caseworks',
    title: 'Direct merge freeze probe',
    topic: REGISTRY_KEYWORD,
    primary_keyword: REGISTRY_KEYWORD,
    content_type: 'legal_guide',
    region: REGISTRY_REGION,
    canonical_url: REGISTRY_OWNER_URL,
    content_path: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
    content: 'Approved article body with enough substance for the merge gate.',
    audit_json: { score: 100, shipReady: true, blockers: 0 },
    contract_id: mockStrictState.contractId,
    contract_hash: mockStrictState.contractHash,
    opportunity_id: mockStrictState.opportunityId,
    execution_owner: mockStrictState.executionOwner,
    execution_attempt: mockStrictState.executionAttempt,
    execution_lease_expires_at: new Date(Date.now() + 900_000).toISOString(),
    ...overrides,
  }
}

type FakeDb = {
  client: any
  state: { row: Record<string, any>; updates: Array<Record<string, unknown>> }
}

function makeDb(row: Record<string, any>): FakeDb {
  const state = { row: { ...row }, updates: [] as Array<Record<string, unknown>> }
  const builder: Record<string, any> = {
    _mode: 'read' as 'read' | 'update',
    _patch: null as Record<string, unknown> | null,
    _conds: [] as Array<{ op: 'eq' | 'gt'; key: string; value: unknown }>,
    select: () => builder,
    update: (patch: Record<string, unknown>) => {
      builder._mode = 'update'
      builder._patch = patch
      return builder
    },
    eq: (key: string, value: unknown) => {
      builder._conds.push({ op: 'eq', key, value })
      return builder
    },
    gt: (key: string, value: unknown) => {
      builder._conds.push({ op: 'gt', key, value })
      return builder
    },
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    _matches: () =>
      builder._conds.every((c: { op: string; key: string; value: unknown }) =>
        c.op === 'eq'
          ? state.row[c.key] === c.value
          : String(state.row[c.key] || '') > String(c.value || ''),
      ),
    _exec: () => {
      const matched = builder._matches()
      if (builder._mode === 'update' && matched) {
        state.updates.push({ ...(builder._patch || {}) })
        Object.assign(state.row, builder._patch || {})
      }
      return { data: matched ? { ...state.row } : null, error: null }
    },
    single: async () => {
      const result = builder._exec()
      return result.data ? result : { data: null, error: { message: 'no rows' } }
    },
    maybeSingle: async () => builder._exec(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(builder._exec()).then(resolve),
  }
  const client = {
    from: () => {
      builder._mode = 'read'
      builder._patch = null
      builder._conds = []
      return builder
    },
    rpc: jest.fn(async () => ({ data: true, error: null })),
  }
  return { client, state }
}

let mockDbRef: FakeDb
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDbRef.client }))

import { PATCH as legacyJobsPatch } from '@/app/api/content-studio/jobs/legacyCore'
import { strictManualPublicationPATCH } from '@/app/api/content-studio/jobs/strictManualPublication'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/content-studio/jobs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
  liveFetchMock.mockReset()
  mockLive({ status: 200, url: REGISTRY_OWNER_URL })
  ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
  resetFreezeLiveCache()
  mockMergePullRequest.mockResolvedValue({ merged: true, sha: 'merge-sha', message: 'merged' })
})

afterEach(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
})

describe('legacyCore merge_pr — direct merge freeze', () => {
  it.each([
    ['unowned/fallback destination', { primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/uk/uk-graduate-visa-requirements/' }],
    ['canonical diverging from the matched registry owner', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-checklist-alternate/' }],
    ['blank canonical', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: null }],
  ])('refuses %s before mergePullRequest', async (_label, overrides) => {
    mockDbRef = makeDb(baseJob(overrides))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    // Static refusal: no live probe may ever be issued for an untrusted URL.
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('merges a genuine exact-live registry-backed existing destination', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
    expect(mockDbRef.state.row.status).toBe('merged')
    expect(liveFetchMock).toHaveBeenCalled()
  })

  it('lets the explicit P13 unlock bypass the freeze without any fetch', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    mockDbRef = makeDb(baseJob({ primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD }))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})

describe('legacyCore approve (existing-PR shortcut) — direct merge freeze', () => {
  it.each([
    ['unowned/fallback destination', { primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/uk/uk-graduate-visa-requirements/' }],
    ['canonical diverging from the matched registry owner', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-checklist-alternate/' }],
    ['blank canonical', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: '' }],
  ])('refuses %s before mergePullRequest', async (_label, overrides) => {
    mockDbRef = makeDb(baseJob(overrides))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('merges a genuine exact-live registry-backed existing destination', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(liveFetchMock).toHaveBeenCalled()
  })
})

describe('strictManualPublication mergeExistingPr — direct merge freeze', () => {
  it.each([
    ['unowned/fallback destination', { primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/uk/uk-graduate-visa-requirements/' }],
    ['canonical diverging from the matched registry owner', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-checklist-alternate/' }],
    ['blank canonical', { primary_keyword: REGISTRY_KEYWORD, topic: REGISTRY_KEYWORD, canonical_url: null }],
  ])('refuses %s before mergePullRequest', async (_label, overrides) => {
    mockDbRef = makeDb(baseJob(overrides))
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('refuses the approve existing-PR shortcut for an unowned destination', async () => {
    mockDbRef = makeDb(
      baseJob({ primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD }),
    )
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'approve' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('merges a genuine exact-live registry-backed existing destination', async () => {
    mockDbRef = makeDb(baseJob())
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
    expect(mockDbRef.state.row.status).toBe('merged')
    expect(liveFetchMock).toHaveBeenCalled()
  })

  it('lets the explicit P13 unlock bypass the freeze without any fetch', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = 'true'
    mockDbRef = makeDb(baseJob({ primary_keyword: UNMATCHED_KEYWORD, topic: UNMATCHED_KEYWORD }))
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(200)
    expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Live-existence enforcement for direct existing-PR merges: a statically
 * authorized destination (registry owner_url == persisted canonical) is still
 * refused BEFORE `mergePullRequest` when the live URL redirects, 404s, or the
 * probe cannot complete. Fetch is mocked; no real network request is made.
 */
describe('direct existing-PR merges — exact live existence proof before mergePullRequest', () => {
  it.each([
    ['redirects to a different destination', { status: 200, url: REDIRECT_TARGET_URL }],
    ['answers 404', { status: 404, url: REGISTRY_OWNER_URL }],
    ['answers 410', { status: 410, url: REGISTRY_OWNER_URL }],
  ])('legacyCore merge_pr refuses a statically-authorized owner whose live URL %s', async (_label, live) => {
    mockDbRef = makeDb(baseJob())
    mockLive(live)
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(liveFetchMock).toHaveBeenCalled()
  })

  it('legacyCore merge_pr refuses a statically-authorized owner when the live probe throws', async () => {
    mockDbRef = makeDb(baseJob())
    liveFetchMock.mockRejectedValue(new Error('network unreachable'))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['redirects to a different destination', { status: 200, url: REDIRECT_TARGET_URL }],
    ['answers 404', { status: 404, url: REGISTRY_OWNER_URL }],
  ])('legacyCore approve shortcut refuses a statically-authorized owner whose live URL %s', async (_label, live) => {
    mockDbRef = makeDb(baseJob())
    mockLive(live)
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
  })

  it('legacyCore approve shortcut refuses when the live probe throws', async () => {
    mockDbRef = makeDb(baseJob())
    liveFetchMock.mockRejectedValue(new Error('network unreachable'))
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['redirects to a different destination', { status: 200, url: REDIRECT_TARGET_URL }],
    ['answers 404', { status: 404, url: REGISTRY_OWNER_URL }],
  ])('strictManualPublication merge_pr refuses a statically-authorized owner whose live URL %s', async (_label, live) => {
    mockDbRef = makeDb(baseJob())
    mockLive(live)
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('strictManualPublication merge_pr refuses when the live probe throws', async () => {
    mockDbRef = makeDb(baseJob())
    liveFetchMock.mockRejectedValue(new Error('network unreachable'))
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })

  it('strictManualPublication dry run refuses a redirected destination before reporting green', async () => {
    mockDbRef = makeDb(baseJob())
    mockLive({ status: 200, url: REDIRECT_TARGET_URL })
    const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr', dryRun: true }))
    expect(res.status).toBe(409)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
  })
})
