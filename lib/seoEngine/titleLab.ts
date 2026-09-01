/**
 * lib/seoEngine/titleLab.ts
 *
 * DETERMINISTIC CTR TITLE FACTORY + SCORER ("TitleLab")
 *
 * The mission template fallbacks produce filler like "Updated Requirements
 * and Guidance for 2026" and "Options, Costs and Trade-Offs in 2026".
 * TitleLab replaces that with keyword-first, CTR-oriented titles built from
 * real components (procedure + audience + year/specific trigger + CTA hook)
 * and scores every candidate on five deterministic axes:
 *
 *   ctr_vocab        30 — numbers, procedure words, audience nouns, action verbs
 *   differentiation  20 — (1 - token Jaccard) vs the nearest sibling title
 *   keyword_presence 15 — the primary keyword is mandatory; a long-tail lifts it
 *   length           15 — 55-65 chars ideal, linear decay outside 45-75
 *   human_style      20 — no filler suffix, no ALLCAPS, no banned words
 *
 * Purely deterministic: no Date.now(), no RNG, no AI. The same input always
 * yields the same candidates, scores, and pick. Ship gates stay the authority —
 * this module is advisory only; it never touches Git or gates.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { titleCaseWords } from '@/lib/seoFactory/formatContract'

export const DEFAULT_YEAR = 2026

export interface TitleCandidate {
  title: string
  score: number
  breakdown: Record<string, number>
}

export interface TitleLabInput {
  primaryKeyword: string
  audienceNoun?: string
  procedureNoun?: string
  year?: number
  stageLabel?: string
  country?: string
  siblingTitles?: string[]
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
}

export interface TitleScoreContext {
  primaryKeyword: string
  siblingTitles?: string[]
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
}

export interface TitleHistoryRow {
  missionId?: string
  clusterId?: string
  title: string
  score: number
  breakdown?: Record<string, number>
  chosen?: boolean
  source?: string
}

// ── Filler detection: exactly the junk templates ship today ────────────────
// Any of "updated requirements and guidance" / "options, costs and
// trade-offs" / "guide" / "guidance" immediately followed by a year (with an
// optional and/for/in/of/on preposition) is a template-filler title.
const FILLER_SUFFIX_RE =
  /(?:updated requirements and guidance|options, costs and trade-offs|guide|guidance)(?:\s+(?:and|for|in|of|on))?\s*(?:19|20)\d{2}$/i
const EVERYTHING_RE = /\beverything you need to know\b/i
const ULTIMATE_RE = /\bultimate guide\b/i
// A bare "… in 2026" / "… for 2026" ending adds no information beyond the year.
const YEAR_END_RE = /\b(?:in|for)\s+(?:19|20)\d{2}$/i

/** A title that carries no more than the raw keyword (2 tokens max, no
 *  number, no punctuation, not even a "guide" qualifier) is keyword-only. */
