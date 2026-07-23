import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { shipContent, type ShipMode } from '@/lib/seoFactory/ship'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/content-studio/jobs
 * Query: status, region, limit, q (search topic/keyword), id
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const region = searchParams.get('region')
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

    const supabase = sb()

    if (id) {
      const { data, error } = await supabase.from('content_jobs').select('*').eq('id', id).single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ job: data })
    }

    let query = supabase
      .from('content_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)
    if (region) query = query.eq('region', region)
    if (q) {
      query = query.or(
        `topic.ilike.%${q}%,title.ilike.%${q}%,primary_keyword.ilike.%${q}%`,
      )
    }

    const { data, error } = await query
    if (error) throw new Error(`Supabase query failed: ${error.message}`)

    return NextResponse.json({ jobs: data ?? [], count: data?.length ?? 0 })
  } catch (err) {
    console.error('[content-studio/jobs]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/content-studio/jobs
 * Actions: reship | regenerate | abandon | save | refresh_pr
 *
 * Body: {
 *   id,
 *   action: 'reship'|'regenerate'|'abandon'|'save'|'refresh_pr',
 *   content?, title?, shipMode?, minAuditScore?, maxRefine?, dryRun?
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const id = String(body.id || '').trim()
    const action = String(body.action || '').trim()
    if (!id || !action) {
      return NextResponse.json({ error: 'id and action required' }, { status: 400 })
    }

    const supabase = sb()
    const { data: job, error } = await supabase.from('content_jobs').select('*').eq('id', id).single()
    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile
        ?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    if (action === 'abandon') {
      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated })
    }

    if (action === 'save') {
      const content = body.content != null ? String(body.content) : job.content
      if (content == null || !String(content).trim()) {
        return NextResponse.json({ error: 'content required' }, { status: 400 })
      }
      const title = body.title != null ? String(body.title).trim() : job.title
      const words = String(content).trim().split(/\s+/).filter(Boolean).length
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
      const primaryKeyword = job.primary_keyword || job.topic
      let audit: any = job.audit_json
      try {
        audit = auditContent({
          content: String(content),
          contentType,
          primaryKeyword,
          indexable: job.indexable !== false,
          ownershipBlockers: [],
        })
      } catch { /* keep previous audit */ }

      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update({
          content: String(content),
          title: title || job.title,
          word_count: words,
          seo_score: typeof audit?.score === 'number' ? audit.score : job.seo_score,
          audit_json: audit || job.audit_json,
          error_message: null,
          // Keep terminal states; otherwise mark as drafting after manual edit
          status:
            job.status === 'merged' || job.status === 'closed'
              ? job.status
              : job.status === 'pr_created'
                ? 'pr_created'
                : 'drafting',
        })
        .eq('id', id)
        .select()
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated, audit })
    }

    if (action === 'refresh_pr') {
      const prNumber = job.pr_number
      const repo = String(job.target_repo || '').replace(/^https?:\/\/github\.com\//, '')
      if (!prNumber || !repo.includes('/')) {
        return NextResponse.json({
          ok: true,
          job,
          prStatus: null,
          message: 'No PR number/repo on this job yet',
        })
      }
      const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
      if (!token) {
        return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 })
      }
      const [owner, name] = repo.split('/')
      const ghRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'yousafe-portal-seo-factory',
          },
        },
      )
      if (!ghRes.ok) {
        const text = await ghRes.text().catch(() => '')
        return NextResponse.json(
          { error: `GitHub ${ghRes.status}: ${text.slice(0, 200)}`, job },
          { status: 502 },
        )
      }
      const pr = await ghRes.json()
      const prStatus = {
        number: pr.number as number,
        state: pr.state as string, // open | closed
        merged: Boolean(pr.merged),
        merged_at: pr.merged_at as string | null,
        html_url: pr.html_url as string,
        title: pr.title as string,
        draft: Boolean(pr.draft),
        head: pr.head?.ref as string | undefined,
        base: pr.base?.ref as string | undefined,
        user: pr.user?.login as string | undefined,
        created_at: pr.created_at as string,
        updated_at: pr.updated_at as string,
        mergeable_state: pr.mergeable_state as string | undefined,
      }

      // Sync local status when PR is merged/closed on GitHub
      let nextStatus = job.status
      const patch: Record<string, unknown> = {
        pr_url: pr.html_url || job.pr_url,
      }
      if (pr.merged) {
        nextStatus = 'merged'
        patch.status = 'merged'
        patch.merged_at = pr.merged_at || new Date().toISOString()
        patch.error_message = null
      } else if (pr.state === 'closed' && !pr.merged) {
        nextStatus = 'closed'
        patch.status = 'closed'
        patch.closed_at = new Date().toISOString()
      }

      const { data: updated } = await supabase
        .from('content_jobs')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      return NextResponse.json({
        ok: true,
        job: updated || { ...job, status: nextStatus },
        prStatus,
      })
    }

    if (action === 'reship') {
      if (!job.content) {
        return NextResponse.json({ error: 'Job has no content to ship' }, { status: 400 })
      }
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
      const primaryKeyword = job.primary_keyword || job.topic
      const plan = await resolveOwner({
        primaryKeyword,
        contentType,
        region: job.region || 'US',
        indexable: job.indexable !== false,
      })
      const audit =
        (job.audit_json as any)?.score != null
          ? (job.audit_json as any)
          : auditContent({
              content: job.content,
              contentType,
              primaryKeyword,
              indexable: plan.indexable,
              ownershipBlockers: plan.blockers,
            })
      const shipMode = (body.shipMode || job.ship_mode || 'pr') as ShipMode
      try {
        const ship = await shipContent({
          mode: shipMode === 'autodeploy' ? 'autodeploy' : 'pr',
          plan,
          content: job.content,
          title: job.title || job.topic,
          region: job.region || 'US',
          contentType,
          primaryKeyword,
          audit,
          dryRun: Boolean(body.dryRun),
          jobId: id,
        })
        const { data: updated } = await supabase
          .from('content_jobs')
          .update({
            status: ship.status === 'deployed' ? 'merged' : 'pr_created',
            pr_url: ship.prUrl || job.pr_url,
            pr_number: ship.prNumber || job.pr_number,
            branch_name: ship.branch || job.branch_name,
            content_path: ship.path || job.content_path,
            deploy_sha: ship.commitSha || null,
            deployed_at: ship.status === 'deployed' ? new Date().toISOString() : job.deployed_at,
            error_message: null,
            ship_mode: ship.mode,
          })
          .eq('id', id)
          .select()
          .single()
        return NextResponse.json({ ok: true, ship, job: updated })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ship failed'
        await supabase.from('content_jobs').update({ error_message: msg, status: 'failed' }).eq('id', id)
        return NextResponse.json({ ok: false, error: msg }, { status: 422 })
      }
    }

    if (action === 'regenerate') {
      const result = await runSeoFactoryPipeline({
        topic: job.topic,
        title: job.title || job.topic,
        primaryKeyword: job.primary_keyword || job.topic,
        region: job.region || 'US',
        contentType:
          job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide',
        tone: job.tone || 'educational',
        shipMode: (body.shipMode || 'pr') as any,
        dryRun: Boolean(body.dryRun),
        minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 55,
        maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 2,
        userId,
      })
      // Mark old job closed; new job created by pipeline
      await supabase
        .from('content_jobs')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          error_message: `Superseded by regenerate → ${result.jobId || 'new job'}`,
        })
        .eq('id', id)

      return NextResponse.json({
        ok: result.ok,
        previousJobId: id,
        result,
      }, { status: result.shipError ? 422 : 200 })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    console.error('[content-studio/jobs PATCH]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
