/**
 * P4 destructive executor guards.
 *
 * These are the non-negotiable safety invariants for the only code path that can
 * mutate the estate from a cannibalization decision:
 *   - direct/`merge` mode is impossible;
 *   - a missing/invalid decision produces zero persistence and zero Git writes;
 *   - the decision row is persisted BEFORE the first branch/file mutation;
 *   - persistence failure ⇒ zero Git writes;
 *   - no Git mutation may target `main`;
 *   - stale/missing rollback evidence fails closed before anything runs.
 */

import { executeCannibalMerge } from '@/lib/seoFactory/cannibalMerge'
import { computeCannibalEvidenceHash, type CannibalDecisionRecord } from '@/lib/seoFactory/cannibalDecision'

jest.mock('@/lib/seoDataLoaders', () => ({ loadOwnershipRegistry: jest.fn() }))
jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/githubContents', () => ({
  encodeRepoPath: (value: string) => value,
  githubFetch: jest.fn(),
  getBranchHeadSha: jest.fn(),
  createBranchFrom: jest.fn(),
  putRepoFile: jest.fn(),
  openPullRequest: jest.fn(),
}))

const { loadOwnershipRegistry } = jest.requireMock('@/lib/seoDataLoaders') as { loadOwnershipRegistry: jest.Mock }
const { createSupabaseAdminClient } = jest.requireMock('@/lib/supabase') as { createSupabaseAdminClient: jest.Mock }
const github = jest.requireMock('@/lib/githubContents') as Record<string, jest.Mock>

const OWNER = 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/'
const LOSER = 'https://legal.yousafeconsultancy.com/au/485-visa-ielts-general-or-academic/'
const REDIRECT_FILE = 'public/_redirects'
const REDIRECT_SHA = '0123456789abcdef0123456789abcdef01234567'
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98'

const ownerRow = {
  id: 59,
  primary_keyword: 'australia 485 english requirements',
  intent_class: 'procedural',
  owner_host: 'legal',
  owner_url: OWNER,
  supporting_urls: [],
  action: 'expand',
  market_destination: null,
  status: 'confirmed',
  notes: 'fixture',
}

function decision(overrides: Partial<CannibalDecisionRecord> = {}): CannibalDecisionRecord {
  const q = { query: '485 english requirements australia', impressions: 20, clicks: 1, position: 8 }
  const base = {
    clusterId: 'p4-au-485',
    term: 'australia 485 english requirements',
    evidenceSource: 'persisted_qualified_gsc',
    evidenceWindow: { startDate: '2026-06-22', endDate: '2026-09-19', capturedAt: '2026-09-20T05:39:02Z' },
    evidenceHash: '',
    competitors: [
      { url: OWNER, impressions: 45, clicks: 2, position: 7, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [q] },
      { url: LOSER, impressions: 20, clicks: 1, position: 9, primaryIntent: 'Australia subclass 485 IELTS English requirements', sharedQueries: [q] },
    ],
    primaryIntentComparison: 'same 485 English requirement intent',
    authoritativeOwner: { registryRowId: 59, ownerUrl: OWNER, status: 'confirmed', action: 'expand', intentClass: 'procedural' },
    winnerUrl: OWNER,
    backlinks: { status: 'unknown' },
    internalLinks: { status: 'unknown' },
    loserActions: [{ url: LOSER, action: 'redirect_301' as const, target: OWNER }],
    rollback: {
      files: [{ repo: 'caseworks', path: REDIRECT_FILE, sha: REDIRECT_SHA }],
      restoreInstructions: 'Revert the PR and restore the recorded redirect file SHA.',
    },
    decidedBy: 'admin',
    decidedAt: '2026-09-20T08:00:00Z',
    ...overrides,
  } as CannibalDecisionRecord
  base.evidenceHash = computeCannibalEvidenceHash(base)
  return base
}

let persistenceFails = false
let persistCalls = 0
let persistFailAt: number | null = null
let legacyWrites = 0
let order: string[] = []

