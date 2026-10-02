/**
 * File Shop pack -> professional review upsell.
 *
 * EDIT HERE to change which review a self-serve pack offers. Rules:
 *  - Only link a gig that is ACTIVE and actually DELIVERED by a consenting
 *    provider (today: Kyle G Walker's I-765 OPT review and F-1 reinstatement
 *    review). Roster-research listings are never upsell targets.
 *  - The price shown is the gig's entry tier, kept in sync with the live gig.
 *  - Every other pack falls back to the free /get-matched intake, so a buyer
 *    is never sent to a listing that may not be staffed.
 */

export interface PackReviewGig {
  slug: string
  title: string
  priceUsd: number
  outcome: string
}

export const OPT_I765_REVIEW: PackReviewGig = {
  slug: 'review-i765-opt-application-before-filing',
  title: 'I-765 OPT application review by a US attorney',
  priceUsd: 249,
  outcome: 'An annotated I-765 and a correction checklist before you file.',
}

export const F1_REINSTATEMENT_REVIEW: PackReviewGig = {
  slug: 'provide-immigration-expert-lawyer-services',
  title: 'F-1 reinstatement file review',
  priceUsd: 395,
  outcome: 'Written risks and next steps on your F-1/SEVIS reinstatement file.',
}

export interface PackReviewUpsell {
  /** Direct fixed-fee review that matches this pack, when one exists. */
  primary: PackReviewGig | null
  /** Situational secondary review (e.g. a student who has already lost status). */
  secondary: { gig: PackReviewGig; when: string } | null
}

const PACK_REVIEW_MAP: Record<string, PackReviewUpsell> = {
  'us-opt-i765-application-prep-pack': { primary: OPT_I765_REVIEW, secondary: null },
  'us-stem-opt-i765-i983-companion-pack': { primary: OPT_I765_REVIEW, secondary: null },
  'us-f1-student-visa-ds160-i20-pack': {
    primary: null,
    secondary: { gig: F1_REINSTATEMENT_REVIEW, when: 'Already in the US and out of F-1 status?' },
  },
  'us-f1-interview-home-ties-pack': {
    primary: null,
    secondary: { gig: F1_REINSTATEMENT_REVIEW, when: 'Already in the US and out of F-1 status?' },
  },
  'premium-usa-canada-study-work-mega-bundle': {
    primary: OPT_I765_REVIEW,
    secondary: { gig: F1_REINSTATEMENT_REVIEW, when: 'Already in the US and out of F-1 status?' },
  },
}

export function getPackReviewUpsell(packSlug: string): PackReviewUpsell {
  return PACK_REVIEW_MAP[packSlug] ?? { primary: null, secondary: null }
}

export const GET_MATCHED_PATH = '/get-matched'
