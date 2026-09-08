/**
 * P1 (review) — the ship-door mandatory gate FAILS CLOSED on any setup/
 * classification/evaluation failure, and one missing mandatory required item
 * holds a YMYL-critical mission. Tests exercise the ACTUAL shipContent path
 * (with heavy modules mocked) and assert no GitHub write is ever attempted.
 */
import { shipContent, MandatoryComplianceHeldError, evaluateMandatoryComplianceAtShip } from '@/lib/seoFactory/ship'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

jest.mock('@/lib/seoFactory/linkAudit', () => ({
  sanitizeDraftLinksLive: jest.fn(async (content: string) => ({ content, stripped: 0, injected: 0 })),
  auditLinksLive: jest.fn(async () => []),
}))
jest.mock('@/lib/seoFactory/editorialScaffold', () => ({
  applyDeterministicRepairs: jest.fn((o: any) => ({ applied: [], content: o.content })),
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
jest.mock('@/lib/githubContents', () => {
  const never = jest.fn(async () => {
    throw new Error('GitHub write attempted but the gate must have held')
  })
  return {
    normalizeGithubTarget: jest.fn((owner: string, repo: string) => ({ owner, repo })),
    putRepoFile: never,
    createBranchFrom: never,
    openPullRequest: never,
    mergePullRequest: never,
    getRepoFileContent: jest.fn(async () => null),
    getFileBlobSha: jest.fn(async () => null),
    getCommitParentSha: jest.fn(async () => null),
    getBranchHeadSha: jest.fn(async () => null),
    deleteRepoFile: jest.fn(async () => undefined),
    githubFetch: jest.fn(async () => ({ check_runs: [] })),
  }
})
jest.mock('@/lib/seoEngine/gate', () => {
  const real = jest.requireActual('@/lib/seoEngine/gate')
  return { ...real, enforceGate: jest.fn() }
})

function makePlan(partial: Partial<OwnerPlan> = {}): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: true,
    routingSource: 'standing_rules',
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/x/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/x/',
    ...partial,
  }
}

const AUDIT = { score: 85, blockers: [] } as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const githubMock = (name: string): jest.Mock => (require('@/lib/githubContents') as Record<string, jest.Mock>)[name]

beforeEach(() => {
  const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
  gate.enforceGate.mockReset()
  for (const fn of ['putRepoFile', 'createBranchFrom', 'openPullRequest', 'mergePullRequest']) {
    githubMock(fn).mockClear()
  }
})

describe('shipContent — mandatory gate FAILS CLOSED on the actual ship path', () => {
  it('holds shipping (no Git write) when the stage CLASSIFIER throws', async () => {
    const planner = await import('@/lib/seoEngine/planner')
    const spy = jest.spyOn(planner, 'bestCellForTerm').mockImplementation(() => {
      throw new Error('classifier exploded (setup/classification failure)')
    })
    try {
      const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
      gate.enforceGate.mockResolvedValue({ mandatory: { applicable: false, met: true, missing: [] }, recorded: true })

      await expect(
        shipContent({
          mode: 'pr',
          plan: makePlan(),
          content: '# uk spouse visa\n\ninformation only, not legal advice',
          title: 'UK Spouse Visa Checklist',
          region: 'UK',
          contentType: 'legal_guide',
          primaryKeyword: 'uk spouse visa',
          audit: AUDIT,
          dryRun: false,
        }),
      ).rejects.toBeInstanceOf(MandatoryComplianceHeldError)

      // No GitHub write was attempted.
      expect(githubMock('putRepoFile')).not.toHaveBeenCalled()
      expect(githubMock('createBranchFrom')).not.toHaveBeenCalled()
      expect(githubMock('openPullRequest')).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('holds shipping when the mandatory EVALUATION throws a plain error (converted to typed hold)', async () => {
    const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
    gate.enforceGate.mockRejectedValue(new Error('evaluation exploded'))
    await expect(
      shipContent({
        mode: 'pr',
        plan: makePlan(),
        content: '# uk spouse visa\n\ninformation only, not legal advice',
        title: 'UK Spouse Visa Checklist',
        region: 'UK',
        contentType: 'legal_guide',
        primaryKeyword: 'uk spouse visa',
        audit: AUDIT,
        dryRun: false,
      }),
    ).rejects.toBeInstanceOf(MandatoryComplianceHeldError)
    expect(githubMock('putRepoFile')).not.toHaveBeenCalled()
  })

  it('holds shipping when ONE required mandatory item is missing on a critical mission', async () => {
    // Critical visa mission; the authoritative gate says only the disclaimer is
    // missing → ONE missing required item must hold the ship.
    const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
    gate.enforceGate.mockResolvedValue({
      mandatory: { applicable: true, met: false, missing: ['professional disclaimer'] },
      recorded: true,
    })
    await expect(
      shipContent({
        mode: 'pr',
        plan: makePlan(),
        content: '# uk spouse visa\n\nINA § 101 is cited for context.',
        title: 'UK Spouse Visa Checklist',
        region: 'UK',
        contentType: 'legal_guide',
        primaryKeyword: 'uk spouse visa',
        audit: AUDIT,
        dryRun: false,
      }),
    ).rejects.toBeInstanceOf(MandatoryComplianceHeldError)
    expect(githubMock('putRepoFile')).not.toHaveBeenCalled()
  })

  it('keeps a legitimately-evaluated NONCRITICAL verdict advisory (nonblocking) — dry-run proceeds', async () => {
    const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
    gate.enforceGate.mockResolvedValue({ mandatory: { applicable: false, met: true, missing: [] }, recorded: true })
    const result = await shipContent({
      mode: 'pr',
      plan: makePlan(),
      content: '## In 60 seconds\nUK banking basics for newcomers.',
      title: 'Open a UK Bank Account',
      region: 'UK',
      contentType: 'regional_page',
      primaryKeyword: 'open bank account uk immigrant',
      audit: AUDIT,
      dryRun: true,
    })
    expect(result.status).toBe('dry_run')
  })
})

describe('evaluateMandatoryComplianceAtShip — the actual seam', () => {
  it('resolves the cell stage from the real classifier when not mocked', async () => {
    const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
    gate.enforceGate.mockResolvedValue({
      mandatory: { applicable: true, met: true, missing: [] },
      recorded: true,
    })
    const res = await evaluateMandatoryComplianceAtShip({
      primaryKeyword: 'uk spouse visa',
      title: 'UK Spouse Visa Checklist',
      content: '## In 60 seconds\ninformation only, not legal advice',
      contentType: 'legal_guide',
    })
    // 'uk spouse visa' classifies to a YMYL-critical cell (visa/citizenship/family).
    expect(['visa', 'citizenship', 'family']).toContain(res.stage)
  })
})