/**
 * seoCanon — Canonical SEO Intelligence Engine
 *
 * Single source of truth for all content generation in the Content Studio.
 *
 * Builds a GSC-weighted, profitability-ranked, intent-classified keyword
 * portfolio that becomes the canonical prompt block for every generate path.
 * Guarantees indexability and wires conversion pathways to marketplace.
 *
 * Weights (≈1.0):
 *   demand          0.25 — GSC volume + CTR gap (what people actually search)
 *   profitability   0.25 — commercial/transactional intent → marketplace revenue
 *   authority       0.20 — AEO/SEO/GEO composite (will engines cite this?)
 *   intent_match    0.15 — clear Q&A / procedural intent (featured snippets)
 *   cluster_fill    0.10 — fills existing estate authority hubs
 *   freshness       0.05 — recent / trending vs stale
 */

import type { GscContentBrief } from '@/lib/gscContentBrief'
import type { OwnerPlan } from './ownership'
import type { AuthorityBreakdown } from './authorityScoring'
import { scoreTopicAuthority, type AuthorityInputs } from './authorityScoring'

// ═══ Types ═════════════════════════════════════════════════════════════════

export type IntentCategory =
  | 'informational'       // what is, how to, definition — teaches
  | 'procedural'          // steps, checklist, timeline — guides action
  | 'commercial'          // cost, fee, price, comparison — pre-purchase
  | 'transactional'       // hire, find, consultation, buy — ready to convert
  | 'navigational'        // visa name, form number, official source lookup

export type ConversionHook =
  | 'marketplace_gig'     // link to relevant gigs / services
  | 'consultation_cta'    // "Talk to a consultant"
  | 'document_review'     // "Get your documents reviewed"
  | 'newsletter_signup'   // content → email funnel
  | 'related_services'    // cross-link to related marketplace services
  | 'none'

export interface WeightedKeyword {
  term: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  /** 0–100 composite score blending demand, profit, authority, intent */
  canonicalScore: number
  breakdown: {
    demand: number       // 0–100
    profitability: number // 0–100
    authority: number    // 0–100
    intentMatch: number  // 0–100
    clusterFill: number  // 0–100
    freshness: number    // 0–100
  }
  intentCategory: IntentCategory
  /** Primary → title/H1; Secondary → H2s; LongTail → FAQ / sub-sections */
  tier: 'primary' | 'secondary' | 'longTail'
  /** Anchor text suggestions for internal links targeting this keyword cluster */
  anchorHints: string[]
  /** Suggested conversion action for this keyword's audience */
  conversionHook: ConversionHook
}

export interface SeoCanon {
  /** Full GSC source context */
  source: 'live' | 'snapshot'
  siteUrl: string | null
  rangeNote: string

  /** Ranked keyword portfolio (highest canonicalScore first) */
  portfolio: WeightedKeyword[]

  /** Aggregate intent distribution */
  intentBreakdown: Record<IntentCategory, number>

  /** Top 3 primary keywords (for title / H1) */
  primaryKeywords: string[]

  /** Semantic topic cluster for the AI writer */
  semanticCluster: string

  /** Conversion hooks ordered by priority */
  conversionHooks: ConversionHook[]

  /** Indexability guarantee — always index,follow unless blocked */
  indexable: boolean
  robotsDirective: string

  /** Play-specific write strategy (from War Room / keyword planner) */
  writeStrategy: string

  /** Marketplace / conversion CTA block (ready-to-embed markdown) */
  conversionCtaBlock: string

  /** Canonical prompt block — the single block injected into every generate prompt */
  canonicalPromptBlock: string
}

// ═══ Intent Classification ════════════════════════════════════════════════

