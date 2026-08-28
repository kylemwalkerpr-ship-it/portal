'use client'

import React from 'react'
import type { DepthRescueStats } from '@/lib/seoFactory/depthRescue'
import { studioTokens as E } from './studio-tokens'

const C = E


// ── Types ──
// marketplace_gig intentionally excluded — studio never creates marketplace content.
// Marketplace pages are fed exclusively by service providers from their dashboard.
export type ContentType = 'blog_post' | 'article' | 'regional_page'

export type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'

export type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'

export type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'


export interface ContentJob {
  id: string; title: string; topic: string; content_type: ContentType
  tone: Tone; region: Region; target_repo: string; status: JobStatus
  source_job_id: string | null
  regeneration_reason?: string | null
  regeneration_mode?: string | null
  lineage?: Record<string, unknown> | null
  slug: string | null; content: string | null; branch_name: string | null
  content_path: string | null; pr_url: string | null; pr_number: number | null
  canonical_url?: string | null
  owner_host?: string | null
  merged_at: string | null; closed_at: string | null; error_message: string | null
  ai_provider: string | null; ai_model?: string | null; word_count: number | null; seo_score: number | null
  audit_json?: {
    model?: string; score?: number; grade?: string; attempts?: number
    /** Depth-rescue attempt stats persisted by the pipeline (survive reloads). */
    rescue?: DepthRescueStats
  } | null
  primary_keyword?: string | null; ship_mode?: string | null; indexable?: boolean
  required_short_keywords?: string[] | null
  required_long_tail_keywords?: string[] | null
  /** SERP competitor snippets (Discover/Research stage) — fed into the fix
   *  loop so the engine's SERP-consensus baseline reflects real competitors. */
  competing_snippets?: string[] | null
  /** Pages already targeting the same intent (cannibalization). */
  competing_urls?: Array<{ url?: string; title?: string; primaryKeyword?: string | null } | string> | null
  /** Master SEO Engine composite (0-100) + grade, persisted by the backfill. */
  master_engine_score?: number | null
  master_engine_grade?: string | null
  master_engine_fetched_at?: string | null
  created_at: string; updated_at: string
  deployed_at?: string | null
  event_log?: Array<{ ts?: number | string; level?: string; source?: string; message?: string; detail?: string }> | null
}


export interface GscMiniStats {
  clicks: number; impressions: number; ctr: number; position: number
  topQuery: string; topQueryClicks: number
  source: 'live' | 'snapshot' | null
}

/**
 * True when a job has actually shipped to main and earned a publication-ledger
 * stamp. `canonical_url` alone is NOT a ship signal — the pipeline writes it
 * onto every job at creation (status 'drafting'), so filtering on it flooded
 * the Track ledger with never-merged drafts that would 404 on VERIFY.
 */
export function isPublishedJob(j: ContentJob): boolean {
  return j.status === 'merged' || Boolean(j.merged_at)
}

/**
 * True only when a job currently has an OPEN pull request awaiting merge.
 * `pr_url` alone is NOT an open-PR signal — it is retained on the row after
 * merge (for the audit trail), so filtering on it flooded the Approve panel
 * with already-merged jobs. Only `pr_created` means "PR opened, not merged".
 */
export function isOpenPr(j: ContentJob): boolean {
  return j.status === 'pr_created'
}

export function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}


export function statusBadge(status: JobStatus) {
  const map: Record<JobStatus, { label: string; bg: string; fg: string; dot: string }> = {
    pending:    { label: 'Queued',     bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    drafting:   { label: 'Drafting',   bg: '#FEF3C7', fg: '#D97706', dot: '#F59E0B' },
    publishing: { label: 'Opening PR', bg: '#DBEAFE', fg: '#3B82F6', dot: '#60A5FA' },
    pr_created: { label: 'PR Ready',   bg: '#DBEAFE', fg: '#2563EB', dot: '#3B82F6' },
    merged:     { label: 'Merged',     bg: '#D1FAE5', fg: '#166534', dot: '#10B981' },
    closed:     { label: 'Closed',     bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    failed:     { label: 'Failed',     bg: '#FEE2E2', fg: '#DC2626', dot: '#EF4444' },
  }
  const s = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}
    </span>
  )
}


