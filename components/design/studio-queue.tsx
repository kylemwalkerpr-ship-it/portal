'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import {
  CardHeader,
  QUEUE_FILTERS,
  btnGhost,
  canonicalMergeStem,
  formatDate,
  gateBadge,
  GscMini,
  inputStyle,
  jobWebPath,
  statusBadge,
  type CannibalMergeRecord,
  type ContentJob,
  type JobStatus,
  type MergeUrlHit,
  type QueueSummary,
} from './studio-ui-shared'

const C = E


export function QueueStats({ jobs, total: totalOverride, summary }: {
  jobs: ContentJob[]
  total?: number
  summary?: QueueSummary | null
}) {
  const count = (status: string, fallback: number) =>
    typeof summary?.[status] === 'number' ? Number(summary[status]) : fallback
  const total = totalOverride ?? summary?.total ?? jobs.length
  const merged = count('merged', jobs.filter(j => j.status === 'merged').length)
  const failed = count('failed', jobs.filter(j => j.status === 'failed').length)
  const closed = count('closed', jobs.filter(j => j.status === 'closed').length)
  const inProgress = summary?.total != null || totalOverride != null
    ? Math.max(0, total - merged - failed - closed)
    : jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
  const prReady = count('pr_created', jobs.filter(j => j.status === 'pr_created').length)
  const cards = [
    { label: 'Total jobs', value: total, color: C.cyan, icon: '📋' },
    { label: 'In progress', value: inProgress, color: C.orange, icon: '⚙️' },
    { label: 'PR ready', value: prReady, color: C.blue, icon: '🔀' },
    { label: 'Merged', value: merged, color: C.green, icon: '✅' },
    { label: 'Failed', value: failed, color: C.red, icon: '⚠️' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, boxShadow: C.shadowCard,
          padding: '12px 14px', borderTop: `3px solid ${c.color}`, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>{c.icon}</span>
          <div>
            <div style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: C.serif }}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}


