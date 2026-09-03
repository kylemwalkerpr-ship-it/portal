/**
 * Insert a content_jobs row the moment drafting starts so the queue (Drafting /
 * In Flight) has a recoverable id before the SSE stream yields `job`.
 * A browser refresh must reload this row — never lose the draft to React state.
 */
import { createClient } from '@supabase/supabase-js'
import { defaultJobTargetRepo, normalizeJobContentType } from './jobContentType'

export type ClaimDraftingInput = {
  title?: string
  topic?: string
  contentType?: string
  region?: string
  primaryKeyword?: string
  userId?: string
}

const PLACEHOLDER = '# Drafting\n\nQueued for generation. This row is the live job — resume from the queue if the browser refreshes.\n'

export async function claimDraftingJob(input: ClaimDraftingInput): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const title = String(input.title || input.topic || 'Untitled draft').slice(0, 200)
  const topic = String(input.topic || title).slice(0, 200)
  const row: Record<string, unknown> = {
    user_id: input.userId || 'admin',
    title,
    topic,
    content_type: normalizeJobContentType(input.contentType || 'blog_post'),
    status: 'drafting',
    content: PLACEHOLDER,
    word_count: 12,
    region: String(input.region || 'US').slice(0, 8) || 'US',
    target_repo: defaultJobTargetRepo(input.contentType, input.region) || 'caseworks',
    ship_mode: 'pr',
    indexable: true,
    primary_keyword: String(input.primaryKeyword || topic).slice(0, 200),
  }
  const db = createClient(url, key)
  let ins = await db.from('content_jobs').insert(row).select('id').single()
  if (ins.error && /column|schema/i.test(ins.error.message || '') && !/not-null|null value/i.test(ins.error.message || '')) {
    const { ship_mode: _s, indexable: _i, primary_keyword: _p, ...minimal } = row
    ins = await db.from('content_jobs').insert({ ...minimal, target_repo: row.target_repo || 'caseworks' }).select('id').single()
  }
  if (ins.error && /target_repo/i.test(ins.error.message || '')) {
    ins = await db.from('content_jobs').insert({ ...row, target_repo: 'caseworks' }).select('id').single()
  }
  if (ins.error || !ins.data?.id) {
    console.warn('[claimDraftingJob] insert failed', ins.error?.message)
    return null
  }
  return String(ins.data.id)
}
