/**
 * seo-utils.test.ts
 *
 * Unit tests for the SEO scoring and keyword utilities extracted from SEOPreviewPanel.
 * Pure function testing — no mocking required.
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
// computeSEOScore
// ────────────────────────────────────────────────────────────

describe('computeSEOScore', () => {
  const validData = {
    title: 'Expert Canadian Study Permit Application Assistance',
    pitch: 'We help international students navigate the Canadian study permit application process with expert document review and filing support.',
    description: 'A'.repeat(350),
    tags: ['visa', 'study', 'immigration'],
    seo_title: 'Canadian Study Permit Help | YouSafe',
    seo_description: 'Get expert assistance with your Canadian study permit application. Professional document review and filing support for international students.',
    category: 'immigration',
    jurisdiction: 'Canada',
  }

  it('returns a score between 0 and 100', () => {
    const result = computeSEOScore(validData)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('returns all 11 checks', () => {
    const result = computeSEOScore(validData)
    expect(result.checks).toHaveLength(11)
  })

  it('gives a high score for fully optimized data', () => {
    const result = computeSEOScore(validData)
    expect(result.score).toBeGreaterThanOrEqual(65)
  })

  it('gives a low score for empty data with default jurisdiction', () => {
    const result = computeSEOScore({
      title: '',
      pitch: '',
      description: '',
      tags: [],
      seo_title: '',
      seo_description: '',
      category: '',
      jurisdiction: '',
    })
    expect(result.score).toBeLessThanOrEqual(15)
  })

  it('fails the title check for short titles', () => {
    const result = computeSEOScore({ ...validData, title: 'Hi' })
    const titleCheck = result.checks.find(c => c.label.includes('Title') && c.label.includes('20'))
    expect(titleCheck?.passed).toBe(false)
  })

  it('passes the title check for titles 20–80 chars', () => {
    const result = computeSEOScore({ ...validData, title: 'X'.repeat(40) })
    const titleCheck = result.checks.find(c => c.label.includes('Title') && c.label.includes('20'))
    expect(titleCheck?.passed).toBe(true)
  })

  it('fails SEO title length check when > 60 chars', () => {
    const result = computeSEOScore({ ...validData, seo_title: 'X'.repeat(65) })
    const lengthCheck = result.checks.find(c => c.label.includes('60'))
    expect(lengthCheck?.passed).toBe(false)
  })

  it('passes meta description length check at 150 chars', () => {
    const result = computeSEOScore({
      ...validData,
      seo_description: 'X'.repeat(150),
    })
    const descCheck = result.checks.find(c => c.label.includes('Meta description'))
    expect(descCheck?.passed).toBe(true)
  })

  it('fails description check when < 300 chars', () => {
    const result = computeSEOScore({
      ...validData,
      description: 'Short desc',
    })
    const descCheck = result.checks.find(c => c.label.includes('Description'))
    expect(descCheck?.passed).toBe(false)
  })

  it('fails tags check when 0 tags', () => {
    const result = computeSEOScore({ ...validData, tags: [] })
    const tagsCheck = result.checks.find(c => c.label.includes('Tags'))
    expect(tagsCheck?.passed).toBe(false)
  })

  it('passes tags check with exactly 3 tags', () => {
    const result = computeSEOScore(validData)
    const tagsCheck = result.checks.find(c => c.label.includes('Tags'))
    expect(tagsCheck?.passed).toBe(true)
  })

  it('fails category check when empty', () => {
    const result = computeSEOScore({ ...validData, category: '' })
    const catCheck = result.checks.find(c => c.label.includes('Category'))
    expect(catCheck?.passed).toBe(false)
  })

  it('fails jurisdiction check when empty', () => {
    const result = computeSEOScore({ ...validData, jurisdiction: '' })
    const jurCheck = result.checks.find(c => c.label.includes('Jurisdiction'))
    expect(jurCheck?.passed).toBe(false)
  })

  it('weights are correct and sum to approximately 100', () => {
    const result = computeSEOScore(validData)
    const totalWeight = result.checks.reduce((sum, c) => sum + c.weight, 0)
    expect(totalWeight).toBe(100)

    // Each weight is positive
    result.checks.forEach(c => {
      expect(c.weight).toBeGreaterThan(0)
    })
  })

  it('each check has a hint string', () => {
    const result = computeSEOScore(validData)
    result.checks.forEach(c => {
      expect(typeof c.hint).toBe('string')
      expect(c.hint.length).toBeGreaterThan(0)
    })
  })

  it('handles all empty string fields gracefully', () => {
    const data = {
      title: 'Adequate Title Here',
      pitch: '',
      description: '',
      tags: [],
      seo_title: '',
      seo_description: '',
      category: '',
      jurisdiction: '',
    }
    const result = computeSEOScore(data)
    // Should still run without throwing
    expect(result.score).toBeDefined()
    expect(result.checks.length).toBe(11)
  })
})
