import { normalizeJobContentType } from '../lib/seoFactory/jobContentType'

describe('normalizeJobContentType (content_jobs CHECK constraint)', () => {
  it('passes through DB-allowed types unchanged', () => {
    expect(normalizeJobContentType('blog_post')).toBe('blog_post')
    expect(normalizeJobContentType('article')).toBe('article')
    expect(normalizeJobContentType('regional_page')).toBe('regional_page')
    expect(normalizeJobContentType('marketplace_gig')).toBe('marketplace_gig')
  })

  it('maps pipeline-internal types to allowed DB values', () => {
    expect(normalizeJobContentType('legal_guide')).toBe('article')
    expect(normalizeJobContentType('regional_university')).toBe('regional_page')
    expect(normalizeJobContentType('regional_from')).toBe('regional_page')
    expect(normalizeJobContentType('blog_summary')).toBe('blog_post')
  })

  it('falls back to article for unknown, empty, or null values', () => {
    expect(normalizeJobContentType('unknown_type')).toBe('article')
    expect(normalizeJobContentType('')).toBe('article')
    expect(normalizeJobContentType(null)).toBe('article')
    expect(normalizeJobContentType(undefined)).toBe('article')
  })
})
