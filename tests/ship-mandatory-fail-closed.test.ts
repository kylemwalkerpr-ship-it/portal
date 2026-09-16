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

  it('keeps a legitimately-evaluated mandatory.applicable=false verdict advisory (nonblocking) on a genuine exact-live existing owner — dry-run proceeds', async () => {
    const gate = require('@/lib/seoEngine/gate') as { enforceGate: jest.Mock }
    gate.enforceGate.mockResolvedValue({ mandatory: { applicable: false, met: true, missing: [] }, recorded: true })
    // The gate legitimately evaluated this mission and returned
    // mandatory.applicable=false, so the non-applicable mandatory verdict stays
    // advisory/nonblocking. Genuine exact-live registry-backed destination
    // (registry id 3): the P0 global publication freeze re-resolves ownership
    // on the real ship path and requires an exact live existence proof, so this
    // test mocks the live probe with an exact 200 (no real network) to prove
    // the advisory verdict on a genuine existing owner.
    const ownerUrl = 'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'
    const originalFetch = global.fetch
    const liveFetchMock = jest.fn(async () => ({ ok: true, status: 200, url: ownerUrl }))
    ;(global as unknown as { fetch: unknown }).fetch = liveFetchMock
    require('@/lib/seoFactory/broadCreateFreeze').resetBroadCreateLiveCache?.()
    try {
      const result = await shipContent({
        mode: 'pr',
        plan: makePlan({
          matched: {
            id: 3,
            primary_keyword: 'f-1 document checklist',
            intent_class: 'checklist',
            owner_host: 'legal',
            owner_url: ownerUrl,
            supporting_urls: [],
            action: 'keep',
            market_destination: null,
            status: 'confirmed',
            notes: '',
          } as OwnerPlan['matched'],
          routingSource: 'registry_owner_url',
          canonicalUrl: ownerUrl,
          filePath: 'app/us/student-visas/f1-document-checklist-2026/page.tsx',
          contentType: 'legal_guide',
        }),
        content: '## In 60 seconds\nInformation only, not legal advice.',
        title: 'F-1 Document Checklist',
        region: 'US',
        contentType: 'legal_guide',
        primaryKeyword: 'f-1 document checklist',
        audit: AUDIT,
        dryRun: true,
      })
      expect(result.status).toBe('dry_run')
      expect(liveFetchMock).toHaveBeenCalled()
    } finally {
      ;(global as unknown as { fetch: unknown }).fetch = originalFetch
    }
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