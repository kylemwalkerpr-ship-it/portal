/**
 * lib/seoEngine/ontology.ts
 *
 * The immigrant life-cycle ontology — the strategic brain of the SEO Master
 * Engine. Every piece of content the estate produces should map to exactly one
 * (stage × country) cell so the whole funnel is planned, covered, interlinked
 * and measured as one system.
 *
 * Life-cycle stages (the full journey):
 *   intent → schools → work → housing → visa → settlement → citizenship → family → relatives
 *
 * Countries: US · UK · CA · AU
 *
 * Each cell carries:
 *  - funnel phase + intent mix      (awareness → transactional)
 *  - YMYL sensitivity               (immigration = YMYL: legal/health/education)
 *  - marketplace services mapped    (drives traffic → marketplace listings)
 *  - content types per estate repo  (regional_page / blog_post / casework / marketplace_landing / faq_hub)
 *  - seed keywords per country      (the deterministic research start-points)
 *  - statutory anchors              (INA / IRPA / Immigration Rules / Migration Act)
 *  - natural interlink neighbors    (prev + next stage in the same country + same stage across countries)
 */

export type Country = 'US' | 'UK' | 'CA' | 'AU'
export type Phase = 'awareness' | 'consideration' | 'decision' | 'settlement' | 'loyalty'
export type Funnel = 'top' | 'middle' | 'bottom'
export type YmylLevel = 'low' | 'medium' | 'high' | 'critical'
export type IntentMix = { informational: number; commercial: number; transactional: number; navigational: number }

export type ContentType = 'regional_page' | 'blog_post' | 'casework' | 'marketplace_landing' | 'faq_hub'

export interface LifecycleStageDef {
  key: string
  label: string
  short: string
  phase: Phase
  funnel: Funnel
  ymyl: YmylLevel
  intentMix: IntentMix
  /** Marketplace category ids whose listings this stage should feed traffic to. */
  services: string[]
  contentTypes: ContentType[]
  /** What this stage must prove to the reader (E-E-A-T requirement). */
  proofPoints: string[]
  countries: Record<Country, CountryCell>
}

export interface CountryCell {
  /** Seed keywords — deterministic research start points (GSC-verified later). */
  seedKeywords: string[]
  /** Statutory / official anchors that must be cited (YMYL accuracy). */
  statutoryAnchors: string[]
  /** Official bodies whose guidance governs this stage. */
  authorities: string[]
  /** Natural interlink targets in the estate for this cell. */
  neighbors: { prev?: string; next?: string; across?: string[] }
}

export const COUNTRIES: Country[] = ['US', 'UK', 'CA', 'AU']

const K = (s: string[]) => s

