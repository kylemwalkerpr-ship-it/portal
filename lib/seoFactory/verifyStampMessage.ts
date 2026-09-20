/**
 * lib/seoFactory/verifyStampMessage.ts
 *
 * P6 M2 — admin verify display truth.
 *
 * `POST /api/content-studio/verify-published` can complete the ARTICLE
 * verification (ok=true, stamp status 'verified') while deliberately
 * WITHHOLDING interlink finalization: when the caller supplied an exact
 * `jobId` and the live verdict carries no positive official deployment-lineage
 * proof (`interlinksWithheld: 'deployment_lineage_not_proven'`), the planned
 * interlink rows stay planned on purpose.
 *
 * The admin badge must never show a bare "Verified" in that state — that reads
 * as "interlinks finalized" while the rows are still pending. This
 * dependency-free helper shapes the message for BOTH the API stamp (the
 * server response is truthful by itself) and the admin UI, so a successful
 * verification with withheld interlinks always says so explicitly. The
 * article-level success is kept ("Article verified"); only the interlink
 * state is qualified ("pending deployment lineage"). Nothing here changes any
 * finalization decision — it is display/observability truth only.
 */

/** The withheld reason the verify-published route returns (exact string). */
export const INTERLINKS_WITHHELD_LINEAGE_REASON = 'deployment_lineage_not_proven'

/** The truthful interlink-status suffix for a withheld finalization. */
export const INTERLINKS_PENDING_DEPLOYMENT_LINEAGE =
  'interlinks pending deployment lineage'

/**
 * Display message for a verify-published stamp.
 *
 * · no withheld state → the stamp message unchanged (never rewritten);
 * · withheld state     → the article success is kept and the interlink state
 *   is stated explicitly, e.g.
 *   `Article verified · HTTP 200 · 812w · score 88/100 · interlinks pending
 *   deployment lineage`.
 *
 * Idempotent: a message that already names interlinks is returned as-is.
 */
export function verifyStampMessage(input: {
  stampMessage?: string | null
  interlinksWithheld?: string | null
}): string {
  const base = String(input.stampMessage || '').trim() || 'Verified'
  const withheld = String(input.interlinksWithheld || '').trim()
  if (!withheld) return base
  if (/interlink/i.test(base)) return base
  const withArticle = /^verified\b/i.test(base)
    ? base.replace(/^verified\b/i, 'Article verified')
    : `Article verified · ${base}`
  return `${withArticle} · ${INTERLINKS_PENDING_DEPLOYMENT_LINEAGE}`
}
