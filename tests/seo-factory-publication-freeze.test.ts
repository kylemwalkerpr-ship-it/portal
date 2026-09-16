/**
 * P0 global publication freeze — the Git-write door (`shipContent`) must
 * re-resolve CURRENT ownership from primaryKeyword/contentType/region WITHOUT
 * hints and refuse any plan whose actual final canonical does not match the
 * resolved existing owner (matched registry owner_url or locked strike-seed
 * canonical). A fabricated ownerUrlHint, a standing-rules fallback, or a
 * canonical that diverges from the matched owner must never reach a Git write
 * helper. A genuine registry-backed destination must still reach the mocked
 * downstream Git door.
 *
 * The gate itself is NOT mocked (the REAL `resolveOwner` + freeze run); only
 * the content gates and GitHub helpers are stubbed so a permitted plan can be
 * observed reaching the Git boundary without network writes.
 */
import { shipContent } from '@/lib/seoFactory/ship'
import { resolveOwner, type OwnerPlan } from '@/lib/seoFactory/ownership'
import { BROAD_CREATE_UNLOCK_ENV } from '@/lib/seoFactory/broadCreateFreeze'

jest.mock('@/lib/seoFactory/linkAudit', () => ({
  sanitizeDraftLinksLive: jest.fn(async (content: string) => ({ content, stripped: 0, injected: 0 })),
  auditLinksLive: jest.fn(async () => []),
}))
jest.mock('@/lib/seoFactory/editorialScaffold', () => ({
  applyDeterministicRepairs: jest.fn((o: { content: string }) => ({ applied: [], content: o.content })),
}))
jest.mock('@/lib/seoFactory/renderTarget', () => ({
  renderTargetFile: jest.fn(() => ({ filePath: 'app/us/x/page.tsx', fileContent: '<ArticleLayout>ok</ArticleLayout>' })),
  buildBlogPostEntry: jest.fn(() => ({ title: 'x' })),
  insertBlogPostIntoData: jest.fn((cur: string) => cur),
}))
jest.mock('@/lib/seoFactory/contentDepth', () => ({ assertContentDepth: jest.fn() }))
jest.mock('@/lib/seoFactory/contentQualityGate', () => ({
  assertQualityGate: jest.fn(),
  assertRhythmWithinRepairRange: jest.fn(),
}))
jest.mock('@/lib/seoFactory/shipGate', () => ({ assertShipAllowed: jest.fn() }))
jest.mock('@/lib/seoFactory/routeSubtypeGuard', () => ({ assertNoRouteSubtypeConflict: jest.fn() }))
jest.mock('@/lib/seoFactory/liveVerify', () => ({ verifyLiveInBackground: jest.fn() }))
jest.mock('@/lib/seoFactory/siteHealth', () => ({
  publicPathFromRepoFile: jest.fn(() => ''),
  sitemapPathForShippedFile: jest.fn(() => ''),
  upsertStudioSitemapEntry: jest.fn(() => ({ added: false })),
}))
jest.mock('@/lib/seoFactory/siteHealthFixes', () => ({ stripNoIndex: jest.fn((content: string) => content) }))
jest.mock('@/lib/indexNow', () => ({ submitUrlsToIndexNow: jest.fn(async () => undefined) }))

