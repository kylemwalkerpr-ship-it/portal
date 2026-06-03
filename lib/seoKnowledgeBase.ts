// Sitewide SEO knowledge base — distilled from
// /SEO strategies/SEO_STRATEGY_Q3_2026.md (June-Aug 2026, owner: YouSafe
// Consultancy SEO team + Claude Code). This file is the single source
// of truth for the strategy directives injected into the AI gig-draft
// prompts. When the quarterly plan is refreshed, edit THIS file — every
// downstream prompt picks up the change automatically.
//
// Two consumers:
//   1. lib/seoResearch.ts — merges STRATEGIC_KEYWORDS into the priority
//      ranking with source='strategic'. Strategic terms are SEO-team-
//      curated quarterly targets, so they outrank generic 'intent'
//      modifiers but sit below live GSC signals (when available) and
//      taxonomy-anchored category keywords.
//   2. lib/seoSuggest.ts — emits getStrategyDirectivesBlock() inside
//      buildBaseContext so the LLM sees the banned-phrase list, the
//      5-question test, length gates, and the freshness rule on
//      EVERY field draft.

import type { Jurisdiction } from './seoResearch'

// Clusters from §1 of the strategy doc. A cluster is a topical
// authority pillar; gigs in adjacent taxonomy categories ride its
// coattails for SEO purposes (e.g. an SOP-writing gig in the US is
// adjacent to the F-1/OPT cluster and should reference USCIS-aligned
// policy timing if relevant).
export type Cluster =
  | 'uk-tenancy'
  | 'us-f1-opt'
  | 'canada-sp-pgwp'
  | 'us-work'      // H-1B + EB-2 NIW
  | 'uk-work'      // Skilled worker
  | 'canada-pr'    // Express Entry + family
  | 'us-pr'        // EB-2 NIW after OPT
  | 'compare'      // Cross-country comparison content
  | 'academic-writing-essay'
                   // Commercial-intent academic-writing keywords —
                   // competitor-mapped (essaypro.com et al). Not in the
                   // Q3 strategy doc because the canonical-content plan
                   // is legal/immigration-focused; this cluster
                   // augments it for the consultant marketplace surface
                   // where academic-writing gigs need essay-service
                   // commercial-intent vocabulary to rank against
                   // established competitors.

export interface StrategicKeyword {
  // The exact phrase to surface in priority lists. Verbatim from the
  // strategy doc — these are the 20 "fastest ranking" keywords picked
  // for the quarter, not LLM-generated.
  term: string
  cluster: Cluster
  intent: 'informational' | 'commercial' | 'transactional'
  // Whether this keyword is on the public marketplace surface (gig
  // titles/descriptions can earn these) or strictly canonical-content
  // (legal canonicals on legal.yousafeconsultancy.com / caseworks).
  // 'either' = both surfaces compete fairly.
  surface: 'marketplace' | 'canonical' | 'either'
  // The quarter month this keyword was prioritized in. Surfaces
  // freshness on the prompt: month-1 keywords ride breaking 2026
  // policy waves and should be hit FAST.
  month: 1 | 2 | 3
}

