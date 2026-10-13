/**
 * YQAA Adaptive Pricing / Negotiation layer (system-wide).
 *
 * Pipeline (PRICING-ADAPTIVE.md §3 + §7, workload-inferred pricing takes precedence):
 *   scope signal -> negotiation/urgency/complexity/agency signals -> provider gig match
 *   -> workload estimate (hours per component) -> workload price (business weighted)
 *   -> flex policy -> counter classification -> eligible actions -> finalizeNumbers
 *   -> client-safe NEGOTIATION AUTHORITY block.
 *
 * Rules that must never be broken here:
 *  - every number is computed server-side (the model never sets a price),
 *  - internal floors / rates / weights / multipliers never leave this module,
 *  - prices are rounded, clamped to the margin floor and to the client's stated budget,
 *    and monotonic for an unchanged scope (no stale or higher repeat numbers),
 *  - nothing is provider-, client-, gig- or practice-area-specific: all tunables live in
 *    `lib/yqaaPricingConfig.ts`, all provider overrides come from data.
 *
 * Functions are pure unless named `load*` / `build*` / `resolve*` loaders.
 */
import {
  AGENCY_PREFILLED_DRAFTING_REDUCTION,
  AGENCY_REVIEW_ONLY_FILING_REDUCTION,
  AGENCY_SELF_SERVE_FILING_REDUCTION,
  AGENCY_SELF_SERVE_FOLLOW_UP_REDUCTION,
  AGENCY_SUPPLIED_DOCUMENTS_REVIEW_REDUCTION,
  APPROVAL_BAND_PCT,
  ASSUMED_PAGES_PER_DOCUMENT,
  AUTO_ACCEPT_PCT,
  BUDGET_FIT_TOLERANCE_PCT,
  COMPLEXITY_HOURS_CRIMINAL_HISTORY,
  COMPLEXITY_HOURS_MULTIPLE_JURISDICTIONS,
  COMPLEXITY_HOURS_NOVEL_ISSUE,
  COMPLEXITY_HOURS_PRIOR_DENIAL,
  COMPLEXITY_HOURS_RFE_NOID,
  COMPLEXITY_HOURS_STATUS_VIOLATION,
  COMPLEXITY_HOURS_TIGHT_DEADLINE,
  COMPLEXITY_MULTIPLIER_CAP,
  COMPLEXITY_MULTIPLIER_PER_RESEARCH_HOUR,
  COMPLEXITY_RESEARCH_HOURS_CAP,
  CONFIDENCE_BASE,
  CONFIDENCE_COMPLEXITY_PENALTY_PER_FLAG,
  CONFIDENCE_EXPLICIT_BUDGET_BONUS,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_SCOPE_DEPTH_BONUS,
  CONFIDENCE_SCOPE_UNITS_BONUS,
  CONSULT_MIN_CENTS,
  CONSULT_PREP_HOURS,
  CONSULT_SESSION_HOURS,
  CONVERSION_DISCOUNT_MAX_PCT,
  DEFAULT_DELIVERY_DAYS,
  DEFAULT_HOURLY_RATE_CENTS,
  DEFAULT_OFFER_EXPIRES_DAYS,
  DEFAULT_REVISIONS,
  DEFAULT_ROUND_TO_CENTS,
  DOCUMENT_REVIEW_HOURS_PER_DOC,
  DOCUMENT_REVIEW_HOURS_PER_PAGE,
  DRAFTING_HOURS_PER_500_WORDS,
  DRAFTING_HOURS_PER_FORM,
  DRAFTING_HOURS_PER_LETTER,
  DRAFTING_HOURS_PER_PAGE,
  FILING_ADMIN_HOURS,
  FLEX_PCT,
  FOLLOW_UP_HOURS,
  FORM_REVIEW_HOURS,
  HAGGLE_ESCALATE_AFTER,
  INTAKE_CONSULT_HOURS,
  MARKET_SANITY_HI_RATIO,
  MARKET_SANITY_LO_RATIO,
  MAX_AUTO_CONCESSIONS,
  MAX_IMPLIED_HOURLY_RATE_CENTS,
  MIN_EFFECTIVE_HOURLY_RATE_CENTS,
  MIN_IMPLIED_HOURLY_RATE_CENTS,
  NEGOTIATION_ENABLED_DEFAULT,
  ORIENTATION_ONLY_SHARE,
  PARTIAL_DEPTH_DRAFTING_SHARE,
  PARTIAL_DEPTH_FILING_SHARE,
  PREFER_ACCEPT_DEFAULT,
  PRICE_RANGE_SPREAD_PCT,
  RANGE_COMPLEXITY_THRESHOLD,
  RANGE_CONFIDENCE_THRESHOLD,
  RANGE_HOURS_THRESHOLD,
  RESEARCH_BASE_HOURS,
  REVIEW_DEPTH_DRAFTING_SHARE,
  REVIEW_DEPTH_FILING_SHARE,
  REVIEW_DEPTH_FOLLOW_UP_SHARE,
  RISK_PREMIUM_MAX_PCT,
  RISK_SCORE_HESITATION,
  RISK_SCORE_HIGH_STAKES,
  ROUND_TO_CENTS,
  UNKNOWN_DEPTH_TREATED_AS_FULL,
  UNIT_BOUND_HI_RATIO,
  UNIT_BOUND_LO_RATIO,
  URGENCY_DAYS_RUSH,
  URGENCY_DAYS_STANDARD,
  URGENCY_MULTIPLIER_RUSH,
  URGENCY_MULTIPLIER_SOON,
  URGENCY_MULTIPLIER_STANDARD,
  URGENCY_VAGUE_SOON_DAYS,
  WEIGHT_BUDGET_SIGNAL,
  WEIGHT_CONVERSION,
  WEIGHT_COST_OF_HOURS,
  WEIGHT_RISK,
} from '@/lib/yqaaPricingConfig'
import {
  buildMessengerPricingAuthority,
  extractClientBudget,
  type BudgetEvidence,
  type PricingAuthority,
} from '@/lib/messengerPricingAuthority'
import type { YqaaConversationMemory, YqaaNegotiationMemory } from '@/lib/messengerConversationMemory'

export type ScopeDepth = 'consult' | 'review' | 'partial' | 'full' | 'unknown'
export type ScopeUnitName = 'page' | 'word' | 'document' | 'form' | 'hour' | 'session'
export type ScopeUnits = { unit: ScopeUnitName; qty: number }

export type ScopeSignal = {
  depth: ScopeDepth
  units: ScopeUnits | null
  narrowing: boolean
  narrowing_delta: number | null
  self_serve: boolean
  /** Set for the smallest orientation-only downscope variant (see ORIENTATION_ONLY_SHARE). */
  variant: 'orientation_only' | null
  summary: string
  scope_hash: string
  reason_codes: string[]
}

export type NegotiationSignal = {
  budget: BudgetEvidence | null
  counter_cents: number | null
  counter_source: 'explicit' | 'budget' | null
  counter_message_id: string | null
  counter_count: number
  abusive: boolean
  final_quote_language: boolean
  budget_question_asked: boolean
  reason_codes: string[]
}

export type UrgencyBand = 'none' | 'standard' | 'soon' | 'rush'
export type UrgencySignal = {
  days: number | null
  band: UrgencyBand
  multiplier: number
  reason_codes: string[]
}

export type ComplexitySignal = {
  flags: string[]
  research_hours: number
  multiplier: number
  reason_codes: string[]
}

export type AgencySignal = {
  self_serve: boolean
  supplied_documents: boolean
  pre_filled_forms: boolean
  review_only: boolean
  reason_codes: string[]
}

export type WorkloadComponent =
  | 'intake_consult'
  | 'consult_prep'
  | 'consult_session'
  | 'document_review'
  | 'drafting'
  | 'research'
  | 'filing_admin'
  | 'follow_ups'

export type WorkloadBreakdownRow = { component: WorkloadComponent; hours: number; driver: string }

export type WorkloadEstimate = {
  breakdown: WorkloadBreakdownRow[]
  total_hours: number
  research_hours: number
  complexity: ComplexitySignal
  urgency: UrgencySignal
  agency: AgencySignal
  scope_hash: string
  confidence: number
  reason_codes: string[]
}

export type FlexPolicy = {
  negotiation_enabled: boolean
  auto_accept_pct: number
  flex_pct: number
  approval_band_pct: number
  max_auto_concessions: number
  haggle_escalate_after: number
  round_to_cents: number
  min_floor_cents: number | null
  consult_min_cents: number | null
  prefer_accept: boolean
  min_effective_rate_cents: number
  /** Where each value came from: gig | provider | platform | constant. */
  source: Record<string, string>
}

export type HourlyRateSource = 'gig' | 'provider' | 'implied' | 'default'

export type WorkloadPrice = {
  price_cents: number
  floor_cents: number
  cost_of_hours_cents: number
  hourly_rate_cents: number
  rate_source: HourlyRateSource
  confidence: number
  range: { min_cents: number; max_cents: number } | null
  needs_provider_confirm: boolean
  escalate: boolean
  in_budget: boolean | null
  reason_codes: string[]
}

export type CounterClass = 'none' | 'reasonable' | 'reasonable_meet' | 'stretch' | 'lowball' | 'abusive'
export type NegotiationAction =
  | 'QUOTE'
  | 'ACCEPT'
  | 'MEET_MIDDLE'
  | 'DOWNSCOPE'
  | 'HOLD_VALUE'
  | 'ESCALATE_PROVIDER'

export type TierForScope = {
  id: string | null
  tier: string | null
  title: string | null
  description: string | null
  price: number | null
  delivery_days: number | null
  revisions: number | null
  scope_depth: string | null
  scope_units: number | null
  features: string[]
}

export type UnitPricing = {
  unit?: ScopeUnitName | string
  unit_price_cents?: number
  included_units?: number
  min_units?: number
  base_cents?: number
}

export type GigForScope = {
  id: string
  title: string | null
  category?: string | null
  subcategory?: string | null
  provider_id?: string | null
  status?: string | null
  negotiation_enabled?: boolean | null
  negotiation_flex_pct?: number | null
  min_floor_cents?: number | null
  hourly_rate_cents?: number | null
  unit_pricing?: UnitPricing | null
  tiers: TierForScope[]
}

export type ScopedQuote = {
  scope: ScopeSignal
  workload: WorkloadEstimate
  price: WorkloadPrice
  policy: FlexPolicy
  gig_id: string | null
  tier_id: string | null
  basis: 'workload_unit' | 'workload_tier' | 'workload_gig_rate' | 'workload_default' | 'market_p25'
  includes: string[]
  scoped_list_cents: number
  scoped_floor_cents: number
  needs_provider_confirm: boolean
  reason_codes: string[]
}

export type DownscopeOption = {
  scope: ScopeSignal
  workload: WorkloadEstimate
  price_cents: number
  floor_cents: number
  summary: string
}

export type AdaptivePricingStatus =
  | 'ready'
  | 'need_budget'
  | 'insufficient_scope'
  | 'insufficient_market_data'
  | 'budget_too_low'
  | 'negotiating'
  | 'provider_approval_required'
  | 'public_no_negotiation'

export type AdaptivePricingDecision = {
  status: AdaptivePricingStatus
  currency: string
  channel: 'dm' | 'public'
  scope: ScopeSignal
  negotiation: NegotiationSignal
  workload: WorkloadEstimate
  price: WorkloadPrice
  quote: ScopedQuote
  policy: FlexPolicy
  gig_id: string | null
  tier_id: string | null
  counter_class: CounterClass
  counter_cents: number | null
  eligible_actions: NegotiationAction[]
  recommended_action: NegotiationAction
  approved_price_cents: number | null
  /** Internal floor paired with the approved number (never rendered to the client). */
  approved_floor_cents: number | null
  approval_required: boolean
  approval_token: string | null
  downscope_options: DownscopeOption[]
  client_safe: {
    approved_quote_cents: number | null
    list_price_cents: number | null
    budget: BudgetEvidence | null
    client_counter_cents: number | null
    public_tier_prices_cents: number[]
    includes: string[]
    urgency_band: UrgencyBand
  }
  reason_codes: string[]
  evidence: PricingAuthority
}

export type WorkloadSignals = {
  negotiation?: NegotiationSignal | null
  urgency?: UrgencySignal | null
  complexity?: ComplexitySignal | null
  agency?: AgencySignal | null
  previous_workload?: WorkloadEstimate | null
  high_stakes?: boolean
}

