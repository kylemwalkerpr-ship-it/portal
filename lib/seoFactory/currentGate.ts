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
export function shipGateFromResponse(data: { shipReady?: unknown; blockers?: number; [key: string]: unknown }): ShipGate {
  if (typeof data.shipReady !== 'boolean') return null
  return {
    shipReady: data.shipReady === true && (data.blockers ?? 0) === 0,
    blockers: data.blockers ?? 0,
  }
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
