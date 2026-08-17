/**
 * Ahrefs Site Audit ingest — pull project issues and persist a snapshot
 * the Master Engine can score against.
 *
 * Env:
 *   AHREFS_API_KEY      — Bearer token
 *   AHREFS_PROJECT_ID   — default 9902912 (estate Site Audit project)
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  CS_INTRODUCED_ISSUE_IDS,
  AHREFS_ISSUE_CATALOG,
  resolveAhrefsIssueId,
} from '@/lib/seoFactory/ahrefsIssues'

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
  /** Page-count of CS-introduced error/warning issues. */
  csOpen: number
  /** Distinct CS-introduced error/warning types still open. */
  csOpenTypes: number
  totalOpen: number
  source: 'api' | 'manual' | 'fallback'
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
    const issueId = resolveAhrefsIssueId(String(r.issue_id || r.issueId || r.id || r.name || r.label || r.issue || ''))
    const count = num(r.count ?? r.urls_count ?? r.pages ?? r.affected_pages) ?? 0
    const compared = num(r.count_compared ?? r.countCompared ?? r.previous_count ?? r.previous)
    const catalog = AHREFS_ISSUE_CATALOG.find((i) => i.id === issueId)
    const importance = r.importance != null
      ? String(r.importance)
      : r.severity != null
        ? String(r.severity)
        : catalog?.importance || null
    return {
      issueId,
      count,
      countCompared: compared,
      delta: compared == null ? null : count - compared,
      importance,
      csCanIntroduce: CS_INTRODUCED_ISSUE_IDS.has(issueId),
    }
  }).filter((i) => i.issueId)
  const health = num(root.health_score ?? root.healthScore ?? asRecord(root.health).score)
  const healthCmp = num(root.health_score_compared ?? root.healthScoreCompared)
  const csWeighted = issues.filter((i) => i.csCanIntroduce && i.count > 0 && i.importance !== 'notice')
  const csOpen = csWeighted.reduce((a, i) => a + i.count, 0)
  const csOpenTypes = csWeighted.length
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
    csOpenTypes,
    totalOpen,
    source: (root.source as AhrefsSnapshot['source']) || 'api',
  }
}

/** Legal.yousafeconsultancy crawl 2026-08-17 vs 2026-08-10 (project 9902912). */
export const LEGAL_AHREFS_CRAWL_2026_08_17 = {
  project_id: '9902912',
  date: '2026-08-17T11:00:20Z',
  date_compared: '2026-08-10T11:20:07Z',
  source: 'fallback' as const,
  issues: [
    { name: 'Orphan page (has no incoming internal links)', count: 205, previous: 207, importance: 'error' },
    { name: 'Page has links to broken page', count: 132, previous: 115, importance: 'error' },
    { name: '404 page', count: 23, previous: 17, importance: 'error' },
    { name: '4XX page', count: 23, previous: 17, importance: 'error' },
    { name: 'Double slash in URL', count: 10, previous: 10, importance: 'error' },
    { name: '3XX redirect in sitemap', count: 10, previous: 10, importance: 'error' },
    { name: '4XX page in sitemap', count: 1, previous: 1, importance: 'error' },
    { name: 'Noindex page', count: 190, previous: 188, importance: 'warning' },
    { name: 'Meta description too long', count: 78, previous: 79, importance: 'warning' },
    { name: 'Open Graph tags incomplete', count: 49, previous: 32, importance: 'warning' },
    { name: 'Meta description too short', count: 23, previous: 23, importance: 'warning' },
    { name: '3XX redirect', count: 17, previous: 13, importance: 'warning' },
    { name: 'Nofollow page', count: 13, previous: 13, importance: 'warning' },
    { name: 'Page has links to redirect', count: 12, previous: 9, importance: 'warning' },
    { name: 'Title too short', count: 2, previous: 0, importance: 'warning' },
    { name: 'Pages to submit to IndexNow', count: 347, previous: 54, importance: 'notice' },
    { name: 'Page has only one dofollow incoming internal link', count: 253, previous: 233, importance: 'notice' },
    { name: 'Noindex follow page', count: 177, previous: 175, importance: 'notice' },
    { name: 'Structured data has schema.org validation error', count: 112, previous: 94, importance: 'notice' },
    { name: 'Indexable page not in sitemap', count: 21, previous: 21, importance: 'notice' },
    { name: 'Noindex and nofollow page', count: 13, previous: 13, importance: 'notice' },
    { name: 'HTTP to HTTPS redirect', count: 1, previous: 1, importance: 'notice' },
  ],
}

export function snapshotFromOverview(
  issues: Array<{ name?: string; issue?: string; count: number; previous?: number; importance?: string }>,
  meta: { projectId: string; date: string; dateCompared: string | null; source?: AhrefsSnapshot['source'] },
): AhrefsSnapshot {
  return normalizeAhrefsPayload({
    source: meta.source || 'manual',
    issues: issues.map((i) => ({
      name: i.name || i.issue,
      count: i.count,
      previous: i.previous,
      importance: i.importance,
    })),
  }, meta)
}

export function issueCount(snap: AhrefsSnapshot | null | undefined, id: string): number | null {
  if (!snap) return null
  const row = snap.issues.find((i) => i.issueId === id)
  return row ? row.count : null
}

export function fallbackLegalAhrefsSnapshot(): AhrefsSnapshot {
  return snapshotFromOverview(LEGAL_AHREFS_CRAWL_2026_08_17.issues, {
    projectId: LEGAL_AHREFS_CRAWL_2026_08_17.project_id,
    date: LEGAL_AHREFS_CRAWL_2026_08_17.date,
    dateCompared: LEGAL_AHREFS_CRAWL_2026_08_17.date_compared,
    source: 'fallback',
  })
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
      source: snap.source,
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
    if (error || !data) return fallbackLegalAhrefsSnapshot()
    const row = data as Record<string, unknown>
    const issues = Array.isArray(row.issues) ? (row.issues as AhrefsIssueRow[]) : []
    const csOpenTypes = issues.filter((i) => i.csCanIntroduce && i.count > 0 && i.importance !== 'notice').length
    return {
      fetchedAt: String(row.fetched_at || ''),
      projectId: String(row.project_id || ''),
      date: String(row.crawl_date || ''),
      dateCompared: row.date_compared ? String(row.date_compared) : null,
      healthScore: Number(row.health_score) || null,
      healthScoreCompared: Number(row.health_score_compared) || null,
      issues,
      csOpen: Number(row.cs_open) || 0,
      csOpenTypes,
      totalOpen: Number(row.total_open) || 0,
      source: (row.source as AhrefsSnapshot['source']) || 'api',
    }
  } catch {
    return fallbackLegalAhrefsSnapshot()
  }
}

export function catalogFor(issueId: string) {
  return AHREFS_ISSUE_CATALOG.find((i) => i.id === issueId) || null
}
