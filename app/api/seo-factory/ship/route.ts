import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import { shipContent, type ShipMode } from '@/lib/seoFactory/ship'

/**
 * POST /api/seo-factory/ship
 * Body: {
 *   content, title, topic, region, contentType,
 *   primaryKeyword?, shipMode?: 'pr'|'autodeploy',
 *   indexable?, dryRun?, jobId?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const content = String(body.content || '')
    const title = String(body.title || body.topic || 'Untitled').trim()
    const topic = String(body.topic || title).trim()
    const region = String(body.region || 'US').toUpperCase()
    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || topic)
    const shipMode = (body.shipMode || body.ship_mode || 'pr') as ShipMode
    const indexable = body.indexable !== false
    const dryRun = Boolean(body.dryRun)

    if (!content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }
    if (shipMode !== 'pr' && shipMode !== 'autodeploy') {
      return NextResponse.json({ error: 'shipMode must be pr or autodeploy' }, { status: 400 })
    }

    const plan = await resolveOwner({
      primaryKeyword,
      contentType,
      region,
      indexable,
      slug: body.slug,
    })

    const audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
    })

    const result = await shipContent({
      mode: shipMode,
      plan,
      content,
      title,
      region,
      contentType,
      primaryKeyword,
      audit,
      dryRun,
      jobId: body.jobId,
    })

    // Best-effort job update
    if (body.jobId && !dryRun) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        await supabase
          .from('content_jobs')
          .update({
            status: result.status === 'deployed' ? 'merged' : 'pr_created',
            ship_mode: shipMode,
            indexable: plan.indexable,
            canonical_url: result.canonicalUrl,
            owner_host: plan.host,
            primary_keyword: primaryKeyword,
            audit_json: audit,
            deploy_sha: result.commitSha || null,
            deployed_at: result.status === 'deployed' ? new Date().toISOString() : null,
            pr_url: result.prUrl || null,
            pr_number: result.prNumber || null,
            branch_name: result.branch || null,
            content_path: result.path,
            target_repo: result.repo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.jobId)
      } catch (e) {
        console.warn('[seo-factory/ship] job update skipped', e)
      }
    }

    return NextResponse.json({ ok: true, result, audit, plan })
  } catch (err) {
    console.error('[seo-factory/ship]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ship failed' },
      { status: 500 },
    )
  }
}
