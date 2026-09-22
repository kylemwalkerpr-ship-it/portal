/**
 * Canonical current-gate state used by the studio job modal + inline editor.
 *
 * The 2026-08 live defect: `admin-content-studio.tsx` declared a ship refusal
 * "stale" whenever `audit.score === 100`, while the Approve button was driven
 * by the child editor's `shipReady`. Score is NOT ship readiness — a draft can
 * score 100/100 and still carry a structural/link blocker (e.g.
 * `unlinked_related_guide`), so the green "passes" banner lied while Approve
 * stayed disabled. All three surfaces (banner, blocker panel, action buttons)
 * now derive from ONE snapshot: the latest audit response's own
 * `shipReady === true` AND `blockers === 0`. UNKNOWN (no audit of the current
 * content version) never claims a pass.
 *
 * This module is deliberately dependency-free (no `ownership`/`seoDataLoaders`)
 * so client components can import it without dragging server-only modules
 * (`node:path` etc.) into the browser bundle.
 */

/** Canonical ship-gate snapshot reported from an audit/fix response.
 *  `null` = UNKNOWN: the current content version has not been audited (or was
 *  edited after the last audit) — the UI must not claim a pass in this state. */
export type ShipGateSnapshot = {
  shipReady: boolean
  blockers: number
}

export type ShipGate = ShipGateSnapshot | null

/** Small deterministic content identity used to ensure a persisted review gate
 * is only restored for the exact body it audited. This is not a security hash. */
export function contentFingerprint(content: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${content.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * `content_jobs.audit_json` key that records WHICH body the persisted
 * `shipReady` / `editorialReview` verdict was evaluated against. Without it a
 * carried verdict is only tied to the row it lives on, so a later body write
 * could ship different bytes under an old verdict (P8 stale-gate defect).
 */
export const AUDIT_GATE_BODY_FINGERPRINT_KEY = 'contentFingerprint'

/** Stable refusal code for "the carried gate verdict does not cover this body". */
export const STALE_GATE_VERDICT_CODE = 'ship_gate_stale_body'

/** Exact-body normalization of the publication hash contract
 *  (`artifactContentHash` / `contentHash`): CRLF → LF, trimmed. A re-save that
 *  only changes line endings or surrounding whitespace is the same body. */
function exactBodyText(content: unknown): string {
  return String(content ?? '').replace(/\r\n/g, '\n').trim()
}

/**
 * Fingerprint the ship gate verdict is bound to. Reuses the canonical review
 * layer fingerprint (`contentFingerprint`, the same helper editorial supervision,
 * review snapshots and the studio gate snapshot use) over the exact-body
 * normalization above — deliberately NOT a second hash system.
 */
export function gateVerdictBodyFingerprint(content: unknown): string {
  return contentFingerprint(exactBodyText(content))
}

/**
 * The fingerprint persisted WITH the current verdict, if the row carries one.
 * Legacy rows predate the stamp → `null`, and callers fall back to the existing
 * contract: the verdict belongs to the row's stored body.
 */
export function persistedGateVerdictFingerprint(auditJson: unknown): string | null {
  if (!auditJson || typeof auditJson !== 'object' || Array.isArray(auditJson)) return null
  const value = (auditJson as Record<string, unknown>)[AUDIT_GATE_BODY_FINGERPRINT_KEY]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/** Refusal text for a stale verdict: the operator must re-audit this body. */
export const STALE_GATE_VERDICT_MESSAGE =
  'Ship gate not cleared: the recorded shipReady/editorial verdict was evaluated against a different body. ' +
  'Save this exact draft and re-audit it (Audit & Fix) before publishing.'

export function shipGateFromPersistedReview(
  review: { contentFingerprint?: unknown; shipReady?: unknown; blockers?: unknown } | null | undefined,
  currentContent: string,
): ShipGate {
  if (!review || review.contentFingerprint !== contentFingerprint(currentContent)) return null
  return shipGateFromResponse({
    shipReady: review.shipReady,
    blockers: typeof review.blockers === 'number' ? review.blockers : undefined,
  })
}

/** Build the canonical snapshot from a raw re-audit/fix response.
 *  `shipReady` is ONLY true when the response said `shipReady === true`
 *  AND `blockers === 0` — the human score alone never implies readiness.
 *  Unknown responses (no boolean shipReady) yield `null`. */
/** Normalize blockers whether the audit returned a count, findings array, or omitted. */
export function normalizeShipBlockers(blockers: unknown): number {
  if (Array.isArray(blockers)) return blockers.length
  if (typeof blockers === 'number' && Number.isFinite(blockers)) return blockers
  return 0
}

export function shipGateFromResponse(data: { shipReady?: unknown; blockers?: unknown; [key: string]: unknown }): ShipGate {
  if (typeof data.shipReady !== 'boolean') return null
  const blockers = normalizeShipBlockers(data.blockers)
  return {
    shipReady: data.shipReady === true && blockers === 0,
    blockers,
  }
}

/** Build a ship-gate snapshot from persisted job.audit_json (slim or full).
 *  Same contract as the studio UI helper — UNKNOWN when shipReady is absent. */
export function shipGateFromAuditJson(aj: unknown): ShipGate {
  if (!aj || typeof aj !== 'object' || Array.isArray(aj)) return null
  const a = aj as { shipReady?: unknown; blockers?: unknown; blockersCount?: unknown }
  if (typeof a.shipReady !== 'boolean') return null
  const blockers =
    a.blockers !== undefined && a.blockers !== null
      ? normalizeShipBlockers(a.blockers)
      : typeof a.blockersCount === 'number' && Number.isFinite(a.blockersCount)
        ? a.blockersCount
        : 0
  return shipGateFromResponse({ shipReady: a.shipReady, blockers })
}

/** Is the current-gate state shippable (passes + zero blockers)? */
export function shipGateReady(gate: ShipGate): boolean {
  return gate !== null && gate.shipReady === true && gate.blockers === 0
}

/** Resolve what the ship-refusal banner must claim for a job with a ship
 *  refusal on record, from the canonical gate snapshot alone:
 *   - cleared  → refusal stale, draft passes → green banner + Approve enabled
 *   - active   → refusal stands, blockers remain → red banner + Approve disabled
 *   - unknown  → no audit of the CURRENT content version → amber "audit first"
 *   - none     → no ship refusal on record (fall through to raw error display)
 */
export function resolveShipRefusalBanner(info: {
  refused: boolean
  gate: ShipGate
}): 'cleared' | 'active' | 'unknown' | 'none' {
  if (!info.refused) return 'none'
  if (shipGateReady(info.gate)) return 'cleared'
  if (info.gate !== null) return 'active'
  return 'unknown'
}

/** Approve / Ship-PR action enablement — derived from the SAME snapshot. */
export function shipActionsEnabled(gate: ShipGate): boolean {
  return shipGateReady(gate)
}
