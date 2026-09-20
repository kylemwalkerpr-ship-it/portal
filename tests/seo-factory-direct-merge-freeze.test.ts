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

/**
 * P0 blocker regression — direct existing-PR merge publication proof must be
 * content-format agnostic.
 *
 * Registry rows 45/46 carry a news_summary intent, so the pipeline finalizes
 * and PERSISTS their rendering content type as `blog_post` even though the
 * existing owner lives on the legal/apex host. Re-resolving ownership with that
 * persisted type took `resolveOwner`'s explicit-blog standing-rules early
 * return and refused the same owner authoring approved. The direct-merge freeze
 * now re-resolves with the neutral ownership-proof content type; the persisted
 * canonical must still equal the fresh owner and pass the exact live proof.
 */
const ROW45_KEYWORD = 'stem opt extension 2026 news'
const ROW45_OWNER_URL = 'https://legal.yousafeconsultancy.com/blog/stem-opt-extension-2026/'
const ROW46_KEYWORD = 'f-1 requirements 2026 overview'
const ROW46_OWNER_URL = 'https://yousafeconsultancy.com/blog/'
/** Registry id 55: proposed/expand with a specific article URL (not a section root). */
const PROPOSED_LIVE_EXACT_KEYWORD = 'uk renters rights act 2025 complete guide'
const PROPOSED_LIVE_EXACT_OWNER_URL =
  'https://legal.yousafeconsultancy.com/uk/tenancy/uk-renters-rights-act-2025-complete-guide/'

const CONFIRMED_BLOG_OWNER_ROWS = [
  {
    label: 'registry row 45 (legal /blog owner)',
    keyword: ROW45_KEYWORD,
    ownerUrl: ROW45_OWNER_URL,
    repo: 'caseworks',
    contentPath: 'app/blog/stem-opt-extension-2026/page.tsx',
  },
]

const PROPOSED_BLOG_OWNER_ROW = {
  label: 'registry row 46 (proposed apex /blog index)',
  keyword: ROW46_KEYWORD,
  ownerUrl: ROW46_OWNER_URL,
  repo: 'yousafe-consultancy',
  contentPath: 'landing-page/content/blog.md',
}

function blogOwnerJob(
  row: (typeof CONFIRMED_BLOG_OWNER_ROWS)[number] | typeof PROPOSED_BLOG_OWNER_ROW,
) {
  return baseJob({
    primary_keyword: row.keyword,
    topic: row.keyword,
    content_type: 'blog_post',
    canonical_url: row.ownerUrl,
    target_repo: row.repo,
    content_path: row.contentPath,
  })
}

describe('direct existing-PR merges — persisted blog_post rendering type still proves the existing owner', () => {
  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    'legacyCore merge_pr merges $label when the live owner answers 200 exactly',
    async (row) => {
      mockDbRef = makeDb(blogOwnerJob(row))
      mockLive({ status: 200, url: row.ownerUrl })
      const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
      expect(res.status).toBe(200)
      expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
      expect(mockDbRef.state.row.status).toBe('merged')
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    'legacyCore approve (existing-PR shortcut) merges $label when the live owner answers 200 exactly',
    async (row) => {
      mockDbRef = makeDb(blogOwnerJob(row))
      mockLive({ status: 200, url: row.ownerUrl })
      const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true }))
      expect(res.status).toBe(200)
      expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
      expect(mockShipContent).not.toHaveBeenCalled()
    },
  )

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    'strictManualPublication merge_pr merges $label when the live owner answers 200 exactly',
    async (row) => {
      mockDbRef = makeDb(blogOwnerJob(row))
      mockLive({ status: 200, url: row.ownerUrl })
      const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
      expect(res.status).toBe(200)
      expect(mockMergePullRequest).toHaveBeenCalledTimes(1)
      expect(mockDbRef.state.row.status).toBe('merged')
    },
  )

  it('freezes proposed row 46 statically at every direct existing-PR publication door', async () => {
    const cases = [
      () => legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' })),
      () => legacyJobsPatch(request({ id: JOB_ID, action: 'approve', humanApproved: true })),
      () => strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' })),
    ]

    for (const invoke of cases) {
      mockDbRef = makeDb(blogOwnerJob(PROPOSED_BLOG_OWNER_ROW))
      liveFetchMock.mockClear()
      mockMergePullRequest.mockClear()
      const res = await invoke()
      expect(res.status).toBe(409)
      expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
      expect(mockMergePullRequest).not.toHaveBeenCalled()
      expect(liveFetchMock).not.toHaveBeenCalled()
    }
  })

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    'legacyCore merge_pr still freezes $label when the live owner redirects elsewhere',
    async (row) => {
      mockDbRef = makeDb(blogOwnerJob(row))
      mockLive({ status: 200, url: REDIRECT_TARGET_URL })
      const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
      expect(res.status).toBe(409)
      expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
      expect(mockMergePullRequest).not.toHaveBeenCalled()
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    'strictManualPublication merge_pr still freezes $label when the live owner answers 404',
    async (row) => {
      mockDbRef = makeDb(blogOwnerJob(row))
      mockLive({ status: 404, url: row.ownerUrl })
      const res = await strictManualPublicationPATCH(request({ id: JOB_ID, action: 'merge_pr' }))
      expect(res.status).toBe(409)
      expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
      expect(mockMergePullRequest).not.toHaveBeenCalled()
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )

  it('legacyCore merge_pr still freezes a net-new persisted blog_post final statically (no fetch)', async () => {
    const canonical = 'https://yousafeconsultancy.com/blog/brand-new-scholarship-news-recap/'
    mockDbRef = makeDb(
      baseJob({
        primary_keyword: 'brand new scholarship news recap',
        topic: 'brand new scholarship news recap',
        content_type: 'blog_post',
        canonical_url: canonical,
        target_repo: 'yousafe-consultancy',
      }),
    )
    mockLive({ status: 200, url: canonical })
    const res = await legacyJobsPatch(request({ id: JOB_ID, action: 'merge_pr' }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    // Static refusal: an untrusted net-new destination is never probed live.
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})

describe('direct existing-PR merges — proposed live-exact article owner is refused statically', () => {
  it.each([
    ['merge_pr', { action: 'merge_pr' }],
    ['approve existing-PR shortcut', { action: 'approve', humanApproved: true }],
  ])('legacyCore %s refuses a proposed live-exact owner before mergePullRequest', async (_label, body) => {
    mockDbRef = makeDb(
      baseJob({
        primary_keyword: PROPOSED_LIVE_EXACT_KEYWORD,
        topic: PROPOSED_LIVE_EXACT_KEYWORD,
        canonical_url: PROPOSED_LIVE_EXACT_OWNER_URL,
        content_path: 'app/uk/tenancy/uk-renters-rights-act-2025-complete-guide/page.tsx',
      }),
    )
    mockLive({ status: 200, url: PROPOSED_LIVE_EXACT_OWNER_URL })
    const res = await legacyJobsPatch(request({ id: JOB_ID, ...body }))
    expect(res.status).toBe(409)
    expect((await res.clone().json()).error).toMatch(/broad net-new CREATE/i)
    expect(mockMergePullRequest).not.toHaveBeenCalled()
    expect(mockShipContent).not.toHaveBeenCalled()
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})
