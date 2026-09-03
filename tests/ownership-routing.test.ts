import {
  classifyDestinationType,
  filePathFromOwnerUrl,
  resolveOwner,
  sanitizeOwnerUrl,
  standingRulesHost,
} from '@/lib/seoFactory/ownership'

/**
 * Regression for the 2026-08 production incident where "uk graduate visa
 * requirements" was matched to the registry row "uk dependent visa child
 * requirements" (score ≥45) and shipped onto the spouse-visa-document-checklist
 * page — overwriting live spouse-visa content with graduate-visa content.
 *
 * The matcher must treat distinct visa route subtypes (graduate / spouse /
 * dependent / child / student …) as different subjects even when they share the
 * generic words "uk", "visa", "requirements".
 *
 * The registry itself must also be fixed: three rows in the UK family/dependent
 * cluster previously all pointed their owner_url at the spouse-visa checklist
 * page. These tests lock in the corrected owner_url routing.
 */
describe('ownership resolver — visa route subtype separation', () => {
  it('routes uk graduate visa requirements to its own standing-rules page (never spouse-visa)', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk graduate visa requirements',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.matched).toBeNull()
    expect(p.routingSource).toBe('standing_rules')
    expect(p.host).toBe('legal')
    expect(p.canonicalUrl).not.toContain('spouse')
    expect(p.canonicalUrl).not.toContain('dependent')
    expect(p.canonicalUrl).toContain('graduate')
    expect(p.filePath).toContain('graduate-visa')
  })

  it('routes uk spouse visa document checklist to the canonical spouse-checklist page', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.routingSource).toBe('registry_owner_url')
    expect(p.canonicalUrl).toBe(
      'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-document-checklist-2026/',
    )
    expect(p.filePath).toBe('app/uk/immigration/uk-spouse-visa-document-checklist-2026/page.tsx')
  })

  it('routes uk dependent visa child requirements to a dedicated child page (never spouse)', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk dependent visa child requirements',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.canonicalUrl).not.toContain('spouse')
    expect(p.canonicalUrl).not.toContain('graduate')
    expect(p.canonicalUrl).toContain('child')
    expect(p.filePath).toContain('child')
  })

  it('routes uk dependent visa family pillar to the family-visas hub (never spouse)', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk dependent visa family pillar',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.canonicalUrl).not.toContain('spouse')
    expect(p.canonicalUrl).toContain('family-visas')
    expect(p.filePath).toBe('app/uk/family-visas/page.tsx')
  })
})

describe('ownership resolver — university/geo modifier vs generic hub separation', () => {
  it('never routes asu visa requirements onto the UK dependent-child canon', async () => {
    // 2026-08-19: Jaccard hit exactly 45 against "uk dependent visa child
    // requirements" (overlap: visa, requirements; uk dropped as length 2)
    // because ASU has no route subtype and was not a geo token. CI then
    // red-X'd every later PR via check-subject-mismatch.
    const p = await resolveOwner({
      primaryKeyword: 'asu visa requirements',
      contentType: 'legal_guide',
      region: 'US',
    })
    expect(p.canonicalUrl).not.toContain('dependent')
    expect(p.canonicalUrl).not.toContain('child')
    expect(p.filePath).not.toContain('uk-dependent-visa-child')
    expect(p.filePath).not.toMatch(/\/uk\//)
    expect(p.routingSource).toBe('standing_rules')
  })

  it('never routes a university modifier (boulder student visas) to the generic student-visas hub', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'boulder student visas',
      contentType: 'legal_guide',
      region: 'US',
    })
    // The 2026-08 incident: this keyword matched the "us student visas hub" row
    // (both carry the "student" route subtype) and overwrote the live hub.
    expect(p.matched).toBeNull()
    expect(p.routingSource).toBe('standing_rules')
    expect(p.host).toBe('usa')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com/us/student-visas')
    expect(p.canonicalUrl).toContain('boulder')
    expect(p.contentType).toBe('regional_university')
  })

  it('still matches a registry university row when the geo scope is shared', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'auburn university student housing',
      contentType: 'regional_university',
      region: 'US',
    })
    expect(p.routingSource).toBe('registry_owner_url')
    expect(p.canonicalUrl).toContain('auburn-university')
  })

  it('never routes a state-level modifier (texas student visas) to the generic hub', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'texas student visas',
      contentType: 'legal_guide',
      region: 'US',
    })
    expect(p.matched).toBeNull()
    expect(p.routingSource).toBe('standing_rules')
    expect(p.host).toBe('usa')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com/us/student-visas')
    expect(p.canonicalUrl).toContain('texas')
  })

  it('still resolves the generic hub keyword to the hub (no geo penalty on generic)', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'us student visas hub',
      contentType: 'legal_guide',
      region: 'US',
    })
    expect(p.routingSource).toBe('registry_owner_url')
    expect(p.canonicalUrl).toBe('https://legal.yousafeconsultancy.com/us/student-visas/')
    expect(p.filePath).toBe('app/us/student-visas/page.tsx')
  })
})

