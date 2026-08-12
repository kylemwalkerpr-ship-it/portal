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

  it('still routes a genuine spouse-visa keyword to the spouse-visa page', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk spouse visa document checklist 2026',
      contentType: 'legal_guide',
      region: 'UK',
    })
    expect(p.canonicalUrl.toLowerCase()).toContain('spouse')
  })

  it('still routes a genuine dependent-visa keyword to the dependent-visa page', async () => {
    const p = await resolveOwner({
      primaryKeyword: 'uk dependent visa child requirements',
      contentType: 'legal_guide',
      region: 'UK',
    })
    // The dependent-visa row may resolve via registry or standing rules, but it
    // must never silently fall onto the graduate route.
    expect(p.canonicalUrl.toLowerCase()).not.toContain('graduate')
  })
})
