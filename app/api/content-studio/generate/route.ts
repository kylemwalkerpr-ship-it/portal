/**
 * POST /api/content-studio/generate
 *
 * LEGACY entry point — kept for older UI tabs.
 * ALL generation + Git writes go through runSeoFactoryPipeline → shipContent.
 * Never putRepoFile from this route (architecture invariant I1).
 *
 * Prefer POST /api/seo-factory/generate or generate-stream for new work.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  runSeoFactoryPipeline,
  type RequestedShipMode,
} from '@/lib/seoFactory/pipeline'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const topic = String(body.topic || body.title || '').trim()
    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const contentType = String(body.content_type || body.contentType || 'legal_guide')
    const region = String(body.region || 'US').toUpperCase()
    const shipMode = (String(body.ship_mode || body.shipMode || 'pr').toLowerCase() ||
      'pr') as RequestedShipMode

    const result = await runSeoFactoryPipeline({
      topic,
      title: String(body.title || topic),
      primaryKeyword:
        (Array.isArray(body.keywords) && body.keywords[0]
          ? String(body.keywords[0])
          : topic) || topic,
      region,
      contentType:
        contentType === 'article'
          ? 'legal_guide'
          : contentType === 'blog_post'
            ? 'blog_summary'
            : contentType,
      tone: String(body.tone || 'educational'),
      audience: body.audience ? String(body.audience) : undefined,
      keywords: Array.isArray(body.keywords)
        ? body.keywords.map(String)
        : undefined,
      shipMode,
      dryRun: Boolean(body.dryRun || body.dry_run),
      minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
      maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 3,
      userId: auth.profileId || 'admin',
    })

    return NextResponse.json({
      ok: result.ok,
      // Back-compat shape for older UI
      content: result.content,
      provider: result.provider,
      model: result.model,
      jobId: result.jobId,
      plan: result.plan,
      audit: result.audit,
      ship: result.ship,
      shipError: result.shipError,
      shipMode: result.shipMode,
      wordCount: result.audit.wordCount,
      seoScore: result.audit.score,
      gsc: result.gsc,
      error: result.error || result.shipError || null,
      // Explicit: this route no longer bypasses shipGate
      pipeline: 'seo-factory',
    })
  } catch (err) {
    console.error('[content-studio/generate]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generate failed' },
      { status: 500 },
    )
  }
}