export type SignalContext = {
  clientId?: string | null
  memory?: YqaaNegotiationMemory | null
  now?: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Percentages may arrive as fractions (0.1) or as whole percents (10). */
export function normalizePct(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  const fraction = n > 1 ? n / 100 : n
  return clampNumber(fraction, 0, 1)
}

export function roundToStep(cents: number, stepCents: number = ROUND_TO_CENTS): number {
  const step = Number.isFinite(stepCents) && stepCents > 0 ? stepCents : DEFAULT_ROUND_TO_CENTS
  return Math.round(cents / step) * step
}

function roundHours(hours: number) {
  return Math.round(hours * 100) / 100
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stableHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, couple: 2, few: 3, several: 4,
}

function toQty(raw: string | undefined): number | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  if (WORD_NUMBERS[key] !== undefined) return WORD_NUMBERS[key]
  const n = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function clientRows(messages: any[], context?: SignalContext) {
  const rows = Array.isArray(messages) ? messages : []
  const clientId = context?.clientId ? String(context.clientId) : ''
  return rows.filter((row) => {
    const body = normalizeText(row?.body)
    if (!body) return false
    if (clientId) return String(row?.sender_id || '') === clientId
    // Best effort without a client id: never treat AI/system echoes as client speech.
    return !row?.metadata?.ai_generated
  })
}

function clientTexts(messages: any[], context?: SignalContext) {
  return clientRows(messages, context).map((row) => normalizeText(row.body))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Scope signal (§3.1)
// ─────────────────────────────────────────────────────────────────────────────

const CONSULT_CUES =
  /\b(quick (?:call|chat|question)|initial (?:call|guidance|consult|conversation)|orientation|point me in the right direction|just a consult|consult(?:ation)?\b|30[- ]?minute|15[- ]?minute|one session|1 session|30 minutes|half[- ]hour|walk me through|talk me through|general guidance|where do i start|advice on what to do)\b/i
const REVIEW_CUES =
  /\b(review|revise[d]?|look (?:it|them|this|the)? ?(?:over|through)|second pair of eyes|proofread(?:ing)?|check (?:it|them|this|my|the|over|through)|go over|feedback on|comments on|sanity check|verify (?:it|them|my|the)|double[- ]check)\b/i
const PARTIAL_MARKER = /\b(only|just|nothing but|a single|one|first|last|portion|part of)\b/i
const PARTIAL_PART_NOUN =
  /\b(cover letter|introduction|summary|conclusion|section|page \d|first page|last page|one page|one document|single document|one form|single form|part of|portion|excerpt|snippet|half of|closing letter)\b/i
const FULL_CUES =
  /\b(do everything|everything|full (?:prep|edit|packet|application|review|service|scope)|entire|whole (?:packet|application|file|thing)|handle it all|file it for me|end[- ]to[- ]end|complete (?:application|packet)|from start to finish|all of it)\b/i
const NARROWING_CUES =
  /\b(only|just|instead|smaller|less|shorter|cut it down|cut down|narrow(?:er)?|reduce[ds]?|drop the|fewer|simplify|trim)\b/i
const SELF_SERVE_CUES =
  /\b(i'?ll do the legwork|do the legwork|i'?ll gather|gather (?:the|my) (?:documents|paperwork|evidence)|i'?ll handle|i can handle|diy|with (?:your )?guidance|i'?ll do (?:the|most of the) (?:work|prep|paperwork)|i'?ll put (?:it|the) together|documents are ready|i already have (?:all )?(?:the )?(?:documents|paperwork)|i already filled|already (?:filled|completed|done) (?:it|the form)|i'?ll fill|pre-?filled)\b/i

function extractUnits(text: string): ScopeUnits | null {
  const source = normalizeText(text)
  if (!source) return null

  const pages = /(\d[\d,]*|one|two|three|four|five|ten|a|an)\s*(?:more\s+)?(?:pages?|pgs?)\b/i.exec(source)
  const words = /(\d[\d,]*|one|two|three|four|five|ten)\s*(?:more\s+)?(?:words?|word)\b/i.exec(source)
  const documents = /(\d[\d,]*|one|two|three|four|five|a|an|couple|few|several)\s*(?:more\s+)?(?:documents?|docs?|files?)\b/i.exec(source)
  const forms = /(\d[\d,]*|one|two|three|four|five|a|an)\s*(?:more\s+)?(?:forms?|applications?)\b/i.exec(source)
  const sessions = /(\d[\d,]*|one|two|three|a|an)\s*(?:more\s+)?(?:sessions?|calls?|meetings?)\b/i.exec(source)
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.exec(source)
  const halfHour = /\bhalf[- ]?(?:an )?hour\b/i.test(source)

  const candidates: ScopeUnits[] = []
  const pageQty = toQty(pages?.[1])
  if (pageQty) candidates.push({ unit: 'page', qty: pageQty })
  const wordQty = toQty(words?.[1])
  if (wordQty) candidates.push({ unit: 'word', qty: wordQty })
  const docQty = toQty(documents?.[1])
  if (docQty) candidates.push({ unit: 'document', qty: docQty })
  const formQty = toQty(forms?.[1])
  if (formQty) candidates.push({ unit: 'form', qty: formQty })
  const sessionQty = toQty(sessions?.[1])
  if (sessionQty) candidates.push({ unit: 'session', qty: sessionQty })
  const hourQty = hours ? Number(hours[1]) : null
  if (hourQty && hourQty > 0) candidates.push({ unit: 'hour', qty: hourQty })
  if (halfHour) candidates.push({ unit: 'hour', qty: 0.5 })

  if (!candidates.length) return null
  // The last stated unit wins (conversational corrections come last).
  return candidates[candidates.length - 1]
}

function depthFromText(text: string): { depth: ScopeDepth; reasons: string[] } {
  const source = normalizeText(text)
  if (!source) return { depth: 'unknown', reasons: [] }
  if (PARTIAL_MARKER.test(source) && PARTIAL_PART_NOUN.test(source)) {
    return { depth: 'partial', reasons: ['scope_cue_partial'] }
  }
  if (CONSULT_CUES.test(source)) return { depth: 'consult', reasons: ['scope_cue_consult'] }
  if (REVIEW_CUES.test(source)) return { depth: 'review', reasons: ['scope_cue_review'] }
  if (FULL_CUES.test(source)) return { depth: 'full', reasons: ['scope_cue_full'] }
  return { depth: 'unknown', reasons: [] }
}

const DEPTH_LABELS: Record<ScopeDepth, string> = {
  consult: 'orientation consult',
  review: 'review pass',
  partial: 'partial scope',
  full: 'full scope',
  unknown: 'scope still being confirmed',
}

const UNIT_LABELS: Record<ScopeUnitName, string> = {
  page: 'page(s)',
  word: 'word(s)',
  document: 'document(s)',
  form: 'form(s)',
  hour: 'hour(s)',
  session: 'session(s)',
}

function scopeSummary(depth: ScopeDepth, units: ScopeUnits | null, variant: ScopeSignal['variant']) {
  if (variant === 'orientation_only') return 'short orientation consult'
  if (!units) return DEPTH_LABELS[depth]
  return `${DEPTH_LABELS[depth]} · ${units.qty} ${UNIT_LABELS[units.unit]}`
}

function buildScopeHash(
  depth: ScopeDepth,
  units: ScopeUnits | null,
  variant: ScopeSignal['variant'],
  seed?: string | null,
) {
  const unitKey = units ? `${units.unit}:${units.qty}` : 'none'
  return stableHash(`${depth}|${unitKey}|${variant || 'standard'}|${seed || 'no-scope-seed'}`)
}

export function buildScopeSignal(args: {
  depth: ScopeDepth
  units?: ScopeUnits | null
  narrowing?: boolean
  narrowingDelta?: number | null
  selfServe?: boolean
  variant?: ScopeSignal['variant']
  reasonCodes?: string[]
  seed?: string | null
}): ScopeSignal {
  const units = args.units ?? null
  const variant = args.variant ?? null
  return {
    depth: args.depth,
    units,
    narrowing: Boolean(args.narrowing),
    narrowing_delta: args.narrowingDelta ?? null,
    self_serve: Boolean(args.selfServe),
    variant,
    summary: scopeSummary(args.depth, units, variant),
    scope_hash: buildScopeHash(args.depth, units, variant, args.seed),
    reason_codes: args.reasonCodes || [],
  }
}

/**
 * Deterministic scope signal from the client thread + negotiation memory.
 * Narrowing is detected lexically and numerically (unit qty below the qty
 * recorded for the current scope in memory).
 */
export function extractScopeSignal(messages: any[], context: SignalContext = {}): ScopeSignal {
  const texts = clientTexts(messages, context)
  const latest = texts[texts.length - 1] || ''
  const parsed = depthFromText(latest)
  let depth = parsed.depth
  let units = extractUnits(latest)
  const reasons = [...parsed.reasons]
  // An acceptance or a non-scope turn ("ok let's do it") does not change the scope:
  // inherit the scope the client and server already agreed on.
  const remembered = context.memory?.scope_current || null
  if (depth === 'unknown' && !units && remembered) {
    depth = (String(remembered.depth) as ScopeDepth) || 'unknown'
    units = remembered.units ? ({ unit: remembered.units.unit as ScopeUnitName, qty: remembered.units.qty }) : null
    reasons.push('scope_inherited_from_memory')
  }
  const selfServe = SELF_SERVE_CUES.test(latest)
  const priorUnits = remembered?.units || null
  const narrowingDelta =
    units && priorUnits && units.unit === priorUnits.unit && units.qty < priorUnits.qty
      ? priorUnits.qty - units.qty
      : null
  const narrowing = narrowingDelta !== null || NARROWING_CUES.test(latest)
  const reasonCodes = [...reasons]
  if (units) reasonCodes.push(`scope_units_${units.unit}`)
  if (selfServe) reasonCodes.push('scope_self_serve')
  if (narrowingDelta !== null) reasonCodes.push('scope_narrowed_units')
  else if (narrowing) reasonCodes.push('scope_narrowing_language')

  return buildScopeSignal({
    depth,
    units,
    narrowing,
    narrowingDelta,
    selfServe,
    reasonCodes,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Negotiation signal (§3.2 budget + §3.4 counters)
// ─────────────────────────────────────────────────────────────────────────────

const COUNTER_RE =
  /(?:\b(?:would you (?:do|take|accept)|can you (?:do|take)|could you (?:do|take)|how about|what about|will you take|i(?:'| a)?m offering|my offer is|my offer would be|i can (?:only )?(?:pay|do|afford|spend)|i(?:'| a)?ll (?:pay|do|give you)|let'?s do|make it)\b[^?]{0,40}?)(\$\s*\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:usd|cad|dollars?|bucks?))/gi
const OVER_BUDGET_ASK_RE = /\b(?:any chance|can you (?:do|go)|would you (?:do|take|consider))\b[^.]{0,40}\b(?:cheaper|lower|less|discount|flexible|deal)\b/i
/**
 * Range-aware budget fallback. "50 dollars to 100" / "$50–$100" / "$200 for the
 * whole thing" are client budget statements even without the word "budget", and
 * the blended-extractor under-reads the upper bound of a range.
 */
const BUDGET_RANGE_STATEMENT_RE =
  /(?:\$\s*|\b(?:usd|cad)\b\s*)(\d[\d,]*)\s*(?:-|–|—|to)\s*\$?\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:dollars?|usd|cad|bucks?)\s*(?:-|–|—|to)\s*\$?\s*(\d[\d,]*)/
const BUDGET_SINGLE_STATEMENT_RE =
  /(?:\$\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:dollars?|usd|cad|bucks?))\s*(?:for|towards?|toward|in total|altogether)\b/
const ABUSIVE_RE =
  /\b(for free|free of charge|do it for free|without paying|for nothing|scam(?:mer)?|ripoff|rip[- ]off|thief|steal(?:ing)?|stupid|idiot|shut up|bullshit|screw you|pay (?:you )?(?:outside|directly|cash)|off[- ]platform|cash ?app|venmo|zelle|paypal me|going to (?:report|sue|expose) you|report you|sue you)\b/i
const FINAL_QUOTE_RE = /\b(final (?:quote|price|offer|number)|that'?s my final|last (?:quote|price)|take it or leave it)\b/i

function centsFromMoney(raw: string | undefined): number | null {
  if (!raw) return null
  const numeric = Number(String(raw).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric * 100)
}

function budgetFromStatement(text: string, messageId: string | null): BudgetEvidence | null {
  const source = normalizeText(text)
  if (!source) return null
  const currency = /\bcad\b/i.test(source) ? 'cad' : 'usd'
  const range = BUDGET_RANGE_STATEMENT_RE.exec(source)
  if (range) {
    const first = centsFromMoney(range[1] ?? range[3])
    const second = centsFromMoney(range[2] ?? range[4])
    if (first && second) {
      return {
        minCents: Math.min(first, second),
        maxCents: Math.max(first, second),
        currency,
        sourceText: source.slice(0, 500),
        messageId,
        confidence: 'explicit',
      }
    }
  }
  const single = BUDGET_SINGLE_STATEMENT_RE.exec(source)
  const value = centsFromMoney(single?.[1] ?? single?.[2])
  if (value) {
    return {
      minCents: null,
      maxCents: value,
      currency,
      sourceText: source.slice(0, 500),
      messageId,
      confidence: 'explicit',
    }
  }
  return null
}

export function extractNegotiationSignal(messages: any[], context: SignalContext = {}): NegotiationSignal {
  const rows = clientRows(messages, context)
  const texts = rows.map((row) => normalizeText(row.body))
  const reasonCodes: string[] = []

  const budget =
    extractClientBudget(Array.isArray(messages) ? messages : [], context.clientId || '') ||
    budgetFromStatement(texts[texts.length - 1] || '', rows[rows.length - 1]?.id || null) ||
    ((context.memory?.budget_latest as BudgetEvidence | undefined) || null)
  if (budget?.minCents) reasonCodes.push('budget_range_known')
  else if (budget) reasonCodes.push('budget_single_value_known')

  let counterCents: number | null = null
  let counterMessageId: string | null = null
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const text = texts[i]
    COUNTER_RE.lastIndex = 0
    const match = COUNTER_RE.exec(text)
    const parsed = centsFromMoney(match?.[1])
    // A range like "could you do $50 to $100" is a budget statement, not a
    // single-figure counter: never read the low end of a range as their offer.
    const isRangeFloor = Boolean(parsed && budget?.minCents === parsed && (budget?.maxCents || 0) > parsed)
    if (parsed && isRangeFloor) {
      reasonCodes.push('counter_is_budget_range')
      break
    }
    if (parsed) {
      counterCents = parsed
      counterMessageId = rows[i]?.id || null
      break
    }
    if (OVER_BUDGET_ASK_RE.test(text)) {
      reasonCodes.push('counter_implied_no_number')
      break
    }
  }

  let counterCount = texts.filter((text) => {
    COUNTER_RE.lastIndex = 0
    return COUNTER_RE.test(text)
  }).length
  const remembered = (context.memory?.client_counters || []) as Array<{ message_id?: string | null }>
  counterCount = Math.max(counterCount, remembered.length)
  if (counterCount) reasonCodes.push(`client_counters_${Math.min(counterCount, 9)}`)
  if (remembered.some((row) => row.message_id && row.message_id === counterMessageId)) reasonCodes.push('counter_seen_before')

  const abusive = texts.some((text) => ABUSIVE_RE.test(text)) ||
    (counterCount >= HAGGLE_ESCALATE_AFTER && /\b(idiot|stupid|scam|useless|garbage|trash)\b/i.test(texts.join(' ')))
  if (abusive) reasonCodes.push('abusive_language')

  // Any message (client or YQAA) that framed the price as final tightens the haggle budget.
  const allTexts = (Array.isArray(messages) ? messages : []).map((row) => normalizeText(row?.body)).filter(Boolean)
  const finalQuoteLanguage = allTexts.some((text) => FINAL_QUOTE_RE.test(text))
  if (finalQuoteLanguage) reasonCodes.push('final_quote_language')

  const counterSource: NegotiationSignal['counter_source'] = counterCents ? 'explicit' : budget ? 'budget' : null

  return {
    budget,
    counter_cents: counterCents,
    counter_source: counterSource,
    counter_message_id: counterMessageId,
    counter_count: counterCount,
    abusive,
    final_quote_language: finalQuoteLanguage,
    budget_question_asked: false,
    reason_codes: reasonCodes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Urgency signal (§7.3)
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseDeadlineDays(text: string, now: Date): number | null {
  const source = normalizeText(text).toLowerCase()
  if (!source) return null
  const found: number[] = []

  const relative = /in\s+(\d+)\s*(day|days|week|weeks|month|months)\b/.exec(source) ||
    /\b(\d+)\s*(day|days|week|weeks|month|months)\s*(?:from now|left|away|to go)?\b/.exec(source)
  if (relative) {
    const n = Number(relative[1])
    if (Number.isFinite(n)) {
      const unit = relative[2]
      found.push(/week/.test(unit) ? n * 7 : /month/.test(unit) ? n * 30 : n)
    }
  }
  if (/\b(tomorrow|today|tonight|this evening)\b/.test(source)) found.push(1)
  if (/\bnext week\b/.test(source)) found.push(7)
  if (/\bnext month\b/.test(source)) found.push(30)
  const weekday = /(?:by|before|due)\s+(?:this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(source)
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1])
    const delta = (target - now.getDay() + 7) % 7 || 7
    found.push(delta)
  }
  if (!found.length && /\b(asap|urgent|urgently|as soon as possible|right away|immediately)\b/.test(source)) {
    found.push(URGENCY_VAGUE_SOON_DAYS)
  }
  if (!found.length) return null
  return Math.min(...found)
}

export function extractUrgencySignal(messages: any[], context: SignalContext = {}): UrgencySignal {
  const now = context.now || new Date()
  const texts = clientTexts(messages, context)
  const daysFound: number[] = []
  for (const text of texts) {
    const days = parseDeadlineDays(text, now)
    if (days !== null) daysFound.push(days)
  }
  const days = daysFound.length ? Math.min(...daysFound) : null
  const reasonCodes: string[] = []
  let band: UrgencyBand = 'none'
  let multiplier = URGENCY_MULTIPLIER_STANDARD
  if (days !== null) {
    if (days <= URGENCY_DAYS_RUSH) {
      band = 'rush'
      multiplier = URGENCY_MULTIPLIER_RUSH
    } else if (days <= URGENCY_DAYS_STANDARD) {
      band = 'soon'
      multiplier = URGENCY_MULTIPLIER_SOON
    } else {
      band = 'standard'
      multiplier = URGENCY_MULTIPLIER_STANDARD
    }
    reasonCodes.push(`deadline_${band}`)
  }
  return { days, band, multiplier, reason_codes: reasonCodes }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Complexity + agency signals (§7.2, §7.4)
// ─────────────────────────────────────────────────────────────────────────────

const COMPLEXITY_PATTERNS: Array<{ flag: string; hours: number; re: RegExp }> = [
  { flag: 'prior_denial', hours: COMPLEXITY_HOURS_PRIOR_DENIAL, re: /\b(prior (?:refusal|denial)|previous (?:refusal|denial)|refused|denial|denied|rejected|rejection)\b/i },
  { flag: 'status_violation', hours: COMPLEXITY_HOURS_STATUS_VIOLATION, re: /\b(out of status|overstay(?:ed|ing)?|status violation|unlawful presence|gap in status|unauthori[sz]ed work)\b/i },
  { flag: 'multiple_jurisdictions', hours: COMPLEXITY_HOURS_MULTIPLE_JURISDICTIONS, re: /\b(multiple jurisdictions|two jurisdictions|cross[- ]jurisdiction|more than one country|both (?:the )?(?:us|usa|canada|uk)|two countries)\b/i },
  { flag: 'rfe_noid', hours: COMPLEXITY_HOURS_RFE_NOID, re: /\b(rfe|request for evidence|noid|notice of intent to deny)\b/i },
  { flag: 'criminal_history', hours: COMPLEXITY_HOURS_CRIMINAL_HISTORY, re: /\b(criminal (?:record|history|charge|conviction)|arrested|convicted|misdemeanor|felony|\bdui\b)\b/i },
  { flag: 'novel_issue', hours: COMPLEXITY_HOURS_NOVEL_ISSUE, re: /\b(unusual|novel|no precedent|uncommon|bespoke|very complicated|highly unusual)\b/i },
]

export function extractComplexitySignal(
  messages: any[],
  context: SignalContext = {},
  urgency?: UrgencySignal | null,
): ComplexitySignal {
  const texts = clientTexts(messages, context)
  const flags: string[] = []
  let researchHours = 0
  for (const pattern of COMPLEXITY_PATTERNS) {
    if (texts.some((text) => pattern.re.test(text))) {
      flags.push(pattern.flag)
      researchHours += pattern.hours
    }
  }
  if ((urgency || extractUrgencySignal(messages, context)).band === 'rush') {
    flags.push('tight_deadline')
    researchHours += COMPLEXITY_HOURS_TIGHT_DEADLINE
  }
  researchHours = Math.min(researchHours, COMPLEXITY_RESEARCH_HOURS_CAP)
  const multiplier = Math.min(
    COMPLEXITY_MULTIPLIER_CAP,
    1 + researchHours * COMPLEXITY_MULTIPLIER_PER_RESEARCH_HOUR,
  )
  return {
    flags,
    research_hours: roundHours(researchHours),
    multiplier: Math.round(multiplier * 1000) / 1000,
    reason_codes: flags.map((flag) => `complexity_${flag}`),
  }
}

const AGENCY_PATTERNS = {
  self_serve: /\b(i'?ll do the legwork|do the legwork|i'?ll gather|gather (?:the|my) (?:documents|paperwork|evidence)|i'?ll handle|i can handle|i'?ll do (?:the|most of the) (?:work|prep|paperwork)|i'?ll put (?:it|the) together|diy|with (?:your )?guidance)\b/i,
  supplied_documents: /\b(i already have (?:all )?(?:the )?(?:documents|paperwork|everything)|(?:documents|paperwork|everything) (?:is|are) ready|i have (?:all|everything) (?:ready|together|prepared)|i'?ll send (?:my|the) (?:documents|paperwork))\b/i,
  pre_filled_forms: /\b(i already (?:filled|completed|finished|did)|already (?:filled|completed) (?:it|the form|out)|form is (?:ready|filled)|i'?ve filled)\b/i,
  review_only: /\b(just (?:review|check|look)|only (?:review|check)|review only|someone to check)\b/i,
}

export function extractAgencySignal(messages: any[], context: SignalContext = {}): AgencySignal {
  const texts = clientTexts(messages, context)
  const reasonCodes: string[] = []
  const match = (re: RegExp) => texts.some((text) => re.test(text))
  const selfServe = match(AGENCY_PATTERNS.self_serve)
  const suppliedDocuments = match(AGENCY_PATTERNS.supplied_documents) || selfServe
  const preFilledForms = match(AGENCY_PATTERNS.pre_filled_forms)
  const reviewOnly = match(AGENCY_PATTERNS.review_only)
  if (selfServe) reasonCodes.push('agency_self_serve')
  if (suppliedDocuments) reasonCodes.push('agency_documents_supplied')
  if (preFilledForms) reasonCodes.push('agency_forms_prefilled')
  if (reviewOnly) reasonCodes.push('agency_review_only')
  return {
    self_serve: selfServe,
    supplied_documents: suppliedDocuments,
    pre_filled_forms: preFilledForms,
    review_only: reviewOnly,
    reason_codes: reasonCodes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Workload estimate (§7.1 – §7.4)
// ─────────────────────────────────────────────────────────────────────────────

export function defaultUrgencySignal(): UrgencySignal {
  return { days: null, band: 'none', multiplier: URGENCY_MULTIPLIER_STANDARD, reason_codes: [] }
}

export function defaultComplexitySignal(): ComplexitySignal {
  return { flags: [], research_hours: 0, multiplier: 1, reason_codes: [] }
}

export function defaultAgencySignal(): AgencySignal {
  return { self_serve: false, supplied_documents: false, pre_filled_forms: false, review_only: false, reason_codes: [] }
}

function confidenceFor(args: {
  depth: ScopeDepth
  units: ScopeUnits | null
  complexityFlags: number
  explicitBudget: boolean
}) {
  let confidence = CONFIDENCE_BASE
  if (args.depth !== 'unknown') confidence += CONFIDENCE_SCOPE_DEPTH_BONUS
  if (args.units) confidence += CONFIDENCE_SCOPE_UNITS_BONUS
  if (args.explicitBudget) confidence += CONFIDENCE_EXPLICIT_BUDGET_BONUS
  confidence -= args.complexityFlags * CONFIDENCE_COMPLEXITY_PENALTY_PER_FLAG
  return Math.round(clampNumber(confidence, CONFIDENCE_MIN, CONFIDENCE_MAX) * 1000) / 1000
}

/**
 * Deterministic per-component hours. Same inputs -> identical breakdown (W5).
 * Pure: no clock, no DB, no randomness.
 */
export function estimateWorkload(scope: ScopeSignal, signals: WorkloadSignals = {}): WorkloadEstimate {
  const urgency = signals.urgency || defaultUrgencySignal()
  const complexity = signals.complexity || defaultComplexitySignal()
  const agency = signals.agency || defaultAgencySignal()
  const reasonCodes: string[] = []
  const rows: WorkloadBreakdownRow[] = []

  const effectiveDepth: Exclude<ScopeDepth, 'unknown'> =
    scope.depth === 'unknown' && UNKNOWN_DEPTH_TREATED_AS_FULL ? 'full' : (scope.depth === 'unknown' ? 'full' : scope.depth)
  if (scope.depth === 'unknown') reasonCodes.push('depth_unknown_treated_as_full')

  const units = scope.units
  const orientationOnly = scope.variant === 'orientation_only'

  if (orientationOnly) {
    const hours = roundHours(INTAKE_CONSULT_HOURS * ORIENTATION_ONLY_SHARE)
    rows.push({ component: 'intake_consult', hours, driver: 'orientation_only_consult' })
    reasonCodes.push('variant_orientation_only')
  } else if (effectiveDepth === 'consult') {
    rows.push({ component: 'intake_consult', hours: INTAKE_CONSULT_HOURS, driver: 'new_matter_intake' })
    rows.push({ component: 'consult_prep', hours: CONSULT_PREP_HOURS, driver: 'consult_preparation' })
    if (units && (units.unit === 'session' || units.unit === 'hour')) {
      const unitHours = units.unit === 'hour' ? units.qty : units.qty * CONSULT_SESSION_HOURS
      rows.push({ component: 'consult_session', hours: roundHours(unitHours), driver: `${units.qty} ${units.unit}` })
    }
  } else {
    rows.push({ component: 'intake_consult', hours: INTAKE_CONSULT_HOURS, driver: 'new_matter_intake' })

    let reviewHours = 0
    if (units) {
      switch (units.unit) {
        case 'page':
          reviewHours += DOCUMENT_REVIEW_HOURS_PER_DOC + units.qty * DOCUMENT_REVIEW_HOURS_PER_PAGE
          break
        case 'document':
          reviewHours += units.qty * DOCUMENT_REVIEW_HOURS_PER_DOC
          break
        case 'form':
          reviewHours += units.qty * FORM_REVIEW_HOURS
          break
        default:
          reviewHours += DOCUMENT_REVIEW_HOURS_PER_DOC
          break
      }
    } else {
      // No unit given: assume a single document of ASSUMED_PAGES_PER_DOCUMENT pages.
      reviewHours += DOCUMENT_REVIEW_HOURS_PER_DOC + ASSUMED_PAGES_PER_DOCUMENT * DOCUMENT_REVIEW_HOURS_PER_PAGE
    }
    if (agency.supplied_documents) {
      reviewHours *= 1 - AGENCY_SUPPLIED_DOCUMENTS_REVIEW_REDUCTION
      reasonCodes.push('agency_review_reduced_documents_ready')
    }
    rows.push({
      component: 'document_review',
      hours: roundHours(reviewHours),
      driver: units ? `${units.qty} ${units.unit}` : 'assumed_single_document',
    })

    let draftingHours = 0
    if (units) {
      switch (units.unit) {
        case 'word':
          draftingHours += (units.qty / 500) * DRAFTING_HOURS_PER_500_WORDS
          break
        case 'page':
          draftingHours += units.qty * DRAFTING_HOURS_PER_PAGE
          break
        case 'form':
          draftingHours += units.qty * DRAFTING_HOURS_PER_FORM
          break
        case 'document':
          draftingHours += units.qty * DRAFTING_HOURS_PER_LETTER
          break
        default:
          draftingHours += DRAFTING_HOURS_PER_LETTER
          break
      }
    } else {
      draftingHours += DRAFTING_HOURS_PER_LETTER
    }
    if (effectiveDepth === 'partial') draftingHours *= PARTIAL_DEPTH_DRAFTING_SHARE
    if (effectiveDepth === 'review') draftingHours *= REVIEW_DEPTH_DRAFTING_SHARE
    if (agency.pre_filled_forms) {
      draftingHours *= 1 - AGENCY_PREFILLED_DRAFTING_REDUCTION
      reasonCodes.push('agency_drafting_reduced_forms_prefilled')
    }
    if (draftingHours > 0) {
      rows.push({
        component: 'drafting',
        hours: roundHours(draftingHours),
        driver: units ? `${units.qty} ${units.unit}` : 'assumed_single_deliverable',
      })
    } else {
      reasonCodes.push('component_drafting_dropped')
    }

    let filingHours = FILING_ADMIN_HOURS
    if (effectiveDepth === 'partial') filingHours *= PARTIAL_DEPTH_FILING_SHARE
    if (effectiveDepth === 'review') filingHours *= REVIEW_DEPTH_FILING_SHARE
    if (agency.review_only) {
      filingHours *= 1 - AGENCY_REVIEW_ONLY_FILING_REDUCTION
      reasonCodes.push('agency_review_only_filing_dropped')
    }
    if (agency.self_serve) {
      filingHours *= 1 - AGENCY_SELF_SERVE_FILING_REDUCTION
      reasonCodes.push('agency_self_serve_filing_dropped')
    }
    if (filingHours > 0) {
      rows.push({ component: 'filing_admin', hours: roundHours(filingHours), driver: 'filing_and_admin' })
    } else {
      reasonCodes.push('component_filing_admin_dropped')
    }

    let followUpHours = FOLLOW_UP_HOURS
    if (effectiveDepth === 'review') followUpHours *= REVIEW_DEPTH_FOLLOW_UP_SHARE
    if (agency.self_serve) {
      followUpHours *= 1 - AGENCY_SELF_SERVE_FOLLOW_UP_REDUCTION
      reasonCodes.push('agency_self_serve_follow_ups_reduced')
    }
    if (followUpHours > 0) {
      rows.push({ component: 'follow_ups', hours: roundHours(followUpHours), driver: 'client_back_and_forth' })
    }
  }

  // Research: baseline for non-consult scopes + complexity-driven hours.
  const baseResearch = effectiveDepth === 'consult' || orientationOnly ? 0 : RESEARCH_BASE_HOURS
  const researchHours = roundHours(baseResearch + (orientationOnly ? 0 : complexity.research_hours))
  if (researchHours > 0) {
    rows.push({
      component: 'research',
      hours: researchHours,
      driver: complexity.flags.length ? `complexity:${complexity.flags.join('+')}` : 'baseline_research',
    })
  }

  const totalHours = roundHours(rows.reduce((sum, row) => sum + row.hours, 0))
  const confidence = confidenceFor({
    depth: scope.depth,
    units: scope.units,
    complexityFlags: complexity.flags.length,
    explicitBudget: Boolean(signals.negotiation?.budget || signals.negotiation?.counter_cents),
  })

  return {
    breakdown: rows,
    total_hours: totalHours,
    research_hours: researchHours,
    complexity,
    urgency,
    agency,
    scope_hash: scope.scope_hash,
    confidence,
    reason_codes: [
      ...reasonCodes,
      ...complexity.reason_codes,
      ...urgency.reason_codes,
      ...agency.reason_codes,
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Workload price (§7.5)
// ─────────────────────────────────────────────────────────────────────────────

export type PriceContext = {
  hourlyRateCents?: number | null
  rateSource?: HourlyRateSource
  minEffectiveRateCents?: number | null
  marketReference?: { p25Cents: number; meanCents: number } | null
  clientBudget?: BudgetEvidence | null
  clientCounterCents?: number | null
  conversionScore?: number | null
  riskScore?: number | null
  requiresProviderConfirm?: boolean
  highStakes?: boolean
  platformMinimumCents?: number
  /** Sanity bound derived from the gig's unit pricing + requested units (packages are inputs, §7). */
  unitBoundCents?: number | null
}

export function conversionScoreFor(args: {
  priceCents: number
  budget: BudgetEvidence | null
  counterCents: number | null
}) {
  const reference = args.counterCents || args.budget?.maxCents || null
  if (!reference || args.priceCents <= 0) return 0.5
  const fit = clampNumber(reference / args.priceCents, 0, 1.5)
  const distance = Math.abs(1 - fit)
  const tolerance = 1 + BUDGET_FIT_TOLERANCE_PCT
  return Math.round(clampNumber(1 - distance / tolerance, 0, 1) * 1000) / 1000
}

export function riskScoreFor(estimate: WorkloadEstimate, highStakes?: boolean) {
  let score = 0
  if (highStakes) score += RISK_SCORE_HIGH_STAKES
  if (estimate.complexity.flags.length >= 2) score += RISK_SCORE_HESITATION
  return clampNumber(score, 0, 1)
}

/** Hours × rate × multipliers, weighted business decision, hard margin floor (all internal). */
export function priceFromWorkload(
  estimate: WorkloadEstimate,
  policy: FlexPolicy,
  context: PriceContext = {},
): WorkloadPrice {
  const reasonCodes: string[] = []
  const rate = Number(context.hourlyRateCents) > 0 ? Number(context.hourlyRateCents) : DEFAULT_HOURLY_RATE_CENTS
  const rateSource: HourlyRateSource = context.hourlyRateCents && context.rateSource ? context.rateSource : 'default'
  const hours = Math.max(estimate.total_hours, 0)

  const costOfHoursCents = Math.round(hours * rate * estimate.complexity.multiplier * estimate.urgency.multiplier)
  const minEffectiveRate = Number(context.minEffectiveRateCents) > 0
    ? Number(context.minEffectiveRateCents)
    : MIN_EFFECTIVE_HOURLY_RATE_CENTS
  const floorCents = Math.ceil(hours * minEffectiveRate)

  const budget = context.clientBudget || null
  const budgetReference = context.clientCounterCents || budget?.maxCents || null
  const budgetSignalCents = budgetReference
    ? clampNumber(budgetReference, floorCents, Math.max(costOfHoursCents, floorCents))
    : costOfHoursCents
  const conversionScore = context.conversionScore ?? conversionScoreFor({
    priceCents: costOfHoursCents,
    budget,
    counterCents: context.clientCounterCents ?? null,
  })
  const riskScore = context.riskScore ?? riskScoreFor(estimate, context.highStakes)
  const conversionTerm = costOfHoursCents * (1 - CONVERSION_DISCOUNT_MAX_PCT * conversionScore)
  const riskTerm = costOfHoursCents * (1 + RISK_PREMIUM_MAX_PCT * riskScore)

  let blended =
    WEIGHT_COST_OF_HOURS * costOfHoursCents +
    WEIGHT_BUDGET_SIGNAL * budgetSignalCents +
    WEIGHT_CONVERSION * conversionTerm +
    WEIGHT_RISK * riskTerm

  const market = context.marketReference
  if (market && market.p25Cents > 0 && market.meanCents > 0) {
    const beforeClamp = blended
    blended = clampNumber(blended, market.p25Cents * MARKET_SANITY_LO_RATIO, market.meanCents * MARKET_SANITY_HI_RATIO)
    if (blended !== beforeClamp) reasonCodes.push('market_reference_sanity_clamp')
  }
  // The gig's own unit pricing is a sanity bound, never the price itself (§3.2 + §7).
  const unitBound = Number(context.unitBoundCents)
  if (Number.isFinite(unitBound) && unitBound > 0) {
    const beforeClamp = blended
    blended = clampNumber(blended, unitBound * UNIT_BOUND_LO_RATIO, unitBound * UNIT_BOUND_HI_RATIO)
    if (blended !== beforeClamp) reasonCodes.push('unit_price_sanity_clamp')
  }

  const step = policy.round_to_cents || DEFAULT_ROUND_TO_CENTS
  const hardFloor = Math.max(
    floorCents,
    Number(policy.min_floor_cents) > 0 ? Number(policy.min_floor_cents) : 0,
  )
  let priceCents = roundToStep(blended, step)
  if (priceCents < hardFloor) {
    priceCents = hardFloor
    reasonCodes.push('margin_floor_applied')
  }
  if (Number(context.platformMinimumCents) > 0 && priceCents < Number(context.platformMinimumCents)) {
    priceCents = Number(context.platformMinimumCents)
    reasonCodes.push('platform_minimum_applied')
  }

  const inBudget = budgetReference === null ? null : priceCents <= budgetReference
  const needsRange =
    hours > RANGE_HOURS_THRESHOLD ||
    estimate.complexity.multiplier > RANGE_COMPLEXITY_THRESHOLD ||
    estimate.confidence < RANGE_CONFIDENCE_THRESHOLD
  const needsProviderConfirm = needsRange || Boolean(context.requiresProviderConfirm)
  if (needsRange) reasonCodes.push('range_threshold_exceeded')
  if (context.requiresProviderConfirm) reasonCodes.push('provider_confirm_required')

  return {
    price_cents: priceCents,
    floor_cents: Math.max(floorCents, 1),
    cost_of_hours_cents: costOfHoursCents,
    hourly_rate_cents: rate,
    rate_source: rateSource,
    confidence: estimate.confidence,
    range: needsRange
      ? {
          min_cents: roundToStep(priceCents * (1 - PRICE_RANGE_SPREAD_PCT), step),
          max_cents: roundToStep(priceCents * (1 + PRICE_RANGE_SPREAD_PCT), step),
        }
      : null,
    needs_provider_confirm: needsProviderConfirm,
    escalate: needsProviderConfirm,
    in_budget: inBudget,
    reason_codes: reasonCodes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Flex policy + provider gig resolution (§3.3, migration-tolerant loaders)
// ─────────────────────────────────────────────────────────────────────────────

export type PricingPreferenceRow = {
  negotiation_enabled?: boolean | null
  auto_accept_pct?: number | null
  flex_pct?: number | null
  approval_band_pct?: number | null
  max_auto_concessions?: number | null
  prefer_accept?: boolean | null
  hourly_rate_cents?: number | null
  min_effective_rate_cents?: number | null
  min_floor_cents?: number | null
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** gig -> provider_pricing_preferences -> platform settings -> code constants (§3.3). */
export function resolveFlexPolicy(args: {
  gig?: GigForScope | null
  preference?: PricingPreferenceRow | null
  settings?: Record<string, any> | null
}): FlexPolicy {
  const gig = args.gig || null
  const pref = args.preference || null
  const settings = args.settings || {}
  const source: Record<string, string> = {}

  const gigFlex = finiteOrNull(gig?.negotiation_flex_pct)
  const prefFlex = finiteOrNull(pref?.flex_pct)
  const settingsFlex = finiteOrNull(settings.negotiation_default_flex_pct)
  const flexRaw = gigFlex ?? prefFlex ?? settingsFlex
  source.flex_pct = gigFlex !== null ? 'gig' : prefFlex !== null ? 'provider' : settingsFlex !== null ? 'platform' : 'constant'

  const prefAutoAccept = finiteOrNull(pref?.auto_accept_pct)
  const settingsAutoAccept = finiteOrNull(settings.negotiation_default_auto_accept_pct)
  const autoAcceptRaw = prefAutoAccept ?? settingsAutoAccept
  source.auto_accept_pct = prefAutoAccept !== null ? 'provider' : settingsAutoAccept !== null ? 'platform' : 'constant'

  const prefBand = finiteOrNull(pref?.approval_band_pct)
  const settingsBand = finiteOrNull(settings.negotiation_default_approval_band_pct)
  const bandRaw = prefBand ?? settingsBand
  source.approval_band_pct = prefBand !== null ? 'provider' : settingsBand !== null ? 'platform' : 'constant'

  const prefConcessions = finiteOrNull(pref?.max_auto_concessions)
  const settingsConcessions = finiteOrNull(settings.negotiation_default_max_auto_concessions)
  const concessionsRaw = prefConcessions ?? settingsConcessions
  source.max_auto_concessions = prefConcessions !== null ? 'provider' : settingsConcessions !== null ? 'platform' : 'constant'

  const settingsHaggle = finiteOrNull(settings.negotiation_default_haggle_escalate_after)
  source.haggle_escalate_after = settingsHaggle !== null ? 'platform' : 'constant'

  const settingsRound = finiteOrNull(settings.negotiation_default_round_to_cents)
  source.round_to_cents = settingsRound !== null ? 'platform' : 'constant'

  const negotiationEnabled: boolean = typeof gig?.negotiation_enabled === 'boolean'
    ? gig.negotiation_enabled
    : typeof pref?.negotiation_enabled === 'boolean'
      ? pref.negotiation_enabled
      : typeof settings.negotiation_default_enabled === 'boolean'
        ? settings.negotiation_default_enabled
        : NEGOTIATION_ENABLED_DEFAULT
  source.negotiation_enabled = typeof gig?.negotiation_enabled === 'boolean'
    ? 'gig'
    : typeof pref?.negotiation_enabled === 'boolean'
      ? 'provider'
      : typeof settings.negotiation_default_enabled === 'boolean' ? 'platform' : 'constant'

  const gigMinFloor = finiteOrNull(gig?.min_floor_cents)
  const prefMinFloor = finiteOrNull(pref?.min_floor_cents)
  const minFloorRaw = gigMinFloor ?? prefMinFloor
  const minFloor = minFloorRaw !== null && minFloorRaw > 0 ? Math.round(minFloorRaw) : null
  source.min_floor_cents = gigMinFloor !== null ? 'gig' : prefMinFloor !== null ? 'provider' : 'derived'

  const settingsConsultMin = finiteOrNull(settings.negotiation_consult_min_cents)
  source.consult_min_cents = settingsConsultMin !== null ? 'platform' : 'constant'

  const prefMinEffective = finiteOrNull(pref?.min_effective_rate_cents)
  source.min_effective_rate_cents = prefMinEffective !== null ? 'provider' : 'constant'

  return {
    negotiation_enabled: negotiationEnabled,
    auto_accept_pct: normalizePct(autoAcceptRaw, AUTO_ACCEPT_PCT),
    flex_pct: normalizePct(flexRaw, FLEX_PCT),
    approval_band_pct: normalizePct(bandRaw, APPROVAL_BAND_PCT),
    max_auto_concessions: concessionsRaw !== null ? Math.max(0, Math.round(concessionsRaw)) : MAX_AUTO_CONCESSIONS,
    haggle_escalate_after: settingsHaggle !== null ? Math.max(1, Math.round(settingsHaggle)) : HAGGLE_ESCALATE_AFTER,
    round_to_cents: settingsRound !== null && settingsRound > 0 ? Math.round(settingsRound) : DEFAULT_ROUND_TO_CENTS,
    min_floor_cents: minFloor,
    consult_min_cents: settingsConsultMin !== null ? settingsConsultMin : CONSULT_MIN_CENTS,
    prefer_accept: Boolean(pref?.prefer_accept ?? PREFER_ACCEPT_DEFAULT),
    min_effective_rate_cents: prefMinEffective !== null && prefMinEffective > 0
      ? prefMinEffective
      : MIN_EFFECTIVE_HOURLY_RATE_CENTS,
    source,
  }
}

const GIG_SELECT_FULL =
  'id,title,category,subcategory,provider_id,provider_type,status,order_count,negotiation_enabled,negotiation_flex_pct,min_floor_cents,unit_pricing,hourly_rate_cents,tiers:gig_tiers(id,gig_id,tier,title,description,price,delivery_days,revisions,is_active,features,scope_depth,scope_units)'
const GIG_SELECT_BASE =
  'id,title,category,subcategory,provider_id,provider_type,status,order_count,tiers:gig_tiers(id,gig_id,tier,title,description,price,delivery_days,revisions,is_active,features)'

function normalizeGigRow(row: any): GigForScope {
  const tiers = (Array.isArray(row?.tiers) ? row.tiers : [])
    .filter((tier: any) => tier?.is_active !== false)
    .map((tier: any) => ({
      id: tier?.id || null,
      tier: tier?.tier || null,
      title: tier?.title || null,
      description: tier?.description || null,
      price: Number.isFinite(Number(tier?.price)) ? Number(tier.price) : null,
      delivery_days: Number.isFinite(Number(tier?.delivery_days)) ? Number(tier.delivery_days) : null,
      revisions: Number.isFinite(Number(tier?.revisions)) ? Number(tier.revisions) : null,
      scope_depth: tier?.scope_depth || null,
      scope_units: Number.isFinite(Number(tier?.scope_units)) ? Number(tier.scope_units) : null,
      features: Array.isArray(tier?.features) ? tier.features.map((f: any) => String(f)).filter(Boolean) : [],
    }))
    .sort((a: TierForScope, b: TierForScope) => (a.price || 0) - (b.price || 0))
  return {
    id: String(row?.id || ''),
    title: row?.title || null,
    category: row?.category || null,
    subcategory: row?.subcategory || null,
    provider_id: row?.provider_id || null,
    status: row?.status || null,
    negotiation_enabled: typeof row?.negotiation_enabled === 'boolean' ? row.negotiation_enabled : null,
    negotiation_flex_pct: finiteOrNull(row?.negotiation_flex_pct),
    min_floor_cents: finiteOrNull(row?.min_floor_cents),
    hourly_rate_cents: finiteOrNull(row?.hourly_rate_cents),
    unit_pricing: row?.unit_pricing && typeof row.unit_pricing === 'object' ? (row.unit_pricing as UnitPricing) : null,
    tiers,
  }
}

/** Provider gigs incl. the optional adaptive columns; falls back when the migration is not applied. */
export async function loadProviderGigsForScope(db: any, providerId: string): Promise<GigForScope[]> {
  const run = async (select: string) => {
    const { data, error } = await db
      .from('gigs')
      .select(select)
      .eq('provider_id', providerId)
      .in('status', ['active', 'paused'])
      .limit(50)
    if (error) throw error
    return (data || []) as any[]
  }
  let rows: any[] = []
  try {
    rows = await run(GIG_SELECT_FULL)
  } catch {
    rows = await run(GIG_SELECT_BASE).catch(() => [] as any[])
  }
  return rows.map(normalizeGigRow)
}

/** Provider-level preferences; a missing table/columns is treated as "no override". */
export async function loadProviderPricingPreferences(db: any, providerId: string): Promise<PricingPreferenceRow | null> {
  if (!providerId) return null
  try {
    const { data, error } = await db
      .from('provider_pricing_preferences')
      .select('provider_id,negotiation_enabled,auto_accept_pct,flex_pct,approval_band_pct,max_auto_concessions,prefer_accept,hourly_rate_cents,min_effective_rate_cents,min_floor_cents')
      .eq('provider_id', providerId)
      .maybeSingle()
    if (error || !data) return null
    return data as PricingPreferenceRow
  } catch {
    return null
  }
}

const TIER_DEPTH_HINTS: Array<{ depth: ScopeDepth; re: RegExp }> = [
  { depth: 'consult', re: /\b(consult|orientation|advice|guidance|call|session|quick question)\b/i },
  { depth: 'review', re: /\b(review|check|proofread|look over|feedback|audit)\b/i },
  { depth: 'partial', re: /\b(partial|one section|cover letter|single document|part of|excerpt)\b/i },
  { depth: 'full', re: /\b(full|complete|end[- ]to[- ]end|everything|packet|file|submission)\b/i },
]

export function inferTierDepth(tier: TierForScope): ScopeDepth {
  if (tier.scope_depth && ['consult', 'review', 'partial', 'full'].includes(tier.scope_depth)) {
    return tier.scope_depth as ScopeDepth
  }
  const haystack = [tier.title, tier.description, ...tier.features].filter(Boolean).join(' ')
  for (const hint of TIER_DEPTH_HINTS) if (hint.re.test(haystack)) return hint.depth
  if (tier.tier === 'basic') return 'review'
  if (tier.tier === 'standard') return 'partial'
  if (tier.tier === 'premium') return 'full'
  return 'unknown'
}

const DEPTH_ORDER: ScopeDepth[] = ['consult', 'review', 'partial', 'full']

export function tierForScope(tiers: TierForScope[], scope: ScopeSignal): TierForScope | null {
  if (!tiers.length) return null
  const wanted = scope.depth === 'unknown' ? 'full' : scope.depth
  const wantedIndex = DEPTH_ORDER.indexOf(wanted)
  const scored = tiers.map((tier) => {
    const depth = inferTierDepth(tier)
    const depthIndex = DEPTH_ORDER.indexOf(depth)
    const depthMatch = depth === wanted ? 2 : depthIndex >= wantedIndex ? 1 : 0
    const unitMatch = scope.units && tier.scope_units ? (tier.scope_units >= scope.units.qty ? 1 : 0) : 0
    return { tier, score: depthMatch * 10 + unitMatch }
  })
  const viable = scored.filter((entry) => entry.score >= 10)
  const pool = viable.length ? viable : scored
  pool.sort((a, b) => (b.score !== a.score ? b.score - a.score : (a.tier.price || 0) - (b.tier.price || 0)))
  return pool[0]?.tier || null
}

export function includesForTier(tier: TierForScope | null, unitPricing: UnitPricing | null): string[] {
  const includes: string[] = []
  if (tier) {
    const title = normalizeText(tier.title)
    if (title) includes.push(title)
    for (const feature of tier.features.slice(0, 6)) includes.push(feature)
    if (!includes.length && tier.description) includes.push(normalizeText(tier.description).slice(0, 160))
  }
  if (unitPricing?.unit) {
    const unit = String(unitPricing.unit)
    const included = Number(unitPricing.included_units) || 0
    includes.push(
      included > 0
        ? `Includes the first ${included} ${unit}(s); further ${unit}s are priced per ${unit}`
        : `Priced per ${unit}`,
    )
  }
  return includes.filter(Boolean).slice(0, 8)
}

export type GigMatch = {
  gig: GigForScope | null
  tier: TierForScope | null
  relevant: GigForScope | null
  basis: ScopedQuote['basis']
  includes: string[]
  needsProviderConfirm: boolean
}

/** Provider-owned gig + tier matching the requested scope (no provider-specific logic). */
export function resolveGigForScope(args: {
  gigs: GigForScope[]
  scope: ScopeSignal
  intent?: { categoryId?: string | null; subcategoryId?: string | null } | null
}): GigMatch {
  const gigs = (args.gigs || []).filter((gig) => gig?.id)
  if (!gigs.length) {
    return { gig: null, tier: null, relevant: null, basis: 'market_p25', includes: [], needsProviderConfirm: true }
  }
  const intent = args.intent || null
  let relevant: GigForScope | null = null
  if (intent?.categoryId) {
    relevant =
      gigs.find((gig) => gig.category === intent.categoryId && Boolean(intent.subcategoryId) && gig.subcategory === intent.subcategoryId) ||
      gigs.find((gig) => gig.category === intent.categoryId) ||
      null
  }
  const gig = relevant || gigs.find((candidate) => candidate.status === 'active') || gigs[0]
  const tier = tierForScope(gig.tiers, args.scope)
  const includes = includesForTier(tier, gig.unit_pricing || null)
  const depthKnown = args.scope.depth !== 'unknown'
  const needsProviderConfirm = !tier && (!depthKnown || args.scope.depth === 'full')
  const basis: ScopedQuote['basis'] = gig.unit_pricing?.unit_price_cents
    ? 'workload_unit'
    : tier
      ? 'workload_tier'
      : gig.hourly_rate_cents
        ? 'workload_gig_rate'
        : 'workload_default'
  return { gig, tier, relevant: relevant || gig, basis, includes, needsProviderConfirm }
}

/** The unit a tier's `scope_units` is counted in, inferred from its own copy. */
export function inferTierUnit(tier: TierForScope): ScopeUnitName {
  const text = `${tier.title || ''} ${tier.description || ''} ${(tier.features || []).join(' ')}`
  if (/\b(words?|word count)\b/i.test(text)) return 'word'
  if (/\b(forms?|applications?|petitions?)\b/i.test(text)) return 'form'
  if (/\b(documents?|files?|letters?|statements?|packet)\b/i.test(text)) return 'document'
  if (/\b(sessions?|calls?|consultation|consult|hours?)\b/i.test(text)) return 'session'
  return 'page'
}

const UNIT_WORDS: Record<ScopeUnitName, RegExp> = {
  page: /\b(pages?|pgs?)\b/i,
  word: /\b(words?|word count)\b/i,
  document: /\b(documents?|files?|letters?|statements?)\b/i,
  form: /\b(forms?|applications?|petitions?)\b/i,
  hour: /\b(hours?|hrs?)\b/i,
  session: /\b(sessions?|calls?|meetings?)\b/i,
}

/**
 * The unit `tier.scope_units` is counted in. The requested scope is the strongest
 * signal: if the tier names that unit, or its declared quantity lines up with the
 * client's quantity, use the requested unit. Only then fall back to the tier copy.
 */
export function tierUnitForScope(tier: TierForScope, scope: ScopeSignal): ScopeUnitName {
  const text = `${tier.title || ''} ${tier.description || ''} ${(tier.features || []).join(' ')}`
  const requested = scope.units?.unit
  if (requested) {
    if (UNIT_WORDS[requested].test(text)) return requested
    const declared = Number(tier.scope_units)
    const qty = Number(scope.units?.qty)
    if (Number.isFinite(declared) && declared > 0 && Number.isFinite(qty) && qty > 0) {
      if (Math.abs(declared - qty) <= Math.max(1, qty * 0.25)) return requested
    }
  }
  return inferTierUnit(tier)
}

/**
 * Implied hourly rate from the gig's own package data: tier price ÷ the workload
 * hours the tier's declared scope implies. Falls back to the unit-pricing rate
 * only when the gig has no tier price to anchor on.
 */
export function impliedHourlyRateCents(match: GigMatch, scope: ScopeSignal): number | null {
  const tier = match.tier
  if (tier?.price && tier.price > 0) {
    const depth = inferTierDepth(tier)
    // A tier that names its duration ("30 min", "1 hour") is a time-based scope.
    const minutes = /\b(\d{1,3})[- ]?min(?:ute)?s?\b/i.exec(`${tier.title || ''} ${tier.description || ''}`)
    const tierUnits: ScopeUnits = minutes
      ? { unit: 'hour', qty: Math.max(0.25, Number(minutes[1]) / 60) }
      : {
          unit: tierUnitForScope(tier, scope),
          qty: tier.scope_units && tier.scope_units > 0
            ? tier.scope_units
            : scope.units && scope.units.qty > 0 ? scope.units.qty : 1,
        }
    const probe = buildScopeSignal({ depth: depth === 'unknown' ? 'full' : depth, units: tierUnits })
    const hours = estimateWorkload(probe, {}).total_hours
    if (hours > 0) {
      return clampNumber(Math.round(tier.price / hours), MIN_IMPLIED_HOURLY_RATE_CENTS, MAX_IMPLIED_HOURLY_RATE_CENTS)
    }
  }
  const unitPricing = match.gig?.unit_pricing || null
  if (unitPricing?.unit_price_cents && unitPricing.unit) {
    const unit = String(unitPricing.unit) as ScopeUnitName
    if (['page', 'word', 'document', 'form', 'hour', 'session'].includes(unit)) {
      const probe = buildScopeSignal({
        depth: scope.depth === 'unknown' ? 'review' : scope.depth,
        units: { unit, qty: 1 },
      })
      const hours = estimateWorkload(probe, {}).total_hours
      if (hours > 0) {
        return clampNumber(
          Math.round(Number(unitPricing.unit_price_cents) / hours),
          MIN_IMPLIED_HOURLY_RATE_CENTS,
          MAX_IMPLIED_HOURLY_RATE_CENTS,
        )
      }
    }
  }
  return null
}

/** Unit-pricing sanity bound for the requested scope: base + chargeable units × unit price. */
export function unitPriceBoundCents(gig: GigForScope | null, scope: ScopeSignal): number | null {
  const unitPricing = gig?.unit_pricing || null
  const unitPrice = Number(unitPricing?.unit_price_cents)
  if (!unitPricing?.unit || !Number.isFinite(unitPrice) || unitPrice <= 0) return null
  if (!scope.units || String(unitPricing.unit) !== scope.units.unit) return null
  const included = Math.max(0, Number(unitPricing.included_units) || 0)
  const chargedUnits = Math.max(Math.max(0, Number(unitPricing.min_units) || 0), scope.units.qty - included)
  const base = Math.max(0, Number(unitPricing.base_cents) || 0)
  return Math.round(base + chargedUnits * unitPrice)
}

/** Rate resolution order: gig -> provider preference -> implied from packages -> platform default. */
export function resolveHourlyRate(args: {
  match: GigMatch
  scope: ScopeSignal
  preference?: PricingPreferenceRow | null
}): { rateCents: number; rateSource: HourlyRateSource } {
  const gigRate = Number(args.match.gig?.hourly_rate_cents)
  if (Number.isFinite(gigRate) && gigRate > 0) return { rateCents: gigRate, rateSource: 'gig' }
  const prefRate = Number(args.preference?.hourly_rate_cents)
  if (Number.isFinite(prefRate) && prefRate > 0) return { rateCents: prefRate, rateSource: 'provider' }
  const implied = impliedHourlyRateCents(args.match, args.scope)
  if (implied) return { rateCents: implied, rateSource: 'implied' }
  return { rateCents: DEFAULT_HOURLY_RATE_CENTS, rateSource: 'default' }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Scoped quote (workload-derived; packages/market are inputs + sanity bounds)
// ─────────────────────────────────────────────────────────────────────────────

export function quoteScope(args: {
  scope: ScopeSignal
  signals?: WorkloadSignals
  match: GigMatch
  policy: FlexPolicy
  preference?: PricingPreferenceRow | null
  market?: { p25Cents: number; meanCents: number } | null
  platformMinimumCents?: number
  highStakes?: boolean
}): ScopedQuote {
  const signals = args.signals || {}
  const estimate = estimateWorkload(args.scope, { ...signals, high_stakes: args.highStakes ?? signals.high_stakes })
  const rate = resolveHourlyRate({ match: args.match, scope: args.scope, preference: args.preference })
  const price = priceFromWorkload(estimate, args.policy, {
    hourlyRateCents: rate.rateCents,
    rateSource: rate.rateSource,
    minEffectiveRateCents: args.policy.min_effective_rate_cents,
    marketReference: args.market || null,
    clientBudget: signals.negotiation?.budget || null,
    clientCounterCents: signals.negotiation?.counter_cents ?? null,
    highStakes: args.highStakes ?? signals.high_stakes,
    requiresProviderConfirm: args.match.needsProviderConfirm,
    platformMinimumCents: args.platformMinimumCents,
    unitBoundCents: unitPriceBoundCents(args.match.gig, args.scope),
  })

  const consultFloor = args.policy.consult_min_cents && args.scope.depth === 'consult'
    ? Math.ceil(args.policy.consult_min_cents * (1 - args.policy.flex_pct))
    : 0
  const scopedFloor = Math.max(Math.ceil(args.policy.min_floor_cents || 0), price.floor_cents, consultFloor)

  const reasonCodes = [...estimate.reason_codes, ...price.reason_codes]
  if (args.match.basis === 'market_p25') reasonCodes.push('no_provider_gig_market_p25')

  return {
    scope: args.scope,
    workload: estimate,
    price,
    policy: args.policy,
    gig_id: args.match.gig?.id || null,
    tier_id: args.match.tier?.id || null,
    basis: args.match.basis,
    includes: args.match.includes,
    scoped_list_cents: price.price_cents,
    scoped_floor_cents: scopedFloor,
    needs_provider_confirm: price.needs_provider_confirm,
    reason_codes: reasonCodes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Counter classification + eligible actions (§3.4)
// ─────────────────────────────────────────────────────────────────────────────

export function classifyCounter(args: {
  counterCents: number | null
  listPriceCents: number
  policy: FlexPolicy
  abusive?: boolean
}): CounterClass {
  if (args.abusive) return 'abusive'
  const counter = Number(args.counterCents)
  const list = Number(args.listPriceCents)
  if (!Number.isFinite(counter) || counter <= 0 || !Number.isFinite(list) || list <= 0) return 'none'
  if (counter >= list) return 'none'
  const ratio = counter / list
  if (ratio >= 1 - args.policy.auto_accept_pct) return 'reasonable'
  if (ratio >= 1 - args.policy.flex_pct) return 'reasonable_meet'
  if (ratio >= 1 - args.policy.approval_band_pct) return 'stretch'
  return 'lowball'
}

/** flex_pct === 0 means "no automatic price moves" even if negotiation is nominally enabled. */
export function negotiationDisabledFor(policy: FlexPolicy): boolean {
  return !policy.negotiation_enabled || policy.flex_pct <= 0
}

export function eligibleActions(args: {
  counterClass: CounterClass
  policy: FlexPolicy
  hasDownscopeOption: boolean
  counterCount?: number
  finalQuoteLanguage?: boolean
  channel?: 'dm' | 'public'
}): NegotiationAction[] {
  if (args.channel === 'public') return []
  const disabled = negotiationDisabledFor(args.policy)
  const counterCount = args.counterCount || 0
  const haggleEscalate =
    counterCount >= args.policy.haggle_escalate_after ||
    (Boolean(args.finalQuoteLanguage) && counterCount >= Math.max(2, args.policy.haggle_escalate_after - 1))
  // Repeated haggling / a final quote: escalate and stop conceding entirely.
  if (haggleEscalate) return ['ESCALATE_PROVIDER', 'HOLD_VALUE']

  switch (args.counterClass) {
    case 'none':
      return ['QUOTE']
    case 'reasonable':
      return disabled ? ['HOLD_VALUE'] : ['ACCEPT']
    case 'reasonable_meet':
      if (disabled) return ['HOLD_VALUE']
      return args.policy.prefer_accept ? ['MEET_MIDDLE', 'ACCEPT'] : ['MEET_MIDDLE']
    case 'stretch':
      return args.hasDownscopeOption
        ? ['DOWNSCOPE', 'HOLD_VALUE', 'ESCALATE_PROVIDER']
        : ['HOLD_VALUE', 'ESCALATE_PROVIDER']
    case 'lowball':
      return args.hasDownscopeOption ? ['DOWNSCOPE', 'HOLD_VALUE'] : ['HOLD_VALUE', 'ESCALATE_PROVIDER']
    case 'abusive':
    default:
      return ['HOLD_VALUE', 'ESCALATE_PROVIDER']
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Downscope options + number finalization (§3.6, §7.6)
// ─────────────────────────────────────────────────────────────────────────────

export function nextLowerDepth(depth: ScopeDepth): ScopeDepth | null {
  switch (depth) {
    case 'full': return 'partial'
    case 'partial': return 'review'
    case 'review': return 'consult'
    // An unknown depth is priced as a full scope, so its first reduction is a
    // review pass (not a jump straight to a consult).
    case 'unknown': return 'review'
    default: return null
  }
}

/** Candidate reduced scopes (fewer units / shallower depth / short orientation consult). */
export function downscopeOptions(args: {
  scope: ScopeSignal
  signals?: WorkloadSignals
  match: GigMatch
  policy: FlexPolicy
  preference?: PricingPreferenceRow | null
  budgetMaxCents: number | null
  platformMinimumCents?: number
}): DownscopeOption[] {
  const signals = args.signals || {}
  const scope = args.scope
  const candidates: ScopeSignal[] = []

  if (scope.units && scope.units.qty > 1) {
    const halved = Math.max(1, Math.floor(scope.units.qty / 2))
    if (halved < scope.units.qty) {
      candidates.push(buildScopeSignal({
        depth: scope.depth,
        units: { unit: scope.units.unit, qty: halved },
        narrowing: true,
        selfServe: scope.self_serve,
        reasonCodes: ['downscope_units_halved'],
      }))
    }
  }
  const lower = nextLowerDepth(scope.depth)
  if (lower) {
    candidates.push(buildScopeSignal({
      depth: lower,
      units: scope.units,
      narrowing: true,
      selfServe: scope.self_serve,
      reasonCodes: ['downscope_depth_downgraded'],
    }))
    if (scope.units && scope.units.qty > 1) {
      const halved = Math.max(1, Math.floor(scope.units.qty / 2))
      candidates.push(buildScopeSignal({
        depth: lower,
        units: { unit: scope.units.unit, qty: halved },
        narrowing: true,
        selfServe: scope.self_serve,
        reasonCodes: ['downscope_depth_and_units'],
      }))
    }
  }
  if (scope.depth === 'consult' || scope.depth === 'unknown') {
    candidates.push(buildScopeSignal({
      depth: 'consult',
      units: null,
      narrowing: true,
      selfServe: scope.self_serve,
      variant: 'orientation_only',
      reasonCodes: ['downscope_orientation_only'],
    }))
  }

  const options: DownscopeOption[] = []
  const seen = new Set<string>([scope.scope_hash])
  for (const candidate of candidates) {
    if (seen.has(candidate.scope_hash)) continue
    seen.add(candidate.scope_hash)
    const quote = quoteScope({
      scope: candidate,
      signals,
      match: args.match,
      policy: args.policy,
      preference: args.preference,
      platformMinimumCents: args.platformMinimumCents,
    })
    if (quote.scoped_list_cents <= 0) continue
    if (args.budgetMaxCents !== null && quote.scoped_list_cents > args.budgetMaxCents) continue
    if (quote.scoped_list_cents < quote.scoped_floor_cents) continue
    options.push({
      scope: candidate,
      workload: quote.workload,
      price_cents: quote.scoped_list_cents,
      floor_cents: quote.scoped_floor_cents,
      summary: candidate.summary,
    })
  }
  return options.sort((a, b) => b.price_cents - a.price_cents)
}

export type FinalizedNumbers = {
  price_cents: number | null
  action: NegotiationAction
  concessions_used: number
  reason_codes: string[]
}

/** Round, clamp (floor + client budget), keep monotonic per scope hash, cap concessions. */
export function finalizeNumbers(args: {
  action: NegotiationAction
  listPriceCents: number
  floorCents: number
  policy: FlexPolicy
  counterCents?: number | null
  downscopePriceCents?: number | null
  clientBudgetMaxCents?: number | null
  scopeHash: string
  previousQuotes?: Array<{ cents: number; scope_hash: string }> | null
  concessionsUsed?: number
}): FinalizedNumbers {
  const policy = args.policy
  const reasonCodes: string[] = []
  let concessionsUsed = Math.max(0, Math.round(args.concessionsUsed || 0))

  if (args.action === 'HOLD_VALUE' || args.action === 'ESCALATE_PROVIDER') {
    return { price_cents: null, action: args.action, concessions_used: concessionsUsed, reason_codes: ['no_number_for_action'] }
  }
  if (negotiationDisabledFor(policy) && (args.action === 'ACCEPT' || args.action === 'MEET_MIDDLE')) {
    return { price_cents: null, action: 'HOLD_VALUE', concessions_used: concessionsUsed, reason_codes: ['negotiation_disabled'] }
  }
  const isConcession = args.action === 'MEET_MIDDLE' || args.action === 'DOWNSCOPE' || args.action === 'ACCEPT'
  if (isConcession && concessionsUsed >= policy.max_auto_concessions) {
    return {
      price_cents: null,
      action: 'ESCALATE_PROVIDER',
      concessions_used: concessionsUsed,
      reason_codes: ['max_concessions_reached'],
    }
  }

  let target: number
  switch (args.action) {
    case 'ACCEPT':
      target = Number(args.counterCents) || 0
      break
    case 'MEET_MIDDLE':
      target = ((Number(args.counterCents) || 0) + args.listPriceCents) / 2
      break
    case 'DOWNSCOPE':
      target = Number(args.downscopePriceCents) || 0
      break
    default:
      target = args.listPriceCents
      break
  }
  if (!Number.isFinite(target) || target <= 0) {
    return { price_cents: null, action: 'HOLD_VALUE', concessions_used: concessionsUsed, reason_codes: ['invalid_target_price'] }
  }

  const floor = Math.max(Math.ceil(args.floorCents || 0), 1)
  let price = roundToStep(target, policy.round_to_cents)
  // Never round an ACCEPT above the client's own figure.
  if (args.action === 'ACCEPT' && Number.isFinite(Number(args.counterCents))) {
    const step = policy.round_to_cents || DEFAULT_ROUND_TO_CENTS
    const counter = Math.round(Number(args.counterCents))
    if (price > counter) {
      price = Math.floor(counter / step) * step
      reasonCodes.push('counter_round_down')
    }
  }
  if (price < floor) {
    price = roundToStep(floor, policy.round_to_cents)
    if (price < floor) price = floor
    reasonCodes.push('floor_clamped')
  }
  const budgetMax = Number(args.clientBudgetMaxCents)
  if (Number.isFinite(budgetMax) && budgetMax > 0 && price > budgetMax) {
    const lowered = roundToStep(Math.min(budgetMax, price), policy.round_to_cents)
    if (lowered >= floor) {
      price = lowered
      reasonCodes.push('budget_clamped')
    } else {
      return {
        price_cents: null,
        action: 'ESCALATE_PROVIDER',
        concessions_used: concessionsUsed,
        reason_codes: [...reasonCodes, 'budget_below_floor'],
      }
    }
  }

  const previousForScope = (args.previousQuotes || [])
    .filter((quote) => quote && quote.scope_hash === args.scopeHash && Number(quote.cents) > 0)
    .map((quote) => Math.round(Number(quote.cents)))
  if (previousForScope.length) {
    const cheapest = Math.min(...previousForScope)
    if (price > cheapest) {
      price = roundToStep(cheapest, policy.round_to_cents)
      if (price > cheapest) price = cheapest
      reasonCodes.push('monotonic_per_scope')
    }
  }

  // A prior quote is not permission to cross today's floor. If the monotonic
  // ceiling is now below the current floor, stop and ask the provider instead
  // of returning a price that the guard would have to approve below-floor.
  if (price < floor) {
    return {
      price_cents: null,
      action: 'ESCALATE_PROVIDER',
      concessions_used: concessionsUsed,
      reason_codes: [...reasonCodes, 'monotonic_below_current_floor'],
    }
  }

  if (isConcession) concessionsUsed += 1
  return { price_cents: price, action: args.action, concessions_used: concessionsUsed, reason_codes: reasonCodes }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Adaptive decision (wraps the market-evidence layer)
// ─────────────────────────────────────────────────────────────────────────────

function recommendedActionFor(args: {
  counterClass: CounterClass
  eligible: NegotiationAction[]
  hasDownscopeOption: boolean
}): NegotiationAction {
  const preferred: NegotiationAction[] = (() => {
    switch (args.counterClass) {
      case 'none': return ['QUOTE']
      case 'reasonable': return ['ACCEPT', 'HOLD_VALUE']
      case 'reasonable_meet': return ['MEET_MIDDLE', 'ACCEPT', 'HOLD_VALUE']
      case 'stretch': return args.hasDownscopeOption ? ['DOWNSCOPE', 'ESCALATE_PROVIDER', 'HOLD_VALUE'] : ['ESCALATE_PROVIDER', 'HOLD_VALUE']
      case 'lowball': return args.hasDownscopeOption ? ['DOWNSCOPE', 'HOLD_VALUE', 'ESCALATE_PROVIDER'] : ['ESCALATE_PROVIDER', 'HOLD_VALUE']
      case 'abusive':
      default: return ['HOLD_VALUE', 'ESCALATE_PROVIDER']
    }
  })()
  for (const candidate of preferred) if (args.eligible.includes(candidate)) return candidate
  return args.eligible[0] || 'HOLD_VALUE'
}

export async function buildAdaptivePricingDecision(args: {
  db: any
  provider: any
  client: any
  messages: any[]
  latestClientText: string
  channel?: 'dm' | 'public'
  pricing?: PricingAuthority | null
  memory?: YqaaConversationMemory | null
  settings?: Record<string, any> | null
  now?: Date
  highStakes?: boolean
}): Promise<AdaptivePricingDecision> {
  const channel = args.channel || 'dm'
  const pricing = args.pricing || await buildMessengerPricingAuthority({
    db: args.db,
    provider: args.provider,
    client: args.client,
    messages: args.messages,
    latestClientText: args.latestClientText,
  })

  const memoryNegotiation = (args.memory?.negotiation || null) as YqaaNegotiationMemory | null
  const context: SignalContext = {
    clientId: args.client?.id ? String(args.client.id) : null,
    memory: memoryNegotiation,
    now: args.now,
  }
  const scope = extractScopeSignal(args.messages, context)
  const negotiation = extractNegotiationSignal(args.messages, context)
  const urgency = extractUrgencySignal(args.messages, context)
  const complexity = extractComplexitySignal(args.messages, context, urgency)
  const agency = extractAgencySignal(args.messages, context)
  const signals: WorkloadSignals = {
    negotiation,
    urgency,
    complexity,
    agency,
    high_stakes: Boolean(args.highStakes),
  }

  const settings = args.settings || await import('@/lib/fiverr').then((mod) => mod.getPaymentSettingsForApi())
  const platformMinimumCents = Number(settings?.minimum_offer_amount_cents) || 0

  const [gigs, preference] = await Promise.all([
    loadProviderGigsForScope(args.db, args.provider?.id).catch(() => [] as GigForScope[]),
    loadProviderPricingPreferences(args.db, args.provider?.id).catch(() => null),
  ])
  const match = resolveGigForScope({ gigs, scope, intent: pricing.intent })
  const policy = resolveFlexPolicy({ gig: match.gig, preference, settings })
  const quote = quoteScope({
    scope,
    signals,
    match,
    policy,
    preference,
    market: pricing.market ? { p25Cents: pricing.market.p25Cents, meanCents: pricing.market.meanCents } : null,
    platformMinimumCents,
    highStakes: args.highStakes,
  })

  const budgetReference = negotiation.counter_cents ?? negotiation.budget?.maxCents ?? null
  const counterClass = classifyCounter({
    counterCents: budgetReference,
    listPriceCents: quote.scoped_list_cents,
    policy,
    abusive: negotiation.abusive,
  })

  const options = counterClass === 'stretch' || counterClass === 'lowball' || counterClass === 'abusive'
    ? downscopeOptions({
        scope,
        signals,
        match,
        policy,
        preference,
        budgetMaxCents: budgetReference,
        platformMinimumCents,
      })
    : []
  const bestDownscope = options[0] || null

  const eligible = eligibleActions({
    counterClass,
    policy,
    hasDownscopeOption: Boolean(bestDownscope),
    counterCount: negotiation.counter_count,
    finalQuoteLanguage: negotiation.final_quote_language,
    channel,
  })
  const recommended = channel === 'public'
    ? 'HOLD_VALUE'
    : recommendedActionFor({ counterClass, eligible, hasDownscopeOption: Boolean(bestDownscope) })

  const previousQuotes = (memoryNegotiation?.quotes_made || []).map((row) => ({ cents: row.cents, scope_hash: row.scope_hash }))
  const downscopeFloor = recommended === 'DOWNSCOPE' && bestDownscope ? bestDownscope.floor_cents : quote.scoped_floor_cents
  const finalized = finalizeNumbers({
    action: recommended,
    listPriceCents: quote.scoped_list_cents,
    floorCents: downscopeFloor,
    policy,
    counterCents: budgetReference,
    downscopePriceCents: bestDownscope?.price_cents ?? null,
    clientBudgetMaxCents: negotiation.budget?.maxCents ?? budgetReference,
    scopeHash: finalizedScopeHash(recommended, bestDownscope, quote),
    previousQuotes,
    concessionsUsed: memoryNegotiation?.concessions_used || 0,
  })

  // A range-with-confirmation turn never carries a firm number (§7.8).
  const approvedPrice = quote.needs_provider_confirm ? null : finalized.price_cents
  const approvalRequired =
    channel === 'dm' &&
    (finalized.action === 'ESCALATE_PROVIDER' || quote.needs_provider_confirm || Boolean(policy.min_floor_cents && approvedPrice && approvedPrice < policy.min_floor_cents))
  // A generated token only describes this deterministic pricing decision. It
  // is not evidence that a provider approved a below-floor exception.

  const status: AdaptivePricingStatus = (() => {
    if (channel === 'public') return 'public_no_negotiation'
    if (!negotiation.budget && !negotiation.counter_cents) return 'need_budget'
    if (pricing.status === 'insufficient_scope' || pricing.status === 'insufficient_market_data') return pricing.status
    if (quote.needs_provider_confirm || finalized.action === 'ESCALATE_PROVIDER') return 'provider_approval_required'
    if (approvedPrice && approvedPrice > 0) return counterClass === 'none' ? 'ready' : 'negotiating'
    return 'budget_too_low'
  })()

  const reasonCodes = [
    ...scope.reason_codes,
    ...negotiation.reason_codes,
    ...urgency.reason_codes,
    ...complexity.reason_codes,
    ...agency.reason_codes,
    ...quote.reason_codes,
    ...finalized.reason_codes,
    `counter_class_${counterClass}`,
    `action_${finalized.action}`,
    `rate_source_${quote.price.rate_source}`,
  ]

  const publicTierPrices = (match.gig?.tiers || [])
    .map((tier) => Number(tier.price))
    .filter((price) => Number.isFinite(price) && price > 0)

  return {
    status,
    currency: pricing.currency,
    channel,
    scope,
    negotiation,
    workload: quote.workload,
    price: quote.price,
    quote,
    policy,
    gig_id: quote.gig_id,
    tier_id: quote.tier_id,
    counter_class: counterClass,
    counter_cents: negotiation.counter_cents,
    eligible_actions: eligible,
    recommended_action: recommended,
    approved_price_cents: channel === 'public' ? null : approvedPrice,
    approved_floor_cents: channel === 'public' || !approvedPrice ? null : downscopeFloor,
    approval_required: approvalRequired,
    approval_token: null,
    downscope_options: options,
    client_safe: {
      approved_quote_cents: channel === 'public' ? null : approvedPrice,
      list_price_cents: quote.scoped_list_cents > 0 ? quote.scoped_list_cents : null,
      budget: negotiation.budget,
      client_counter_cents: negotiation.counter_cents,
      public_tier_prices_cents: publicTierPrices,
      includes: quote.includes,
      urgency_band: urgency.band,
    },
    reason_codes: reasonCodes,
    evidence: pricing,
  }
}

export function finalizedScopeHash(
  action: NegotiationAction,
  downscope: DownscopeOption | null,
  quote: ScopedQuote,
): string {
  return action === 'DOWNSCOPE' && downscope ? downscope.scope.scope_hash : quote.scope.scope_hash
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Client-safe rendering + plain-language explanations
// ─────────────────────────────────────────────────────────────────────────────

function money(cents: number | null | undefined, currency = 'usd') {
  if (!Number.isFinite(Number(cents))) return '—'
  const symbol = String(currency).toLowerCase() === 'usd' ? '$' : `${String(currency).toUpperCase()} `
  return `${symbol}${(Number(cents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/**
 * Model-facing negotiation block: ONLY client-safe numbers (approved quote, the
 * client's own figures, public tier list prices, includes). No floors, means,
 * rates, weights or multipliers ever appear here.
 */
export function renderNegotiationAuthority(decision: AdaptivePricingDecision) {
  const cs = decision.client_safe
  const lines: string[] = [
    '# NEGOTIATION STATE — SERVER-AUTHORIZED NUMBERS — use only these',
    `Status: ${decision.status}`,
    `Scope priced this turn: ${decision.scope.summary}${decision.gig_id ? ` (gig ${decision.gig_id})` : ''}`,
    cs.budget
      ? `Client-stated budget: ${cs.budget.minCents ? `${money(cs.budget.minCents, decision.currency)}–` : ''}${money(cs.budget.maxCents, decision.currency)} ${decision.currency.toUpperCase()}`
      : 'Client-stated budget: not provided',
    cs.client_counter_cents ? `Client counter / most recent figure: ${money(cs.client_counter_cents, decision.currency)}` : null,
    decision.approved_price_cents
      ? `SERVER-APPROVED PRICE FOR THIS TURN: ${money(decision.approved_price_cents, decision.currency)} ${decision.currency.toUpperCase()}`
      : 'SERVER-APPROVED PRICE FOR THIS TURN: none — do not state a price and do not create an offer',
    decision.price.range
      ? `Range path only: ${money(decision.price.range.min_cents, decision.currency)}–${money(decision.price.range.max_cents, decision.currency)}, and only together with a provider-confirmation next step`
      : null,
    `Server-authorized action: ${decision.recommended_action}`,
    cs.urgency_band === 'rush'
      ? 'Timeline: the client is on a short deadline. Say the rush timeline is reflected — never quote rates or multipliers.'
      : null,
    cs.public_tier_prices_cents.length
      ? `Public package list prices you may cite: ${cs.public_tier_prices_cents.map((cents) => money(cents, decision.currency)).join(', ')}`
      : null,
    cs.includes.length ? `What the server-approved price includes:\n${cs.includes.map((item) => `- ${item}`).join('\n')}` : null,
    '',
    'NEGOTIATION RULES:',
    '1. Use ONLY the server-approved price above, the client\'s own figures, or public package list prices. Never invent, raise, or round a number yourself.',
    '2. Never mention internal pricing policy: no floors, minimums, bands, percentages, averages, rates, weights, multipliers, or "revenue-safe" language.',
    '3. Acknowledge the client\'s constraint in their own terms, say what the reduced price includes, and give ONE clear next step.',
    '4. Range quotes are never firm: present them as "I can ask the provider to confirm".',
    '5. If the action is ESCALATE_PROVIDER, say a human will review pricing flexibility. Do not promise a discount.',
  ]
  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}

const COMPONENT_PHRASES: Record<WorkloadComponent, string> = {
  intake_consult: 'the intake call',
  consult_prep: 'consult preparation',
  consult_session: 'the consult call itself',
  document_review: 'reviewing the documents',
  drafting: 'drafting',
  research: 'research',
  filing_admin: 'filing and admin',
  follow_ups: 'follow-up',
}

/**
 * Plain-language description of what changed between two workload estimates.
 * Hours and direction only — never rates, weights, floors or multipliers.
 */
export function explainWorkloadChange(
  previous: WorkloadEstimate | null | undefined,
  current: WorkloadEstimate | null | undefined,
): string | null {
  if (!previous || !current) return null
  const previousByComponent = new Map(previous.breakdown.map((row) => [row.component, row.hours]))
  let biggest: { component: WorkloadComponent; delta: number } | null = null
  for (const row of current.breakdown) {
    const delta = row.hours - (previousByComponent.get(row.component) || 0)
    if (Math.abs(delta) < 0.25) continue
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { component: row.component, delta }
  }
  if (!biggest) {
    const totalDelta = current.total_hours - previous.total_hours
    if (Math.abs(totalDelta) < 0.25) return 'This is the same amount of work we discussed, so the price stays where it is.'
    const hours = Math.abs(Math.round(totalDelta * 10) / 10)
    return totalDelta < 0
      ? `This is about ${hours} hours less work than before, so the price comes down.`
      : `This adds about ${hours} hours of work, so the price moves up.`
  }
  const hours = Math.abs(Math.round(biggest.delta * 10) / 10)
  const phrase = COMPONENT_PHRASES[biggest.component]
  if (biggest.delta < 0) {
    if (biggest.component === 'document_review') {
      return `Since you'll handle the document gathering yourself, that's about ${hours} fewer hours of work.`
    }
    return `Since ${phrase} is smaller now, that's about ${hours} fewer hours of work.`
  }
  if (biggest.component === 'research') {
    return `Because of the extra history to work around, that adds about ${hours} hours of research.`
  }
  return `This adds about ${hours} hours of ${phrase}, so the price reflects it.`
}

/** Public chat never offers and never negotiates: public list prices + DM pointer only. */
export function publicChatPricingPolicy() {
  return {
    allow_offers: false,
    allow_negotiation: false,
    allow_public_tier_list_prices: true,
    pointer: 'Smaller scopes and pricing flexibility are handled in the provider DM against the provider\'s server-approved pricing.',
  }
}

/** Server-synthesised offer shape from an approved quote (no model numbers involved). */
export function synthesizeOfferFromQuote(decision: AdaptivePricingDecision, titleOverride?: string | null) {
  const price = decision.approved_price_cents
  if (!price || price <= 0) return null
  const title = normalizeText(titleOverride) || `Scoped ${decision.scope.depth === 'unknown' ? 'legal' : decision.scope.depth} work`
  const includes = decision.client_safe.includes.slice(0, 4)
  const description = [
    `Scope: ${decision.scope.summary}.`,
    `${decision.scope.self_serve ? 'Client handles the document gathering; ' : ''}server-approved pricing for this scope.`,
    includes.length ? `Includes: ${includes.join('; ')}.` : '',
  ].filter(Boolean).join(' ')
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 1200),
    delivery_days: DEFAULT_DELIVERY_DAYS,
    revisions: DEFAULT_REVISIONS,
    expires_in_days: DEFAULT_OFFER_EXPIRES_DAYS,
    gig_id: decision.gig_id || undefined,
  }
}