function isBareKeywordTitle(title: string): boolean {
  const t = title.trim()
  if (!t) return true
  const tokens = t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.length > 2) return false
  if (/\d/.test(t)) return false
  if (/[“”"':?!,()]/.test(t)) return false
  if (/\b(?:guide|guidance)\b/i.test(t)) return false
  return true
}

export function isFillerTitle(title: string): boolean {
  const t = String(title ?? '').trim()
  if (!t) return true
  if (FILLER_SUFFIX_RE.test(t)) return true
  if (EVERYTHING_RE.test(t)) return true
  if (ULTIMATE_RE.test(t)) return true
  if (YEAR_END_RE.test(t)) return true
  return isBareKeywordTitle(t)
}

// ── Vocab tables used by the CTR-vocab + human-style buckets ───────────────
const INFO_WORDS = new Set([
  'step', 'steps', 'checklist', 'cost', 'costs', 'fee', 'fees', 'price', 'prices',
  'timeline', 'timelines', 'deadline', 'deadlines', 'requirement', 'requirements',
  'document', 'documents', 'eligibility', 'process', 'application', 'pathway',
  'procedure', 'renewal', 'sponsorship', 'validity', 'duration', 'turnaround',
])
const AUDIENCE_WORDS = new Set([
  'immigrant', 'immigrants', 'applicant', 'applicants', 'student', 'students',
  'family', 'families', 'spouse', 'spouses', 'partner', 'partners', 'dependent',
  'dependents', 'international', 'graduate',
])
const ACTION_WORDS = new Set([
  'apply', 'applying', 'prepare', 'preparing', 'file', 'filing', 'renew',
  'renewing', 'get', 'getting', 'compare', 'comparing', 'choose', 'choosing',
  'avoid', 'avoiding', 'save', 'saving',
])
const BANNED_WORDS = [
  'delve', 'streamline', 'streamlines', 'streamlined', 'game-changer',
  'game changer', 'gamechanger', 'unleash', 'unlock', 'unlocked', 'supercharge',
  'revolutionize', 'revolutionise', 'guaranteed', 'guarantee', 'surefire',
  'sure-fire', 'effortless', 'astonishing', 'mind-blowing',
]
const PROMISE_RE = /\b(?:guaranteed?|100%\s*(?:approval|success|accepted|guarantee)|no-fail|surefire|sure-fire|effortless)\b/i
// A year is billed into a title only when the keyword itself smells like a
// cost/deadline change (or the caller explicitly passes one).
const YEAR_JUSTIFIED_RE = /(?:fee|fees|cost|costs|price|prices|deadline|deadlines|timeline|timelines|change|changes|changed|update|updates|new|increas)/i

function tokenize(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function deriveAudienceNoun(keyword: string): string {
  const k = keyword.toLowerCase()
  if (/\bstudent/.test(k)) return 'International Students'
  if (/\bfamily|spouse|partner|dependent/.test(k)) return 'Families'
  if (/\bimmigrant/.test(k)) return 'Immigrants'
  if (/\bvisa|green card|citizenship|immigration/.test(k)) return 'Applicants'
  return ''
}

function deriveProcedureNoun(keyword: string): string {
  const k = keyword.toLowerCase()
  if (/\bgreen card/.test(k)) return 'Petition'
  if (/\bvisa/.test(k)) return 'Application'
  if (/\bcitizenship/.test(k)) return 'Application'
  return 'Application'
}

// ── Scoring ────────────────────────────────────────────────────────────────
function vocabScore(title: string): number {
  let v = 0
  if (/\d/.test(title)) v += 8
  const tokens = tokenize(title)
  if (tokens.some((w) => INFO_WORDS.has(w))) v += 12
  if (tokens.some((w) => AUDIENCE_WORDS.has(w))) v += 5
  if (/\bhow\s+to\b/i.test(title) || tokens.some((w) => ACTION_WORDS.has(w))) v += 5
  return Math.min(30, v)
}

function differentiationScore(title: string, siblings: string[] | undefined): number {
  if (!siblings || !siblings.length) return 20
  const tokens = tokenize(title)
  if (!tokens.length) return 0
  let maxJaccard = 0
  for (const sibling of siblings) {
    if (!sibling) continue
    const st = tokenize(sibling)
    if (!st.length) continue
    const inter = tokens.filter((w) => st.includes(w))
    const union = new Set([...tokens, ...st])
    const j = inter.length ? inter.length / Math.max(1, union.size) : 0
    if (j > maxJaccard) maxJaccard = j
  }
  return Math.round((1 - maxJaccard) * 20)
}

function lengthScore(title: string): number {
  const len = title.length
  if (len >= 55 && len <= 65) return 15
  if (len < 55) return Math.max(0, Math.round(15 - (55 - len) * 1.5))
  return Math.max(0, Math.round(15 - (len - 65) * 1.5))
}

function humanStyleScore(title: string): number {
  let s = 20
  const lower = title.toLowerCase()
  if (
    FILLER_SUFFIX_RE.test(title) ||
    EVERYTHING_RE.test(title) ||
    ULTIMATE_RE.test(title) ||
    YEAR_END_RE.test(title)
  ) {
    s -= 15
  }
  if (title === title.toUpperCase() && (title.match(/[A-Z]/g) || []).length > 2) s -= 10
  if ((title.match(/\?/g) || []).length > 1) s -= 8
  if (BANNED_WORDS.some((w) => lower.includes(w))) s -= 8
  if (PROMISE_RE.test(title)) s -= 8
  if (/\s{2,}/.test(title)) s -= 4
  if (/[!]$/.test(title)) s -= 4
  return Math.max(0, s)
}

function containsPhrase(title: string, phrase: string): boolean {
  const t = tokenize(title)
  const p = tokenize(phrase)
  if (!p.length) return true
  return p.every((w) => t.includes(w))
}

/**
 * Score a title on the five deterministic axes (max 100). Titles that do not
 * contain the primary keyword score 0 — the keyword is non-negotiable.
 */
export function scoreTitle(
  title: string,
  ctx: TitleScoreContext,
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {
    ctr_vocab: 0,
    differentiation: 0,
    keyword_presence: 0,
    length: 0,
    human_style: 0,
  }
  const t = String(title ?? '').trim()
  const kw = (ctx.primaryKeyword || '').trim()
  if (!kw || !t || !containsPhrase(t, kw)) return { score: 0, breakdown }

  breakdown.ctr_vocab = vocabScore(t)
  breakdown.differentiation = differentiationScore(t, ctx.siblingTitles)
  const longTail = ctx.requiredLongTailKeywords || []
  const short = ctx.requiredShortKeywords || []
  if (longTail.length && longTail.some((p) => containsPhrase(t, p))) {
    breakdown.keyword_presence = 15
  } else if (longTail.length && short.some((p) => containsPhrase(t, p))) {
    breakdown.keyword_presence = 15
  } else if (!longTail.length) {
    breakdown.keyword_presence = 15
  } else {
    breakdown.keyword_presence = 10
  }
  breakdown.length = lengthScore(t)
  breakdown.human_style = humanStyleScore(t)

  return {
    score: breakdown.ctr_vocab + breakdown.differentiation + breakdown.keyword_presence + breakdown.length + breakdown.human_style,
    breakdown,
  }
}

// ── Candidate factory ──────────────────────────────────────────────────────
const FALLBACK_PATTERNS = [
  (k: string, a: string) => `${k}: Checklist for ${a || 'Applicants'}`,
  (k: string) => `${k}: Requirements & Fees`,
  (k: string) => `${k}: Steps, Documents & Timelines`,
]

/**
 * Deterministically build 3-5 keyword-first CTR candidates. Every candidate
 * contains the primary keyword (title-cased); the year token is only billed
 * when the caller passes one or the keyword itself justifies a cost/deadline
 * change. Pure and synchronous.
 */
export function generateTitleCandidates(input: TitleLabInput): TitleCandidate[] {
  const kw = (input.primaryKeyword || '').trim()
  if (!kw) return []
  const kwTitle = titleCaseWords(kw)
  const audience = (input.audienceNoun || deriveAudienceNoun(kw)).trim()
  const procedure = (input.procedureNoun || deriveProcedureNoun(kw)).trim()
  const year = typeof input.year === 'number' ? input.year : DEFAULT_YEAR
  const useYear = typeof input.year === 'number' || YEAR_JUSTIFIED_RE.test(kw)
  const yearTag = useYear ? `${year} ` : ''

  const ctx: TitleScoreContext = {
    primaryKeyword: kw,
    siblingTitles: input.siblingTitles,
    requiredShortKeywords: input.requiredShortKeywords,
    requiredLongTailKeywords: input.requiredLongTailKeywords,
  }

  const rawTitles: string[] = [
    `${kwTitle}: ${yearTag}Step-by-Step Guide`,
    `${kwTitle}: Checklist Before You Apply`,
    `${kwTitle}: ${yearTag}Costs, Fees & Timelines`,
    `${kwTitle}: ${yearTag}Requirements & Documents`,
    audience
      ? `${kwTitle}: ${procedure} Checklist for ${audience}`
      : `${kwTitle}: ${procedure} Checklist`,
  ]

  const seen = new Set<string>()
  const scored: TitleCandidate[] = []
  const push = (title: string) => {
    const key = title.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const { score, breakdown } = scoreTitle(title, ctx)
    if (score <= 0 || isFillerTitle(title)) return
    scored.push({ title, score, breakdown })
  }
  for (const title of rawTitles) push(title)
  let fi = 0
  while (scored.length < 3 && fi < FALLBACK_PATTERNS.length) {
    push(FALLBACK_PATTERNS[fi++](kwTitle, audience))
  }
  return scored.slice(0, 5)
}

/**
 * Score every candidate and return the max-scoring one (tie → first, so the
 * pick is deterministic). Null only when the keyword is unusable.
 */
export function pickBestTitle(input: TitleLabInput): TitleCandidate | null {
  let best: TitleCandidate | null = null
  for (const candidate of generateTitleCandidates(input)) {
    if (!best || candidate.score > best.score) best = candidate
  }
  return best
}

export type RejectFillerResult = { ok: true } | { ok: false; reason: string; replacement: string }

/**
 * When the title is filler, rebuild it via pickBestTitle with the filler in
 * the sibling set (so the replacement necessarily diverges from it). The
 * `${keyword}: Complete Guide` form is the documented LAST-RESORT only when
 * every titleLab path fails (e.g. unusable keyword) — it is never preferred.
 */
export function rejectFillerTitle(title: string, ctx: TitleScoreContext): RejectFillerResult {
  if (!isFillerTitle(title)) return { ok: true }
  const best = pickBestTitle({
    primaryKeyword: ctx.primaryKeyword,
    siblingTitles: [...(ctx.siblingTitles || []), title],
    requiredShortKeywords: ctx.requiredShortKeywords,
    requiredLongTailKeywords: ctx.requiredLongTailKeywords,
  })
  if (best && best.title && best.title !== title && !isFillerTitle(best.title)) {
    return { ok: false, reason: `filler title rejected: "${title}"`, replacement: best.title }
  }
  const kw = (ctx.primaryKeyword || '').trim()
  const fallback = kw ? `${titleCaseWords(kw)}: Complete Guide` : 'Complete Guide'
  return { ok: false, reason: `filler title rejected (last resort): "${title}"`, replacement: fallback }
}

// ── Persistence (best-effort, never throws) ────────────────────────────────
export async function persistTitleCandidate(row: TitleHistoryRow): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    await supabase.from('seo_title_history').insert({
      mission_id: row.missionId ?? null,
      cluster_id: row.clusterId ?? null,
      title: row.title,
      score: row.score,
      breakdown: row.breakdown ?? null,
      chosen: row.chosen ?? false,
      source: row.source ?? 'titlelab',
    })
  } catch {
    // best-effort persistence — never throw
  }
}

export async function loadTitleHistory(missionId?: string): Promise<Array<Record<string, unknown>>> {
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('seo_title_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (missionId) query = query.eq('mission_id', missionId)
    const { data } = await query
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}