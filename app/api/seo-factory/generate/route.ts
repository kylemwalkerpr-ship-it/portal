import { NextRequest, NextResponse } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { requireAdminUser } from '@/lib/portalAuth'
import { runSeoFactoryPipeline, type RequestedShipMode } from '@/lib/seoFactory/pipeline'
import { assembleMasterEngineFeed } from '@/lib/seoFactory/masterEngineFeed'

/**
 * POST /api/seo-factory/generate
 * Full factory: plan → GSC → Cloudflare AI (+ refine) → audit → optional ship
 *
 * Body extras:
 *   minAuditScore?: number (default 65)
 *   maxRefine?: number (default 2)
 *   shipMode?: 'pr' | 'autodeploy' | 'none' | 'auto'
 */
export async function POST(request: NextRequest) {
  // ── abort guard: client disconnect → fast 499 ──
  if (request.signal.aborted) {
    return NextResponse.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  request.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    if (!topic) {
      return NextResponse.json({ error: 'topic required' }, { status: 400 })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile
        ?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || topic).trim()
    const region = String(body.region || 'US').toUpperCase()
    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const engineFeed = await assembleMasterEngineFeed({
      topic,
      primaryKeyword,
      region,
      contentType,
      title: String(body.title || topic).trim(),
    }).catch(() => null)

    const result = await runSeoFactoryPipeline({
      topic,
      title: String(body.title || topic).trim(),
      primaryKeyword,
      region,
      contentType,
      tone: String(body.tone || 'educational'),
      audience: body.audience ? String(body.audience) : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
      slug: body.slug,
      indexable: body.indexable !== false,
      shipMode: (body.shipMode || body.ship_mode || 'pr') as RequestedShipMode,
      dryRun: Boolean(body.dryRun),
      minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
      maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
      opportunityAction: body.opportunityAction,
      aiProvider: body.aiProvider ? String(body.aiProvider).trim() : undefined,
      masterEngineBlock: engineFeed?.promptBlock || null,
      intelligenceLineage: engineFeed?.lineage ? { masterEngine: engineFeed.lineage } : null,
      userId,
    })

    if (result.shipError && !result.content) {
      return NextResponse.json({ ok: false, error: result.shipError, ...result }, { status: 422 })
    }

    return NextResponse.json({
      ok: result.ok,
      jobId: result.jobId,
      content: result.content,
      plan: result.plan,
      audit: result.audit,
      ship: result.ship,
      shipError: result.shipError,
      shipMode: result.shipMode,
      gsc: result.gsc,
      provider: result.provider,
      model: result.model,
      attempts: result.attempts,
      error: result.shipError || undefined,
    }, { status: result.shipError ? 422 : 200 })
  } catch (err) {
    console.error('[seo-factory/generate]', err)
    const message = err instanceof Error ? err.message : 'Generate failed'
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return NextResponse.json(
      { error: message },
      { status: isCpuTimeout ? 503 : 500 },
    )
  } finally {
    request.signal.removeEventListener('abort', abortHandler)
  }
}
