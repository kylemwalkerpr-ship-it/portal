import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { shipContent, mergePullRequest, parseRepoSlug, type ShipMode } from '@/lib/seoFactory/ship'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import { monitorContentJob } from '@/lib/seoFactory/deployMonitor'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/content-studio/jobs
 * Query: status, region, host (owner_host), repo (target_repo), limit, q, id, ids
 *
 * List responses intentionally omit heavy columns (content, event_log, audit_json,
 * gsc_json) so the queue can poll without exceeding Worker CPU / response limits.
 * Full row is available via ?id= for the editor.
 */
const JOB_LIST_COLUMNS = [
  'id',
  'user_id',
  'title',
  'topic',
  'content_type',
  'tone',
  'region',
  'status',
  'error_message',
  'target_repo',
  'branch_name',
  'content_path',
  'pr_url',
  'pr_number',
  'ai_provider',
  'word_count',
  'seo_score',
  'primary_keyword',
  'owner_host',
  'canonical_url',
  'ship_mode',
  'indexable',
  'deploy_sha',
  'deployed_at',
  'merged_at',
  'closed_at',
  'created_at',
  'updated_at',
].join(',')

export async function GET(request: NextRequest) {
  try {
    // Check for abort signal (Cloudflare sends this when CPU budget is exhausted)
    if (request.signal.aborted) {
      return NextResponse.json({ error: 'Request aborted', jobs: [], count: 0 }, { status: 503 })
    }

    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (request.signal.aborted) {
      return NextResponse.json({ error: 'Request aborted after auth', jobs: [], count: 0 }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const ids = (searchParams.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const status = searchParams.get('status')
    const region = searchParams.get('region')
    const host = searchParams.get('host') || searchParams.get('owner_host')
    const repo = searchParams.get('repo') || searchParams.get('target_repo')
    const q = (searchParams.get('q') || '').trim()
    // Cap list size — full content is loaded per-job via ?id=
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '40', 10) || 40, 80)
    const includeContent = searchParams.get('full') === '1'

    const supabase = sb()

    if (id) {
      const { data, error } = await supabase.from('content_jobs').select('*').eq('id', id).single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ job: data })
    }

    if (ids.length) {
      const { data, error } = await supabase
        .from('content_jobs')
        .select(includeContent ? '*' : JOB_LIST_COLUMNS)
        .in('id', ids.slice(0, 50))
      if (error) throw new Error(error.message)
      return NextResponse.json({ jobs: data ?? [], count: data?.length ?? 0 })
    }

    // List without content/event_log/audit_json — those blow Worker CPU + payload size
    const selectCols = includeContent ? '*' : JOB_LIST_COLUMNS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('content_jobs')
      .select(selectCols)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      if (status.includes(',')) {
        query = query.in(
          'status',
          status
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean),
        )
      } else {
        query = query.eq('status', status)
      }
    }
    if (region) query = query.eq('region', region)
    if (host) query = query.eq('owner_host', host)
    if (repo) {
      // Avoid leading-wildcard ilike which forces full scan on Free plan CPU
      const safe = repo.replace(/[%_]/g, '').trim()
      if (safe) query = query.ilike('target_repo', `${safe}%`)
    }
    if (q) {
      // Avoid multi-column or() with leading-wildcards which is the #1 CPU hog.
      // Use textSearch (full-text) on topic/title which has natural language.
      // content_path contains file paths like 'landing-page/content/blog/foo.md'
      // and is not suitable for full-text search.
      const safe = q.replace(/[^a-zA-Z0-9\s-]/g, ' ').trim().slice(0, 60)
      if (safe) {
        // Single full-text search on topic (most relevant column for keyword matching)
        const tsquery = safe.split(/\s+/).filter(Boolean).map((w: string) => `${w}:*`).join(' & ')
        query = query.textSearch('topic', tsquery, { config: 'english' })
      }
    }

    const { data, error } = await query
    if (error) throw new Error(`Supabase query failed: ${error.message}`)

    const jobs = (data ?? []) as Array<Record<string, unknown>>

    // Summary for admin queue dashboard
    const byStatus = (s: string) => jobs.filter((j) => j.status === s).length
    const scored = jobs.filter((j) => j.seo_score != null)
    const summary = {
      total: jobs.length,
      drafting: byStatus('drafting'),
      pr_created: byStatus('pr_created'),
      merged: byStatus('merged'),
      failed: byStatus('failed'),
      closed: byStatus('closed'),
      avgSeo:
        scored.length > 0
          ? Math.round(scored.reduce((s, j) => s + Number(j.seo_score), 0) / scored.length)
          : null,
    }

    return NextResponse.json({ jobs, count: jobs.length, summary })
  } catch (err) {
    console.error('[content-studio/jobs]', err)
    // Surface JSON 500/503 so UI can stop retry storms.
    // Without this catch, Cloudflare's edge renders an HTML 503 when the
    // Free-plan CPU budget is exhausted, and the client JSON.parses it →
    // "string did not match the expected pattern".
    const message = err instanceof Error ? err.message : 'Internal error'
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded/i.test(message)
    return NextResponse.json(
      { error: message, jobs: [], count: 0 },
      { status: isCpuTimeout ? 503 : 500 },
    )
  }
}

