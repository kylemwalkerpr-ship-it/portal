/**
 * P6 — persistence must prove targets live before writing planner edges.
 *
 * The daily planner used to persist synthetic journey/cross-country/cluster
 * targets that 404 in production, and a verifier failure was indistinguishable
 * from "nothing to store". Both are now fail-closed: zero unverified edges are
 * written, the caller receives a truthful error, and replanning still preserves
 * lifecycle + verification truth.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/linkAudit', () => ({
  filterLiveInternalUrls: jest.fn(),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import { filterLiveInternalUrls } from '@/lib/seoFactory/linkAudit'
import {
  marketplaceCategoryHref,
  persistInterlinkPlan,
  persistPlannerInterlinks,
  selectLiveInterlinkEdges,
  type InterlinkEdge,
} from '@/lib/seoEngine/interlink'
import { createP6FakeDb } from './helpers/p6InterlinkFakeDb'

const LIVE = 'https://market.yousafeconsultancy.com/categories/study-permits'
const DEAD = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
const filterLiveInternalUrlsMock = jest.mocked(filterLiveInternalUrls)

function edge(targetUrl: string, overrides: Partial<InterlinkEdge> = {}): InterlinkEdge {
  return {
    sourceSlug: 'seo-us-schools-f1-checklist',
    targetUrl,
    targetHost: targetUrl.includes('market.') ? 'market' : 'legal',
    anchorText: 'Study permits guide',
    reason: 'journey_next',
    score: 0.9,
    ...overrides,
  }
}

function installDb(seed: Array<Record<string, unknown>> = []) {
  const db = createP6FakeDb(seed)
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  return db
}

beforeEach(() => {
  jest.clearAllMocks()
  filterLiveInternalUrlsMock.mockImplementation(async (urls: string[]) => urls)
})

describe('A) dead targets are filtered before any write', () => {
  it('persists only the live subset and returns the true stored count', async () => {
    const db = installDb()
    filterLiveInternalUrlsMock.mockResolvedValue([LIVE])

    const result = await persistInterlinkPlan([edge(LIVE), edge(DEAD)])

    expect(result).toEqual({ stored: 1, filtered: 1 })
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toHaveLength(1)
    expect(db.upserts[0].rows[0].target_url).toBe(LIVE)
    expect(db.upserts[0].rows.some((row) => row.target_url === DEAD)).toBe(false)
  })

  it('keeps a live canonical Marketplace category URL', async () => {
    const db = installDb()
    const market = marketplaceCategoryHref('study-permits')
    expect(market).toBe(LIVE)
    filterLiveInternalUrlsMock.mockResolvedValue([market])

    const result = await persistInterlinkPlan([edge(market, { reason: 'marketplace_cta' })])

    expect(result).toEqual({ stored: 1, filtered: 0 })
    expect(db.upserts[0].rows[0]).toMatchObject({ target_url: market, reason: 'marketplace_cta' })
  })
})

describe('B) verifier failure persists zero unverified edges', () => {
  it('returns a truthful error and never creates a Supabase client when the verifier throws', async () => {
    const db = installDb()
    filterLiveInternalUrlsMock.mockRejectedValue(new Error('sitemap unavailable'))

    const result = await persistInterlinkPlan([edge(LIVE), edge(DEAD)])

    expect(result.stored).toBe(0)
    expect(result.error).toMatch(/liveness verification failed/i)
    expect(result.error).toMatch(/zero unverified edges/i)
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
    expect(db.upserts).toHaveLength(0)
  })

  it('treats successfully checked dead/synthetic targets as benign filtered hygiene', async () => {
    const db = installDb()
    filterLiveInternalUrlsMock.mockResolvedValue([])

    const result = await persistInterlinkPlan([edge(LIVE), edge(DEAD)])

    // Verified dead => zero persisted for those edges + a truthful filtered
    // count, NOT a fatal error (the daily engine must not be chronically red
    // because dead planner targets were rejected).
    expect(result.stored).toBe(0)
    expect(result.filtered).toBe(2)
    expect(result.error).toBeUndefined()
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
    expect(db.upserts).toHaveLength(0)
  })

  it('surfaces a truthful filtered count through persistPlannerInterlinks without errors', async () => {
    installDb()
    filterLiveInternalUrlsMock.mockResolvedValue([])

    const result = await persistPlannerInterlinks([
      {
        clusterId: 'seo-us-schools-f1-checklist',
        stage: 'schools',
        country: 'US',
        plan: { contentType: 'blog_post' },
      },
    ])

    expect(result.stored).toBe(0)
    expect(result.filtered).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
  })

  it('propagates real verifier-unavailable errors through persistPlannerInterlinks', async () => {
    installDb()
    filterLiveInternalUrlsMock.mockRejectedValue(new Error('verifier down'))

    const result = await persistPlannerInterlinks([
      {
        clusterId: 'seo-us-schools-f1-checklist',
        stage: 'schools',
        country: 'US',
        plan: { contentType: 'blog_post' },
      },
    ])

    expect(result.stored).toBe(0)
    expect(result.filtered).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/verifier down/)
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
  })
})

describe('C) marketplace canonical guard still runs before liveness', () => {
  it('rejects a noncanonical marketplace_cta edge without consulting liveness', async () => {
    const db = installDb()

    const result = await persistInterlinkPlan([
      edge('https://portal.yousafeconsultancy.com/marketplace/categories/work-permits', {
        reason: 'marketplace_cta',
        targetHost: 'market',
      }),
    ])

    expect(result.stored).toBe(0)
    expect(result.error).toMatch(/marketplace_cta/)
    expect(filterLiveInternalUrlsMock).not.toHaveBeenCalled()
    expect(db.upserts).toHaveLength(0)
  })
})

describe('D) replanning preserves lifecycle and verification truth', () => {
  it('omits lifecycle/verification columns and keeps the unique-conflict upsert shape', async () => {
    const db = installDb([
      {
        id: 'row-1',
        source_slug: 'seo-us-schools-f1-checklist',
        target_url: LIVE,
        status: 'applied',
        applied_at: '2026-09-01T00:00:00.000Z',
        source_url: 'https://legal.yousafeconsultancy.com/us/student-visas/',
        source_job_id: '88888888-8888-4888-8888-888888888888',
        verification_state: 'present',
        verified_at: '2026-09-01T00:00:00.000Z',
        verification_evidence: { proof: 'live_exact_href', target: LIVE },
        gate_state: 'cleared',
        gate_reason: 'not_applicable',
        gate_actor: 'ops@yousafeconsultancy.com',
        gate_updated_at: '2026-09-02T00:00:00.000Z',
      },
    ])

    const result = await persistInterlinkPlan([edge(LIVE, { anchorText: 'Regenerated anchor', score: 0.7 })])

    expect(result).toEqual({ stored: 1, filtered: 0 })
    const [{ rows, options }] = db.upserts
    expect(options).toMatchObject({ onConflict: 'source_slug,target_url', defaultToNull: false })
    for (const column of [
      'status',
      'applied_at',
      'source_url',
      'source_job_id',
      'verification_state',
      'verified_at',
      'verification_evidence',
      'staged_at',
      'gate_state',
      'gate_reason',
      'gate_actor',
      'gate_updated_at',
    ]) {
      expect(rows[0]).not.toHaveProperty(column)
    }
    const stored = db.rows[0]
    expect(stored.status).toBe('applied')
    expect(stored.applied_at).toBe('2026-09-01T00:00:00.000Z')
    expect(stored.source_url).toBe('https://legal.yousafeconsultancy.com/us/student-visas/')
    // Exact job identity survives replanning like every other lifecycle column.
    expect(stored.source_job_id).toBe('88888888-8888-4888-8888-888888888888')
    expect(stored.verification_state).toBe('present')
    expect(stored.verification_evidence).toMatchObject({ proof: 'live_exact_href' })
    expect(stored.anchor_text).toBe('Regenerated anchor')
    expect(stored.score).toBe(0.7)
  })
})

describe('E) pure live-edge selection', () => {
  it('matches with trailing-slash tolerance and drops everything else', () => {
    const kept = selectLiveInterlinkEdges(
      [edge(LIVE), edge(`${LIVE}/`), edge(DEAD)],
      [`${LIVE}/`],
    )
    expect(kept.map((item) => item.targetUrl)).toEqual([LIVE, `${LIVE}/`])
  })

  it('returns nothing when the live set is empty', () => {
    expect(selectLiveInterlinkEdges([edge(LIVE)], [])).toEqual([])
  })
})
