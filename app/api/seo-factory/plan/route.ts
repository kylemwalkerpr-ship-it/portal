import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'

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

    return NextResponse.json({
      plan,
      suggestedKeyword,
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
        mode: plan.ymy || plan.blockers.length ? 'pr' : 'autodeploy',
        reason: plan.ymy
          ? 'YMYL legal content defaults to PR for human review'
          : plan.blockers.length
            ? 'Ownership blockers require PR or keyword change'
            : 'Non-YMYL with clear ownership — autodeploy allowed after audit ≥70',
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
