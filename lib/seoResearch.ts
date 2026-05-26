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

export type Jurisdiction = 'us' | 'uk' | 'ca' | ''

// Jurisdiction-specific high-intent terms. These are the queries
// buyers actually type when they know which country they need help
// in — sellers MUST surface for at least one in the title/seo_title
// or they're invisible to the most valuable searches in that market.
const JURISDICTION_KEYWORDS: Record<Exclude<Jurisdiction, ''>, string[]> = {
  us: ['USCIS', 'green card', 'I-130', 'I-485', 'I-765', 'H-1B', 'F-1 visa', 'OPT', 'naturalization', 'EAD'],
  uk: ['Home Office', 'ILR', 'spouse visa', 'skilled worker visa', 'BRP', 'indefinite leave to remain', 'UKVI', 'Section 21', 'tenancy notice'],
  ca: ['IRCC', 'express entry', 'PR card', 'CRS score', 'study permit', 'PGWP', 'PNP', 'LMIA', 'work permit Canada'],
}

// Generic buyer-intent prefixes that work across categories. Sellers
// who frame their title with one of these tend to rank for
// long-tail searches that convert ("immigration lawyer near me",
// "best F-1 reinstatement service", etc.).
const INTENT_MODIFIERS = ['lawyer', 'attorney', 'help', 'service', 'consultation', 'review', 'application', 'expert', 'professional', 'online']

export interface KeywordSignal {
  term: string
  // How well does the seller's current gig surface for this term?
  //   'covered'  — appears in title / seo_title / pitch / description / tags
  //   'partial'  — appears only in the long description, not the surface fields
  //   'missing'  — not present anywhere
  status: 'covered' | 'partial' | 'missing'
  // Where the term came from so the model can credit it accurately.
  source: 'category' | 'jurisdiction' | 'intent'
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
  jurisdiction?: string | null
  tags?: string[] | null
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

export function buildSeoResearch(inputs: ResearchInputs): SeoResearch {
  const category = String(inputs.category || '').trim().toLowerCase()
  const jx = (String(inputs.jurisdiction || '').trim().toLowerCase()) as Jurisdiction
  const isValidJx = jx === 'us' || jx === 'uk' || jx === 'ca'

  // Curated category bank — comes from the same source as the UI
  // chips, keeping the model and the visible chips in lockstep.
  const categoryTerms = getKeywordsForCategory(category)
  const jxTerms = isValidJx ? JURISDICTION_KEYWORDS[jx] : []
  const intentTerms = INTENT_MODIFIERS

  // Build signals, deduped (lowercase), tagged with their source.
  const seen = new Set<string>()
  const signals: KeywordSignal[] = []
  const push = (term: string, source: KeywordSignal['source']) => {
    const key = term.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    signals.push({ term, status: statusFor(term, inputs), source })
  }
  // Order matters — jurisdiction first (highest converting), then
  // category-specific, then generic intent modifiers as fillers.
  for (const t of jxTerms) push(t, 'jurisdiction')
  for (const t of categoryTerms) push(t, 'category')
  for (const t of intentTerms) push(t, 'intent')

  // Priority list = missing > partial > covered, then sort by source
  // weight (jurisdiction first), then alphabetical for stability.
  const sourceWeight = (s: KeywordSignal['source']) =>
    s === 'jurisdiction' ? 0 : s === 'category' ? 1 : 2
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
  // jurisdiction term set (no fabricated geographic advice).
  let jurisdictionHint = ''
  if (jx === 'us') {
    jurisdictionHint = 'This is a US gig. Use precise US-immigration vocabulary: "USCIS" (not "immigration office"), the relevant form code (I-130, I-485, I-765, etc.) when applicable, and "green card" / "naturalization" rather than generic "residency".'
  } else if (jx === 'uk') {
    jurisdictionHint = 'This is a UK gig. Use precise UK terminology: "Home Office" (not "UK government"), "ILR" / "indefinite leave to remain", "spouse visa" / "skilled worker visa" instead of generic phrasing. For tenancy gigs, reference "Section 21" / "tenancy notice".'
  } else if (jx === 'ca') {
    jurisdictionHint = 'This is a Canada gig. Use precise Canadian terminology: "IRCC" (not "Canadian immigration"), the relevant program name ("Express Entry", "PNP", "PGWP"), and CRS / NOC when applicable.'
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
