/**
 * P6 (supervisor review repair) — ship lifecycle ORDERING.
 *
 * Blocker repaired: both ship success paths launched
 * `verifyLiveInBackground()` BEFORE `await stageEngineInterlinksForVerification()`.
 * Live verification could resolve before the staged rows existed, and (with
 * the old admin-only finalization) nothing would ever come back for them —
 * valid links stayed `planned` forever.
 *
 * These tests drive the REAL `shipContent` success paths — human-approved
 * direct-main write and PR → CI → merge — through the REAL ownership/publication
 * freeze (only the Git door, content gates and network are stubbed) and pin the
 * deterministic invariant: staging has STARTED and COMPLETED before background
 * verification is launched, for the plan's exact canonicalUrl.
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
  renderTargetFile: jest.fn(() => ({
    filePath: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
    fileContent: '<ArticleLayout>ok</ArticleLayout>',
  })),
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
jest.mock('@/lib/seoFactory/ogCard', () => ({ renderOgImageFile: jest.fn(() => null) }))
jest.mock('@/lib/seoFactory/siteHealth', () => ({
  publicPathFromRepoFile: jest.fn(() => ''),
  sitemapPathForShippedFile: jest.fn(() => ''),
  upsertStudioSitemapEntry: jest.fn(() => ({ added: false })),
}))
jest.mock('@/lib/seoFactory/siteHealthFixes', () => ({
  stripNoIndex: jest.fn((content: string) => content),
}))
jest.mock('@/lib/indexNow', () => ({ submitUrlsToIndexNow: jest.fn(async () => undefined) }))

/**
 * Ordering evidence shared with the module factories below. A launch-before-
 * stage race would record `verify:` before `stage:end`.
 */
const mockShipEvents: string[] = []

jest.mock('@/lib/seoFactory/liveVerify', () => ({
  verifyLiveInBackground: jest.fn((input: { canonicalUrl: string }) => {
    mockShipEvents.push(`verify:${input.canonicalUrl}`)
  }),
}))
jest.mock('@/lib/seoFactory/interlinkVerification', () => ({
  stageEngineInterlinksForVerification: jest.fn(async (input: { canonicalUrl: string; body: string }) => {
    mockShipEvents.push('stage:start')
    // Model the real staging write taking time: verification launched first
    // would land its event before `stage:end`.
    await new Promise((r) => setTimeout(r, 5))
    mockShipEvents.push(`stage:end:${input.canonicalUrl}`)
    return { staged: 1, candidates: 1, sourceUrl: input.canonicalUrl }
  }),
}))

