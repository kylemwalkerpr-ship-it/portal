/// <reference types="jest" />

import { resolveLegacyGigRedirect, LEGACY_GIG_SLUG_REDIRECTS } from '@/lib/gigSlugRedirects'

describe('resolveLegacyGigRedirect', () => {
  it('maps the GSC soft-200 education petitions short slug to the active successor', () => {
    expect(resolveLegacyGigRedirect('draft-education-petitions')).toBe(
      'draft-education-petitions-us-schools-expert-advice',
    )
  })

  it('returns null for unknown or already-canonical slugs', () => {
    expect(resolveLegacyGigRedirect('draft-education-petitions-us-schools-expert-advice')).toBeNull()
    expect(resolveLegacyGigRedirect('provide-immigration-expert-lawyer-services')).toBeNull()
    expect(resolveLegacyGigRedirect('')).toBeNull()
  })

  it('never redirects a slug onto itself', () => {
    for (const [from, to] of Object.entries(LEGACY_GIG_SLUG_REDIRECTS)) {
      expect(from).not.toBe(to)
      expect(resolveLegacyGigRedirect(from)).toBe(to)
    }
  })
})