// The 20 target keywords from §3 of the strategy doc. Tagged with
// cluster + intent + surface so the gig-draft path can pull the
// relevant subset for the seller's category/jurisdiction.
export const STRATEGIC_KEYWORDS: StrategicKeyword[] = [
  // Month 1 — policy urgency
  { term: 'Section 21 abolished May 2026 student tenants',         cluster: 'uk-tenancy',     intent: 'informational', surface: 'either',      month: 1 },
  { term: 'Renters Rights Act 2026 international students UK',     cluster: 'uk-tenancy',     intent: 'informational', surface: 'either',      month: 1 },
  { term: 'F-1 duration of status proposed change 2026',           cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 1 },
  { term: 'STEM OPT employer monitoring site visit 2026',          cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 1 },
  { term: 'Canada study permit cap 2026 India Nigeria',            cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 1 },
  { term: 'PGWP field of study requirements 2026 diploma',         cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 1 },
  { term: 'PAL TAL exempt graduate programs Canada 2026',          cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'canonical',   month: 1 },
  // Month 2 — topical depth & pain points
  { term: 'OPT 90 day unemployment cap grace period strategy',     cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 2 },
  { term: 'SEVIS termination reinstatement timeline 2026',         cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Study permit refusal reapply Canada 2026',              cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 2 },
  { term: 'H-1B lottery 2026 registration deadline employer',      cluster: 'us-work',        intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Day 1 CPT risks 2026 legitimate programs',              cluster: 'us-f1-opt',      intent: 'informational', surface: 'canonical',   month: 2 },
  { term: 'UK skilled worker visa salary threshold 2026',          cluster: 'uk-work',        intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Canada Express Entry CRS international student graduates', cluster: 'canada-pr',   intent: 'informational', surface: 'either',      month: 2 },
  // Month 3 — long-tail monetization
  { term: 'F-1 student health insurance USA Canada UK comparison 2026', cluster: 'compare',   intent: 'commercial',    surface: 'either',      month: 3 },
  { term: 'International student housing deposit dispute letter template', cluster: 'uk-tenancy', intent: 'transactional', surface: 'either',  month: 3 },
  { term: 'Spousal open work permit Canada study permit 2026',     cluster: 'canada-pr',      intent: 'informational', surface: 'either',      month: 3 },
  { term: 'EB-2 NIW green card STEM OPT students 2026',            cluster: 'us-pr',          intent: 'informational', surface: 'either',      month: 3 },
  { term: 'Canada study permit financial proof GIC vs bank statement 2026', cluster: 'canada-sp-pgwp', intent: 'commercial', surface: 'either', month: 3 },
  { term: 'F-1 visa interview questions Lagos Mumbai Nairobi London 2026', cluster: 'us-f1-opt', intent: 'informational', surface: 'canonical', month: 3 },
  // --- Academic-writing-essay cluster ---
  // Competitor-derived (essaypro.com and adjacent essay-service
  // marketplaces). All commercial-intent, surface=marketplace, month
  // tagged as 1 so they're always in scope regardless of the
  // quarterly-month filter. Intentionally EXCLUDES academically-
  // dishonest terms ("write my essay", "buy essay online", "cheap
  // essay writing service") — Google's helpful-content updates
  // penalize sites ranking for those, and YouSafe consultants
  // deliver editing / coaching / review, not finished papers.
  { term: 'personal statement help',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college essay help',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'admissions essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay editing service',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay proofreading',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic editing service',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay review service',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'common app essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'supplemental essay help',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'scholarship essay help',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'sop writing service',                     cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'statement of purpose help',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'graduate school personal statement',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'med school personal statement help',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'law school personal statement help',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba essay help',                          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'thesis editing service',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'dissertation editing',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'research paper review',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic writing coach',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'admissions consultant',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college application essay coach',         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ivy league essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay structure help',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
]

// Map a taxonomy category + jurisdiction to the relevant strategy
// cluster(s). The mapping is ROLE-AWARE because the same category
// means different things for attorneys vs consultants:
//
//   ATTORNEY: a "legal" or "immigration" gig genuinely sells the
//   policy outcome the strategy cluster targets. Broad mapping is
//   correct — an attorney offering education-category services for
//   the US is doing student-visa work, which is the F-1/OPT cluster.
//
//   CONSULTANT: an "academic-writing" or "education" gig is selling
//   SOPs, essays, admissions support — NOT immigration policy
//   guidance. Surfacing the F-1/OPT cluster's policy keywords (STEM
//   OPT employer monitoring, F-1 duration of status, SEVIS) on a
//   non-legal academic-writing gig drowns out the actual subcategory
//   vocabulary (SOP, personal statement, scholarship essay) and
//   produces incoherent titles. So consultant mapping is tight:
//   only categories where the buyer intent genuinely overlaps with
//   the strategy cluster (settlement+UK tenancy is the one clean
//   overlap; everything else gets none and falls back to taxonomy
//   keywords alone).
//
// When the lookup returns no clusters, the strategy signals collapse
// to an empty list and the prompt is still fully grounded by
// taxonomy keywords + the playbook rules.

type ClusterMap = Record<string, Partial<Record<Exclude<Jurisdiction, ''>, Cluster[]>>>

const CATEGORY_TO_CLUSTERS_ATTORNEY: ClusterMap = {
  immigration:        { us: ['us-f1-opt', 'us-work', 'us-pr'], uk: ['uk-work'],     ca: ['canada-sp-pgwp', 'canada-pr'] },
  education:          { us: ['us-f1-opt'],                     uk: [],              ca: ['canada-sp-pgwp'] },
  'academic-writing': { us: ['us-f1-opt'],                     uk: [],              ca: ['canada-sp-pgwp'] },
  legal:              { us: ['us-f1-opt', 'us-work', 'us-pr'], uk: ['uk-tenancy', 'uk-work'], ca: ['canada-sp-pgwp', 'canada-pr'] },
  settlement:         { us: [],                                uk: ['uk-tenancy'],  ca: [] },
  career:             { us: ['us-f1-opt', 'us-work'],          uk: ['uk-work'],     ca: ['canada-pr'] },
  business:           { us: ['us-work'],                       uk: ['uk-work'],     ca: ['canada-pr'] },
  credentials:        { us: ['us-work'],                       uk: ['uk-work'],     ca: ['canada-pr'] },
  mentorship:         { us: ['us-f1-opt'],                     uk: [],              ca: ['canada-sp-pgwp'] },
}

const CATEGORY_TO_CLUSTERS_CONSULTANT: ClusterMap = {
  // Categories where consultant buyer-intent genuinely overlaps with
  // a strategy cluster. The mapping is intentionally tighter than the
  // attorney side because consultant gigs ARE NOT selling the
  // policy outcomes the immigration clusters target.
  //
  // - academic-writing + education: the academic-writing-essay
  //   cluster (competitor-mapped against essaypro.com and adjacent
  //   essay-service marketplaces). Commercial-intent vocabulary the
  //   consultant marketplace surface needs to compete in this niche.
  //   Applies to ALL three jurisdictions since admissions essay
  //   help, SOP writing, etc. are universal services.
  // - settlement + UK: uk-tenancy housing-law cluster, which the
  //   housing-help consultant directly serves.
  // - everything else: no strategic keywords; taxonomy leads alone.
  'academic-writing': {
    us: ['academic-writing-essay'],
    uk: ['academic-writing-essay'],
    ca: ['academic-writing-essay'],
  },
  education: {
    us: ['academic-writing-essay'],
    uk: ['academic-writing-essay'],
    ca: ['academic-writing-essay'],
  },
  mentorship: {
    us: ['academic-writing-essay'],
    uk: ['academic-writing-essay'],
    ca: ['academic-writing-essay'],
  },
  settlement: { us: [], uk: ['uk-tenancy'], ca: [] },
}

export interface GetStrategicKeywordsOpts {
  category: string
  subcategory?: string
  jurisdiction: string
  // Role determines surface eligibility. Consultants get marketplace
  // + either surface; attorneys get all three. This matches the
  // role-aware split in lib/seoResearch.ts.
  role: 'attorney' | 'consultant'
  // Optional: limit the slice to a specific quarterly month (1, 2, 3).
  // Default — return ALL months; the consumer ranks by month later if
  // it wants freshness preference.
  month?: 1 | 2 | 3
}

export function getStrategicKeywordsForGig(opts: GetStrategicKeywordsOpts): StrategicKeyword[] {
  const jx = (String(opts.jurisdiction || '').trim().toLowerCase()) as Exclude<Jurisdiction, ''>
  const cat = String(opts.category || '').trim().toLowerCase()
  const sub = String(opts.subcategory || '').trim().toLowerCase()
  if (jx !== 'us' && jx !== 'uk' && jx !== 'ca') return []
  const clusterMap = opts.role === 'consultant' ? CATEGORY_TO_CLUSTERS_CONSULTANT : CATEGORY_TO_CLUSTERS_ATTORNEY
  const clusters = clusterMap[cat]?.[jx] ?? []
  if (clusters.length === 0) return []
  const clusterSet = new Set(clusters)
  const surfaceFilter = opts.role === 'consultant' ? new Set(['marketplace', 'either']) : new Set(['marketplace', 'canonical', 'either'])

  // Subcategory-affinity boosting. When the seller picked a specific
  // subcategory (e.g. sop-writing, scholarship-essays, application-
  // essays), prefer strategic keywords whose term contains one of
  // the subcategory's anchor tokens. Without this the slice(0, N) cap
  // picks generic cluster keywords ("personal statement help" wins
  // every time) and SOP-specific gigs miss the SOP-specific
  // commercial-intent terms ("sop writing service", "statement of
  // purpose help") that would actually compete for the seller's
  // narrowest audience.
  const subTokens = subcategoryAffinityTokens(sub)
  const affinityScore = (term: string): number => {
    if (!subTokens.length) return 0
    const lower = term.toLowerCase()
    let score = 0
    for (const tok of subTokens) {
      if (lower.includes(tok)) score -= 1 // lower = ranked earlier
    }
    return score
  }

  return STRATEGIC_KEYWORDS
    .filter((kw) => clusterSet.has(kw.cluster))
    .filter((kw) => surfaceFilter.has(kw.surface))
    .filter((kw) => (opts.month ? kw.month === opts.month : true))
    // Sort by affinity (subcategory-aligned first), then preserve
    // original declaration order via stable sort.
    .map((kw, i) => ({ kw, ord: i, aff: affinityScore(kw.term) }))
    .sort((a, b) => a.aff - b.aff || a.ord - b.ord)
    .map((x) => x.kw)
    // Cap at 6 so we don't crowd out taxonomy-anchored category terms.
    // Strategy keywords are *supporting* signals — the gig's own
    // subcategory keywords must still win the primary slot.
    .slice(0, 6)
}

// Tokens that, when present in a strategic keyword's term, signal
// affinity for the seller's chosen subcategory. Hand-curated per
// subcategory id from lib/categories.ts — kept compact so the
// affinity boost is precise, not broad.
function subcategoryAffinityTokens(subcategoryId: string): string[] {
  switch (subcategoryId) {
    case 'sop-writing':           return ['sop', 'statement of purpose', 'graduate school', 'study plan']
    case 'scholarship-essays':    return ['scholarship', 'merit', 'funding']
    case 'application-essays':    return ['college essay', 'common app', 'supplemental', 'admissions essay', 'personal statement']
    case 'research-writing':      return ['research paper', 'thesis', 'dissertation', 'manuscript']
    case 'proofreading-editing':  return ['editing', 'proofreading', 'review']
    case 'university-admissions': return ['college essay', 'common app', 'admissions', 'personal statement', 'ivy']
    case 'graduate-school':       return ['graduate', 'phd', 'mba', 'med school', 'law school', 'thesis']
    case 'scholarships':          return ['scholarship', 'funding', 'merit']
    case 'student-mentorship':    return ['admissions', 'coach', 'consultant']
    case 'housing':               return ['tenancy', 'rent', 'housing', 'deposit', 'section 21']
    default:                       return []
  }
}

// Banned phrases — §6 of the strategy doc. If any of these appear in a
// draft, the AI is told to rewrite. We surface them in EVERY prompt so
// the model self-censors at generation time rather than relying on a
// post-hoc audit step.
export const BANNED_PHRASES = [
  'navigating immigration can be overwhelming',
  'comprehensive guide to everything you need to know',
  'get approved',
  'guaranteed',
  'fast PR',
  'high success rate',
  'land of opportunity',
  'your dreams abroad',
  'documents, deadlines, official sources, common pitfalls, FAQs', // boilerplate
  'navigate',                       // overused AI tell
  'in today\'s ever-changing',      // overused AI tell
  'in the realm of',                // overused AI tell
] as const

// The 5-question test from §6. Every legal canonical (and every long-
// form gig description) must answer all five before it can ship.
export const FIVE_QUESTION_TEST = [
  'WHO — who is this for / not for (reader persona)',
  'WHAT DECISION — what decision the reader must make next',
  'CONTROLLING SOURCE — USCIS / IRCC / GOV.UK / Home Office with live link or name',
  'WHAT DOCUMENT — specific form, evidence, or letter required',
  'DEADLINE / RISK — what stops the case if missed',
] as const

// Content length gates from §5.3. The gig draft path maps to these
// approximately: long-form gig description ≈ legal canonical;
// pitch/tagline ≈ blog summary opener; SEO description ≈ meta-only.
export const LENGTH_GATES = {
  longFormDescription: { min: 500, max: 700, unit: 'words' as const, note: 'Long-form gig descriptions target 500–700 words. Below the floor reads as thin; above the ceiling buries the conversion CTA.' },
  pitchTagline:        { min: 80,  max: 160, unit: 'chars' as const, note: 'Pitch / tagline targets 80–160 characters — long enough to name buyer + outcome, short enough to read in one breath.' },
  seoTitle:            { min: 50,  max: 60,  unit: 'chars' as const, note: 'SEO title: 50–60 chars. Truncation kicks in at ~60 on desktop SERPs.' },
  seoDescription:      { min: 140, max: 155, unit: 'chars' as const, note: 'SEO description: 140–155 chars. Anything above 155 truncates with an ellipsis.' },
} as const

// Freshness directive from §5.7. Surfaced in every prompt so the model
// embeds the current policy year inline rather than reaching for
// "recently" / "last year" hedges.
export function getFreshnessDirective(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  return [
    `FRESHNESS: Reference current policy dates explicitly ("as of ${now.toLocaleString('en-US', { month: 'long' })} ${year}", "${year}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}"). Do NOT use vague phrases like "recently", "last year", "currently", or "modern" — they age badly and hurt rankings as Google interprets stale-language signals.`,
    `Where the gig touches a policy that changed in ${year} (Section 21, F-1 duration of status, Canada study-permit cap, PGWP field-of-study rules, UK skilled-worker salary threshold), name the change and its effective date — this is the freshness signal that wins long-tail policy queries.`,
  ].join(' ')
}

// Format the structural requirements block. For long-form description
// drafts we surface the 5-question test verbatim; for shorter fields
// we surface a compact version. Returns an empty string when the
// field doesn't need this scaffolding.
export function getStructureRequirements(field: string): string {
  if (field === 'description') {
    return [
      'STRUCTURE: Long-form description must answer the 5-question test:',
      ...FIVE_QUESTION_TEST.map((q, i) => `  ${i + 1}. ${q}`),
      'Bury none of these — a buyer scanning the page should be able to lift the answer to each within the first scroll.',
    ].join('\n')
  }
  if (field === 'faq') {
    return 'STRUCTURE: Each FAQ entry must be a self-contained Q+A snippet that could be lifted into a Google PAA box. Question phrased as a real search query ("how long...", "can I...", "do I need..."). Answer ≤ 60 words, ends with a concrete next step (controlling source, document name, or "book a review" CTA).'
  }
  if (field === 'seo_description' || field === 'seo_title') {
    return 'STRUCTURE: Must include the primary keyword in the first 60 chars AND the country/jurisdiction phrasing exactly as the spine lists it. Truncation discipline: do NOT trail off mid-thought — every character counts.'
  }
  return ''
}

// Top-level convenience: returns the full strategy directives block to
// inject after the category brief in buildBaseContext. Compact enough
// (~600 tokens) to inline on every call without bloating prompts.
export interface StrategyDirectivesOpts {
  field: string
  category: string
  subcategory?: string
  jurisdiction: string
  role: 'attorney' | 'consultant'
}

export function getStrategyDirectivesBlock(opts: StrategyDirectivesOpts): string {
  const strategic = getStrategicKeywordsForGig(opts)
  const structure = getStructureRequirements(opts.field)
  const lines: string[] = ['### Sitewide SEO directives (Q3 2026 plan)']

  if (strategic.length) {
    lines.push('- Strategic keywords (quarterly priority, cluster-aligned — weave in when natural; do not force):')
    for (const kw of strategic) {
      lines.push(`  · [${kw.cluster} · M${kw.month} · ${kw.intent}] ${kw.term}`)
    }
  }

  lines.push('- Banned phrases (instant rewrite if any of these slip in):')
  // Surface the banned phrases as a single dense line — the LLM
  // reliably self-censors against a comma-separated list of explicit
  // strings; a bulleted list eats tokens for the same result.
  lines.push(`  "${[...BANNED_PHRASES].join('", "')}"`)

  if (structure) lines.push(structure)

  lines.push(getFreshnessDirective())

  lines.push(
    `LINKING: When you name a controlling authority, use the canonical name in full ("USCIS", "IRCC", "GOV.UK", "Home Office") — never "the government" or "the immigration office". The proper name IS the anchor signal Google reads.`,
  )

  return lines.join('\n')
}
