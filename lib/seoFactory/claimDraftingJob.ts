/**
 * Insert or reuse a content_jobs row the moment drafting starts so the queue
 * has a recoverable id before SSE yields `job`.
 *
 * Contract-aware rule: Generate Full Brief reserves/persists the authoritative
 * job first. The normal Studio Draft button MUST reuse that exact contract row
 * instead of creating an uncontracted sibling that can fall onto the legacy
 * authoring path.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
const OPEN_STATUSES = ['drafting', 'failed', 'pending'] as const
const CONTRACT_ACTIVE_STATUSES = ['pending', 'drafting', 'processing', 'publishing', 'pr_created'] as const

export function draftingDedupKey(region: string, primary: string): string {
  const r = String(region || 'US').trim().toLowerCase() || 'us'
  const p = String(primary || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!p) return ''
  return `${r}::${p}`.slice(0, 180)
}

export function isOpenDraftingStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(String(status || '').trim())
}

async function findReservedContractJob(
  db: SupabaseClient,
  opts: { primary: string; region: string; topic: string; contentType: string },
): Promise<string | null> {
  if (!opts.primary) return null
  let query = db
    .from('content_jobs')
    .select('id,contract_id,topic,content_type')
    .eq('primary_keyword', opts.primary)
    .eq('region', opts.region)
    .not('contract_id', 'is', null)
    .in('status', [...CONTRACT_ACTIVE_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(8)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  const norm = (value: unknown) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const wantedType = normalizeJobContentType(opts.contentType)
  const exact = (result.data || []).find((row: any) =>
    norm(row.topic) === norm(opts.topic)
    && normalizeJobContentType(String(row.content_type || '')) === wantedType,
  )
  return exact?.id ? String(exact.id) : null
}

async function findOpenSibling(
  db: SupabaseClient,
  opts: { dedupKey: string; primary: string; region: string },
): Promise<string | null> {
  if (opts.dedupKey) {
    const byKey = await db.from('content_jobs').select('id').eq('dedup_key', opts.dedupKey)
      .in('status', [...OPEN_STATUSES]).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (byKey.data?.id) return String(byKey.data.id)
  }
  if (!opts.primary) return null
  const byPrimary = await db.from('content_jobs').select('id').eq('primary_keyword', opts.primary).eq('region', opts.region)
    .in('status', [...OPEN_STATUSES]).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (byPrimary.data?.id) return String(byPrimary.data.id)
  return null
}

export async function claimDraftingJob(input: ClaimDraftingInput): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const title = String(input.title || input.topic || 'Untitled draft').slice(0, 200)
  const topic = String(input.topic || title).slice(0, 200)
  const region = String(input.region || 'US').slice(0, 8) || 'US'
  const primary = String(input.primaryKeyword || topic).slice(0, 200)
  const contentType = String(input.contentType || 'blog_post')
  const dedupKey = draftingDedupKey(region, primary)
  const row: Record<string, unknown> = {
    user_id: input.userId || 'admin',
    title,
    topic,
    content_type: normalizeJobContentType(contentType),
    status: 'drafting',
    content: PLACEHOLDER,
    word_count: 12,
    region,
    target_repo: defaultJobTargetRepo(contentType, region) || 'caseworks',
    ship_mode: 'pr',
    indexable: true,
    primary_keyword: primary,
    ...(dedupKey ? { dedup_key: dedupKey } : {}),
  }
  const db = createClient(url, key)
  try {
    const contracted = await findReservedContractJob(db, { primary, region, topic, contentType })
    if (contracted) {
      await db.from('content_jobs').update({ status: 'drafting', ...(dedupKey ? { dedup_key: dedupKey } : {}) }).eq('id', contracted)
      return contracted
    }
    const existing = await findOpenSibling(db, { dedupKey, primary, region })
    if (existing) {
      if (dedupKey) await db.from('content_jobs').update({ dedup_key: dedupKey }).eq('id', existing)
      return existing
    }
  } catch (e) {
    console.warn('[claimDraftingJob] sibling lookup failed; inserting', e instanceof Error ? e.message : e)
  }
  let ins = await db.from('content_jobs').insert(row).select('id').single()
  if (ins.error && /column|schema/i.test(ins.error.message || '') && !/not-null|null value/i.test(ins.error.message || '')) {
    const { ship_mode: _s, indexable: _i, primary_keyword: _p, dedup_key: _d, ...minimal } = row
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
