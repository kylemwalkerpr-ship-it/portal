/**
 * SEO utility functions for gig content optimization.
 *
 * This module is a thin compatibility wrapper around the holistic
 * scoring engine in lib/seoAudit.ts. It exists so legacy callers
 * (the previous field-by-field analytics modal, the inline editor,
 * unit tests written against the SEOScoreResult shape) keep working
 * — but the actual scoring path now traverses the same 10-factor
 * audit the new analytics modal renders.
 *
 * If you're writing new code, prefer importing `runSeoAudit` from
 * `lib/seoAudit.ts` directly — the AuditResult shape carries the
 * cluster coverage map, intent diversity, schema readiness, E-E-A-T,
 * live GSC alignment, and voice-hygiene data the legacy SEOCheck
 * shape can't represent.
 */

import { runSeoAudit, type AuditGig, type AuditRole, type SellerCredibility, type SiblingGig } from './seoAudit'
import type { LiveKeywordSignal } from './gscKeywordSignals'
import { STRATEGIC_KEYWORDS, getStrategicKeywordsForGig } from './seoKnowledgeBase'

// Legacy category-keyword map. Retained as a fallback when the
// taxonomy + strategy bank doesn't yield a match — pre-existing
// callers in lib/seoResearch.ts rely on this.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'study-permit':       ['study permit', 'student visa', 'study abroad', 'visa application', 'document review', 'F-1 visa', 'I-20', 'SEVIS'],
  'visa':               ['visa application', 'visa assistance', 'travel visa', 'visa interview', 'visa documents', 'visa appeal', 'visa denial'],
  'legal-consultation': ['legal advice', 'legal review', 'lawyer consultation', 'legal documents', 'contract review', 'attorney advice', 'document drafting'],
  'academic':           ['university application', 'admission help', 'college essay', 'statement of purpose', 'academic writing', 'application review', 'sop editing'],
  'career':             ['resume review', 'cv writing', 'job search', 'interview prep', 'cover letter', 'linkedin profile', 'career coaching'],
  'business':           ['business plan', 'company formation', 'llc formation', 'business registration', 'corporate documents', 'business advice'],
  'immigration': [
    'immigration lawyer', 'immigration help', 'green card', 'visa process',
    'residence permit', 'citizenship', 'naturalization', 'USCIS',
    'family-based immigration', 'work visa', 'H-1B', 'I-130',
  ],
  'settlement':   ['relocation help', 'housing setup', 'social security number', 'bank account setup', 'driver license', 'newcomer support'],
  'credentials':  ['credential evaluation', 'foreign degree assessment', 'WES evaluation', 'transcript verification', 'license recognition'],
  'mentorship':   ['career mentor', 'mentorship program', 'professional guidance', 'industry mentor', 'one on one coaching'],
  'general':      ['professional service', 'expert advice', 'document review', 'consultation', 'online service'],
}

export function getKeywordsForCategory(category = ''): string[] {
  if (!category) return CATEGORY_KEYWORDS.general
  const key = category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  for (const [pattern, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (key.includes(pattern) || pattern.includes(key)) return keywords
  }
  return CATEGORY_KEYWORDS.general
}

// Pull the strategic keyword bag for a (category × subcategory × jurisdiction × role)
// tuple. Re-exported so callers that need the canonical knowledge-base view (instead
// of the legacy substring bank) can reach it through one import.
export function getStrategicKeywordsFor(opts: {
  category: string
  subcategory?: string
  jurisdiction: string
  role: AuditRole
}): string[] {
  const strategic = getStrategicKeywordsForGig(opts)
  if (strategic.length > 0) return strategic.map((k) => k.term)
  return STRATEGIC_KEYWORDS.slice(0, 6).map((k) => k.term)
}

export function countKeywordDensity(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  const matches = keywords.filter((kw) => lower.includes(kw.toLowerCase()))
  return matches.length
}

// ---------------------------------------------------------------------
// Legacy SEOData / SEOScoreResult shape. Preserved so the dashboard
// fallback cards and any old callers keep type-checking. The computed
// `checks` array is derived from the holistic audit's findings, so the
// scoring stays in lockstep with the new modal even when consumers
// haven't migrated.

export interface SEOData {
  title: string
  pitch: string
  description: string
  tags: string[]
  seo_title: string
  seo_description: string
  category: string
  jurisdiction: string
  subcategory?: string
  role?: AuditRole
  faq?: Array<{ question?: string; answer?: string }>
  tiers?: Array<{ tier?: string; price?: number; delivery_days?: number; features?: string[] }>
}

export interface SEOCheck {
  label: string
  passed: boolean
  weight: number
  hint: string
}

export interface SEOScoreResult {
  score: number
  checks: SEOCheck[]
}

export interface ComputeSEOScoreExtras {
  role?: AuditRole
  seller?: SellerCredibility | null
  siblings?: SiblingGig[] | null
  gscSignals?: LiveKeywordSignal[] | null
  gigId?: string
}

export function computeSEOScore(data: SEOData, extras: ComputeSEOScoreExtras = {}): SEOScoreResult {
  const role: AuditRole = extras.role ?? data.role ?? 'consultant'
  const gig: AuditGig = {
    id: extras.gigId ?? 'inline',
    title: data.title || null,
    pitch: data.pitch || null,
    description: data.description || null,
    tags: data.tags ?? [],
    category: data.category || null,
    subcategory: data.subcategory || null,
    jurisdiction: data.jurisdiction || null,
    seo_title: data.seo_title || null,
    seo_description: data.seo_description || null,
    faq: data.faq ?? null,
    tiers: data.tiers ?? null,
  }
  const audit = runSeoAudit({
    gig,
    role,
    seller: extras.seller ?? null,
    siblings: extras.siblings ?? null,
    gscSignals: extras.gscSignals ?? null,
  })

  // Project each section into the legacy SEOCheck shape so the old
  // dashboard renderer (and any unit test snapshots) still works.
  // Section score >= 70 = passed; weight maps to the audit section's
  // weight scaled to ~100 (sum across all enabled sections).
  const totalWeight = audit.sections.reduce((sum, s) => sum + s.weight, 0)
  const checks: SEOCheck[] = audit.sections.map((s) => ({
    label: s.label,
    passed: s.score >= 70,
    weight: Math.round((s.weight / Math.max(1, totalWeight)) * 100),
    hint: s.findings.find((f) => f.kind !== 'ok')?.detail
      || s.findings.find((f) => f.kind !== 'ok')?.label
      || s.summary,
  }))

  return { score: audit.overall, checks }
}
