/**
 * P10 conversion attribution — the shared vocabulary.
 *
 * This module is pure data + pure helpers so it can be imported from the
 * browser bundle, the Next.js server runtime and `middleware.ts` (edge) without
 * pulling in a database client.
 *
 * Invariants encoded here (see supabase/migrations/20260922120000_p10_conversion_attribution.sql):
 *  - a first-party attribution identity exists only under granted analytics consent;
 *  - denied/unknown consent means the acquisition source stays UNKNOWN, never inferred;
 *  - a session identity proves CONTINUITY and CONSENT, never ACQUISITION: an active
 *    session whose source class is `unknown` is `session_only`, not `attributed`;
 *  - browser code may never declare a lead, order, payment or refund event;
 *  - the anonymous attribution identity is separate from the authenticated business
 *    identity — telemetry stores business OBJECT references only, never a profile id.
 */

/** Bumped when the stored event/session shape changes in a breaking way. */
export const ATTRIBUTION_CONTRACT_VERSION = 1
export const ATTRIBUTION_EVENT_VERSION = 1

/** First-party cookie carrying the opaque browser token (httpOnly). */
export const ATTRIBUTION_COOKIE = 'yousafe_attr'
/** Short-lived cookie carrying a signed cross-domain handoff token (readable by our JS). */
export const ATTRIBUTION_HANDOFF_COOKIE = 'yousafe_attr_handoff'
/** Server-readable mirror of the analytics consent choice made in the banner. */
export const ANALYTICS_CONSENT_COOKIE = 'yousafe_consent'
/** Short-lived cookie carrying a consent-gated campaign capture past the 301. */
export const ATTRIBUTION_SOURCE_COOKIE = 'yousafe_attr_source'

export const ATTRIBUTION_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
export const ATTRIBUTION_HANDOFF_TTL_SECONDS = 60 * 10 // 10 minutes, single hop
export const ATTRIBUTION_SOURCE_TTL_SECONDS = 60 * 30 // 30 minutes
export const ATTRIBUTION_MAX_CAMPAIGN_VALUE_LENGTH = 200
export const ATTRIBUTION_MAX_PATH_LENGTH = 512
export const ATTRIBUTION_MAX_CTA_ID_LENGTH = 120

export type AnalyticsConsent = 'granted' | 'denied' | 'unknown'

export type AttributionSourceClass =
  | 'organic_search'
  | 'referral'
  /** RESERVED: an explicit future "direct" signal. Never derived from a missing referrer. */
  | 'direct'
  | 'campaign'
  | 'internal'
  | 'unknown'

export const ATTRIBUTION_SOURCE_CLASSES: readonly AttributionSourceClass[] = [
  'organic_search',
  'referral',
  'direct',
  'campaign',
  'internal',
  'unknown',
]

export type AttributionEventType =
  | 'landing'
  | 'cta_click'
  | 'lead_created'
  | 'order_paid'
  | 'order_refunded'
  | 'order_cancelled'

export type AttributionObservation = 'client_declared' | 'server_observed'

export type AttributionSubjectType = 'order' | 'template_order' | 'inquiry'

/**
 * How much this event actually knows about its acquisition source.
 *
 *  - `attributed`     — a KNOWN acquisition source was observed (`source_class`
 *                       is present and is not `unknown`) on a consented session;
 *  - `session_only`   — an active consented session exists (continuity + consent
 *                       are proven) but the acquisition source remains UNKNOWN;
 *  - `unknown_source` — no traceable session at all; the source stays unknown.
 *
 * `attributed` is the ONLY state that may be reported as a known source. Merely
 * linking an event to a session must never be upgraded into "we know where this
 * came from".
 */
export type AttributionAttributionState = 'attributed' | 'session_only' | 'unknown_source'

export const ATTRIBUTION_STATES: readonly AttributionAttributionState[] = [
  'attributed',
  'session_only',
  'unknown_source',
]

export function isAttributionState(value: unknown): value is AttributionAttributionState {
  return typeof value === 'string' && (ATTRIBUTION_STATES as readonly string[]).includes(value)
}

/** A source class is KNOWN only when a real acquisition signal was observed. */
export function isKnownSourceClass(value: unknown): value is Exclude<AttributionSourceClass, 'unknown'> {
  return (
    typeof value === 'string' &&
    value !== 'unknown' &&
    (ATTRIBUTION_SOURCE_CLASSES as readonly string[]).includes(value)
  )
}

/**
 * The ONE attribution-state derivation, shared by the browser collector and the
 * trusted business-event binder so the two paths cannot drift apart:
 *
 *   no session               -> unknown_source (nothing traces this conversion)
 *   session + unknown source -> session_only   (continuity proven, acquisition NOT)
 *   session + known source   -> attributed     (acquisition actually evidenced)
 *
 * Release blocker this closes: a consented session whose `first_source_class` is
 * `unknown` used to be persisted as `attributed` and counted by
 * `p10_conversion_chain_coverage.attributed_paid_events`, which claimed knowledge
 * the estate never had. A session identity proves continuity/consent only.
 */
