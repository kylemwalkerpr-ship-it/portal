/**
 * AEO / SEO / GEO topic authority scoring.
 *
 * Ranks what Auto-Pilot and the keyword planner should publish next so we
 * build subject-matter authority, professional E-E-A-T signals, and content
 * that search engines + answer engines + generative engines prefer to cite.
 *
 * Weights (sum ≈ 1.0):
 *   demand          0.22  — GSC volume + CTR gap (classic SEO opportunity)
 *   aeoIntent       0.20  — clear Q&A / procedural intent (featured snippets, PAA, AI answers)
 *   geoCitation     0.18  — LLM-citable structure potential (defs, steps, sources, comparisons)
 *   disciplineAuth  0.18  — entity/topic depth inside immigration law (cluster authority)
 *   professionalism 0.12  — YMYL-safe professional framing (not spam / transactional bait)
 *   clusterFill     0.10  — fills known estate hubs vs random net-new
 */
import { computeGscMix } from './gscMix'

export interface AuthorityInputs {
  term: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  /**
   * Per-query GSC breakdown. When present, demand is scored from the ELIGIBLE
   * aggregate only (junk PDF/URL/brand rows excluded) with a junk-share
   * penalty — raw GSC volume is not treated as good (GSC push-through Phase B).
   */
  queryRows?: Array<{
    term?: string
    url?: string
    impressions?: number
    clicks?: number
    ctr?: number
    position?: number
  }>
  /** Has a matched owner URL in the SEO strategies registry */
  hasOwner?: boolean
  /** Owner host: legal | portal | market | apex | caseworks */
  host?: string | null
  /** Recently shipped this keyword */
  recentlyCovered?: boolean
  /** Registry action build | expand | merge | … */
  registryAction?: string | null
}

export interface AuthorityBreakdown {
  demand: number
  aeoIntent: number
  geoCitation: number
  disciplineAuth: number
  professionalism: number
  clusterFill: number
  /** 0–100 composite */
  total: number
  /** Short human rationale for the plan UI */
  rationale: string
  /** Primary angle the factory should write for */
  contentAngle:
    | 'requirements_checklist'
    | 'process_guide'
    | 'definition_explainer'
    | 'comparison'
    | 'document_pack'
    | 'regional_pathway'
    | 'refresh_ctr'
    | 'general'
}

const W = {
  demand: 0.22,
  aeoIntent: 0.2,
  geoCitation: 0.18,
  disciplineAuth: 0.18,
  professionalism: 0.12,
  clusterFill: 0.1,
} as const

/** Immigration / study-abroad entities Google + LLMs treat as authority topics */
const DISCIPLINE_ENTITIES = [
  // US
  'opt', 'cpt', 'f-1', 'f1', 'h-1b', 'h1b', 'h-4', 'h4', 'j-1', 'j1', 'l-1', 'o-1',
  'green card', 'i-20', 'i-765', 'i-983', 'i-129', 'i-485', 'i-130', 'i-140',
  'uscis', 'sevis', 'stem opt', 'cap-gap', 'premium processing', 'eb-1', 'eb-2', 'eb-3',
  'adjustment of status', 'consular processing', 'change of status',
  // CA
  'pgwp', 'study permit', 'express entry', 'ircc', 'work permit', 'iec', 'lmia',
  'post-graduation work permit', 'spousal open work', 'sinp', 'pnp',
  // UK
  'graduate route', 'student visa', 'skilled worker', 'ukvi', 'cas', 'brp', 'ilr',
  // AU
  '485', 'subclass 500', 'subclass 482', 'gs requirement', 'genuine student', 'pte',
  // Shared professional themes
  'visa', 'immigration', 'dependent', 'spouse', 'financial capacity', 'bank statement',
  'sop', 'statement of purpose', 'interview', 'refusal', 'rfe', 'nofo',
]

