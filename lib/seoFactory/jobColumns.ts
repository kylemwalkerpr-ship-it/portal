/**
 * content_jobs SELECT lists. Queue + job-detail must never pull event_log,
 * lineage, audit_json, or gsc_json — those blobs freeze the Worker and the
 * studio modal on failed drafts.
 */
export const JOB_HEAVY_COLUMN_RE = /(?:^|,)(?:event_log|lineage|audit_json|gsc_json)(?:$|,)/

export const JOB_LIST_COLUMNS = [
  'id',
  'user_id',
  'source_job_id',
  'regeneration_reason',
  'regeneration_mode',
  'title',
  'topic',
  'content_type',
  'tone',
  'region',
  'status',
  'error_message',
  'target_repo',
  'branch_name',
  'content_path',
  'pr_url',
  'pr_number',
  'ai_provider',
  'word_count',
  'seo_score',
  'primary_keyword',
  'competing_urls',
  'owner_host',
  'canonical_url',
  'ship_mode',
  'indexable',
  'deploy_sha',
  'deployed_at',
  'merged_at',
  'closed_at',
  'created_at',
  'updated_at',
  'master_engine_score',
  'master_engine_grade',
  'master_engine_fetched_at',
].join(',')

export const JOB_OPEN_COLUMNS = [JOB_LIST_COLUMNS, 'content'].join(',')

/** PATCH mutate/return — content + audit, never event_log / lineage / gsc_json. */
export const JOB_MUTATE_COLUMNS = [JOB_OPEN_COLUMNS, 'audit_json'].join(',')

export const JOB_BODY_COLUMNS = 'id,content,word_count,error_message,status,updated_at'

/** Jobs that already failed and need regen must not auto-fetch the stored body.
 *  That fetch (and the editor mount that follows) is what freezes the modal. */
export function jobDetailShouldAutoLoadBody(job: {
  status?: string | null
  error_message?: string | null
  content?: string | null
  word_count?: number | null
}): boolean {
  const failed = Boolean(job.error_message) && ['drafting', 'failed', 'pending'].includes(String(job.status || ''))
  if (failed) return false
  return Boolean(job.content) || Number(job.word_count) > 0
}

export function slimJobForClient<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete (next as Record<string, unknown>).event_log
  delete (next as Record<string, unknown>).lineage
  delete (next as Record<string, unknown>).gsc_json
  return next
}

export const JOB_LINEAGE_COLUMNS = [
  'id',
  'source_job_id',
  'title',
  'topic',
  'status',
  'created_at',
  'regeneration_mode',
  'regeneration_reason',
].join(',')
