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