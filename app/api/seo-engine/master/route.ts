import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { scoreMaster, type MasterEngineInput, type IntentId, type SubsystemId } from '@/lib/seoFactory/masterEngine'
import { learnWeights, applyRewardNudges, type HistoricalOutcome } from '@/lib/seoFactory/masterEngineLearn'
import { buildOutcomeHistoryFromLiveGsc } from '@/lib/seoFactory/outcomeHistory'
import { jobToMasterEngineInput } from '@/lib/seoFactory/jobToMasterInput'

/**
 * POST /api/seo-engine/master
 *
 * Runs the Master SEO Engine over a content job (or a raw input payload).
 * Optionally retrains the adaptive weights from supplied historical outcomes.
 *
 * Body:
 *   { jobId?: string, input?: MasterEngineInput, history?: HistoricalOutcome[] }
 *
 * When `jobId` is given, the job row is loaded from content_jobs and its
 * stored fields (topic, keyword, content, live_*, gsc_*, competing_urls,
 * authority_score) are used to build the engine input.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    let body: {
      jobId?: string
      input?: MasterEngineInput
      history?: HistoricalOutcome[]
    } = {}
    try {
      body = (await request.json()) as typeof body
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    let input: MasterEngineInput = body.input || {}

    if (body.jobId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: job, error } = await supabase
        .from('content_jobs')
        .select('*')
        .eq('id', body.jobId)
        .single()
      if (error || !job) {
        return NextResponse.json({ error: `Job not found: ${error?.message || body.jobId}` }, { status: 404 })
      }
      input = jobToMasterEngineInput(job)
    }

    // Retrain from real outcomes. When the caller supplies history use it
    // verbatim; otherwise build it from live GSC page positions correlated
    // against every merged job's stored engine report, so the learned weights
    // shift from measured rank data without a manual history payload.
    let history: HistoricalOutcome[] = Array.isArray(body.history) ? body.history : []
    let outcomeHistory: { source: string; matchedJobs: number; pages: number; warnings: string[] } | null = null
    if (history.length === 0) {
      const built = await buildOutcomeHistoryFromLiveGsc()
      history = built.history
      outcomeHistory = {
        source: built.source,
        matchedJobs: built.matchedJobs,
        pages: built.pages,
        warnings: built.warnings,
      }
    }
    const learn = history.length ? learnWeights(history) : null
    // Per-publish reward nudge layered on top of the batch regression: each
    // intent's blended weights are nudged once more by its most recent
    // outcome (learnFromOutcome), so a fresh publish moves the needle
    // immediately instead of waiting for the next retrain.
    const byIntent: Partial<Record<IntentId, Record<SubsystemId, number>>> = {}
    let rewardNudges: ReturnType<typeof applyRewardNudges>['nudges'] | null = null
    if (learn) {
      const nudged = applyRewardNudges(learn, history)
      Object.assign(byIntent, nudged.byIntent)
      rewardNudges = nudged.nudges
    }
    const report = scoreMaster(input, { byIntent })

    return NextResponse.json({ ok: true, report, learn, rewardNudges, outcomeHistory })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Master engine failed: ${message}` }, { status: 500 })
  }
}