const mockGitCalls: string[] = []
jest.mock('@/lib/githubContents', () => ({
  normalizeGithubTarget: (owner: string, repo: string) => ({ owner, repo }),
  putRepoFile: jest.fn(async () => {
    mockGitCalls.push('putRepoFile')
    return { commitSha: 'put-sha', sha: 'put-sha' }
  }),
  createBranchFrom: jest.fn(async () => {
    mockGitCalls.push('createBranchFrom')
    return undefined
  }),
  openPullRequest: jest.fn(async () => {
    mockGitCalls.push('openPullRequest')
    return { html_url: 'https://github.com/kylemwalkerpr-ship-it/portal/pull/4242', number: 4242 }
  }),
  mergePullRequest: jest.fn(async () => {
    mockGitCalls.push('mergePullRequest')
    return { merged: true, sha: 'merge-sha', message: 'merged' }
  }),
  deleteRepoFile: jest.fn(async () => undefined),
  getRepoFileContent: jest.fn(async () => null),
  getFileBlobSha: jest.fn(async () => null),
  getCommitParentSha: jest.fn(async () => null),
  getBranchHeadSha: jest.fn(async () => 'base-sha'),
  // A completed, successful check-run keeps waitForCommitCi deterministic and
  // immediate (no 20s polls).
  githubFetch: jest.fn(async () => ({
    check_runs: [{ name: 'build', status: 'completed', conclusion: 'success' }],
  })),
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

/** Current exact-live registry owner (registry id 3, confirmed/keep). */
const REGISTRY_KEYWORD = 'f-1 document checklist'
const REGISTRY_OWNER_URL =
  'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
const REGISTRY_REGION = 'US'
const SHIP_JOB = '77777777-7777-4777-8777-777777777777'

const AUDIT = { score: 100, humanScore: 100, blockers: [], grade: 'A' } as never

const liveFetchMock = jest.fn()
const originalFetch = global.fetch

function resetFreezeLiveCache(): void {
  const mod = require('@/lib/seoFactory/broadCreateFreeze') as {
    resetBroadCreateLiveCache?: () => void
  }
  mod.resetBroadCreateLiveCache?.()
}

function stageMock(): jest.Mock {
  return (require('@/lib/seoFactory/interlinkVerification') as Record<string, jest.Mock>)
    .stageEngineInterlinksForVerification
}

function verifyMock(): jest.Mock {
  return (require('@/lib/seoFactory/liveVerify') as Record<string, jest.Mock>)
    .verifyLiveInBackground
}

async function registryPlan(): Promise<OwnerPlan> {
  const plan = await resolveOwner({
    primaryKeyword: REGISTRY_KEYWORD,
    contentType: 'legal_guide',
    region: REGISTRY_REGION,
  })
  expect(plan.canonicalUrl).toBe(REGISTRY_OWNER_URL)
  return plan
}

beforeEach(() => {
  mockShipEvents.length = 0
  mockGitCalls.length = 0
  stageMock().mockClear()
  verifyMock().mockClear()
  liveFetchMock.mockReset()
  liveFetchMock.mockResolvedValue({ ok: true, status: 200, url: REGISTRY_OWNER_URL })
  ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
  resetFreezeLiveCache()
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
})

afterEach(() => {
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch
  delete process.env[BROAD_CREATE_UNLOCK_ENV]
})

describe('shipContent — staging completes BEFORE background live verification', () => {
  it('human-approved direct-main success: stage → verify, for the exact canonicalUrl', async () => {
    const plan = await registryPlan()

    const result = await shipContent({
      jobId: SHIP_JOB,
      mode: 'autodeploy',
      humanApproved: true,
      plan,
      content: '## In 60 seconds\nInformation only, not legal advice.',
      title: 'F-1 Document Checklist',
      region: REGISTRY_REGION,
      contentType: 'legal_guide',
      primaryKeyword: REGISTRY_KEYWORD,
      audit: AUDIT,
      dryRun: false,
    })

    expect(result.status).toBe('deployed')
    expect(mockGitCalls).toContain('putRepoFile')
    expect(stageMock()).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalUrl: REGISTRY_OWNER_URL, jobId: SHIP_JOB }),
    )
    expect(verifyMock()).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalUrl: REGISTRY_OWNER_URL, jobId: SHIP_JOB }),
    )
    // Deterministic invariant: staging started AND finished before verification.
    expect(mockShipEvents).toEqual([
      'stage:start',
      `stage:end:${REGISTRY_OWNER_URL}`,
      `verify:${REGISTRY_OWNER_URL}`,
    ])
  })

  it(
    'PR → CI → merge success: stage → verify, for the exact canonicalUrl',
    async () => {
      const plan = await registryPlan()

      const result = await shipContent({
        mode: 'merge',
        plan,
        content: '## In 60 seconds\nInformation only, not legal advice.',
        title: 'F-1 Document Checklist',
        region: REGISTRY_REGION,
        contentType: 'legal_guide',
        primaryKeyword: REGISTRY_KEYWORD,
        audit: AUDIT,
        dryRun: false,
      })

      expect(result.status).toBe('merged')
      expect(mockGitCalls).toContain('mergePullRequest')
      expect(mockShipEvents).toEqual([
        'stage:start',
        `stage:end:${REGISTRY_OWNER_URL}`,
        `verify:${REGISTRY_OWNER_URL}`,
      ])
    },
    30_000,
  )
})
