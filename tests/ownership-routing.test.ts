import { resolveOwner } from '@/lib/seoFactory/ownership'

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
