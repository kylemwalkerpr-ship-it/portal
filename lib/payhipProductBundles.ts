export const PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG =
  'premium-usa-canada-study-work-mega-bundle' as const

/**
 * Product-to-product composition used when a Payhip listing promises a bundle.
 *
 * Keep this explicit rather than deriving it from category labels: a paid bundle
 * must have a stable, auditable list of the exact buyer-facing products it ships.
 */
export const PAYHIP_PRODUCT_BUNDLES: Record<string, readonly string[]> = {
  [PREMIUM_USA_CANADA_MEGA_BUNDLE_SLUG]: [
    'us-f1-student-visa-ds160-i20-pack',
    'us-f1-interview-home-ties-pack',
    'us-b1b2-visitor-visa-ds160-invitation-pack',
    'us-opt-i765-application-prep-pack',
    'us-stem-opt-i765-i983-companion-pack',
    'us-i134-financial-support-companion-pack',
    'canada-study-permit-complete-pack',
    'canada-proof-of-funds-sponsor-pack',
    'canada-study-plan-letter-of-explanation-pack',
    'canada-trv-visitor-visa-pack',
    'canada-work-permit-outside-canada-pack',
    'canada-pgwp-application-pack',
    'canada-family-information-travel-history-pack',
    'us-canada-refusal-reapplication-response-pack',
    'universal-client-intake-document-review-kit',
  ],
}

export function getPayhipBundleComponents(slug: string): readonly string[] | null {
  return PAYHIP_PRODUCT_BUNDLES[slug] ?? null
}
