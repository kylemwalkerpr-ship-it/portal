/**
 * lib/seoFactory/sourceJobIdentity.ts
 *
 * Single authority for the EXACT source job identity stored in
 * `seo_interlinks.source_job_id` (which references `content_jobs.id`).
 *
 * A slug, a truncated value, a synthetic `plan-*` id or any other string is
 * NOT job identity: it must never be written as `source_job_id`, and it must
 * never be used as a verification subject (the scheduled reconciler proves the
 * official deployment lineage for the exact job only). Keeping the predicate
 * in one tiny dependency-free module stops the staging writer and the
 * reconciler from drifting apart.
 */
export function normalizeSourceJobId(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null
}