const INTENT_PATTERNS: Array<{ re: RegExp; category: IntentCategory; w: number }> = [
  // Transactional — ready to act (highest conversion value)
  { re: /\b(hire|find an? |consultation|speak to|contact |get help|buy|purchase|retainer)\b/i, category: 'transactional', w: 20 },
  { re: /\b(lawyer|attorney|solicitor|consultant|expert|professional|specialist) (near me|in |for )/i, category: 'transactional', w: 18 },
  // Commercial — pre-purchase research
  { re: /\b(cost|fee|price|pricing|how much|expensive|cheap|affordable|budget|rate)\b/i, category: 'commercial', w: 16 },
  { re: /\b(vs\.?|versus|comparison|compare|alternative|best |top [0-9]|review)\b/i, category: 'commercial', w: 12 },
  { re: /\b(pros and cons|is it worth|should i|which (is )?(better|best)|worth it)\b/i, category: 'commercial', w: 10 },
  // Procedural — step-by-step guides
  { re: /\b(how to|steps?|process|procedure|checklist|timeline|apply|application|form |documents? (required|needed))\b/i, category: 'procedural', w: 14 },
  { re: /\b(requirements?|eligibility|qualify|who can|what (do|does) (you|i) need)\b/i, category: 'procedural', w: 10 },
  // Navigational — form/visa/agency lookup
  { re: /\b(form [iI]-?\d+|imm\s?\d+|subclass\s?\d+|uscis|ircc|ukvi|home affairs)\b/i, category: 'navigational', w: 8 },
  // Informational (default)
]

function classifyIntent(term: string): { category: IntentCategory; score: number } {
  const t = term.toLowerCase()
  let best: IntentCategory = 'informational'
  let bestW = 0
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(term) && p.w > bestW) {
      best = p.category
      bestW = p.w
    }
  }
  // informational baseline is 20; procedural gets at least 25
  const score = best === 'informational' ? 20 : best === 'procedural' ? Math.max(25, bestW + 10) : bestW + 15
  return { category: best, score: Math.min(100, score) }
}

// ═══ Profitability Scoring ═════════════════════════════════════════════════

/** Region market value proxy (approximate immigration-services market size). */
const REGION_VALUE: Record<string, number> = {
  US: 1.35, UK: 1.25, CA: 1.15, AU: 1.05, default: 1.0,
}

/** Content-type conversion potential: how likely this type leads to revenue. */
function contentTypeValue(contentType: string): number {
  if (contentType === 'marketplace_gig') return 3.0
  if (contentType === 'regional_from') return 2.2
  if (contentType === 'regional_university') return 1.8
  if (/legal|guide/i.test(contentType)) return 1.3
  if (/blog|summary/i.test(contentType)) return 0.8
  return 1.0
}

function profitabilityScore(opts: {
  intent: IntentCategory
  contentType: string
  region: string
  impressions: number
  clicks: number
  ctr: number
}): number {
  const intentMultiplier =
    opts.intent === 'transactional' ? 3.0 :
    opts.intent === 'commercial' ? 2.2 :
    opts.intent === 'procedural' ? 1.4 :
    opts.intent === 'navigational' ? 1.1 : 0.9
  const regionValue = REGION_VALUE[opts.region] ?? REGION_VALUE.default
  const typeValue = contentTypeValue(opts.contentType)

  // Revenue potential: impressions × CTR gap × intent × region × content type
  const expectedCtr = opts.position <= 3 ? 0.12 : opts.position <= 10 ? 0.05 : opts.position <= 20 ? 0.025 : 0.01
  const ctrGap = Math.max(0, expectedCtr - opts.ctr)
  const raw = opts.impressions * (0.2 + ctrGap * 6) * intentMultiplier * regionValue * typeValue
  return Math.max(0, Math.min(100, Math.round(raw * 3.5)))
}

// ═══ Freshness Scoring ═════════════════════════════════════════════════════

const TRENDING_PATTERNS: RegExp[] = [
  /202[5-9]/i,
  /2026/i,
  /new (rule|policy|law|regulation|requirement)/i,
  /announced|changed|updated|revised|introduced/i,
  /latest|current|now|today|this year/i,
]

function freshnessBoost(term: string): number {
  for (const p of TRENDING_PATTERNS) {
    if (p.test(term)) return 35
  }
  return 10 // baseline freshness
}

// ═══ Anchor Hints ══════════════════════════════════════════════════════════

