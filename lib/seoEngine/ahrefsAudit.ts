/**
 * Ahrefs Site Audit ingest — pull project issues and persist a snapshot
 * the Master Engine can score against.
 *
 * Env:
 *   AHREFS_API_KEY      — Bearer token
 *   AHREFS_PROJECT_ID   — default 9902912 (estate Site Audit project)
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { CS_INTRODUCED_ISSUE_IDS, AHREFS_ISSUE_CATALOG } from '@/lib/seoFactory/ahrefsIssues'

export const DEFAULT_AHREFS_PROJECT_ID = '9902912'

export interface AhrefsIssueRow {
  issueId: string
  count: number
  countCompared: number | null
  delta: number | null
  importance: string | null
  csCanIntroduce: boolean
}

export interface AhrefsSnapshot {
  fetchedAt: string
  projectId: string
  date: string
  dateCompared: string | null
  healthScore: number | null
  healthScoreCompared: number | null
  issues: AhrefsIssueRow[]
  csOpen: number
  totalOpen: number
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function normalizeAhrefsPayload(
  raw: unknown,
  meta: { projectId: string; date: string; dateCompared: string | null },
): AhrefsSnapshot {
  const root = asRecord(raw)
  const issuesRaw = Array.isArray(root.issues)
    ? root.issues
    : Array.isArray(asRecord(root.data).issues)
      ? (asRecord(root.data).issues as unknown[])
      : []
  const issues: AhrefsIssueRow[] = issuesRaw.map((row) => {
    const r = asRecord(row)
    const issueId = String(r.issue_id || r.issueId || r.id || r.name || '').trim()
    const count = num(r.count ?? r.urls_count ?? r.pages) ?? 0
    const compared = num(r.count_compared ?? r.countCompared ?? r.previous_count)
    return {
      issueId,
      count,
      countCompared: compared,
      delta: compared == null ? null : count - compared,
      importance: r.importance != null ? String(r.importance) : r.severity != null ? String(r.severity) : null,
      csCanIntroduce: CS_INTRODUCED_ISSUE_IDS.has(issueId),
    }
  }).filter((i) => i.issueId)
  const health = num(root.health_score ?? root.healthScore ?? asRecord(root.health).score)
  const healthCmp = num(root.health_score_compared ?? root.healthScoreCompared)
  const csOpen = issues.filter((i) => i.csCanIntroduce && i.count > 0).reduce((a, i) => a + i.count, 0)
  const totalOpen = issues.reduce((a, i) => a + (i.count > 0 ? i.count : 0), 0)
  return {
    fetchedAt: new Date().toISOString(),
    projectId: meta.projectId,
    date: meta.date,
    dateCompared: meta.dateCompared,
    healthScore: health,
    healthScoreCompared: healthCmp,
    issues,
    csOpen,
    totalOpen,
  }
}

export async function fetchAhrefsSiteAudit(opts: {
  projectId?: string
  date?: string
  dateCompared?: string
} = {}): Promise<AhrefsSnapshot> {
  const key = process.env.AHREFS_API_KEY
  if (!key) throw new Error('AHREFS_API_KEY is not configured')
  const projectId = String(opts.projectId || process.env.AHREFS_PROJECT_ID || DEFAULT_AHREFS_PROJECT_ID)
  const date = opts.date || new Date().toISOString()
  const dateCompared = opts.dateCompared || new Date(Date.now() - 7 * 86400_000).toISOString()
  const url = new URL('https://api.ahrefs.com/v3/site-audit/issues')
  url.searchParams.set('project_id', projectId)
  url.searchParams.set('date', date)
  url.searchParams.set('date_compared', dateCompared)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Ahrefs ${res.status}: ${String((json as { error?: string }).error || res.statusText)}`)
  }
  return normalizeAhrefsPayload(json, { projectId, date, dateCompared })
}

export async function persistAhrefsSnapshot(snap: AhrefsSnapshot): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    await supabase.from('seo_ahrefs_snapshots').insert({
      project_id: snap.projectId,
      fetched_at: snap.fetchedAt,
      crawl_date: snap.date,
      date_compared: snap.dateCompared,
      health_score: snap.healthScore,
      health_score_compared: snap.healthScoreCompared,
      cs_open: snap.csOpen,
      total_open: snap.totalOpen,
      issues: snap.issues,
    })
  } catch {
    /* table may not exist yet */
  }
}

export async function loadLatestAhrefsSnapshot(): Promise<AhrefsSnapshot | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('seo_ahrefs_snapshots')
      .select('project_id,fetched_at,crawl_date,date_compared,health_score,health_score_compared,cs_open,total_open,issues')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      fetchedAt: String(row.fetched_at || ''),
      projectId: String(row.project_id || ''),
      date: String(row.crawl_date || ''),
      dateCompared: row.date_compared ? String(row.date_compared) : null,
      healthScore: Number(row.health_score) || null,
      healthScoreCompared: Number(row.health_score_compared) || null,
      issues: Array.isArray(row.issues) ? (row.issues as AhrefsIssueRow[]) : [],
      csOpen: Number(row.cs_open) || 0,
      totalOpen: Number(row.total_open) || 0,
    }
  } catch {
    return null
  }
}

export function catalogFor(issueId: string) {
  return AHREFS_ISSUE_CATALOG.find((i) => i.id === issueId) || null
}
