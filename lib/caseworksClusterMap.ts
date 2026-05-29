// Inverse of caseworks/lib/marketplaceClusterMap.ts.
// Each marketplace category id maps to a caseworks cluster + a small,
// hand-picked set of canonical caseworks article slugs (relative paths
// under https://legal.yousafeconsultancy.com). This drives the "Read more
// from MyCaseworks" rail on /marketplace/categories/[categoryId] and the
// ItemList JSON-LD on those pages.
//
// Slugs are chosen for editorial quality + topical relevance, not
// freshness; they will be revisited when caseworks ships its next batch
// of pillar articles or thin-article rewrites.

export interface CaseworksRailItem {
  title: string
  path: string // e.g. "/us/cpt-vs-opt"
}

export interface CaseworksCategoryMapping {
  cluster: string
  items: CaseworksRailItem[]
}

const LEGAL_HOST = 'https://legal.yousafeconsultancy.com'

const MAP: Record<string, CaseworksCategoryMapping> = {
  immigration: {
    cluster: 'Canadian immigration',
    items: [
      { title: 'Canada Express Entry CRS calculator walkthrough', path: '/ca/express-entry-crs-calculator' },
      { title: 'Canada PGWP eligibility: 2026 rule changes', path: '/ca/pgwp-eligibility-2026' },
      { title: 'Canada Express Entry document checklist 2026', path: '/ca/express-entry-document-checklist-2026' },
      { title: 'Canada Atlantic Immigration Program', path: '/ca/atlantic-immigration-program' },
    ],
  },
  'study-permits': {
    cluster: 'International students',
    items: [
      { title: 'F-1 document checklist 2026', path: '/us/f1-document-checklist-2026' },
      { title: 'F-1 visa interview prep checklist', path: '/us/f1-visa-interview-prep-checklist' },
      { title: 'F-1 visa rejection recovery', path: '/us/f1-visa-rejection-recovery' },
      { title: 'UK Student route eligibility 2026', path: '/uk/student-route-eligibility-2026' },
    ],
  },
  'work-permits': {
    cluster: 'International students',
    items: [
      { title: 'OPT document checklist 2026', path: '/us/opt-document-checklist-2026' },
      { title: 'OPT application mistakes', path: '/us/opt-application-mistakes' },
      { title: 'STEM OPT extension checklist 2026', path: '/us/stem-opt-extension-checklist-2026' },
      { title: 'UK Graduate Route visa', path: '/uk/graduate-route-visa' },
    ],
  },
  'pr-immigration': {
    cluster: 'Canadian immigration',
    items: [
      { title: 'Canada Express Entry CRS calculator walkthrough', path: '/ca/express-entry-crs-calculator' },
      { title: 'Canada PNP comparison: ON vs BC vs AB', path: '/ca/pnp-ontario-bc-alberta' },
      { title: 'Canada Express Entry STEM category 2026', path: '/ca/express-entry-stem-category-2026' },
      { title: 'Canada Express Entry French-speaking pathway', path: '/ca/express-entry-french-pathway' },
    ],
  },
  'family-sponsorship': {
    cluster: 'Family and permanent residence',
    items: [
      { title: 'Canada PGP program', path: '/ca/pgp-program' },
      { title: 'Canada spousal sponsorship: inland vs outland', path: '/ca/spousal-sponsorship-inland-outland' },
      { title: 'Canada OWP for spouses 2026', path: '/ca/owp-spouses-2026' },
      { title: 'Canada spousal sponsorship document checklist', path: '/ca/spousal-sponsorship-document-checklist' },
    ],
  },
  citizenship: {
    cluster: 'Citizenship and settlement',
    items: [
      { title: 'Canada citizenship test 2026', path: '/ca/citizenship-test-2026' },
    ],
  },
  settlement: {
    cluster: 'Tenancy and housing',
    items: [
      { title: 'UK Renters Rights Act 2025: complete guide', path: '/uk/tenancy/uk-renters-rights-act-2025-complete-guide' },
      { title: 'UK Section 21 abolished: meaning for students', path: '/uk/tenancy/section-21-abolished-meaning-for-students' },
      { title: 'UK deposit dispute letter for tenants', path: '/uk/tenancy/deposit-dispute-letter-uk-tenant' },
      { title: 'Canada banking guide for students', path: '/ca/banking-students' },
    ],
  },
  education: {
    cluster: 'International students',
    items: [
      { title: 'F-1 visa community college guide', path: '/us/f1-visa-community-college' },
      { title: 'F-1 school transfer rules', path: '/us/f1-school-transfer' },
      { title: 'UK NHS surcharge 2026', path: '/uk/nhs-surcharge-2026' },
    ],
  },
}

export function getCaseworksMapping(categoryId: string): CaseworksCategoryMapping | null {
  return MAP[categoryId] ?? null
}

export function getCaseworksItemListJsonLd(categoryId: string): Record<string, unknown> | null {
  const m = getCaseworksMapping(categoryId)
  if (!m) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Editorial guides from MyCaseworks · ${m.cluster}`,
    itemListElement: m.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${LEGAL_HOST}${it.path}/`,
      name: it.title,
    })),
  }
}

export { LEGAL_HOST as CASEWORKS_HOST }