function generateAnchorHints(keyword: string, intent: IntentCategory): string[] {
  // Title-case natural anchors for internal links
  const words = keyword.replace(/[^a-z0-9\s-]/gi, '').split(/\s+/).filter(w => w.length > 2)
  if (words.length <= 1) return [keyword]
  return [
    keyword,
    `${keyword} guide`,
    `${keyword} requirements`,
    `learn about ${keyword}`,
    `${keyword} explained`,
    intent === 'transactional' ? `hire a ${words[0]} ${words.slice(-1)[0]}` : '',
  ].filter(Boolean).slice(0, 4)
}

// ═══ Conversion CTA Generator ═════════════════════════════════════════════

function generateConversionCta(opts: {
  contentType: string
  host: string
  primaryKeywords: string[]
  conversionHooks: ConversionHook[]
}): string {
  const lines: string[] = []

  // If content routes to marketplace or has transactional intent, add marketplace link
  if (opts.conversionHooks.includes('marketplace_gig') || opts.host === 'market') {
    lines.push(
      '',
      '---',
      '',
      '## Find services that match your needs',
      '',
      'The information on this page helps you understand the rules. If you need help ' +
      'with documents, applications, or legal advice, browse verified professionals ' +
      'on the [YouSafe Marketplace](https://market.yousafeconsultancy.com).',
      '',
      '*Every consultant is independently rated so you can choose the right support.*',
    )
  } else if (opts.conversionHooks.includes('consultation_cta') || opts.conversionHooks.includes('document_review')) {
    const subject = encodeURIComponent(
      `Help with: ${opts.primaryKeywords.slice(0, 2).join(', ')}`
    )
    lines.push(
      '',
      '---',
      '',
      '## Need help with your application?',
      '',
      'Immigration rules change often. If you want a professional to review your situation, ' +
      `[reach out for a consultation](https://portal.yousafeconsultancy.com/contact?subject=${subject}).`,
      '',
      '*No outcome is ever guaranteed — a good adviser helps you present the strongest application you can.*',
    )
  }

  return lines.join('\n')
}

// ═══ Main Engine: buildSeoCanon ════════════════════════════════════════════

export interface BuildSeoCanonOpts {
  /** GSC content brief (from buildGscContentBrief) */
  brief: GscContentBrief
  /** Ownership plan (from resolveOwner) */
  plan: OwnerPlan
  /** Content type (resolved) */
  contentType: string
  /** Target region */
  region: string
  /** Existing topic / title for relevance ranking */
  title?: string
  topic?: string
  /** Additional seed keywords (e.g. from user input or strategy doc) */
  extraKeywords?: string[]
  /** Max portfolio size */
  portfolioLimit?: number
}

