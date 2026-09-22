/**
 * P10 conversion attribution engine — the ONLY writer of the attribution tables.
 *
 * Trust model:
 *  - `recordClientEvent` is the browser-facing path. It accepts exactly
 *    `landing` and `cta_click`, requires an active consented session, and can
 *    never write a business subject or an amount.
 *  - `bindBusinessEvent` is the trusted-server path used by the paid-order and
 *    lead call sites. It is deliberate about failure: telemetry never breaks
 *    money. A missing/expired/revoked identity does NOT drop the business event
 *    — it stores the real event with `attribution_state = 'unknown_source'`,
 *    because "we cannot attribute this" is a truthful result and "pretend it did
 *    not happen" is not.
 *  - Attribution state is derived by ONE pure function (`deriveAttributionState`)
 *    for both paths, so they cannot drift: a session whose source class is
 *    `unknown` is `session_only` (continuity + consent proven, ACQUISITION NOT),
 *    and `attributed` is reserved for an event with a KNOWN source class. A
 *    session identity is never treated as evidence of where the visitor came from.
 *  - Consent is stored as OBSERVED, never inferred. An event bound to an active
 *    consented session (`attributed` or `session_only`) is `consent_state =
 *    'granted'`, because the session row cannot exist without granted consent. An
 *    unattributed business event defaults to `consent_state = 'unknown'` — it is
 *    NEVER upgraded to "granted" just because a real payment happened. A call site that directly
 *    observed the visitor's consent (for example the server-readable consent
 *    cookie) may pass `consentState` together with the `consentEvidence` label
 *    that names HOW it was observed; without that label the value is dropped to
 *    `unknown` rather than guessed.
 *  - There is intentionally NO backfill entry point. A historical order with no
 *    recorded attribution cannot be retroactively attributed by this library;
 *    unknown stays unknown.
 */
import {
  ATTRIBUTION_EVENT_VERSION,
  ATTRIBUTION_SESSION_TTL_SECONDS,
  CLIENT_DECLARABLE_EVENT_TYPES,
  deriveAttributionState,
  isKnownSourceClass,
  isAttributionEventType,
  isBusinessEventType,
  type AnalyticsConsent,
  type AttributionEventType,
  type AttributionSourceClass,
  type AttributionSubjectType,
  type P10Cluster,
} from './contract'
import { sha256Hex, verifyHandoffToken } from './identity'
import { parseConsent, type AttributionSourceSnapshot } from './source'

export type AttributionDb = {
  from: (table: string) => any
}

export type AttributionSessionRow = {
  id: string
  identity_hash: string
  first_source_class: AttributionSourceClass
  first_source_detail: Record<string, unknown> | null
  first_landing_host: string | null
  first_landing_path: string | null
  first_seen_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
}

export type SessionResolution =
  | { status: 'active'; session: AttributionSessionRow }
  | { status: 'expired'; session: AttributionSessionRow }
  | { status: 'revoked'; session: AttributionSessionRow }
  | { status: 'unknown' }
  | { status: 'invalid' }
  | { status: 'unavailable'; detail?: string }

export type RecordEventResult =
  | { status: 'recorded'; id: string; eventKey: string; deduped: boolean }
  | {
      status: 'not_recorded'
      reason:
        | 'consent_required'
        | 'session_inactive'
        | 'invalid_event'
        | 'invalid_subject'
        | 'unavailable'
      detail?: string
    }

export type LinkHandoffResult =
  | { status: 'linked'; childSessionId: string; parentSessionId: string }
  | {
      status: 'not_linked'
      reason: 'no_child_session' | 'same_session' | 'parent_unknown' | 'replay' | 'unavailable'
      detail?: string
    }

const MAX_SUBJECT_ID_LENGTH = 120
const SUBJECT_ID_RE = /^[A-Za-z0-9._:-]+$/
const MAX_CTA_ID_LENGTH = 120
const CTA_ID_RE = /^[A-Za-z0-9._:-]+$/

