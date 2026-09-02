/**
 * lib/seoEngine/compliance.ts
 *
 * The AEO / GEO / YMYL compliance engine — a deterministic checklist + scorer
 * that every master-planner cluster and generated article must pass before it
 * ships. This operationalises Google's 2026 quality guidance, Answer-Engine
 * Optimization (AI Overviews / Featured Snippets), Generative-Engine
 * Optimization (LLM citations) and YMYL trust requirements.
 *
 * Source of truth (research-verified, 2026):
 *   - Google Search Central: Creating helpful, reliable, people-first content
 *   - Google Search Central: Optimizing for generative AI features
 *   - Google Search Central: SEO link best practices
 *   - Princeton / Georgia Tech GEO study (statistics lift LLM visibility ~40%)
 *   - Search Quality Rater Guidelines (E-E-A-T, YMYL)
 *
 * The scorer is deterministic (no AI) so scores are stable, auditable and
 * explainable in the dashboard. AI is used to *produce* content; compliance
 * verifies it.
 */

import type { ContentType, LifecycleStageDef, Country } from './ontology'

export type ComplianceCategory = 'aeo' | 'geo' | 'ymyl' | 'tech'

export interface ComplianceItem {
  id: string
  category: ComplianceCategory
  label: string
  hint: string
  weight: number
  /** Evidence expected in the brief/content (dashboard shows this as a checklist). */
  evidence: string
}

export interface ComplianceChecklist {
  category: ComplianceCategory
  items: ComplianceItem[]
}

export interface ComplianceResult {
  score: number // 0–100
  passed: boolean
  checks: Array<ComplianceItem & { met: boolean }>
  byCategory: Record<ComplianceCategory, { score: number; met: number; total: number }>
}

// ── The 2026 checklist ────────────────────────────────────────────────────────

const AEO_ITEMS: ComplianceItem[] = [
  {
    id: 'aeo_direct_answer',
    category: 'aeo',
    label: 'Direct answer in first paragraph',
    hint: 'Answer the query in the first 2 sentences of the page (featured snippet / AI Overview position).',
    weight: 5,
    evidence: 'First paragraph directly answers the primary question with a complete sentence.',
  },
  {
    id: 'aeo_question_headings',
    category: 'aeo',
    label: 'Question-form H2/H3s',
    hint: 'Use exact user questions as headings (People Also Ask + LLM retrieval).',
    weight: 4,
    evidence: 'At least 3 H2/H3 headings phrased as real user questions.',
  },
  {
    id: 'aeo_faq_block',
    category: 'aeo',
    label: 'FAQ block',
    hint: 'A self-contained FAQ section with schema markup (FAQPage JSON-LD where eligible).',
    weight: 4,
    evidence: 'FAQPage JSON-LD present and validated.',
  },
  {
    id: 'aeo_stats_panel',
    category: 'aeo',
    label: 'Statistics / data panel',
    hint: 'Verifiable numeric data in a table or list (GEO study: +40% LLM visibility).',
    weight: 4,
    evidence: 'At least 3 sourced statistics with attribution in a table or bulleted list.',
  },
  {
    id: 'aeo_howto_steps',
    category: 'aeo',
    label: 'Steps / procedural list',
    hint: 'Process queries rewarded with numbered steps (visa applications are step-driven).',
    weight: 3,
    evidence: 'Numbered step-by-step section for procedural queries.',
  },
]

