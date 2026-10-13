import {
  canEditProviderGig,
  normalizeGigPricingScope,
  normalizeTierScope,
  stripInternalGigPricing,
} from '@/lib/yqaaGigScope'
import { GET, PATCH } from '@/app/api/gigs/[id]/route'

const mockRequirePortalUser = jest.fn()
const mockGetOptionalPortalUser = jest.fn()
const mockCreateSupabaseAdminClient = jest.fn()

jest.mock('@/lib/portalAuth', () => ({
  requirePortalUser: (...args: unknown[]) => mockRequirePortalUser(...args),
  getOptionalPortalUser: (...args: unknown[]) => mockGetOptionalPortalUser(...args),
}))
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: (...args: unknown[]) => mockCreateSupabaseAdminClient(...args),
}))

function gigDb(gig: Record<string, unknown>) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(async () => ({ data: gig, error: null })),
    update: jest.fn(() => chain),
  }
  return { db: { from: jest.fn(() => chain) }, update: chain.update }
}

describe('YQAA gig scope editor validation', () => {
  it('accepts explicit inheritance and the existing unit pricing shape', () => {
    expect(normalizeGigPricingScope({ unit_pricing: null, hourly_rate_cents: null })).toEqual({
      ok: true,
      values: { unit_pricing: null, hourly_rate_cents: null },
    })
    expect(normalizeGigPricingScope({
      unit_pricing: { unit: 'page', unit_price_cents: 800, included_units: 2, min_units: 1, base_cents: 1500 },
      hourly_rate_cents: 22000,
    })).toEqual({
      ok: true,
      values: {
        unit_pricing: { unit: 'page', unit_price_cents: 800, included_units: 2, min_units: 1, base_cents: 1500 },
        hourly_rate_cents: 22000,
      },
    })
  })

  it('rejects malformed, negative, fractional, and unknown unit pricing values', () => {
    for (const unit_pricing of [
      {},
      { unit: 'mile', unit_price_cents: 800 },
      { unit: 'page', unit_price_cents: 0 },
      { unit: 'page', unit_price_cents: 800, included_units: -1 },
      { unit: 'page', unit_price_cents: 800, min_units: 1.5 },
      { unit: 'page', unit_price_cents: 800, internal_rate: 1 },
    ]) expect(normalizeGigPricingScope({ unit_pricing })).toMatchObject({ ok: false })
    expect(normalizeGigPricingScope({ hourly_rate_cents: 0 })).toMatchObject({ ok: false })
    expect(normalizeGigPricingScope({ hourly_rate_cents: 22000.5 })).toMatchObject({ ok: false })
  })

  it('validates nullable scope depth and positive whole units', () => {
    expect(normalizeTierScope({ scope_depth: null, scope_units: null })).toEqual({
      ok: true,
      values: { scope_depth: null, scope_units: null },
    })
    expect(normalizeTierScope({ scope_depth: 'full', scope_units: 20 })).toEqual({
      ok: true,
      values: { scope_depth: 'full', scope_units: 20 },
    })
    for (const patch of [
      { scope_depth: 'unknown' },
      { scope_units: 0 },
      { scope_units: -1 },
      { scope_units: 1.25 },
      { hourly_rate_cents: 22000 },
    ]) expect(normalizeTierScope(patch)).toMatchObject({ ok: false })
  })

  it('allows only the matching provider identity and role/type, with the existing admin exception', () => {
    const gig = { provider_id: 'provider-a', provider_type: 'consultant' }
    expect(canEditProviderGig({ profileId: 'provider-a', role: 'consultant' }, gig)).toBe(true)
    expect(canEditProviderGig({ profileId: 'provider-b', role: 'consultant' }, gig)).toBe(false)
    expect(canEditProviderGig({ profileId: 'provider-a', role: 'attorney' }, gig)).toBe(false)
    expect(canEditProviderGig({ profileId: 'admin-1', role: 'admin' }, gig)).toBe(true)
  })

  it('strips the internal hourly rate from client-facing gig payloads', () => {
    const safeGig = stripInternalGigPricing({ id: 'gig-a', hourly_rate_cents: 22000, title: 'Public gig' })
    expect(safeGig).toEqual({ id: 'gig-a', title: 'Public gig' })
    expect('hourly_rate_cents' in safeGig).toBe(false)
  })

  it('returns the internal rate only to the owning provider and rejects invalid API payloads before writes', async () => {
    const gig = {
      id: 'gig-a', provider_id: 'provider-a', provider_type: 'consultant', status: 'active',
      title: 'Public service', gallery_images: [], hourly_rate_cents: 22000,
    }
    const publicDb = gigDb(gig)
    mockGetOptionalPortalUser.mockResolvedValueOnce(null)
    mockCreateSupabaseAdminClient.mockReturnValueOnce(publicDb.db)
    const publicResponse = await GET(new Request('https://example.invalid/api/gigs/gig-a'), { params: Promise.resolve({ id: 'gig-a' }) })
    const publicPayload = await publicResponse.json()
    expect(publicPayload.data.gig.hourly_rate_cents).toBeUndefined()

    const ownerDb = gigDb(gig)
    mockGetOptionalPortalUser.mockResolvedValueOnce({ profileId: 'provider-a', role: 'consultant', db: ownerDb.db })
    const ownerResponse = await GET(new Request('https://example.invalid/api/gigs/gig-a'), { params: Promise.resolve({ id: 'gig-a' }) })
    expect((await ownerResponse.json()).data.gig.hourly_rate_cents).toBe(22000)

    const patchDb = gigDb(gig)
    mockRequirePortalUser.mockResolvedValueOnce({ profileId: 'provider-a', role: 'consultant', db: patchDb.db })
    const patchResponse = await PATCH(new Request('https://example.invalid/api/gigs/gig-a', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unit_pricing: { unit: 'mile', unit_price_cents: 800 } }),
    }), { params: Promise.resolve({ id: 'gig-a' }) })
    expect(patchResponse.status).toBe(422)
    expect(patchDb.update).not.toHaveBeenCalled()
  })
})
