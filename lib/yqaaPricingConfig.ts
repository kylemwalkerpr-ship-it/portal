/**
 * YQAA adaptive-pricing configuration — ONE file, every tunable named + commented.
 *
 * Scope: system-wide. Nothing here is provider-, client-, gig- or practice-area
 * specific. Providers overrides come from data (`gigs.*`, `provider_pricing_preferences.*`,
 * platform settings `negotiation_default_*`); the constants below are the platform
 * fallback used when neither the row nor the settings key exists, so the code works
 * with or without the additive migration `supabase/yqaa_adaptive_pricing.sql`.
 *
 * Percentages are FRACTIONS here (0.10 === 10%). Values loaded from the database
 * or platform settings are normalised by `normalizePct()` in `lib/yqaaAdaptivePricing.ts`.
 *
 * All band / workload defaults are flagged pending Sharon + provider confirmation
 * (see docs/yqaa/PRICING-ADAPTIVE.md §6). Change them here, nowhere else.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. NEGOTIATION BANDS (PRICING-ADAPTIVE §3.3)
// ─────────────────────────────────────────────────────────────────────────────

/** Counter ≥ (1 − this) of the scoped price → accept the client's own number. */
export const AUTO_ACCEPT_PCT = 0.10

/** Widest automatic concession: counters ≥ (1 − this) meet in the middle. Matches MIN_REFERENCE_RATIO. */
export const FLEX_PCT = 0.15

/** Counters between (1 − this) and (1 − flex) need a downscope or provider approval; below = lowball. */
export const APPROVAL_BAND_PCT = 0.35

/** Automatic YQAA price moves allowed per scope before we hold value or escalate. */
export const MAX_AUTO_CONCESSIONS = 2

/** Client counters (or 2 after a "final" quote) before pricing escalates to the provider. */
export const HAGGLE_ESCALATE_AFTER = 3

/** Every client-facing price ends on this multiple of cents ($5). */
export const ROUND_TO_CENTS = 500

/** Negotiation is ON by default for every provider/gig; they may opt out (gig or provider row). */
export const NEGOTIATION_ENABLED_DEFAULT = true

/** Optional platform-wide minimum for a short orientation consult. null = unset (Sharon to decide). */
export const CONSULT_MIN_CENTS: number | null = null

/** Provider preference default: when true, a `reasonable_meet` counter may be fully accepted. */
export const PREFER_ACCEPT_DEFAULT = false

/** Fallback `round_to_cents` when a provider row / settings key is absent. */
export const DEFAULT_ROUND_TO_CENTS = ROUND_TO_CENTS

// ─────────────────────────────────────────────────────────────────────────────
// 2. RATES (PRICING-ADAPTIVE §7.1) — internal only, never rendered to clients
// ─────────────────────────────────────────────────────────────────────────────

/** Platform fallback internal hourly rate when the gig/provider exposes no rate and no package math exists. */
export const DEFAULT_HOURLY_RATE_CENTS = 22_000

/**
 * Absolute margin floor: hours × this rate. Hard floor for the scoped quote (§7.5).
 * Deliberately set below any plausible provider rate so workload pricing stays
 * anchored to provider data; it only ever brakes a race to the bottom.
 */
export const MIN_EFFECTIVE_HOURLY_RATE_CENTS = 4_500

/** Lower clamp for a gig-package-implied rate (tier price ÷ implied hours) — guards against tiny packages. */
export const MIN_IMPLIED_HOURLY_RATE_CENTS = 4_000

/** Upper clamp for a gig-package-implied rate — a premium package cannot imply an absurd rate. */
export const MAX_IMPLIED_HOURLY_RATE_CENTS = 60_000

// ─────────────────────────────────────────────────────────────────────────────
// 3. WORKLOAD HOURS PER COMPONENT (PRICING-ADAPTIVE §7.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Intake + consult conversation time. Present for every new matter. */
export const INTAKE_CONSULT_HOURS = 0.5

/** Light preparation for a consult-only scope (read the story, sketch the options). */
export const CONSULT_PREP_HOURS = 0.25

/** Hours per explicitly requested consult hour/session unit ("a 1-hour call", "one session"). */
export const CONSULT_SESSION_HOURS = 1.0

/** Share of the intake consult kept by the smallest "quick orientation" downscope option. */
export const ORIENTATION_ONLY_SHARE = 0.5

/** Base review time per document (open, skim structure, verify completeness). */
export const DOCUMENT_REVIEW_HOURS_PER_DOC = 0.25

/** Review time per page (≈3 minutes/page of substantive review). */
export const DOCUMENT_REVIEW_HOURS_PER_PAGE = 0.05

/** Drafting time per form (fill, cross-check against evidence, prepare for filing). */
export const DRAFTING_HOURS_PER_FORM = 1.5

/** Drafting time per letter/cover letter/statement. */
export const DRAFTING_HOURS_PER_LETTER = 1.0

/** Drafting time per 500 words of authored/rewritten prose. */
export const DRAFTING_HOURS_PER_500_WORDS = 1.0

