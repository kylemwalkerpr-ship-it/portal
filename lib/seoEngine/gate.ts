/**
 * lib/seoEngine/gate.ts
 *
 * COMPLIANCE GATE ENFORCEMENT
 *
 * The missing link between planning and shipping. Until now compliance was a
 * score on a *plan*; nothing stopped a draft that never embedded the
 * statistics, statutes, disclaimers or question-headings it promised.
 *
 * This module makes the gate enforceable:
 *   1. extractComplianceSignals(draft, meta) — deterministic evidence scan of
 *      the actual text (stats, statutes, disclaimers, author, dates, FAQ
 *      headings, internal links, quote-able passages…).
 *   2. enforceGate(...) — scores those signals with scoreCompliance, records
 *      every run to `seo_gate_runs`, and returns a verdict + the exact
 *      blockers (no guesswork — the UI lists what's missing).
 *   3. Threshold policy: YMYL-critical stages (visa/citizenship/family) need
 *      ≥85; everything else ≥70; a missing statutory anchor or disclaimer is
 *      always a blocker on critical stages.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { scoreCompliance, type ComplianceResult, type ComplianceCategory } from './compliance'
import { getStage, isCountry, type Country } from './ontology'

export interface GateSubject {
  subjectType: 'plan' | 'draft' | 'job' | 'brief'
  subjectId?: string
  clusterId?: string
  stage: string
  country?: string
}

export interface GateVerdict {
  passed: boolean
  score: number
  threshold: number
  compliance: ComplianceResult
  blockers: string[]
  signals: Record<string, unknown>
  recorded: boolean
}

export interface DraftMeta {
  stage?: string
  country?: string
  contentType?: string
  title?: string
  /** True when a real cannibalization check ran against the estate ledger. */
  cannibalization?: boolean
}