function dbStub() {
  return {
    from: (table: string) => {
      if (table === 'seo_cannibal_decisions') {
        return {
          insert: () => {
            order.push('persist')
            persistCalls += 1
            const fails = persistenceFails || persistFailAt === persistCalls
            return {
              select: () => ({
                single: async () =>
                  fails
                    ? { data: null, error: { message: 'db down' } }
                    : { data: { id: 'decision-1' }, error: null },
              }),
            }
          },
        }
      }
      if (table === 'cannibal_merges') return {
        upsert: async () => {
          legacyWrites += 1
          return { error: null }
        },
      }
      if (table === 'content_jobs') throw new Error('content_jobs must not be read by the executor')
      throw new Error(`unexpected table ${table}`)
    },
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    term: 'australia 485 english requirements',
    winnerUrl: OWNER,
    loserUrls: [LOSER],
    mode: 'pr' as const,
    confirm: true,
    decision: decision(),
    ...overrides,
  } as Parameters<typeof executeCannibalMerge>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  persistenceFails = false
  persistCalls = 0
  persistFailAt = null
  legacyWrites = 0
  order = []
  loadOwnershipRegistry.mockResolvedValue({ rows: [ownerRow] })
  createSupabaseAdminClient.mockImplementation(dbStub)
  github.githubFetch.mockResolvedValue({
    content: Buffer.from('# redirects\n/some-old-page/  https://legal.yousafeconsultancy.com/x/  301\n').toString('base64'),
    sha: REDIRECT_SHA,
  })
  github.getBranchHeadSha.mockResolvedValue('mainsha')
  github.createBranchFrom.mockImplementation(async () => {
    order.push('branch')
  })
  github.putRepoFile.mockImplementation(async (args: { branch: string }) => {
    if (args.branch === 'main') throw new Error('main write attempted')
    order.push('write')
  })
  github.openPullRequest.mockImplementation(async () => {
    order.push('pr')
    return { html_url: 'https://github.com/kylemwalkerpr-ship-it/caseworks/pull/9', number: 9 }
  })
})