/** Drafting time per page when the deliverable is measured in pages. */
export const DRAFTING_HOURS_PER_PAGE = 0.2

/** Review time per form when a filled form is checked (independent of the drafting term). */
export const FORM_REVIEW_HOURS = 0.75

/** Assumed pages per document when the client gives a document count but no page count. */
export const ASSUMED_PAGES_PER_DOCUMENT = 2

/** Filing, packaging, portal submission and admin time (dropped for review-only/consult). */
export const FILING_ADMIN_HOURS = 1.0

/** Expected client back-and-forth / response buffer (RFE, clarification, revision hand-off). */
export const FOLLOW_UP_HOURS = 0.5

/** Minimum research component present for any partial/full matter. */
export const RESEARCH_BASE_HOURS = 0.25

/** Share of full drafting hours kept by a `partial` scope (one section / one deliverable). */
export const PARTIAL_DEPTH_DRAFTING_SHARE = 0.35

/** Share of full filing/admin hours kept by a `partial` scope. */
export const PARTIAL_DEPTH_FILING_SHARE = 0.35

/** Drafting share for a `review` scope (review reads and comments; it does not author). */
export const REVIEW_DEPTH_DRAFTING_SHARE = 0

/** Filing/admin share for a `review` scope. */
export const REVIEW_DEPTH_FILING_SHARE = 0

/** Follow-up share for a `review` scope (lighter hand-off). */
export const REVIEW_DEPTH_FOLLOW_UP_SHARE = 0.5

/** How a `unknown` depth is treated when estimating hours (full-scope estimate, low confidence). */
export const UNKNOWN_DEPTH_TREATED_AS_FULL = true

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESEARCH + COMPLEXITY (PRICING-ADAPTIVE §7.2)
//    Each weight is the RESEARCH HOURS added by that signal. The complexity
//    multiplier grows with the same weights (below) and is capped.
// ─────────────────────────────────────────────────────────────────────────────

/** A prior refusal/denial in the history: rebuild the factual and legal timeline. */
export const COMPLEXITY_HOURS_PRIOR_DENIAL = 2.0

/** Status violation / overstay / gap in status: exposure analysis. */
export const COMPLEXITY_HOURS_STATUS_VIOLATION = 2.5

/** More than one jurisdiction or filing route in play. */
export const COMPLEXITY_HOURS_MULTIPLE_JURISDICTIONS = 1.5

/** An outstanding RFE / NOID / deadline-driven agency response. */
export const COMPLEXITY_HOURS_RFE_NOID = 2.0

/** Declared criminal history / inadmissibility screening. */
export const COMPLEXITY_HOURS_CRIMINAL_HISTORY = 3.0

/** Compressed timeline forces re-sequencing of the work. */
export const COMPLEXITY_HOURS_TIGHT_DEADLINE = 1.0

/** Novel / unusual fact pattern with no standard pathway. */
export const COMPLEXITY_HOURS_NOVEL_ISSUE = 1.5

/** Total research hours are capped so one signal cannot run away with the estimate. */
export const COMPLEXITY_RESEARCH_HOURS_CAP = 12.0

/** Each research hour adds this much to `complexity_multiplier` (difficulty premium on every hour). */
export const COMPLEXITY_MULTIPLIER_PER_RESEARCH_HOUR = 0.05

/** Hard cap on `complexity_multiplier`. */
export const COMPLEXITY_MULTIPLIER_CAP = 1.75

// ─────────────────────────────────────────────────────────────────────────────
// 5. URGENCY (PRICING-ADAPTIVE §7.3)
// ─────────────────────────────────────────────────────────────────────────────

/** More than this many days out → no rush premium. */
export const URGENCY_DAYS_STANDARD = 30

/** This many days or fewer → full rush premium. */
export const URGENCY_DAYS_RUSH = 7

/** Baseline (no rush) multiplier. */
export const URGENCY_MULTIPLIER_STANDARD = 1.0

/** 8–30 days out. */
export const URGENCY_MULTIPLIER_SOON = 1.15

/** 7 days or fewer out. */
export const URGENCY_MULTIPLIER_RUSH = 1.4

/** Days assumed for vague near-term language ("next week", "soon", "asap"). */
export const URGENCY_VAGUE_SOON_DAYS = 5

// ─────────────────────────────────────────────────────────────────────────────
// 6. AGENCY / CAPACITY (PRICING-ADAPTIVE §7.4) — client self-service reduces hours
// ─────────────────────────────────────────────────────────────────────────────

/** "I'll do the legwork" / "I'll gather the documents" → filing/admin removed (share 1.0 = removed). */
export const AGENCY_SELF_SERVE_FILING_REDUCTION = 1.0

/** Self-service also shortens the follow-up buffer (share of follow-up hours removed). */
export const AGENCY_SELF_SERVE_FOLLOW_UP_REDUCTION = 0.5

