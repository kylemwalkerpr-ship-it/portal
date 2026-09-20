/**
 * P0 Marketplace interlink persistence invariant.
 *
 * Every persisted InterlinkEdge with reason === 'marketplace_cta' must be
 * exactly `https://market.yousafeconsultancy.com/categories/<valid-id>` with
 * targetHost 'market'. The guard is fail-closed and runs BEFORE the Supabase
 * client is created: one bad edge rejects the whole batch with zero DB writes.
 * Non-marketplace_cta reasons are deliberately unaffected — legitimately
 * Portal-hosted targets remain allowed for those callers.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/linkAudit', () => ({
  // P6 target-liveness gate: this suite is about marketplace canonical shapes,
  // so targets pass the liveness gate by default and the liveness-specific
  // cases live in tests/p6-*.
  filterLiveInternalUrls: jest.fn(async (urls: string[]) => urls),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  findNoncanonicalMarketplaceCta,
  generateInterlinkPlan,
  marketplaceCategoryHref,
  persistInterlinkPlan,
  type InterlinkEdge,
} from '@/lib/seoEngine/interlink'

const MARKET = 'https://market.yousafeconsultancy.com'
const PORTAL = 'https://portal.yousafeconsultancy.com'

const upsert = jest.fn()
const from = jest.fn(() => ({ upsert }))
const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

beforeEach(() => {
  jest.clearAllMocks()
  upsert.mockResolvedValue({ error: null })
  createSupabaseAdminClientMock.mockReturnValue({ from } as never)
})

function marketplaceEdge(overrides: Partial<InterlinkEdge> = {}): InterlinkEdge {
  return {
    sourceSlug: 'seo-us-schools-f1-checklist',
    targetUrl: marketplaceCategoryHref('study-permits'),
    targetHost: 'market',
    anchorText: 'Find study permits help on the marketplace',
    contextH2: 'Get professional help',
    reason: 'marketplace_cta',
    score: 0.85,
    ...overrides,
  }
}

describe('A) canonical marketplace_cta persists normally', () => {
  it.each(['immigration', 'study-permits'])(
    'accepts a real catalogue id (%s) and reaches exactly one upsert',
    async (id) => {
      const result = await persistInterlinkPlan([
        marketplaceEdge({ targetUrl: `${MARKET}/categories/${id}` }),
      ])

      expect(result).toEqual({ stored: 1 })
      expect(createSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
      expect(from).toHaveBeenCalledWith('seo_interlinks')
      expect(upsert).toHaveBeenCalledTimes(1)
      const [rows, options] = upsert.mock.calls[0]
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        reason: 'marketplace_cta',
        target_url: `${MARKET}/categories/${id}`,
        target_host: 'market',
      })
      expect(rows[0]).not.toHaveProperty('status')
      expect(rows[0]).not.toHaveProperty('applied_at')
      expect(rows[0]).not.toHaveProperty('gate_state')
      expect(rows[0]).not.toHaveProperty('gate_reason')
      expect(rows[0]).not.toHaveProperty('gate_actor')
      expect(rows[0]).not.toHaveProperty('gate_updated_at')
      expect(options).toMatchObject({ onConflict: 'source_slug,target_url', defaultToNull: false })
    },
  )
})

describe('B) noncanonical marketplace_cta shapes fail closed before any DB client', () => {
  const badShapes: Array<[string, Partial<InterlinkEdge>]> = [
    ['Portal singular legacy', { targetUrl: `${PORTAL}/marketplace/category/study-permits` }],
    ['Portal plural legacy', { targetUrl: `${PORTAL}/marketplace/categories/study-permits` }],
    ['market host with /marketplace/category', { targetUrl: `${MARKET}/marketplace/category/study-permits` }],
    ['market host with /marketplace/categories', { targetUrl: `${MARKET}/marketplace/categories/study-permits` }],
    ['unknown canonical category id', { targetUrl: `${MARKET}/categories/not-a-real-service` }],
    ['query string', { targetUrl: `${MARKET}/categories/immigration?utm_source=legacy` }],
    ['fragment', { targetUrl: `${MARKET}/categories/immigration#apply` }],
    ['wrong targetHost for a canonical URL', { targetUrl: `${MARKET}/categories/immigration`, targetHost: 'portal' }],
  ]

  it.each(badShapes)('rejects %s before creating the client', async (_name, overrides) => {
    const result = await persistInterlinkPlan([marketplaceEdge(overrides)])

    expect(result.stored).toBe(0)
    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/marketplace_cta/)
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('C) validation is atomic across the batch', () => {
  it('performs zero writes when one valid edge is mixed with one invalid marketplace_cta edge', async () => {
    const batch = [
      marketplaceEdge(),
      marketplaceEdge({
        sourceSlug: 'seo-ca-work-permits-lmia',
        targetUrl: `${PORTAL}/marketplace/categories/work-permits`,
      }),
    ]

    const result = await persistInterlinkPlan(batch)

    expect(result.stored).toBe(0)
    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/marketplace_cta/)
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('D) non-marketplace_cta reasons are not globally blocked', () => {
  it('persists a Portal-hosted edge for a non-marketplace reason', async () => {
    const portalEdge: InterlinkEdge = {
      sourceSlug: 'seo-us-schools-f1-checklist',
      targetUrl: `${PORTAL}/pricing`,
      targetHost: 'portal',
      anchorText: 'Pricing and plans',
      reason: 'journey_prev',
      score: 0.9,
    }

    const result = await persistInterlinkPlan([portalEdge])

    expect(result).toEqual({ stored: 1 })
    expect(createSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})

describe('E) generator/helper contract stays canonical', () => {
  it('generateInterlinkPlan emits exactly the canonical market-host category CTA', () => {
    const plan = generateInterlinkPlan({
      sourceSlug: 'seo-us-schools-plan',
      stage: 'schools',
      country: 'US',
      contentType: 'blog_post',
    })
    const cta = plan.find((edge) => edge.reason === 'marketplace_cta')
    expect(cta).toBeDefined()
    expect(cta!.targetUrl).toBe(`${MARKET}/categories/study-permits`)
    expect(cta!.targetHost).toBe('market')
  })

  it('marketplaceCategoryHref keeps the existing canonical fallback for unknown service ids', () => {
    expect(marketplaceCategoryHref('study-permits')).toBe(`${MARKET}/categories/study-permits`)
    expect(marketplaceCategoryHref('not-a-real-service')).toBe(`${MARKET}/categories/immigration`)
  })

  it('a full generated plan passes the guard and persists in one upsert', async () => {
    const plan = generateInterlinkPlan({
      sourceSlug: 'seo-us-schools-plan',
      stage: 'schools',
      country: 'US',
      contentType: 'blog_post',
    })
    const result = await persistInterlinkPlan(plan)

    expect(result).toEqual({ stored: plan.length })
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('findNoncanonicalMarketplaceCta flags only marketplace_cta edges', () => {
    expect(findNoncanonicalMarketplaceCta([marketplaceEdge()])).toBeNull()
    expect(
      findNoncanonicalMarketplaceCta([marketplaceEdge({ targetUrl: `${PORTAL}/pricing` })]),
    ).toBeTruthy()
    expect(
      findNoncanonicalMarketplaceCta([
        marketplaceEdge({ reason: 'cluster_related', targetUrl: `${PORTAL}/pricing` }),
      ]),
    ).toBeNull()
  })
})
