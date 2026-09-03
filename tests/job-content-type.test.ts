import { defaultJobTargetRepo, finalizePipelineContentType, normalizeJobContentType, resolveEditorialContentType } from '../lib/seoFactory/jobContentType'

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

describe('defaultJobTargetRepo', () => {
  it('never returns empty — content_jobs.target_repo is NOT NULL', () => {
    expect(defaultJobTargetRepo('blog_post', 'US')).toBe('yousafe-consultancy')
    expect(defaultJobTargetRepo('legal_guide', 'US')).toBe('caseworks')
    expect(defaultJobTargetRepo('marketplace_gig')).toBe('portal')
    expect(defaultJobTargetRepo(undefined)).toBeTruthy()
  })
})

describe('resolveEditorialContentType — blogs are not legal guides', () => {
  it('keeps an explicit blog_post even if the DB alias is missing', () => {
    expect(resolveEditorialContentType({ contentType: 'blog_post' })).toBe('blog_post')
  })

  it('recovers a blog wrongly stored as article from /blog/ canonical or YAML', () => {
    expect(resolveEditorialContentType({
      contentType: 'article',
      canonicalUrl: 'https://yousafeconsultancy.com/blog/rush-essay-editing-service/',
    })).toBe('blog_post')
    expect(resolveEditorialContentType({
      contentType: 'article',
      content: '---\ntitle: Rush essay\ncontent_type: blog_post\n---\n\n# Hello\n',
    })).toBe('blog_post')
  })

  it('still treats caseworks article rows as legal guides', () => {
    expect(resolveEditorialContentType({
      contentType: 'article',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/visa-renewal/',
    })).toBe('legal_guide')
  })
})

describe('finalizePipelineContentType — studio blog pin is sticky', () => {
  it('does not promote blog_post to legal_guide when ownership lands on caseworks', () => {
    expect(finalizePipelineContentType('blog_post', {
      host: 'legal',
      filePath: 'app/us/rush-essay/page.tsx',
      contentType: 'legal_guide',
      intentClass: 'procedural',
    })).toBe('blog_post')
  })

  it('uses blog depth on apex /blog/ paths even if the plan type drifted', () => {
    expect(finalizePipelineContentType('article', {
      host: 'apex',
      filePath: 'landing-page/app/blog/rush-essay-editing-service/page.tsx',
      contentType: 'legal_guide',
    })).toBe('blog_post')
  })

  it('never ships a studio blog as marketplace_gig', () => {
    expect(finalizePipelineContentType('marketplace_gig', {
      host: 'legal',
      filePath: 'app/blog/hire-admissions-consultant/page.tsx',
      contentType: 'marketplace_gig',
    })).toBe('blog_post')
    expect(resolveEditorialContentType({
      contentType: 'marketplace_gig',
      filePath: 'app/blog/hire-admissions-consultant/page.tsx',
    })).toBe('blog_post')
  })
})
