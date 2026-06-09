// Holistic gig SEO audit.
//
// Unlike the legacy field-by-field checklist in lib/seoUtils.ts, this
// module treats the gig as ONE search-engine artifact and grades it
// against the ten ranking-factor categories the SEO knowledge base
// (lib/seoKnowledgeBase.ts) and research layer (lib/seoResearch.ts)
// already encode. Each section returns its own score (0-100) plus
// concrete fix suggestions the modal can wire into the inline editor
// or the /api/gigs/[id]/seo-suggest endpoint.
//
// Inputs are kept narrow so the function is also callable from server
// routes (where the gig + sibling gigs + seller profile + GSC signals
// are loaded once and passed in). The function is pure — no DB calls,
// no fetch — so it stays cheap and testable.

import {
  STRATEGIC_KEYWORDS,
  getStrategicKeywordsForGig,
  getNicheAuthorityPlays,
  type StrategicKeyword,
  type Cluster,
} from './seoKnowledgeBase'
import { BANNED_AI_TELLS } from './seoVoice'
import type { LiveKeywordSignal } from './gscKeywordSignals'

export type AuditRole = 'attorney' | 'consultant'

export interface AuditGig {
  id: string
  title: string | null
  pitch: string | null
  tagline?: string | null
  description: string | null
  tags: string[] | null
  category: string | null
  subcategory: string | null
  jurisdiction: string | null
  seo_title: string | null
  seo_description: string | null
  faq?: Array<{ question?: string; answer?: string }> | null
  tiers?: Array<{
    tier?: string | null
    price?: number | null
    delivery_days?: number | null
    features?: string[] | null
  }> | null
}

export interface SellerCredibility {
  years_experience?: number | null
  credential?: string | null
  offers_free_consult?: boolean | null
  completed_orders?: number | null
  response_hours?: number | null
}

export interface SiblingGig {
  id: string
  title: string | null
  seo_title: string | null
}

export interface AuditInputs {
  gig: AuditGig
  role: AuditRole
  seller?: SellerCredibility | null
  siblings?: SiblingGig[] | null
  gscSignals?: LiveKeywordSignal[] | null
}

// Each section emits a uniform shape so the UI can render them with
// shared section components. Score is 0-100 for that section's own
// criteria; weight is the overall contribution to the final score.
export type SectionId =
  | 'cluster_coverage'
  | 'intent_diversity'
  | 'jurisdiction_alignment'
  | 'schema_readiness'
  | 'eeat_surfacing'
  | 'snippet_engineering'
  | 'internal_link_surface'
  | 'gsc_alignment'
  | 'voice_hygiene'

export interface SectionFinding {
  kind: 'ok' | 'warn' | 'fail'
  label: string
  detail?: string
  // Optional one-click fix that maps to a field the seller can edit.
  // The modal uses these to open the inline editor with a pre-filled
  // hint or to invoke the AI suggest endpoint.
  fix?: {
    field:
      | 'title' | 'seo_title' | 'seo_description'
      | 'pitch' | 'description' | 'tags'
    hint: string
  }
}

export interface SectionResult {
  id: SectionId
  label: string
  // Section score on its own (0-100 normalized). The overall score
  // weights this by `weight`.
  score: number
  // Weight on the overall (sums to 100 across all weighted sections).
  // gsc_alignment can be 0 when no GSC data is available — in that
  // case the section is excluded from the overall and the remaining
  // weights are renormalized so the score stays comparable.
  weight: number
  findings: SectionFinding[]
  // Pre-rendered one-line summary the collapsed view can show.
  summary: string
}

// Schema.org rich-result eligibility checks. Each row is shown in
// section 5 of the modal and gates a specific schema badge.
export interface SchemaCheck {
  schema: 'FAQPage' | 'Service' | 'Offer' | 'HowTo' | 'BreadcrumbList'
  eligible: boolean
  missing: string[]
}

export interface ClusterCoverageEntry {
  cluster: Cluster
  // Keywords in this cluster that the gig surfaces somewhere.
  covered: string[]
  // Keywords NOT yet in the gig but recommended by the strategy doc.
  // Intent-aware ranked (weight × intent-gap multiplier) and capped at
  // PLATEAU_THRESHOLDS.missingDisplayCap. This is what the UI shows.
  missing: string[]
  // Per-keyword intent bucket that the missing keyword would fill — keyed
  // by term. The UI uses this to render the bucket tag on the chip and
  // the coherent-fix client passes it to the AI hint so the rewrite
  // targets the specific intent gap.
  missingIntent: Record<string, IntentBucket>
  // Keywords that ALSO appear in another of the seller's gigs (split
  // ranking signals). Rendered as a separate amber-red callout.
  cannibalized: string[]
  // True when the cluster has reached the "good enough" plateau:
  // - coverage ratio >= clusterCoverageRatio
  // - transactionalInTitle (set on the title)
  // - descCoverageCount >= clusterDescCoverageCount
  // When true the UI collapses the MISSING section into "optional
  // refinements" instead of treating it as an open issue.
  plateau: boolean
  // Coverage ratio (0..1) for the cluster bag. Convenience for the UI
  // copy ("cluster already at 87% coverage").
  coverageRatio: number
}

export interface IntentCoverage {
  // 7 buckets the brief asks for. Each carries the keywords from the
  // gig's role-aware strategic set that represent that intent.
  buckets: Record<IntentBucket, string[]>
  // Count of buckets with at least one keyword present.
  covered: number
  total: number
}

export type IntentBucket =
  | 'transactional'
  | 'informational'
  | 'long_tail'
  | 'comparison'
  | 'study_abroad'
  | 'trust'
  | 'cross_appeal'

export interface SnippetEngineering {
  finalTitle: string
  finalMeta: string
  titleLen: number
  metaLen: number
  primaryKeyword: string | null
  leadsWithPrimary: boolean
  hasCtaVerb: boolean
  firstParaSnippet: string
}

export interface AuditResult {
  // Weighted overall (0-100) across all enabled sections. When GSC is
  // disabled the weights of the remaining sections are renormalized so
  // the headline number stays directly comparable.
  overall: number
  // Sections in render order. Each renders as a collapsible card.
  sections: SectionResult[]
  // Aux data the modal needs to render the visual sections.
  primaryCluster: Cluster | null
  clusterCoverage: ClusterCoverageEntry[]
  intent: IntentCoverage
  snippet: SnippetEngineering
  schemaChecks: SchemaCheck[]
  cannibalizationWarnings: Array<{ keyword: string; otherGigs: SiblingGig[] }>
  bannedPhrasesFound: string[]
  // True when GSC signals were used in scoring; false when the section
  // was skipped (no creds / no data / not applicable).
  gscEnabled: boolean
  // Strategic keywords the gig already covers (full term, source-of-truth).
  strategicCovered: string[]
  // Strategic keywords the gig is missing and SHOULD weave in.
  strategicMissing: string[]
  // Intent buckets that have ZERO coverage — feeds the directed
  // "broaden intent coverage" hint with per-bucket example phrases.
  intentMissingBuckets: IntentBucket[]
  // The example phrases the coherent-fix route should weave into the
  // rewrite, one entry per missing bucket. Pulled from the primary
  // cluster bank when the bank has examples for that intent, else from
  // INTENT_BUCKET_EXAMPLE_PHRASES.
  intentBucketHints: Array<{ bucket: IntentBucket; phrases: string[] }>
}

