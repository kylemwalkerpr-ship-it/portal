/**
 * Durable related[] / sources[] fillers for SEO Factory → caseworks page.tsx.
 *
 * caseworks `scripts/check-article-quality.mjs` fails Deploy Caseworks when:
 *   - const related = []
 *   - related slugs are not in seo-batch-0{1,2}-link-map
 *   - hero.kicker is "SEO Factory"
 *   - openGraph/twitter title+description verbatim-copy top-level metadata
 *
 * This module keeps a curated allowlist of REGISTERED batch-map slugs and
 * picks topic-relevant ones so factory ships pass the quality gate without
 * inventing destinations.
 */
import { sourcesForBrief, type OfficialSource } from './officialSources'

/** Registered caseworks RelatedRef slugs (must exist in seo-batch link maps). */
const RELATED_BY_COUNTRY: Record<'us' | 'uk' | 'ca' | 'au', string[]> = {
  us: [
    'f1-visa-rights-international-student-complete-guide',
    'f1-document-checklist-2026',
    'f1-interview-prep-checklist',
    'us-student-visa-interview-preparation-checklist',
    'f1-visa-travel-rules-while-opt-pending',
    'f1-visa-status-violation-what-to-do',
    'f1-rejection-recovery',
    'f1-status-violation',
    'f1-to-f2-dependants',
    'f1-school-transfer-mid-program',
    'sevis-termination-and-reinstatement',
    'cpt-vs-opt',
    'cpt-authorization-letter',
    'cpt-authorization-letter-attorney-review',
    'day-1-cpt-risk',
    'opt-stem-opt-complete-guide',
    'opt-document-checklist',
    'opt-90-day-unemployment-cap',
    'opt-ead-replacement',
    'opt-travel-rules',
    'i-765-opt-common-mistakes',
    'stem-opt-extension-checklist',
    'stem-opt-e-verify',
    'stem-opt-job-change',
    'cap-gap-extension-explained-2026',
    'f1-cap-gap',
    'cap-exempt-h-1b',
    'h-1b-visa',
    'h-1b-processing-time',
    'form-i-129',
    'i-140-petition',
    'family-green-card',
    'marriage-green-card-checklist',
    'diy-green-card-application-vs-attorney',
    'n400-naturalization',
    'naturalization-eligibility',
    'us-immigration-visa',
    'us-embassy-interview',
    'boundless-immigration',
    'legal-document-review',
    'immigration-lawyer-fees',
    'international-student-housing-deposit-dispute-letter',
    'international-student-llc-on-opt-guide',
    'estimated-tax-payment-help',
  ],
  uk: [
    'uk-spouse-visa-document-checklist-2026',
    'uk-spouse-visa-financial-requirement-2026',
    'ilr-from-spouse-visa-document-guide',
    'uk-family-visas-pillar-guide',
    'spouse-visa-refusal-reasons',
    'spouse-visa-checklist-2026',
    'family-visa-parent-route',
    'uk-immigration-ilr-pillar-guide',
    'ilr-continuous-residence',
    'naturalisation-life-in-uk',
    'uk-graduate-visa-requirements',
    'skilled-worker-dependents-2026',
    'nhs-surcharge-2026',
    'brp-replacement',
    'administrative-review-letter-template-uk',
    'uk-tenancy-renters-rights-act-2025-student-guide',
    'uk-renters-rights-act-2025-complete-guide',
    'section-21-abolished-meaning-for-students',
    'deposit-dispute-letter-uk-tenant',
    'student-tenancy-agreement-review-uk',
    'renters-rights-international-students',
    'periodic-tenancy-rights-students-uk-2026',
  ],
  ca: [
    'express-entry-crs-calculator-walkthrough-2026',
    'express-entry-crs-calculator',
    'express-entry-document-checklist-2026',
    'canada-express-entry-stem-category-occupations-list-2026',
    'canada-express-entry-stem-occupations-2026-official',
    'lmia-application-document-preparation-canada',
    'canada-spousal-sponsorship-document-checklist-2026',
    'canada-spouse-visa-documents-required',
    'canada-spouse-visa-2024',
    'study-permit-document-checklist',
  ],
  au: [
    'temporary-graduate-485-checklist',
    '485-visa-document-checklist',
    '485-pte-requirement',
    '485-visa-ielts-general-or-academic',
    'english-language-requirements-student-485',
    'australia-student-visa-restrictions',
    'subclass-189',
  ],
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'your', 'guide', 'complete', 'checklist',
  'document', 'documents', 'visa', 'visas', 'student', 'students', 'requirements',
  'application', 'process', 'what', 'how', 'why', '2024', '2025', '2026', 'page',
])

function tokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
}

function scoreSlug(slug: string, hay: Set<string>): number {
  const parts = slug.toLowerCase().split(/[-_]+/).filter((t) => t.length >= 2 && !STOP.has(t))
  let score = 0
  for (const p of parts) {
    if (hay.has(p)) score += 3
    else if ([...hay].some((h) => h.includes(p) || p.includes(h))) score += 1
  }
  return score
}

export function pickCaseworksRelatedSlugs(opts: {
  country: 'us' | 'uk' | 'ca' | 'au'
  slug: string
  title?: string
  primaryKeyword?: string
  topic?: string
  limit?: number
}): string[] {
  const limit = Math.max(2, Math.min(opts.limit ?? 4, 6))
  const pool = RELATED_BY_COUNTRY[opts.country] || RELATED_BY_COUNTRY.us
  const self = String(opts.slug || '').toLowerCase()
  const hay = new Set([
    ...tokens(opts.title || ''),
    ...tokens(opts.primaryKeyword || ''),
    ...tokens(opts.topic || ''),
    ...tokens(self.replace(/[-_]+/g, ' ')),
  ])
  const ranked = pool
    .filter((s) => s.toLowerCase() !== self)
    .map((s) => ({ s, score: scoreSlug(s, hay) }))
    .sort((a, b) => b.score - a.score || a.s.localeCompare(b.s))

  const picked: string[] = []
  for (const row of ranked) {
    if (picked.length >= limit) break
    if (row.score <= 0 && picked.length >= 2) continue
    picked.push(row.s)
  }
  // Always fill to at least 2 from country pool when topic overlap is thin.
  for (const s of pool) {
    if (picked.length >= Math.min(3, limit)) break
    if (s.toLowerCase() === self) continue
    if (!picked.includes(s)) picked.push(s)
  }
  return picked.slice(0, limit)
}

/** Short reader-facing hero kicker — never "SEO Factory". */
export function caseworksHeroKicker(title: string, slug: string): string {
  const fromTitle = String(title || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/[:|–—].*$/, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = fromTitle.split(' ').filter(Boolean)
  let phrase = ''
  if (words.length >= 2) {
    // Prefer the distinctive tail (e.g. "Unemployment Cap", "Document Checklist")
    phrase = words.slice(-3).join(' ')
    if (phrase.length > 42) phrase = words.slice(-2).join(' ')
  }
  if (!phrase || /^seo factory$/i.test(phrase)) {
    const slugWords = String(slug || '')
      .split(/[-_]+/)
      .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()) && !/^20\d{2}$/.test(w))
    phrase = slugWords.slice(-3).join(' ')
  }
  phrase = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() && w.length <= 4 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .slice(0, 48)
  return phrase || 'Guide'
}

export function pickCaseworksSources(opts: {
  region: string
  title?: string
  primaryKeyword?: string
  topic?: string
  limit?: number
}): Array<{ title: string; url: string }> {
  const limit = Math.max(2, Math.min(opts.limit ?? 3, 5))
  const bank: OfficialSource[] = sourcesForBrief({
    region: opts.region,
    topic: opts.topic,
    keywords: [opts.primaryKeyword || '', opts.title || ''].filter(Boolean),
    body: opts.title,
  })
  return bank.slice(0, limit).map((s) => ({ title: s.title, url: s.url }))
}

export function formatRelatedRefsTs(slugs: string[]): string {
  if (!slugs.length) return '[]'
  return `[${slugs.map((s) => `{ slug: ${JSON.stringify(s)} }`).join(', ')}]`
}

export function formatSourceRefsTs(sources: Array<{ title: string; url: string }>): string {
  if (!sources.length) return '[]'
  return `[${sources.map((s) => `{ title: ${JSON.stringify(s.title)}, url: ${JSON.stringify(s.url)} }`).join(', ')}]`
}
