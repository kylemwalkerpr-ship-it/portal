import {
  deliveryImageUrl,
  isPostgrestRangeNotSatisfiable,
  marketplaceMediaProxyPath,
  shouldUseCloudflareImageResize,
  supabasePublicObjectPath,
} from '@/lib/marketplaceDeliveryImage'
import { sizedImageUrl } from '@/lib/imageVariants'

const PROJECT = 'https://krggzrxxnqfsbbklatxl.supabase.co'
const COVER = `${PROJECT}/storage/v1/object/public/gig-gallery/a/b/cover.webp`
const HEAD = `${PROJECT}/storage/v1/object/public/attorney-headshots/a/head.jpg`
const AVATAR = `${PROJECT}/storage/v1/object/public/consultant-avatars/a/av.jpg`
const OTHER_BUCKET = `${PROJECT}/storage/v1/object/public/private-docs/a/x.pdf`

describe('marketplaceDeliveryImage', () => {
  it('parses allowlisted public object paths', () => {
    expect(supabasePublicObjectPath(COVER)).toBe('gig-gallery/a/b/cover.webp')
    expect(supabasePublicObjectPath(HEAD)).toBe('attorney-headshots/a/head.jpg')
    expect(supabasePublicObjectPath(AVATAR)).toBe('consultant-avatars/a/av.jpg')
    expect(supabasePublicObjectPath(OTHER_BUCKET)).toBeNull()
    expect(supabasePublicObjectPath(`${PROJECT}/storage/v1/object/authenticated/gig-gallery/a/b`)).toBeNull()
  })

  it('builds an encoded same-origin proxy path', () => {
    expect(marketplaceMediaProxyPath(COVER)).toBe(
      '/api/marketplace/media/gig-gallery/a/b/cover.webp',
    )
  })

  it('returns the proxy path in test (no CF wrap)', () => {
    expect(shouldUseCloudflareImageResize()).toBe(false)
    expect(deliveryImageUrl(COVER, { width: 420 })).toBe(
      '/api/marketplace/media/gig-gallery/a/b/cover.webp',
    )
  })

  it('leaves non-supabase URLs unchanged', () => {
    expect(deliveryImageUrl('https://example.com/x.jpg', { width: 100 })).toBe(
      'https://example.com/x.jpg',
    )
  })

  it('detects PostgREST range errors', () => {
    expect(isPostgrestRangeNotSatisfiable({ code: 'PGRST103', message: 'x' })).toBe(true)
    expect(
      isPostgrestRangeNotSatisfiable({ message: 'Requested range not satisfiable' }),
    ).toBe(true)
    expect(isPostgrestRangeNotSatisfiable({ message: 'other' })).toBe(false)
  })
})

describe('sizedImageUrl + supabase', () => {
  it('routes supabase covers through the media proxy', () => {
    expect(sizedImageUrl(COVER, 720)).toBe('/api/marketplace/media/gig-gallery/a/b/cover.webp')
  })

  it('still rewrites Payhip CDN URLs', () => {
    const payhip =
      'https://payhip.com/cdn-cgi/image/format=auto/https://pe56d.s3.amazonaws.com/o_1.jpg'
    const out = sizedImageUrl(payhip, 420)!
    expect(out).toContain('payhip.com/cdn-cgi/image/')
    expect(out).toContain('width=420')
  })
})
