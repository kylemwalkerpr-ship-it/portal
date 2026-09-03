import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { shipContent, mergePullRequest, revertContent, parseRepoSlug, type ShipMode } from '@/lib/seoFactory/ship'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { resolveKeywordContract } from '@/lib/seoFactory/keywordContract'
import { monitorContentJob } from '@/lib/seoFactory/deployMonitor'
import { buildJobSummary } from '@/lib/seoFactory/jobSummary'
import { queueClearSpec, queueMatchedCount, type QueueClearAction } from '@/lib/seoFactory/jobsQueue'
import {
  JOB_BODY_COLUMNS,
  JOB_LINEAGE_COLUMNS,
  JOB_LIST_COLUMNS,
  JOB_MUTATE_COLUMNS,
  JOB_OPEN_COLUMNS,
  jobCompetingPages,
  slimJobForClient,
} from '@/lib/seoFactory/jobColumns'

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
 * Full row is available via ?id= for the editor (never event_log/lineage/audit_json).
 */

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
    // Cap list size — full content is loaded per-job via ?id=. 100 matches
    // the admin queue's claimed window (the UI says "most recent 100").
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '40', 10) || 40, 100)
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)
    const includeContent = searchParams.get('full') === '1'

    const supabase = sb()

    if (id) {
      const bodyOnly = searchParams.get('body') === '1'
      const wantLineage = searchParams.get('lineage') === '1'
      const cols = bodyOnly ? JOB_BODY_COLUMNS : JOB_OPEN_COLUMNS
      const { data, error } = await supabase.from('content_jobs').select(cols).eq('id', id).single()
      if (error) throw new Error(error.message)
      const job = data as unknown as Record<string, unknown>
      if (typeof job.content === 'string' && job.content.length > 400_000) {
        job.content = job.content.slice(0, 400_000)
        job.content_truncated = true
      }
      const lineage: Array<Record<string, unknown>> = []
      if (wantLineage && !bodyOnly) {
        const seen = new Set<string>()
        let current: Record<string, unknown> = {
          id: job.id,
          source_job_id: job.source_job_id,
          title: job.title,
          topic: job.topic,
          status: job.status,
          created_at: job.created_at,
          regeneration_mode: job.regeneration_mode,
          regeneration_reason: job.regeneration_reason,
        }
        for (let depth = 0; depth < 6 && current?.id && !seen.has(String(current.id)); depth++) {
          seen.add(String(current.id))
          lineage.unshift(current)
          const sourceId = String(current.source_job_id || '')
          if (!sourceId) break
          const { data: source } = await supabase.from('content_jobs').select(JOB_LINEAGE_COLUMNS).eq('id', sourceId).maybeSingle()
          if (!source) break
          current = source as unknown as Record<string, unknown>
        }
      }
      return NextResponse.json(
        { job: slimJobForClient(job), lineage },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
      )
    }

    if (ids.length) {
      const { data, error } = await supabase
        .from('content_jobs')
        .select(includeContent ? '*' : JOB_LIST_COLUMNS)
        .in('id', ids.slice(0, 50))
      if (error) throw new Error(error.message)
      return NextResponse.json({ jobs: data ?? [], count: data?.length ?? 0 })
    }

    // Real total count — the #1 complaint was "the queue always shows 40 jobs".
    // The list was capped at limit with count = rows.length, so the true table
    // size was never surfaced. Query an exact head count (cheap, no row bodies)
    // plus a status-only pass so the summary counters reflect the whole table,
    // not just the returned window.
    let total = 0
    const statusTotals: Record<string, number> = {}
    try {
      const [exactRes, statusRes] = await Promise.all([
        supabase.from('content_jobs').select('id', { count: 'exact', head: true }),
        supabase.from('content_jobs').select('status').limit(5000),
      ])
      total = typeof exactRes.count === 'number' ? exactRes.count : 0
      const rows = (statusRes.data ?? []) as Array<{ status?: string | null }>
      for (const r of rows) {
        const s = String(r.status || 'unknown')
        statusTotals[s] = (statusTotals[s] || 0) + 1
      }
    } catch {
      total = 0 // count failure must never fail the list
    }

    // List without content/event_log/audit_json — those blow Worker CPU + payload size
    const selectCols = includeContent ? '*' : JOB_LIST_COLUMNS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('content_jobs')
      .select(selectCols)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

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

    // Summary for admin queue dashboard — totals are the REAL table counts
    // (query-level aggregates) rather than the window that was returned, so
    // the queue never lies about how many jobs exist.
    // buildJobSummary filters null scores itself — the guard lives in one place.
    const summary = buildJobSummary({
      total,
      window: jobs.length,
      statusTotals,
      scored: jobs,
    })
    const matched = queueMatchedCount(status, statusTotals, total)

    return NextResponse.json({
      jobs,
      count: jobs.length,
      total,
      matched,
      hasMore: offset + jobs.length < matched,
      offset,
      limit,
      summary,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
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
 * Body: {
 *   action: 'bulk_abandon'|'bulk_monitor'|'bulk_approve'|'bulk_reaudit'|
 *           'clear_drafts'|'clear_stuck'|'clear_failed'|'rerun_resume'|
 *           'refresh_pr'|'bulk_delete'|'archive_resolved',
 *   ids: string[],
 *   dryRun?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const action = String(body.action || '').trim()
    const rawIds: string[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean)
      : []
    const idCap = action === 'bulk_delete' || action === 'bulk_abandon' || action === 'clear_failed' || action === 'clear_drafts' || action === 'clear_stuck'
      ? 500
      : 25
    const ids = rawIds.slice(0, idCap)

    // Accept both old-style 'bulk_*' and new-style queue maintenance actions.
    // Status-scoped ops (clear_*, archive_*) are allowed without explicit ids
    // when their target filter resolves rows from the DB directly.
    const isBulk = action.startsWith('bulk_')
    const isQueueAction =
      action === 'clear_drafts' ||
      action === 'clear_stuck' ||
      action === 'clear_failed' ||
      action === 'rerun_resume' ||
      action === 'refresh_pr' ||
      action === 'bulk_delete' ||
      action === 'archive_resolved'
    if (!isBulk && !isQueueAction) {
      return NextResponse.json(
        { error: 'Unknown action. Supported: bulk_abandon, bulk_monitor, bulk_approve, bulk_reaudit, clear_drafts, clear_stuck, clear_failed, rerun_resume, refresh_pr, bulk_delete, archive_resolved' },
        { status: 400 },
      )
    }
    if (!ids.length && isBulk) {
      return NextResponse.json(
        { error: 'bulk action requires ids[] (max 25)' },
        { status: 400 },
      )
    }

    const supabase = sb()

    // ── Status-scoped actions: operate on entire status buckets ──
    if (action === 'clear_drafts' || action === 'clear_stuck' || action === 'clear_failed') {
      const now = new Date().toISOString()
      const spec = queueClearSpec(action as QueueClearAction)
      const statusFilter = [...spec.statuses]

      // Failed jobs are purged (DELETE) so they leave the queue and the desk
      // count. Drafts/stuck are closed so they can still be inspected.
      // One statement for the whole bucket — a per-row loop of 62+ jobs blows
      // the Worker subrequest budget and the confirm click 500s.
      if (action === 'clear_failed') {
        let q = supabase.from('content_jobs').delete().in('status', statusFilter)
        if (ids.length) q = q.in('id', ids)
        const { data, error } = await q.select('id')
        if (error) {
          return NextResponse.json(
            { ok: false, action, error: error.message, processed: 0, succeeded: 0, failed: 0 },
            { status: 422 },
          )
        }
        const processed = Array.isArray(data) ? data.length : 0
        return NextResponse.json({
          ok: true,
          action,
          message: processed
            ? `Removed ${processed} failed job(s) from the queue`
            : 'No failed jobs to clear',
          processed,
          succeeded: processed,
          failed: 0,
          results: [],
        })
      }

      let q = supabase
        .from('content_jobs')
        .update({ status: 'closed', closed_at: now })
        .in('status', statusFilter)
      if (spec.staleBefore) q = q.lt('updated_at', spec.staleBefore)
      if (ids.length) q = q.in('id', ids)

      const { data, error } = await q.select('id')
      if (error) {
        return NextResponse.json(
          { ok: false, action, error: error.message, processed: 0, succeeded: 0, failed: 0 },
          { status: 422 },
        )
      }
      const processed = Array.isArray(data) ? data.length : 0
      return NextResponse.json({
        ok: true,
        action,
        message: processed
          ? `Abandoned ${processed} job(s) from [${statusFilter.join(', ')}]`
          : `No jobs in [${statusFilter.join(', ')}] to clear`,
        processed,
        succeeded: processed,
        failed: 0,
        results: [],
      })
    }

    // ── Archive: move closed/merged jobs to content_jobs_archive ──
    if (action === 'archive_resolved') {
      const now = new Date().toISOString()
      const sourceIds = ids.length
        ? ids
        : (await supabase
            .from('content_jobs')
            .select('id')
            .in('status', ['closed', 'merged'])
            .order('created_at', { ascending: false })
            .limit(500)
            .then((r) => (r.data ?? []).map((j: { id: string }) => j.id)))

      if (!sourceIds.length) {
        return NextResponse.json({
          ok: true, action,
          message: 'No resolved (closed/merged) jobs to archive',
          processed: 0, succeeded: 0, failed: 0, results: [],
        })
      }

      // Try to insert into archive, then delete from source
      const results: Array<{ id: string; ok: boolean; error?: string }> = []
      for (const jid of sourceIds.slice(0, 500)) {
        try {
          const { data: job } = await supabase.from('content_jobs').select('*').eq('id', jid).single()
          if (!job) { results.push({ id: jid, ok: false, error: 'not found' }); continue }

          // Insert into archive (ignore if table doesn't exist yet — soft-fail)
          try {
            await supabase.from('content_jobs_archive').insert({
              ...job,
              archived_at: now,
            })
          } catch {
            // archive table may not exist yet — skip insert, still delete from source
          }

          const { error: delErr } = await supabase.from('content_jobs').delete().eq('id', jid)
          if (delErr) throw delErr
          results.push({ id: jid, ok: true })
        } catch (e) {
          results.push({ id: jid, ok: false, error: e instanceof Error ? e.message : 'archive failed' })
        }
      }

      const okCount = results.filter((r) => r.ok).length
      return NextResponse.json({
        ok: okCount === results.length,
        action,
        message: `Archived ${okCount}/${results.length} resolved jobs`,
        processed: results.length, succeeded: okCount,
        failed: results.length - okCount, results,
      })
    }

    // ── Hard delete (admin-only purge) ──
    if (action === 'bulk_delete') {
      if (!ids.length) {
        return NextResponse.json(
          { ok: false, action, error: 'bulk_delete requires ids[]', processed: 0, succeeded: 0, failed: 0 },
          { status: 400 },
        )
      }
      const { data, error } = await supabase.from('content_jobs').delete().in('id', ids).select('id')
      if (error) {
        return NextResponse.json(
          { ok: false, action, error: error.message, processed: 0, succeeded: 0, failed: ids.length },
          { status: 422 },
        )
      }
      const processed = Array.isArray(data) ? data.length : 0
      return NextResponse.json({
        ok: true,
        action,
        message: `Deleted ${processed} job(s) from the queue`,
        processed,
        succeeded: processed,
        failed: 0,
        results: (data ?? []).map((r: { id: string }) => ({ id: r.id, ok: true })),
      })
    }

    // ── Bulk rerun (regenerate per-id) ──
    if (action === 'rerun_resume') {
      const results: Array<{ id: string; ok: boolean; error?: string; newJobId?: string }> = []
      for (const jid of ids.slice(0, 10)) {
        try {
          const { data: job } = await supabase.from('content_jobs').select('*').eq('id', jid).single()
          if (!job) { results.push({ id: jid, ok: false, error: 'not found' }); continue }
          const userId = job.user_id || 'admin'
          // Always derive primaryKeyword from topic (source of truth).
          const result = await runSeoFactoryPipeline({
            topic: job.topic,
            title: job.title || job.topic,
            primaryKeyword: job.topic || job.primary_keyword || job.topic,
            region: job.region || 'US',
            contentType: job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide',
            tone: job.tone || 'educational',
            shipMode: (job.ship_mode || 'pr') as any,
            dryRun: Boolean(body.dryRun),
            minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 55,
            maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
            userId,
            existingJobId: jid,
            resumeContent: job.content ? String(job.content) : undefined,
            regenerationMode: 'refresh',
          })
          results.push({ id: jid, ok: result.ok, newJobId: result.jobId || undefined, error: result.shipError })
        } catch (e) {
          results.push({ id: jid, ok: false, error: e instanceof Error ? e.message : 'regenerate failed' })
        }
      }
      const okCount = results.filter((r) => r.ok).length
      return NextResponse.json({ ok: okCount === results.length, action, processed: results.length, succeeded: okCount, failed: results.length - okCount, results })
    }

    // ── Bulk refresh PR ──
    if (action === 'refresh_pr') {
      const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
      const results: Array<{ id: string; ok: boolean; error?: string }> = []
      for (const jid of ids.slice(0, 25)) {
        try {
          const { data: job } = await supabase.from('content_jobs').select('*').eq('id', jid).single()
          if (!job?.pr_number) { results.push({ id: jid, ok: true }); continue }
          const repo = String(job.target_repo || '').replace(/^https?:\/\/github\.com\//, '')
          if (!repo.includes('/') || !token) { results.push({ id: jid, ok: true }); continue }
          const [owner, name] = repo.split('/')
          const ghRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${job.pr_number}`, {
            headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'yousafe-portal-seo-factory' },
          })
          if (!ghRes.ok) { results.push({ id: jid, ok: false, error: `GitHub ${ghRes.status}` }); continue }
          const pr = await ghRes.json()
          const patch: Record<string, unknown> = { pr_url: pr.html_url || job.pr_url }
          if (pr.merged) { patch.status = 'merged'; patch.merged_at = pr.merged_at || new Date().toISOString(); patch.error_message = null }
          else if (pr.state === 'closed' && !pr.merged) { patch.status = 'closed'; patch.closed_at = new Date().toISOString() }
          await supabase.from('content_jobs').update(patch).eq('id', jid)
          results.push({ id: jid, ok: true })
        } catch (e) {
          results.push({ id: jid, ok: false, error: e instanceof Error ? e.message : 'PR refresh failed' })
        }
      }
      const okCount = results.filter((r) => r.ok).length
      return NextResponse.json({ ok: okCount === results.length, action, processed: results.length, succeeded: okCount, failed: results.length - okCount, results })
    }

    if (action === 'bulk_abandon') {
      if (!ids.length) {
        return NextResponse.json(
          { ok: false, action, error: 'bulk_abandon requires ids[]', processed: 0, succeeded: 0, failed: 0 },
          { status: 400 },
        )
      }
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('content_jobs')
        .update({ status: 'closed', closed_at: now })
        .in('id', ids)
        .select('id')
      if (error) {
        return NextResponse.json(
          { ok: false, action, error: error.message, processed: 0, succeeded: 0, failed: ids.length },
          { status: 422 },
        )
      }
      const processed = Array.isArray(data) ? data.length : 0
      return NextResponse.json({
        ok: true,
        action,
        message: `Abandoned ${processed} job(s)`,
        processed,
        succeeded: processed,
        failed: 0,
        results: (data ?? []).map((r: { id: string }) => ({ id: r.id, ok: true })),
      })
    }

    // ── Legacy bulk_* actions (id-level, max 25) ──
    const results: Array<{ id: string; ok: boolean; error?: string; detail?: unknown }> = []

    for (const id of ids) {
      try {
        if (action === 'bulk_monitor') {
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
          const words = countBodyWords(String(job.content))
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
            // Feed the brief's gate inputs through the full ship path: the
            // keyword-coverage gate and cannibalization repair only fire when
            // these are present, and the studio approve route is the LAST
            // place the brief requirements can reach shipContent. Legacy rows
            // with empty arrays are healed from their primary keyword and the
            // completed contract is persisted before approval.
            const {
              requiredShortKeywords, requiredLongTailKeywords, backfilled,
              shortKeywordTerms, longTailKeywordTerms,
            } = resolveKeywordContract({
              primaryKeyword, topic: job.topic,
              requiredShortKeywords: job.required_short_keywords,
              requiredLongTailKeywords: job.required_long_tail_keywords,
              shortKeywordTerms: (job as Record<string, unknown>).short_keyword_terms,
              longTailKeywordTerms: (job as Record<string, unknown>).long_tail_keyword_terms,
            })
            if (backfilled) {
              await supabase.from('content_jobs').update({ required_short_keywords: requiredShortKeywords, required_long_tail_keywords: requiredLongTailKeywords, short_keyword_terms: shortKeywordTerms, long_tail_keyword_terms: longTailKeywordTerms }).eq('id', id)
            }
            const competingUrls = jobCompetingPages(job as Record<string, unknown>)
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
              requiredShortKeywords,
              requiredLongTailKeywords,
              // Synthesized backfill must not refuse a human-approved ship.
              shortKeywordTerms,
              longTailKeywordTerms,
              competingUrls,
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
            // Structured rhythm-refusal detail so the ship dialog can render
            // the exact repeated opener + count instead of a generic failure.
            const rm = msg.match(/sentence_start_repetition \((\d+)× "([^"]+)…"\) exceeds the deterministic repair's clearing range/)
            if (rm) {
              results.push({
                id,
                ok: false,
                error: msg,
                detail: {
                  code: 'rhythm_beyond_repair',
                  rhythmKey: rm[2],
                  rhythmCount: Number(rm[1]),
                  message: msg,
                },
              })
            } else {
              results.push({ id, ok: false, error: msg })
            }
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
 *          approve | merge_pr | close_pr | monitor | reaudit | update_meta | duplicate
 *
 * Body: {
 *   id,
 *   action: 'reship'|'regenerate'|'abandon'|'save'|'refresh_pr'|'append_log'|
 *           'approve'|'merge_pr'|'close_pr'|'monitor'|'reaudit'|'update_meta'|'duplicate',
 *   content?, title?, shipMode?, minAuditScore?, maxRefine?, dryRun?,
 *   indexable?, region?, primary_keyword?, tone?,
 *   entries?: StudioLogEntry[]  // for append_log
 * }
 *
 * approve   — admin reviewed content: commit/merge to main → Cloudflare deploy,
 *             then run CI/deploy monitor (Workers AI diagnosis on failure).
 * merge_pr  — merge the open GitHub PR head into main (no regenerate).
 * close_pr  — decline the open PR: PATCH /pulls/:n { state: 'closed' } + status='closed'.
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
    const mutateCols = action === 'append_log' ? 'id,event_log' : JOB_MUTATE_COLUMNS
    const { data: jobRow, error } = await supabase.from('content_jobs').select(mutateCols).eq('id', id).single()
    if (error || !jobRow) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    const job = jobRow as unknown as Record<string, any>

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
        .select(JOB_OPEN_COLUMNS)
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated })
    }

    if (action === 'revert') {
      // Rollback a merged/live change: restore the shipped file to its
      // pre-ship state (or delete it if it was net-new) via a PR→CI→merge.
      if (job.status !== 'merged' && job.status !== 'deployed' && !job.content_path) {
        return NextResponse.json(
          { error: 'Only merged jobs with a shipped file path can be reverted' },
          { status: 400 },
        )
      }
      const deploySha = String(job.deploy_sha || job.merge_commit_sha || '').trim()
      if (!deploySha) {
        return NextResponse.json(
          { error: 'Job has no deploy SHA to revert — cannot determine the pre-ship state' },
          { status: 400 },
        )
      }
      const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
      if (!repo) {
        return NextResponse.json({ error: 'Job has no target repo' }, { status: 400 })
      }
      try {
        const revert = await revertContent({
          owner,
          repo,
          path: String(job.content_path),
          deploySha,
          title: job.title || job.topic || String(job.content_path),
          dryRun: Boolean(body.dryRun),
        })
        const now = new Date().toISOString()
        const patch: Record<string, unknown> = {
          status: revert.status === 'reverted' ? 'closed' : job.status,
          closed_at: revert.status === 'reverted' ? now : job.closed_at,
          error_message:
            revert.status === 'reverted'
              ? `Rollback merged: ${revert.note || 'reverted to pre-ship state'} (${revert.action})`
              : job.error_message,
          last_failure_kind: null,
        }
        const { data: updated, error: upErr } = await supabase
          .from('content_jobs')
          .update(patch)
          .eq('id', id)
          .select(JOB_OPEN_COLUMNS)
          .single()
        if (upErr) throw upErr
        // Audit event for the operator timeline.
        try {
          const prevLog = Array.isArray(job.event_log) ? job.event_log : []
          const next = [
            ...prevLog.slice(-200),
            {
              id: `revert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              ts: Date.now(),
              level: revert.status === 'reverted' ? 'success' : 'warn',
              source: 'admin:revert',
              message:
                revert.status === 'reverted'
                  ? `Rollback merged — ${revert.action} ${revert.path} (PR #${revert.prNumber ?? '?'})`
                  : `Rollback PR open — ${revert.note || 'merge pending'}`,
              detail: `owner=${owner} repo=${repo} deploySha=${deploySha.slice(0, 7)} action=${revert.action}`,
            },
          ]
          await supabase.from('content_jobs').update({ event_log: next }).eq('id', id)
        } catch { /* event log is best-effort */ }
        if (revert.status === 'reverted' && !body.dryRun) {
          await monitorContentJob(id, { openIssueOnFailure: true, waitMs: 1500 })
        }
        return NextResponse.json({
          ok: true,
          revert,
          job: updated,
          message:
            revert.status === 'reverted'
              ? `Rollback merged — ${revert.action === 'deleted' ? 'deleted' : 'restored'} ${revert.path}`
              : revert.note || 'Rollback PR opened',
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Rollback failed'
        await supabase.from('content_jobs').update({ error_message: msg }).eq('id', id)
        return NextResponse.json({ ok: false, error: msg }, { status: 502 })
      }
    }

    if (action === 'reaudit') {
      // Prefer live editor content when provided so re-audit matches the pane
      let content =
        body.content != null ? String(body.content) : job.content != null ? String(job.content) : ''
      if (!content.trim()) {
        return NextResponse.json({ error: 'Job has no content to audit' }, { status: 400 })
      }
      // Deterministic compliance repair — a missing disclaimer / broken TOC
      // clears on this run instead of blocking the ship gate forever.
      const repaired = applyDeterministicRepairs({
        content,
        title: job.title || job.topic,
        primaryKeyword: job.primary_keyword || job.topic,
        region: job.region || 'US',
      })
      content = repaired.content
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
      const words = countBodyWords(content)
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
      // Persist editor draft when re-auditing unsaved content, and ALWAYS
      // persist deterministic repairs so stored content matches the audit (a
      // repaired disclaimer/TOC must not live only in the response).
      if (body.content != null || repaired.applied.length > 0) patch.content = content
      const reauditReady = evaluateContentQuality({
        content,
        contentType,
        primaryKeyword,
        indexable: job.indexable !== false,
        region: job.region || 'US',
      })
      if (reauditReady.ok) {
        patch.error_message = null
        patch.indexable = true
        if (job.status === 'failed') patch.status = 'drafting'
      }
      const { data: updated, error: upErr } = await supabase
        .from('content_jobs')
        .update(patch)
        .eq('id', id)
        .select(JOB_OPEN_COLUMNS)
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated, audit, plan, appliedRepairs: repaired.applied })
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
        .select(JOB_OPEN_COLUMNS)
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
        .select(JOB_OPEN_COLUMNS)
        .single()
      if (insErr) throw insErr
      return NextResponse.json({ ok: true, job: created, duplicatedFrom: id })
    }

    if (action === 'save') {
      const rawContent = body.content != null ? String(body.content) : job.content
      if (rawContent == null || !String(rawContent).trim()) {
        return NextResponse.json({ error: 'content required' }, { status: 400 })
      }
      // Respect content_type override from request body so callers can
      // switch a job from article → blog_post in one save call.
      if (body.content_type || body.contentType) {
        job.content_type = String(body.content_type || body.contentType)
      }
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
      const primaryKeyword = job.primary_keyword || job.topic
      // Deterministic compliance repair on save so the stored draft matches
      // what the ship gate requires — the blocker clears on the next run.
      const repaired = applyDeterministicRepairs({
        content: String(rawContent),
        title: job.title || job.topic,
        primaryKeyword,
        region: job.region || 'US',
        indexable: job.indexable !== false,
        contentType,
      })
      const content = repaired.content
      const title = body.title != null ? String(body.title).trim() : job.title
      const words = countBodyWords(String(content))
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
          content_type: job.content_type,
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
        .select(JOB_OPEN_COLUMNS)
        .single()
      if (upErr) throw upErr
      return NextResponse.json({ ok: true, job: updated, audit, appliedRepairs: repaired.applied })
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
        .select(JOB_OPEN_COLUMNS)
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
      // NOTE: this path does NOT re-run shipContent gates — it merges the
      // existing reviewed PR head into main exactly as-is (content already
      // passed the gate stack when the PR was opened).
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
          .select(JOB_OPEN_COLUMNS)
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

    if (action === 'close_pr') {
      // Reject the open PR on GitHub + mark the job closed locally.
      // Safe to call when the PR is already closed: GitHub returns 422 but we
      // still reconcile the local status so the operator doesn't need to do it.
      const prNumber = job.pr_number
      if (!prNumber) {
        return NextResponse.json({ error: 'Job has no PR to close' }, { status: 400 })
      }
      const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
      const now = new Date().toISOString()
      const supabase2 = sb()
      let ghState: string | null = null
      let ghMerged: boolean | null = null
      try {
        const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
        if (!token) {
          return NextResponse.json(
            { ok: false, error: 'GITHUB_TOKEN not configured — cannot close remote PR' },
            { status: 503 },
          )
        }
        const headers = ghHeaders(token)
        const resp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'closed' }),
          },
        )
        const text = await resp.text().catch(() => '')
        if (!resp.ok) {
          // If GitHub says it's already closed (422) we still proceed locally.
          const already = resp.status === 422 || /already closed/i.test(text)
          if (!already) {
            await supabase2
              .from('content_jobs')
              .update({ error_message: `Close PR failed: GitHub ${resp.status} — ${text.slice(0, 200)}` })
              .eq('id', id)
            return NextResponse.json(
              { ok: false, error: `GitHub ${resp.status}: ${text.slice(0, 200)}` },
              { status: 502 },
            )
          }
        } else {
          const body = (text ? JSON.parse(text) : {}) as {
            state?: string
            merged?: boolean
            merged_at?: string | null
          }
          ghState = body.state || 'closed'
          ghMerged = Boolean(body.merged)
        }
        // Reconcile: if GitHub reports the PR was actually merged, prefer 'merged'.
        const finalStatus = ghMerged ? 'merged' : 'closed'
        const patch: Record<string, unknown> = {
          status: finalStatus,
          closed_at: finalStatus === 'closed' ? now : job.closed_at,
          merged_at:
            finalStatus === 'merged'
              ? (job.merged_at || now)
              : job.merged_at,
          error_message:
            finalStatus === 'merged'
              ? null
              : 'PR closed on GitHub from Content Studio — job was rejected by admin.',
          last_failure_kind: 'github_merge',
        }
        const { data: updated, error: upErr } = await supabase2
          .from('content_jobs')
          .update(patch)
          .eq('id', id)
          .select(JOB_OPEN_COLUMNS)
          .single()
        if (upErr) throw upErr
        // Append an audit event for the operator timeline.
        try {
          const prevLog = Array.isArray(job.event_log) ? job.event_log : []
          const next = [
            ...prevLog.slice(-200),
            {
              id: `close-pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              ts: Date.now(),
              level: 'warn',
              source: 'admin:close_pr',
              message:
                finalStatus === 'merged'
                  ? `Close clicked but PR was already merged on GitHub — synced status to merged`
                  : `PR #${prNumber} closed on GitHub · job set to ${finalStatus}`,
              detail: `owner=${owner} repo=${repo} pr=${prNumber}`,
            },
          ]
          await supabase2
            .from('content_jobs')
            .update({ event_log: next })
            .eq('id', id)
        } catch {
          /* event_log may not exist yet; harmless */
        }
        return NextResponse.json({
          ok: true,
          closed: finalStatus === 'closed',
          merged: finalStatus === 'merged',
          pr_state: ghState,
          job: updated,
          message:
            finalStatus === 'merged'
              ? 'PR was already merged on GitHub — status synced to merged.'
              : `PR #${prNumber} closed on GitHub · status set to closed.`,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Close PR failed'
        await supabase2
          .from('content_jobs')
          .update({ error_message: msg })
          .eq('id', id)
        return NextResponse.json({ ok: false, error: msg }, { status: 422 })
      }
    }

    if (action === 'approve' || action === 'reship') {
      // Optional save-before-ship when content provided
      let content = body.content != null ? String(body.content) : job.content
      if (!content?.trim()) {
        return NextResponse.json({ error: 'Job has no content to ship' }, { status: 400 })
      }
      // Respect overrides from request body
      if (body.content_type || body.contentType) {
        job.content_type = String(body.content_type || body.contentType)
      }
      if (body.primary_keyword || body.primaryKeyword) {
        job.primary_keyword = String(body.primary_keyword || body.primaryKeyword)
      }
      if (body.region) {
        job.region = String(body.region)
      }
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
      const primaryKeyword = job.primary_keyword || job.topic
      const {
        requiredShortKeywords, requiredLongTailKeywords, backfilled,
        shortKeywordTerms, longTailKeywordTerms,
      } = resolveKeywordContract({
        primaryKeyword, topic: job.topic,
        requiredShortKeywords: job.required_short_keywords,
        requiredLongTailKeywords: job.required_long_tail_keywords,
        shortKeywordTerms: (job as Record<string, unknown>).short_keyword_terms,
        longTailKeywordTerms: (job as Record<string, unknown>).long_tail_keyword_terms,
      })
      if (backfilled) {
        await supabase.from('content_jobs').update({ required_short_keywords: requiredShortKeywords, required_long_tail_keywords: requiredLongTailKeywords, short_keyword_terms: shortKeywordTerms, long_tail_keyword_terms: longTailKeywordTerms }).eq('id', id)
        job.required_short_keywords = requiredShortKeywords
        job.required_long_tail_keywords = requiredLongTailKeywords
      }
      const competingUrls = jobCompetingPages(job as Record<string, unknown>)
      // Deterministic compliance repair before ship — never let a missing
      // disclaimer or broken TOC block a human-approved delivery.
      const shipRepair = applyDeterministicRepairs({
        content: String(content),
        title: job.title || job.topic,
        primaryKeyword,
        region: job.region || 'US',
        indexable: job.indexable !== false,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        competingUrls,
        targetUrl: job.canonical_url ? String(job.canonical_url) : undefined,
      })
      content = shipRepair.content
      const humanApproved = action === 'approve' || body.humanApproved === true
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
        requiredShortKeywords,
        requiredLongTailKeywords,
        shortKeywordTerms,
        longTailKeywordTerms,
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
              word_count: countBodyWords(String(content)),
              seo_score: audit.score,
              audit_json: audit,
            })
            .eq('id', id)
        }

        // If PR already open and approve sent NO editor body → merge that PR.
        // When the editor sent `content`, ship the gated buffer instead of
        // merging the (possibly stale) GitHub file that was opened on first draft.
        let mergeFallbackNote: string | null = null
        if (
          humanApproved &&
          job.pr_number &&
          job.status === 'pr_created' &&
          body.forceNewShip !== true &&
          body.content == null
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
                .select(JOB_OPEN_COLUMNS)
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
          requiredShortKeywords,
          requiredLongTailKeywords,
          // Synthesized backfill must not refuse a human-approved ship.
          shortKeywordTerms,
          longTailKeywordTerms,
          competingUrls,
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
          .select(JOB_OPEN_COLUMNS)
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
      // Always derive primaryKeyword from topic (the source of truth).
      // job.primary_keyword may be stale from an earlier keyword-research
      // pass that no longer matches the title/topic.
      const result = await runSeoFactoryPipeline({
        topic: job.topic,
        title: job.title || job.topic,
        primaryKeyword: job.topic || job.primary_keyword || job.topic,
        region: job.region || 'US',
        contentType:
          job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide',
        tone: job.tone || 'educational',
        shipMode: (body.shipMode || 'pr') as any,
        dryRun: Boolean(body.dryRun),
        minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 55,
        maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
        userId,
        existingJobId: id,
        resumeContent: job.content ? String(job.content) : undefined,
        regenerationMode: 'refresh',
      })

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

/**
 * DELETE /api/content-studio/jobs?id=<uuid> — hard-delete a single job.
 * Also supports ?status=closed,merged for bulk cleanup (admin only).
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const supabase = sb()

    if (id) {
      const { error } = await supabase.from('content_jobs').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true, deleted: id })
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (!statuses.length) {
        return NextResponse.json({ error: 'status parameter requires at least one value' }, { status: 400 })
      }
      const { error, count } = await supabase
        .from('content_jobs')
        .delete({ count: 'exact' })
        .in('status', statuses)
      if (error) throw error
      return NextResponse.json({ ok: true, deleted: count ?? 0, statuses })
    }

    return NextResponse.json({ error: 'id or status parameter required' }, { status: 400 })
  } catch (err) {
    console.error('[content-studio/jobs DELETE]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 },
    )
  }
}
