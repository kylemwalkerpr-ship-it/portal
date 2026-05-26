/**
 * responsive-image.test.ts
 *
 * Unit tests for the responsive image utilities in lib/responsiveImage.ts.
 * Pure function testing — no mocking required. Tests cover Supabase storage
 * URLs, non-Supabase URLs, edge cases like empty strings, and the priority
 * flag for LCP optimization.
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
const NON_SUPABASE_URL = 'https://example.com/images/photo.jpg'
const CDN_URL = 'https://cdn.example.com/gig-gallery/abc-123/image.webp'

// ────────────────────────────────────────────────────────────
// responsiveUrl
// ────────────────────────────────────────────────────────────

describe('responsiveUrl', () => {
  describe('Supabase storage URLs', () => {
    it('adds width query param', () => {
      const result = responsiveUrl(SUPABASE_URL, 600)
      const url = new URL(result)
      expect(url.searchParams.get('width')).toBe('600')
    })

    it('sets resize to cover', () => {
      const result = responsiveUrl(SUPABASE_URL, 600)
      const url = new URL(result)
      expect(url.searchParams.get('resize')).toBe('cover')
    })

    it('removes any existing height param', () => {
      const urlWithHeight = SUPABASE_URL + '?height=400&width=800'
      const result = responsiveUrl(urlWithHeight, 600)
      const parsed = new URL(result)
      expect(parsed.searchParams.get('height')).toBeNull()
      expect(parsed.searchParams.get('width')).toBe('600')
    })

    it('sets format=webp when format is webp', () => {
      const result = responsiveUrl(SUPABASE_URL, 768, 'webp')
      const url = new URL(result)
      expect(url.searchParams.get('format')).toBe('webp')
    })

    it('does not set format when omitted', () => {
      const result = responsiveUrl(SUPABASE_URL, 768)
      const url = new URL(result)
      expect(url.searchParams.has('format')).toBe(false)
    })

    it('does not set format when format is origin', () => {
      const result = responsiveUrl(SUPABASE_URL, 768, 'origin')
      const url = new URL(result)
      expect(url.searchParams.has('format')).toBe(false)
    })

    it('works with authenticated bucket URLs', () => {
      const authUrl = SUPABASE_URL.replace('/public/', '/authenticated/')
      const result = responsiveUrl(authUrl, 600)
      const url = new URL(result)
      expect(url.searchParams.get('width')).toBe('600')
    })

    it('preserves other existing query params', () => {
      const urlWithParam = SUPABASE_URL + '?cache=123'
      const result = responsiveUrl(urlWithParam, 480)
      const parsed = new URL(result)
      expect(parsed.searchParams.get('cache')).toBe('123')
      expect(parsed.searchParams.get('width')).toBe('480')
    })
  })

  describe('non-Supabase URLs', () => {
    it('returns the URL unchanged for example.com URLs', () => {
      const result = responsiveUrl(NON_SUPABASE_URL, 600)
      expect(result).toBe(NON_SUPABASE_URL)
    })

    it('returns the URL unchanged for CDN URLs', () => {
      const result = responsiveUrl(CDN_URL, 600)
      expect(result).toBe(CDN_URL)
    })

    it('returns the URL unchanged regardless of width parameter', () => {
      const result = responsiveUrl(NON_SUPABASE_URL, 1024)
      expect(result).toBe(NON_SUPABASE_URL)
    })
  })

  describe('edge cases', () => {
    it('returns empty string when given an empty string', () => {
      const result = responsiveUrl('', 600)
      expect(result).toBe('')
    })

    it('returns URL unchanged for malformed URLs', () => {
      const malformed = 'not-a-valid-url'
      const result = responsiveUrl(malformed, 600)
      expect(result).toBe(malformed)
    })

    it('handles different width values correctly', () => {
      const widths = [320, 480, 768, 1024, 1280, 1920, 2560]
      widths.forEach((w) => {
        const result = responsiveUrl(SUPABASE_URL, w)
        expect(new URL(result).searchParams.get('width')).toBe(String(w))
      })
    })

    it('handles URL with special characters in the path', () => {
      const specialUrl =
        'https://storage.supabase.co/storage/v1/object/public/gig-gallery/seller-1/resized/uuid-image%402x-card.jpg'
      const result = responsiveUrl(specialUrl, 600)
      const parsed = new URL(result)
      expect(parsed.searchParams.get('width')).toBe('600')
      // Path should remain URL-encoded
      expect(parsed.pathname).toContain('%40')
    })
  })
})

// ────────────────────────────────────────────────────────────
// generateSrcSet
// ────────────────────────────────────────────────────────────

describe('generateSrcSet', () => {
  describe('Supabase storage URLs', () => {
    it('generates srcSet with 4 width descriptors', () => {
      const srcSet = generateSrcSet(SUPABASE_URL)
      const entries = srcSet.split(', ')
      expect(entries).toHaveLength(4)
    })

    it('includes widths 480, 768, 1024, 1280', () => {
      const srcSet = generateSrcSet(SUPABASE_URL)
      const entries = srcSet.split(', ').map(e => e.split(' ')[1])
      expect(entries).toEqual(['480w', '768w', '1024w', '1280w'])
    })

    it('uses webp format for all srcSet entries', () => {
      const srcSet = generateSrcSet(SUPABASE_URL)
      const entries = srcSet.split(', ')
      entries.forEach((entry) => {
        expect(entry).toContain('format=webp')
      })
    })

    it('each entry has correct width in URL', () => {
      const srcSet = generateSrcSet(SUPABASE_URL)
      const entries = srcSet.split(', ')
      const expectedWidths = [480, 768, 1024, 1280]
      entries.forEach((entry, i) => {
        const urlPart = entry.split(' ')[0]
        expect(urlPart).toContain(`width=${expectedWidths[i]}`)
      })
    })

    it('entries are comma-space separated', () => {
      const srcSet = generateSrcSet(SUPABASE_URL)
      // The pattern is: "url 480w, url 768w, url 1024w, url 1280w"
      const pattern = /^(?:https?:\/\/\S+? \d+w(?:, |$)){4}$/
      expect(srcSet).toMatch(pattern)
    })
  })

  describe('non-Supabase URLs', () => {
    it('returns empty string for example.com URLs', () => {
      const result = generateSrcSet(NON_SUPABASE_URL)
      expect(result).toBe('')
    })

    it('returns empty string for CDN URLs', () => {
      const result = generateSrcSet(CDN_URL)
      expect(result).toBe('')
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty URL', () => {
      const result = generateSrcSet('')
      expect(result).toBe('')
    })

    it('returns empty string for malformed URL', () => {
      const result = generateSrcSet('not-a-url')
      expect(result).toBe('')
    })
  })
})

// ────────────────────────────────────────────────────────────
// responsiveImageProps
// ────────────────────────────────────────────────────────────

describe('responsiveImageProps', () => {
  describe('returned object shape', () => {
    it('returns an object with src, srcSet, sizes, loading, fetchpriority, alt', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'My Image')
      expect(props).toHaveProperty('src')
      expect(props).toHaveProperty('srcSet')
      expect(props).toHaveProperty('sizes')
      expect(props).toHaveProperty('loading')
      expect(props).toHaveProperty('fetchpriority')
      expect(props).toHaveProperty('alt')
    })
  })

  describe('lazy loading (default)', () => {
    it('uses lazy loading when priority is not set', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.loading).toBe('lazy')
    })

    it('uses lazy loading when priority is false', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test', false)
      expect(props.loading).toBe('lazy')
    })

    it('sets fetchpriority to undefined when priority is not set', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.fetchpriority).toBeUndefined()
    })
  })

  describe('eager loading (priority)', () => {
    it('uses eager loading when priority is true', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Hero', true)
      expect(props.loading).toBe('eager')
    })

    it('sets fetchpriority to high when priority is true', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Hero', true)
      expect(props.fetchpriority).toBe('high')
    })
  })

  describe('src and srcSet delegation', () => {
    it('delegates src to responsiveUrl with width 600', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.src).toContain('width=600')
      expect(props.src).toContain('resize=cover')
    })

    it('delegates srcSet to generateSrcSet', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.srcSet).toContain('480w')
      expect(props.srcSet).toContain('1280w')
    })

    it('generates empty srcSet for non-Supabase URLs', () => {
      const props = responsiveImageProps(NON_SUPABASE_URL, 'External')
      expect(props.srcSet).toBe('')
      // src should be the original URL unchanged
      expect(props.src).toBe(NON_SUPABASE_URL)
    })

    it('uses the original URL for non-Supabase src', () => {
      const props = responsiveImageProps(NON_SUPABASE_URL, 'External')
      expect(props.src).toBe(NON_SUPABASE_URL)
    })
  })

  describe('sizes and alt', () => {
    it('provides default sizes attribute', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'Test')
      expect(props.sizes).toContain('100vw')
      expect(props.sizes).toContain('33vw')
    })

    it('sets alt from title parameter', () => {
      const props = responsiveImageProps(SUPABASE_URL, 'My Gig Image')
      expect(props.alt).toBe('My Gig Image')
    })

    it('sets alt to empty string when no title is provided', () => {
      const props = responsiveImageProps(SUPABASE_URL)
      expect(props.alt).toBe('')
    })

    it('sets alt to empty string for undefined title', () => {
      const props = responsiveImageProps(SUPABASE_URL, undefined)
      expect(props.alt).toBe('')
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
