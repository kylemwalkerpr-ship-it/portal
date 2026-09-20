/**
 * P0 blocker regression — publication ownership proof must be content-format
 * agnostic.
 *
 * Registry rows 45 and 46 are confirmed news_summary owners with specific
 * live canonicals. Their REAL authoring flow works like this:
 *   - `resolveOwner({ contentType: 'legal_guide' })` matches the registry row,
 *     returns `routingSource: 'registry_owner_url'` and the EXISTING owner
 *     canonical, and `isBroadNetNewCreate(...)` is false;
 *   - `finalizePipelineContentType('legal_guide', plan)` promotes the RENDERING
 *     type to `blog_post`;
 *   - the pipeline therefore calls `shipContent` with `contentType: 'blog_post'`.
 *
 * The publication door used to re-resolve ownership with that finalized type:
 * `resolveOwner({ contentType: 'blog_post' })` takes the explicit-blog
 * standing-rules early return, so publication refused the very owner authoring
 * approved. Publication ownership proof is now resolved with the neutral
 * ownership-proof content type (`legal_guide`), keeping rendering untouched.
 *
 * These tests run the REAL `resolveOwner` + `finalizePipelineContentType` +
 * `shipContent` publication door; only content gates and GitHub helpers are
 * stubbed so a permitted plan can be observed reaching the Git boundary
 * without network writes. The exact-live probe fetch is mocked.
 */
import { shipContent } from '@/lib/seoFactory/ship'
import { resolveOwner, sanitizeOwnerUrl, type OwnerPlan } from '@/lib/seoFactory/ownership'
import { finalizePipelineContentType } from '@/lib/seoFactory/jobContentType'
import {
  BROAD_CREATE_UNLOCK_ENV,
  isBroadNetNewCreate,
} from '@/lib/seoFactory/broadCreateFreeze'

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

/** Registry row 45 — legal /blog owner with news_summary intent. */
const ROW_45 = {
  label: 'registry row 45 (legal /blog owner)',
  keyword: 'stem opt extension 2026 news',
  ownerUrl: 'https://legal.yousafeconsultancy.com/blog/stem-opt-extension-2026/',
  region: 'US',
}
/** Registry row 46 — specific apex F-1 requirements article owner. */
const ROW_46 = {
  label: 'registry row 46 (specific apex F-1 requirements owner)',
  keyword: 'f-1 requirements 2026 overview',
  ownerUrl: 'https://yousafeconsultancy.com/blog/f1-visa-requirements-2026',
  region: 'US',
}
const CONFIRMED_BLOG_OWNER_ROWS = [ROW_45, ROW_46]
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
  contentType: string
  region?: string
  dryRun?: boolean
}) {
  return shipContent({
    mode: 'pr',
    plan: opts.plan,
    content: '## In 60 seconds\nInformation only, not legal advice.',
    title: 'Publication ownership proof probe',
    region: opts.region || 'UK',
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    audit: AUDIT,
    dryRun: opts.dryRun,
  })
}

/**
 * Reproduces the real authoring path for a registry owner whose finalized
 * rendering type is blog_post: authoring approves the existing owner, and the
 * finalized content type the pipeline hands to shipContent is blog_post.
 */
