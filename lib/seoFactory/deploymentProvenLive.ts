/**
 * lib/seoFactory/deploymentProvenLive.ts
 *
 * P6 — the single positive deployment-lineage gate shared by every surface
 * that may finalize staged `seo_interlinks` rows:
 *
 *   · the scheduled durable reconciler (`reconcileStagedInterlinks`),
 *   · ship-time background verification (`runBackgroundLiveVerification`),
 *   · admin verification (`POST /api/content-studio/verify-published`).
 *
 * `verifyLiveUrl().ok === true` is NECESSARY BUT NOT SUFFICIENT whenever an
 * exact ship job is known: a `content_jobs` row with no `contract_id` takes
 * the legacy/uncontracted health path and can report ok=true while proving
 * nothing about the official production deployment of that exact job. Only a
 * live verdict that positively proves the deployment lineage
 * (`lineageVerified === true` AND `publicationPhase === 'live_verified'`) may
 * create applied truth.
 *
 * Deliberately dependency-free and structural (no runtime import of
 * `liveVerify` or `interlinkReconciliation`) so all three callers share one
 * implementation without a static import cycle.
 */

export interface DeploymentProvenLiveSignal {
  ok?: boolean | null
  lineageVerified?: boolean | null
  publicationPhase?: string | null
}

/**
 * True only for a live verdict that POSITIVELY proves the official deployment
 * lineage. `ok` alone, a missing lineage flag, or any phase other than the
 * exact `live_verified` phase is not proof.
 */
export function isDeploymentProvenLiveResult(
  result: DeploymentProvenLiveSignal | null | undefined,
): boolean {
  return (
    result?.ok === true &&
    result.lineageVerified === true &&
    result.publicationPhase === 'live_verified'
  )
}
