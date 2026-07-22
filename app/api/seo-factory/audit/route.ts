import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { auditContent } from '@/lib/seoFactory/audit'
import { resolveOwner } from '@/lib/seoFactory/ownership'

/**
 * POST /api/seo-factory/audit
 * Body: { content, contentType, primaryKeyword?, region?, indexable? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const content = String(body.content || '')
    if (!content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || '')
    const region = String(body.region || 'US')
    const indexable = body.indexable !== false

    const plan = await resolveOwner({
      primaryKeyword: primaryKeyword || 'untitled',
      contentType,
      region,
      indexable,
    })

    const audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
    })

    return NextResponse.json({ audit, plan })
  } catch (err) {
    console.error('[seo-factory/audit]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Audit failed' },
      { status: 500 },
    )
  }
}
