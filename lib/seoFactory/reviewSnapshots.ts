/**
 * Durable reviewer/editor snapshots.
 * The in-memory drafts Map died on Worker restart, so a later re-audit
 * scored the original generation instead of the repaired body.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { countBodyWords } from './contentDepth'
import { contentFingerprint } from './currentGate'

export type ReviewSource = 'autosave' | 'reaudit' | 'fix' | 'manual' | 'restore'

export interface ReviewSnapshot {
  id: string
  jobId: string
  content: string
  createdAt: string
  wordCount: number
  qualityOk?: boolean | null
  shipReady?: boolean | null
  blockers?: number
  warnings?: number
  contentFingerprint: string
  appliedRepairs?: string[]
  source: ReviewSource
}

/**
 * Cross-contamination guard (title/body mismatch, 2026-09-04).
 *
 * `persistReviewSnapshot` is a SECOND write door for `content_jobs.content`
 * outside `persistPipelineJob` / `shipContent`. It is reached from the editor
 * autosave and DraftWorkspace flush with a client-supplied `jobId`, so a stale
 * editor buffer (a previously opened article) can be flushed onto a brand-new
 * claim row — the title stayed Green Card while the body became the previous
 * H-1B article (word_count identical to the merged H-1B row).
 *
 * This pure check refuses to push a body onto a job whose stored identity
 * (title / topic / primary keyword) shares no significant words with the
 * body's own title. The body title is the decisive discriminator — the H-1B
 * article's H1 shares nothing topical with a Green Card job. Generic words
 * ("apply", "guide", "2026", …) are stripped so a loose verb can never be the
 * shared token. Legit drafts always carry the job topic in their H1/front
 * matter, so they pass. When no title is extractable, a whole-body
 * proportional check (mirroring the pipeline's content-topic validation) is
 * used. A rejected write still saves the review snapshot — only the
 * content_jobs.content clobber is refused.
 */
const GENERIC_TOPIC_WORDS = new Set([
  'apply', 'application', 'applying', 'guide', 'guides', 'guidance',
  'checklist', 'everything', 'need', 'your', '2025', '2026', '2027', 'year',
])

function significantWords(text: string): string[] {
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 4 && !GENERIC_TOPIC_WORDS.has(w)),
    ),
  ]
}

/** The body's own title: H1, else YAML `title:`, else the head of the body. */
function contentTitle(content: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) return h1[1]
  const fm = content.match(/^title:\s*(.+)$/m)
  if (fm) return fm[1]
  return content.slice(0, 200)
}

export function reviewSnapshotContentMatchesJob(
  content: string,
  job: {
    title?: string | null
    topic?: string | null
    primary_keyword?: string | null
  } | null,
): boolean {
  const body = String(content || '')
  if (!body.trim()) return false
  if (!job) return true
  const identityWords = significantWords(
    [job.title, job.topic, job.primary_keyword].filter(Boolean).join(' '),
  )
  if (!identityWords.length) return true
  const titleWords = significantWords(contentTitle(body))
  if (titleWords.length) {
    return titleWords.some((w) => identityWords.includes(w))
  }
  const bodyWords = significantWords(body)
  if (!bodyWords.length) return true
  const hits = bodyWords.filter((w) => identityWords.includes(w)).length
  return hits >= 1 && hits / bodyWords.length >= 0.3
}