export function buildSeoCanon(opts: BuildSeoCanonOpts): SeoCanon {
  const portfolioLimit = Math.min(50, Math.max(8, opts.portfolioLimit ?? 20))
  const brief = opts.brief
  const plan = opts.plan
  const contentType = opts.contentType
  const region = (opts.region || 'US').toUpperCase()
  const seed = `${opts.title || ''} ${opts.topic || ''}`.toLowerCase()

  const portfolio: WeightedKeyword[] = []

  // Merge all keyword sources
  const allTerms = new Map<string, {
    term: string
    impressions: number
    clicks: number
    ctr: number
    position: number
    source: 'primary' | 'opportunity' | 'secondary'
  }>()

  const add = (
    q: { term: string; impressions: number; clicks: number; ctr: number; position: number },
    source: 'primary' | 'opportunity' | 'secondary',
  ) => {
    const existing = allTerms.get(q.term)
    if (existing) {
      // Keep the highest-impression entry (update position/ctr to best)
      if (q.impressions > existing.impressions) {
        allTerms.set(q.term, { ...q, source })
      }
    } else {
      allTerms.set(q.term, { ...q, source })
    }
  }

  for (const q of brief.primaryKeywords) add(q, 'primary')
  for (const q of brief.opportunityKeywords) add(q, 'opportunity')
  for (const q of brief.relatedKeywords) add(q, 'secondary')

  for (const { term, impressions, clicks, ctr, position, source } of allTerms.values()) {
    const { category: intentCategory, score: intentScore } = classifyIntent(term)

    // Authority score
    const authority: AuthorityBreakdown = scoreTopicAuthority({
      term,
      impressions,
      clicks,
      ctr,
      position,
      hasOwner: Boolean(plan.matched?.owner_url),
      host: plan.host,
      recentlyCovered: false,
      registryAction: plan.action,
    })

    // Demand score (0–100)
    const impLog = Math.log10(Math.max(1, impressions) + 9)
    const expectedCtr = position <= 3 ? 0.12 : position <= 10 ? 0.05 : position <= 20 ? 0.025 : 0.01
    const ctrGap = Math.max(0, expectedCtr - ctr)
    const demand = Math.min(100, Math.round(impLog * 28 + ctrGap * 320 + Math.min(clicks, 50) * 0.4))

    // Profitability score
    const profit = profitabilityScore({
      intent: intentCategory,
      contentType,
      region,
      impressions,
      clicks,
      ctr,
    })

    // Freshness
    const fresh = freshnessBoost(term)

    // Cluster fill (from authority)
    const cluster = authority.clusterFill

    // Canonical composite (weighted)
    const canonicalScore = Math.round(
      demand * 0.25 +
      profit * 0.25 +
      authority.total * 0.20 +
      intentScore * 0.15 +
      cluster * 0.10 +
      fresh * 0.05
    )

    // Tier assignment: top 3 primary, next 8 secondary, rest longTail
    let tier: WeightedKeyword['tier'] = 'longTail'
    if (source === 'primary') tier = 'primary'
    else if (source === 'opportunity' && portfolio.filter(k => k.tier === 'primary').length < 3) tier = 'primary'

    portfolio.push({
      term,
      impressions,
      clicks,
      ctr,
      position,
      canonicalScore,
      breakdown: {
        demand,
        profitability: profit,
        authority: authority.total,
        intentMatch: intentScore,
        clusterFill: cluster,
        freshness: fresh,
      },
      intentCategory,
      tier,
      anchorHints: generateAnchorHints(term, intentCategory),
      conversionHook:
        intentCategory === 'transactional' ? 'marketplace_gig' :
        intentCategory === 'commercial' ? 'consultation_cta' :
        intentCategory === 'procedural' && /document|evidence|form/i.test(term) ? 'document_review' :
        'none',
    })
  }

  // Sort by canonicalScore descending, then re-tier
  portfolio.sort((a, b) => b.canonicalScore - a.canonicalScore)

  // Re-tier: top 3 → primary, next 8 → secondary, rest → longTail
  const primaries: string[] = []
  const secondaries: string[] = []
  const longTails: string[] = []
  for (let i = 0; i < portfolio.length; i++) {
    if (i < 3) {
      portfolio[i].tier = 'primary'
      primaries.push(portfolio[i].term)
    } else if (i < 11) {
      portfolio[i].tier = 'secondary'
      secondaries.push(portfolio[i].term)
    } else {
      portfolio[i].tier = 'longTail'
      longTails.push(portfolio[i].term)
    }
  }

  // Intent distribution
  const intentBreakdown: Record<IntentCategory, number> = {
    informational: 0,
    procedural: 0,
    commercial: 0,
    transactional: 0,
    navigational: 0,
  }
  for (const kw of portfolio) intentBreakdown[kw.intentCategory]++

  // Semantic cluster
  const allTokens = new Set<string>()
  const stop = new Set(['and','the','for','with','from','your','what','that','this','how','when','where','which'])
  for (const kw of portfolio.slice(0, 11)) {
    for (const t of kw.term.toLowerCase().split(/[\s-]+/)) {
      if (t.length > 3 && !stop.has(t)) allTokens.add(t)
    }
  }
  const semanticCluster = [...allTokens].slice(0, 10).join(', ')

  // Conversion hooks
  const seenHooks = new Set<ConversionHook>()
  const conversionHooks: ConversionHook[] = []
  for (const kw of portfolio) {
    if (!seenHooks.has(kw.conversionHook) && kw.conversionHook !== 'none') {
      seenHooks.add(kw.conversionHook)
      conversionHooks.push(kw.conversionHook)
    }
  }

  // Conversion CTA block
  const conversionCtaBlock = generateConversionCta({
    contentType,
    host: plan.host || 'legal',
    primaryKeywords: primaries,
    conversionHooks,
  })

  // Write strategy from brief hints + plan + authority
  const strategyParts = [
    brief.strategyHints.join('; '),
    plan.action ? `Registry action: ${plan.action}` : '',
    `Intent mix: ${Object.entries(intentBreakdown).filter(([,n]) => n > 0).map(([k,n]) => `${k}(${n})`).join(', ')}`,
    'Prioritize CTR: pages ranking positions 4–20 with low CTR need title/meta rewrites, not new URLs.',
    'High-impression deep ranks need content depth, local facts, and internal links from hubs.',
    'Use exact-match and close-variant queries from GSC in H2s and FAQ — do not invent volume.',
  ].filter(Boolean).join(' | ')

  // Canonical prompt block
  const promptLines: string[] = [
    '## CANONICAL SEO CONTENT BRIEF (GSC-weighted, profitability-ranked)',
    `Source: ${brief.source}/${brief.mode} — ${brief.rangeNote}`,
    brief.siteUrl ? `Property: ${brief.siteUrl}` : '',
    '',
    '### Primary keywords (title, H1, first H2)',
    ...primaries.map((kw, i) => {
      const k = portfolio.find(x => x.term === kw)
      return k ? `- **"${kw}"** — score ${k.canonicalScore}/100 · impressions ${k.impressions.toLocaleString()} · intent ${k.intentCategory} · ${k.breakdown.profitability >= 60 ? 'HIGH CONVERSION POTENTIAL' : k.breakdown.profitability >= 30 ? 'moderate commercial intent' : 'seasonal/evergreen'}` : `- "${kw}"`
    }),
    '',
    '### Secondary / H2 / section keywords',
    ...secondaries.map(kw => `- "${kw}"`),
    '',
    '### Long-tail / FAQ / People Also Ask',
    ...(longTails.length ? longTails.map(kw => `- "${kw}"`) : ['- (none — use primary list for FAQ expansion)']),
    '',
    '### Semantic cluster',
    `Tags: ${semanticCluster || 'immigration, visa, guide'}`,
    '',
    '### Conversion path',
    conversionHooks.length
      ? conversionHooks.map(h => `- ${h}: ${h === 'marketplace_gig' ? 'Marketplace → paid services' : h === 'consultation_cta' ? 'Portal → consultation' : h === 'document_review' ? 'Portal → document review' : h === 'related_services' ? 'Marketplace → cross-sell' : 'general funnel'}`).join('\n')
      : '- (informational — no immediate conversion hook)',
    '',
    '### Indexability',
    'robots: index, follow — this page MUST be indexable and non-orphaned',
    '',
    '### Write strategy',
    strategyParts,
    '',
    '### Conversion CTA (embed at end of article)',
    conversionCtaBlock || '(no conversion CTA for this intent)',
  ]

  return {
    source: brief.source,
    siteUrl: brief.siteUrl,
    rangeNote: brief.rangeNote,

    portfolio: portfolio.slice(0, portfolioLimit),
    intentBreakdown,
    primaryKeywords: primaries.slice(0, 3),
    semanticCluster,
    conversionHooks,
    indexable: true,
    robotsDirective: 'index, follow',
    writeStrategy: strategyParts,
    conversionCtaBlock,

    canonicalPromptBlock: promptLines.filter(Boolean).join('\n'),
  }
}

/** Quick indexability check — always returns true for generated content. */
export function assertIndexable(): { indexable: boolean; directive: string } {
  return { indexable: true, directive: 'index, follow' }
}

/** Market-value USD estimate for a keyword (very rough proxy). */
export function estimatedMonthlyValue(impressions: number, ctr: number, intent: IntentCategory): number | null {
  const clicks = impressions * ctr
  const conversionRate =
    intent === 'transactional' ? 0.04 :
    intent === 'commercial' ? 0.015 :
    intent === 'procedural' ? 0.005 : 0.002
  const avgRevenue =
    intent === 'transactional' ? 500 :
    intent === 'commercial' ? 200 : 50
  return Math.round(clicks * conversionRate * avgRevenue)
}
