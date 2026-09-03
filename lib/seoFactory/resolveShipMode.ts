/**
 * Shared ship-mode resolution + quality withhold closer (Slice A1).
 *
 * Both pipeline entry points (JSON + streaming) previously carried private
 * copies of `resolveShipMode` and the quality-withhold block, which drifted
 * (JSON PR-fallback floor 30 vs stream's 40) and whose final error branch
 * overwrote specific ship-time errors (Content-topic mismatch / path mismatch
 * / Ship refused) with a generic "Ship withheld · audit …" string. This
 * module is the single home for that logic so the two pipelines cannot diverge
 * again.
 */

import type { ShipMode } from './ship'
import type { OwnerPlan } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy, meetsDepthFloor, meetsShipQuality } from './audit'

export type RequestedShipMode = ShipMode | 'none' | 'auto' | 'merge'

export function resolveShipMode(
  requested: RequestedShipMode,
  audit: SeoFactoryAudit,
  plan: OwnerPlan,
): ShipMode | 'none' {
  if (requested === 'none') return 'none'
  if (requested === 'pr') return 'pr'
  if (requested === 'merge') {
    // Prefer PR→merge to main (audit trail); fall back handled in shipContent
    return plan.blockers.length === 0 ? 'merge' : 'pr'
  }
  if (requested === 'autodeploy') {
    return canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0 ? 'autodeploy' : 'merge'
  }
  // auto: high-quality non-blocked → merge to main; else PR for review
  if (canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0) return 'merge'
  return 'pr'
}

export interface ShipWithholdInput {
  /** Effective requested mode (after dry-run normalisation) — the mode the
   *  operator asked for, used to decide whether a below-score safe-ship is
   *  allowed on non-PR requests. */
  requested: RequestedShipMode
  /** Mode produced by resolveShipMode — the pre-gate ship intent. */
  shipMode: ShipMode | 'none'
  audit: SeoFactoryAudit
  plan: OwnerPlan
  minAudit: number
  skipShipIfBelowScore?: boolean
}

export interface ShipWithholdResult {
  shipMode: ShipMode | 'none'
  gateHold: string | null
}

/**
 * Quality/score withhold closer.
 *
 * Rules (unified for JSON + stream):
 * - Requested `pr` is the human review path — never quality-withheld
 *   (first-gate skip when requested===pr / resolved shipMode===pr).
 * - A quality-failing draft must never go to main. When the PR-fallback floor
 *   is met (score ≥ 40 AND depth floor AND no ownership blockers) it opens a
 *   review PR instead of silently holding the daily job; otherwise it holds.
 * - A quality-passing but below-minAudit draft on an explicit main request is
 *   safe-shipped as a PR down to score ≥ 50, hard-held below that.
 */
export function applyShipWithhold(input: ShipWithholdInput): ShipWithholdResult {
  const { requested, audit, plan, minAudit, skipShipIfBelowScore } = input
  let shipMode = input.shipMode
  let gateHold: string | null = null

  // ── Gate 1: never ship thin or low-quality voice to main ─────────────
  // PR intent is never held here. For everything else, fall back to a review
  // PR when the floor is met instead of silently holding the daily job.
  // Unified PR-fallback floor: score >= 40 AND meetsDepthFloor AND no
  // ownership blockers when !meetsShipQuality (stream's 40 — JSON's 30 deleted).
  if (!meetsShipQuality(audit) && shipMode !== 'none' && shipMode !== 'pr' && requested !== 'pr') {
    if (meetsDepthFloor(audit) && audit.score >= 40 && plan.blockers.length === 0) {
      shipMode = 'pr'
    } else {
      gateHold = formatGateHold(audit, minAudit, 'quality/depth blockers')
      shipMode = 'none'
    }
  }

  // ── Gate 2: below-score safe-ship / hard-hold ─────────────────────────
  if (
    skipShipIfBelowScore !== false &&
    shipMode !== 'none' &&
    (audit.score < minAudit || !meetsShipQuality(audit)) &&
    requested !== 'pr'
  ) {
    if (!meetsShipQuality(audit)) {
      // Depth OK + no ownership blockers → open PR for review instead of
      // silent hold. Same unified floor as gate 1 (re-checked here because
      // gate 1 skips pre-resolved 'pr' modes, e.g. merge-with-ownership-block).
      if (meetsDepthFloor(audit) && audit.score >= 40 && plan.blockers.length === 0) {
        shipMode = 'pr'
        gateHold = null
      } else {
        gateHold = formatGateHold(audit, minAudit, 'quality/depth blockers')
        shipMode = 'none'
      }
    } else if (
      requested === 'auto' ||
      requested === 'autodeploy' ||
      requested === 'merge'
    ) {
      if (audit.score >= 50) {
        // Below minAudit but shipable → PR (human/CI path) instead of silent hold
        shipMode = 'pr'
      } else {
        gateHold = formatGateHold(audit, minAudit, `audit ${audit.score} < 50`)
        shipMode = 'none'
      }
    }
  }

  return { shipMode, gateHold }
}

export interface ShipErrorFinalizeInput {
  shipMode: ShipMode | 'none'
  shipError: string | null
  gateHold: string | null
  audit: SeoFactoryAudit
}

/**
 * Final gate on the ship error string — THE point where specific ship-time
 * errors used to get clobbered by the generic withhold message.
 *
 * - A shipError that is already set (Content-topic mismatch / path mismatch /
 *   Ship refused) is ground truth and is ALWAYS preserved, whatever the mode.
 * - The generic "Ship withheld · audit …" string is only filled when nothing
 *   specific went wrong AND the ship actually parked (shipMode === 'none').
 */
export function finalizeShipError(input: ShipErrorFinalizeInput): string | null {
  if (input.shipError) return input.shipError
  if (input.shipMode === 'none') {
    return (
      input.gateHold ??
      `Ship withheld · audit ${input.audit.score} · words ${input.audit.wordCount}`
    )
  }
  return input.shipError
}

/** Human-readable reason for War Room / Auto-Pilot when merge is withheld. */
function formatGateHold(audit: SeoFactoryAudit, minAudit: number, why: string): string {
  const blockers = (audit.blockers || [])
    .slice(0, 4)
    .map((b) => b.message)
    .join('; ')
  const parts = [
    `Ship withheld (${why})`,
    `audit ${audit.score}/100 (min ${minAudit}) grade ${audit.grade}`,
    `words ${audit.wordCount}`,
    audit.humanScore != null ? `human ${audit.humanScore}` : null,
    blockers ? `blockers: ${blockers}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}