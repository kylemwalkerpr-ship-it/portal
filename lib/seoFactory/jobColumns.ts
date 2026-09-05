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
  'required_short_keywords',
  'required_long_tail_keywords',
  // Per-term provenance (demand vs synthesized backfill). Without these the
  // approve path re-reads the terms as pure demand and the quality gate
  // resurrects blockers for filler it invented itself.
  'short_keyword_terms',
  'long_tail_keyword_terms',
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

/** Single-job open: content + audit_json (slimmed before response — see withSlimAuditJson). */
export const JOB_OPEN_WITH_AUDIT_COLUMNS = [JOB_OPEN_COLUMNS, 'audit_json'].join(',')

/** PATCH mutate/return — content + audit, never event_log / lineage / gsc_json. */
export const JOB_MUTATE_COLUMNS = [JOB_OPEN_COLUMNS, 'audit_json'].join(',')

/**
 * Lightweight list projection of the ship gate — PostgREST JSON-path aliases so
 * the queue never downloads full audit_json blobs (contentLoop rounds / specs).
 */
export const JOB_LIST_GATE_PROJECTION = [
  'audit_ship_ready:audit_json->shipReady',
  'audit_blockers_count:audit_json->blockersCount',
  'audit_score:audit_json->score',
].join(',')

export const JOB_LIST_WITH_GATE_COLUMNS = [JOB_LIST_COLUMNS, JOB_LIST_GATE_PROJECTION].join(',')

export const JOB_BODY_COLUMNS = 'id,content,word_count,error_message,status,updated_at'

/** Jobs that already failed and need regen must not auto-fetch the stored body.
 *  That fetch (and the editor mount that follows) is what freezes the modal. */
export function jobDetailShouldAutoLoadBody(job: {
  status?: string | null
  error_message?: string | null
  content?: string | null
  word_count?: number | null
}): boolean {
  // Always load a stored body in review — skipping failed jobs rewound the
  // editor to the first generation after a gate-clearing repair.
  return Boolean(job.content) || Number(job.word_count) > 0
}

export function slimJobForClient<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete (next as Record<string, unknown>).event_log
  delete (next as Record<string, unknown>).lineage
  delete (next as Record<string, unknown>).gsc_json
  // Lazy import avoided — callers that need audit slim use withSlimAuditJson /
  // projectListJobGate. Keeping this function sync + dependency-light.
  return next
}

/** Map list JSON-path gate aliases onto a tiny audit_json for the client. */
export function projectListJobGate<T extends Record<string, unknown>>(row: T): T {
  const shipReady = row.audit_ship_ready
  const blockersCount = row.audit_blockers_count
  const score = row.audit_score
  const next: Record<string, unknown> = { ...row }
  delete next.audit_ship_ready
  delete next.audit_blockers_count
  delete next.audit_score
  const hasGate =
    typeof shipReady === 'boolean' ||
    (typeof blockersCount === 'number' && Number.isFinite(blockersCount)) ||
    (typeof score === 'number' && Number.isFinite(score))
  if (!hasGate) return next as T
  const audit: Record<string, unknown> = {}
  if (typeof shipReady === 'boolean') audit.shipReady = shipReady
  if (typeof score === 'number' && Number.isFinite(score)) audit.score = score
  if (typeof blockersCount === 'number' && Number.isFinite(blockersCount)) {
    audit.blockersCount = blockersCount
    audit.blockers = blockersCount
  }
  next.audit_json = audit
  return next as T
}

/** Brief keyword floors persisted on the job — empty when a legacy row never stored them. */
export function jobRequiredKeywords(job: Record<string, unknown> | null | undefined): {
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
} {
  const short = Array.isArray(job?.required_short_keywords) ? job!.required_short_keywords : []
  const long = Array.isArray(job?.required_long_tail_keywords) ? job!.required_long_tail_keywords : []
  return {
    requiredShortKeywords: (short as unknown[]).map(String).map((s) => s.trim()).filter(Boolean),
    requiredLongTailKeywords: (long as unknown[]).map(String).map((s) => s.trim()).filter(Boolean),
  }
}

export type JobCompetingPage = { url: string; title: string; primaryKeyword?: string | null }

/** Normalize competing_urls whether the row stored strings or {url,title} objects. */
export function jobCompetingPages(job: Record<string, unknown> | null | undefined): JobCompetingPage[] {
  const raw = job?.competing_urls
  if (!Array.isArray(raw)) return []
  const out: JobCompetingPage[] = []
  for (const c of raw) {
    if (typeof c === 'string') {
      const url = c.trim()
      if (url) out.push({ url, title: url })
      continue
    }
    if (c && typeof c === 'object') {
      const row = c as { url?: string; title?: string; primaryKeyword?: string | null }
      const url = String(row.url || '').trim()
      if (!url) continue
      out.push({ url, title: String(row.title || url), primaryKeyword: row.primaryKeyword ?? null })
    }
  }
  return out
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
