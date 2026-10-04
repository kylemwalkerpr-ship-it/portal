/**
 * Sanitization Phase 10 — malformed ids on public review/rating reads are a
 * client error (400), never a server fault (500), and are rejected before any
 * database client is created.
 */
const createSupabaseAdminClient = jest.fn(() => {
  throw new Error('database must not be touched for malformed ids')
})

jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient }))
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn(async () => ({ userId: null })) }))
jest.mock('@/lib/portalAuth', () => ({ requirePortalUser: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getClerkUserId: jest.fn(async () => null) }))

import { GET as getAttorneyRatings } from '@/app/api/attorneys/[id]/ratings/route'
import { GET as getReviews } from '@/app/api/reviews/route'
import { GET as getGigReviews } from '@/app/api/gig-reviews/route'

const BAD = ["not-a-uuid", "'", '1 OR 1=1', '00000000-0000-0000-0000-00000000000Z']

describe('Sanitization P10: malformed ids return 400', () => {
  beforeEach(() => createSupabaseAdminClient.mockClear())

  it.each(BAD)('attorney ratings rejects %p', async (id) => {
    const res = await getAttorneyRatings(new Request('https://portal.test/api/attorneys/x/ratings'), {
      params: Promise.resolve({ id }),
    })
    expect(res.status).toBe(400)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each(BAD)('reviews rejects gig_id=%p', async (id) => {
    const res = await getReviews(new Request(`https://portal.test/api/reviews?gig_id=${encodeURIComponent(id)}`))
    expect(res.status).toBe(400)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each(BAD)('reviews rejects seller_id=%p', async (id) => {
    const res = await getReviews(new Request(`https://portal.test/api/reviews?seller_id=${encodeURIComponent(id)}`))
    expect(res.status).toBe(400)
  })

  it.each(BAD)('gig-reviews rejects gig_id=%p', async (id) => {
    const res = await getGigReviews(new Request(`https://portal.test/api/gig-reviews?gig_id=${encodeURIComponent(id)}`))
    expect(res.status).toBe(400)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each(BAD)('gig-reviews rejects provider_id=%p', async (id) => {
    const res = await getGigReviews(new Request(`https://portal.test/api/gig-reviews?provider_id=${encodeURIComponent(id)}`))
    expect(res.status).toBe(400)
  })

  it('a well-formed id passes validation and reaches the data layer', async () => {
    const res = await getGigReviews(
      new Request('https://portal.test/api/gig-reviews?gig_id=8098a9ac-c6d4-4860-a3ab-adc0db42e10a'),
    )
    // The stubbed client throws, so the handler reaches its generic 500 path.
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
  })
})