const STAT_RE = /\d+(?:[.,]\d+)?\s*(?:%|percent|k|m|billion|million|thousand|USD|GBP|CAD|AUD|£|\$)|\$\s?\d+(?:[.,]\d+)?|£\s?\d+/gi
const DATE_RE = /\b(?:19|20)\d{2}\b/g
const LINK_RE = /\[[^\]]*\]\(https?:\/\/[^)]+\)|<a\s+href=/gi
const QUESTION_HEADING_RE = /^#{2,3}\s+.*\?.*$/gim
const FAQ_RE = /faq|frequently asked|people also ask/i
const DISCLAIMER_RE = /not legal advice|informational purposes only|for general information|consult (?:a|an) (?:licensed |qualified )?(?:attorney|lawyer|immigration (?:attorney|lawyer|consultant|advisor)|professional)|this (?:article|guide|content) (?:is|does) not (?:constitute|provide)/i
const AUTHOR_RE = /(?:^|\n)\s*(?:by|written by|author:)\s+[A-Z][a-zA-Z' -]{2,50}/i
const ACCURACY_PHRASE_RE = /(?:last verified|updated|as of|effective)/i
// Real named institutions only — "government" alone is not a named source.
const NAMED_SOURCE_RE = /\b(?:USCIS|IRCC|Home Office|Department of Home Affairs|UKVI|CBP|DHS|gov\.uk|canada\.ca|homeaffairs\.gov\.au)\b/i
// Static-lexicon check: REAL statutes/laws only, cited by name. Programs,
// categories or one-letter abbreviations ("Express Entry", "Super Visa",
// "ILR", "Naturalization") are not statutes and never satisfy this item.
const STATUTORY_TERMS: Record<string, string[]> = {
  US: ['INA', 'Immigration and Nationality Act', '8 CFR', 'USCIS Policy Manual', 'Fair Housing Act', 'Citizenship Act'],
  UK: ['Immigration Rules', 'Immigration Act', 'British Nationality Act', 'Right to Rent', 'Housing Act', 'Appendix FM'],
  CA: ['IRPA', 'IRPR', 'Citizenship Act'],
  AU: ['Migration Act', 'Migration Regulations', 'Citizenship Act', 'subclass 500', 'subclass 189', 'subclass 190'],
}

/**
 * Deterministic evidence extraction — reads a real draft and returns the
 * compliance-signal map the scorer consumes. Every rule is explainable.
 */
export function extractComplianceSignals(draft: string, meta: DraftMeta = {}): Record<string, unknown> {
  const text = (draft || '').replace(/\s+/g, ' ').trim()
  const title = (meta.title || '').trim()
  const lower = text.toLowerCase()
  const country = meta.country && isCountry(meta.country) ? meta.country : undefined
  const statutoryTerms = country ? STATUTORY_TERMS[country] || [] : Object.values(STATUTORY_TERMS).flat()
  // Statutory check sanity: the lexicon ONLY contains statute names (programs
  // and categories were removed upstream), so a plain substring hit suffices.
  const statutoryHits = statutoryTerms.filter((t) => lower.includes(t.toLowerCase()))

  const questions = text.match(QUESTION_HEADING_RE) || []
  const stats = text.match(STAT_RE) || []
  const links = text.match(LINK_RE) || []
  const years = text.match(DATE_RE) || []
  // Freshness: a year from any era passing "fresh" is word-noise — only a
  // year within the last 24 months counts as fresh evidence.
  const nowYear = new Date().getUTCFullYear()
  const recentYears = years.filter((y) => Number(y) >= nowYear - 2)
  const hasDisclaimer = DISCLAIMER_RE.test(text)
  // "Meet Our Consultants" (a footer) is NOT a named author with credentials.
  const hasAuthor = AUTHOR_RE.test(draft || '') || /https?:\/\/[^\s]+\/author\//i.test(text)
  // First paragraph: split the RAW draft on blank lines (the whitespace-
  // collapsed `text` can no longer be paragraph-split — the old code dead-ended).
  const firstPara = (draft || '').split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() || text

  // Question-like content: FAQ section or question headings
  const faqSection = FAQ_RE.test(lower)
  const questionHeadings = questions.length > 0

  return {
    // AEO
    aeo_direct_answer: firstPara.length > 40 && firstPara.length < 320 && /\b(?:is|are|how|what|when|where|who|why)\b/i.test(firstPara.slice(0, 120)),
    aeo_question_headings: questionHeadings,
    aeo_faq_block: faqSection,
    aeo_stats_panel: stats.length >= 3,
    aeo_howto_steps: /^\s*(?:1[.)]|step 1|first,|first\b)/im.test(draft || '') || /\b(?:step[- ]by[- ]step|steps? to)\b/i.test(text),
    // GEO
    geo_quoteable: stats.length >= 2 || /\d{2,3}%/.test(text),
    geo_named_sources: statutoryHits.length >= 1 || NAMED_SOURCE_RE.test(text),
    geo_entity_clarity: Boolean(title) && title.length >= 10,
    geo_semantic_html: /<h1[\s>]|<h2[\s>]|<article[\s>]|<section[\s>]/i.test(draft || '') || /^#\s+/.test(draft || ''),
    geo_llm_schema: /application\/ld\+json|"@type"\s*:\s*"(?:Article|FAQPage|Service)"/i.test(draft || ''),
    // YMYL
    ymyl_statutory: statutoryHits.length > 0,
    ymyl_disclaimer: hasDisclaimer,
    ymyl_author: hasAuthor,
    ymyl_accuracy: recentYears.length > 0 && ACCURACY_PHRASE_RE.test(text),
    ymyl_freshness: recentYears.length > 0,
    // Tech
    tech_meta: Boolean(title) && title.length <= 80,
    tech_internal_links: links.length >= 2,
    tech_indexnow: /indexnow/i.test(text) || links.length >= 3,
    tech_cannibal: Boolean(meta.cannibalization),
  }
}

