import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { scoreMaster, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'
import { learnWeights, type HistoricalOutcome } from '@/lib/seoFactory/masterEngineLearn'

export const runtime = 'edge'

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
      input = {
        topic: job.topic || undefined,
        primaryKeyword: job.primary_keyword || job.topic || undefined,
        contentType: job.content_type || undefined,
        region: job.region || undefined,
        title: job.title || undefined,
        content: job.content || undefined,
        liveHtml: job.live_html || undefined,
        liveUrl: job.live_url || job.canonical_url || undefined,
        liveHttpStatus: job.live_http_status ?? undefined,
        indexable: job.indexable ?? undefined,
        canonicalUrl: job.canonical_url || undefined,
        requiredShortKeywords: job.required_short_keywords || undefined,
        requiredLongTailKeywords: job.required_long_tail_keywords || undefined,
        competingSnippets: job.competing_snippets || undefined,
        competingUrls: job.competing_urls || undefined,
        gsc: job.gsc && typeof job.gsc === 'object'
          ? {
              impressions: job.gsc.impressions,
              clicks: job.gsc.clicks,
              ctr: job.gsc.ctr,
              position: job.gsc.position,
              queries: job.gsc.queries,
            }
          : undefined,
        backlinks: job.backlinks_json || undefined,
        authorityScore: job.authority_score ?? undefined,
        createdAt: job.created_at || undefined,
        updatedAt: job.updated_at || undefined,
      }
    }

    const report = scoreMaster(input)
    const learn = body.history && body.history.length ? learnWeights(body.history) : null

    return NextResponse.json({ ok: true, report, learn })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Master engine failed: ${message}` }, { status: 500 })
  }
}
