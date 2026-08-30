/**
 * Wall-clock budget for the content-studio-retry cron request
 * (job pick → pipeline → requeue). Must stay comfortably under the GitHub
 * workflow's 15-minute `timeout-minutes` so the cron's curl always receives
 * a JSON response (success OR requeue) instead of dangling. The pipeline
 * checks the derived AbortSignal between passes and aborts the in-flight
 * provider fetch, so one slow Run BiOS reasoning draft can no longer hold
 * the cron hostage.
 *
 * Default 12 minutes; override for local runs via
 * CONTENT_STUDIO_RETRY_DEADLINE_MS (accepted window: 60s .. 14min).
 */
export function parseRetryDeadlineMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10)
  if (Number.isFinite(parsed) && parsed >= 60_000 && parsed <= 14 * 60_000) {
    return parsed
  }
  return 12 * 60_000
}