export const LIFECYCLE_STAGES: LifecycleStageDef[] = [
  {
    key: 'intent',
    label: 'Intent to move',
    short: 'Why move & where',
    phase: 'awareness',
    funnel: 'top',
    ymyl: 'medium',
    intentMix: { informational: 80, commercial: 15, transactional: 5, navigational: 0 },
    services: ['visa', 'consultation'],
    contentTypes: ['blog_post', 'regional_page', 'faq_hub'],
    proofPoints: ['comparison data', 'cost of living figures', 'first-hand experience', 'official sources'],
    countries: {
      US: {
        seedKeywords: K(['why move to usa', 'living in usa as immigrant', 'usa immigration options 2026', 'best states for immigrants', 'move to america from africa']),
        statutoryAnchors: ['INA (Immigration and Nationality Act)'],
        authorities: ['USCIS', 'DOS'],
        neighbors: { next: 'schools', across: ['intent|uk', 'intent|ca', 'intent|au'] },
      },
      UK: {
        seedKeywords: K(['why move to uk', 'living in uk as immigrant', 'uk immigration routes 2026', 'best cities for immigrants uk', 'move to uk from africa']),
        statutoryAnchors: ['UK Immigration Rules'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { next: 'schools', across: ['intent|us', 'intent|ca', 'intent|au'] },
      },
      CA: {
        seedKeywords: K(['why move to canada', 'canada immigration 2026', 'canada pr pathways', 'best provinces for immigrants', 'move to canada from africa']),
        statutoryAnchors: ['IRPA (Immigration and Refugee Protection Act)', 'IRPR'],
        authorities: ['IRCC'],
        neighbors: { next: 'schools', across: ['intent|us', 'intent|uk', 'intent|au'] },
      },
      AU: {
        seedKeywords: K(['why move to australia', 'australia immigration 2026', 'australia visa pathways', 'best cities for immigrants australia', 'move to australia from africa']),
        statutoryAnchors: ['Migration Act 1958', 'Migration Regulations 1994'],
        authorities: ['Department of Home Affairs'],
        neighbors: { next: 'schools', across: ['intent|us', 'intent|uk', 'intent|ca'] },
      },
    },
  },
  {
    key: 'schools',
    label: 'Schools & study',
    short: 'Secure education',
    phase: 'consideration',
    funnel: 'top',
    ymyl: 'high',
    intentMix: { informational: 60, commercial: 30, transactional: 10, navigational: 0 },
    services: ['study-permits', 'academic', 'visa'],
    contentTypes: ['regional_page', 'blog_post', 'casework', 'marketplace_landing'],
    proofPoints: ['institution facts', 'tuition figures', 'admission criteria', 'student visa rules', 'case outcomes'],
    countries: {
      US: {
        seedKeywords: K(['f1 visa requirements', 'study in usa for international students', 'us student visa interview questions', 'f1 visa documents checklist', 'apply to us universities from africa']),
        statutoryAnchors: ['INA § 101(a)(15)(F)', '8 CFR 214.2(f)'],
        authorities: ['USCIS', 'SEVP', 'DoS'],
        neighbors: { prev: 'intent', next: 'work', across: ['schools|uk', 'schools|ca', 'schools|au'] },
      },
      UK: {
        seedKeywords: K(['uk student visa requirements', 'study in uk for international students', 'uk student visa application 2026', 'cas letter explained', 'uk universities for african students']),
        statutoryAnchors: ['UK Immigration Rules Part 3 (Students)'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { prev: 'intent', next: 'work', across: ['schools|us', 'schools|ca', 'schools|au'] },
      },
      CA: {
        seedKeywords: K(['canada study permit requirements', 'study in canada for international students', 'canada study permit application 2026', 'designated learning institution canada', 'canadian colleges for african students']),
        statutoryAnchors: ['IRPR s.216–228 (Study permits)'],
        authorities: ['IRCC'],
        neighbors: { prev: 'intent', next: 'work', across: ['schools|us', 'schools|uk', 'schools|au'] },
      },
      AU: {
        seedKeywords: K(['australia student visa subclass 500', 'study in australia for international students', 'australia student visa requirements 2026', 'coe explained australia', 'australian universities for african students']),
        statutoryAnchors: ['Migration Regulations 1994 Sch 2 subclass 500'],
        authorities: ['Department of Home Affairs', 'Department of Education'],
        neighbors: { prev: 'intent', next: 'work', across: ['schools|us', 'schools|uk', 'schools|ca'] },
      },
    },
  },
  {
    key: 'work',
    label: 'Work & career',
    short: 'Secure employment',
    phase: 'consideration',
    funnel: 'middle',
    ymyl: 'high',
    intentMix: { informational: 45, commercial: 40, transactional: 15, navigational: 0 },
    services: ['work-permits', 'career', 'business', 'visa'],
    contentTypes: ['regional_page', 'blog_post', 'casework', 'marketplace_landing', 'faq_hub'],
    proofPoints: ['sponsor lists', 'salary thresholds', 'skills lists', 'job-search tactics', 'post-study work rules'],
    countries: {
      US: {
        seedKeywords: K(['h1b visa requirements', 'h1b sponsorship jobs', 'opt extension rules', 'us work visa options', 'find us employer sponsorship from africa']),
        statutoryAnchors: ['INA § 101(a)(15)(H)', '8 CFR 214.2(h)'],
        authorities: ['USCIS', 'DOL'],
        neighbors: { prev: 'schools', next: 'visa', across: ['work|uk', 'work|ca', 'work|au'] },
      },
      UK: {
        seedKeywords: K(['skilled worker visa requirements', 'uk skilled worker visa 2026', 'uk sponsor licence list', 'health and care visa uk', 'get uk work visa from africa']),
        statutoryAnchors: ['UK Immigration Rules Part 6A (Skilled Worker)'],
        authorities: ['Home Office', 'UKVI', 'DWP'],
        neighbors: { prev: 'schools', next: 'visa', across: ['work|us', 'work|ca', 'work|au'] },
      },
      CA: {
        seedKeywords: K(['canada work permit requirements', 'express entry 2026', 'canada pnp 2026', 'lmia explained canada', 'canada work visa from africa']),
        statutoryAnchors: ['IRPR s.200–209 (Work permits)', 'IRPA'],
        authorities: ['IRCC', 'ESDC'],
        neighbors: { prev: 'schools', next: 'visa', across: ['work|us', 'work|uk', 'work|au'] },
      },
      AU: {
        seedKeywords: K(['subclass 189 visa requirements', 'subclass 190 visa requirements', 'australia skills list 2026', 'australia employer sponsored visa 482', 'get australia work visa from africa']),
        statutoryAnchors: ['Migration Regulations 1994 Sch 2 subclasses 189/190/482'],
        authorities: ['Department of Home Affairs', 'Skills Assessment Authorities'],
        neighbors: { prev: 'schools', next: 'visa', across: ['work|us', 'work|uk', 'work|ca'] },
      },
    },
  },
  {
    key: 'housing',
    label: 'Housing & settling in',
    short: 'Secure housing',
    phase: 'decision',
    funnel: 'middle',
    ymyl: 'medium',
    intentMix: { informational: 40, commercial: 45, transactional: 15, navigational: 0 },
    services: ['settlement', 'business'],
    contentTypes: ['regional_page', 'blog_post', 'casework', 'faq_hub'],
    proofPoints: ['rental market data', 'neighborhood guides', 'tenant rights', 'first-month costs'],
    countries: {
      US: {
        seedKeywords: K(['rent apartment usa for immigrants', 'housing for newcomers usa', 'us tenant rights immigrants', 'cost of living usa 2026', 'find housing in usa from abroad']),
        statutoryAnchors: ['Fair Housing Act'],
        authorities: ['HUD'],
        neighbors: { prev: 'visa', next: 'settlement', across: ['housing|uk', 'housing|ca', 'housing|au'] },
      },
      UK: {
        seedKeywords: K(['rent house uk for immigrants', 'uk rental market newcomers', 'uk tenant rights', 'right to rent explained', 'find housing in uk from abroad']),
        statutoryAnchors: ['Housing Act 1988', 'Right to Rent scheme'],
        authorities: ['Home Office', 'MHCLG'],
        neighbors: { prev: 'visa', next: 'settlement', across: ['housing|us', 'housing|ca', 'housing|au'] },
      },
      CA: {
        seedKeywords: K(['rent apartment canada for immigrants', 'housing for newcomers canada', 'canada tenant rights', 'cost of living canada 2026', 'find housing in canada from abroad']),
        statutoryAnchors: ['Provincial Residential Tenancies Acts'],
        authorities: ['CMHC', 'Provincial bodies'],
        neighbors: { prev: 'visa', next: 'settlement', across: ['housing|us', 'housing|uk', 'housing|au'] },
      },
      AU: {
        seedKeywords: K(['rent house australia for immigrants', 'housing for newcomers australia', 'australia tenant rights', 'cost of living australia 2026', 'find housing in australia from abroad']),
        statutoryAnchors: ['State Residential Tenancies Acts'],
        authorities: ['State authorities', 'AHURI'],
        neighbors: { prev: 'visa', next: 'settlement', across: ['housing|us', 'housing|uk', 'housing|ca'] },
      },
    },
  },
  {
    key: 'visa',
    label: 'Visa & legal pathway',
    short: 'The application itself',
    phase: 'decision',
    funnel: 'bottom',
    ymyl: 'critical',
    intentMix: { informational: 30, commercial: 30, transactional: 40, navigational: 0 },
    services: ['immigration', 'legal-consultation', 'visa', 'credentials'],
    contentTypes: ['regional_page', 'casework', 'marketplace_landing', 'faq_hub'],
    proofPoints: ['exact forms', 'fee schedules', 'processing times', 'document checklists', 'approved case outcomes', 'attorney review'],
    countries: {
      US: {
        seedKeywords: K(['green card application process', 'i-485 adjustment of status', 'us visa application checklist 2026', 'immigration lawyer usa', 'visa denial appeal usa']),
        statutoryAnchors: ['INA', '8 CFR', 'USCIS Policy Manual'],
        authorities: ['USCIS', 'EOIR', 'DOS'],
        neighbors: { prev: 'work', next: 'housing', across: ['visa|uk', 'visa|ca', 'visa|au'] },
      },
      UK: {
        seedKeywords: K(['uk visa application process', 'indefinite leave to remain ilr', 'uk visa documents checklist 2026', 'immigration lawyer uk', 'uk visa refusal appeal']),
        statutoryAnchors: ['UK Immigration Rules', 'Immigration Act 1971'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { prev: 'work', next: 'housing', across: ['visa|us', 'visa|ca', 'visa|au'] },
      },
      CA: {
        seedKeywords: K(['express entry crs calculator', 'canada pr application checklist 2026', 'canadian immigration lawyer', 'canada visa refusal appeal', 'provincial nominee program explained']),
        statutoryAnchors: ['IRPA', 'IRPR'],
        authorities: ['IRCC'],
        neighbors: { prev: 'work', next: 'housing', across: ['visa|us', 'visa|uk', 'visa|au'] },
      },
      AU: {
        seedKeywords: K(['australia visa application process', 'australia pr points test calculator', 'australia visa documents checklist 2026', 'migration agent australia', 'australia visa refusal appeal']),
        statutoryAnchors: ['Migration Act 1958', 'Migration Regulations 1994'],
        authorities: ['Department of Home Affairs', 'MARA'],
        neighbors: { prev: 'work', next: 'housing', across: ['visa|us', 'visa|uk', 'visa|ca'] },
      },
    },
  },
  {
    key: 'settlement',
    label: 'Settlement & integration',
    short: 'Banking, health, documents',
    phase: 'settlement',
    funnel: 'middle',
    ymyl: 'medium',
    intentMix: { informational: 60, commercial: 30, transactional: 10, navigational: 0 },
    services: ['settlement', 'credentials', 'career'],
    contentTypes: ['blog_post', 'regional_page', 'faq_hub', 'casework'],
    proofPoints: ['banking steps', 'healthcare registration', 'driving licence', 'NI/SSN/TFN numbers', 'community resources'],
    countries: {
      US: {
        seedKeywords: K(['social security number for immigrants', 'open bank account usa as immigrant', 'us healthcare for immigrants', 'get drivers license usa immigrant', 'newcomer guide usa']),
        statutoryAnchors: ['SSA regulations', 'State DMV rules'],
        authorities: ['SSA', 'IRS'],
        neighbors: { prev: 'housing', next: 'citizenship', across: ['settlement|uk', 'settlement|ca', 'settlement|au'] },
      },
      UK: {
        seedKeywords: K(['national insurance number uk', 'open bank account uk as immigrant', 'register gp uk immigrant', 'uk driving licence exchange', 'newcomer guide uk']),
        statutoryAnchors: ['National Insurance regulations'],
        authorities: ['HMRC', 'NHS'],
        neighbors: { prev: 'housing', next: 'citizenship', across: ['settlement|us', 'settlement|ca', 'settlement|au'] },
      },
      CA: {
        seedKeywords: K(['sin number canada', 'open bank account canada newcomer', 'health card canada immigrant', 'canada drivers licence exchange', 'newcomer guide canada']),
        statutoryAnchors: ['Canada-Ontario/Provincial agreements'],
        authorities: ['Service Canada', 'CRA'],
        neighbors: { prev: 'housing', next: 'citizenship', across: ['settlement|us', 'settlement|uk', 'settlement|au'] },
      },
      AU: {
        seedKeywords: K(['tax file number australia', 'open bank account australia newcomer', 'medicare australia immigrant', 'australia drivers licence exchange', 'newcomer guide australia']),
        statutoryAnchors: ['Taxation Administration Act 1953'],
        authorities: ['ATO', 'Services Australia'],
        neighbors: { prev: 'housing', next: 'citizenship', across: ['settlement|us', 'settlement|uk', 'settlement|ca'] },
      },
    },
  },
  {
    key: 'citizenship',
    label: 'PR & citizenship',
    short: 'Secure permanent status',
    phase: 'decision',
    funnel: 'bottom',
    ymyl: 'critical',
    intentMix: { informational: 35, commercial: 25, transactional: 40, navigational: 0 },
    services: ['immigration', 'legal-consultation', 'credentials'],
    contentTypes: ['regional_page', 'casework', 'marketplace_landing', 'faq_hub'],
    proofPoints: ['residency requirements', 'language tests', 'citizenship tests', 'fee schedules', 'timelines'],
    countries: {
      US: {
        seedKeywords: K(['naturalization requirements 2026', 'us citizenship test questions', 'green card to citizenship timeline', 'n-400 application guide', 'dual citizenship usa']),
        statutoryAnchors: ['INA § 316 (Naturalization)', '8 CFR Part 312'],
        authorities: ['USCIS'],
        neighbors: { prev: 'settlement', next: 'family', across: ['citizenship|uk', 'citizenship|ca', 'citizenship|au'] },
      },
      UK: {
        seedKeywords: K(['uk citizenship requirements 2026', 'life in uk test practice', 'ilr to citizenship timeline', 'uk naturalisation application guide', 'dual citizenship uk']),
        statutoryAnchors: ['British Nationality Act 1981'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { prev: 'settlement', next: 'family', across: ['citizenship|us', 'citizenship|ca', 'citizenship|au'] },
      },
      CA: {
        seedKeywords: K(['canada citizenship requirements 2026', 'canada citizenship test practice', 'pr to citizenship timeline', 'canada citizenship application guide', 'dual citizenship canada']),
        statutoryAnchors: ['Citizenship Act (RSC 1985, c. C-29)'],
        authorities: ['IRCC'],
        neighbors: { prev: 'settlement', next: 'family', across: ['citizenship|us', 'citizenship|uk', 'citizenship|au'] },
      },
      AU: {
        seedKeywords: K(['australia citizenship requirements 2026', 'australian citizenship test practice', 'pr to citizenship timeline', 'australia citizenship application guide', 'dual citizenship australia']),
        statutoryAnchors: ['Australian Citizenship Act 2007'],
        authorities: ['Department of Home Affairs'],
        neighbors: { prev: 'settlement', next: 'family', across: ['citizenship|us', 'citizenship|uk', 'citizenship|ca'] },
      },
    },
  },
  {
    key: 'family',
    label: 'Family, marriage & children',
    short: 'Bring the family',
    phase: 'loyalty',
    funnel: 'bottom',
    ymyl: 'critical',
    intentMix: { informational: 40, commercial: 25, transactional: 35, navigational: 0 },
    services: ['immigration', 'legal-consultation', 'visa'],
    contentTypes: ['regional_page', 'casework', 'marketplace_landing', 'faq_hub'],
    proofPoints: ['spouse visa rules', 'children's schools', 'family reunification', 'marriage evidence', 'case outcomes'],
    countries: {
      US: {
        seedKeywords: K(['spouse visa usa k1 cr1', 'i-130 family petition guide', 'bring parents to usa green card', 'marriage green card timeline', 'children visa usa']),
        statutoryAnchors: ['INA § 201/203 (Family-based)', '8 CFR 204'],
        authorities: ['USCIS', 'DOS'],
        neighbors: { prev: 'citizenship', next: 'relatives', across: ['family|uk', 'family|ca', 'family|au'] },
      },
      UK: {
        seedKeywords: K(['uk spouse visa requirements 2026', 'uk family visa guide', 'bring parents to uk', 'uk partner visa financial requirement', 'children visa uk']),
        statutoryAnchors: ['UK Immigration Rules Part 8 / Appendix FM'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { prev: 'citizenship', next: 'relatives', across: ['family|us', 'family|ca', 'family|au'] },
      },
      CA: {
        seedKeywords: K(['canada spousal sponsorship 2026', 'canada family sponsorship guide', 'bring parents to canada super visa', 'canada spouse visa processing time', 'children visa canada']),
        statutoryAnchors: ['IRPR s.116–137 (Family class)'],
        authorities: ['IRCC'],
        neighbors: { prev: 'citizenship', next: 'relatives', across: ['family|us', 'family|uk', 'family|au'] },
      },
      AU: {
        seedKeywords: K(['australia partner visa 820 801', 'australia family sponsorship guide', 'bring parents to australia 870', 'australia spouse visa requirements', 'children visa australia']),
        statutoryAnchors: ['Migration Regulations 1994 Sch 2 subclasses 820/801/870'],
        authorities: ['Department of Home Affairs'],
        neighbors: { prev: 'citizenship', next: 'relatives', across: ['family|us', 'family|uk', 'family|ca'] },
      },
    },
  },
  {
    key: 'relatives',
    label: 'Moving relatives',
    short: 'Extend to extended family',
    phase: 'loyalty',
    funnel: 'bottom',
    ymyl: 'high',
    intentMix: { informational: 45, commercial: 25, transactional: 30, navigational: 0 },
    services: ['immigration', 'visa', 'legal-consultation'],
    contentTypes: ['blog_post', 'casework', 'marketplace_landing', 'faq_hub'],
    proofPoints: ['sibling sponsorship', 'parent visas', 'dependent rules', 'financial support evidence'],
    countries: {
      US: {
        seedKeywords: K(['sibling green card petition', 'bring brother sister to usa', 'us parent visa options', 'family based visa backlog', 'f2a f4 visa categories']),
        statutoryAnchors: ['INA § 203(a) (Family preferences)'],
        authorities: ['USCIS', 'DOS'],
        neighbors: { prev: 'family', across: ['relatives|uk', 'relatives|ca', 'relatives|au'] },
      },
      UK: {
        seedKeywords: K(['bring siblings to uk', 'uk adult dependent relative visa', 'bring extended family to uk', 'uk family reunion rules', 'dependant visa uk']),
        statutoryAnchors: ['UK Immigration Rules Appendix FM / Appendix Adult Dependent Relative'],
        authorities: ['Home Office', 'UKVI'],
        neighbors: { prev: 'family', across: ['relatives|us', 'relatives|ca', 'relatives|au'] },
      },
      CA: {
        seedKeywords: K(['canada siblings sponsorship', 'bring parents grandparents to canada', 'canada super visa 2026', 'canada dependent child sponsorship', 'family class canada']),
        statutoryAnchors: ['IRPR s.116–137', 'IRPR s. 220 (Super visa)'],
        authorities: ['IRCC'],
        neighbors: { prev: 'family', across: ['relatives|us', 'relatives|uk', 'relatives|au'] },
      },
      AU: {
        seedKeywords: K(['australia sibling visa', 'bring parents to australia permanently', 'australia aged parent visa', 'australia dependent relative visa', 'family stream australia']),
        statutoryAnchors: ['Migration Regulations 1994 Sch 2 subclass 103/804'],
        authorities: ['Department of Home Affairs'],
        neighbors: { prev: 'family', across: ['relatives|us', 'relatives|uk', 'relatives|ca'] },
      },
    },
  },
]

export const STAGE_ORDER = LIFECYCLE_STAGES.map((s) => s.key)

export function getStage(stage: string): LifecycleStageDef | undefined {
  return LIFECYCLE_STAGES.find((s) => s.key === stage)
}

export function getCell(stage: string, country: Country): CountryCell | undefined {
  return getStage(stage)?.countries[country]
}

export function cellId(stage: string, country: Country): string {
  return `${stage}|${country.toLowerCase()}`
}

export function isCountry(c: string): c is Country {
  return COUNTRIES.includes(c as Country)
}

/**
 * Distribution map — which estate repo hosts which content type.
 * Mirrors the estate layout in docs/SEO_OPTIMAL_STACK.md:
 *   legal → caseworks (page.tsx) · usa|uk|ca|au|apex → yousafe-consultancy (*.md)
 *   market → portal catalogue (*.mdx) · apex → regional micro-sites
 */
export const ESTATE_REPOS: Record<ContentType, { repo: string; path: string }> = {
  regional_page: { repo: 'yousafe-consultancy', path: 'content/regions' },
  blog_post: { repo: 'yousafe-consultancy', path: 'content/blog' },
  casework: { repo: 'caseworks', path: 'app' },
  marketplace_landing: { repo: 'portal-catalogue', path: 'content/marketplace' },
  faq_hub: { repo: 'yousafe-consultancy', path: 'content/faq' },
}

export interface EstateTarget {
  repo: string
  path: string
  contentType: ContentType
}

export function targetsFor(stage: LifecycleStageDef, country: Country): EstateTarget[] {
  return stage.contentTypes.map((ct) => {
    const base = ESTATE_REPOS[ct]
    return { repo: base.repo, path: `${base.path}/${country.toLowerCase()}`, contentType: ct }
  })
}

/** Stage → primary marketplace category mapping for CTA surfaces. */
export function primaryServiceFor(stage: LifecycleStageDef): string {
  return stage.services[0] || 'consultation'
}
