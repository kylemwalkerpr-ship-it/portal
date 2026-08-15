import { jobToMasterEngineInput } from '@/lib/seoFactory/jobToMasterInput'

describe('jobToMasterEngineInput — shared row mapper', () => {
  it('maps every engine-relevant field', () => {
    const input = jobToMasterEngineInput({
      id: 'job_1',
      topic: 'uk graduate visa requirements',
      title: 'UK Graduate Visa Requirements: Eligibility, Costs and Steps',
      primary_keyword: 'uk graduate visa',
      content_type: 'article',
      region: 'UK',
      content: '# Body\n\nWords here.',
      indexable: true,
      canonical_url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
      live_html: '<html><title>t</title></html>',
      live_url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
      live_http_status: 200,
      required_short_keywords: ['graduate visa', 'graduate route'],
      required_long_tail_keywords: ['uk graduate visa eligibility'],
      competing_urls: ['https://legal.yousafeconsultancy.com/uk/post-study-work/'],
      gsc_json: { impressions: 1200, clicks: 40, ctr: 0.033, position: 8.2, queries: 9 },
      backlinks_json: { url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/', provider: 'dataforseo' },
      authority_score: 42,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    })

    expect(input.topic).toBe('uk graduate visa requirements')
    expect(input.primaryKeyword).toBe('uk graduate visa')
    expect(input.contentType).toBe('article')
    expect(input.region).toBe('UK')
    expect(input.content).toContain('Body')
    expect(input.indexable).toBe(true)
    expect(input.canonicalUrl).toBe('https://legal.yousafeconsultancy.com/uk/graduate-route-visa/')
    expect(input.liveHtml).toContain('<title>')
    expect(input.liveUrl).toBe('https://legal.yousafeconsultancy.com/uk/graduate-route-visa/')
    expect(input.liveHttpStatus).toBe(200)
    expect(input.requiredShortKeywords).toEqual(['graduate visa', 'graduate route'])
    expect(input.requiredLongTailKeywords).toEqual(['uk graduate visa eligibility'])
    expect(input.competingUrls).toHaveLength(1)
    expect(input.gsc).toMatchObject({ impressions: 1200, clicks: 40, ctr: 0.033, position: 8.2, queries: 9 })
    expect(input.backlinks).toMatchObject({ provider: 'dataforseo' })
    expect(input.authorityScore).toBe(42)
    expect(input.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(input.updatedAt).toBe('2026-08-01T00:00:00Z')
  })

  it('falls back to topic as the primary keyword and nulls stay undefined', () => {
    const input = jobToMasterEngineInput({ topic: 'visa refusal appeal' })
    expect(input.primaryKeyword).toBe('visa refusal appeal')
    expect(input.content).toBeUndefined()
    expect(input.liveUrl).toBeUndefined()
    expect(input.gsc).toBeUndefined()
    expect(input.backlinks).toBeUndefined()
  })

  it('uses canonical_url as the live URL fallback', () => {
    const input = jobToMasterEngineInput({ canonical_url: 'https://legal.yousafeconsultancy.com/x/' })
    expect(input.liveUrl).toBe('https://legal.yousafeconsultancy.com/x/')
    expect(input.canonicalUrl).toBe('https://legal.yousafeconsultancy.com/x/')
  })

  it('tolerates a garbage gsc_json blob', () => {
    const input = jobToMasterEngineInput({ gsc_json: { impressions: 'NaN', clicks: null } })
    expect(input.gsc).toBeUndefined()
  })

  it('prefers gsc_json over the legacy gsc key', () => {
    const input = jobToMasterEngineInput({ gsc_json: { impressions: 10 }, gsc: { impressions: 99 } })
    expect(input.gsc!.impressions).toBe(10)
  })
})
