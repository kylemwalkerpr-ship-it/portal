import { NextRequest, NextResponse } from 'next/server'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'

/**
 * POST /api/cron/seo-engine-daily
 * Daily SEO Master Engine automation (midday Africa/Nairobi via GitHub Actions).
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Phases:
 *   { phase: 'knowledge', limitPerSource? }   — ingest fresh intel only
 *   { phase: 'plan', limit?, draftBriefs? }   — run master planner only
 *   { phase: 'all' }                          — knowledge → plan (default)
 *
 * GET — latest engine runs (audit trail).
 */
function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { latestEngineRuns } = await import('@/lib/seoEngine/knowledge')
  const runs = await latestEngineRuns(10)
  return NextResponse.json({ ok: true, runs })
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { phase?: string; limitPerSource?: number; limit?: number; draftBriefs?: boolean; llmAudits?: boolean }
  const phase = String(body.phase || 'all').toLowerCase()

  try {
    if (phase === 'plan') {
      const plans = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit })
      await recordEngineRun('daily', plans.length ? 'success' : 'partial', { phase, plans: plans.length }, [], 'cron')
      return NextResponse.json({ ok: true, phase, plans: plans.length })
    }
    if (phase === 'llm') {
      const vis = await runVisibilityAudits({ maxAudits: 8 })
      await recordEngineRun('daily', 'success', { phase, cited: vis.cited, total: vis.total, shareOfVoice: vis.shareOfVoice }, [], 'cron')
      return NextResponse.json({ ok: true, phase, ...vis })
    }

    // knowledge (or all): ingest first
    const ingest = await ingestKnowledge({ limitPerSource: body.limitPerSource, maxAiItems: 6 })
    let plans = 0
    let llmAudits = 0
    let cited = 0
    if (phase === 'all') {
      const result = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit || 15 })
      plans = result.length
      if (body.llmAudits !== false) {
        const vis = await runVisibilityAudits({ maxAudits: 6 })
        llmAudits = vis.total
        cited = vis.cited
      }
    }
    const status = ingest.errors.length ? 'partial' : 'success'
    await recordEngineRun('daily', status, {
      phase,
      ingested: ingest.itemsStored,
      fetched: ingest.itemsFetched,
      aiSummarized: ingest.aiSummarized,
      plans,
      llmAudits,
      llmCited: cited,
    }, ingest.errors, 'cron')

    return NextResponse.json({ ok: true, phase, ingest: { fetched: ingest.itemsFetched, stored: ingest.itemsStored, aiSummarized: ingest.aiSummarized, errors: ingest.errors.slice(0, 5) }, plans, llmAudits, llmCited: cited })
  } catch (e) {
    await recordEngineRun('daily', 'failed', { phase }, [e instanceof Error ? e.message : 'unknown'], 'cron')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'daily run failed' }, { status: 500 })
  }
}