const GEO_ITEMS: ComplianceItem[] = [
  {
    id: 'geo_quoteable',
    category: 'geo',
    label: 'Quote-able passages',
    hint: 'Self-contained, cite-able sentences an LLM can lift verbatim.',
    weight: 4,
    evidence: '≥3 standalone sentences that answer fully without page context.',
  },
  {
    id: 'geo_named_sources',
    category: 'geo',
    label: 'Named authoritative sources',
    hint: 'Attribute claims to named authorities (USCIS, IRCC, Home Office, statutes).',
    weight: 4,
    evidence: '≥2 named institutional sources with links per article.',
  },
  {
    id: 'geo_entity_clarity',
    category: 'geo',
    label: 'Entity clarity',
    hint: 'Clear who/what/where — consistent entity naming (brand, services, geography).',
    weight: 3,
    evidence: 'Brand + service + jurisdiction entities stated in first 100 words.',
  },
  {
    id: 'geo_semantic_html',
    category: 'geo',
    label: 'Semantic HTML structure',
    hint: 'article/section/h1–h3 hierarchy — LLM crawlers parse structure.',
    weight: 3,
    evidence: 'Valid h1 (1), h2/h3 hierarchy, article/section landmarks.',
  },
  {
    id: 'geo_llm_schema',
    category: 'geo',
    label: 'Structured data (JSON-LD)',
    hint: 'Article/FAQPage/Service schema — helps RAG grounding across engines.',
    weight: 3,
    evidence: 'Valid Article (or Service) JSON-LD on page.',
  },
]

const YMYL_ITEMS: ComplianceItem[] = [
  {
    id: 'ymyl_statutory',
    category: 'ymyl',
    label: 'Statutory anchors cited',
    hint: 'Reference governing law (INA, IRPA, Immigration Rules, Migration Act) — not just policy pages.',
    weight: 5,
    evidence: '≥1 statute cited by name per country-specific claim.',
  },
  {
    id: 'ymyl_disclaimer',
    category: 'ymyl',
    label: 'Professional disclaimer',
    hint: 'Immigration = YMYL. State content is informational, not legal advice; urge professional review.',
    weight: 5,
    evidence: 'Visible disclaimer near top of page.',
  },
  {
    id: 'ymyl_author',
    category: 'ymyl',
    label: 'Named author + credentials',
    hint: 'Bylines with real people; OISC/CICC/MARA/licensed attorney credentials where relevant.',
    weight: 5,
    evidence: 'Author byline with credential/affiliation, linked author page.',
  },
  {
    id: 'ymyl_accuracy',
    category: 'ymyl',
    label: 'Accuracy date + verification',
    hint: 'Policy changes fast — show last-verified date and official-source links.',
    weight: 4,
    evidence: '“Last verified” date and ≥2 official links (gov domains).',
  },
  {
    id: 'ymyl_freshness',
    category: 'ymyl',
    label: 'Freshness flag',
    hint: 'Dated content older than 120d must trigger a review workflow.',
    weight: 3,
    evidence: 'Last-updated timestamp; review due date in plan.',
  },
]

const TECH_ITEMS: ComplianceItem[] = [
  {
    id: 'tech_meta',
    category: 'tech',
    label: 'Title + meta description',
    hint: 'Compelling, keyword-led title (≤60 chars) and description (≤155).',
    weight: 3,
    evidence: 'Title & meta drafted with CTR focus.',
  },
  {
    id: 'tech_internal_links',
    category: 'tech',
    label: 'Contextual internal links',
    hint: 'Google link best practices: descriptive anchors, every pillar ≥1 contextual inbound link.',
    weight: 4,
    evidence: 'Interlink plan with anchors, min 3 outbound estate links.',
  },
  {
    id: 'tech_indexnow',
    category: 'tech',
    label: 'IndexNow submission',
    hint: 'Submit on ship for Bing/Yandex/Seznam + crawl-request for Google.',
    weight: 2,
    evidence: 'IndexNow key + URL list generated on deploy.',
  },
  {
    id: 'tech_cannibal',
    category: 'tech',
    label: 'Cannibalization guard',
    hint: 'Cluster terms must not overlap existing live pages (checked against cluster ledger).',
    weight: 4,
    evidence: 'Cluster id resolved, no conflicting live URL for primary term.',
  },
]

const CHECKLIST: ComplianceChecklist[] = [
  { category: 'aeo', items: AEO_ITEMS },
  { category: 'geo', items: GEO_ITEMS },
  { category: 'ymyl', items: YMYL_ITEMS },
  { category: 'tech', items: TECH_ITEMS },
]

