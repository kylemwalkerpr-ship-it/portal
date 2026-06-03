// SEO research brief that gets injected into every AI draft prompt.
//
// This is the grounding layer. The LLM is forbidden from inventing
// keywords or making up search-trend claims — it can only work with
// the structured research brief produced here. The brief is fully
// deterministic and built from:
//   1. A curated set of high-intent legal/immigration search terms
//      (lib/seoUtils.ts CATEGORY_KEYWORDS) hand-picked from real
//      keyword research (Ahrefs / SEMrush), not LLM-generated.
//   2. Jurisdiction modifiers (US: USCIS / I-485 / green card,
//      UK: Home Office / ILR / spouse visa, CA: IRCC / PR / express
//      entry) tied to the gig's jurisdiction setting.
//   3. Analysis of which curated terms the seller's existing content
//      already covers — so the model focuses suggestions on the gaps
//      that would actually move the SEO score, not on terms already
//      in use.
//
// When the next session wires Google Search Console (OAuth scopes
// already in place), this file's KEYWORD_BANK gets replaced with a
// live API call. The downstream consumers (lib/seoSuggest.ts and the
// AIDraftButton UI) won't need to change — they consume the
// SeoResearch shape produced here.

import { getKeywordsForCategory } from './seoUtils'
import { getCategoryById, getCategoryBySubcategoryId, getSubcategoryById } from './categories'
import { getStrategicKeywordsForGig } from './seoKnowledgeBase'
import { fetchGscKeywordSignals, type LiveKeywordSignal } from './gscKeywordSignals'

export type Jurisdiction = 'us' | 'uk' | 'ca' | ''

// Jurisdiction-specific high-intent terms — ROLE-SPLIT.
//
// Attorney briefs surface the legal-system anchors buyers actually type
// when they need licensed practice (USCIS / Home Office / IRCC + form
// codes). Consultant briefs MUST NOT surface those — using "USCIS" or
// "I-485" in a non-legal consultant gig is both legally risky and SEO-
// dilutive (it drowns out the consultant's actual category vocabulary).
// Consultants instead get plain country tags that keep the gig
// discoverable on country browse without implying legal practice.
//
// This was the silent bug behind "AI suggests legal doc-prep keywords
// for consultant gigs": the immigration-legal jurisdiction list was
// sorted first in the priority ranking, so it crowded out the
// subcategory-specific terms (university admissions, SOPs, resumes,
// settlement, etc.) regardless of which category the consultant picked.
const JURISDICTION_KEYWORDS_ATTORNEY: Record<Exclude<Jurisdiction, ''>, string[]> = {
  us: ['USCIS', 'green card', 'I-130', 'I-485', 'I-765', 'H-1B', 'F-1 visa', 'OPT', 'naturalization', 'EAD'],
  uk: ['Home Office', 'ILR', 'spouse visa', 'skilled worker visa', 'BRP', 'indefinite leave to remain', 'UKVI', 'Section 21', 'tenancy notice'],
  ca: ['IRCC', 'express entry', 'PR card', 'CRS score', 'study permit', 'PGWP', 'PNP', 'LMIA', 'work permit Canada'],
}
const JURISDICTION_KEYWORDS_CONSULTANT: Record<Exclude<Jurisdiction, ''>, string[]> = {
  us: ['United States', 'US-based', 'US clients'],
  uk: ['United Kingdom', 'UK-based', 'UK clients'],
  ca: ['Canada', 'Canada-based', 'Canadian clients'],
}
function jurisdictionTermsForRole(role: ResearchRole, jx: Exclude<Jurisdiction, ''>): string[] {
  return role === 'consultant' ? JURISDICTION_KEYWORDS_CONSULTANT[jx] : JURISDICTION_KEYWORDS_ATTORNEY[jx]
}

// Generic buyer-intent prefixes that work across categories. Sellers
// who frame their title with one of these tend to rank for
// long-tail searches that convert. Role-aware: "lawyer"/"attorney" boost
// legal gigs; consultant gigs prefer "specialist"/"advisor"/"coach" because
// using legal-practice terms in a non-legal gig title is both misleading and
// kills CTR (buyers searching "MBA admissions lawyer" are not real intent).
const INTENT_MODIFIERS_ATTORNEY = ['lawyer', 'attorney', 'help', 'service', 'consultation', 'review', 'application', 'expert', 'professional', 'online']
const INTENT_MODIFIERS_CONSULTANT = ['specialist', 'advisor', 'coach', 'consultant', 'help', 'service', 'review', 'expert', 'professional', 'online']

