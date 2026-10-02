/**
 * Free guides linked from the confirmed-delivery gig pages.
 *
 * Only gigs with a consenting, delivering provider are listed here, and every
 * href must be a live, indexable guide on the YouSafe estate (apex blog or the
 * legal library). Gigs not listed render no guide block.
 */

export interface GigGuideLink {
  title: string
  href: string
}

const APEX = 'https://yousafeconsultancy.com'
const LEGAL = 'https://legal.yousafeconsultancy.com'

const GIG_GUIDES: Record<string, GigGuideLink[]> = {
  'review-i765-opt-application-before-filing': [
    { title: '7 OPT application mistakes international students make', href: `${APEX}/blog/opt-application-mistakes-2026` },
    { title: 'OPT document checklist: assembling your I-765 packet', href: `${LEGAL}/us/student-visas/opt-document-checklist/` },
  ],
  'provide-immigration-expert-lawyer-services': [
    { title: 'SEVIS termination and reinstatement, step by step', href: `${LEGAL}/us/student-visas/sevis-termination-and-reinstatement/` },
    { title: 'F-1 status violation: what to do first', href: `${LEGAL}/us/student-visas/f1-status-violation/` },
  ],
  'edit-thesis-admissions-essay-us-university-applications': [
    { title: 'How to write a statement of purpose for an F-1 visa or study permit', href: `${APEX}/blog/statement-of-purpose-sop-student-visa` },
    { title: 'Choosing an essay editing service as an F-1 student', href: `${APEX}/blog/essay-editing-service` },
    { title: 'How admissions committees read your essay', href: `${LEGAL}/us/admissions-essay/` },
  ],
}

export function getGigGuideLinks(gigSlug: string | null | undefined): GigGuideLink[] {
  if (!gigSlug) return []
  return GIG_GUIDES[gigSlug] ?? []
}

export const GIG_GUIDE_SLUGS = Object.keys(GIG_GUIDES)