function sanitizeToken(value: unknown): string | null {
  const token = typeof value === 'string' ? value.trim() : ''
  if (token.length < 16 || token.length > 256) return null
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null
}

export function sanitizeSubjectId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id || id.length > MAX_SUBJECT_ID_LENGTH || !SUBJECT_ID_RE.test(id)) return null
  return id
}

export function sanitizeCtaId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id || id.length > MAX_CTA_ID_LENGTH || !CTA_ID_RE.test(id)) return null
  return id
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Tolerant numeric read of a report cell: a missing column is 0, never NaN. */
function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  // 42P01 = undefined_table, PGRST205 = PostgREST schema cache miss. Both mean
  // "the migration is not applied in this environment": report unavailable
  // rather than pretending a write happened.
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** Message-only description of an unexpected failure. Never a token or a payload. */
function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The module's single non-throwing boundary.
 *
 * Attribution is telemetry. An unavailable, incomplete or erroring database
 * client must surface as the typed `unavailable` result that each function below
 * already declares in its return type — never as a rejected promise. The guard is
 * applied once per PUBLIC entry point (rather than at each call site) so no route
 * or library caller has to remember it: a down database, or a partial PostgREST
 * client with no `insert`/`select` surface, can never fail a checkout, payment,
 * inquiry, cancellation, refund or webhook.
 */
async function guard<T>(label: string, run: () => Promise<T>, fallback: (detail: string) => T): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.error(`[attribution] ${label} failed`, error)
    return fallback(failureDetail(error))
  }
}

/**
 * Insert with deterministic idempotency: a duplicate `event_key` re-reads the
 * existing row instead of writing a second event.
 */
async function insertWithDedupe(
  db: AttributionDb,
  row: Record<string, unknown>,
  eventKey: string,
): Promise<RecordEventResult> {
  const inserted = await db.from('conversion_events').insert(row).select('id').single()
  if (!inserted?.error && inserted?.data?.id) {
    return { status: 'recorded', id: String(inserted.data.id), eventKey, deduped: false }
  }
  if (isMissingTable(inserted?.error)) {
    return { status: 'not_recorded', reason: 'unavailable', detail: 'conversion_events not applied' }
  }
  if (!isUniqueViolation(inserted?.error)) {
    return { status: 'not_recorded', reason: 'unavailable', detail: inserted?.error?.message }
  }
  const existing = await db
    .from('conversion_events')
    .select('id')
    .eq('event_key', eventKey)
    .maybeSingle()
  if (existing?.error || !existing?.data?.id) {
    return { status: 'not_recorded', reason: 'unavailable', detail: existing?.error?.message }
  }
  return { status: 'recorded', id: String(existing.data.id), eventKey, deduped: true }
}

/**
 * Resolve the consented identity behind a browser token. Never rejects: an
 * unusable client reports `unavailable`, which every caller already handles.
 */
export function resolveAttributionSession(
  db: AttributionDb,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<SessionResolution> {
  return guard(
    'resolveAttributionSession',
    () => resolveAttributionSessionInner(db, token, now),
    (detail) => ({ status: 'unavailable', detail }),
  )
}

async function resolveAttributionSessionInner(
  db: AttributionDb,
  token: string | null | undefined,
  now: number,
): Promise<SessionResolution> {
  const clean = sanitizeToken(token)
  if (!clean) return { status: 'invalid' }
  const identityHash = await sha256Hex(clean)
  const { data, error } = await db
    .from('conversion_attribution_sessions')
    .select('id, identity_hash, first_source_class, first_source_detail, first_landing_host, first_landing_path, first_seen_at, last_seen_at, expires_at, revoked_at')
    .eq('identity_hash', identityHash)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return { status: 'unavailable', detail: 'sessions not applied' }
    return { status: 'unavailable', detail: error.message }
  }
  if (!data) return { status: 'unknown' }
  const session = data as AttributionSessionRow
  if (session.revoked_at) return { status: 'revoked', session }
  if (new Date(session.expires_at).getTime() <= now) return { status: 'expired', session }

  // Sliding freshness only: expiry is never extended by a read, so a stolen
  // token cannot be kept alive indefinitely.
  try {
    await db
      .from('conversion_attribution_sessions')
      .update({ last_seen_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() })
      .eq('id', session.id)
  } catch {
    // Freshness bookkeeping is not worth failing a conversion for.
  }
  return { status: 'active', session }
}