const AEO_PATTERNS: Array<{ re: RegExp; w: number }> = [
  { re: /\b(how (to|do|long|much)|what (is|are|does)|when (do|to|can)|who (can|needs)|why )\b/i, w: 22 },
  { re: /\b(requirements?|eligibility|documents?|checklist|timeline|process|steps?|procedure)\b/i, w: 24 },
  { re: /\b(cost|fee|processing time|validity|duration|expire|renew)\b/i, w: 14 },
  { re: /\b(vs\.?|versus|difference|compare|comparison)\b/i, w: 16 },
  { re: /\b(can i|do i need|am i eligible|is it possible)\b/i, w: 18 },
  { re: /\b(faq|questions? answered|guide|explained)\b/i, w: 10 },
]

const GEO_CITATION_PATTERNS: Array<{ re: RegExp; w: number }> = [
  // Content LLMs love to quote: official process, definitions, structured lists
  { re: /\b(official|uscis|ircc|ukvi|home affairs|gov\.?uk|sevp)\b/i, w: 16 },
  { re: /\b(definition|meaning|overview|explained|what (is|are))\b/i, w: 14 },
  { re: /\b(step[- ]by[- ]step|checklist|documents? (required|list)|how to apply)\b/i, w: 18 },
  { re: /\b(form [iI]-?\d+|imm\s?\d+|subclass\s?\d+)\b/i, w: 16 },
  { re: /\b(from [a-z]+ (to )?(usa|us|uk|canada|australia)|for (indian|chinese|nigerian))\b/i, w: 10 },
]

const SPAM_OR_THIN: RegExp[] = [
  /\b(buy|cheap|fast approval|guaranteed|100%|agent fees? only)\b/i,
  /\b(coupon|discount code|promo)\b/i,
  /yousafe|mycaseworks|yousafeconsultancy/i,
]

const PROFESSIONAL_SIGNALS: RegExp[] = [
  /\b(compliance|eligibility|evidence|supporting documents|immigration counsel|regulated)\b/i,
  /\b(student|graduate|employer|sponsor|university|college|dependent)\b/i,
  /\b(policy|guidance|regulation|requirements)\b/i,
]

/** Core hubs we want to deepen for topical authority (cluster fill). */
const AUTHORITY_CLUSTERS: Array<{ id: string; re: RegExp; hostHint?: string }> = [
  { id: 'us_opt_stem', re: /\b(opt|stem opt|cpt|cap-gap|i-765|i-983)\b/i, hostHint: 'legal' },
  { id: 'us_work_visas', re: /\b(h-1b|h1b|h-4|l-1|o-1|tn |eb-[123])\b/i, hostHint: 'legal' },
  { id: 'ca_study_work', re: /\b(pgwp|study permit|express entry|work permit|ircc)\b/i, hostHint: 'legal' },
  { id: 'uk_student', re: /\b(graduate route|student visa|ukvi|cas|skilled worker)\b/i, hostHint: 'legal' },
  { id: 'au_student', re: /\b(485|subclass 500|genuine student|gs requirement|pte)\b/i, hostHint: 'legal' },
  { id: 'docs_finance', re: /\b(bank statement|financial|sop|statement of purpose|documents?)\b/i },
  { id: 'interview_refusal', re: /\b(visa interview|refusal|rfe|administrative processing)\b/i, hostHint: 'legal' },
  { id: 'dependents', re: /\b(dependent|spouse|f-2|h-4|family)\b/i, hostHint: 'legal' },
]

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

