/**
 * Durable reviewer/editor snapshots.
 * The in-memory drafts Map died on Worker restart, so a later re-audit
 * scored the original generation instead of the repaired body.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { countBodyWords } from './contentDepth'

export type ReviewSource = 'autosave' | 'reaudit' | 'fix' | 'manual' | 'restore'

export interface ReviewSnapshot {
  id: string
  jobId: string
  content: string
  createdAt: string
  wordCount: number
  qualityOk?: boolean | null
  shipReady?: boolean | null
  appliedRepairs?: string[]
  source: ReviewSource
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
      const patch: Record<string, unknown> = { content: opts.content, word_count: words }
      if (opts.qualityOk) patch.error_message = null
      const { error: upErr } = await db.from('content_jobs').update(patch).eq('id', opts.jobId)
      if (upErr) {
        console.warn('[reviewSnapshots] job update', upErr.message)
        return { snapshot, persisted: false, error: upErr.message }
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
      .select('id, job_id, content, word_count, quality_ok, ship_ready, applied_repairs, source, created_at')
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
      .select('id, job_id, content, word_count, quality_ok, ship_ready, applied_repairs, source, created_at')
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
      appliedRepairs: Array.isArray(row.applied_repairs) ? (row.applied_repairs as string[]) : [],
      source: (row.source as ReviewSource) || 'autosave',
    }
  } catch {
    return null
  }
}
