import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { describeEstateContract, validateShipPlan } from '@/lib/seoFactory/shipGate'

/**
 * POST /api/seo-factory/plan
 * Body: { topic, primaryKeyword?, region, contentType, slug?, indexable? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || topic).trim()
    const region = String(body.region || 'US').toUpperCase()
    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const indexable = body.indexable !== false

    if (!topic && !primaryKeyword) {
      return NextResponse.json({ error: 'topic or primaryKeyword required' }, { status: 400 })
    }

    const plan = await resolveOwner({
      primaryKeyword: primaryKeyword || topic,
      contentType,
      region,
      slug: body.slug,
      indexable,
    })

    const gscBrief = await buildGscContentBrief({
      topic: topic || primaryKeyword,
      region,
      keywords: Array.isArray(body.keywords) ? body.keywords : primaryKeyword ? [primaryKeyword] : [],
    })

    const suggestedKeyword = gscBrief.primaryKeywords[0]?.term || primaryKeyword || topic
    const shipGate = validateShipPlan({
      plan,
      contentType,
      title: topic || primaryKeyword,
      primaryKeyword: primaryKeyword || topic,
    })

    return NextResponse.json({
      plan,
      suggestedKeyword,
      shipGate: {
        ok: shipGate.ok,
        errors: shipGate.errors,
        warnings: shipGate.warnings,
        kind: shipGate.kind,
        host: shipGate.host,
        repo: shipGate.repo,
        filePath: shipGate.filePath,
        canonicalUrl: shipGate.canonicalUrl,
      },
      estateContract: describeEstateContract(),
      gsc: {
        source: gscBrief.source,
        mode: gscBrief.mode,
        primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
        opportunityKeywords: gscBrief.opportunityKeywords.slice(0, 8),
        strategyHints: gscBrief.strategyHints,
        warnings: gscBrief.warnings,
      },
      gscPromptPreview: formatGscBriefForPrompt(gscBrief).slice(0, 2000),
      shipRecommendation: {
        mode: !shipGate.ok
          ? 'none'
          : plan.ymy || plan.blockers.length
            ? 'pr'
            : 'merge',
        allowed: shipGate.ok,
        reason: !shipGate.ok
          ? `Ship blocked by estate gate: ${shipGate.errors[0]}`
          : plan.ymy
            ? 'YMYL legal content — merge allowed after human Approve or high audit'
            : plan.blockers.length
              ? 'Ownership blockers require keyword/ownership change'
              : `Allowed on ${shipGate.host} → ${shipGate.repo} · ${shipGate.filePath}`,
      },
    })
  } catch (err) {
    console.error('[seo-factory/plan]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Plan failed' },
      { status: 500 },
    )
  }
}