export type ResearchRole = 'attorney' | 'consultant'
function intentModifiersForRole(role: ResearchRole): string[] {
  return role === 'consultant' ? INTENT_MODIFIERS_CONSULTANT : INTENT_MODIFIERS_ATTORNEY
}

export interface KeywordSignal {
  term: string
  // How well does the seller's current gig surface for this term?
  //   'covered'  — appears in title / seo_title / pitch / description / tags
  //   'partial'  — appears only in the long description, not the surface fields
  //   'missing'  — not present anywhere
  status: 'covered' | 'partial' | 'missing'
  // Where the term came from so the model can credit it accurately.
  //   'live'        — Google Search Console real impressions (highest signal)
  //   'strategic'   — Q3 2026 strategy doc target keywords (SEO-team curated)
  //   'category'    — taxonomy-anchored subcategory / category keywords
  //   'jurisdiction'— country / legal-system anchor terms
  //   'intent'      — generic buyer-intent modifiers (lowest signal)
  source: 'live' | 'strategic' | 'category' | 'jurisdiction' | 'intent'
}

export interface SeoResearch {
  // Top 5–10 keywords the model should weave into surface copy.
  // Ordered by importance: highest-intent + missing first.
  priorityKeywords: KeywordSignal[]
  // Terms the gig already surfaces well — the model should preserve
  // them and avoid spammy repetition.
  coveredKeywords: string[]
  // Jurisdiction-level guidance, e.g. "Use 'USCIS' over 'immigration
  // bureau' for US gigs". Empty string when no jurisdiction is set.
  jurisdictionHint: string
  // SEO ruleset the model must comply with for surface copy. Compact
  // enough to inline in the system prompt without bloating it.
  rules: string[]
}

interface ResearchInputs {
  title?: string | null
  pitch?: string | null
  tagline?: string | null
  description?: string | null
  seo_title?: string | null
  seo_description?: string | null
  category?: string | null
  // Subcategory id (e.g. 'sop-writing', 'study-permits'). When provided,
  // pulls the curated per-subcategory keyword list from lib/categories.ts
  // as the highest-priority 'category' source — this is what keeps the
  // AI draft anchored to whichever taxonomy node the seller picked.
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  // Role drives intent-modifier selection + jurisdiction-vocabulary framing.
  // Defaults to 'attorney' for backward compat with pre-role-split callers.
  role?: ResearchRole | null
}

