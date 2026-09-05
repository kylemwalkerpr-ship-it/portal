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

import { shipGateFromResponse, shipGateReady } from './currentGate'

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
  const a = audit as { shipReady?: unknown; blockers?: unknown }
  if (typeof a.shipReady !== 'boolean') return false
  const gate = shipGateFromResponse({ shipReady: a.shipReady, blockers: blockersCount(a.blockers) })
  return shipGateReady(gate)
}

/** Gate / loop fields bare `auditContent()` never emits. */
export const AUDIT_GATE_PRESERVE_KEYS = ['shipReady', 'contentSpec', 'contentLoop'] as const

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
    out.blockers = a.blockers.slice(0, 12)
    if (out.blockersCount === undefined) out.blockersCount = a.blockers.length
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

