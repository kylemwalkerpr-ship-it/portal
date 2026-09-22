import { editorialReportReady } from './editorialGate'
/**
 * Server-side ship-gate enforcement for a persisted content_jobs row.
 *
 * The studio modal only enables Approve / Ship-PR when the CURRENT content
 * version has an audit snapshot that explicitly reports `shipReady === true`
 * AND zero blockers (see `currentGate.ts` — score never implies readiness).
 * The server must refuse to merge a PR / bulk-approve a draft that has no
 * such snapshot on record, otherwise any caller can bypass the editor gate by
 * hitting the API directly.
 *
 * This mirrors the client's `shipGateFromAuditPayload` (components/design/
 * studio-ui-shared.tsx) but stays dependency-free (no React) so server routes
 * and tests can import it without dragging UI code into the Worker bundle.
 */

import {
  AUDIT_GATE_BODY_FINGERPRINT_KEY,
  STALE_GATE_VERDICT_CODE,
  STALE_GATE_VERDICT_MESSAGE,
  contentFingerprint,
  gateVerdictBodyFingerprint,
  persistedGateVerdictFingerprint,
  shipGateFromResponse,
  shipGateReady,
} from './currentGate'
import { slimBlockersForClient } from './shipBlockers'

/** Normalize `audit_json.blockers` (array of findings, count, or missing) to a count. */
function blockersCount(blockers: unknown): number {
  if (Array.isArray(blockers)) return blockers.length
  if (typeof blockers === 'number' && Number.isFinite(blockers)) return blockers
  return 0
}

/**
 * True only when the job's persisted `audit_json` records an explicit gate pass
 * (boolean `shipReady === true` AND `blockers === 0`). UNKNOWN — no audit of
 * the current content version, or a 100/100 score without `shipReady` — is a
 * FAIL so the server never ships content the editor gate never cleared.
 */
export function jobPassesShipGate(job: unknown): boolean {
  if (!job || typeof job !== 'object') return false
  const audit = (job as { audit_json?: unknown }).audit_json
  if (!audit || typeof audit !== 'object') return false
  const a = audit as { shipReady?: unknown; blockers?: unknown; editorialReview?: unknown }
  if (a.editorialReview && !editorialReportReady(a.editorialReview, (job as { content?: string }).content)) return false
  if (typeof a.shipReady !== 'boolean') return false
  const gate = shipGateFromResponse({ shipReady: a.shipReady, blockers: blockersCount(a.blockers) })
  return shipGateReady(gate)
}

/** Gate / loop fields bare `auditContent()` never emits. */
export const AUDIT_GATE_PRESERVE_KEYS = ['shipReady', 'contentSpec', 'contentLoop', 'editorialReview'] as const

/**
 * `audit_json` keys that describe ONE exact body and may never be carried onto
 * different bytes: the ship verdict itself, the Harper editorial verdict for
 * that body, and the fingerprint recording which body they evaluated.
 */
export const AUDIT_GATE_BODY_KEYS = [
  'shipReady',
  'editorialReview',
  AUDIT_GATE_BODY_FINGERPRINT_KEY,
] as const

export type GateVerdictBodyBinding = {
  /** True only when the carried verdict is proven to belong to this exact body. */
  ok: boolean
  bodyFingerprint: string
  /** Fingerprint persisted with the verdict (`null` on pre-stamp legacy rows). */
  verdictFingerprint: string | null
  /** Fingerprint of the body stored on the row (`null` when no body is stored). */
  storedBodyFingerprint: string | null
  reason: 'persisted_fingerprint' | 'unchanged_stored_body' | null
  code: string | null
  error: string | null
}

/**
 * Bind a carried ship verdict to the exact body that would be stored/shipped.
 *
 * A verdict is BOUND only when either
 *   1. the row records the fingerprint of the body the verdict evaluated and it
 *      equals this body's fingerprint (the durable binding), or
 *   2. the row predates that stamp and this body IS the row's stored body
 *      (the pre-existing contract — an unchanged exact body reuses its verdict).
 *
 * Anything else — changed bytes, a stamp for another body, a row with no stored
 * body to fall back to, or a carried `editorialReview` that does not cover this
 * body — is NOT bound and must fail closed with a re-audit refusal.
 */
export function gateVerdictBoundToBody(
  job: { content?: unknown; audit_json?: unknown } | null | undefined,
  content: unknown,
): GateVerdictBodyBinding {
  const bodyFingerprint = gateVerdictBodyFingerprint(content)
  const auditJson = job && typeof job === 'object' ? job.audit_json : null
  const verdictFingerprint = persistedGateVerdictFingerprint(auditJson)
  const storedBodyFingerprint =
    job && typeof job === 'object' && typeof job.content === 'string'
      ? gateVerdictBodyFingerprint(job.content)
      : null

  const bound = (reason: GateVerdictBodyBinding['reason']): GateVerdictBodyBinding => ({
    ok: true,
    bodyFingerprint,
    verdictFingerprint,
    storedBodyFingerprint,
    reason,
    code: null,
    error: null,
  })
  const stale = (): GateVerdictBodyBinding => ({
    ok: false,
    bodyFingerprint,
    verdictFingerprint,
    storedBodyFingerprint,
    reason: null,
    code: STALE_GATE_VERDICT_CODE,
    error: STALE_GATE_VERDICT_MESSAGE,
  })

  // A carried editorial verdict is part of the same gate decision: if Harper
  // cleared a different body, no shipReady value may authorize this one. The
  // fingerprint must match these bytes, under the raw bytes the review layer
  // fingerprints or under the exact-body normalization (whitespace-only re-save).
  const editorial = auditJson && typeof auditJson === 'object' && !Array.isArray(auditJson)
    ? (auditJson as { editorialReview?: unknown }).editorialReview
    : null
  if (editorial) {
    const reviewFingerprint = (editorial as { fingerprint?: unknown }).fingerprint
    const coversBody =
      typeof reviewFingerprint === 'string'
      && (reviewFingerprint === contentFingerprint(String(content ?? ''))
        || reviewFingerprint === bodyFingerprint)
    if (!coversBody) return stale()
  }

  if (verdictFingerprint) {
    return verdictFingerprint === bodyFingerprint ? bound('persisted_fingerprint') : stale()
  }
  if (storedBodyFingerprint && storedBodyFingerprint === bodyFingerprint) {
    return bound('unchanged_stored_body')
  }
  return stale()
}