/** "I already filled it out" → drafting hours reduced by this share. */
export const AGENCY_PREFILLED_DRAFTING_REDUCTION = 0.5

/** "I have all the documents ready" → review/document handling reduced by this share. */
export const AGENCY_SUPPLIED_DOCUMENTS_REVIEW_REDUCTION = 0.2

/** Review-only intent removes filing/admin entirely (share 1.0 = removed). */
export const AGENCY_REVIEW_ONLY_FILING_REDUCTION = 1.0

// ─────────────────────────────────────────────────────────────────────────────
// 7. WEIGHTED BUSINESS DECISION (PRICING-ADAPTIVE §7.5)
//    The four weights sum to 1.0. The market reference is a SANITY CLAMP only
//    (never a price source); the margin floor is absolute.
// ─────────────────────────────────────────────────────────────────────────────

/** Weight of hours × rate × multipliers in the blended price. */
export const WEIGHT_COST_OF_HOURS = 0.78

/** Weight of the client's range-aware budget signal (nudges toward a stated budget, never above it). */
export const WEIGHT_BUDGET_SIGNAL = 0.12

/** Weight of the conversion/repeat-likelihood term (a small close-friendly adjustment). */
export const WEIGHT_CONVERSION = 0.06

/** Weight of the risk/liability term (a small premium for harder matters). */
export const WEIGHT_RISK = 0.04

/** Maximum conversion discount applied to the cost-of-hours term (at conversion score 1). */
export const CONVERSION_DISCOUNT_MAX_PCT = 0.10

/** Maximum risk premium applied to the cost-of-hours term (at risk score 1). */
export const RISK_PREMIUM_MAX_PCT = 0.15

/** Market sanity bound, low side: clamp the blended price to at least market p25 × this. */
export const MARKET_SANITY_LO_RATIO = 0.5

/** Market sanity bound, high side: clamp the blended price to at most market mean × this. */
export const MARKET_SANITY_HI_RATIO = 2.0

/** Low side of the gig unit-pricing sanity bound: price ≥ (units × unit price + base) × this. */
export const UNIT_BOUND_LO_RATIO = 0.5

/** High side of the gig unit-pricing sanity bound: price ≤ (units × unit price + base) × this. */
export const UNIT_BOUND_HI_RATIO = 2.0

/** Budget-fit signal is converted to 0..1 using this tolerance above/below the client's max. */
export const BUDGET_FIT_TOLERANCE_PCT = 0.2

/** Risk score added when the matter carries a high-stakes signal (removal/court/criminal). */
export const RISK_SCORE_HIGH_STAKES = 0.6

/** Risk score added when the client has already shown hesitation or exit intent. */
export const RISK_SCORE_HESITATION = 0.2

// ─────────────────────────────────────────────────────────────────────────────
// 8. CONFIDENCE + RANGE / ESCALATION THRESHOLDS (PRICING-ADAPTIVE §7.8)
// ─────────────────────────────────────────────────────────────────────────────

/** Starting confidence before clarity bonuses/penalties. */
export const CONFIDENCE_BASE = 0.7

/** Bonus when the scope depth is explicit. */
export const CONFIDENCE_SCOPE_DEPTH_BONUS = 0.1

/** Bonus when a concrete unit (pages/words/forms/…) is known. */
export const CONFIDENCE_SCOPE_UNITS_BONUS = 0.1

/** Bonus when the client stated an explicit budget or counter. */
export const CONFIDENCE_EXPLICIT_BUDGET_BONUS = 0.05

/** Penalty per complexity flag (uncertainty grows with unusual inputs). */
export const CONFIDENCE_COMPLEXITY_PENALTY_PER_FLAG = 0.05

/** Confidence floor / ceiling. */
export const CONFIDENCE_MIN = 0.1
export const CONFIDENCE_MAX = 0.95

/** Above this many inferred hours: quote a range + provider confirmation instead of a firm price. */
export const RANGE_HOURS_THRESHOLD = 10.0

/** Above this complexity multiplier: range + provider confirmation. */
export const RANGE_COMPLEXITY_THRESHOLD = 1.4

/** Below this confidence: range + provider confirmation. */
export const RANGE_CONFIDENCE_THRESHOLD = 0.5

/** Range spread applied around the priced figure when the range path is taken (±this share). */
export const PRICE_RANGE_SPREAD_PCT = 0.15

// ─────────────────────────────────────────────────────────────────────────────
// 9. OFFER SHAPE DEFAULTS (server-synthesised offers from an approved quote)
// ─────────────────────────────────────────────────────────────────────────────

/** Delivery days used when neither the matched tier nor the model supplies one. */
export const DEFAULT_DELIVERY_DAYS = 5

/** Revisions included in a server-synthesised offer. */
export const DEFAULT_REVISIONS = 1

/** Offer expiry window for a server-synthesised offer. */
export const DEFAULT_OFFER_EXPIRES_DAYS = 7

/** Minimum description length for an inserted offer (existing platform rule). */
export const MIN_OFFER_DESCRIPTION_CHARS = 30