function demandComponent(q: {
  impressions: number
  clicks: number
  ctr: number
  position: number
  /** 0–1 share of impressions that are junk (PDF/URL/brand) — penalty. */
  junkShare?: number
}): number {
  const expectedCtr =
    q.position <= 3 ? 0.12 : q.position <= 10 ? 0.05 : q.position <= 20 ? 0.025 : 0.01
  // CTR gap is meaningless past #20 (a pos-32 0.3% CTR is on-curve) — suppress.
  const ctrGap = q.position > 20 ? 0 : Math.max(0, expectedCtr - q.ctr)
  // log-scale impressions so mega-head terms don't drown everything
  const imp = Math.log10(Math.max(1, q.impressions) + 9) // ~1–3+
  const posW = q.position <= 20 ? 1.25 : q.position <= 40 ? 1.05 : 0.85
  const junkPenalty = 1 - Math.min(0.6, Math.max(0, q.junkShare ?? 0))
  const raw = (imp * 28 * posW + ctrGap * 320 + Math.min(q.clicks, 50) * 0.4) * junkPenalty
  return clamp(raw)
}

function patternScore(term: string, patterns: Array<{ re: RegExp; w: number }>, cap = 100): number {
  let s = 0
  for (const p of patterns) {
    if (p.re.test(term)) s += p.w
  }
  return clamp(s, 0, cap)
}

function disciplineScore(term: string): number {
  const t = term.toLowerCase()
  let hits = 0
  let weight = 0
  for (const e of DISCIPLINE_ENTITIES) {
    if (t.includes(e)) {
      hits++
      weight += e.length >= 6 ? 14 : 10
    }
  }
  // Prefer multi-entity professional queries ("opt stem i-765") over single generic "visa"
  const multi = hits >= 2 ? 18 : hits === 1 ? 8 : 0
  return clamp(weight + multi)
}

function professionalismScore(term: string): number {
  if (SPAM_OR_THIN.some((r) => r.test(term))) return 5
  let s = 45 // baseline for any immigration-adjacent query after brand filter
  for (const r of PROFESSIONAL_SIGNALS) {
    if (r.test(term)) s += 12
  }
  // Penalize pure transactional / marketplace bait
  if (/\b(hire|freelance|gig|service near me|best lawyer cheap)\b/i.test(term)) s -= 25
  // Reward formal process language
  if (/\b(application|petition|status|authorization|permit)\b/i.test(term)) s += 10
  return clamp(s)
}

function clusterFillScore(term: string, hasOwner?: boolean, host?: string | null): {
  score: number
  clusterId: string | null
} {
  for (const c of AUTHORITY_CLUSTERS) {
    if (c.re.test(term)) {
      // Filling an owned cluster = high authority compounding; net-new in cluster also good
      let s = hasOwner ? 88 : 72
      if (c.hostHint && host && host === c.hostHint) s += 8
      return { score: clamp(s), clusterId: c.id }
    }
  }
  // Outside known hubs: lower cluster score (still publishable if demand is huge)
  return { score: hasOwner ? 40 : 28, clusterId: null }
}

function pickAngle(
  term: string,
  position: number,
  ctr: number,
): AuthorityBreakdown['contentAngle'] {
  if (position >= 4 && position <= 20 && ctr < 0.03) return 'refresh_ctr'
  if (/\b(vs\.?|versus|difference|compare)\b/i.test(term)) return 'comparison'
  if (/\b(what is|definition|meaning|explained)\b/i.test(term)) return 'definition_explainer'
  if (/\b(document|checklist|forms?|i-\d+|imm\s?\d+)\b/i.test(term)) return 'document_pack'
  if (/\b(from |in [a-z]+ |for (indian|chinese|nigerian|students? in))\b/i.test(term)) {
    return 'regional_pathway'
  }
  if (/\b(how to|process|steps?|apply|timeline)\b/i.test(term)) return 'process_guide'
  if (/\b(requirements?|eligibility|who can|documents?)\b/i.test(term)) {
    return 'requirements_checklist'
  }
  return 'general'
}

/**
 * Score a topic for SEO + AEO + GEO authority building.
 */