export function QueueTable({ jobs, total, summary, onSelect, loading, mergeIndex, gateByJob, focusJobId, onLoadMore, selectedIds, onToggleSelect, onToggleSelectAll, onBulkAction, bulkBusy, bulkAction, hideFilters }: {
  jobs: ContentJob[]
  total?: number
  summary?: QueueSummary | null
  onSelect: (j: ContentJob) => void
  loading: boolean
  mergeIndex: { byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }
  gateByJob?: Map<string, { score: number; passed: boolean }>
  focusJobId?: string | null
  onLoadMore?: () => void
  selectedIds?: Set<string>
  onToggleSelect?: (jobId: string) => void
  onToggleSelectAll?: (ids: string[]) => void
  onBulkAction?: (kind: string) => void
  bulkBusy?: boolean
  bulkAction?: string | null
  hideFilters?: boolean
}) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'pr_created' | 'merged' | 'failed'>('all')
  const [search, setSearch] = React.useState('')
  const [showAll, setShowAll] = React.useState(Boolean(hideFilters))

  const mergeHitFor = (j: ContentJob): MergeUrlHit | null => {
    const path = jobWebPath(j)
    if (path) {
      const hit = mergeIndex.byPath.get(path)
      if (hit) return hit
    }
    const stemKey = canonicalMergeStem(j.primary_keyword ?? j.topic ?? '')
    if (stemKey) {
      const hit = mergeIndex.byStem.get(stemKey)
      if (hit) return hit
    }
    return null
  }

  const applyQuery = (list: ContentJob[]) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(j =>
        (j.id || '').toLowerCase().includes(q) ||
        (j.source_job_id || '').toLowerCase().includes(q) ||
        (j.title || '').toLowerCase().includes(q) ||
        (j.topic || '').toLowerCase().includes(q) ||
        (j.primary_keyword || '').toLowerCase().includes(q) ||
        (j.region || '').toLowerCase().includes(q))
    }
    return list
  }

  const countFor = (key: 'all' | 'active' | 'pr_created' | 'merged' | 'failed') => {
    // Status totals come from the database-wide summary when there is no
    // search term. The table window is intentionally small, but its badges
    // must never pretend that the window is the whole queue.
    if (!search.trim() && summary) {
      if (key === 'all') return total ?? summary.total ?? jobs.length
      if (key === 'merged') return summary.merged ?? 0
      if (key === 'failed') return summary.failed ?? 0
      if (key === 'pr_created') return summary.pr_created ?? 0
      if (key === 'active') {
        const all = total ?? summary.total ?? jobs.length
        return Math.max(0, all - (summary.merged ?? 0) - (summary.closed ?? 0) - (summary.failed ?? 0))
      }
    }
    if (key === 'all') return jobs.length
    let list = jobs
    if (key === 'active') list = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status))
    else if (key === 'pr_created') list = jobs.filter(j => j.status === 'pr_created')
    else if (key === 'merged') list = jobs.filter(j => j.status === 'merged')
    else if (key === 'failed') list = jobs.filter(j => j.status === 'failed')
    return applyQuery(list).length
  }

  const filtered = React.useMemo(() => {
    let list = jobs
    if (filter === 'active') list = list.filter(j => !['merged', 'closed', 'failed'].includes(j.status))
    else if (filter === 'pr_created') list = list.filter(j => j.status === 'pr_created')
    else if (filter === 'merged') list = list.filter(j => j.status === 'merged')
    else if (filter === 'failed') list = list.filter(j => j.status === 'failed')
    list = applyQuery(list)
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [jobs, filter, search])

  const visible = filtered.slice(0, showAll ? 200 : 12)

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="📋" title="Job queue"
        sub="Every launch, PR and merge — filter, search, then click a row for full control."
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search title, topic, keyword…"
              style={{ ...inputStyle, width: 210, padding: '6px 10px' }}
            />
          </div>
        }
      />
      {!hideFilters && (
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {QUEUE_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
            padding: '4px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700,
            fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
          }}>
            {f.label} {countFor(f.key)}
          </button>
        ))}
      </div>
      )}
      <div style={{ overflowX: 'auto', marginTop: 6 }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: C.textDim }}>Loading jobs…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>📭</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              {jobs.length === 0 && (total ?? 0) > 0
                ? `${total} job(s) match this filter but are outside the loaded window.`
                : jobs.length === 0
                  ? 'No jobs yet — head to the Create tab and launch your first piece.'
                  : 'No jobs match this filter / search.'}
            </div>
            {jobs.length === 0 && (total ?? 0) > 0 && onLoadMore && (
              <button type="button" onClick={onLoadMore} style={{ ...btnGhost, marginTop: 12 }}>
                Load matching jobs
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '9px 8px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'center', whiteSpace: 'nowrap', width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible jobs"
                    checked={visible.length > 0 && visible.every((j) => selectedIds?.has(j.id))}
                    onChange={() => onToggleSelectAll?.(visible.map((j) => j.id))}
                    disabled={!visible.length || bulkBusy}
                  />
                </th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Piece</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Region</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Gate</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>SEO</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>PR</th>
                <th style={{ padding: '9px 12px', fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(j => {
                const hit = mergeHitFor(j)
                const g = gateByJob?.get(j.id)
                const checked = Boolean(selectedIds?.has(j.id))
                return (
                  <tr key={j.id} onClick={(e) => {
                    // Don't open the detail modal if the checkbox was clicked.
                    const target = e.target as HTMLElement
                    if (target?.tagName === 'INPUT' || target?.dataset?.checkbox === 'true') return
                    onSelect(j)
                  }} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border2}`, transition: 'background 0.12s', background: j.id === focusJobId ? '#EFF6FF' : 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = j.id === focusJobId ? '#EFF6FF' : 'transparent' }}>
                    <td style={{ padding: '9px 8px', textAlign: 'center', width: 32 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        data-checkbox="true"
                        aria-label={`Select job ${j.title || j.id}`}
                        checked={checked}
                        disabled={bulkBusy}
                        onChange={() => onToggleSelect?.(j.id)}
                      />
                    </td>
                    <td style={{ padding: '9px 12px', maxWidth: 240 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title || '(untitled)'}</div>
                      <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.topic?.slice(0, 60)}</div>
                      {j.source_job_id && <div style={{ marginTop: 3, color: C.blue, fontSize: 9, fontFamily: C.mono, fontWeight: 700 }}>↻ REGENERATION · replaces {j.source_job_id.slice(0, 8)}…</div>}
                    </td>
                    <td style={{ padding: '9px 12px', color: C.textMuted, fontSize: 10, whiteSpace: 'nowrap' }}>{j.content_type?.replace('_', ' ')}</td>
                    <td style={{ padding: '9px 12px', fontSize: 10, whiteSpace: 'nowrap' }}>{j.region}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                        {statusBadge(j.status)}
                        {hit && (
                          <span
                            title={hit.role === 'winner'
                              ? `Cluster winner — ${hit.redirectsCreated} redirect${hit.redirectsCreated === 1 ? '' : 's'} point here${hit.prNumber ? ` (PR #${hit.prNumber})` : ''}`
                              : `Merged — page 301s into ${hit.winnerUrl}${hit.prNumber ? ` (PR #${hit.prNumber})` : ''}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999,
                              fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                              background: hit.role === 'winner' ? '#D1FAE5' : '#FEF3C7',
                              color: hit.role === 'winner' ? '#065F46' : '#92400E',
                            }}
                          >
                            {hit.role === 'winner' ? '★ WINNER' : '⚡ MERGED'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px' }}>{gateBadge(g?.score, g?.passed)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 10, fontFamily: C.mono }}>{j.seo_score != null ? `${j.seo_score}%` : '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {j.pr_url
                        ? <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>PR #{j.pr_number} ↗</a>
                        : <span style={{ color: C.textDim }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 10, color: C.textMuted, whiteSpace: 'nowrap' }}>{formatDate(j.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {(filtered.length > 12 || (typeof total === 'number' && total > jobs.length && onLoadMore)) && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {filtered.length > 12 && (
          <button type="button" onClick={() => setShowAll(!showAll)} style={btnGhost}>
            {showAll ? '▲ Show fewer' : `▼ Show all ${filtered.length} matching`}
          </button>
          )}
          {typeof total === 'number' && total > 0 && jobs.length < total && onLoadMore && (
            <button type="button" onClick={onLoadMore} style={btnGhost}>
              Load more ({total - jobs.length} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

