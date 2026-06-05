/**
 * seo-utils.test.ts
 *
 * Unit tests for the SEO scoring + keyword utilities. The scoring layer
 * now delegates to lib/seoAudit.ts (the holistic, 10-factor audit), so
 * these tests assert the COMPATIBILITY-WRAPPER semantics — the legacy
 * SEOScoreResult { score, checks } shape continues to be safe to call
 * with the same SEOData input and returns a non-throwing result that's
 * a usable proxy for the holistic audit. The richer surface (cluster
 * coverage, intent diversity, schema readiness, GSC) is tested via the
 * audit module directly in seo-audit.test.ts.
 */

import {
  computeSEOScore,
  getKeywordsForCategory,
  countKeywordDensity,
} from '@/lib/seoUtils'

// ────────────────────────────────────────────────────────────
// getKeywordsForCategory
// ────────────────────────────────────────────────────────────

describe('getKeywordsForCategory', () => {
  it('returns general keywords for an empty category', () => {
    const kw = getKeywordsForCategory('')
    expect(kw).toContain('professional service')
    expect(kw).toHaveLength(5)
  })

  it('returns general keywords for an unknown category', () => {
    const kw = getKeywordsForCategory('something-unknown-123')
    expect(kw).toContain('professional service')
  })

  it('returns immigration keywords for immigration category', () => {
    const kw = getKeywordsForCategory('immigration')
    expect(kw).toContain('immigration lawyer')
    expect(kw).toContain('immigration help')
  })

  it('returns legal keywords for "legal-consultation"', () => {
    const kw = getKeywordsForCategory('legal-consultation')
    expect(kw).toContain('legal advice')
    expect(kw).toContain('lawyer consultation')
  })

  it('is case-insensitive', () => {
    const kw = getKeywordsForCategory('IMMIGRATION')
    expect(kw).toContain('immigration lawyer')
  })

  it('matches partial patterns', () => {
    const kw = getKeywordsForCategory('legal-consultation')
    expect(kw.length).toBeGreaterThanOrEqual(4)
  })
})

// ────────────────────────────────────────────────────────────
// countKeywordDensity
// ────────────────────────────────────────────────────────────

describe('countKeywordDensity', () => {
  it('returns 0 for text with no matching keywords', () => {
    const count = countKeywordDensity('hello world', ['foo', 'bar'])
    expect(count).toBe(0)
  })

  it('counts matching keywords in text', () => {
    const count = countKeywordDensity(
      'We provide expert legal advice and visa assistance for immigration to Canada',
      ['visa', 'immigration', 'legal advice', 'university']
    )
    expect(count).toBe(3) // 'visa', 'immigration', 'legal advice'
  })

  it('is case-insensitive', () => {
    const count = countKeywordDensity('VISA APPLICATION FOR USA', ['visa', 'application'])
    expect(count).toBe(2)
  })

  it('counts a keyword only once even if mentioned multiple times', () => {
    const count = countKeywordDensity('visa visa visa', ['visa', 'immigration'])
    expect(count).toBe(1)
  })

  it('handles empty text gracefully', () => {
    const count = countKeywordDensity('', ['visa', 'immigration'])
    expect(count).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────
// computeSEOScore — compatibility wrapper semantics
// ────────────────────────────────────────────────────────────

describe('computeSEOScore (compatibility wrapper)', () => {
  const validData = {
    title: 'Expert Canadian Study Permit Application Assistance',
    pitch: 'We help international students navigate the Canadian study permit application process with expert document review and filing support.',
    description: 'A'.repeat(350),
    tags: ['visa', 'study', 'immigration'],
    seo_title: 'Canadian Study Permit Help | YouSafe',
    seo_description: 'Get expert assistance with your Canadian study permit application. Professional document review and filing support for international students.',
    category: 'immigration',
    jurisdiction: 'ca',
  }

  it('returns a score between 0 and 100', () => {
    const result = computeSEOScore(validData)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('returns a non-empty list of section-level checks', () => {
    const result = computeSEOScore(validData)
    expect(result.checks.length).toBeGreaterThan(0)
    // Each check carries a label + weight + passed + hint.
    result.checks.forEach((c) => {
      expect(typeof c.label).toBe('string')
      expect(typeof c.weight).toBe('number')
      expect(typeof c.passed).toBe('boolean')
      expect(typeof c.hint).toBe('string')
    })
  })

  it('handles empty data without throwing and reports a low score', () => {
    const result = computeSEOScore({
      title: '', pitch: '', description: '', tags: [],
      seo_title: '', seo_description: '', category: '', jurisdiction: '',
    })
    expect(result.score).toBeDefined()
    // With nothing filled, the audit's section-by-section weights drag the
    // result well under 30 even with the renormalization wrapping.
    expect(result.score).toBeLessThan(30)
  })

  it('section weights renormalize to ~100', () => {
    const result = computeSEOScore(validData)
    const totalWeight = result.checks.reduce((sum, c) => sum + c.weight, 0)
    // Floor + rounding can introduce +/- 2 drift; assert the contract is
    // "weights sum to about 100" not the exact integer.
    expect(totalWeight).toBeGreaterThanOrEqual(95)
    expect(totalWeight).toBeLessThanOrEqual(105)
  })

  it('emits a hint string for every check', () => {
    const result = computeSEOScore(validData)
    result.checks.forEach((c) => {
      expect(typeof c.hint).toBe('string')
    })
  })

  it('a fully empty gig surfaces the snippet-engineering finding as failed', () => {
    const result = computeSEOScore({
      title: '', pitch: '', description: '', tags: [],
      seo_title: '', seo_description: '', category: '', jurisdiction: '',
    })
    const snippet = result.checks.find((c) => c.label.toLowerCase().includes('snippet'))
    expect(snippet?.passed).toBe(false)
  })

  it('a well-formed snippet passes the snippet-engineering check', () => {
    const data = {
      ...validData,
      seo_title: 'Canadian Study Permit Help — YouSafe',
      seo_description: 'Get expert assistance with your Canadian study permit application. Professional document review and filing support for international students.',
      description: 'A'.repeat(400),
    }
    const result = computeSEOScore(data, { role: 'attorney' })
    const snippet = result.checks.find((c) => c.label.toLowerCase().includes('snippet'))
    // Snippet readiness >= 70 → passed in the compatibility wrapper.
    expect(snippet?.passed).toBe(true)
  })
})