export function deriveAttributionState(input: {
  hasSession: boolean
  sourceClass: AttributionSourceClass | null | undefined
}): AttributionAttributionState {
  if (!input.hasSession) return 'unknown_source'
  return isKnownSourceClass(input.sourceClass) ? 'attributed' : 'session_only'
}

/** Events a browser collector is allowed to POST. Business facts are never in this list. */
export const CLIENT_DECLARABLE_EVENT_TYPES: readonly Extract<
  AttributionEventType,
  'landing' | 'cta_click'
>[] = ['landing', 'cta_click']

/** Events only trusted server code may write, and only with a durable subject. */
export const BUSINESS_EVENT_TYPES: readonly Extract<
  AttributionEventType,
  'lead_created' | 'order_paid' | 'order_refunded' | 'order_cancelled'
>[] = ['lead_created', 'order_paid', 'order_refunded', 'order_cancelled']

export function isClientDeclarableEventType(value: unknown): boolean {
  return typeof value === 'string' && (CLIENT_DECLARABLE_EVENT_TYPES as readonly string[]).includes(value)
}

export function isBusinessEventType(value: unknown): value is (typeof BUSINESS_EVENT_TYPES)[number] {
  return typeof value === 'string' && (BUSINESS_EVENT_TYPES as readonly string[]).includes(value)
}

export function isAttributionEventType(value: unknown): value is AttributionEventType {
  return typeof value === 'string' && (
    [...CLIENT_DECLARABLE_EVENT_TYPES, ...BUSINESS_EVENT_TYPES] as readonly string[]
  ).includes(value)
}

/**
 * Strategic clusters the pilot can be measured against. This is a *vocabulary*,
 * not a claim: a conversion whose cluster cannot be established is stored with
 * `cluster = null` and reported as unclassified.
 */
export const P10_CLUSTERS = [
  'us_f1_opt',
  'ca_family',
  'uk_student',
  'au_485',
  'express_entry',
] as const

export type P10Cluster = (typeof P10_CLUSTERS)[number]

export function isP10Cluster(value: unknown): value is P10Cluster {
  return typeof value === 'string' && (P10_CLUSTERS as readonly string[]).includes(value)
}

/**
 * The locked pilot definition.
 *
 * Selected from current repository-documented evidence (see the A0 section of
 * docs/superpowers/seo-execution-ledger.md): the US F-1/OPT route is the only
 * strategic cluster that simultaneously has (a) recorded qualified GSC demand
 * (P7 Duke near-win, page-one F-1 queries), (b) an existing owned-intent
 * surface, (c) real Marketplace supply, and (d) an Intake lane with F-1 and OPT
 * case types that already ends in a durable server-side inquiry row and can be
 * converted into a paid order.
 *
 * The meaningful event is a VERIFIED PAID ORDER observed server-side. A lead is
 * recorded alongside it but is not the locked event, because a lead is interest
 * and only a captured payment is revenue.
 */
export const P10_PILOT = {
  cluster: 'us_f1_opt' as P10Cluster,
  label: 'US F-1 / OPT student route',
  meaningful_event: 'order_paid' as AttributionEventType,
  supporting_event: 'lead_created' as AttributionEventType,
  /** Case-type ids from lib/intake-questions.ts that belong to this cluster. */
  intake_case_types: ['f1', 'opt'] as const,
  /** Product/gig text signals that establish cluster membership (conservative). */
  product_signals: [
    /\bf-?1\b/i,
    /\bi-?20\b/i,
    /\bi-?765\b/i,
    /\bi-?983\b/i,
    /\bstem\s*opt\b/i,
    /\bpre-?completion\s*opt\b/i,
    /\bpost-?completion\s*opt\b/i,
    /\bcpt\b/i,
    /\bopt\b/i,
  ],
} as const

/** Simple label used by read-only surfaces so a report can state what the pilot means. */
export const P10_MEANINGFUL_EVENT_DEFINITION =
  'order_paid: a paid order row persisted by trusted server code after a captured payment, ' +
  'counted as attributed ONLY when a known acquisition source was observed on a consented ' +
  'first-party session; a consented session with an unknown source is session_only, and a ' +
  'conversion with no consented session is stored as unknown_source. Unknown is never inferred.'

/**
 * Cross-domain handoff status — a truthful statement of what is SHIPPED today.
 *
 * The consumer half exists (`mintHandoffToken` / `verifyHandoffToken`,
 * middleware cookie capture, `/api/attribution/session` link) but NO production
 * emitter mints a `yattr` handoff token or appends it to a cross-domain link
 * yet. Read-only surfaces must therefore report the adapter as pending and must
 * never claim cross-domain continuity is complete.
 */
export const P10_CROSS_DOMAIN_HANDOFF = {
  emitter_shipped: false,
  state: 'emitter_adapter_pending',
  detail:
    'No production emitter mints a yattr handoff token yet; capture only carries an ' +
    'externally supplied token, and only when the browser already granted consent.',
} as const
