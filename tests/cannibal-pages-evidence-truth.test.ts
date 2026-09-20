/**
 * P4 competing-page evidence truth.
 *
 * Locks the difference between "we have evidence" and "we have a destructive
 * mandate": content-inventory fallback evidence is synthetic with unavailable
 * (never zeroed) metrics and is permanently ineligible; only qualified GSC rows
 * with real metrics and an exact shared query are destructive-eligible — and
 * even then no winner is ever suggested by impressions.
 */

import { resolveCannibalPages } from '@/lib/seoFactory/cannibalMerge'
import { getGscAccess } from '@/lib/gscAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { POST } from '@/app/api/seo-factory/cannibal-pages/route'
import { requireAdminUser } from '@/lib/portalAuth'

jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoDataLoaders', () => ({ loadOwnershipRegistry: jest.fn() }))
jest.mock('@/lib/githubContents', () => ({
  encodeRepoPath: (value: string) => value,
  githubFetch: jest.fn(),
  getBranchHeadSha: jest.fn(),
  createBranchFrom: jest.fn(),
  putRepoFile: jest.fn(),
  openPullRequest: jest.fn(),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))

const access = getGscAccess as jest.Mock
const admin = createSupabaseAdminClient as jest.Mock
const auth = requireAdminUser as jest.Mock
const oldFetch = global.fetch

const NOW = new Date('2026-09-20T06:00:00Z')
const A = 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/'
const B = 'https://legal.yousafeconsultancy.com/au/485-visa-ielts-general-or-academic/'

function gscRows(rows: Array<{ query: string; page: string; impressions: number; clicks: number; position: number }>) {
  return {
    ok: true,
    json: async () => ({
      rows: rows.map((row) => ({
        keys: [row.query, row.page],
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
      })),
    }),
  }
}

function inventoryStub(urls: string[]) {
  return {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => chain,
        limit: async () => ({
          data: urls.map((url) => ({ canonical_url: url, primary_keyword: 'australia 485 english', topic: '', title: '' })),
          error: null,
        }),
      }
      return chain
    },
  }
}

afterEach(() => {
  global.fetch = oldFetch
  jest.clearAllMocks()
})

beforeEach(() => {
  auth.mockResolvedValue({ role: 'admin', profileId: 'p1' })
  // Default: no inventory candidates, so "no pair" expectations are unambiguous.
  admin.mockReturnValue(inventoryStub([]))
})

describe('P4 competing-page evidence truth', () => {
  it('marks content-inventory fallback synthetic with unavailable metrics and destructive-ineligible', async () => {
    access.mockResolvedValue(null)
    admin.mockReturnValue(inventoryStub([A, B]))
    const r = await resolveCannibalPages('australia 485 english', { now: NOW })
    expect(r).toMatchObject({
      source: 'content_inventory',
      // Inventory is display-only: it must never claim to be GSC evidence.
      evidenceSource: 'content_inventory',
      metricsSynthetic: true,
      displayOnly: true,
      eligibleForDestructiveAction: false,
      suggestedWinner: null,
      window: null,
    })
    expect(r?.blockingReasons).toContain('synthetic_inventory_evidence_not_actionable')
    // Truthful labelling: an inventory fallback is not GSC evidence of any kind.
    expect(r?.evidenceSource).not.toBe('persisted_qualified_gsc')
    expect(r?.evidenceSource).not.toBe('gsc_live')
    // Unavailable metrics are null — never coerced to 0.
    expect(r?.pages.map((page) => page.impressions)).toEqual([null, null])
    expect(r?.pages.map((page) => page.position)).toEqual([null, null])
  })

  it('marks exact qualified GSC overlap eligible without inventing a winner', async () => {
    access.mockResolvedValue({ accessToken: 'token', siteUrl: 'sc-domain:yousafeconsultancy.com' })
    global.fetch = jest.fn().mockResolvedValue(
      gscRows([
        { query: '485 english requirements australia', page: B, impressions: 20, clicks: 1, position: 9 },
        { query: '485 english requirements australia', page: A, impressions: 40, clicks: 2, position: 7 },
      ]),
    ) as never
    const r = await resolveCannibalPages('australia 485 english requirements', { now: NOW })
    expect(r).toMatchObject({
      source: 'gsc_live',
      evidenceSource: 'gsc_live',
      metricsSynthetic: false,
      displayOnly: false,
      eligibleForDestructiveAction: true,
      blockingReasons: [],
      suggestedWinner: null,
      window: { startDate: '2026-06-22', endDate: '2026-09-19', capturedAt: '2026-09-20T06:00:00.000Z' },
    })
    expect(r?.pages).toHaveLength(2)
    // Evidence is listed deterministically by URL so impressions cannot imply a winner.
    expect(r?.pages.map((page) => page.url)).toEqual([B.replace(/\/$/, ''), A.replace(/\/$/, '')])
  })

  it('treats zero-impression / deep-tail GSC rows as ineligible non-evidence', async () => {
    access.mockResolvedValue({ accessToken: 'token', siteUrl: 'sc-domain:yousafeconsultancy.com' })
    global.fetch = jest.fn().mockResolvedValue(
      gscRows([
        { query: '485 english requirements australia', page: A, impressions: 0, clicks: 0, position: 0 },
        { query: '485 english requirements australia', page: B, impressions: 0, clicks: 0, position: 0 },
        { query: 'australia 485 english low signal', page: A, impressions: 5, clicks: 0, position: 42 },
        { query: 'australia 485 english low signal', page: B, impressions: 4, clicks: 0, position: 40 },
      ]),
    ) as never
    expect(await resolveCannibalPages('australia 485 english requirements', { now: NOW })).toBeNull()
  })

  it('requires two pages sharing one qualified query', async () => {
    access.mockResolvedValue({ accessToken: 'token', siteUrl: 'sc-domain:yousafeconsultancy.com' })
    global.fetch = jest.fn().mockResolvedValue(
      gscRows([
        { query: '485 english requirements australia', page: A, impressions: 40, clicks: 2, position: 7 },
        { query: 'subclass 485 english test australia', page: B, impressions: 20, clicks: 1, position: 9 },
      ]),
    ) as never
    expect(await resolveCannibalPages('australia 485 english requirements', { now: NOW })).toBeNull()
  })

  it('exposes evidence source, synthetic flag, blockers and a null suggested winner over HTTP', async () => {
    access.mockResolvedValue(null)
    admin.mockReturnValue(inventoryStub([A, B]))
    const res = await POST({ json: async () => ({ term: 'australia 485 english' }) } as never)
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload).toMatchObject({
      ok: true,
      source: 'content_inventory',
      evidenceSource: 'content_inventory',
      metricsSynthetic: true,
      displayOnly: true,
      eligibleForDestructiveAction: false,
      destructiveEligible: false,
      suggestedWinner: null,
      winnerSelection: 'authoritative_p3_owner_only',
    })
    expect(payload.evidenceSource).not.toBe('persisted_qualified_gsc')
    expect(payload.evidenceSource).not.toBe('gsc_live')
  })

  it('returns blockers and a null winner when nothing resolvable is found', async () => {
    access.mockResolvedValue(null)
    admin.mockReturnValue(inventoryStub([]))
    const res = await POST({ json: async () => ({ term: 'australia 485 english' }) } as never)
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      eligibleForDestructiveAction: false,
      destructiveEligible: false,
      suggestedWinner: null,
      blockers: ['two_competing_pages_required'],
    })
  })

  it('keeps admin auth on the evidence route', async () => {
    auth.mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await POST({ json: async () => ({ term: 'x' }) } as never)
    expect(res.status).toBe(403)
  })
})
