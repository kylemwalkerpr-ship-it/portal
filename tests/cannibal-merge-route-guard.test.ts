/**
 * P4 cannibal-merge route guards: admin auth, explicit PR mode, explicit
 * confirmation, a complete decision object, and structured blockers back to the
 * operator. The route must never reach the executor for anything else.
 */

import { POST } from '@/app/api/seo-factory/cannibal-merge/route'
import { requireAdminUser } from '@/lib/portalAuth'
import { executeCannibalMerge } from '@/lib/seoFactory/cannibalMerge'
import { CannibalDecisionBlockedError } from '@/lib/seoFactory/cannibalDecision'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))
jest.mock('@/lib/seoFactory/cannibalMerge', () => ({ executeCannibalMerge: jest.fn() }))

const auth = requireAdminUser as jest.Mock
const execute = executeCannibalMerge as jest.Mock

const request = (body: unknown) => ({ json: async () => body }) as never

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ role: 'admin', profileId: 'p1' })
  execute.mockResolvedValue({
    mode: 'pr',
    term: 'australia 485 english requirements',
    clusterId: 'p4-au-485',
    winnerUrl: 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/',
    decisionId: 'decision-1',
    evidenceHash: 'hash',
    redirectsAdded: [],
    filesUpdated: [],
    commits: [{ repo: 'caseworks', branch: 'cannibal-p4-x', commitSha: '', prUrl: 'https://github.com/x/y/pull/9' }],
    skipped: [],
  })
})

describe('P4 cannibal merge route guard', () => {
  it('requires a term', async () => {
    const res = await POST(request({ mode: 'pr', confirm: true, decision: {} }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ blockers: ['term_required'] })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects absent or direct merge mode with structured blockers', async () => {
    for (const extra of [{}, { mode: 'merge' }, { mode: 'direct' }]) {
      const res = await POST(
        request({ term: 'x', confirm: true, decision: { winnerUrl: 'https://x' }, ...extra }),
      )
      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({ blockers: ['pr_mode_required'] })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects explicit direct-publish flags', async () => {
    for (const flag of ['direct', 'mergeNow', 'skipReview', 'autoMerge']) {
      const res = await POST(
        request({ term: 'x', mode: 'pr', confirm: true, decision: {}, [flag]: true }),
      )
      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({ blockers: ['direct_publish_forbidden'] })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and a decision object', async () => {
    expect((await POST(request({ term: 'x', mode: 'pr', decision: {} }))).status).toBe(409)
    expect((await POST(request({ term: 'x', mode: 'pr', confirm: true }))).status).toBe(409)
    expect((await POST(request({ term: 'x', mode: 'pr', confirm: true, decision: [] }))).status).toBe(409)
    expect(execute).not.toHaveBeenCalled()
  })

  it('invokes the executor only for an explicit PR decision and forwards mode pr', async () => {
    const res = await POST(
      request({
        term: 'australia 485 english requirements',
        mode: 'pr',
        confirm: true,
        decision: { winnerUrl: 'https://x' },
        winnerUrl: 'https://x',
        loserUrls: ['https://y'],
      }),
    )
    expect(res.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toMatchObject({ mode: 'pr', confirm: true, term: 'australia 485 english requirements' })
    expect(execute.mock.calls[0][0].decision).toMatchObject({ winnerUrl: 'https://x' })
  })

  it('returns the persisted decision id and PR url to the operator', async () => {
    const res = await POST(request({ term: 'australia 485 english requirements', mode: 'pr', confirm: true, decision: { winnerUrl: 'https://x' } }))
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      decisionId: 'decision-1',
      commits: [{ prUrl: 'https://github.com/x/y/pull/9' }],
    })
  })

  it('surfaces partial state as 409 needs-decision instead of a clean success', async () => {
    execute.mockResolvedValue({
      status: 'needs_decision',
      ledgerPersisted: false,
      blockers: ['pr_opened_ledger_persistence_failed'],
      mode: 'pr',
      decisionId: 'decision-1',
      winnerUrl: 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/',
      redirectsAdded: [],
      filesUpdated: [],
      commits: [{ repo: 'caseworks', branch: 'cannibal-p4-x', commitSha: '', prUrl: 'https://github.com/x/y/pull/9' }],
      skipped: [],
    })
    const res = await POST(request({ term: 'australia 485 english requirements', mode: 'pr', confirm: true, decision: { winnerUrl: 'https://x' } }))
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      needsDecision: true,
      blockers: ['pr_opened_ledger_persistence_failed'],
      commits: [{ prUrl: 'https://github.com/x/y/pull/9' }],
    })
  })

  it('surfaces decision blockers as 409 without a 500', async () => {
    execute.mockRejectedValue(new CannibalDecisionBlockedError(['winner_must_equal_authoritative_owner', 'rollback_snapshot_required']))
    const res = await POST(request({ term: 'x', mode: 'pr', confirm: true, decision: { winnerUrl: 'https://x' } }))
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      blockers: ['winner_must_equal_authoritative_owner', 'rollback_snapshot_required'],
    })
  })

  it('preserves admin auth', async () => {
    auth.mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await POST(request({ term: 'x', mode: 'pr', confirm: true, decision: {} }))
    expect(res.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })
})