/**
 * Merge a fresh audit overlay onto prior `audit_json` WITHOUT carrying a ship
 * verdict onto bytes it never evaluated (`body.previousContent` is the body the
 * carried verdict belongs to). When the body changes — or the row carries a
 * verdict stamp for another body — `shipReady`, `editorialReview` and the
 * verdict fingerprint are dropped, so the row cannot authorize a later ship of
 * the new body until it is re-audited. Overlay keys the caller sets explicitly
 * (a fresh verdict for the incoming body) are never dropped.
 */
export function mergeAuditJsonBoundToBody(
  prior: unknown,
  overlay: Record<string, unknown>,
  body: { previousContent: unknown; content: unknown },
): Record<string, unknown> {
  const merged = mergeAuditJsonPreservingGate(prior, overlay)
  const nextFingerprint = gateVerdictBodyFingerprint(body.content)
  const stampedFingerprint = persistedGateVerdictFingerprint(prior)
  const evaluatedFingerprint = stampedFingerprint
    ?? (body.previousContent == null ? null : gateVerdictBodyFingerprint(body.previousContent))
  if (evaluatedFingerprint === nextFingerprint) return merged
  for (const key of AUDIT_GATE_BODY_KEYS) {
    const overlaySetsIt = key in overlay && overlay[key] !== undefined
    if (!overlaySetsIt) delete merged[key]
  }
  return merged
}

/**
 * Merge a fresh audit overlay onto prior `audit_json` without wiping gate
 * fields that `auditContent()` never emits (`shipReady`, `contentSpec`,
 * `contentLoop`). Overlay wins for every key it actually sets; omitted gate
 * keys are re-copied from `prior` so Save / reaudit cannot destroy a cleared
 * Audit & Fix verdict (P0-SHIP-2).
 */
export function mergeAuditJsonPreservingGate(
  prior: unknown,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    prior && typeof prior === 'object' && !Array.isArray(prior)
      ? { ...(prior as Record<string, unknown>) }
      : {}
  const next: Record<string, unknown> = { ...base, ...overlay }
  for (const key of AUDIT_GATE_PRESERVE_KEYS) {
    if (!(key in overlay) || overlay[key] === undefined) {
      if (key in base) next[key] = base[key]
    }
  }
  return next
}

/**
 * Strip heavy audit_json blobs (full contentLoop rounds, outline specs, long
 * finding lists) down to the gate fields the studio client needs for Approve
 * enablement. GET ?id= / list must never ship the raw audit blob — it freezes
 * the Worker — but without shipReady the modal cannot enable Approve→main
 * after Audit & Fix (P0-SHIP-3).
 */
export function slimAuditJsonForClient(prior: unknown): Record<string, unknown> | null {
  if (!prior || typeof prior !== 'object' || Array.isArray(prior)) return null
  const a = prior as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (a.editorialReview) out.editorialReview = a.editorialReview
  if (typeof a.shipReady === 'boolean') out.shipReady = a.shipReady
  if (typeof a.score === 'number') out.score = a.score
  if (typeof a.humanScore === 'number') out.humanScore = a.humanScore
  if (typeof a.ok === 'boolean') out.ok = a.ok
  if (typeof a.model === 'string') out.model = a.model
  if (typeof a.reauditedAt === 'string') out.reauditedAt = a.reauditedAt
  if (typeof a.blockersCount === 'number' && Number.isFinite(a.blockersCount)) {
    out.blockersCount = a.blockersCount
  }
  if (Array.isArray(a.blockers)) {
    out.blockers = slimBlockersForClient(a.blockers)
    if (out.blockersCount === undefined) out.blockersCount = Array.isArray(out.blockers) ? out.blockers.length : a.blockers.length
  } else if (typeof a.blockers === 'number' && Number.isFinite(a.blockers)) {
    out.blockers = a.blockers
    if (out.blockersCount === undefined) out.blockersCount = a.blockers
  } else if (typeof out.blockersCount === 'number') {
    // List projection often has count only — normalize so shipGateFromAuditPayload works.
    out.blockers = out.blockersCount
  }
  if (a.contentLoop && typeof a.contentLoop === 'object' && !Array.isArray(a.contentLoop)) {
    const cl = a.contentLoop as Record<string, unknown>
    out.contentLoop = {
      action: cl.action,
      status: cl.status,
      stopReason: cl.stopReason,
      generatedAt: cl.generatedAt,
    }
  }
  if (a.contentSpec && typeof a.contentSpec === 'object' && !Array.isArray(a.contentSpec)) {
    const cs = a.contentSpec as Record<string, unknown>
    out.contentSpec = { version: cs.version }
  }
  return Object.keys(out).length ? out : null
}

/** Attach a slimmed audit_json onto a job row for client responses. */
export function withSlimAuditJson<T extends Record<string, unknown>>(row: T): T {
  const slim = slimAuditJsonForClient(row.audit_json)
  if (!slim) {
    if ('audit_json' in row) {
      const next = { ...row }
      delete (next as Record<string, unknown>).audit_json
      return next
    }
    return row
  }
  return { ...row, audit_json: slim }
}