function lower(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

function statusFor(term: string, inputs: ResearchInputs): KeywordSignal['status'] {
  const t = term.toLowerCase()
  const surface = [inputs.title, inputs.seo_title, inputs.pitch, inputs.tagline, inputs.seo_description, ...(inputs.tags ?? [])]
    .map(lower).join(' │ ')
  if (surface.includes(t)) return 'covered'
  const desc = lower(inputs.description)
  if (desc.includes(t)) return 'partial'
  return 'missing'
}

export function buildSeoResearch(
  inputs: ResearchInputs,
  // Optional live signals from Google Search Console — when present,
  // these outrank all static keyword sources because they reflect REAL
  // buyer queries with REAL impressions on this site. Populated by
  // buildSeoResearchAsync(); the sync entry point keeps this null for
  // backward compat with deterministic callers (tests, batch scripts).
  liveSignals?: LiveKeywordSignal[] | null,
): SeoResearch {
  const category = String(inputs.category || '').trim().toLowerCase()
  const subcategory = String(inputs.subcategory || '').trim().toLowerCase()
  const jx = (String(inputs.jurisdiction || '').trim().toLowerCase()) as Jurisdiction
  const isValidJx = jx === 'us' || jx === 'uk' || jx === 'ca'

  // Curated category bank — comes from the same source as the UI
  // chips, keeping the model and the visible chips in lockstep.
  const role: ResearchRole = inputs.role === 'consultant' ? 'consultant' : 'attorney'

  // Taxonomy-anchored keywords (lib/categories.ts) take priority over the
  // legacy substring-matched bank in seoUtils — they are the exact terms
  // tied to the selected taxonomy node, so the AI draft stays coherent
  // with the chip the seller actually picked.
  const taxonomySub = subcategory
    ? (getSubcategoryById(category, subcategory) ?? (() => {
        const parent = getCategoryBySubcategoryId(subcategory)
        return parent ? getSubcategoryById(parent.id, subcategory) : undefined
      })())
    : undefined
  const taxonomyCat = getCategoryById(category)
    ?? (taxonomySub ? getCategoryBySubcategoryId(subcategory) : undefined)

  const subcategoryTerms = taxonomySub?.keywords ?? []
  const taxonomyCategoryTerms = taxonomyCat
    ? Array.from(new Set(taxonomyCat.subcategories.flatMap((s) => s.keywords))).slice(0, 12)
    : []
  // Fall back to the curated substring bank only when the taxonomy has
  // no match (legacy free-text categories).
  const fallbackCategoryTerms = (subcategoryTerms.length === 0 && taxonomyCategoryTerms.length === 0)
    ? getKeywordsForCategory(category || subcategory)
    : []
  const categoryTerms = [...subcategoryTerms, ...taxonomyCategoryTerms, ...fallbackCategoryTerms]

  const jxTerms = isValidJx ? jurisdictionTermsForRole(role, jx) : []
  const intentTerms = intentModifiersForRole(role)

  // Strategic keywords from the Q3 2026 plan (lib/seoKnowledgeBase.ts).
  // Cluster-aligned to the gig's category + jurisdiction. Empty when
  // the gig sits outside any tracked cluster (e.g. settlement in US,
  // which the strategy doc doesn't prioritize this quarter).
  const strategicTerms = isValidJx && category
    ? getStrategicKeywordsForGig({ category, subcategory, jurisdiction: jx, role }).map((kw) => kw.term)
    : []

  // Live GSC keywords — REAL buyer queries with REAL impressions in
  // the last 28 days. Pre-filtered + ranked by the caller; we trust
  // the order and place them at the top.
  const liveTerms = (liveSignals ?? []).map((s) => s.term).filter(Boolean)

  // Build signals, deduped (lowercase), tagged with their source.
  const seen = new Set<string>()
  const signals: KeywordSignal[] = []
  const push = (term: string, source: KeywordSignal['source']) => {
    const key = term.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    signals.push({ term, status: statusFor(term, inputs), source })
  }
  // Push order = importance order. Live GSC always wins (impression
  // truth). Then strategy-doc keywords (SEO-team curated quarterly
  // targets). Then taxonomy category / jurisdiction depending on role,
  // then generic intent modifiers as filler.
  for (const t of liveTerms) push(t, 'live')
  for (const t of strategicTerms) push(t, 'strategic')
  if (role === 'consultant') {
    for (const t of categoryTerms) push(t, 'category')
    for (const t of jxTerms) push(t, 'jurisdiction')
  } else {
    for (const t of jxTerms) push(t, 'jurisdiction')
    for (const t of categoryTerms) push(t, 'category')
  }
  for (const t of intentTerms) push(t, 'intent')

  // Priority list = missing > partial > covered, then sort by source
  // weight, then alphabetical for stability. Source weight is role-
  // aware so the ranking matches the role's actual intent ladder.
  //
  // Live always wins (real impression truth).
  //
  // For ATTORNEYS the ladder is:
  //   live > strategic > jurisdiction > category > intent
  // — strategic outranks jurisdiction because the Q3 plan keywords
  // ARE policy-specific (USCIS forms, IRCC programs, Home Office
  // updates) and that's the highest-converting query layer.
  //
  // For CONSULTANTS the ladder is:
  //   live > category > strategic > jurisdiction > intent
  // — category (subcategory keywords like SOP, scholarship essay,
  // university admissions) wins because the gig isn't selling the
  // legal-policy outcome the strategy doc is built around. Strategic
  // is supporting context, not the lead. Without this swap the
  // model leads with phrases like "STEM OPT employer monitoring
  // site visit 2026" on an academic-writing gig — exactly the
  // category-incoherence bug we already fixed once at the
  // jurisdiction layer.
  const sourceWeight = (s: KeywordSignal['source']) => {
    if (s === 'live') return -3
    if (role === 'consultant') {
      if (s === 'category') return -2
      if (s === 'strategic') return -1
      if (s === 'jurisdiction') return 0
      return 1
    }
    if (s === 'strategic') return -2
    if (s === 'jurisdiction') return -1
    if (s === 'category') return 0
    return 1
  }
  const statusWeight = (s: KeywordSignal['status']) =>
    s === 'missing' ? 0 : s === 'partial' ? 1 : 2

  const ranked = [...signals].sort((a, b) =>
    statusWeight(a.status) - statusWeight(b.status) ||
    sourceWeight(a.source) - sourceWeight(b.source) ||
    a.term.localeCompare(b.term),
  )
  // Cap priority list at 10 so the prompt stays focused.
  const priorityKeywords = ranked.slice(0, 10)
  const coveredKeywords = signals.filter((s) => s.status === 'covered').map((s) => s.term)

  // Jurisdiction-specific phrasing guidance, picked from the live
  // jurisdiction term set (no fabricated geographic advice). Role-aware:
  // attorney gigs use the legal-system anchors (USCIS / Home Office / IRCC);
  // consultant gigs MUST stay neutral on country/region so they don't imply
  // legal advice or representation.
  let jurisdictionHint = ''
  if (jx === 'us') {
    jurisdictionHint = role === 'consultant'
      ? 'This is a US-market gig. Use "United States" or "US" plainly; do NOT use USCIS / I-130 / I-485 / green-card / naturalization vocabulary — those imply licensed legal practice. Reference the country and the service category instead.'
      : 'This is a US gig. Use precise US-immigration vocabulary: "USCIS" (not "immigration office"), the relevant form code (I-130, I-485, I-765, etc.) when applicable, and "green card" / "naturalization" rather than generic "residency".'
  } else if (jx === 'uk') {
    jurisdictionHint = role === 'consultant'
      ? 'This is a UK-market gig. Use "United Kingdom" or "UK" plainly; do NOT use Home Office / ILR / spouse-visa / skilled-worker-visa vocabulary — those imply licensed legal practice. Reference the country and the service category instead.'
      : 'This is a UK gig. Use precise UK terminology: "Home Office" (not "UK government"), "ILR" / "indefinite leave to remain", "spouse visa" / "skilled worker visa" instead of generic phrasing. For tenancy gigs, reference "Section 21" / "tenancy notice".'
  } else if (jx === 'ca') {
    jurisdictionHint = role === 'consultant'
      ? 'This is a Canada-market gig. Use "Canada" or "CA" plainly; do NOT use IRCC / Express Entry / PNP / PGWP vocabulary — those imply licensed immigration practice. Reference the country and the service category instead.'
      : 'This is a Canada gig. Use precise Canadian terminology: "IRCC" (not "Canadian immigration"), the relevant program name ("Express Entry", "PNP", "PGWP"), and CRS / NOC when applicable.'
  }

  const rules = [
    'Use ONLY the priority keywords below — do not invent new search terms or make claims about search volume / trends that were not provided here.',
    'Aim to place at least 2 priority keywords (status=missing or partial) into surface fields (title, seo_title, seo_description, pitch).',
    'Preserve any keyword already marked status=covered — do not strip them in favor of new terms.',
    'No keyword stuffing: each priority term should appear at most twice in the entire output.',
    'Match the gig\'s jurisdiction phrasing exactly — see the jurisdictionHint below.',
    'Plain language. No emoji. No outcome promises ("guaranteed", "100% approval"). No price or timeline claims unless they appear in the gig context.',
  ]

  return { priorityKeywords, coveredKeywords, jurisdictionHint, rules }
}

// Async variant — tries Google Search Console for live keyword signals,
// then delegates to the sync builder with those signals injected. GSC
// is a progressive enhancement: when creds are missing or the call
// fails, this returns the same result the sync builder would, so it's
// always safe to call from the API route.
export async function buildSeoResearchAsync(inputs: ResearchInputs): Promise<SeoResearch> {
  const category = String(inputs.category || '').trim().toLowerCase()
  const jx = (String(inputs.jurisdiction || '').trim().toLowerCase()) as Jurisdiction
  let liveSignals: LiveKeywordSignal[] | null = null
  if (category && (jx === 'us' || jx === 'uk' || jx === 'ca')) {
    liveSignals = await fetchGscKeywordSignals({ category, jurisdiction: jx })
  }
  return buildSeoResearch(inputs, liveSignals)
}

// Compact serialization of the research brief for inclusion in the
// LLM prompt. Keeps prompt tokens low while making the constraint
// boundaries explicit and machine-readable.
export function serializeResearch(research: SeoResearch): string {
  const kwLines = research.priorityKeywords.map((s) =>
    `- "${s.term}" [source=${s.source}, status=${s.status}]`,
  )
  return [
    '## SEO research brief (you MUST work within this — do not invent keywords)',
    '',
    'Priority keywords (use missing/partial first; preserve covered):',
    ...kwLines,
    '',
    research.coveredKeywords.length
      ? `Already in surface copy (keep, do not remove): ${research.coveredKeywords.map((k) => `"${k}"`).join(', ')}`
      : 'No priority keywords are in surface copy yet — first draft should pull at least 2 in.',
    '',
    research.jurisdictionHint ? `Jurisdiction guidance: ${research.jurisdictionHint}` : '',
    '',
    'Rules:',
    ...research.rules.map((r) => `- ${r}`),
  ].filter(Boolean).join('\n')
}
