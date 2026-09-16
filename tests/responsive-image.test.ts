/**
 * responsive-image.test.ts
 *
 * Unit tests for the responsive image utilities in lib/responsiveImage.ts.
 *
 * Contract (post image-delivery optimization): Supabase Storage image
 * transforms are NOT enabled on this project. The `/storage/v1/render/image/...`
 * endpoint returns 403 FeatureNotEnabled, and ordinary object URLs ignore
 * `?width=&resize=&format=` query params — the origin returns the same bytes.
 * Therefore these utilities must render stored objects truthfully: no
 * fabricated width params, no fake srcSet descriptors. Uploads are optimized
 * client-side before storage instead (lib/marketplaceImageOptimization.ts).
 */

import {
  responsiveUrl,
  generateSrcSet,
  responsiveImageProps,
} from '@/lib/responsiveImage'

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const SUPABASE_URL =
  'https://storage.supabase.co/storage/v1/object/public/gig-gallery/seller-123/my-image.jpg'
const SUPABASE_AUTH_URL =
  'https://storage.supabase.co/storage/v1/object/authenticated/gig-gallery/seller-123/my-image.jpg'
const SUPABASE_URL_WITH_PARAMS = SUPABASE_URL + '?cache=123'
const NON_SUPABASE_URL = 'https://example.com/images/photo.jpg'
const CDN_URL = 'https://cdn.example.com/gig-gallery/abc-123/image.webp'

// ────────────────────────────────────────────────────────────
// responsiveUrl
// ────────────────────────────────────────────────────────────

describe('responsiveUrl', () => {
  describe('Supabase storage object URLs', () => {
    it('returns an ordinary public object URL completely unchanged', () => {
      const result = responsiveUrl(SUPABASE_URL, 600)
      expect(result).toBe(SUPABASE_URL)
    })

    it('does not fabricate a width query param', () => {
      const result = responsiveUrl(SUPABASE_URL, 600)
      expect(result).not.toContain('width=')
      expect(new URL(result).searchParams.has('width')).toBe(false)
    })

    it('does not fabricate resize or format query params', () => {
      const result = responsiveUrl(SUPABASE_URL, 768, 'webp')
      const parsed = new URL(result)
      expect(parsed.searchParams.has('resize')).toBe(false)
      expect(parsed.searchParams.has('format')).toBe(false)
    })

    it('returns an authenticated object URL completely unchanged', () => {
      const result = responsiveUrl(SUPABASE_AUTH_URL, 600)
      expect(result).toBe(SUPABASE_AUTH_URL)
    })

    it('preserves the original URL exactly, including existing query params', () => {
      const result = responsiveUrl(SUPABASE_URL_WITH_PARAMS, 480)
      expect(result).toBe(SUPABASE_URL_WITH_PARAMS)
    })

    it('returns the same URL regardless of requested width', () => {
      const widths = [320, 480, 768, 1024, 1280, 1920, 2560]
      widths.forEach((w) => {
        expect(responsiveUrl(SUPABASE_URL, w)).toBe(SUPABASE_URL)
      })
    })
  })

  describe('non-Supabase URLs', () => {
    it('returns the URL unchanged for example.com URLs', () => {
      expect(responsiveUrl(NON_SUPABASE_URL, 600)).toBe(NON_SUPABASE_URL)
    })

    it('returns the URL unchanged for CDN URLs', () => {
      expect(responsiveUrl(CDN_URL, 600)).toBe(CDN_URL)
    })
  })

  describe('edge cases', () => {
    it('returns empty string when given an empty string', () => {
      expect(responsiveUrl('', 600)).toBe('')
    })

    it('returns URL unchanged for malformed URLs', () => {
      const malformed = 'not-a-valid-url'
      expect(responsiveUrl(malformed, 600)).toBe(malformed)
    })

    it('handles URL with special characters in the path unchanged', () => {
      const specialUrl =
        'https://storage.supabase.co/storage/v1/object/public/gig-gallery/seller-1/resized/uuid-image%402x-card.jpg'
      expect(responsiveUrl(specialUrl, 600)).toBe(specialUrl)
    })
  })
})

// ────────────────────────────────────────────────────────────
// generateSrcSet
// ────────────────────────────────────────────────────────────

describe('generateSrcSet', () => {
  it('returns an empty string for ordinary Supabase object URLs (no fake variants)', () => {
    expect(generateSrcSet(SUPABASE_URL)).toBe('')
  })

  it('never emits a width descriptor for Supabase object URLs', () => {
    const srcSet = generateSrcSet(SUPABASE_URL)
    expect(srcSet).not.toContain('w')
    expect(srcSet).not.toContain('width=')
  })

  it('returns an empty string for authenticated object URLs', () => {
    expect(generateSrcSet(SUPABASE_AUTH_URL)).toBe('')
  })

  it('returns an empty string for example.com URLs', () => {
    expect(generateSrcSet(NON_SUPABASE_URL)).toBe('')
  })

  it('returns an empty string for CDN URLs', () => {
    expect(generateSrcSet(CDN_URL)).toBe('')
  })

  it('returns an empty string for empty URL', () => {
    expect(generateSrcSet('')).toBe('')
  })

  it('returns an empty string for malformed URL', () => {
    expect(generateSrcSet('not-a-url')).toBe('')
  })
})

// ────────────────────────────────────────────────────────────
// responsiveImageProps
// ────────────────────────────────────────────────────────────

describe('responsiveImageProps', () => {
  describe('truthful src / srcSet', () => {
    it('uses the original URL as src — no width param fabrication', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.src).toBe(SUPABASE_URL)
      expect(props.src).not.toContain('width=')
      expect(props.src).not.toContain('resize=')
    })

    it('does not emit a srcSet for ordinary storage object URLs', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.srcSet).toBe('')
    })

    it('does not emit a srcSet for external URLs', () => {
      const props = responsiveImageProps(NON_SUPABASE_URL, 'External')
      expect(props.srcSet).toBe('')
      expect(props.src).toBe(NON_SUPABASE_URL)
    })
  })

  describe('lazy loading (default)', () => {
    it('uses lazy loading when priority is not set', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'Test').loading).toBe('lazy')
    })

    it('uses lazy loading when priority is false', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'Test', false).loading).toBe('lazy')
    })

    it('sets fetchpriority to undefined when priority is not set', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'Test').fetchpriority).toBeUndefined()
    })
  })

  describe('eager loading (priority)', () => {
    it('uses eager loading when priority is true', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'Hero', true).loading).toBe('eager')
    })

    it('sets fetchpriority to high when priority is true', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'Hero', true).fetchpriority).toBe('high')
    })
  })

  describe('alt behavior', () => {
    it('sets alt from title parameter', () => {
      expect(responsiveImageProps(SUPABASE_URL, 'My Gig Image').alt).toBe('My Gig Image')
    })

    it('sets alt to empty string when no title is provided', () => {
      expect(responsiveImageProps(SUPABASE_URL).alt).toBe('')
    })

    it('sets alt to empty string for undefined title', () => {
      expect(responsiveImageProps(SUPABASE_URL, undefined).alt).toBe('')
    })
  })

  describe('edge cases', () => {
    it('handles empty URL gracefully', () => {
      const props = responsiveImageProps('', 'Empty')
      expect(props.src).toBe('')
      expect(props.srcSet).toBe('')
      expect(props.loading).toBe('lazy')
    })

    it('handles malformed URL gracefully', () => {
      const props = responsiveImageProps('bad-url', 'Bad')
      expect(props.src).toBe('bad-url')
      expect(props.srcSet).toBe('')
    })
  })
})
