import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { ingestKnowledge, loadKnowledgeFeed, recordEngineRun, DEFAULT_SOURCES } from '@/lib/seoEngine/knowledge'

/**
 * GET /api/seo-engine/knowledge
 * Recent knowledge intel + source registry for the dashboard.
 *
 * POST /api/seo-engine/knowledge  (body: { sources?: string[], limitPerSource?, aiSummarize? })
 * Runs the daily knowledge ingestion — scrapes gov feeds, Google Search
 * Central and Google Trends, tags items to lifecycle stages and stores them.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const feed = await loadKnowledgeFeed()
    const { data: config } = await createSupabaseAdminClient()
      .from('seo_engine_config')
      .select('key,value')
      .eq('key', 'knowledge')
      .maybeSingle()
    return NextResponse.json({ ok: true, ...feed, sources: DEFAULT_SOURCES, config: config?.value || null })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'knowledge feed failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      sources?: string[]
      limitPerSource?: number
      aiSummarize?: boolean
      maxAiItems?: number
    }
    const result = await ingestKnowledge({
      sources: body.sources,
      limitPerSource: body.limitPerSource,
      aiSummarize: body.aiSummarize,
      maxAiItems: body.maxAiItems,
    })
    const { classifyEngineRunStatus } = await import('@/lib/seoEngine/engineRunSummary')
    const status = classifyEngineRunStatus({
      phase: 'knowledge',
      itemsStored: result.itemsStored,
      sourcesRun: result.sourcesRun,
      sourceErrors: result.errors.length,
    })
    await recordEngineRun('knowledge', status, {
      sourcesRun: result.sourcesRun,
      itemsFetched: result.itemsFetched,
      itemsStored: result.itemsStored,
      aiSummarized: result.aiSummarized,
      skipped: result.skipped,
      ingestErrors: result.errors.length,
    }, [...result.errors, ...result.aiErrors].slice(0, 20), 'admin')
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    await recordEngineRun('knowledge', 'failed', {}, [e instanceof Error ? e.message : 'unknown'], 'admin')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ingestion failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
