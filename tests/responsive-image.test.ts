/**
 * responsive-image.test.ts
 *
 * Unit tests for lib/responsiveImage.ts after same-origin CF delivery.
 *
 * Supabase Storage transforms stay disabled. Public gig/headshot objects are
 * rewritten to `/api/marketplace/media/...` (and `/cdn-cgi/image/...` in
 * production). Tests run with NODE_ENV=test so CF wrapping is off — assertions
 * target the proxy path.
 */

import {
  responsiveUrl,
  generateSrcSet,
  responsiveImageProps,
} from '@/lib/responsiveImage'

const PROJECT = 'https://krggzrxxnqfsbbklatxl.supabase.co'
const SUPABASE_URL = `${PROJECT}/storage/v1/object/public/gig-gallery/seller-123/my-image.jpg`
const SUPABASE_AUTH_URL = `${PROJECT}/storage/v1/object/authenticated/gig-gallery/seller-123/my-image.jpg`
const SUPABASE_URL_WITH_PARAMS = `${SUPABASE_URL}?cache=123`
const NON_SUPABASE_URL = 'https://example.com/images/photo.jpg'
const CDN_URL = 'https://cdn.example.com/gig-gallery/abc-123/image.webp'
const PROXY = '/api/marketplace/media/gig-gallery/seller-123/my-image.jpg'

describe('responsiveUrl', () => {
  describe('Supabase public storage object URLs', () => {
    it('rewrites to the same-origin media proxy (no CF wrap in test)', () => {
      expect(responsiveUrl(SUPABASE_URL, 600)).toBe(PROXY)
    })

    it('does not fabricate Supabase width/resize/format query params', () => {
      const result = responsiveUrl(SUPABASE_URL, 768, 'webp')
      expect(result).not.toContain('resize=')
      expect(result.startsWith('/api/marketplace/media/')).toBe(true)
    })

    it('leaves authenticated object URLs unchanged', () => {
      expect(responsiveUrl(SUPABASE_AUTH_URL, 600)).toBe(SUPABASE_AUTH_URL)
    })

    it('strips original query params when proxying (object path only)', () => {
      expect(responsiveUrl(SUPABASE_URL_WITH_PARAMS, 480)).toBe(PROXY)
    })
  })

  describe('non-Supabase URLs', () => {
    it('returns example.com URLs unchanged', () => {
      expect(responsiveUrl(NON_SUPABASE_URL, 600)).toBe(NON_SUPABASE_URL)
    })

    it('returns CDN URLs unchanged', () => {
      expect(responsiveUrl(CDN_URL, 600)).toBe(CDN_URL)
    })
  })

  describe('edge cases', () => {
    it('returns empty string when given an empty string', () => {
      expect(responsiveUrl('', 600)).toBe('')
    })

    it('returns malformed URLs unchanged', () => {
      expect(responsiveUrl('not-a-valid-url', 600)).toBe('not-a-valid-url')
    })
  })
})

describe('generateSrcSet', () => {
  it('emits real width descriptors for proxyable Supabase public objects', () => {
    const srcSet = generateSrcSet(SUPABASE_URL)
    expect(srcSet).toContain(`${PROXY} 320w`)
    expect(srcSet).toContain(`${PROXY} 960w`)
  })

  it('returns empty for authenticated object URLs', () => {
    expect(generateSrcSet(SUPABASE_AUTH_URL)).toBe('')
  })

  it('returns empty for external URLs', () => {
    expect(generateSrcSet(NON_SUPABASE_URL)).toBe('')
    expect(generateSrcSet(CDN_URL)).toBe('')
  })

  it('returns empty for empty/malformed URLs', () => {
    expect(generateSrcSet('')).toBe('')
    expect(generateSrcSet('not-a-url')).toBe('')
  })
})

describe('responsiveImageProps', () => {
  it('uses the proxied URL as src', () => {
    const props = responsiveImageProps(SUPABASE_URL, 'Test')
    expect(props.src).toBe(PROXY)
    expect(props.srcSet).toContain('480w')
    expect(props.decoding).toBe('async')
  })

  it('does not emit a srcSet for external URLs', () => {
    const props = responsiveImageProps(NON_SUPABASE_URL, 'External')
    expect(props.srcSet).toBe('')
    expect(props.src).toBe(NON_SUPABASE_URL)
  })

  it('uses lazy loading by default', () => {
    expect(responsiveImageProps(SUPABASE_URL, 'Test').loading).toBe('lazy')
    expect(responsiveImageProps(SUPABASE_URL, 'Test').fetchpriority).toBeUndefined()
  })

  it('uses eager + high fetchpriority when priority is true', () => {
    const props = responsiveImageProps(SUPABASE_URL, 'Hero', true)
    expect(props.loading).toBe('eager')
    expect(props.fetchpriority).toBe('high')
  })

  it('sets alt from title', () => {
    expect(responsiveImageProps(SUPABASE_URL, 'My Gig Image').alt).toBe('My Gig Image')
    expect(responsiveImageProps(SUPABASE_URL).alt).toBe('')
  })
})