describe('ownership resolver — explicit blog / regional destinations stay off caseworks', () => {
  it('classifies from-country, campus, lifestyle, and procedure', () => {
    expect(classifyDestinationType('student visa from nigeria')).toBe('regional_from')
    expect(classifyDestinationType('yale university international student guide')).toBe('regional_university')
    expect(classifyDestinationType('first 30 days in canada banking')).toBe('blog_post')
    expect(classifyDestinationType('uk graduate visa requirements')).toBe('legal_guide')
  })

  it('routes Blog Post to the apex landing-page blog even when the keyword matches a legal pillar', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'blog_post',
      region: 'UK',
    })
    expect(p.host).toBe('apex')
    expect(p.repo).toBe('yousafe-consultancy')
    expect(p.canonicalUrl).toContain('yousafeconsultancy.com/blog/')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com')
    expect(p.filePath).toContain('landing-page/app/blog/')
    expect(p.warnings.some((w) => /stays on legal/i.test(w))).toBe(true)
  })

  it('routes Regional Page to the regional host instead of overwriting the legal pillar', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'regional_page',
      region: 'UK',
    })
    expect(p.host).toBe('uk')
    expect(p.repo).toBe('yousafe-consultancy')
    expect(p.canonicalUrl).toContain('uk.yousafeconsultancy.com')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com')
    expect(p.filePath).toMatch(/^uk\//)
  })

  it('still ships Long-Form Article / legal_guide onto the caseworks pillar', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.host).toBe('legal')
    expect(p.repo).toBe('caseworks')
    expect(p.canonicalUrl).toContain('legal.yousafeconsultancy.com')
  })

  it('does not let a legal cluster hint steal an explicit blog_post onto caseworks', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'study permit refusal reapply canada 2026',
      contentType: 'blog_post',
      region: 'CA',
      ownerUrlHint: 'https://legal.yousafeconsultancy.com/ca/study-permit-refusal-reapply-2026/',
    })
    expect(p.host).toBe('apex')
    expect(p.repo).toBe('yousafe-consultancy')
    expect(p.contentType).toBe('blog_post')
    expect(p.canonicalUrl).toContain('yousafeconsultancy.com/blog/')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com')
  })

  it('does not let a legal cluster hint steal an explicit regional_page onto caseworks', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'regional_page',
      region: 'UK',
      ownerUrlHint: 'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-document-checklist-2026/',
    })
    expect(p.host).toBe('uk')
    expect(p.repo).toBe('yousafe-consultancy')
    expect(p.canonicalUrl).toContain('uk.yousafeconsultancy.com')
    expect(p.canonicalUrl).not.toContain('legal.yousafeconsultancy.com')
  })

  it('does not send visa blog_summary to caseworks', () => {
    const rules = standingRulesHost({
      primaryKeyword: 'uk graduate visa news update',
      contentType: 'blog_summary',
      region: 'UK',
    })
    expect(rules.host).toBe('apex')
    expect(rules.contentType).toMatch(/blog/)
  })
})

describe('ownership resolver — no double-slash URLs', () => {
  it('collapses // in owner URLs and file paths', () => {
    expect(sanitizeOwnerUrl('https://legal.yousafeconsultancy.com//uk/foo/')).toBe(
      'https://legal.yousafeconsultancy.com/uk/foo/',
    )
    const mapped = filePathFromOwnerUrl('https://legal.yousafeconsultancy.com//uk/foo/', 'legal')
    expect(mapped?.urlPath).toBe('/uk/foo/')
    expect(mapped?.filePath).toBe('app/uk/foo/page.tsx')
  })
})

describe('ownership resolver — indexability defaults to indexable', () => {
  it('defaults every resolved article to indexable (no silent noindex)', async () => {
    // 2026-08 regression: a registry `noindex` action used to silently mark the
    // resolved plan indexable=false, so a passing article shipped with a noindex
    // tag. Every article that passes review and merges to live must be indexable
    // by default — only an explicit caller override can mark it noindex.
    const p = await resolveOwner({
      primaryKeyword: 'f-1 visa rights international students',
      contentType: 'legal_guide',
      region: 'US',
    })
    expect(p.indexable).toBe(true)
  })

  it('still honors an explicit caller override to noindex', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'f-1 visa rights international students',
      contentType: 'legal_guide',
      region: 'US',
      indexable: false,
    })
    expect(p.indexable).toBe(false)
  })
})