/**
 * Issue (or refresh the source of) a consented attribution session.
 *
 * Consent is a precondition: with anything other than `granted` this function
 * performs NO database work and returns no identity, so a denied visitor's
 * acquisition source stays unknown.
 */
export function issueAttributionSession(
  db: AttributionDb,
  input: {
    token: string
    consent: string
    source: AttributionSourceSnapshot
    now?: number
    ttlSeconds?: number
  },
): Promise<{ status: 'issued'; session: AttributionSessionRow } | { status: 'refused'; reason: string }> {
  return guard(
    'issueAttributionSession',
    () => issueAttributionSessionInner(db, input),
    () => ({ status: 'refused', reason: 'unavailable' }),
  )
}

async function issueAttributionSessionInner(
  db: AttributionDb,
  input: {
    token: string
    consent: string
    source: AttributionSourceSnapshot
    now?: number
    ttlSeconds?: number
  },
): Promise<{ status: 'issued'; session: AttributionSessionRow } | { status: 'refused'; reason: string }> {
  if (input.consent !== 'granted') return { status: 'refused', reason: 'consent_required' }
  const token = sanitizeToken(input.token)
  if (!token) return { status: 'refused', reason: 'invalid_token' }

  const now = input.now ?? Date.now()
  const ttl = input.ttlSeconds ?? ATTRIBUTION_SESSION_TTL_SECONDS
  const identityHash = await sha256Hex(token)
  const { data, error } = await db
    .from('conversion_attribution_sessions')
    .insert({
      identity_hash: identityHash,
      consent_state: 'granted',
      first_source_class: input.source.source_class,
      first_source_detail: input.source.source_detail,
      first_landing_host: input.source.landing_host,
      first_landing_path: input.source.landing_path,
      first_seen_at: new Date(now).toISOString(),
      last_seen_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttl * 1000).toISOString(),
    })
    .select('id, identity_hash, first_source_class, first_source_detail, first_landing_host, first_landing_path, first_seen_at, last_seen_at, expires_at, revoked_at')
    .single()

  if (error || !data) {
    if (isUniqueViolation(error)) {
      // Same browser token re-issued (tab race): reuse the existing identity.
      return { status: 'refused', reason: 'already_issued' }
    }
    return { status: 'refused', reason: isMissingTable(error) ? 'unavailable' : error?.message || 'insert_failed' }
  }
  return { status: 'issued', session: data as AttributionSessionRow }
}

/** Consent withdrawal. Existing append-only history is retained, the identity stops being usable. */
export function revokeAttributionSession(
  db: AttributionDb,
  input: { token: string; reason: string; now?: number },
): Promise<{ revoked: boolean; reason?: string }> {
  return guard(
    'revokeAttributionSession',
    () => revokeAttributionSessionInner(db, input),
    (detail) => ({ revoked: false, reason: detail }),
  )
}

async function revokeAttributionSessionInner(
  db: AttributionDb,
  input: { token: string; reason: string; now?: number },
): Promise<{ revoked: boolean; reason?: string }> {
  const clean = sanitizeToken(input.token)
  const reason = String(input.reason ?? '').trim()
  if (!clean || !reason) return { revoked: false, reason: 'invalid_input' }
  const identityHash = await sha256Hex(clean)
  const now = new Date(input.now ?? Date.now()).toISOString()
  const { error } = await db
    .from('conversion_attribution_sessions')
    .update({ revoked_at: now, revocation_reason: reason.slice(0, 200), updated_at: now })
    .eq('identity_hash', identityHash)
  return error ? { revoked: false, reason: error.message } : { revoked: true }
}