const mockGitCalls: string[] = []
const mockGithubWrite = jest.fn(async (name: string): Promise<never> => {
  mockGitCalls.push(name)
  throw new Error(`SENTINEL_DOWNSTREAM_${name.toUpperCase()}`)
})
jest.mock('@/lib/githubContents', () => ({
  normalizeGithubTarget: (owner: string, repo: string) => ({ owner, repo }),
  putRepoFile: (...args: unknown[]) => mockGithubWrite('putRepoFile'),
  createBranchFrom: (...args: unknown[]) => mockGithubWrite('createBranchFrom'),
  openPullRequest: (...args: unknown[]) => mockGithubWrite('openPullRequest'),
  mergePullRequest: (...args: unknown[]) => mockGithubWrite('mergePullRequest'),
  deleteRepoFile: (...args: unknown[]) => mockGithubWrite('deleteRepoFile'),
  getRepoFileContent: jest.fn(async () => null),
  getFileBlobSha: jest.fn(async () => null),
  getCommitParentSha: jest.fn(async () => null),
  getBranchHeadSha: jest.fn(async () => {
    mockGitCalls.push('getBranchHeadSha')
    return 'base-sha'
  }),
  githubFetch: jest.fn(async () => ({ check_runs: [] })),
}))
jest.mock('@/lib/seoEngine/gate', () => {
  const real = jest.requireActual('@/lib/seoEngine/gate')
  return {
    ...real,
    enforceGate: jest.fn(async () => ({
      mandatory: { applicable: false, met: true, missing: [] },
      recorded: true,
    })),
  }
})

const UNMATCHED_KEYWORD = 'uk graduate visa requirements'
/**
 * Current EXACT-LIVE registry owner (registry id 3, confirmed/keep; the live
 * URL currently answers 200 exactly). The old fixture (id 58) redirects to a
 * different destination today and is only used as the redirect failure case.
 */
const REGISTRY_KEYWORD = 'f-1 document checklist'
const REGISTRY_OWNER_URL =
  'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
const REGISTRY_REGION = 'US'
const REDIRECT_TARGET_URL =
  'https://legal.yousafeconsultancy.com/ca/family/canada-spousal-sponsorship-document-checklist-2026/'

const AUDIT = { score: 100, humanScore: 100, blockers: [], grade: 'A' } as never

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

function ship(opts: {
  plan: OwnerPlan
  primaryKeyword: string
  region?: string
  dryRun?: boolean
}) {
  return shipContent({
    mode: 'pr',
    plan: opts.plan,
    content: '## In 60 seconds\nInformation only, not legal advice.',
    title: 'Publication freeze probe',
    region: opts.region || 'UK',
    contentType: opts.plan.contentType || 'legal_guide',
    primaryKeyword: opts.primaryKeyword,
    audit: AUDIT,
    dryRun: opts.dryRun,
  })
}

beforeEach(() => {
  mockGitCalls.length = 0
  mockGithubWrite.mockClear()
  for (const fn of ['getRepoFileContent', 'getFileBlobSha', 'getCommitParentSha', 'getBranchHeadSha', 'githubFetch']) {
    const mocked = (require('@/lib/githubContents') as Record<string, jest.Mock>)[fn]
    mocked.mockClear()
  }
  liveFetchMock.mockReset()
  ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
  resetFreezeLiveCache()
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
})

afterEach(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
})