async function authoredBlogOwnerPlan(row: (typeof CONFIRMED_BLOG_OWNER_ROWS)[number]) {
  const plan = await resolveOwner({
    primaryKeyword: row.keyword,
    contentType: 'legal_guide',
    region: row.region,
  })
  expect(plan.routingSource).toBe('registry_owner_url')
  expect(plan.matched?.owner_url).toBe(row.ownerUrl)
  expect(plan.canonicalUrl).toBe(sanitizeOwnerUrl(row.ownerUrl))
  expect(isBroadNetNewCreate(plan)).toBe(false)

  const finalized = finalizePipelineContentType('legal_guide', plan)
  expect(finalized).toBe('blog_post')
  return { plan, finalized }
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

describe('shipContent — finalized blog_post rendering type still proves the existing owner', () => {
  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    '$label: authoring approves the owner, finalization promotes to blog_post, publication reaches the Git door',
    async (row) => {
      const { plan, finalized } = await authoredBlogOwnerPlan(row)
      mockLive({ status: 200, url: row.ownerUrl })

      await expect(
        ship({
          plan,
          primaryKeyword: row.keyword,
          region: row.region,
          contentType: finalized,
        }),
      ).rejects.toThrow(/SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/)
      expect(mockGitCalls).toContain('createBranchFrom')
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    '$label: a live redirect still freezes before any Git helper',
    async (row) => {
      const { plan, finalized } = await authoredBlogOwnerPlan(row)
      mockLive({ status: 200, url: REDIRECT_TARGET_URL })

      await expect(
        ship({ plan, primaryKeyword: row.keyword, region: row.region, contentType: finalized }),
      ).rejects.toThrow(/broad net-new CREATE/i)
      expect(mockGitCalls).toEqual([])
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )

  it.each(CONFIRMED_BLOG_OWNER_ROWS)(
    '$label: a live 404 still freezes before any Git helper',
    async (row) => {
      const { plan, finalized } = await authoredBlogOwnerPlan(row)
      mockLive({ status: 404, url: row.ownerUrl })

      await expect(
        ship({ plan, primaryKeyword: row.keyword, region: row.region, contentType: finalized }),
      ).rejects.toThrow(/broad net-new CREATE/i)
      expect(mockGitCalls).toEqual([])
      expect(liveFetchMock).toHaveBeenCalled()
    },
  )


  it('lets the explicit P13 unlock bypass the publication proof for the finalized blog_post row with no fetch', async () => {
    process.env[BROAD_CREATE_UNLOCK_ENV] = '1'
    const { plan, finalized } = await authoredBlogOwnerPlan(ROW_45)
    await expect(
      ship({ plan, primaryKeyword: ROW_45.keyword, region: ROW_45.region, contentType: finalized }),
    ).rejects.toThrow(/SENTINEL_DOWNSTREAM_CREATEBRANCHFROM/)
    expect(mockGitCalls).toContain('createBranchFrom')
    expect(liveFetchMock).not.toHaveBeenCalled()
  })
})

describe('shipContent — neutral ownership proof never authorizes net-new or fabricated finals', () => {
  it.each([
    [
      'standing-rules legal build',
      'uk graduate visa requirements',
      'legal_guide',
      'https://legal.yousafeconsultancy.com/uk/uk-graduate-visa-requirements/',
    ],
    [
      'net-new apex blog final',
      'brand new scholarship news recap',
      'blog_post',
      'https://yousafeconsultancy.com/blog/brand-new-scholarship-news-recap/',
    ],
    [
      'net-new regional final',
      'brand new regional settlement guide',
      'regional_page',
      'https://ca.yousafeconsultancy.com/content/brand-new-regional-settlement-guide/',
    ],
  ])('refuses %s before any Git helper or live fetch', async (_label, keyword, contentType, canonical) => {
    const fallbackPlan = await resolveOwner({
      primaryKeyword: keyword,
      contentType: 'legal_guide',
      region: 'UK',
    })
    const plan = { ...fallbackPlan, canonicalUrl: canonical }
    await expect(
      ship({ plan, primaryKeyword: keyword, contentType, region: 'UK' }),
    ).rejects.toThrow(/broad net-new CREATE/i)
    expect(mockGitCalls).toEqual([])
    expect(liveFetchMock).not.toHaveBeenCalled()
  })

  it('registry_host fallback stays frozen before any Git helper or live fetch', async () => {
    const FALLBACK_KEYWORD = 'synthetic registry host fallback'
    const loaders = require('@/lib/seoDataLoaders') as { loadOwnershipRegistry: jest.Mock }
    const spy = jest.spyOn(loaders, 'loadOwnershipRegistry').mockResolvedValue({
      rows: [
        {
          id: 9001,
          primary_keyword: FALLBACK_KEYWORD,
          intent_class: 'procedural',
          owner_host: 'legal',
          owner_url: '',
          supporting_urls: [],
          action: 'expand',
          market_destination: null,
          status: 'confirmed',
          notes: 'hermetic fixture: unusable owner_url exercises pathForHostFallback',
        },
      ],
    } as never)
    try {
      const plan = await resolveOwner({
        primaryKeyword: FALLBACK_KEYWORD,
        contentType: 'legal_guide',
        region: 'UK',
      })
      expect(plan.routingSource).toBe('registry_host')
      await expect(
        ship({ plan, primaryKeyword: FALLBACK_KEYWORD, contentType: 'legal_guide', region: 'UK' }),
      ).rejects.toThrow(/broad net-new CREATE/i)
      expect(mockGitCalls).toEqual([])
      expect(liveFetchMock).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