/**
 * Browser-declared, non-business event. `landing` is once per session; a CTA
 * click is once per session per CTA per UTC day, which is what makes a
 * double-click/refresh replay harmless without losing genuine repeat intent
 * across days.
 */
export function recordClientEvent(
  db: AttributionDb,
  input: {
    token: string | null | undefined
    eventType: AttributionEventType | string
    ctaId?: string | null
    now?: number
  },
): Promise<RecordEventResult> {
  return guard(
    'recordClientEvent',
    () => recordClientEventInner(db, input),
    (detail) => ({ status: 'not_recorded', reason: 'unavailable', detail }),
  )
}

async function recordClientEventInner(
  db: AttributionDb,
  input: {
    token: string | null | undefined
    eventType: AttributionEventType | string
    ctaId?: string | null
    now?: number
  },
): Promise<RecordEventResult> {
  if (!isAttributionEventType(input.eventType) || !(CLIENT_DECLARABLE_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    return {
      status: 'not_recorded',
      reason: 'invalid_event',
      detail: 'Browser clients may only declare landing or cta_click.',
    }
  }
  const resolution = await resolveAttributionSession(db, input.token, input.now)
  if (resolution.status === 'unavailable') return { status: 'not_recorded', reason: 'unavailable', detail: resolution.detail }
  if (resolution.status === 'invalid' || resolution.status === 'unknown') {
    return { status: 'not_recorded', reason: 'consent_required', detail: 'No consented attribution session.' }
  }
  if (resolution.status === 'revoked' || resolution.status === 'expired') {
    return { status: 'not_recorded', reason: 'session_inactive', detail: resolution.status }
  }

  const session = resolution.session
  const now = input.now ?? Date.now()
  const occurredAt = new Date(now).toISOString()
  // `unknown` is a first-class source answer, so a session classified as unknown
  // stays an unknown-source session and can never be reported as attributed.
  const sourceClass = isKnownSourceClass(session.first_source_class)
    ? session.first_source_class
    : 'unknown'
  const sourceDetail = (session.first_source_detail ?? {}) as Record<string, unknown>
  const attributionState = deriveAttributionState({ hasSession: true, sourceClass })

  let eventKey: string
  let sourceDetailForEvent: Record<string, unknown> = sourceDetail
  if (input.eventType === 'landing') {
    eventKey = `landing:v${ATTRIBUTION_EVENT_VERSION}:${session.id}`
  } else {
    const ctaId = sanitizeCtaId(input.ctaId)
    if (!ctaId) return { status: 'not_recorded', reason: 'invalid_event', detail: 'Invalid cta_id.' }
    eventKey = `cta_click:v${ATTRIBUTION_EVENT_VERSION}:${session.id}:${ctaId}:${utcDay(now)}`
    sourceDetailForEvent = { ...sourceDetail, cta_id: ctaId }
  }

  return insertWithDedupe(
    db,
    {
      event_key: eventKey,
      event_type: input.eventType,
      event_version: ATTRIBUTION_EVENT_VERSION,
      observation: 'client_declared',
      // The session row can only exist for a visitor who granted consent, so the
      // session IS the consent evidence for both `attributed` and `session_only`.
      consent_state: 'granted',
      session_id: session.id,
      attribution_state: attributionState,
      source_class: sourceClass,
      source_detail: sourceDetailForEvent,
      cluster: null,
      product_ref: null,
      subject_type: null,
      subject_id: null,
      amount_cents: null,
      currency: null,
      evidence: { verification: input.eventType === 'landing' ? 'session_issued' : 'browser_declared' },
      occurred_at: occurredAt,
    },
    eventKey,
  )
}

/**
 * Consent truth for a server-observed (business) event.
 *
 *  - An active consented session is itself the evidence: a session row can only
 *    exist for a visitor who granted analytics consent, so a session-bound event
 *    — `attributed` (known source) or `session_only` (source still unknown) — is
 *    `granted`. Consent and acquisition knowledge are independent facts: the
 *    session proves the former and never the latter.
 *  - With no session, only a value the call site EXPLICITLY observed is stored,
 *    and only when the call site also names how it observed it
 *    (`consentEvidence`). Everything else is `unknown`. The absence of an
 *    identity is never evidence of denial, and a real payment is never evidence
 *    of consent.
 *
 * Exported so the truth model is directly testable (and so no future caller has
 * to re-derive it).
 */
export function resolveStoredConsent(input: {
  hasSession: boolean
  consentState?: unknown
  consentEvidence?: unknown
}): { consentState: AnalyticsConsent; consentEvidence: string | null } {
  if (input.hasSession) return { consentState: 'granted', consentEvidence: null }
  const observed = parseConsent(input.consentState)
  const label = typeof input.consentEvidence === 'string' ? input.consentEvidence.trim() : ''
  if (observed === 'unknown' || !label) return { consentState: 'unknown', consentEvidence: null }
  return { consentState: observed, consentEvidence: label.slice(0, 120) }
}

/**
 * Trusted-server business event binder.
 *
 * Never throws and never blocks money. When the attribution identity is
 * missing/expired/revoked the event is still stored exactly once, as
 * `unknown_source`, because an unattributed real order is truthful evidence and
 * an omitted one is not. When an active session exists but its source class is
 * `unknown`, the event is `session_only`: continuity/consent are recorded, the
 * acquisition source stays honestly unknown.
 */
export async function bindBusinessEvent(
  db: AttributionDb,
  input: {
    eventType: AttributionEventType | string
    subjectType: AttributionSubjectType
    subjectId: string
    amountCents?: number | null
    currency?: string | null
    cluster?: P10Cluster | null
    productRef?: string | null
    evidence?: Record<string, unknown>
    occurredAt?: string | number | null
    token?: string | null
    /** Consent the CALL SITE directly observed (never inferred from the order). */
    consentState?: AnalyticsConsent | string | null
    /** Names how `consentState` was observed; required for granted/denied. */
    consentEvidence?: string | null
    lifecycleRef?: string | null
    now?: number
  },
): Promise<RecordEventResult> {
  try {
    if (!isBusinessEventType(input.eventType)) {
      return { status: 'not_recorded', reason: 'invalid_event', detail: 'Not a server-observed business event.' }
    }
    const subjectId = sanitizeSubjectId(input.subjectId)
    if (!subjectId) return { status: 'not_recorded', reason: 'invalid_subject' }

    const amountCents = input.amountCents === null || input.amountCents === undefined
      ? null
      : Math.max(0, Math.floor(Number(input.amountCents)))
    if (amountCents !== null && !Number.isFinite(amountCents)) {
      return { status: 'not_recorded', reason: 'invalid_event', detail: 'Invalid amount.' }
    }
    const currency = input.currency ? String(input.currency).toLowerCase().slice(0, 8) : null
    if (amountCents !== null && !currency) {
      return { status: 'not_recorded', reason: 'invalid_event', detail: 'Amount requires a currency.' }
    }

    const occurredAtMs = input.occurredAt === null || input.occurredAt === undefined
      ? NaN
      : typeof input.occurredAt === 'number'
        ? input.occurredAt
        : new Date(input.occurredAt).getTime()
    // A business event must carry its own observed time. Without it we would have
    // to invent "now", which is how a historical order silently becomes a fresh
    // conversion — exactly the retroactive attribution this foundation refuses.
    if (!Number.isFinite(occurredAtMs)) {
      return { status: 'not_recorded', reason: 'invalid_event', detail: 'occurred_at is required.' }
    }

    const resolution = await resolveAttributionSession(db, input.token ?? null, input.now)
    let sessionId: string | null = null
    let sessionSourceClass: AttributionSourceClass | null = null
    let sourceDetail: Record<string, unknown> = {}
    if (resolution.status === 'active') {
      sessionId = resolution.session.id
      sessionSourceClass = isKnownSourceClass(resolution.session.first_source_class)
        ? resolution.session.first_source_class
        : 'unknown'
      sourceDetail = (resolution.session.first_source_detail ?? {}) as Record<string, unknown>
    }

    // ONE derivation for both the browser path and this trusted path. The stored
    // `source_class` is the same value the state is derived from, so
    // `attributed` provably implies a known source at the storage layer too.
    const attributionState = deriveAttributionState({
      hasSession: Boolean(sessionId),
      sourceClass: sessionSourceClass,
    })
    const storedSourceClass: AttributionSourceClass | null = sessionId ? (sessionSourceClass ?? 'unknown') : null
    if (attributionState === 'attributed' && !isKnownSourceClass(storedSourceClass)) {
      // Structurally unreachable; kept so a future edit cannot silently reintroduce
      // "session present => attributed" without a known source.
      return { status: 'not_recorded', reason: 'invalid_event', detail: 'attributed requires a known source class.' }
    }

    // Consent is recorded as observed, never inferred from the business fact.
    const consent = resolveStoredConsent({
      hasSession: Boolean(sessionId),
      consentState: input.consentState,
      consentEvidence: input.consentEvidence,
    })

    const lifecycle = input.lifecycleRef ? sanitizeSubjectId(input.lifecycleRef) : null
    const eventKey = lifecycle
      ? `${input.eventType}:v${ATTRIBUTION_EVENT_VERSION}:${input.subjectType}:${subjectId}:${lifecycle}`
      : `${input.eventType}:v${ATTRIBUTION_EVENT_VERSION}:${input.subjectType}:${subjectId}`

    // Lifecycle coherence: a refund/cancellation belongs to the same commercial
    // object, so it inherits the cluster/product already observed for that
    // subject instead of being filed as unclassified. This reads our own ledger —
    // it never guesses a cluster that was never evidenced.
    let cluster = input.cluster ?? null
    let productRef = input.productRef ?? null
    if (!cluster || !productRef) {
      try {
        const prior = await db
          .from('conversion_events')
          .select('cluster, product_ref')
          .eq('subject_type', input.subjectType)
          .eq('subject_id', subjectId)
          .order('recorded_at', { ascending: false })
          .limit(1)
        const row = Array.isArray(prior?.data) ? (prior.data[0] as Record<string, unknown> | undefined) : undefined
        if (row) {
          cluster = cluster ?? ((row.cluster as P10Cluster | null) ?? null)
          productRef = productRef ?? ((row.product_ref as string | null) ?? null)
        }
      } catch {
        // Inheritance is a nicety, never a precondition for recording the event.
      }
    }

    const evidence: Record<string, unknown> = {
      verification: 'trusted_server_call_site',
      ...(input.evidence ?? {}),
    }
    if (resolution.status === 'expired' || resolution.status === 'revoked') {
      evidence.attribution_identity_state = resolution.status
    }
    if (consent.consentEvidence) {
      // The migration requires this named evidence for a non-granted-session
      // business event that claims granted/denied consent.
      evidence.consent_evidence = consent.consentEvidence
    }

    // `return await` (not `return`) is load-bearing: `insertWithDedupe` performs
    // awaited PostgREST calls that can reject (unavailable/incomplete DB client,
    // transport failure, malformed builder). Without the await, that rejection
    // escapes this try/catch as an unhandled rejection of `bindBusinessEvent`
    // itself and a paid order/cancellation would fail on telemetry.
    return await insertWithDedupe(
      db,
      {
        event_key: eventKey,
        event_type: input.eventType,
        event_version: ATTRIBUTION_EVENT_VERSION,
        observation: 'server_observed',
        consent_state: consent.consentState,
        session_id: sessionId,
        attribution_state: attributionState,
        source_class: storedSourceClass,
        source_detail: sessionId ? sourceDetail : {},
        cluster,
        product_ref: productRef ? String(productRef).slice(0, 200) : null,
        subject_type: input.subjectType,
        subject_id: subjectId,
        amount_cents: amountCents,
        currency,
        evidence,
        occurred_at: new Date(occurredAtMs).toISOString(),
      },
      eventKey,
    )
  } catch (error) {
    // Telemetry must never fail a payment or a lead. Log and report unavailable.
    console.error('[attribution] bindBusinessEvent failed', error)
    return {
      status: 'not_recorded',
      reason: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Link a child session to the parent session named by a signed handoff token.
 * Sessions are linked, never merged: the child keeps its own first-touch record.
 */
export function linkHandoffSession(
  db: AttributionDb,
  input: { childToken: string | null | undefined; handoffToken: string | null | undefined; secret: string | null; now?: number },
): Promise<LinkHandoffResult> {
  return guard(
    'linkHandoffSession',
    () => linkHandoffSessionInner(db, input),
    (detail) => ({ status: 'not_linked', reason: 'unavailable', detail }),
  )
}

async function linkHandoffSessionInner(
  db: AttributionDb,
  input: { childToken: string | null | undefined; handoffToken: string | null | undefined; secret: string | null; now?: number },
): Promise<LinkHandoffResult> {
  const verification = await verifyHandoffToken(input.secret, input.handoffToken, input.now)
  if (verification.status === 'invalid') {
    return {
      status: 'not_linked',
      reason: verification.reason === 'secret_unavailable' ? 'unavailable' : 'no_child_session',
      detail: verification.reason,
    }
  }
  const child = await resolveAttributionSession(db, input.childToken, input.now)
  if (child.status !== 'active') {
    return { status: 'not_linked', reason: 'no_child_session', detail: child.status }
  }
  if (child.session.id === verification.payload.sessionId) {
    return { status: 'not_linked', reason: 'same_session' }
  }

  const parent = await db
    .from('conversion_attribution_sessions')
    .select('id')
    .eq('id', verification.payload.sessionId)
    .maybeSingle()
  if (parent?.error) return { status: 'not_linked', reason: 'unavailable', detail: parent.error.message }
  if (!parent?.data?.id) return { status: 'not_linked', reason: 'parent_unknown' }

  const insert = await db.from('conversion_attribution_links').insert({
    child_session_id: child.session.id,
    parent_session_id: verification.payload.sessionId,
    handoff_nonce: verification.payload.nonce,
    handoff_host: verification.payload.host ?? null,
    linked_at: new Date(input.now ?? Date.now()).toISOString(),
  })
  if (insert?.error) {
    if (isUniqueViolation(insert.error)) return { status: 'not_linked', reason: 'replay' }
    return { status: 'not_linked', reason: 'unavailable', detail: insert.error.message }
  }
  return { status: 'linked', childSessionId: child.session.id, parentSessionId: verification.payload.sessionId }
}

const SESSION_SAMPLE_LIMIT = 5000

/**
 * Paid-event truth by state. `attributed` counts ONLY known-source events: a
 * session-bound event whose source class is `unknown` is `session_only` and may
 * never inflate the attributed count. `stale_view` reports that the deployed
 * coverage view predates the `session_only` column (i.e. the migration has not
 * been re-applied), so a stale view cannot silently look healthy.
 */
export type ConversionCoveragePaidEventStates = {
  attributed: number
  session_only: number
  unknown_source: number
  stale_view: boolean
}

export type ConversionCoverage = {
  contract_version: number
  cluster_filter: string | null
  clusters: Array<Record<string, unknown>>
  paid_event_states: ConversionCoveragePaidEventStates
  sessions: {
    sampled: number
    by_source_class: Record<string, number>
    revoked: number
    truncated: boolean
  }
  observed_business_events: number
  measurement_state: 'no_observed_business_events' | 'observed_business_events_present' | 'unavailable'
  program_pass_claimed: false
  measured_at: string
  detail?: string
}

/**
 * Read-only proof surface. Reports what has actually been observed and
 * distinguishes "nothing real has happened yet" from a wiring failure.
 * `program_pass_claimed` is a literal `false`: a local test run can never assert
 * P10 PASS — only a real observed business event can.
 */
export function loadConversionCoverage(
  db: AttributionDb,
  input: { cluster?: string | null; now?: number; sessionLimit?: number } = {},
): Promise<ConversionCoverage> {
  return guard(
    'loadConversionCoverage',
    () => loadConversionCoverageInner(db, input),
    (detail) => ({
      contract_version: ATTRIBUTION_EVENT_VERSION,
      cluster_filter: input.cluster ?? null,
      clusters: [],
      paid_event_states: { attributed: 0, session_only: 0, unknown_source: 0, stale_view: false },
      sessions: { sampled: 0, by_source_class: {}, revoked: 0, truncated: false },
      observed_business_events: 0,
      measurement_state: 'unavailable',
      program_pass_claimed: false,
      measured_at: new Date(input.now ?? Date.now()).toISOString(),
      detail,
    }),
  )
}

async function loadConversionCoverageInner(
  db: AttributionDb,
  input: { cluster?: string | null; now?: number; sessionLimit?: number } = {},
): Promise<ConversionCoverage> {
  const measuredAt = new Date(input.now ?? Date.now()).toISOString()
  const base: ConversionCoverage = {
    contract_version: ATTRIBUTION_EVENT_VERSION,
    cluster_filter: input.cluster ?? null,
    clusters: [],
    paid_event_states: { attributed: 0, session_only: 0, unknown_source: 0, stale_view: false },
    sessions: { sampled: 0, by_source_class: {}, revoked: 0, truncated: false },
    observed_business_events: 0,
    measurement_state: 'unavailable',
    program_pass_claimed: false,
    measured_at: measuredAt,
  }

  const coverageRead = await db.from('p10_conversion_chain_coverage').select('*')
  if (coverageRead?.error) {
    return { ...base, detail: coverageRead.error.message }
  }
  const rows = (coverageRead?.data ?? []) as Array<Record<string, unknown>>
  const clusters = input.cluster ? rows.filter((row) => row.cluster === input.cluster) : rows

  // Aggregated paid-event truth. Read defensively: a missing `session_only`
  // column means the deployed view is stale, which is reported rather than
  // silently folded into "attributed".
  const staleView = rows.some((row) => row.session_only_paid_events === undefined)
  const paidEventStates = clusters.reduce<ConversionCoveragePaidEventStates>(
    (totals, row) => ({
      attributed: totals.attributed + numberOrZero(row.attributed_paid_events),
      session_only: totals.session_only + numberOrZero(row.session_only_paid_events),
      unknown_source: totals.unknown_source + numberOrZero(row.unknown_source_paid_events),
      stale_view: totals.stale_view,
    }),
    { attributed: 0, session_only: 0, unknown_source: 0, stale_view: staleView },
  )

  const limit = input.sessionLimit ?? SESSION_SAMPLE_LIMIT
  const sessionRead = await db
    .from('conversion_attribution_sessions')
    .select('id, first_source_class, revoked_at')
    .limit(limit + 1)
  if (sessionRead?.error) {
    return { ...base, clusters, paid_event_states: paidEventStates, detail: sessionRead.error.message }
  }
  const sessions = (sessionRead?.data ?? []) as Array<Record<string, unknown>>
  const truncated = sessions.length > limit
  const counted = truncated ? sessions.slice(0, limit) : sessions
  const bySourceClass: Record<string, number> = {}
  let revoked = 0
  for (const session of counted) {
    const key = String(session.first_source_class ?? 'unknown')
    bySourceClass[key] = (bySourceClass[key] ?? 0) + 1
    if (session.revoked_at) revoked += 1
  }

  const observedBusinessEvents = clusters.reduce((total, row) => {
    const value =
      Number(row.lead_events ?? 0) +
      Number(row.paid_events ?? 0) +
      Number(row.refund_events ?? 0) +
      Number(row.cancelled_events ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)

  return {
    ...base,
    clusters,
    paid_event_states: paidEventStates,
    sessions: { sampled: counted.length, by_source_class: bySourceClass, revoked, truncated },
    observed_business_events: observedBusinessEvents,
    measurement_state: observedBusinessEvents > 0 ? 'observed_business_events_present' : 'no_observed_business_events',
  }
}
