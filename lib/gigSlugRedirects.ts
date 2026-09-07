/**
 * Static legacy gig slug → current slug redirects.
 *
 * Used when `gig_slug_redirects` has no row yet (or DB lookup fails) so
 * crawlers hit a real 301 instead of a soft-200 + noindex loading shell
 * that inflates GSC "Excluded by noindex".
 *
 * Only map renamed *public* gigs whose canonical successor is active.
 * Do not map drafts/private admin URLs here.
 */
export const LEGACY_GIG_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  // GSC sample: short slug soft-200 noindex; live successor is indexable.
  'draft-education-petitions': 'draft-education-petitions-us-schools-expert-advice',
}

export function resolveLegacyGigRedirect(slug: string): string | null {
  const next = LEGACY_GIG_SLUG_REDIRECTS[slug]
  if (!next || next === slug) return null
  return next
}
