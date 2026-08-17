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

export const JOB_BODY_COLUMNS = 'id,content,word_count,error_message,status,updated_at'

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
