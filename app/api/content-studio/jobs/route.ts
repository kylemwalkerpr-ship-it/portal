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

type GhHeaders = Record<string, string>

function ghHeaders(token: string): GhHeaders {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yousafe-portal-seo-factory',
  }
}

/**
 * PATCH /api/content-studio/jobs
 * Actions: reship | regenerate | abandon | save | refresh_pr | append_log
 *
 * Body: {
 *   id,
 *   action: 'reship'|'regenerate'|'abandon'|'save'|'refresh_pr'|'append_log',
 *   content?, title?, shipMode?, minAuditScore?, maxRefine?, dryRun?,
 *   entries?: StudioLogEntry[]  // for append_log
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

    if (action === 'append_log') {
      const entries = Array.isArray(body.entries) ? body.entries : body.entry ? [body.entry] : []
      if (!entries.length) {
        return NextResponse.json({ error: 'entries required' }, { status: 400 })
      }
      const normalized = entries
        .slice(0, 50)
        .map((e: any) => ({
          id: String(e.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          ts: Number(e.ts) || Date.now(),
          level: String(e.level || 'info'),
          source: String(e.source || 'client').slice(0, 64),
          message: String(e.message || '').slice(0, 2000),
          detail: e.detail != null ? String(e.detail).slice(0, 4000) : undefined,
        }))
        .filter((e: { message: string }) => e.message)

      const prev = Array.isArray(job.event_log) ? job.event_log : []
      // Cap at 300 entries, keep newest
      const next = [...prev, ...normalized].slice(-300)

      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update({ event_log: next })
        .eq('id', id)
        .select('id, event_log')
        .single()

      // If column missing, soft-fail so UI still works pre-migration
      if (upErr) {
        if (/event_log|column/i.test(upErr.message || '')) {
          return NextResponse.json({
            ok: false,
            skipped: true,
            message: 'event_log column missing — run content_jobs_event_log.sql',
          })
        }
        throw upErr
      }
      return NextResponse.json({ ok: true, job: updated, count: next.length })
    }

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
      const headers = ghHeaders(token)
      const ghRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`,
        { headers },
      )
      if (!ghRes.ok) {
        const text = await ghRes.text().catch(() => '')
        return NextResponse.json(
          { error: `GitHub ${ghRes.status}: ${text.slice(0, 200)}`, job },
          { status: 502 },
        )
      }
      const pr = await ghRes.json()
      const headSha: string | undefined = pr.head?.sha
      const headRef: string | undefined = pr.head?.ref

      // CI: check-runs + combined status for the PR head commit
      let checks: Array<{
        name: string
        status: string
        conclusion: string | null
        html_url?: string
        started_at?: string
        completed_at?: string
      }> = []
      let checkSummary = {
        total: 0,
        success: 0,
        failure: 0,
        pending: 0,
        neutral: 0,
        state: 'unknown' as string,
      }
      let commitStatus: {
        state: string
        total_count: number
        statuses: Array<{ context: string; state: string; description?: string; target_url?: string }>
      } | null = null

      if (headSha) {
        const [checksRes, statusRes] = await Promise.all([
          fetch(
            `https://api.github.com/repos/${owner}/${name}/commits/${headSha}/check-runs?per_page=50`,
            {
              headers: {
                ...headers,
                Accept: 'application/vnd.github+json',
              },
            },
          ),
          fetch(
            `https://api.github.com/repos/${owner}/${name}/commits/${headSha}/status`,
            { headers },
          ),
        ])

        if (checksRes.ok) {
          const checksJson = await checksRes.json()
          const runs = Array.isArray(checksJson.check_runs) ? checksJson.check_runs : []
          checks = runs.map((r: any) => ({
            name: String(r.name || r.app?.name || 'check'),
            status: String(r.status || 'queued'),
            conclusion: r.conclusion != null ? String(r.conclusion) : null,
            html_url: r.html_url || r.details_url || undefined,
            started_at: r.started_at || undefined,
            completed_at: r.completed_at || undefined,
          }))
          const success = checks.filter(
            (c) => c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped',
          ).length
          const failure = checks.filter(
            (c) =>
              c.conclusion === 'failure' ||
              c.conclusion === 'timed_out' ||
              c.conclusion === 'cancelled' ||
              c.conclusion === 'action_required',
          ).length
          const pending = checks.filter(
            (c) => c.status !== 'completed' || c.conclusion == null,
          ).length
          const neutral = checks.filter(
            (c) => c.conclusion === 'neutral' || c.conclusion === 'skipped',
          ).length
          checkSummary = {
            total: checks.length,
            success,
            failure,
            pending,
            neutral,
            state:
              failure > 0
                ? 'failure'
                : pending > 0
                  ? 'pending'
                  : checks.length > 0
                    ? 'success'
                    : 'none',
          }
        }

        if (statusRes.ok) {
          const st = await statusRes.json()
          commitStatus = {
            state: String(st.state || 'unknown'),
            total_count: Number(st.total_count || 0),
            statuses: Array.isArray(st.statuses)
              ? st.statuses.slice(0, 20).map((s: any) => ({
                  context: String(s.context || 'status'),
                  state: String(s.state || 'unknown'),
                  description: s.description || undefined,
                  target_url: s.target_url || undefined,
                }))
              : [],
          }
          // Prefer combined status when check-runs empty
          if (checkSummary.total === 0 && commitStatus.total_count > 0) {
            checkSummary.state = commitStatus.state
            checkSummary.total = commitStatus.total_count
          }
        }
      }

      const prStatus = {
        number: pr.number as number,
        state: pr.state as string, // open | closed
        merged: Boolean(pr.merged),
        merged_at: pr.merged_at as string | null,
        html_url: pr.html_url as string,
        title: pr.title as string,
        draft: Boolean(pr.draft),
        head: headRef,
        head_sha: headSha,
        base: pr.base?.ref as string | undefined,
        user: pr.user?.login as string | undefined,
        created_at: pr.created_at as string,
        updated_at: pr.updated_at as string,
        mergeable_state: pr.mergeable_state as string | undefined,
        checks,
        check_summary: checkSummary,
        commit_status: commitStatus,
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