export function scoreTopicAuthority(input: AuthorityInputs): AuthorityBreakdown {
  const term = (input.term || '').trim()
  // GSC push-through Phase B: demand scores the ELIGIBLE aggregate only — junk
  // (PDF/URL/brand) rows never count as volume, and a junk-share penalty stops
  // a property drowning in PDF queries from looking like strong demand.
  const gscMix = input.queryRows?.length
    ? computeGscMix({
        queries: input.queryRows,
        impressions: input.impressions,
        clicks: input.clicks,
        ctr: input.ctr,
        position: input.position,
      })
    : null
  const eg = gscMix?.eligible ?? {
    impressions: input.impressions,
    clicks: input.clicks,
    ctr: input.ctr,
    position: input.position,
  }
  const demand = demandComponent({ ...eg, junkShare: gscMix?.junk.share ?? 0 })
  const aeoIntent = patternScore(term, AEO_PATTERNS)
  const geoCitation = patternScore(term, GEO_CITATION_PATTERNS)
  const disciplineAuth = disciplineScore(term)
  const professionalism = professionalismScore(term)
  const { score: clusterFill, clusterId } = clusterFillScore(
    term,
    input.hasOwner,
    input.host,
  )

  // Soft dampen if recently covered (planner still marks monitor; score helps ranking)
  const recentPenalty = input.recentlyCovered ? 0.72 : 1

  const total = clamp(
    (demand * W.demand +
      aeoIntent * W.aeoIntent +
      geoCitation * W.geoCitation +
      disciplineAuth * W.disciplineAuth +
      professionalism * W.professionalism +
      clusterFill * W.clusterFill) *
      recentPenalty,
  )

  const angle = pickAngle(term, input.position, input.ctr)
  const parts: string[] = []
  if (demand >= 60) parts.push('strong GSC demand/CTR gap')
  if (aeoIntent >= 50) parts.push('clear AEO Q&A intent')
  if (geoCitation >= 50) parts.push('high LLM-citation potential')
  if (disciplineAuth >= 50) parts.push('discipline entity depth')
  if (clusterId) parts.push(`cluster:${clusterId}`)
  if (professionalism < 40) parts.push('low professionalism — deprioritize')
  if (input.recentlyCovered) parts.push('recently covered')

  return {
    demand,
    aeoIntent,
    geoCitation,
    disciplineAuth,
    professionalism,
    clusterFill,
    total,
    rationale: parts.length ? parts.join(' · ') : 'baseline opportunity',
    contentAngle: angle,
  }
}

/** Combine legacy demand score with authority total for planner priority. */
export function combinedEditorialScore(
  legacyDemandScore: number,
  authorityTotal: number,
): number {
  // Authority-led: 55% authority composite, 45% raw demand opportunity
  return Math.round(authorityTotal * 55 + Math.min(legacyDemandScore, 5000) / 5000 * 45 * 100) / 1
}

export function authorityPromptHints(angle: AuthorityBreakdown['contentAngle']): string {
  switch (angle) {
    case 'requirements_checklist':
      return 'Lead with eligibility checklist, required evidence, and common pitfalls. Include FAQ for answer engines.'
    case 'process_guide':
      return 'Use numbered steps, timelines, and official source links. TL;DR + FAQ mandatory for AEO/GEO.'
    case 'definition_explainer':
      return 'Open with a crisp definition, then scope/limits, related forms, and when to seek counsel. Citation-ready prose.'
    case 'comparison':
      return 'Use a comparison table (criteria × options), decision guidance without outcome promises, and FAQ.'
    case 'document_pack':
      return 'Document list with purpose of each item, formatting tips, and consistency checks across forms.'
    case 'regional_pathway':
      return 'Country-specific pathway: eligibility, documents, timeline, official portals. Avoid generic filler.'
    case 'refresh_ctr':
      return 'Rewrite title/H1/intro for intent match and CTR; preserve ownership URL; strengthen first 120 words + FAQ.'
    default:
      return 'Professional immigration guide: TL;DR, structured H2s, official citations, FAQ, no outcome promises.'
  }
}