/**
 * POST /api/content-studio/jobs — bulk admin actions
 * Body: { action: 'bulk_abandon'|'bulk_monitor'|'bulk_approve'|'bulk_reaudit', ids: string[], dryRun? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const action = String(body.action || '').trim()
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 25)
      : []
    if (!action.startsWith('bulk_') || !ids.length) {
      return NextResponse.json(
        { error: 'bulk action and ids[] required (max 25)' },
        { status: 400 },
      )
    }

    const supabase = sb()
    const results: Array<{ id: string; ok: boolean; error?: string; detail?: unknown }> = []

    for (const id of ids) {
      try {
        if (action === 'bulk_abandon') {
          const { error } = await supabase
            .from('content_jobs')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', id)
          if (error) throw error
          results.push({ id, ok: true })
        } else if (action === 'bulk_monitor') {
          const mon = await monitorContentJob(id, {
            openIssueOnFailure: body.openIssue !== false,
            waitMs: 0,
          })
          results.push({ id, ok: mon.ok, detail: mon })
        } else if (action === 'bulk_reaudit') {
          const { data: job } = await supabase.from('content_jobs').select('*').eq('id', id).single()
          if (!job?.content) {
            results.push({ id, ok: false, error: 'no content' })
            continue
          }
          const contentType =
            job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
          const audit = auditContent({
            content: String(job.content),
            contentType,
            primaryKeyword: job.primary_keyword || job.topic,
            indexable: job.indexable !== false,
            ownershipBlockers: [],
          })
          const words = String(job.content).trim().split(/\s+/).filter(Boolean).length
          await supabase
            .from('content_jobs')
            .update({
              seo_score: audit.score,
              word_count: words,
              audit_json: audit,
            })
            .eq('id', id)
          results.push({ id, ok: true, detail: { score: audit.score, words } })
        } else if (action === 'bulk_approve') {
          // Re-use single-job approve path via internal patch semantics
          const { data: job } = await supabase.from('content_jobs').select('*').eq('id', id).single()
          if (!job?.content) {
            results.push({ id, ok: false, error: 'no content' })
            continue
          }
          if (job.status === 'merged') {
            results.push({ id, ok: true, detail: { skipped: 'already merged' } })
            continue
          }
          // Delegate to ship path by calling shipContent
          const contentType =
            job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
          const primaryKeyword = job.primary_keyword || job.topic
          const plan = await resolveOwner({
            primaryKeyword,
            contentType,
            region: job.region || 'US',
            indexable: job.indexable !== false,
          })
          const audit = auditContent({
            content: String(job.content),
            contentType,
            primaryKeyword,
            indexable: plan.indexable,
            ownershipBlockers: plan.blockers,
          })
          try {
            const ship = await shipContent({
              mode: 'autodeploy',
              plan,
              content: String(job.content),
              title: job.title || job.topic,
              region: job.region || 'US',
              contentType,
              primaryKeyword,
              audit,
              dryRun: Boolean(body.dryRun),
              jobId: id,
              humanApproved: true,
            })
            const now = new Date().toISOString()
            const terminal =
              ship.status === 'deployed' || ship.status === 'merged' ? 'merged' : 'pr_created'
            await supabase
              .from('content_jobs')
              .update({
                status: terminal,
                pr_url: ship.prUrl || job.pr_url,
                pr_number: ship.prNumber || job.pr_number,
                branch_name: ship.branch || job.branch_name,
                content_path: ship.path || job.content_path,
                deploy_sha: ship.mergeCommitSha || ship.commitSha || job.deploy_sha,
                deployed_at:
                  ship.status === 'deployed' || ship.status === 'merged' ? now : job.deployed_at,
                merged_at:
                  ship.status === 'deployed' || ship.status === 'merged' ? now : job.merged_at,
                error_message: null,
                ship_mode: 'autodeploy',
                seo_score: audit.score,
                audit_json: audit,
              })
              .eq('id', id)
            if ((ship.status === 'deployed' || ship.status === 'merged') && !body.dryRun) {
              await monitorContentJob(id, { openIssueOnFailure: true, waitMs: 1500 })
            }
            results.push({ id, ok: true, detail: ship })
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'approve failed'
            await supabase
              .from('content_jobs')
              .update({ error_message: msg, status: 'failed' })
              .eq('id', id)
            results.push({ id, ok: false, error: msg })
          }
        } else {
          results.push({ id, ok: false, error: `Unknown bulk action ${action}` })
        }
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : 'failed',
        })
      }
    }

    const okCount = results.filter((r) => r.ok).length
    return NextResponse.json({
      ok: okCount === results.length,
      action,
      processed: results.length,
      succeeded: okCount,
      failed: results.length - okCount,
      results,
    })
  } catch (err) {
    console.error('[content-studio/jobs POST bulk]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk failed' },
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
 * Actions: reship | regenerate | abandon | save | refresh_pr | append_log |
 *          approve | merge_pr | monitor | reaudit | update_meta | duplicate
 *
 * Body: {
 *   id,
 *   action: 'reship'|'regenerate'|'abandon'|'save'|'refresh_pr'|'append_log'|
 *           'approve'|'merge_pr'|'monitor'|'reaudit'|'update_meta'|'duplicate',
 *   content?, title?, shipMode?, minAuditScore?, maxRefine?, dryRun?,
 *   indexable?, region?, primary_keyword?, tone?,
 *   entries?: StudioLogEntry[]  // for append_log
 * }
 *
 * approve — admin reviewed content: commit/merge to main → Cloudflare deploy,
 *           then run CI/deploy monitor (Workers AI diagnosis on failure).
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

    if (action === 'reaudit') {
      // Prefer live editor content when provided so re-audit matches the pane
      const content =
        body.content != null ? String(body.content) : job.content != null ? String(job.content) : ''
      if (!content.trim()) {
        return NextResponse.json({ error: 'Job has no content to audit' }, { status: 400 })
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
      const audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })
      const words = content.trim().split(/\s+/).filter(Boolean).length
      const patch: Record<string, unknown> = {
        seo_score: audit.score,
        word_count: words,
        audit_json: {
          ...audit,
          reauditedAt: new Date().toISOString(),
          model: job.audit_json?.model,
        },
        owner_host: plan.host,
        canonical_url: plan.canonicalUrl,
        content_path: plan.filePath,
        target_repo: plan.repo,
      }
      // Persist editor draft when re-auditing unsaved content
      if (body.content != null) patch.content = content
      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated, audit, plan })
    }

    if (action === 'update_meta') {
      const patch: Record<string, unknown> = {}
      if (body.title != null) patch.title = String(body.title).trim()
      if (body.topic != null) patch.topic = String(body.topic).trim()
      if (body.primary_keyword != null || body.primaryKeyword != null) {
        patch.primary_keyword = String(body.primary_keyword || body.primaryKeyword).trim()
      }
      if (body.region != null) patch.region = String(body.region).toUpperCase()
      if (body.tone != null) patch.tone = String(body.tone)
      if (body.indexable != null) patch.indexable = Boolean(body.indexable)
      if (body.ship_mode != null || body.shipMode != null) {
        const sm = String(body.ship_mode || body.shipMode)
        patch.ship_mode = sm === 'autodeploy' || sm === 'merge' ? 'autodeploy' : 'pr'
      }
      if (body.content_type != null || body.contentType != null) {
        patch.content_type = String(body.content_type || body.contentType)
      }
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: 'No meta fields to update' }, { status: 400 })
      }
      // Re-resolve ownership when routing fields change
      if (
        patch.primary_keyword ||
        patch.region ||
        patch.content_type ||
        patch.indexable != null
      ) {
        try {
          const plan = await resolveOwner({
            primaryKeyword: String(patch.primary_keyword || job.primary_keyword || job.topic),
            contentType: String(
              patch.content_type === 'article'
                ? 'legal_guide'
                : patch.content_type ||
                    (job.content_type === 'article' ? 'legal_guide' : job.content_type) ||
                    'legal_guide',
            ),
            region: String(patch.region || job.region || 'US'),
            indexable: patch.indexable != null ? Boolean(patch.indexable) : job.indexable !== false,
          })
          patch.owner_host = plan.host
          patch.target_repo = plan.repo
          patch.canonical_url = plan.canonicalUrl
          patch.content_path = plan.filePath
          patch.indexable = plan.indexable
        } catch {
          /* keep prior ownership */
        }
      }
      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated })
    }

    if (action === 'duplicate') {
      const { data: created, error: insErr } = await supabase
        .from('content_jobs')
        .insert({
          user_id: userId,
          title: `${job.title || job.topic} (copy)`,
          topic: job.topic,
          content_type: job.content_type,
          tone: job.tone,
          region: job.region,
          target_repo: job.target_repo,
          status: 'drafting',
          slug: job.slug,
          content: job.content,
          content_path: job.content_path,
          ai_provider: job.ai_provider,
          word_count: job.word_count,
          seo_score: job.seo_score,
          ship_mode: job.ship_mode || 'pr',
          indexable: job.indexable,
          canonical_url: job.canonical_url,
          owner_host: job.owner_host,
          primary_keyword: job.primary_keyword,
          audit_json: job.audit_json,
          gsc_json: job.gsc_json,
          error_message: null,
        })
        .select()
        .single()
      if (insErr) throw insErr
      return NextResponse.json({ ok: true, job: created, duplicatedFrom: id })
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
          audit_json: audit
            ? { ...audit, model: job.audit_json?.model }
            : job.audit_json,
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

    if (action === 'monitor') {
      const result = await monitorContentJob(id, {
        openIssueOnFailure: body.openIssue !== false,
        waitMs: body.waitMs != null ? Number(body.waitMs) : 0,
      })
      const { data: refreshed } = await supabase.from('content_jobs').select('*').eq('id', id).single()
      return NextResponse.json({ ok: result.ok, monitor: result, job: refreshed || job })
    }

    if (action === 'merge_pr') {
      const prNumber = job.pr_number
      if (!prNumber) {
        return NextResponse.json({ error: 'Job has no PR to merge' }, { status: 400 })
      }
      const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
      try {
        const merged = await mergePullRequest({
          owner,
          repo,
          prNumber,
          commitTitle: `seo-factory: approve merge "${job.title || job.topic}"`,
        })
        if (!merged.merged) {
          return NextResponse.json(
            { ok: false, error: merged.message || 'Merge rejected', merge: merged },
            { status: 422 },
          )
        }
        const now = new Date().toISOString()
        const { data: updated } = await supabase
          .from('content_jobs')
          .update({
            status: 'merged',
            merged_at: now,
            deployed_at: now,
            deploy_sha: merged.sha || job.deploy_sha,
            error_message: null,
            ship_mode: 'autodeploy',
          })
          .eq('id', id)
          .select()
          .single()

        // Fire-and-watch CI after merge
        const monitor = await monitorContentJob(id, {
          openIssueOnFailure: true,
          waitMs: 2500,
        })
        return NextResponse.json({
          ok: true,
          merge: merged,
          monitor,
          job: updated,
          message: 'Merged to main — Cloudflare deploy should start; monitor ran',
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Merge failed'
        const unresolved = /could not be auto-resolved|forceNewShip/i.test(msg)
        const hint = unresolved
          ? ' — the branch has real file conflicts with main. Resolve on GitHub, or click Approve to force-ship the approved content to main.'
          : ''
        await supabase.from('content_jobs').update({ error_message: msg }).eq('id', id)
        return NextResponse.json({ ok: false, error: msg + hint }, { status: 422 })
      }
    }

    if (action === 'approve' || action === 'reship') {
      // Optional save-before-ship when content provided
      let content = body.content != null ? String(body.content) : job.content
      if (!content?.trim()) {
        return NextResponse.json({ error: 'Job has no content to ship' }, { status: 400 })
      }
      const humanApproved = action === 'approve' || body.humanApproved === true
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
      const primaryKeyword = job.primary_keyword || job.topic
      const plan = await resolveOwner({
        primaryKeyword,
        contentType,
        region: job.region || 'US',
        indexable: job.indexable !== false,
      })
      const audit = auditContent({
        content: String(content),
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })

      // Approve always targets main (direct commit). Reship respects shipMode.
      let shipMode: ShipMode = 'pr'
      if (action === 'approve') {
        shipMode = 'autodeploy'
      } else {
        const requested = String(body.shipMode || job.ship_mode || 'merge').toLowerCase()
        shipMode =
          requested === 'autodeploy' || requested === 'merge'
            ? (requested as ShipMode)
            : requested === 'pr'
              ? 'pr'
              : 'merge'
      }

      try {
        // Persist editor content before ship
        if (body.content != null) {
          await supabase
            .from('content_jobs')
            .update({
              content: String(content),
              word_count: String(content).trim().split(/\s+/).filter(Boolean).length,
              seo_score: audit.score,
              audit_json: audit,
            })
            .eq('id', id)
        }

        // If PR already open and approve → merge that PR instead of new ship.
        // mergePullRequest auto-syncs stale branches; if a real file conflict
        // survives, fall through to forceNewShip (direct main commit) — the
        // admin already approved this content, so don't dead-end the job with
        // "fix on GitHub and retry".
        let mergeFallbackNote: string | null = null
        if (
          humanApproved &&
          job.pr_number &&
          job.status === 'pr_created' &&
          body.forceNewShip !== true
        ) {
          const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
          try {
            const merged = await mergePullRequest({
              owner,
              repo,
              prNumber: job.pr_number,
              commitTitle: `seo-factory: approve "${job.title || job.topic}"`,
            })
            if (merged.merged) {
              const now = new Date().toISOString()
              const { data: updated } = await supabase
                .from('content_jobs')
                .update({
                  status: 'merged',
                  content: String(content),
                  merged_at: now,
                  deployed_at: now,
                  deploy_sha: merged.sha || job.deploy_sha,
                  error_message: null,
                  ship_mode: 'autodeploy',
                  seo_score: audit.score,
                  audit_json: audit,
                })
                .eq('id', id)
                .select()
                .single()
              const monitor = await monitorContentJob(id, {
                openIssueOnFailure: true,
                waitMs: 2500,
              })
              return NextResponse.json({
                ok: true,
                approved: true,
                merge: merged,
                monitor,
                job: updated,
                message: 'Existing PR merged to main · monitor started',
              })
            }
          } catch (mergeErr) {
            const msg = mergeErr instanceof Error ? mergeErr.message : 'PR merge failed'
            console.warn(
              `[content-studio/jobs] approve: PR #${job.pr_number} merge failed after auto-sync, force-shipping to main: ${msg}`,
            )
            mergeFallbackNote =
              `PR #${job.pr_number} had conflicts with main that could not be auto-resolved; ` +
              'approved content was force-shipped directly to main instead.'
          }
        }

        const ship = await shipContent({
          mode: shipMode,
          plan,
          content: String(content),
          title: body.title != null ? String(body.title) : job.title || job.topic,
          region: job.region || 'US',
          contentType,
          primaryKeyword,
          audit,
          dryRun: Boolean(body.dryRun),
          jobId: id,
          humanApproved,
        })
        const now = new Date().toISOString()
        const terminal =
          ship.status === 'deployed' || ship.status === 'merged'
            ? 'merged'
            : ship.status === 'pr_created'
              ? 'pr_created'
              : job.status
        const { data: updated } = await supabase
          .from('content_jobs')
          .update({
            status: terminal,
            content: String(content),
            pr_url: ship.prUrl || job.pr_url,
            pr_number: ship.prNumber || job.pr_number,
            branch_name: ship.branch || job.branch_name,
            content_path: ship.path || job.content_path,
            deploy_sha: ship.mergeCommitSha || ship.commitSha || job.deploy_sha,
            deployed_at:
              ship.status === 'deployed' || ship.status === 'merged' ? now : job.deployed_at,
            merged_at:
              ship.status === 'deployed' || ship.status === 'merged' ? now : job.merged_at,
            error_message: null,
            ship_mode: ship.mode === 'pr' ? 'pr' : 'autodeploy',
            seo_score: audit.score,
            word_count: audit.wordCount,
            audit_json: audit,
          })
          .eq('id', id)
          .select()
          .single()

        let monitor = null
        if (
          (ship.status === 'deployed' || ship.status === 'merged') &&
          !body.dryRun
        ) {
          monitor = await monitorContentJob(id, {
            openIssueOnFailure: true,
            waitMs: 2000,
          })
        }

        return NextResponse.json({
          ok: true,
          approved: humanApproved,
          ship,
          monitor,
          job: updated,
          message:
            (mergeFallbackNote ? `${mergeFallbackNote} ` : '') +
            (ship.status === 'deployed' || ship.status === 'merged'
              ? 'Approved → main · Cloudflare deploy · monitor ran'
              : ship.status === 'pr_created'
                ? 'PR opened (merge blocked — use Approve again or fix branch protection)'
                : 'Ship complete'),
        })
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
        maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
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
