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
      '/api/mm/gig-gallery/a/b/cover.webp',
    )
  })

  it('returns the proxy path in test (no CF wrap)', () => {
    expect(shouldUseCloudflareImageResize()).toBe(false)
    expect(deliveryImageUrl(COVER, { width: 420 })).toBe(
      '/api/mm/gig-gallery/a/b/cover.webp',
    )
  })

  it('leaves non-supabase URLs unchanged', () => {
    expect(deliveryImageUrl('https://example.com/x.jpg', { width: 100 })).toBe(
      'https://example.com/x.jpg',
    )
  })

  it('wraps with short CF options when resize is forced on', () => {
    const prev = process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE
    process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE = '1'
    try {
      expect(shouldUseCloudflareImageResize()).toBe(true)
      expect(deliveryImageUrl(COVER, { width: 720, quality: 70 })).toBe(
        '/cdn-cgi/image/w=720,q=70,f=auto/api/mm/gig-gallery/a/b/cover.webp',
      )
      // Short forms keep market-root HTML under the payload budget vs width=/quality=/format=.
      const wrapped = deliveryImageUrl(COVER, { width: 720 })!
      expect(wrapped).not.toContain('width=')
      expect(wrapped).not.toContain('quality=')
      expect(wrapped).not.toContain('format=')
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE
      else process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE = prev
    }
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
    expect(sizedImageUrl(COVER, 720)).toBe('/api/mm/gig-gallery/a/b/cover.webp')
  })

  it('still rewrites Payhip CDN URLs', () => {
    const payhip =
      'https://payhip.com/cdn-cgi/image/format=auto/https://pe56d.s3.amazonaws.com/o_1.jpg'
    const out = sizedImageUrl(payhip, 420)!
    expect(out).toContain('payhip.com/cdn-cgi/image/')
    expect(out).toContain('width=420')
  })
})