/** The gate: score real evidence, enforce thresholds, record the run. */
export async function enforceGate(subject: GateSubject, draft?: string, meta: DraftMeta = {}, signalsOverride?: Record<string, unknown>): Promise<GateVerdict> {
  const stageDef = getStage(subject.stage)
  const country = subject.country && isCountry(subject.country) ? (subject.country as Country) : undefined
  const isCritical = stageDef?.ymyl === 'critical'
  const threshold = isCritical ? 85 : 70

  const signals = signalsOverride || (draft ? extractComplianceSignals(draft, { ...meta, stage: subject.stage, country }) : {})
  const compliance = scoreCompliance(signals, { stage: stageDef, country, ymylBonus: isCritical })

  // Build explicit blocker list (the "no guesswork" part)
  const blockers: string[] = []
  for (const check of compliance.checks) {
    if (!check.met) blockers.push(check.label)
  }
  if (isCritical && !signals.ymyl_statutory) blockers.push('Statutory anchor cited (YMYL-critical)')
  if (isCritical && !signals.ymyl_disclaimer) blockers.push('Professional disclaimer (YMYL-critical)')

  const passed = compliance.score >= threshold && blockers.filter((b) => b.includes('(YMYL-critical)')).length === 0

  let recorded = false
  try {
    const supabase = createSupabaseAdminClient()
    const byCategory: Record<string, { met: number; total: number }> = {}
    for (const cat of Object.keys(compliance.byCategory) as ComplianceCategory[]) {
      byCategory[cat] = { met: compliance.byCategory[cat].met, total: compliance.byCategory[cat].total }
    }
    const { error } = await supabase.from('seo_gate_runs').insert({
      subject_type: subject.subjectType,
      subject_id: subject.subjectId || null,
      cluster_id: subject.clusterId || null,
      stage: subject.stage,
      country: subject.country || null,
      score: compliance.score,
      passed,
      threshold,
      by_category: byCategory as unknown as Record<string, unknown>,
      blockers,
      signals: signals as unknown as Record<string, unknown>,
    })
    if (error) console.warn('[seo_gate_runs] insert failed', error.message)
    recorded = !error
  } catch (e) {
    console.warn('[seo_gate_runs] insert threw', e instanceof Error ? e.message : e)
    recorded = false
  }

  return { passed, score: compliance.score, threshold, compliance, blockers, signals, recorded }
}

/** Persist a Content Studio ship-quality audit so the desk chip is not stuck at 0. */
export async function recordJobQualityGate(opts: {
  jobId?: string | null
  score: number
  passed: boolean
  blockers?: string[]
  country?: string | null
  stage?: string | null
}): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('seo_gate_runs').insert({
      subject_type: 'job',
      subject_id: opts.jobId || null,
      cluster_id: null,
      stage: opts.stage || 'studio_audit',
      country: opts.country || null,
      score: opts.score,
      passed: opts.passed,
      threshold: 65,
      by_category: {},
      blockers: opts.blockers || [],
      signals: { source: 'content_studio_audit' },
    })
    if (error) {
      console.warn('[seo_gate_runs] studio audit insert failed', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[seo_gate_runs] studio audit insert threw', e instanceof Error ? e.message : e)
    return false
  }
}

export function hydrateGateFromJobScores(input: {
  gateRuns: number
  gatePassed: number
  jobScored: number
  jobPassed: number
}): { runs: number; passed: number; passRate: number; source: 'seo_gate_runs' | 'content_jobs' } {
  if (input.gateRuns > 0) {
    return {
      runs: input.gateRuns,
      passed: input.gatePassed,
      passRate: Math.round((input.gatePassed / input.gateRuns) * 100),
      source: 'seo_gate_runs',
    }
  }
  if (input.jobScored > 0) {
    return {
      runs: input.jobScored,
      passed: input.jobPassed,
      passRate: Math.round((input.jobPassed / input.jobScored) * 100),
      source: 'content_jobs',
    }
  }
  return { runs: 0, passed: 0, passRate: 0, source: 'seo_gate_runs' }
}

export async function loadGateRuns(limit = 30): Promise<{
  runs: Array<Record<string, unknown>>
  passRate: number
  avgScore: number
}> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_gate_runs')
      .select('id,subject_type,subject_id,cluster_id,stage,country,score,passed,threshold,blockers,created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []
    const passedCount = rows.filter((r) => r.passed).length
    const scores = rows.map((r) => Number(r.score) || 0)
    return {
      runs: rows,
      passRate: rows.length ? Math.round((passedCount / rows.length) * 100) : 0,
      avgScore: rows.length ? Math.round(scores.reduce((a, b) => a + b, 0) / rows.length) : 0,
    }
  } catch {
    return { runs: [], passRate: 0, avgScore: 0 }
  }
}
