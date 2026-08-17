/**
 * Permanent guards: War Room must never force legal_guide onto regional
 * university paths (that caused daily CI failures via depth floor + ship gate).
 */
import {
  reconcileContentTypeWithPath,
  type OwnerHost,
} from '@/lib/seoFactory/ownership'
import { inferContentType, isNoiseQuery } from '@/lib/seoFactory/seoWarRoom'

describe('isNoiseQuery', () => {
  it('rejects quoted GSC snippet garbage (Yale weekly case)', () => {
    expect(isNoiseQuery('"issued by yale university" weekly new haven')).toBe(true)
  })

  it('keeps real procedural queries', () => {
    expect(isNoiseQuery('opt 90 day unemployment cap')).toBe(false)
    expect(isNoiseQuery('canada express entry stem occupations 2026')).toBe(false)
  })
})

describe('inferContentType', () => {
  it('does not force legal_guide for title_ctr_rewrite on university terms', () => {
    expect(inferContentType('yale university international student guide', 'title_ctr_rewrite')).toBe(
      'regional_university',
    )
    // housing still stays legal (tenant / rights content)
    expect(inferContentType('yale university student housing tenant rights', 'title_ctr_rewrite')).toBe(
      'legal_guide',
    )
  })

  it('detects from-country and blogs', () => {
    expect(inferContentType('student visa from nigeria', 'deep_demand_build')).toBe('regional_from')
    expect(inferContentType('what is pgwp news update', 'aeo_entity_hub')).toBe('blog_post')
  })

  it('defaults procedural terms to legal_guide', () => {
    expect(inferContentType('administrative review letter template uk', 'title_ctr_rewrite')).toBe(
      'legal_guide',
    )
  })
})

describe('reconcileContentTypeWithPath', () => {
  it('forces regional_university for universities path even if caller said legal_guide', () => {
    const r = reconcileContentTypeWithPath({
      contentType: 'legal_guide',
      filePath: 'usa/content/universities/issued-by-yale-university-weekly-new-haven.md',
      host: 'usa' as OwnerHost,
      intentClass: 'procedural',
    })
    expect(r.contentType).toBe('regional_university')
    expect(r.intentClass).toBe('university_modifier')
  })

  it('forces regional_from for from-country path', () => {
    const r = reconcileContentTypeWithPath({
      contentType: 'legal_guide',
      filePath: 'usa/content/from/nigeria.md',
      host: 'usa',
    })
    expect(r.contentType).toBe('regional_from')
  })

  it('coerces legal_guide off regional hosts without special path', () => {
    const r = reconcileContentTypeWithPath({
      contentType: 'legal_guide',
      filePath: 'uk/content/student-housing.md',
      host: 'uk',
    })
    expect(r.contentType).toBe('regional_page')
  })

  it('keeps legal_guide on caseworks paths', () => {
    const r = reconcileContentTypeWithPath({
      contentType: 'legal_guide',
      filePath: 'app/uk/administrative-review-letter-template-uk/page.tsx',
      host: 'legal',
    })
    expect(r.contentType).toBe('legal_guide')
  })
})