describe('P4 cannibal executor guard', () => {
  it('rejects direct merge mode before persistence or Git mutation', async () => {
    await expect(
      executeCannibalMerge(request({ mode: 'merge' as never })),
    ).rejects.toThrow(/pr_mode_required/)
    expect(order).toEqual([])
    expect(github.createBranchFrom).not.toHaveBeenCalled()
    expect(github.putRepoFile).not.toHaveBeenCalled()
  })

  it('rejects a missing decision and an invalid decision with zero persistence and zero Git writes', async () => {
    await expect(executeCannibalMerge(request({ decision: undefined }))).rejects.toThrow(/decision_required/)
    const tampered = decision()
    tampered.winnerUrl = LOSER
    await expect(executeCannibalMerge(request({ winnerUrl: LOSER, decision: tampered })))
      .rejects.toThrow(/winner_must_equal_authoritative_owner/)
    expect(order).toEqual([])
    expect(github.getBranchHeadSha).not.toHaveBeenCalled()
    expect(github.putRepoFile).not.toHaveBeenCalled()
  })

  it('rejects a junk term and a request that disagrees with the decision', async () => {
    await expect(executeCannibalMerge(request({ term: 'rates final.pdf' }))).rejects.toThrow(/term_not_actionable/)
    await expect(executeCannibalMerge(request({ term: 'a different cluster term' }))).rejects.toThrow(/request_term_must_match_decision/)
    await expect(executeCannibalMerge(request({ winnerUrl: 'https://legal.yousafeconsultancy.com/au/other/' })))
      .rejects.toThrow(/request_winner_must_match_decision/)
    await expect(executeCannibalMerge(request({ loserUrls: [] }))).rejects.toThrow(/request_losers_must_match_decision/)
    expect(order).toEqual([])
  })

  it('persists the decision before the first branch creation and never writes main', async () => {
    const result = await executeCannibalMerge(request())
    expect(order[0]).toBe('persist')
    expect(order.indexOf('persist')).toBeLessThan(order.indexOf('branch'))
    expect(order.indexOf('branch')).toBeLessThan(order.indexOf('write'))
    expect(order.indexOf('write')).toBeLessThan(order.indexOf('pr'))
    const branchArg = github.createBranchFrom.mock.calls[0][2]
    expect(branchArg).toMatch(/^cannibal-p4-/)
    expect(branchArg).not.toBe('main')
    for (const call of github.putRepoFile.mock.calls) {
      expect(call[0].branch).not.toBe('main')
      expect(String(call[0].branch)).toMatch(/^cannibal-p4-/)
    }
    expect(github.getBranchHeadSha).toHaveBeenCalledWith(expect.any(String), 'caseworks', 'main')
    expect(result.mode).toBe('pr')
    expect(result.decisionId).toBe('decision-1')
    expect(result.evidenceHash).toBe(decision().evidenceHash)
    expect(result.redirectsAdded).toHaveLength(1)
    expect(result.redirectsAdded[0]).toMatchObject({
      from: '/au/485-visa-ielts-general-or-academic/',
      to: '/au/english-language-requirements-student-485/',
      repo: 'caseworks',
      file: REDIRECT_FILE,
    })
    expect(result.commits[0].prUrl).toContain('/pull/9')
  })

  it('records the PR linkage as a new ledger row and never merges', async () => {
    await executeCannibalMerge(request())
    expect(order.filter((entry) => entry === 'persist')).toHaveLength(2)
  })

  it('reports a completed, ledger-backed outcome when both ledger rows persist', async () => {
    const result = await executeCannibalMerge(request())
    expect(result.status).toBe('completed')
    expect(result.ledgerPersisted).toBe(true)
    expect(result.blockers).toEqual([])
    expect(order.filter((entry) => entry === 'persist')).toHaveLength(2)
  })

  it('fails closed with a needs-decision outcome when the pr_opened ledger row cannot be persisted', async () => {
    persistFailAt = 2
    const result = await executeCannibalMerge(request())
    // Partial state: the review PR exists, its append-only ledger row does not.
    expect(result.status).toBe('needs_decision')
    expect(result.ledgerPersisted).toBe(false)
    expect(result.blockers).toContain('pr_opened_ledger_persistence_failed')
    // The operator still sees the PR that was opened — never a clean success.
    expect(result.commits).toHaveLength(1)
    expect(result.commits[0].prUrl).toContain('/pull/9')
    expect(result.redirectsAdded).toHaveLength(1)
    expect(order.filter((entry) => entry === 'persist')).toHaveLength(2)
  })

  it('stops mutating after a failed pr_opened ledger write — a second PR is never opened', async () => {
    const auLoser = 'https://au.yousafeconsultancy.com/au/485-english-requirements-guide/'
    const auSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const shared = { query: '485 english requirements australia', impressions: 20, clicks: 1, position: 8 }
    github.githubFetch.mockImplementation(async (path: string) => ({
      content: Buffer.from('# redirects\n').toString('base64'),
      sha: String(path).includes('au/public/_redirects') ? auSha : REDIRECT_SHA,
    }))
    const d = decision({
      competitors: [
        { url: OWNER, impressions: 45, clicks: 2, position: 7, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [shared] },
        { url: LOSER, impressions: 20, clicks: 1, position: 9, primaryIntent: 'Australia subclass 485 IELTS English requirements', sharedQueries: [shared] },
        { url: auLoser, impressions: 15, clicks: 0, position: 12, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [shared] },
      ],
      loserActions: [
        { url: LOSER, action: 'redirect_301' as const, target: OWNER },
        { url: auLoser, action: 'redirect_301' as const, target: OWNER },
      ],
      rollback: {
        files: [
          { repo: 'caseworks', path: REDIRECT_FILE, sha: REDIRECT_SHA },
          { repo: 'yousafe-consultancy', path: 'au/public/_redirects', sha: auSha },
        ],
        restoreInstructions: 'Revert the review PR and restore the recorded file SHAs.',
      },
    })
    persistFailAt = 2
    const result = await executeCannibalMerge(request({ loserUrls: [LOSER, auLoser], decision: d }))
    expect(result.status).toBe('needs_decision')
    expect(result.blockers).toContain('pr_opened_ledger_persistence_failed')
    expect(result.commits).toHaveLength(1)
    expect(github.createBranchFrom).toHaveBeenCalledTimes(1)
    expect(github.openPullRequest).toHaveBeenCalledTimes(1)
    expect(order.filter((entry) => entry === 'persist')).toHaveLength(2)
  })

  it('persistence failure causes zero Git mutations', async () => {
    persistenceFails = true
    await expect(executeCannibalMerge(request())).rejects.toThrow(/persistence failed/)
    expect(order).toEqual(['persist'])
    expect(github.createBranchFrom).not.toHaveBeenCalled()
    expect(github.putRepoFile).not.toHaveBeenCalled()
    expect(github.openPullRequest).not.toHaveBeenCalled()
  })

  it('stale rollback SHA fails closed with zero persistence and zero Git writes', async () => {
    github.githubFetch.mockResolvedValue({
      content: Buffer.from('# redirects\n').toString('base64'),
      sha: OTHER_SHA,
    })
    await expect(executeCannibalMerge(request())).rejects.toThrow(/rollback_sha_mismatch:caseworks:public\/_redirects/)
    expect(order).toEqual([])
    expect(github.putRepoFile).not.toHaveBeenCalled()
  })

  it('missing rollback entry for a file the PR would touch fails closed', async () => {
    const d = decision({
      rollback: {
        files: [{ repo: 'yousafe-consultancy', path: 'au/public/_redirects', sha: REDIRECT_SHA }],
        restoreInstructions: 'revert',
      },
    })
    await expect(executeCannibalMerge(request({ decision: d }))).rejects.toThrow(/rollback_file_missing:caseworks:public\/_redirects/)
    expect(order).toEqual([])
  })

  it('a loser whose action has no repo target fails before persistence', async () => {
    const marketLoser = 'https://market.yousafeconsultancy.com/gigs/f1-resume-review'
    const d = decision({
      competitors: [
        { url: OWNER, impressions: 45, clicks: 2, position: 7, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [{ query: '485 english requirements australia', impressions: 20, clicks: 1, position: 8 }] },
        { url: marketLoser, impressions: 20, clicks: 1, position: 9, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [{ query: '485 english requirements australia', impressions: 20, clicks: 1, position: 8 }] },
      ],
      loserActions: [{ url: marketLoser, action: 'redirect_301', target: OWNER }],
    })
    await expect(executeCannibalMerge(request({ loserUrls: [marketLoser], decision: d })))
      .rejects.toThrow(/unactionable_loser|cannibal decision blocked/)
    expect(order).toEqual([])
  })

  it('returns an explicit skipped no-op without opening a PR or writing legacy terminal history', async () => {
    github.githubFetch.mockResolvedValue({
      content: Buffer.from('# redirects\n/au/485-visa-ielts-general-or-academic/  /au/english-language-requirements-student-485/  301\n').toString('base64'),
      sha: REDIRECT_SHA,
    })
    const result = await executeCannibalMerge(request())
    expect(result.status).toBe('skipped')
    expect(result.blockers).toContain('no_actionable_writes')
    expect(result.commits).toHaveLength(0)
    expect(order).toEqual(['persist'])
    expect(legacyWrites).toBe(0)
    expect(github.createBranchFrom).not.toHaveBeenCalled()
    expect(github.putRepoFile).not.toHaveBeenCalled()
    expect(github.openPullRequest).not.toHaveBeenCalled()
  })

  it('plans a 301 for a legal loser and appends it under a P4 review header', async () => {
    await executeCannibalMerge(request())
    const write = github.putRepoFile.mock.calls[0][0]
    expect(write.path).toBe(REDIRECT_FILE)
    expect(write.content).toContain('/au/485-visa-ielts-general-or-academic/  /au/english-language-requirements-student-485/  301')
    expect(write.content).toContain('# P4 evidence-backed cannibal consolidation')
    expect(write.sha).toBe(REDIRECT_SHA)
    expect(github.openPullRequest.mock.calls[0][0].base).toBe('main')
    expect(github.openPullRequest.mock.calls[0][0].head).toMatch(/^cannibal-p4-/)
  })
})