export function gateBadge(score: number | null | undefined, passed: boolean | null | undefined) {
  if (score == null) return <span style={{ fontSize: 10, color: C.textDim }}>—</span>
  const ok = passed !== false
  return (
    <span
      title={`Compliance gate ${score}/100 — ${ok ? 'passed' : 'blocked (YMYL/AEO/GEO requirements)'}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999,
        fontSize: 9, fontWeight: 700, fontFamily: C.mono, whiteSpace: 'nowrap', cursor: 'help',
        background: ok ? '#ECFDF5' : '#FEF2F2', color: ok ? C.green : C.red,
      }}
    >
      {ok ? '✓ PASS' : '✕ BLOCK'} {score}
    </span>
  )
}


// ── Cannibalization merge records (shared with Command Center) ──
export interface CannibalMergeRecord {
  clusterId: string
  source: 'portal' | 'command_center'
  stem: string
  terms: string[]
  winnerUrl: string
  loserUrls: string[]
  redirectsCreated: number
  prUrl?: string
  prNumber?: number
  status: 'merged' | 'skipped'
  message?: string
  mergedAt: number
}


export interface MergeUrlHit {
  role: 'winner' | 'loser'
  clusterId: string
  stem: string
  winnerUrl: string
  redirectsCreated: number
  prUrl?: string
  prNumber?: number
  mergedAt: number
}

export function canonicalMergeStem(q: string): string {
  return q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 4).join(' ')
}

export function jobWebPath(j: ContentJob): string {
  if (!j.slug) return ''
  const slug = j.slug.replace(/^\/+|\/+$/g, '')
  return slug ? `/${slug.toLowerCase()}` : ''
}


// ── Section header — used by every card ──
export function CardHeader({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: C.serif }}>{icon} {title}</div>
        {sub && <div style={{ marginTop: 1, fontSize: 10.5, color: C.textMuted }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
}

export const btnGhost: React.CSSProperties = {
  padding: '7px 14px', borderRadius: C.radiusXs, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
}


// ── QUEUE TAB ──
export const QUEUE_FILTERS: Array<{ key: 'all' | 'active' | 'pr_created' | 'merged' | 'failed'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'pr_created', label: 'PR ready' },
  { key: 'merged', label: 'Merged' },
  { key: 'failed', label: 'Failed' },
]


export type QueueSummary = {
  total?: number
  [status: string]: number | undefined
}


// ── INSIGHTS TAB pieces ──
export function GscMini() {
  const [stats, setStats] = React.useState<GscMiniStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchGsc = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 28 }),
      })
      const data = await res.json()
      if (res.ok && data.totals) {
        const top = data.rows?.[0]
        setStats({
          clicks: data.totals.clicks ?? 0,
          impressions: data.totals.impressions ?? 0,
          ctr: data.totals.ctr ?? 0,
          position: data.totals.position ?? 0,
          topQuery: top?.keys?.[0] ?? '—',
          topQueryClicks: top?.clicks ?? 0,
          source: data.source === 'snapshot' ? 'snapshot' : 'live',
        })
      } else if (data.source === 'snapshot') {
        setStats({
          clicks: data.totals?.clicks ?? 0,
          impressions: data.totals?.impressions ?? 0,
          ctr: 0, position: 0,
          topQuery: data.rows?.[0]?.keys?.[0] ?? '—',
          topQueryClicks: data.rows?.[0]?.clicks ?? 0,
          source: 'snapshot',
        })
      } else { setError(data.error || 'No data') }
    } catch { setError('Failed to load') } finally { setLoading(false) }
  }

  React.useEffect(() => { fetchGsc() }, [])

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="📊" title="GSC overview (28d)"
        sub="Live Search Console when credentials work, snapshot otherwise."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {stats && stats.source && (
              <span title={stats.source === 'live' ? 'Scored from live Search Console data' : 'Committed snapshot — connect GSC for live numbers'} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: stats.source === 'live' ? C.greenSoft : '#FFFBEB', color: stats.source === 'live' ? C.green : '#92400E' }}>
                {stats.source === 'live' ? '● LIVE' : '◐ SNAPSHOT'}
              </span>
            )}
            <button type="button" onClick={fetchGsc} disabled={loading} style={{ ...btnGhost, padding: '4px 10px' }}>
              {loading ? '…' : '↻'}
            </button>
          </div>
        }
      />
      {stats ? (
        <div style={{ padding: '10px 16px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Clicks', value: stats.clicks.toLocaleString(), color: C.green },
              { label: 'Impressions', value: stats.impressions.toLocaleString(), color: C.blue },
              { label: 'CTR', value: stats.source === 'snapshot' && stats.ctr === 0 ? '—' : `${stats.ctr.toFixed(1)}%`, color: C.purple },
              { label: 'Avg Pos', value: stats.source === 'snapshot' && stats.position === 0 ? '—' : stats.position.toFixed(1), color: C.orange },
            ].map(m => (
              <div key={m.label} style={{ background: C.surface2, borderRadius: C.radiusXs, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color, fontFamily: C.serif, marginTop: 2 }}>{m.value}</div>
              </div>
            ))}
          </div>
          {stats.topQuery !== '—' && (
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
              #1 query: <strong style={{ color: C.text }}>{stats.topQuery}</strong> ({stats.topQueryClicks.toLocaleString()} clicks)
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', fontSize: 10.5, color: C.textDim, fontFamily: C.mono }}>
          {loading ? 'Loading…' : error || 'No data yet'}
        </div>
      )}
    </div>
  )
}

