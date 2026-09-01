/**
 * Job-row finalizer for interrupted generate-streams.
 *
 * Live evidence (2026-08-29): job 12ae1be9 was left status='drafting' with
 * null content after the SSE stream died at the Cloudflare 300s wall. Every
 * interrupted stream must end in exactly one of:
 *   - substantial checkpoint (>200 chars): 'drafting' + resumable content
 *   - anything shorter/empty: 'failed' with a clear error message
 */

import { countBodyWords } from './contentDepth'
import { stripDuplicateArticleCopy } from './editorialScaffold'

export interface StreamFinalizerClient {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<unknown>
    }
  }
}

/** Threshold under which a fragment is not worth resuming. */
const RESUMABLE_MIN_CHARS = 200

export function interruptedJobPatch(
  content: string,
  opts?: { interruptedMessage?: string; failedMessage?: string },
): Record<string, unknown> {
  // A resume/regenerate echo can persist TWO article copies into an
  // interrupted checkpoint — never leave doubled content for the next Resume.
  const deduped = stripDuplicateArticleCopy(content)
  const body = String(deduped.removed ? deduped.content : content || '')
  if (body.trim().length > RESUMABLE_MIN_CHARS) {
    return {
      status: 'drafting',
      error_message: opts?.interruptedMessage || 'Interrupted — click Resume',
      content: body,
      word_count: countBodyWords(body),
    }
  }
  return {
    status: 'failed',
    error_message: opts?.failedMessage || 'No draft produced before stream ended',
  }
}

/** Keep the latest full draft from SSE events. Token deltas append; snapshot `draft` replaces. */
export function ingestStreamDraft(
  current: string,
  ev: { type?: string; draft?: string; text?: string },
): string {
  const snapshot = typeof ev.draft === 'string' ? ev.draft : ''
  if (snapshot.trim().length > 0) return snapshot
  if (ev.type === 'delta' && typeof ev.text === 'string' && ev.text) return current + ev.text
  return current
}

export async function finalizeInterruptedJob(
  supabase: StreamFinalizerClient,
  jobId: string | null | undefined,
  content: string,
  opts?: { interruptedMessage?: string; failedMessage?: string },
): Promise<boolean> {
  if (!supabase || !jobId) return false
  try {
    await supabase
      .from('content_jobs')
      .update(interruptedJobPatch(content, opts))
      .eq('id', jobId)
    return true
  } catch (e) {
    console.warn('[seoFactory/streamFinalizer] finalize failed', e)
    return false
  }
}
