/**
 * Extra crawlable copy for marketplace category / subcategory hubs.
 * Keyed by category or subcategory id from lib/categories.ts.
 */

export type CategoryEditorial = {
  /** 1–2 paragraphs under the short description */
  body: string[]
  /** What buyers typically compare in this shelf */
  compare?: string[]
  /** When to use templates / legal guides instead of a marketplace order */
  nextSteps?: string
}

const DEFAULT_COMPARE = [
  'Scope of the brief (what is in vs out of the fixed price)',
  'Delivery days and revision policy',
  'Provider role (consultant vs licensed attorney) and jurisdiction tags',
  'Whether the package is document prep only or includes strategy calls',
]

export const CATEGORY_EDITORIAL: Record<string, CategoryEditorial> = {
  immigration: {
    body: [
      'Immigration marketplace briefs cover study permits, work authorization, permanent residence pathways, family petitions, and visitor categories across major destinations. Listings should name the country, form set, and deliverable — not vague “visa help.”',
      'Start with the subcategory that matches your product (study, work, PR, family). Read free procedure on MyCaseworks when you need officer-order checklists; use marketplace orders when you want a human to assemble or review a fixed-scope packet.',
    ],
    compare: DEFAULT_COMPARE,
    nextSteps:
      'Unsure which category applies? Open legal.yousafeconsultancy.com for the controlling checklist, then return here with the form names in hand.',
  },
  'study-permits': {
    body: [
      'Study-permit and student-visa briefs usually mean F-1 (US), UK Student Route, Canada study permit, or Australia Subclass 500 document preparation. Strong listings specify which country and which evidence they organize (funds, study plan, CAS/I-20 packet, refusal recovery).',
      'Before you order, confirm school documents (I-20, CAS, LOA) are issued or imminent. Marketplace prep cannot invent an admission letter or provincial attestation.',
    ],
    compare: [
      'Country and program level covered',
      'Whether funds / sponsor packages are included',
      'Interview prep vs pure document assembly',
      'Turnaround relative to your biometrics or term start',
    ],
    nextSteps:
      'For free study-permit and F-1 checklists, use MyCaseworks; for self-serve worksheets, open Marketplace template packs.',
  },
  'work-permits': {
    body: [
      'Work-authorization briefs span OPT/STEM OPT, CPT support, H-1B document packs, Canadian work permits, Graduate Route support, and related employer letters. Eligibility is category-specific — a low price for the wrong product is wasted spend.',
      'Students should not order “H-1B full petition” services without an employer ready to sponsor. OPT packages should respect DSO timing and I-765 windows.',
    ],
    compare: [
      'Student training (OPT/CPT) vs employer-sponsored petitions',
      'Whether employer liaison is included',
      'STEM I-983 / E-Verify support when claimed',
      'Jurisdiction and form versions named in the gig',
    ],
  },
  'pr-immigration': {
    body: [
      'PR and permanent residence briefs include Express Entry readiness, PNP orientation packs, and US employment- or family-based green card document organization. These are multi-stage journeys — one fixed-price brief rarely equals a full grant of status.',
      'Expect language scores, work history mapping, and civil documents to dominate the work. Be wary of guaranteed CRS or invitation claims.',
    ],
    compare: [
      'Whether the brief is CRS/strategy only or full document assembly',
      'Country and stream named (EE, PNP, EB category, etc.)',
      'What is excluded (forms filing accounts, police certificates, medicals)',
    ],
  },
  'family-sponsorship': {
    body: [
      'Family sponsorship services organize spousal, partner, parent, and relative petition evidence. Relationship proof and financial sponsorship forms are usually the critical path — not school paperwork.',
      'If one partner is on a student status, confirm the correct product (dependent visa, open work permit, immigrant petition) before paying for a generic “spouse visa” brief.',
    ],
    compare: [
      'US vs Canada vs other country processes',
      'Inland vs outland (Canada) or adjustment vs consular (US) scope',
      'Financial form support (I-864, I-134, Canadian funds proofs)',
    ],
  },
  'visitor-visas': {
    body: [
      'Visitor and temporary resident briefs cover B-1/B-2, TRV, and similar short-stay categories. Strong packages focus on ties, itinerary consistency, and prior travel history — not tourist marketing copy.',
    ],
    compare: ['Country of application', 'Whether invitation letter support is included', 'Turnaround before travel dates'],
  },
  citizenship: {
    body: [
      'Citizenship and naturalization briefs help organize residence evidence, test prep materials, and form checklists. Continuous residence and physical presence rules are unforgiving — verify dates before you order.',
    ],
  },
  education: {
    body: [
      'Education and admissions services include university applications, graduate school packages, scholarships, and academic mentoring. These are distinct from immigration filings even when both are required for the same student journey.',
      'Share transcript reality early. Essay and SOP help fails when the academic story contradicts prior refusals or visa forms.',
    ],
    compare: DEFAULT_COMPARE,
  },
  'university-admissions': {
    body: [
      'University admissions consulting typically covers school list strategy, essays, activity lists, and deadline management. Confirm whether the provider works undergraduate or graduate cycles and which countries’ systems they know.',
    ],
    compare: [
      'Number of schools / essays included',
      'Edit rounds and response time during deadline week',
      'Whether interview prep is in scope',
    ],
  },
  'graduate-school': {
    body: [
      'Graduate packages often include SOP, research fit, CV, and recommendation strategy. PhD and professional programs need different evidence — ask whether the provider has placed candidates in your field, not only “top schools” generically.',
    ],
  },
  scholarships: {
    body: [
      'Scholarship and funding briefs organize merit statements, financial need narratives, and application trackers. Awards rarely cover full cost of attendance alone — pair this work with realistic funds evidence for visas.',
    ],
  },
  'test-prep': {
    body: [
      'Test prep gigs should state the exam (IELTS, TOEFL, GRE, GMAT, etc.), score targets, and session format. Immigration officers care about official scores — not practice claims.',
    ],
  },
  'academic-mentoring': {
    body: [
      'Academic mentoring covers study skills, course selection, and transition support. It is not a substitute for DSO or IRCC advice on status.',
    ],
  },
  'academic-writing': {
    body: [
      'Academic writing services range from application essays to research editing. Confirm originality policies and whether the deliverable is coaching, editing, or drafting — school integrity rules vary.',
    ],
    compare: [
      'Editing vs ghostwriting boundaries',
      'Turnaround for deadline-critical essays',
      'Field expertise (STEM vs humanities)',
    ],
  },
  'application-essays': {
    body: [
      'Application essay help should preserve your voice while tightening structure and specificity. Bring a factual outline of activities and outcomes before the first call.',
    ],
  },
  'sop-writing': {
    body: [
      'SOP and statement-of-purpose support works best when program choice and research themes are already shortlisted. Align the essay with transcripts and visa study narratives to avoid contradictions.',
    ],
  },
  'scholarship-essays': {
    body: [
      'Scholarship essays need concrete impact and eligibility fit. Generic “passion for education” drafts underperform against criteria-aligned narratives.',
    ],
  },
  'research-writing': {
    body: [
      'Research writing and thesis support should define literature review, editing, or methodology coaching clearly. Academic integrity policies prohibit undisclosed ghostwriting of assessed work.',
    ],
  },
  'proofreading-editing': {
    body: [
      'Proofreading and language polishing improve clarity without changing your claims. Provide the style guide (APA, MLA, journal) and a clean draft free of tracked-comment chaos.',
    ],
  },
  legal: {
    body: [
      'Legal marketplace services include document prep, attorney review, consultations, business formation, and compliance support. Only licensed attorneys in the relevant jurisdiction can provide legal advice — confirm credentials on the provider profile.',
    ],
    compare: [
      'Licensed attorney vs consultant role',
      'Jurisdiction of licensure',
      'Whether the brief is advice, review, or form prep only',
    ],
    nextSteps:
      'For free procedural articles, use MyCaseworks. Order marketplace legal review when you need a human on a fixed deliverable.',
  },
  'document-prep': {
    body: [
      'Document preparation briefs organize forms and evidence indexes without necessarily providing legal advice. Ask what “complete package” means and who is responsible for account filings.',
    ],
  },
  'attorney-review': {
    body: [
      'Attorney review packages assume you already have a draft packet. Expect written issues lists and risk notes — not a guarantee of approval.',
    ],
  },
  'legal-consultation': {
    body: [
      'Consultations are time-boxed strategy sessions. Come with a one-page timeline, prior refusals, and the exact question you need answered.',
    ],
  },
  'business-formation': {
    body: [
      'Business formation help covers entity setup paperwork and compliance checklists. Immigration status and work authorization are separate — forming an LLC does not by itself authorize employment.',
    ],
  },
  compliance: {
    body: [
      'Compliance briefs support filings and reporting calendars. Scope the regulator and entity type before you buy a generic “compliance package.”',
    ],
  },
  settlement: {
    body: [
      'Settlement services help with housing, banking, healthcare navigation, and first-month logistics after arrival. They complement — and do not replace — immigration status maintenance with your school or IRCC/USCIS rules.',
    ],
    compare: DEFAULT_COMPARE,
  },
  housing: {
    body: [
      'Housing support may include rental applications, lease review orientation, and roommate planning. Local tenancy law varies by city — ask which jurisdiction the provider knows.',
    ],
  },
  'banking-finance': {
    body: [
      'Banking and financial setup briefs help international students open accounts and organize transfer evidence. Keep remittance records for future immigration packets.',
    ],
  },
  healthcare: {
    body: [
      'Healthcare navigation covers insurance enrollment and clinic access basics. It is not medical advice; emergency care instructions come from local systems and your school.',
    ],
  },
  'daily-life': {
    body: [
      'Daily-life setup includes phone, transport, and orientation tasks. Useful in week one — schedule it after you have a stable address for KYC and school registration.',
    ],
  },
  career: {
    body: [
      'Career services include resumes, LinkedIn, and job search coaching for international students and grads. Align advice with your work authorization reality (CPT, OPT, PGWP, etc.).',
    ],
    compare: DEFAULT_COMPARE,
  },
  business: {
    body: [
      'Business consulting on the marketplace ranges from plans to market entry research. Separate corporate work from personal immigration strategy unless the gig explicitly combines both under a licensed professional.',
    ],
  },
  credentials: {
    body: [
      'Credential evaluation and document authentication support helps with WES-style packages, transcripts, and attestation logistics. Processing times are often outside the provider’s control — build buffer into visa timelines.',
    ],
  },
  mentorship: {
    body: [
      'Mentorship gigs offer ongoing guidance rather than a single document deliverable. Confirm meeting cadence, channel, and what “success” means after the package ends.',
    ],
  },
}

export function getCategoryEditorial(id: string): CategoryEditorial | null {
  return CATEGORY_EDITORIAL[id] || null
}
