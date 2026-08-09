import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  assembleLineageTimeline,
  type TimelineEvent,
  type TimelineNode,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

interface JobRow {
  id: string
  source_job_id: string | null
  status: string | null
  created_at: string | null
  title: string | null
  topic: string | null
  lineage?: unknown
  regeneration_reason?: string | null
  regeneration_mode?: string | null
  event_log?: unknown
}

async function loadJobChain(jobId: string): Promise<{ nodes: TimelineNode[]; events: TimelineEvent[] }> {
  const { createSupabaseAdminClient } = await import('@/lib/supabase')
  const client = createSupabaseAdminClient()
  const chain: JobRow[] = []
  const seen = new Set<string>()
  let cursor: string | null = jobId
  while (cursor && !seen.has(cursor) && chain.length < 12) {
    seen.add(cursor)
    const { data } = await client
      .from('content_jobs')
      .select('id,source_job_id,status,created_at,title,topic,lineage,regeneration_reason,regeneration_mode,event_log')
      .eq('id', cursor)
      .maybeSingle()
    if (!data) break
    const row = data as unknown as JobRow
    chain.unshift(row)
    cursor = row.source_job_id || null
  }
  const nodes: TimelineNode[] = chain.map((r) => ({
    id: r.id,
    sourceJobId: r.source_job_id,
    status: r.status || 'unknown',
    createdAt: r.created_at,
    title: r.title,
    topic: r.topic,
    regenerationMode: r.regeneration_mode,
    regenerationReason: r.regeneration_reason,
  }))
  const events: TimelineEvent[] = []
  for (const r of chain) {
    const log = Array.isArray(r.event_log) ? (r.event_log as Array<Record<string, unknown>>) : []
    for (const e of log) {
      events.push({
        id: String(e.id || `${r.id}-${events.length}`),
        ts: Number(e.ts) || (e.created_at ? new Date(String(e.created_at)).getTime() : 0),
        status: String(e.status || 'info'),
        actor: String(e.actor || 'system'),
        message: String(e.message || '').slice(0, 400),
        evidence: e.evidence as Record<string, unknown> | undefined,
      })
    }
  }
  return { nodes, events }
}

async function findJobByTopic(topic: string): Promise<string | null> {
  const { createSupabaseAdminClient } = await import('@/lib/supabase')
  const client = createSupabaseAdminClient()
  const hay = String(topic).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  const { data } = await client
    .from('content_jobs')
    .select('id')
    .ilike('topic', `%${hay.slice(0, 24)}%`)
    .order('created_at', { ascending: false })
    .limit(5)
  return ((data as Array<{ id: string }> | null) || [])[0]?.id || null
}

/**
 * GET /api/seo-engine/lineage?jobId=<id>  — full regeneration lineage timeline
 * GET /api/seo-engine/lineage?topic=<term> — resolve the latest job for a topic,
 *                                            then return its lineage.
 * Returns the time-ordered, annotated chain (nodes + events) the dashboard
 * renders as a vertical timeline.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const sp = req.nextUrl.searchParams
    let jobId = sp.get('jobId')
    const topic = sp.get('topic')
    if (!jobId && topic) jobId = await findJobByTopic(topic)
    if (!jobId) {
      return NextResponse.json({ ok: true, timeline: [], nodes: [], events: [], hint: 'pass jobId or topic' })
    }
    const { nodes, events } = await loadJobChain(jobId)
    if (!nodes.length) {
      return NextResponse.json({ ok: false, error: `no job found for ${jobId}` }, { status: 404 })
    }
    const timeline = assembleLineageTimeline(nodes, events)
    return NextResponse.json({ ok: true, rootJobId: jobId, timeline, nodes, events })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'lineage load failed' },
      { status: 500 },
    )
  }
}