// ---------------------------------------------------------------------
// Tunable plateau thresholds. Surfaced as a NAMED constant so the UI
// and the API routes can both reason about "good enough" without
// duplicating magic numbers. Tuning these here moves the whole funnel.
//
//  - clusterCoverageRatio: covered/(covered+missing) above which we stop
//    treating the cluster as a fresh source of issues. The seller can
//    still see "optional refinements" but the MISSING section is
//    collapsed by default.
//  - clusterDescCoverageCount: minimum number of cluster keywords woven
//    into the description prose.
//  - missingDisplayCap: hard cap on how many "MISSING" pills the UI
//    will ever render — quality over quantity.
//  - intentCoveredSatisfied: once intent.covered reaches this number
//    the "broaden intent coverage" CTA disappears.
//  - maxOutstandingIssues: the seller should never see more than this
//    many open issues at once. The UI ranks the open findings by
//    section-weight × delta-to-100 and trims the rest.
export const PLATEAU_THRESHOLDS = {
  clusterCoverageRatio: 0.80,
  clusterDescCoverageCount: 6,
  missingDisplayCap: 5,
  intentCoveredSatisfied: 5,
  maxOutstandingIssues: 6,
} as const

// Intent-gap multipliers — applied on top of the StrategicKeyword
// intent weight when ranking the missing list. Keywords that fill a
// bucket the gig has ZERO coverage in rank above keywords whose bucket
// is already saturated.
const INTENT_GAP_MULTIPLIER_EMPTY = 2.4
const INTENT_GAP_MULTIPLIER_LIGHT = 1.4
const INTENT_GAP_MULTIPLIER_FULL = 0.8

// Human-facing labels for the intent buckets — used inside the AI hint
// the coherent-fix route relays. UI labels live in the React layer.
const INTENT_LABEL_FOR_HINT: Record<IntentBucket, string> = {
  transactional: 'Transactional',
  informational: 'Informational',
  long_tail: 'Long-tail',
  comparison: 'Comparison',
  study_abroad: 'Study-Abroad',
  trust: 'Trust',
  cross_appeal: 'Cross-Appeal',
}

// Intent → example-phrase corpus. The coherent-fix flow uses these to
// build a directed AI hint per missing bucket so the rewrite has
// concrete phrasing to imitate instead of a generic "add intent
// variety" prompt. Each bucket carries 3 short prototypes — the route
// also pulls cluster-specific examples from STRATEGIC_KEYWORDS when
// available, but these are the safety net for clusters with thin banks.
export const INTENT_BUCKET_EXAMPLE_PHRASES: Record<IntentBucket, string[]> = {
  transactional: [
    'book a 1:1 session today',
    'order your edit now',
    'hire a verified specialist',
  ],
  informational: [
    'a step-by-step guide to',
    'how to write a',
    'what to expect from',
  ],
  long_tail: [
    'step-by-step admissions essay guide for international applicants',
    'how to write a common app essay with limited extracurriculars',
    'detailed roadmap for first-generation graduate-school applicants',
  ],
  comparison: [
    'best common app essay editors compared',
    'how I differ from generic editing services',
    'pros and cons versus large-volume essay mills',
  ],
  study_abroad: [
    'F-1 visa, OPT, and study-permit applicants',
    'international student admissions strategy',
    'SOP and scholarship-essay specialist',
  ],
  trust: [
    'former admissions reader essay reviews',
    'completed 400+ admissions edits since 2019',
    '24-hour response window, refund guarantee',
  ],
  cross_appeal: [
    'career mentor for international graduates',
    'admissions coach who has placed students at',
    'mentorship that bridges essays and visa strategy',
  ],
}

// Single-row score helper used by `rerunScore` so the coherent-fix
// route can project an expected delta without duplicating the whole
// runSeoAudit pipeline.

const CTA_VERBS = [
  'get', 'book', 'review', 'talk', 'start', 'order', 'request',
  'apply', 'claim', 'unlock', 'schedule', 'reserve', 'shop',
  'try', 'sign up', 'find', 'discover', 'compare', 'hire', 'speak',
]

// Intent-bucket mapping for the StrategicKeyword type's `intent` field.
// The StrategicKeyword's own intent is one of (informational, commercial,
// transactional). The brief asks for a 7-bucket diversity grid, so we
// derive the extra buckets from cluster + token signals on the term.
function bucketsForKeyword(kw: StrategicKeyword): IntentBucket[] {
  const buckets = new Set<IntentBucket>()
  if (kw.intent === 'transactional' || kw.intent === 'commercial') buckets.add('transactional')
  if (kw.intent === 'informational') buckets.add('informational')
  const term = kw.term.toLowerCase()
  // Long-tail signal — 5+ words or contains a year + 4+ words.
  if (term.split(/\s+/).length >= 5) buckets.add('long_tail')
  // Comparison signal — cluster=compare OR contains vs/versus/comparison.
  if (kw.cluster === 'compare' || /\b(vs|versus|comparison|alternative)\b/.test(term)) buckets.add('comparison')
  // Study-abroad signal — any cluster touching student / study / OPT / SOP / scholarship.
  if (/\b(student|study|opt|sop|scholarship|admissions|tuition|f-1|pgwp|cas)\b/.test(term)
    || kw.cluster === 'us-f1-opt' || kw.cluster === 'canada-sp-pgwp' || kw.cluster === 'academic-writing-essay') {
    buckets.add('study_abroad')
  }
  // Trust signal — credential / review / testimonial / before-after / verified.
  if (/\b(reviews?|testimonials?|credentials?|verified|certified|before and after|guarantee)\b/.test(term)) {
    buckets.add('trust')
  }
  // Cross-appeal — keywords that bridge two clusters (mentorship + academic,
  // career + work-visa, business + immigration). Crude proxy: cluster is
  // mentorship-coaching OR career-services with policy tokens.
  if (kw.cluster === 'mentorship-coaching' || kw.cluster === 'career-services'
    || /\b(career|mentor|coach|advisor)\b/.test(term)) {
    buckets.add('cross_appeal')
  }
  return Array.from(buckets)
}

const PRIMARY_CLUSTER_FALLBACK = (cat: string, sub: string): Cluster | null => {
  const s = sub.toLowerCase()
  const c = cat.toLowerCase()
  if (s.includes('sop') || s.includes('admissions') || s.includes('essay') || c === 'academic-writing') return 'academic-writing-essay'
  if (c === 'career' || s.includes('resume') || s.includes('linkedin')) return 'career-services'
  if (c === 'business' || s.includes('llc')) return 'business-formation'
  if (c === 'credentials') return 'credential-evaluation'
  if (c === 'mentorship') return 'mentorship-coaching'
  return null
}

