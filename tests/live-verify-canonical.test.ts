import { extractCanonicalHref, canonicalHrefMatches } from '@/lib/seoFactory/liveVerify'

describe('liveVerify canonical helpers', () => {
  describe('extractCanonicalHref', () => {
    it('extracts href with rel before href', () => {
      const html = '<link rel="canonical" href="https://legal.yousafeconsultancy.com/us/h-1b-visa/" />'
      expect(extractCanonicalHref(html)).toBe('https://legal.yousafeconsultancy.com/us/h-1b-visa/')
    })

    it('extracts href with href before rel', () => {
      const html = '<link href="https://legal.yousafeconsultancy.com/us/h-1b-visa/" rel="canonical">'
      expect(extractCanonicalHref(html)).toBe('https://legal.yousafeconsultancy.com/us/h-1b-visa/')
    })

    it('returns null when no canonical tag is present', () => {
      expect(extractCanonicalHref('<html><head><title>x</title></head></html>')).toBeNull()
      expect(extractCanonicalHref('')).toBeNull()
    })

    it('ignores non-canonical link rel values', () => {
      const html = '<link rel="alternate" href="https://x/amp">'
      expect(extractCanonicalHref(html)).toBeNull()
    })
  })

  describe('canonicalHrefMatches', () => {
    const target = 'https://legal.yousafeconsultancy.com/us/h-1b-visa/'

    it('matches an identical canonical', () => {
      expect(canonicalHrefMatches(target, 'https://legal.yousafeconsultancy.com/us/h-1b-visa/')).toBe(true)
    })

    it('ignores trailing-slash differences', () => {
      expect(canonicalHrefMatches(target, 'https://legal.yousafeconsultancy.com/us/h-1b-visa')).toBe(true)
    })

    it('ignores host case and protocol casing', () => {
      expect(canonicalHrefMatches(target, 'HTTPS://LEGAL.YOUSAFECONSULTANCY.COM/us/h-1b-visa/')).toBe(true)
    })

    it('rejects a different path (the mismatch the warning is about)', () => {
      expect(canonicalHrefMatches(target, 'https://legal.yousafeconsultancy.com/us/different-page/')).toBe(false)
    })

    it('rejects a different host', () => {
      expect(canonicalHrefMatches(target, 'https://usa.yousafeconsultancy.com/us/h-1b-visa/')).toBe(false)
    })

    it('rejects a null/absent canonical (missing tag)', () => {
      expect(canonicalHrefMatches(target, null)).toBe(false)
      expect(canonicalHrefMatches(target, undefined as unknown as string)).toBe(false)
    })
  })
})