export async function persistReviewSnapshot(opts: {
  jobId: string
  content: string
  source: ReviewSource
  qualityOk?: boolean | null
  shipReady?: boolean | null
  blockers?: unknown
  warnings?: unknown
  appliedRepairs?: string[]
  updateJob?: boolean
}): Promise<{ snapshot: ReviewSnapshot; persisted: boolean; error?: string }> {
  const words = countBodyWords(opts.content)
  const snapshot: ReviewSnapshot = {
    id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: opts.jobId,
    content: opts.content,
    createdAt: new Date().toISOString(),
    wordCount: words,
    qualityOk: opts.qualityOk ?? null,
    shipReady: opts.shipReady ?? null,
    blockers: Array.isArray(opts.blockers) ? opts.blockers.length : Number(opts.blockers) || 0,
    warnings: Array.isArray(opts.warnings) ? opts.warnings.length : Number(opts.warnings) || 0,
    contentFingerprint: contentFingerprint(opts.content),
    appliedRepairs: opts.appliedRepairs || [],
    source: opts.source,
  }
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('content_job_reviews')
      .insert({
        job_id: opts.jobId,
        content: opts.content,
        word_count: words,
        quality_ok: opts.qualityOk ?? null,
        ship_ready: opts.shipReady ?? null,
        blockers: opts.blockers ?? [],
        warnings: opts.warnings ?? [],
        applied_repairs: opts.appliedRepairs || [],
        source: opts.source,
      })
      .select('id, created_at')
      .maybeSingle()
    if (error) {
      console.warn('[reviewSnapshots] insert', error.message)
      return { snapshot, persisted: false, error: error.message }
    }
    if (data?.id) snapshot.id = String(data.id)
    if (data?.created_at) snapshot.createdAt = String(data.created_at)

    if (opts.updateJob !== false) {
      // Cross-contamination guard: only push a body onto a content_jobs row
      // after verifying the row exists, is not terminal, and the body actually
      // matches the job's title/topic/primary keyword. A stale editor buffer
      // (previous shipped article) must never be flushed onto a newly claimed
      // draft row — the title would stay while the body becomes another job's.
      const { data: jobRow } = await db
        .from('content_jobs')
        .select('id,title,topic,primary_keyword,status')
        .eq('id', opts.jobId)
        .maybeSingle()
      const terminal = jobRow && (jobRow.status === 'merged' || jobRow.status === 'closed')
      const matches = reviewSnapshotContentMatchesJob(opts.content, jobRow as Record<string, unknown>)
      if (jobRow && (terminal || !matches)) {
        console.warn(
          `[reviewSnapshots] refusing content_jobs.content write for ${opts.jobId}: ${
            terminal ? `terminal status ${jobRow.status}` : `content does not match job title/topic (${words} words)`
          } — review snapshot still saved`,
        )
        return { snapshot, persisted: true }
      }
      const patch: Record<string, unknown> = { content: opts.content, word_count: words }
      if (opts.qualityOk) patch.error_message = null
      const { data: updated, error: upErr } = await db.from('content_jobs').update(patch).eq('id', opts.jobId).select('id').maybeSingle()
      if (upErr) {
        console.warn('[reviewSnapshots] job update', upErr.message)
        return { snapshot, persisted: false, error: upErr.message }
      }
      if (!updated?.id) {
        const { defaultJobTargetRepo } = await import('./jobContentType')
        const { error: insErr } = await db.from('content_jobs').insert({
          id: opts.jobId,
          user_id: 'admin',
          title: 'Untitled draft',
          topic: 'Untitled draft',
          content_type: 'article',
          status: 'drafting',
          content: opts.content,
          word_count: words,
          region: 'US',
          target_repo: defaultJobTargetRepo('article') || 'caseworks',
        })
        if (insErr && !/duplicate|already exists/i.test(insErr.message || '')) {
          console.warn('[reviewSnapshots] job insert', insErr.message)
          return { snapshot, persisted: false, error: insErr.message }
        }
      }
    }
    return { snapshot, persisted: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'persist failed'
    console.warn('[reviewSnapshots]', error)
    return { snapshot, persisted: false, error }
  }
}

export async function listReviewSnapshots(jobId: string, limit = 20): Promise<ReviewSnapshot[]> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('content_job_reviews')
      .select('id, job_id, content, word_count, quality_ok, ship_ready, blockers, warnings, applied_repairs, source, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
      .limit(Math.min(50, Math.max(1, limit)))
    if (error) {
      console.warn('[reviewSnapshots] list', error.message)
      return []
    }
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      content: String(row.content || ''),
      createdAt: String(row.created_at || ''),
      wordCount: Number(row.word_count) || 0,
      qualityOk: (row.quality_ok as boolean | null) ?? null,
      shipReady: (row.ship_ready as boolean | null) ?? null,
      blockers: Array.isArray(row.blockers) ? row.blockers.length : Number(row.blockers) || 0,
      warnings: Array.isArray(row.warnings) ? row.warnings.length : Number(row.warnings) || 0,
      contentFingerprint: contentFingerprint(String(row.content || '')),
      appliedRepairs: Array.isArray(row.applied_repairs) ? (row.applied_repairs as string[]) : [],
      source: (row.source as ReviewSource) || 'autosave',
    }))
  } catch {
    return []
  }
}

export async function latestReviewSnapshot(jobId: string): Promise<ReviewSnapshot | null> {
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('content_job_reviews')
      .select('id, job_id, content, word_count, quality_ok, ship_ready, blockers, warnings, applied_repairs, source, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      content: String(row.content || ''),
      createdAt: String(row.created_at || ''),
      wordCount: Number(row.word_count) || 0,
      qualityOk: (row.quality_ok as boolean | null) ?? null,
      shipReady: (row.ship_ready as boolean | null) ?? null,
      blockers: Array.isArray(row.blockers) ? row.blockers.length : Number(row.blockers) || 0,
      warnings: Array.isArray(row.warnings) ? row.warnings.length : Number(row.warnings) || 0,
      contentFingerprint: contentFingerprint(String(row.content || '')),
      appliedRepairs: Array.isArray(row.applied_repairs) ? (row.applied_repairs as string[]) : [],
      source: (row.source as ReviewSource) || 'autosave',
    }
  } catch {
    return null
  }
}

/** Latest audited gate snapshot, excluding later autosaves that intentionally
 * carry no gate result. Callers still fingerprint-match it to the loaded body. */
export async function latestGateReviewSnapshot(jobId: string): Promise<ReviewSnapshot | null> {
  const snapshots = await listReviewSnapshots(jobId, 50)
  return [...snapshots].reverse().find((snapshot) => typeof snapshot.shipReady === 'boolean') ?? null
}