export function getAllChecks(): ComplianceItem[] {
  return CHECKLIST.flatMap((c) => c.items)
}

/**
 * Deterministic score for a brief/plan/article.
 *
 * Pass a `signals` object produced by inspecting the actual content (or by the
 * planner for a *planned* brief, where evidence is the brief's promises).
 * Signals keys = compliance item ids → boolean (evidence present) or
 * number/string (coerced: non-empty → true).
 */
export function scoreCompliance(
  signals: Record<string, unknown>,
  opts?: { stage?: LifecycleStageDef; country?: Country; contentType?: ContentType; ymylBonus?: boolean },
): ComplianceResult {
  const byCategory: ComplianceResult['byCategory'] = {
    aeo: { score: 0, met: 0, total: AEO_ITEMS.length },
    geo: { score: 0, met: 0, total: GEO_ITEMS.length },
    ymyl: { score: 0, met: 0, total: YMYL_ITEMS.length },
    tech: { score: 0, met: 0, total: TECH_ITEMS.length },
  }
  const checks: ComplianceResult['checks'] = []
  let weightMet = 0
  let weightTotal = 0

  // YMYL-critical stages demand every YMYL check — shown as required badges.
  const ymylRequired = opts?.stage?.ymyl === 'critical' || opts?.ymylBonus === true

  for (const group of CHECKLIST) {
    for (const item of group.items) {
      const raw = signals[item.id]
      const met =
        typeof raw === 'boolean'
          ? raw
          : typeof raw === 'string'
            ? raw.trim().length > 0
            : typeof raw === 'number'
              ? raw > 0
              : Array.isArray(raw)
                ? raw.length > 0
                : false
      weightTotal += item.weight
      if (met) weightMet += item.weight
      byCategory[item.category].met += met ? 1 : 0
      checks.push({ ...item, met })
    }
  }

  for (const cat of Object.keys(byCategory) as ComplianceCategory[]) {
    const c = byCategory[cat]
    c.score = c.total ? Math.round((c.met / c.total) * 100) : 0
    // YMYL-critical content cannot pass with missing statutory anchors or disclaimer.
    if (ymylRequired && cat === 'ymyl' && !signals.ymyl_statutory) c.score = Math.min(c.score, 30)
    if (ymylRequired && cat === 'ymyl' && !signals.ymyl_disclaimer) c.score = Math.min(c.score, 30)
  }

  const score = weightTotal ? Math.round((weightMet / weightTotal) * 100) : 0
  // YMYL-critical content can NEVER pass without the statutory anchor AND the
  // disclaimer — the score may still read high when every OTHER item is met,
  // so `passed` must follow the same rule the enforcement gate uses (G8-era
  // contradiction: compliance.passed=true while enforceGate said BLOCK).
  const statutoryOk = !ymylRequired || Boolean(signals.ymyl_statutory)
  const disclaimerOk = !ymylRequired || Boolean(signals.ymyl_disclaimer)
  const hardGates = statutoryOk && disclaimerOk
  const passed = hardGates && (ymylRequired ? score >= 85 : score >= 70)

  return { score, passed, checks, byCategory }
}

/** The dashboard-facing checklist shape (all items with required flags). */
export function checklistFor(opts?: { stage?: LifecycleStageDef; contentType?: ContentType; ymylRequired?: boolean }): Array<ComplianceItem & { required: boolean }> {
  const ymylRequired = opts?.stage?.ymyl === 'critical' || opts?.ymylRequired === true
  return getAllChecks().map((c) => ({ ...c, required: c.category === 'ymyl' && ymylRequired }))
}

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, { label: string; icon: string }> = {
  aeo: { label: 'Answer Engines', icon: '💬' },
  geo: { label: 'Generative Engines', icon: '🤖' },
  ymyl: { label: 'YMYL Trust', icon: '🛡️' },
  tech: { label: 'Technical', icon: '⚙️' },
}
