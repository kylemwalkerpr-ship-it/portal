/**
 * Weekly rhythm-scan engine — the scheduled job that finds drafts whose
 * `sentence_start_repetition` slipped through the gate before it counted list
 * items / before the deterministic repair existed.
 *
 * Design decisions:
 * - Uses the REAL gate (evaluateContentQuality) — the scan can never drift
 *   from what the shipped audit enforces (including the URL-source exclusion).
 * - Read-only on content_jobs: the cron never mutates production drafts.
 *   Remediation stays an admin action (open draft → Re-audit / Fix all
 *   warnings), which is the established flow.
 * - Each run persists one row per flagged draft in `content_rhythm_alerts`
 *   (unique on job_id+run_ts), plus a mission_log entry for the audit trail.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'

export interface RhythmAlert {
  id: string
  job_id: string
  title: string | null
  status: string | null
  content_type: string | null
  region: string | null
  primary_keyword: string | null
  rhythm_key: string
  count: number
  severity: string
  /** True when the deterministic repair fully clears the warning (one-click fix). */
  remediable: boolean
  run_ts: string
}

const stripFrontMatter = (content: string) =>
  String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

/** Run one rhythm scan over stored drafts (latest `limit` with content). */
export async function runRhythmScan(opts: { limit?: number; maxRows?: number } = {}): Promise<{
  scanned: number
  flagged: number
  remediable: number
  alerts: RhythmAlert[]
  errors: string[]
}> {
  const limit = opts.limit ?? 500
  const maxRows = opts.maxRows ?? 100
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('content_jobs')
    .select('id, title, status, content_type, region, primary_keyword, content')
    .not('content', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) {
    return { scanned: 0, flagged: 0, remediable: 0, alerts: [], errors: [`content_jobs query failed: ${error.message}`] }
  }
  const rows = (data || []) as Array<{
    id: string
    title?: string | null
    status?: string | null
    content_type?: string | null
    region?: string | null
    primary_keyword?: string | null
    content?: string | null
  }>

  const runTs = new Date().toISOString()
  const alerts: RhythmAlert[] = []
  const errors: string[] = []

  for (const row of rows) {
    const content = String(row.content || '')
    if (content.trim().length < 80) continue
    // Non-markdown drafts (rich-text export with <p>/<div> wrappers, or full
    // TSX page exports with import/export + JSX) are not prose rhythm — the
    // gate fires on the tag/JSX prefix, which the deterministic repair cannot
    // and should not rewrite. Skip them so the alert list stays honest (same
    // categorization as scripts/scan-draft-rhythm).
    const bodyHead = stripFrontMatter(content).slice(0, 6000)
    if (
      /<\s*(?:p|div|h[1-6]|li)\b/i.test(bodyHead) ||
      /^\s*import\s+[^\n]+from\s+["'][^"']+["']\s*;?\s*$/.test(stripFrontMatter(content).slice(0, 2000)) ||
      /export\s+(?:const\s+metadata|default\s+function|async\s+function)/.test(bodyHead)
    ) {
      continue
    }
    let hit: { key: string; count: number; severity: string } | null = null
    try {
      const gate = evaluateContentQuality({
        content,
        contentType: row.content_type || 'article',
        primaryKeyword: row.primary_keyword || '',
        indexable: true,
      })
      const f = [...gate.blockers, ...gate.warnings].find((x) => x.code === 'sentence_start_repetition')
      if (f) {
        const count = Number((f.message.match(/(\d+)×/) || [])[1]) || 5
        hit = { key: String(f.evidence || '?'), count, severity: f.severity }
      }
    } catch (e) {
      errors.push(`gate failed for ${row.id}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    if (!hit) continue

    // Determine remediability WITHOUT writing: run the deterministic repair
    // off to the side and re-check the gate.
    let remediable = false
    try {
      const repaired = applyDeterministicRepairs({
        content,
        contentType: row.content_type || 'article',
        primaryKeyword: row.primary_keyword || '',
        title: row.title || '',
        region: row.region || '',
      })
      const after = evaluateContentQuality({
        content: repaired.content,
        contentType: row.content_type || 'article',
        primaryKeyword: row.primary_keyword || '',
        indexable: true,
      })
      remediable = ![...after.blockers, ...after.warnings].some((x) => x.code === 'sentence_start_repetition')
    } catch {
      remediable = false
    }

    alerts.push({
      id: `${row.id}:${runTs}`,
      job_id: row.id,
      title: row.title || null,
      status: row.status || null,
      content_type: row.content_type || null,
      region: row.region || null,
      primary_keyword: row.primary_keyword || null,
      rhythm_key: hit.key,
      count: hit.count,
      severity: hit.severity,
      remediable,
      run_ts: runTs,
    })
  }

  // Persist the alerts for this run (one row per job per run).
  if (alerts.length) {
    const { error: insErr } = await supabase.from('content_rhythm_alerts').insert(
      alerts.slice(0, maxRows).map((a) => ({
        job_id: a.job_id,
        title: a.title,
        status: a.status,
        content_type: a.content_type,
        region: a.region,
        primary_keyword: a.primary_keyword,
        rhythm_key: a.rhythm_key,
        count: a.count,
        severity: a.severity,
        remediable: a.remediable,
        run_ts: a.run_ts,
      })),
    )
    if (insErr) errors.push(`alert insert failed: ${insErr.message}`)
  }

  // Audit-trail entry.
  try {
    await supabase.from('mission_log').insert({
      kind: 'system',
      status: errors.length ? 'warn' : 'success',
      source: 'rhythm-scan-weekly',
      message: `Rhythm scan: ${rows.length} scanned, ${alerts.length} flagged (${alerts.filter((a) => a.remediable).length} remediable)`,
      detail: {
        scanned: rows.length,
        flagged: alerts.length,
        remediable: alerts.filter((a) => a.remediable).length,
        runTs,
      },
    })
  } catch {
    /* best effort */
  }

  return {
    scanned: rows.length,
    flagged: alerts.length,
    remediable: alerts.filter((a) => a.remediable).length,
    alerts: alerts.slice(0, maxRows),
    errors,
  }
}

/** Latest persisted alerts for the admin dashboard (most recent run first). */
export async function listRhythmAlerts(opts: { limit?: number } = {}): Promise<{
  alerts: RhythmAlert[]
  latestRunTs: string | null
  totals: { flagged: number; remediable: number; blockers: number }
}> {
  const limit = opts.limit ?? 150
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('content_rhythm_alerts')
    .select('*')
    .order('run_ts', { ascending: false })
    .limit(limit)
  if (error) return { alerts: [], latestRunTs: null, totals: { flagged: 0, remediable: 0, blockers: 0 } }

  const alerts = (data || []) as unknown as RhythmAlert[]
  const latestRunTs = alerts.length ? alerts[0].run_ts : null
  const latest = latestRunTs ? alerts.filter((a) => a.run_ts === latestRunTs) : alerts
  return {
    alerts,
    latestRunTs,
    totals: {
      flagged: latest.length,
      remediable: latest.filter((a) => a.remediable).length,
      blockers: latest.filter((a) => a.severity === 'blocker').length,
    },
  }
}