function surfaceText(g: AuditGig): { title: string; pitch: string; desc: string; metaTitle: string; metaDesc: string; tags: string[]; faqText: string; full: string } {
  const title = String(g.title || '')
  const pitch = String(g.pitch || g.tagline || '')
  const desc = String(g.description || '')
  const metaTitle = String(g.seo_title || g.title || '')
  const metaDesc = String(g.seo_description || g.pitch || '')
  const tags = Array.isArray(g.tags) ? g.tags : []
  const faqText = (g.faq ?? []).map((f) => `${f?.question ?? ''} ${f?.answer ?? ''}`).join(' ')
  const full = [title, pitch, desc, metaTitle, metaDesc, ...tags, faqText].join(' \n ')
  return { title, pitch, desc, metaTitle, metaDesc, tags, faqText, full }
}

function containsCi(haystack: string, needle: string): boolean {
  if (!needle) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

// Jurisdiction terms (mirrored from lib/seoResearch.ts — that file's
// arrays are not exported; this is the audit-side copy. Keep in lockstep
// when the source-of-truth list grows; if they drift, the audit just
// underreports coverage — never throws).
const JURISDICTION_TERMS: Record<'us' | 'uk' | 'ca' | 'au', { attorney: string[]; consultant: string[] }> = {
  us: {
    attorney: ['USCIS', 'green card', 'I-130', 'I-485', 'I-765', 'H-1B', 'F-1 visa', 'OPT', 'naturalization', 'EAD', 'United States', 'US'],
    consultant: ['United States', 'US-based', 'US clients', 'US', 'America'],
  },
  uk: {
    attorney: ['Home Office', 'ILR', 'spouse visa', 'skilled worker visa', 'BRP', 'indefinite leave to remain', 'UKVI', 'Section 21', 'tenancy notice', 'United Kingdom', 'UK'],
    consultant: ['United Kingdom', 'UK-based', 'UK clients', 'UK', 'Britain'],
  },
  ca: {
    attorney: ['IRCC', 'express entry', 'PR card', 'CRS score', 'study permit', 'PGWP', 'PNP', 'LMIA', 'work permit Canada', 'Canada'],
    consultant: ['Canada', 'Canada-based', 'Canadian clients', 'Canadian'],
  },
  au: {
    attorney: ['Department of Home Affairs', 'student visa', 'subclass 500', 'subclass 485', 'Genuine Student', 'work rights', 'Australia'],
    consultant: ['Australia', 'Australia-based', 'Australian clients', 'AU'],
  },
}

// ---------------------------------------------------------------------
// The audit itself. Sections are scored independently then weighted.

export function runSeoAudit(input: AuditInputs): AuditResult {
  const { gig, role } = input
  const seller = input.seller ?? null
  const siblings = input.siblings ?? []
  const gscSignals = input.gscSignals ?? null

  const cat = String(gig.category || '').trim().toLowerCase()
  const sub = String(gig.subcategory || '').trim().toLowerCase()
  const jx = String(gig.jurisdiction || '').trim().toLowerCase() as '' | 'us' | 'uk' | 'ca' | 'au'
  const isValidJx = jx === 'us' || jx === 'uk' || jx === 'ca' || jx === 'au'
  const text = surfaceText(gig)

  // ------- 1. CLUSTER COVERAGE -------
  const strategic = isValidJx && cat
    ? getStrategicKeywordsForGig({ category: cat, subcategory: sub, jurisdiction: jx, role })
    : []
  // Pull a broader keyword sweep for the primary cluster so the
  // coverage % reflects the whole cluster, not just the 6 cap of the
  // role-aware selector. Falls back to the role-selected set when no
  // cluster can be resolved.
  const primaryCluster: Cluster | null =
    (strategic[0]?.cluster as Cluster | undefined) ?? PRIMARY_CLUSTER_FALLBACK(cat, sub)
  // Wider cluster bag, used for the visual map and missing-keyword
  // suggestions. Same surface filter as the role-aware selector so
  // attorneys don't get fed marketplace-only consultant terms and
  // vice-versa.
  const surfaceFilter = role === 'consultant' ? new Set(['marketplace', 'either']) : new Set(['marketplace', 'canonical', 'either'])
  const clusterBag = primaryCluster
    ? STRATEGIC_KEYWORDS.filter((k) => k.cluster === primaryCluster && surfaceFilter.has(k.surface))
    : []

  // Identify covered / missing within the primary cluster — and keep
  // the StrategicKeyword reference around for the ranked-missing pass
  // below (we need intent + cluster to score each candidate).
  const clusterCovered: string[] = []
  const clusterMissingRaw: StrategicKeyword[] = []
  for (const k of clusterBag) {
    if (containsCi(text.full, k.term) || hasAnyTokenOverlap(text.full, k.term)) clusterCovered.push(k.term)
    else clusterMissingRaw.push(k)
  }

  // Cannibalization — same keyword appearing in another active gig of
  // this seller. Splits ranking signals.
  const cannibalizationWarnings: Array<{ keyword: string; otherGigs: SiblingGig[] }> = []
  for (const k of clusterCovered) {
    const others = siblings.filter((s) => s.id !== gig.id && (containsCi(s.title || '', k) || containsCi(s.seo_title || '', k)))
    if (others.length > 0) cannibalizationWarnings.push({ keyword: k, otherGigs: others })
  }

  // Score: split into title-transactional / desc-coverage / long-tail-or-compare.
  const transactionalInTitle = clusterBag.some((k) =>
    (k.intent === 'transactional' || k.intent === 'commercial') && containsCi(text.title, k.term))
  const descCoverageCount = clusterBag.reduce((n, k) => n + (containsCi(text.desc, k.term) ? 1 : 0), 0)
  const hasLongOrCompareIntent = clusterBag.some((k) =>
    (k.cluster === 'compare' || k.term.split(/\s+/).length >= 5) && containsCi(text.full, k.term))

  // -- Intent-aware ranking of the MISSING list. -----------------------
  // First pass: which buckets are already covered by the gig's CURRENT
  // copy. We use the same wider+role-aware corpus as the intent
  // diversity section so the two sections stay consistent.
  const widerForBucketing = isValidJx && primaryCluster
    ? STRATEGIC_KEYWORDS.filter((k) => surfaceFilter.has(k.surface))
    : []
  const currentBucketCounts: Record<IntentBucket, number> = {
    transactional: 0, informational: 0, long_tail: 0,
    comparison: 0, study_abroad: 0, trust: 0, cross_appeal: 0,
  }
  for (const kw of widerForBucketing) {
    if (!containsCi(text.full, kw.term)) continue
    for (const b of bucketsForKeyword(kw)) currentBucketCounts[b] += 1
  }
  // Strategic-intent weight: transactional > commercial > informational.
  const intentBaseWeight = (kw: StrategicKeyword): number => {
    if (kw.intent === 'transactional') return 1.0
    if (kw.intent === 'commercial') return 0.85
    return 0.65
  }
  const gapMultiplier = (count: number): number => {
    if (count === 0) return INTENT_GAP_MULTIPLIER_EMPTY
    if (count <= 2) return INTENT_GAP_MULTIPLIER_LIGHT
    return INTENT_GAP_MULTIPLIER_FULL
  }
  // Pick the bucket each missing keyword would fill (max-gap bucket if
  // it covers several). This is what the UI tags onto the chip.
  const bestBucketFor = (kw: StrategicKeyword): IntentBucket | null => {
    const buckets = bucketsForKeyword(kw)
    if (buckets.length === 0) return null
    let best: IntentBucket = buckets[0]
    let bestCount = currentBucketCounts[best]
    for (const b of buckets) {
      if (currentBucketCounts[b] < bestCount) { best = b; bestCount = currentBucketCounts[b] }
    }
    return best
  }
  const scoreForMissing = (kw: StrategicKeyword): number => {
    const buckets = bucketsForKeyword(kw)
    if (buckets.length === 0) return intentBaseWeight(kw)
    // Use the BEST (lowest current-count) bucket so a long-tail keyword
    // that fills a missing bucket beats a transactional one whose
    // bucket is already saturated. That's the user's stated rule.
    const minCount = buckets.reduce((m, b) => Math.min(m, currentBucketCounts[b]), Number.POSITIVE_INFINITY)
    return intentBaseWeight(kw) * gapMultiplier(minCount)
  }
  const rankedMissing = clusterMissingRaw
    .map((kw) => ({ kw, score: scoreForMissing(kw), bucket: bestBucketFor(kw) }))
    .sort((a, b) => b.score - a.score)
  const clusterMissingTop = rankedMissing
    .slice(0, PLATEAU_THRESHOLDS.missingDisplayCap)
    .map((r) => r.kw.term)
  const missingIntent: Record<string, IntentBucket> = {}
  for (const r of rankedMissing.slice(0, PLATEAU_THRESHOLDS.missingDisplayCap)) {
    if (r.bucket) missingIntent[r.kw.term] = r.bucket
  }

  // Coverage ratio + plateau flag. A cluster at plateau still shows
  // the top-N missing pills as "optional refinements", not as open
  // issues — that's how we kill the endless treadmill.
  const totalBag = clusterCovered.length + clusterMissingRaw.length
  const coverageRatio = totalBag > 0 ? clusterCovered.length / totalBag : 0
  const clusterPlateau = (
    coverageRatio >= PLATEAU_THRESHOLDS.clusterCoverageRatio
    && transactionalInTitle
    && descCoverageCount >= PLATEAU_THRESHOLDS.clusterDescCoverageCount
  )

  const clusterCoverage: ClusterCoverageEntry[] = primaryCluster ? [{
    cluster: primaryCluster,
    covered: clusterCovered,
    missing: clusterMissingTop,
    missingIntent,
    cannibalized: cannibalizationWarnings.map((c) => c.keyword),
    plateau: clusterPlateau,
    coverageRatio,
  }] : []

  // Score: title-transactional + diminishing-returns desc-coverage +
  // long-tail-or-compare. Diminishing returns means the seller stops
  // chasing keyword saturation once "good enough" is reached. We
  // weight desc coverage on a curve so going from 4→6 covered cluster
  // keywords still moves the needle, but 12→16 barely does.
  const clusterFindings: SectionFinding[] = []
  let clusterScore = 0
  if (clusterBag.length === 0) {
    clusterFindings.push({ kind: 'warn', label: 'No primary cluster matched', detail: 'Set category + jurisdiction so the SEO knowledge base can target a keyword cluster.' })
  } else {
    // (a) Title transactional — 35 pts.
    if (transactionalInTitle) {
      clusterScore += 35
      clusterFindings.push({ kind: 'ok', label: 'Title carries a transactional cluster keyword' })
    } else {
      clusterFindings.push({
        kind: 'fail',
        label: 'Title is missing a transactional keyword from the primary cluster',
        detail: `Try weaving in one of: ${clusterBag.filter((k) => k.intent !== 'informational').slice(0, 3).map((k) => `"${k.term}"`).join(', ')}.`,
        fix: { field: 'title', hint: `Lead with a transactional keyword from the ${primaryCluster} cluster, e.g. "${clusterBag[0]?.term ?? ''}".` },
      })
    }
    // (b) Desc coverage — diminishing-returns curve up to 45 pts.
    // 1-(0.78^count) means count=3 ≈ 26pts, count=6 ≈ 36pts, count=10 ≈ 42pts.
    // Plateaus near the cap so the seller's 11th add gains <1pt.
    const descCurve = Math.round((1 - Math.pow(0.78, Math.max(0, descCoverageCount))) * 45)
    clusterScore += descCurve
    if (descCoverageCount >= PLATEAU_THRESHOLDS.clusterDescCoverageCount) {
      clusterFindings.push({ kind: 'ok', label: `Description covers ${descCoverageCount} cluster keywords (plateau threshold met)` })
    } else if (descCoverageCount >= 3) {
      clusterFindings.push({
        kind: 'warn',
        label: `Description covers ${descCoverageCount}/${PLATEAU_THRESHOLDS.clusterDescCoverageCount} cluster keywords`,
        detail: `Weave a few more cluster keywords into the description prose to plateau this section.`,
        fix: { field: 'description', hint: `Weave 1–2 more cluster keywords into the description, e.g. ${clusterMissingTop.slice(0, 2).map((t) => `"${t}"`).join(', ')}. Don't pad — replace a weaker phrase if needed.` },
      })
    } else {
      clusterFindings.push({
        kind: 'fail',
        label: `Description covers only ${descCoverageCount}/3 cluster keywords`,
        detail: `Weave in 3+ of the cluster's keywords into the description prose.`,
        fix: { field: 'description', hint: `Weave in at least 3 keywords from the ${primaryCluster} cluster, e.g. ${clusterMissingTop.slice(0, 3).map((t) => `"${t}"`).join(', ')}.` },
      })
    }
    // (c) Long-tail / comparison anchor — 20 pts.
    if (hasLongOrCompareIntent) {
      clusterScore += 20
      clusterFindings.push({ kind: 'ok', label: 'A long-tail or comparison keyword is present' })
    } else {
      clusterFindings.push({
        kind: 'warn',
        label: 'No long-tail or comparison-intent keyword present',
        detail: 'Long-tail / comparison queries convert at high rates — they signal commercial intent to Google.',
        fix: { field: 'description', hint: `Add a long-tail or comparison keyword like "${clusterBag.find((k) => k.cluster === 'compare')?.term ?? clusterBag.find((k) => k.term.split(/\s+/).length >= 5)?.term ?? ''}".` },
      })
    }
    clusterScore = Math.min(100, clusterScore)
  }

  // ------- 2. INTENT DIVERSITY -------
  const intentBuckets: Record<IntentBucket, string[]> = {
    transactional: [], informational: [], long_tail: [],
    comparison: [], study_abroad: [], trust: [], cross_appeal: [],
  }
  // Walk strategic keywords for THIS gig (role + cat + jx + sub aware)
  // and credit any whose term is covered anywhere in surface copy.
  const wider = isValidJx && primaryCluster
    ? STRATEGIC_KEYWORDS.filter((k) => surfaceFilter.has(k.surface))
    : []
  for (const kw of wider) {
    if (!containsCi(text.full, kw.term)) continue
    for (const b of bucketsForKeyword(kw)) intentBuckets[b].push(kw.term)
  }
  const intentCovered = (Object.values(intentBuckets).filter((arr) => arr.length > 0)).length
  const intent: IntentCoverage = { buckets: intentBuckets, covered: intentCovered, total: 7 }
  const intentScore = Math.round((intentCovered / 7) * 100)

  // Compute the missing buckets + per-bucket example phrases now so
  // both the intent_diversity finding's fix hint AND the AuditResult
  // can carry the targeted guidance. The coherent-fix route uses these
  // to build the AI prompt with concrete phrasing for each gap — that
  // was the user's "Fix C" complaint: the generic "broaden intent"
  // hint didn't tell the model WHICH buckets to fill.
  const intentMissingBuckets: IntentBucket[] = (Object.keys(intentBuckets) as IntentBucket[])
    .filter((b) => intentBuckets[b].length === 0)
  const intentBucketHints: Array<{ bucket: IntentBucket; phrases: string[] }> = intentMissingBuckets
    .map((bucket) => {
      // Prefer keywords from the gig's wider role/jurisdiction-aware
      // strategic set that map onto THIS bucket — they're already
      // role-appropriate phrasing.
      const fromBank = wider
        .filter((k) => bucketsForKeyword(k).includes(bucket))
        .map((k) => k.term)
        .slice(0, 3)
      const phrases = fromBank.length >= 2
        ? fromBank
        : [...fromBank, ...INTENT_BUCKET_EXAMPLE_PHRASES[bucket]].slice(0, 3)
      return { bucket, phrases }
    })

  const intentBucketHintBlock = intentBucketHints
    .map((h) => {
      const samples = h.phrases.map((p) => `"${p}"`).join(', ')
      return `${INTENT_LABEL_FOR_HINT[h.bucket]} (missing): weave phrasing like ${samples}.`
    })
    .join(' ')
  const intentFixHint = intentMissingBuckets.length === 0
    ? 'Intent coverage already broad — no rewrite needed.'
    : `ADD these specific intent gaps to description and FAQ. ${intentBucketHintBlock} Don't pad — replace a weaker phrase if needed. After the rewrite the intent bucket count MUST increase by at least 1, ideally 2-3.`

  const intentFindings: SectionFinding[] = []
  if (intentCovered >= PLATEAU_THRESHOLDS.intentCoveredSatisfied) intentFindings.push({ kind: 'ok', label: `Covers ${intentCovered}/7 intent buckets` })
  else if (intentCovered >= 3) intentFindings.push({
    kind: 'warn',
    label: `Covers only ${intentCovered}/7 intent buckets`,
    detail: `Missing buckets: ${intentMissingBuckets.map((b) => INTENT_LABEL_FOR_HINT[b]).join(', ')}. The one-click fix targets these explicitly.`,
    fix: { field: 'description', hint: intentFixHint },
  })
  else intentFindings.push({
    kind: 'fail',
    label: `Covers only ${intentCovered}/7 intent buckets`,
    detail: `Missing buckets: ${intentMissingBuckets.map((b) => INTENT_LABEL_FOR_HINT[b]).join(', ')}.`,
    fix: { field: 'description', hint: intentFixHint },
  })

  // ------- 3. JURISDICTION ALIGNMENT -------
  const jxFindings: SectionFinding[] = []
  let jxScore = 0
  if (isValidJx) {
    const jxBank = JURISDICTION_TERMS[jx][role]
    const inTitleOrPitch = jxBank.some((t) => containsCi(text.title + ' ' + text.pitch, t))
    const inDescCount = jxBank.reduce((n, t) => n + (containsCi(text.desc, t) ? 1 : 0), 0)
    const inTags = (text.tags || []).some((tg) => jxBank.some((t) => containsCi(tg, t)))
    if (inTitleOrPitch) { jxScore += 40; jxFindings.push({ kind: 'ok', label: 'Title or pitch anchors the jurisdiction' }) } else {
      jxFindings.push({ kind: 'fail', label: 'Title and pitch do not anchor jurisdiction', detail: `Buyers filter by country. Drop one of: ${jxBank.slice(0, 4).join(', ')}.`, fix: { field: 'title', hint: `Anchor the title with one of: ${jxBank.slice(0, 3).join(', ')}.` } })
    }
    if (inDescCount >= 2) { jxScore += 35; jxFindings.push({ kind: 'ok', label: `Description references ${inDescCount} jurisdiction terms` }) } else {
      jxFindings.push({ kind: 'warn', label: `Description references only ${inDescCount}/2 jurisdiction terms`, detail: `Weave in at least 2 jurisdiction terms — controlling authority + a form code or program name.`, fix: { field: 'description', hint: `Reference at least 2 jurisdiction terms (e.g. ${jxBank.slice(0, 4).join(', ')}).` } })
    }
    if (inTags) { jxScore += 25; jxFindings.push({ kind: 'ok', label: 'At least one tag is jurisdiction-specific' }) } else {
      jxFindings.push({ kind: 'warn', label: 'No jurisdiction-specific tag', detail: 'Tags drive marketplace filtering — add a country / system tag.', fix: { field: 'tags', hint: `Add a jurisdiction-specific tag like "${(jxBank[0] || jx).toLowerCase()}".` } })
    }
  } else {
    jxFindings.push({ kind: 'fail', label: 'No jurisdiction set', detail: 'Buyers filter by country — pick one in the gig editor.' })
  }

  // ------- 4. SCHEMA READINESS -------
  const faqCount = (gig.faq ?? []).filter((f) => (f?.question ?? '').trim().length > 0 && (f?.answer ?? '').trim().length > 0).length
  const avgFaqAnswer = faqCount > 0
    ? Math.round((gig.faq ?? []).reduce((sum, f) => sum + ((f?.answer ?? '').length), 0) / faqCount)
    : 0
  const faqEligible = faqCount >= 6 && faqCount <= 12 && avgFaqAnswer >= 80
  const tiers = gig.tiers ?? []
  const serviceEligible = tiers.length > 0 && tiers.every((t) => (t.price ?? 0) > 0 && (t.delivery_days ?? 0) >= 1 && Array.isArray(t.features) && (t.features?.length ?? 0) >= 3)
  const hasListMarkers = /^\s*[-*•]\s+/m.test(text.desc) || /^\s*\d+\.\s+/m.test(text.desc) || /(^|\n)#{2,3}\s+/.test(text.desc)
  const schemaChecks: SchemaCheck[] = [
    {
      schema: 'FAQPage',
      eligible: faqEligible,
      missing: [
        faqCount < 6 ? `Add ${6 - faqCount} more FAQ entries (need 6-12)` : '',
        faqCount > 12 ? `Trim ${faqCount - 12} FAQ entries (need 6-12)` : '',
        avgFaqAnswer < 80 ? `Lengthen answers — averaging ${avgFaqAnswer} chars, need >=80` : '',
      ].filter(Boolean),
    },
    {
      schema: 'Service',
      eligible: tiers.length > 0,
      missing: tiers.length === 0 ? ['Add at least one pricing tier'] : [],
    },
    {
      schema: 'Offer',
      eligible: serviceEligible,
      missing: tiers.length === 0
        ? ['Add at least one pricing tier with price, delivery_days and >=3 features']
        : tiers.flatMap((t, i) => [
          (t.price ?? 0) <= 0 ? `Tier ${i + 1}: set a price` : '',
          (t.delivery_days ?? 0) < 1 ? `Tier ${i + 1}: set delivery_days (>=1)` : '',
          ((t.features?.length ?? 0) < 3) ? `Tier ${i + 1}: add at least 3 features` : '',
        ]).filter(Boolean),
    },
    {
      schema: 'HowTo',
      eligible: hasListMarkers,
      missing: hasListMarkers ? [] : ['Add bullets, numbered steps, or section headers to the description'],
    },
    {
      schema: 'BreadcrumbList',
      eligible: !!(cat && sub),
      missing: !cat ? ['Set a category'] : !sub ? ['Set a subcategory'] : [],
    },
  ]
  const schemaScore = Math.round((schemaChecks.filter((c) => c.eligible).length / schemaChecks.length) * 100)
  const schemaFindings: SectionFinding[] = schemaChecks.map((c) =>
    c.eligible
      ? { kind: 'ok' as const, label: `${c.schema} rich-result eligible` }
      : { kind: 'warn' as const, label: `${c.schema} not yet eligible`, detail: c.missing.join('. ') })

  // ------- 5. E-E-A-T -------
  const eeatFindings: SectionFinding[] = []
  let eeatScore = 0
  if (seller && Number(seller.years_experience || 0) > 0) {
    const yrs = Number(seller.years_experience)
    if (containsCi(text.pitch + ' ' + text.desc, String(yrs)) || /\b\d+\+?\s+(yrs|years)\b/i.test(text.pitch + ' ' + text.desc)) {
      eeatScore += 30
      eeatFindings.push({ kind: 'ok', label: 'Experience years referenced in copy' })
    } else {
      eeatFindings.push({
        kind: 'fail',
        label: `You have ${yrs} yrs experience but your copy doesn't mention it`,
        detail: 'Specific years-of-practice numbers are an E-E-A-T trust signal Google reads through reviewer signals.',
        fix: { field: 'pitch', hint: `Mention your ${yrs} years of experience in the pitch.` },
      })
    }
  } else {
    eeatFindings.push({ kind: 'warn', label: 'No years_experience set on profile', detail: 'Add years of experience on your profile so it can be surfaced in copy.' })
  }
  if (seller?.credential) {
    if (containsCi(text.pitch + ' ' + text.desc, seller.credential)) {
      eeatScore += 25
      eeatFindings.push({ kind: 'ok', label: `Credential "${seller.credential}" referenced in copy` })
    } else {
      eeatFindings.push({
        kind: 'warn',
        label: `Credential "${seller.credential}" not surfaced in copy`,
        detail: 'Credentials build trust — name yours in the pitch or first description paragraph.',
        fix: { field: 'pitch', hint: `Reference your ${seller.credential} credential.` },
      })
    }
  }
  if (seller?.offers_free_consult) {
    if (/\b(free|complimentary)\s+(consult|consultation|call|review)\b/i.test(text.full)) {
      eeatScore += 20
      eeatFindings.push({ kind: 'ok', label: 'Free consult is surfaced' })
    } else {
      eeatFindings.push({
        kind: 'warn',
        label: 'You offer a free consult but copy does not mention it',
        detail: 'Free-consult mentions raise CTR — surface it in the pitch or first paragraph.',
        fix: { field: 'pitch', hint: 'Mention the free consultation in the pitch.' },
      })
    }
  }
  if (Number(seller?.completed_orders || 0) >= 5) {
    if (/\b\d+\+?\s+(orders|completed|clients|reviews)\b/i.test(text.full)) {
      eeatScore += 15
      eeatFindings.push({ kind: 'ok', label: 'Order / client volume referenced' })
    } else {
      eeatFindings.push({
        kind: 'warn',
        label: `${seller?.completed_orders} completed orders not referenced in copy`,
        detail: 'Concrete order counts are stronger trust signals than abstract claims.',
        fix: { field: 'description', hint: `Reference the ${seller?.completed_orders} completed orders you have shipped.` },
      })
    }
  }
  if (Number(seller?.response_hours || 0) > 0 && Number(seller?.response_hours || 24) <= 24) {
    if (/\b(within|in)\s+\d+\s*(hours?|hrs?|h)\b/i.test(text.full)) {
      eeatScore += 10
      eeatFindings.push({ kind: 'ok', label: 'Response window referenced' })
    } else {
      eeatFindings.push({
        kind: 'warn',
        label: 'Fast response time not referenced',
        detail: 'A specific response window ("within 4 hours") is a high-trust micro-signal.',
        fix: { field: 'pitch', hint: `Mention typical response time of ${seller?.response_hours} hours.` },
      })
    }
  }
  if (!seller) {
    eeatFindings.push({ kind: 'warn', label: 'Seller credibility profile unavailable', detail: 'Could not load profile signals — make sure consultant / attorney profile fields are filled.' })
  }
  eeatScore = Math.min(100, eeatScore)

  // ------- 6. SNIPPET ENGINEERING -------
  const finalTitle = (gig.seo_title || gig.title || '').toString()
  const finalMeta = (gig.seo_description || gig.pitch || '').toString()
  const primaryKeyword = strategic[0]?.term || (clusterBag[0]?.term ?? null)
  const leadsWithPrimary = !!primaryKeyword && primaryKeyword
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .some((tok) => containsCi(finalTitle.slice(0, 30), tok))
  const ctaRegex = new RegExp(`\\b(${CTA_VERBS.join('|')})\\b`, 'i')
  const hasCtaVerb = ctaRegex.test(finalMeta)
  const firstParaSnippet = String(gig.description || '').slice(0, 160)
  const snippet: SnippetEngineering = {
    finalTitle, finalMeta, titleLen: finalTitle.length, metaLen: finalMeta.length,
    primaryKeyword, leadsWithPrimary, hasCtaVerb, firstParaSnippet,
  }
  const snippetFindings: SectionFinding[] = []
  let snippetScore = 0
  if (finalTitle.length > 0 && finalTitle.length <= 60) {
    snippetScore += 25
    snippetFindings.push({ kind: 'ok', label: `Title ${finalTitle.length}/60 chars — within Google's mobile cutoff` })
  } else {
    snippetFindings.push({
      kind: 'fail',
      label: finalTitle.length > 60 ? `Title is ${finalTitle.length}/60 chars — Google will truncate` : 'Title is empty',
      fix: { field: finalTitle === gig.seo_title ? 'seo_title' : 'title', hint: 'Trim to <= 60 chars without losing the primary keyword.' },
    })
  }
  if (leadsWithPrimary) {
    snippetScore += 25
    snippetFindings.push({ kind: 'ok', label: 'Title leads with the primary keyword (first 30 chars)' })
  } else if (primaryKeyword) {
    snippetFindings.push({
      kind: 'fail',
      label: 'Title does not lead with the primary keyword',
      detail: `Primary keyword "${primaryKeyword}" should appear in the first 30 characters.`,
      fix: { field: 'seo_title', hint: `Rewrite SEO title to lead with "${primaryKeyword}" in the first 30 characters.` },
    })
  }
  if (finalMeta.length >= 120 && finalMeta.length <= 160) {
    snippetScore += 25
    snippetFindings.push({ kind: 'ok', label: `Meta description ${finalMeta.length}/160 — within snippet cutoff` })
  } else {
    snippetFindings.push({
      kind: 'fail',
      label: finalMeta.length > 160 ? `Meta description is ${finalMeta.length}/160 — will truncate` : `Meta description is ${finalMeta.length}/120 — too short for the snippet box`,
      fix: { field: 'seo_description', hint: 'Hit 120-160 chars, primary keyword in first 60, end with a CTA verb.' },
    })
  }
  if (hasCtaVerb) {
    snippetScore += 15
    snippetFindings.push({ kind: 'ok', label: 'Meta description carries a CTA verb' })
  } else {
    snippetFindings.push({
      kind: 'warn',
      label: 'Meta description has no CTA verb',
      detail: 'A CTA verb ("book", "get", "review", "compare") lifts CTR from the SERP.',
      fix: { field: 'seo_description', hint: 'End the meta description with a CTA verb (book, get, review, talk to).' },
    })
  }
  // First 160 chars of description should answer the query, not just introduce the seller.
  const introductoryRegex = /^(\s*)(welcome|hello|hi|hey|i am|i'm|my name|about me|about my service)/i
  if (firstParaSnippet && !introductoryRegex.test(firstParaSnippet)) {
    snippetScore += 10
    snippetFindings.push({ kind: 'ok', label: 'Description opens on the buyer\'s question, not a self-intro' })
  } else if (firstParaSnippet) {
    snippetFindings.push({
      kind: 'warn',
      label: 'Description opens with a self-intro',
      detail: 'Open with the buyer\'s question or the deliverable — that\'s what Google pulls into the snippet.',
      fix: { field: 'description', hint: 'Rewrite the first sentence to open with the buyer\'s question or the concrete deliverable.' },
    })
  }
  snippetScore = Math.min(100, snippetScore)

  // ------- 7. INTERNAL-LINK SURFACE -------
  // We use the same subcategory-affinity tokens as the suggest router
  // (we can't import the unexported helper, so we approximate via the
  // strategic-keyword bag — siblings that share >=1 strategic keyword
  // with this gig form a healthy internal-link surface).
  const siblingOverlaps = siblings
    .filter((s) => s.id !== gig.id)
    .map((s) => {
      const text2 = (s.title || '') + ' ' + (s.seo_title || '')
      const shared = clusterBag.filter((k) => containsCi(text2, k.term)).length
      return { sibling: s, shared }
    })
    .filter((x) => x.shared > 0)
  const linkFindings: SectionFinding[] = []
  let linkScore = 0
  if (siblings.length === 0) {
    linkFindings.push({ kind: 'warn', label: 'No sibling gigs to internal-link from', detail: 'Add a second gig — sidebars internal-link via cluster overlap, which lifts topical authority.' })
  } else if (siblingOverlaps.length >= 2) {
    linkScore += 60
    linkFindings.push({ kind: 'ok', label: `${siblingOverlaps.length} sibling gigs share cluster overlap — internal-link ready` })
  } else if (siblingOverlaps.length === 1) {
    linkScore += 30
    linkFindings.push({ kind: 'warn', label: 'Only 1 sibling gig shares cluster overlap', detail: 'Add a second gig in the same cluster for stronger topical authority.' })
  } else {
    linkFindings.push({ kind: 'warn', label: 'No sibling gigs share cluster overlap', detail: 'Without overlap, sidebar widgets cannot internal-link by topic — your siblings are in different clusters.' })
  }
  // Subcategory affinity — give credit if tags reflect the subcategory.
  if (sub && (text.tags || []).some((tg) => containsCi(tg, sub.replace(/-/g, ' ')))) {
    linkScore += 40
    linkFindings.push({ kind: 'ok', label: 'Tags reflect the chosen subcategory' })
  } else if (sub) {
    linkFindings.push({
      kind: 'warn',
      label: 'No tag matches the chosen subcategory',
      detail: 'A subcategory-aligned tag drives marketplace internal-linking.',
      fix: { field: 'tags', hint: `Add a tag aligned to the "${sub}" subcategory.` },
    })
  }
  linkScore = Math.min(100, linkScore)

  // ------- 8. GSC ALIGNMENT -------
  const gscEnabled = !!(gscSignals && gscSignals.length > 0)
  const gscFindings: SectionFinding[] = []
  let gscScore = 0
  let gscWeight = 10
  if (gscEnabled) {
    // Queries Google shows for this slice — credit copy that contains them.
    let inCopy = 0
    let gaps = 0
    for (const sig of gscSignals!) {
      const hits = containsCi(text.full, sig.term)
      if (hits) inCopy += 1
      else gaps += 1
    }
    const ratio = inCopy / Math.max(1, gscSignals!.length)
    gscScore = Math.round(ratio * 100)
    if (ratio >= 0.5) gscFindings.push({ kind: 'ok', label: `Copy mentions ${inCopy}/${gscSignals!.length} of the top Google queries` })
    else gscFindings.push({ kind: 'fail', label: `Copy mentions only ${inCopy}/${gscSignals!.length} of the top Google queries`, detail: 'You rank for queries you don\'t mention — adding them to the description lifts CTR and signal strength.' })
    if (gaps > 0) {
      const topGaps = gscSignals!.filter((s) => !containsCi(text.full, s.term)).slice(0, 3)
      for (const g2 of topGaps) {
        gscFindings.push({
          kind: 'warn',
          label: `Google shows you for "${g2.term}" (${g2.impressions} impressions, pos ${g2.position.toFixed(1)}) but copy doesn't mention it`,
          fix: { field: 'description', hint: `Weave the query "${g2.term}" into the description — Google already shows you for it.` },
        })
      }
    }
  } else {
    gscWeight = 0 // section skipped, renormalize.
  }

  // ------- 9. VOICE / AI-TELL HYGIENE -------
  const bannedPhrasesFound: string[] = []
  const lowered = (text.desc + ' ' + text.pitch).toLowerCase()
  for (const phrase of BANNED_AI_TELLS) {
    if (lowered.includes(phrase.toLowerCase())) bannedPhrasesFound.push(phrase)
  }
  const voiceFindings: SectionFinding[] = []
  let voiceScore = 100
  if (bannedPhrasesFound.length > 0) {
    voiceScore = Math.max(0, 100 - bannedPhrasesFound.length * 25)
    voiceFindings.push({
      kind: 'fail',
      label: `${bannedPhrasesFound.length} banned AI tell${bannedPhrasesFound.length > 1 ? 's' : ''} detected`,
      detail: `Found: ${bannedPhrasesFound.slice(0, 4).map((p) => `"${p}"`).join(', ')}. Machine-generated content scaffolding sometimes leaks into prose — rewrite from the buyer's specific situation.`,
      fix: { field: 'description', hint: `Rewrite the description to remove AI tells: ${bannedPhrasesFound.slice(0, 3).join(', ')}.` },
    })
  } else {
    voiceFindings.push({ kind: 'ok', label: 'No banned AI tells in pitch or description' })
  }

  // Optional niche-authority guidance — surfaced as info-only findings.
  for (const play of getNicheAuthorityPlays(cat, sub)) {
    voiceFindings.push({ kind: 'warn', label: 'Niche-authority play recommended', detail: play.split('\n')[0] })
  }

  // ------- SECTIONS + OVERALL -------
  const sections: SectionResult[] = [
    {
      id: 'cluster_coverage', label: 'Keyword cluster coverage', score: clusterScore, weight: 25,
      findings: clusterFindings,
      summary: primaryCluster
        ? `${clusterCovered.length}/${clusterBag.length} keywords covered in the ${primaryCluster} cluster`
        : 'No primary cluster matched',
    },
    {
      id: 'intent_diversity', label: 'Intent diversity', score: intentScore, weight: 15,
      findings: intentFindings,
      summary: `${intentCovered}/7 buyer-intent buckets covered`,
    },
    {
      id: 'jurisdiction_alignment', label: 'Jurisdiction alignment', score: jxScore, weight: 10,
      findings: jxFindings,
      summary: isValidJx ? `Jurisdiction signals: ${jxScore}/100` : 'No jurisdiction set',
    },
    {
      id: 'schema_readiness', label: 'Schema.org readiness', score: schemaScore, weight: 12,
      findings: schemaFindings,
      summary: `${schemaChecks.filter((c) => c.eligible).length}/${schemaChecks.length} rich-result schemas eligible`,
    },
    {
      id: 'eeat_surfacing', label: 'E-E-A-T trust surfacing', score: eeatScore, weight: 10,
      findings: eeatFindings,
      summary: `E-E-A-T signals: ${eeatScore}/100`,
    },
    {
      id: 'snippet_engineering', label: 'Snippet engineering', score: snippetScore, weight: 10,
      findings: snippetFindings,
      summary: `SERP snippet readiness: ${snippetScore}/100`,
    },
    {
      id: 'internal_link_surface', label: 'Internal-link surface', score: linkScore, weight: 8,
      findings: linkFindings,
      summary: `${siblingOverlaps.length} sibling gig${siblingOverlaps.length === 1 ? '' : 's'} share cluster overlap`,
    },
    {
      id: 'gsc_alignment', label: 'Live Search Console alignment', score: gscScore, weight: gscWeight,
      findings: gscFindings,
      summary: gscEnabled ? `Live GSC alignment: ${gscScore}/100` : 'No live Search Console data available',
    },
    {
      id: 'voice_hygiene', label: 'Voice / AI-tell hygiene', score: voiceScore, weight: 5,
      findings: voiceFindings,
      summary: bannedPhrasesFound.length === 0 ? 'No AI tells found' : `${bannedPhrasesFound.length} AI tell(s) found`,
    },
  ]

  // Renormalize weights when GSC section is disabled so the headline
  // score stays comparable across environments.
  const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0)
  const overall = Math.round(
    sections.reduce((sum, s) => sum + (s.score * s.weight), 0) / Math.max(1, totalWeight),
  )

  return {
    overall,
    sections,
    primaryCluster,
    clusterCoverage,
    intent,
    snippet,
    schemaChecks,
    cannibalizationWarnings,
    bannedPhrasesFound,
    gscEnabled,
    strategicCovered: strategic.filter((k) => containsCi(text.full, k.term)).map((k) => k.term),
    strategicMissing: strategic.filter((k) => !containsCi(text.full, k.term)).map((k) => k.term),
    intentMissingBuckets,
    intentBucketHints,
  }
}

// Build a projected AuditResult by re-running the audit against a
// patched copy of the gig. The coherent-fix route uses this to compute
// `expectedScoreDelta` BEFORE the seller commits the rewrite. The
// caller is expected to keep `seller`, `siblings`, and `gscSignals`
// stable so the delta isolates the field-level rewrite's impact.
export function projectAuditAfterPatch(
  input: AuditInputs,
  patch: Partial<Pick<AuditGig, 'title' | 'seo_title' | 'seo_description' | 'pitch' | 'description' | 'tags' | 'faq'>>,
): AuditResult {
  const merged: AuditGig = { ...input.gig, ...patch }
  return runSeoAudit({ ...input, gig: merged })
}

// Compute the per-section delta surfaced in the coherent-fix modal.
// `before` is the audit at click-time, `after` is the projected audit
// once the rewrite is patched in. Sections that don't move are pruned.
export interface ExpectedScoreDelta {
  current: number
  projected: number
  deltaBySection: Array<{ id: SectionId; label: string; delta: number }>
  intentBucketsAdded: IntentBucket[]
}
export function buildExpectedScoreDelta(before: AuditResult, after: AuditResult): ExpectedScoreDelta {
  const map = new Map(before.sections.map((s) => [s.id, s]))
  const deltaBySection: ExpectedScoreDelta['deltaBySection'] = []
  for (const a of after.sections) {
    const b = map.get(a.id)
    if (!b) continue
    const delta = a.score - b.score
    if (delta !== 0) deltaBySection.push({ id: a.id, label: a.label, delta })
  }
  deltaBySection.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  const beforeBuckets = new Set<IntentBucket>(
    (Object.keys(before.intent.buckets) as IntentBucket[]).filter((b) => before.intent.buckets[b].length > 0),
  )
  const intentBucketsAdded = (Object.keys(after.intent.buckets) as IntentBucket[])
    .filter((b) => after.intent.buckets[b].length > 0 && !beforeBuckets.has(b))
  return {
    current: before.overall,
    projected: after.overall,
    deltaBySection,
    intentBucketsAdded,
  }
}

// Loose token-overlap check: if at least two non-stopword tokens from
// the keyword appear in the surface text, treat as covered. This
// prevents the audit from punishing rephrased variants ("personal
// statement editor" vs "personal statement editing service").
function hasAnyTokenOverlap(haystack: string, needle: string): boolean {
  const STOP = new Set(['the', 'a', 'an', 'for', 'and', 'of', 'in', 'on', 'to', 'with', 'your', 'you', 'is', 'are', '2026', '2025'])
  const tokens = needle.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t))
  if (tokens.length < 2) return false
  const hay = haystack.toLowerCase()
  let hits = 0
  for (const t of tokens) if (hay.includes(t)) hits += 1
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.6))
}