describe('shipContent — re-resolves current ownership and freezes unowned destinations', () => {
  it('refuses a fabricated ownerUrlHint with no registry match BEFORE any Git helper', async () => {
    const plan = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
      ownerUrlHint: 'https://legal.yousafeconsultancy.com/uk/graduate-visa-requirements/',
    })
    // The resolver labels the fabricated hint registry_owner_url…
    expect(plan.routingSource).toBe('registry_owner_url')
    expect(plan.matched).toBeNull()

    // …but the ship door must refuse it before touching GitHub.
    await expect(ship({ plan, primaryKeyword: UNMATCHED_KEYWORD })).rejects.toThrow(
      /broad net-new CREATE/i,
    )
    expect(mockGitCalls).toEqual([])
  })

  it('refuses a standing-rules fallback plan BEFORE any Git helper', async () => {
    const plan = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(plan.routingSource).toBe('standing_rules')

    await expect(ship({ plan, primaryKeyword: UNMATCHED_KEYWORD })).rejects.toThrow(
      /broad net-new CREATE/i,
    )
    expect(mockGitCalls).toEqual([])
  })

  it('refuses even a dry run for a frozen plan — a dry run must not claim green', async () => {
    const plan = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    await expect(ship({ plan, primaryKeyword: UNMATCHED_KEYWORD, dryRun: true })).rejects.toThrow(
      /broad net-new CREATE/i,
    )
    expect(mockGitCalls).toEqual([])
  })

  it('refuses a final canonical that diverges from the matched registry owner', async () => {
    const plan = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
    })
    expect(plan.matched?.owner_url).toBe(REGISTRY_OWNER_URL)

    const diverged = {
      ...plan,
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-checklist-alternate/',
    }
    await expect(
      ship({ plan: diverged, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('permits a genuine exact-live registry-backed destination to reach the mocked Git door', async () => {
    const plan = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
    })
    expect(plan.routingSource).toBe('registry_owner_url')
    expect(plan.canonicalUrl).toBe(REGISTRY_OWNER_URL)
    mockLive({ status: 200, url: REGISTRY_OWNER_URL })

    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/)
    expect(mockGitCalls).toContain('createBranchFrom')
    expect(liveFetchMock).toHaveBeenCalled()
  })

  it('lets the explicit P13 unlock bypass the freeze (the only bypass) without any fetch', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    const plan = await resolveOwner({
      primaryKeyword: UNMATCHED_KEYWORD,
      contentType: 'legal_guide',
      region: 'UK',
    })
    await expect(ship({ plan, primaryKeyword: UNMATCHED_KEYWORD })).rejects.toThrow(
      /SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/,
    )
    expect(mockGitCalls).toContain('createBranchFrom')
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Static authority (registry owner_url == final canonical) is NECESSARY but NOT
 * SUFFICIENT: 10 of the 76 registry owner URLs currently redirect elsewhere, so
 * the Git-write door must also await an exact live existence proof before it
 * creates a branch or opens/merges a PR. Fetch is mocked; no real network.
 */
describe('shipContent — exact live existence proof at the Git-write door', () => {
  async function liveRegistryPlan() {
    const plan = await resolveOwner({
      primaryKeyword: REGISTRY_KEYWORD,
      contentType: 'legal_guide',
      region: REGISTRY_REGION,
    })
    expect(plan.canonicalUrl).toBe(REGISTRY_OWNER_URL)
    return plan
  }

  it('refuses a statically-authorized owner whose live URL redirects elsewhere BEFORE any Git helper', async () => {
    const plan = await liveRegistryPlan()
    mockLive({ status: 200, url: REDIRECT_TARGET_URL })
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
    expect(liveFetchMock).toHaveBeenCalled()
  })

  it('refuses a statically-authorized owner whose live URL is 404 BEFORE any Git helper', async () => {
    const plan = await liveRegistryPlan()
    mockLive({ status: 404, url: REGISTRY_OWNER_URL })
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
  })

  it('refuses a statically-authorized owner whose live probe throws BEFORE any Git helper', async () => {
    const plan = await liveRegistryPlan()
    liveFetchMock.mockRejectedValue(new Error('network unreachable'))
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
  })

  it('refuses a dry run whose live proof is a redirect — a dry run must not claim green', async () => {
    const plan = await liveRegistryPlan()
    mockLive({ status: 200, url: REDIRECT_TARGET_URL })
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION, dryRun: true }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
  })

  it('retries HEAD 405 as GET and permits the exact live destination', async () => {
    const plan = await liveRegistryPlan()
    liveFetchMock
      .mockResolvedValueOnce({ ok: false, status: 405, url: REGISTRY_OWNER_URL })
      .mockResolvedValueOnce({ ok: true, status: 200, url: REGISTRY_OWNER_URL })
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/)
    expect(liveFetchMock.mock.calls.map((call) => (call[1] as { method?: string } | undefined)?.method)).toEqual([
      'HEAD',
      'GET',
    ])
  })

  it('treats a harmless trailing-slash final URL as the same destination', async () => {
    const plan = await liveRegistryPlan()
    mockLive({ status: 200, url: REGISTRY_OWNER_URL.replace(/\/$/, '') })
    await expect(
      ship({ plan, primaryKeyword: REGISTRY_KEYWORD, region: REGISTRY_REGION }),
    ).rejects.toThrow(/SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/)
  })
})
