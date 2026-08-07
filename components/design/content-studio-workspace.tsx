'use client'
/**
 * Content Studio workspace side-pane: live editor, PR status, debug log.
 * Complements SEO Factory automation so operators see and control output.
 */
import React from 'react'
import { MarkdownLite } from '@/lib/markdownLite'

const C = {
  bg: '#0B1220',
  panel: '#111827',
  surface: '#1F2937',
  border: 'rgba(255,255,255,0.08)',
  cyan: '#93C5FD',
  gold: '#FBBF24',
  text: '#F9FAFB',
  muted: '#9CA3AF',
  dim: '#6B7280',
  green: '#34D399',
  red: '#F87171',
  orange: '#FBBF24',
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
}

export type StudioLogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug'

export interface StudioLogEntry {
  id: string
  ts: number
  level: StudioLogLevel
  source: string
  message: string
  detail?: string
}

export interface StudioJob {
  id: string
  title?: string | null
  topic?: string | null
  primary_keyword?: string | null
  slug?: string | null
  content?: string | null
  status?: string | null
  pr_url?: string | null
  pr_number?: number | null
  branch_name?: string | null
  content_path?: string | null
  target_repo?: string | null
  error_message?: string | null
  ai_provider?: string | null
  ai_model?: string | null
  word_count?: number | null
  seo_score?: number | null
  audit_json?: any
  ship_mode?: string | null
  region?: string | null
  content_type?: string | null
  owner_host?: string | null
  canonical_url?: string | null
  deploy_sha?: string | null
  indexable?: boolean | null
  event_log?: StudioLogEntry[] | null
  created_at?: string
  updated_at?: string
  merged_at?: string | null
}

export interface PrCheckRun {
  name: string
  status: string
  conclusion: string | null
  html_url?: string
  started_at?: string
  completed_at?: string
}

export interface PrStatus {
  number: number
  state: string
  merged: boolean
  merged_at: string | null
  html_url: string
  title: string
  draft: boolean
  head?: string
  head_sha?: string
  base?: string
  user?: string
  created_at: string
  updated_at: string
  mergeable_state?: string
  checks?: PrCheckRun[]
  check_summary?: {
    total: number
    success: number
    failure: number
    pending: number
    neutral: number
    state: string
  }
  commit_status?: {
    state: string
    total_count: number
    statuses: Array<{
      context: string
      state: string
      description?: string
      target_url?: string
    }>
  } | null
}

type PaneTab = 'editor' | 'pr' | 'log' | 'meta'
type EditorMode = 'write' | 'preview' | 'split'

export function createLog(
  level: StudioLogLevel,
  source: string,
  message: string,
  detail?: string,
): StudioLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    level,
    source,
    message,
    detail,
  }
}

function levelColor(level: StudioLogLevel) {
  if (level === 'error') return C.red
  if (level === 'warn') return C.orange
  if (level === 'success') return C.green
  if (level === 'debug') return C.dim
  return C.cyan
}

function statusColor(status?: string | null) {
  const s = (status || '').toLowerCase()
  if (s === 'merged' || s === 'deployed') return C.green
  if (s === 'failed') return C.red
  if (s === 'pr_created' || s === 'publishing' || s === 'drafting') return C.orange
  return C.muted
}

export default function ContentStudioWorkspace({
  job,
  jobs,
  editorContent,
  onEditorChange,
  onSelectJob,
  onSave,
  onShip,
  onApprove,
  onMonitor,
  onRegenerate,
  onRefreshPr,
  onCloseJob,
  onReaudit,
  onDuplicate,
  onMergePr,
  onAbandon,
  onUpdateMeta,
  dryRun,
  onToggleDryRun,
  busy,
  logs,
  onClearLogs,
  prStatus,
  activityLine,
}: {
  job: StudioJob | null
  jobs: StudioJob[]
  editorContent: string
  onEditorChange: (v: string) => void
  onSelectJob: (id: string) => void
  onSave: () => void
  /** Legacy reship / PR path */
  onShip: () => void
  /** Approve → commit/merge main → Cloudflare deploy + monitor */
  onApprove: () => void
  onMonitor: () => void
  onRegenerate: () => void
  onRefreshPr: () => void
  onCloseJob: () => void
  onReaudit?: () => void
  onDuplicate?: () => void
  onMergePr?: () => void
  onAbandon?: () => void
  onUpdateMeta?: (patch: Record<string, unknown>) => void
  dryRun?: boolean
  onToggleDryRun?: () => void
  busy: boolean
  logs: StudioLogEntry[]
  onClearLogs: () => void
  prStatus: PrStatus | null
  activityLine?: string | null
}) {
  const [pane, setPane] = React.useState<PaneTab>('editor')
  const [editorMode, setEditorMode] = React.useState<EditorMode>('write')
  const [find, setFind] = React.useState('')
  const [metaTitle, setMetaTitle] = React.useState('')
  const [metaKeyword, setMetaKeyword] = React.useState('')
  const [metaRegion, setMetaRegion] = React.useState('US')
  const [metaIndexable, setMetaIndexable] = React.useState(true)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const editorScrollRef = React.useRef<HTMLTextAreaElement>(null)
  const words = editorContent.trim() ? editorContent.trim().split(/\s+/).length : 0
  const chars = editorContent.length
  const dirty = (job?.content || '') !== editorContent
  const [copiedFlash, setCopiedFlash] = React.useState(false)

  React.useEffect(() => {
    if (!job) return
    setMetaTitle(job.title || job.topic || '')
    setMetaKeyword(job.primary_keyword || job.topic || '')
    setMetaRegion((job.region || 'US').toUpperCase())
    setMetaIndexable(job.indexable !== false)
  }, [job?.id])

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  // Auto-scroll editor while streaming new content
  React.useEffect(() => {
    if (busy && editorMode !== 'preview' && editorScrollRef.current) {
      const el = editorScrollRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [editorContent, busy, editorMode])

  React.useEffect(() => {
    // Prefer editor when content exists; only open PR pane if no content yet
    if (!job) return
    if (job.content) setPane('editor')
    else if (job.pr_url || job.pr_number) setPane('pr')
  }, [job?.id])

  // Keyboard shortcuts: ⌘/Ctrl+S save, ⌘/Ctrl+Enter approve
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || !job) return
      const target = e.target as HTMLElement | null
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === 's') {
        e.preventDefault()
        if (dirty && !busy) onSave()
      } else if (e.key === 'Enter' && !e.shiftKey && inField) {
        // Only approve from editor textarea, not meta inputs
        if (target?.tagName === 'TEXTAREA' && editorContent.trim() && !busy) {
          e.preventDefault()
          onApprove()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [job, dirty, busy, editorContent, onSave, onApprove])

  const copyEditor = async () => {
    try {
      await navigator.clipboard.writeText(editorContent)
      setCopiedFlash(true)
      setTimeout(() => setCopiedFlash(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const filteredLogs = find.trim()
    ? logs.filter(
        (l) =>
          l.message.toLowerCase().includes(find.toLowerCase()) ||
          l.source.toLowerCase().includes(find.toLowerCase()) ||
          (l.detail || '').toLowerCase().includes(find.toLowerCase()),
      )
    : logs

  const checkStateColor = (state?: string) => {
    const s = (state || '').toLowerCase()
    if (s === 'success' || s === 'completed') return C.green
    if (s === 'failure' || s === 'error' || s === 'cancelled' || s === 'timed_out') return C.red
    if (s === 'pending' || s === 'queued' || s === 'in_progress') return C.orange
    return C.muted
  }

  return (
    <aside
      aria-label="Content Studio workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: C.bg,
        color: C.text,
        borderLeft: `1px solid ${C.border}`,
        fontFamily: 'inherit',
      }}
    >
      <style>{`
        @keyframes studioPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.92); }
        }
      `}</style>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.gold, fontWeight: 700 }}>
              Workspace
              {dirty ? <span style={{ color: C.orange, marginLeft: 8 }}>· unsaved</span> : null}
              {busy ? <span style={{ color: C.cyan, marginLeft: 8 }}>· busy</span> : null}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job?.title || job?.topic || ''}>
              {job?.title || job?.topic || 'No job selected'}
            </div>
            {job && (
              <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontFamily: C.mono }}>
                {job.owner_host || '—'} · {job.region || '—'} · SEO {job.seo_score ?? '—'}
                {job.indexable === false ? ' · noindex' : ''}
              </div>
            )}
          </div>
          {job && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              background: 'rgba(255,255,255,0.06)', color: statusColor(job.status),
            }}>
              {(job.status || 'unknown').replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Job picker */}
        <select
          value={job?.id || ''}
          onChange={(e) => e.target.value && onSelectJob(e.target.value)}
          style={{
            width: '100%', marginTop: 10, padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12,
          }}
        >
          <option value="">Select a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {(j.status || '?').toUpperCase()} · {j.title || j.topic || j.id.slice(0, 8)}
            </option>
          ))}
        </select>

        {activityLine && (
          <div style={{
            marginTop: 8, fontSize: 11, color: C.gold, fontFamily: C.mono,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 999, background: C.gold,
              boxShadow: `0 0 0 3px rgba(251,191,36,0.25)`,
              animation: 'studioPulse 1.2s infinite',
            }} />
            {activityLine}
          </div>
        )}
      </div>

      {/* Pane tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([
          ['editor', 'Editor'],
          ['pr', 'GitHub PR'],
          ['log', 'Debug log'],
          ['meta', 'Meta'],
        ] as [PaneTab, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPane(k)}
            style={{
              flex: 1, padding: '10px 6px', border: 'none', cursor: 'pointer',
              background: pane === k ? C.surface : 'transparent',
              color: pane === k ? C.text : C.dim,
              fontSize: 11, fontWeight: pane === k ? 700 : 500,
              borderBottom: pane === k ? `2px solid ${C.gold}` : '2px solid transparent',
            }}
          >
            {label}
            {k === 'log' && logs.length > 0 ? ` (${logs.length})` : ''}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {pane === 'editor' && (
          <>
            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 10px',
              borderBottom: `1px solid ${C.border}`, background: C.panel, flexShrink: 0,
              alignItems: 'center',
            }}>
              <button type="button" disabled={busy || !job || !dirty} onClick={onSave} style={btn(dirty && job ? C.gold : C.dim, true)}>
                {dirty ? 'Save draft' : 'Saved'}
              </button>
              <button
                type="button"
                disabled={busy || !job || !editorContent.trim()}
                onClick={onApprove}
                title="Save (if needed), commit/merge to main, trigger Cloudflare deploy, run CI monitor"
                style={btn(C.green, true)}
              >
                {dryRun ? 'Dry-run approve' : 'Approve → main'}
              </button>
              <button type="button" disabled={busy || !job || !editorContent.trim()} onClick={onShip} style={btn(C.cyan, true)}>
                Ship PR only
              </button>
              {job?.pr_number && onMergePr && (
                <button type="button" disabled={busy} onClick={onMergePr} style={btn(C.green)}>
                  Merge open PR
                </button>
              )}
              <button type="button" disabled={busy || !job} onClick={onMonitor} style={btn()}>
                Monitor CI
              </button>
              {onReaudit && (
                <button type="button" disabled={busy || !job || !editorContent.trim()} onClick={onReaudit} style={btn()}>
                  Re-audit
                </button>
              )}
              <button type="button" disabled={busy || !job} onClick={onRegenerate} style={btn()}>
                Regenerate
              </button>
              {onDuplicate && (
                <button type="button" disabled={busy || !job} onClick={onDuplicate} style={btn()}>
                  Duplicate
                </button>
              )}
              {onAbandon && job && job.status !== 'merged' && job.status !== 'closed' && (
                <button type="button" disabled={busy} onClick={onAbandon} style={btn(C.red)}>
                  Abandon
                </button>
              )}
              <button
                type="button"
                disabled={!editorContent}
                onClick={() => { void copyEditor() }}
                style={btn(copiedFlash ? C.green : undefined)}
                title="Copy editor content"
              >
                {copiedFlash ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                disabled={!editorContent}
                onClick={() => {
                  const blob = new Blob([editorContent], { type: 'text/markdown;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${(job?.slug || job?.primary_keyword || 'draft').toString().replace(/\s+/g, '-')}.md`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                style={btn()}
              >
                Download
              </button>
              {onToggleDryRun && (
                <button
                  type="button"
                  onClick={onToggleDryRun}
                  title="When on, approve/ship do not write to GitHub"
                  style={btn(dryRun ? C.orange : undefined, !!dryRun)}
                >
                  {dryRun ? 'Dry-run ON' : 'Dry-run'}
                </button>
              )}
              <button type="button" disabled={!job} onClick={onCloseJob} style={btn()}>
                Deselect
              </button>
              <div style={{
                display: 'inline-flex', marginLeft: 4, borderRadius: 6,
                border: `1px solid ${C.border}`, overflow: 'hidden',
              }}>
                {([
                  ['write', 'Write'],
                  ['split', 'Split'],
                  ['preview', 'Preview'],
                ] as [EditorMode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditorMode(m)}
                    style={{
                      padding: '5px 9px', fontSize: 11, fontWeight: editorMode === m ? 700 : 500,
                      border: 'none', cursor: 'pointer',
                      background: editorMode === m ? C.surface : 'transparent',
                      color: editorMode === m ? C.gold : C.dim,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: C.muted, fontFamily: C.mono, alignSelf: 'center' }} title="⌘/Ctrl+S save · ⌘/Ctrl+Enter approve">
                {words} words · {chars} chars
                {job?.seo_score != null ? ` · SEO ${job.seo_score}` : ''}
                {dirty ? ' · unsaved' : ''}
                {busy ? ' · working…' : ''}
              </div>
            </div>
            <div style={{
              flex: 1, minHeight: 280, display: 'flex', minWidth: 0, overflow: 'hidden',
            }}>
              {(editorMode === 'write' || editorMode === 'split') && (
                <textarea
                  ref={editorScrollRef}
                  value={editorContent}
                  onChange={(e) => onEditorChange(e.target.value)}
                  placeholder={job ? 'Content streams here as tokens arrive…' : 'Run Auto-Pilot, Keywords, or Manual generate — output streams here.'}
                  spellCheck
                  style={{
                    flex: 1, minWidth: 0, height: '100%', resize: 'none', border: 'none',
                    borderRight: editorMode === 'split' ? `1px solid ${C.border}` : 'none',
                    padding: 14, background: C.bg, color: C.text, fontSize: 13, lineHeight: 1.55,
                    fontFamily: C.mono, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              )}
              {(editorMode === 'preview' || editorMode === 'split') && (
                <div style={{
                  flex: 1, minWidth: 0, height: '100%', overflow: 'auto',
                  padding: 14, background: editorMode === 'preview' ? C.bg : C.panel,
                }}>
                  <MarkdownLite source={editorContent} />
                </div>
              )}
            </div>
            {job?.error_message && (
              <div style={{ padding: 10, background: 'rgba(248,113,113,0.12)', color: C.red, fontSize: 12, borderTop: `1px solid ${C.border}` }}>
                {job.error_message}
              </div>
            )}
          </>
        )}

        {pane === 'pr' && (
          <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
            {!job && <Empty>Select a job to inspect its GitHub PR.</Empty>}
            {job && !job.pr_url && !job.pr_number && (
              <Empty>
                No PR yet. Ship this job (mode PR) to open a pull request. Status will appear here live.
              </Empty>
            )}
            {job && (job.pr_url || job.pr_number) && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ color: C.cyan }}>Pull request</strong>
                  <button type="button" disabled={busy} onClick={onRefreshPr} style={btn()}>
                    Refresh status
                  </button>
                </div>
                <Row label="Number" value={job.pr_number ? `#${job.pr_number}` : '—'} />
                <Row label="Repo" value={job.target_repo || '—'} />
                <Row label="Branch" value={job.branch_name || prStatus?.head || '—'} mono />
                <Row label="Path" value={job.content_path || '—'} mono />
                <Row label="Local status" value={job.status || '—'} />
                {prStatus && (
                  <>
                    <Row label="GitHub state" value={prStatus.merged ? 'merged' : prStatus.state} />
                    <Row label="Draft" value={prStatus.draft ? 'yes' : 'no'} />
                    <Row label="Mergeable" value={prStatus.mergeable_state || '—'} />
                    <Row label="Base ← head" value={`${prStatus.base || '?'} ← ${prStatus.head || '?'}`} mono />
                    {prStatus.head_sha && (
                      <Row label="Head SHA" value={prStatus.head_sha.slice(0, 12)} mono />
                    )}
                    <Row label="Author" value={prStatus.user || '—'} />
                    <Row label="Updated" value={prStatus.updated_at ? new Date(prStatus.updated_at).toLocaleString() : '—'} />
                    {prStatus.check_summary && (
                      <div style={{
                        padding: 10, borderRadius: 8, background: C.panel,
                        border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong style={{ fontSize: 12, color: C.text }}>CI checks</strong>
                          <span style={{
                            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            color: checkStateColor(prStatus.check_summary.state),
                          }}>
                            {prStatus.check_summary.state}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono, marginBottom: 8 }}>
                          {prStatus.check_summary.total} total · {prStatus.check_summary.success} ok ·{' '}
                          {prStatus.check_summary.failure} fail · {prStatus.check_summary.pending} pending
                        </div>
                        {(prStatus.checks || []).length === 0 && (
                          <div style={{ fontSize: 11, color: C.dim }}>
                            {prStatus.commit_status?.total_count
                              ? 'Using commit status API (no check-runs).'
                              : 'No check runs yet on this commit.'}
                          </div>
                        )}
                        {(prStatus.checks || []).map((c, i) => (
                          <div
                            key={`${c.name}-${i}`}
                            style={{
                              display: 'flex', justifyContent: 'space-between', gap: 8,
                              padding: '6px 0', borderTop: i ? `1px solid ${C.border}` : 'none',
                              fontSize: 11,
                            }}
                          >
                            <span style={{ color: C.text, wordBreak: 'break-word' }}>
                              {c.html_url ? (
                                <a href={c.html_url} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>
                                  {c.name}
                                </a>
                              ) : c.name}
                            </span>
                            <span style={{
                              color: checkStateColor(c.conclusion || c.status),
                              fontFamily: C.mono, flexShrink: 0,
                            }}>
                              {c.conclusion || c.status}
                            </span>
                          </div>
                        ))}
                        {(prStatus.commit_status?.statuses || []).length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>
                              Commit status · {prStatus.commit_status?.state}
                            </div>
                            {prStatus.commit_status!.statuses.map((s, i) => (
                              <div
                                key={`${s.context}-${i}`}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', gap: 8,
                                  fontSize: 11, padding: '4px 0',
                                }}
                              >
                                <span style={{ color: C.muted }}>{s.context}</span>
                                <span style={{ color: checkStateColor(s.state), fontFamily: C.mono }}>
                                  {s.state}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {job.deploy_sha && <Row label="Deploy SHA" value={job.deploy_sha.slice(0, 12)} mono />}
                {job.pr_url && (
                  <a
                    href={job.pr_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block', textAlign: 'center', padding: '10px 12px', borderRadius: 8,
                      background: C.cyan, color: '#0B1220', fontWeight: 700, fontSize: 13, textDecoration: 'none',
                    }}
                  >
                    Open PR on GitHub ↗
                  </a>
                )}
                <p style={{ margin: 0, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                  Refresh pulls PR state, mergeable, draft, and CI check-runs / commit status for the head SHA.
                </p>
              </div>
            )}
          </div>
        )}

        {pane === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 8, padding: 10, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Filter log…"
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: C.surface, color: C.text, fontSize: 12,
                }}
              />
              <button type="button" onClick={onClearLogs} style={btn()}>Clear</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 10, fontFamily: C.mono, fontSize: 11 }}>
              {filteredLogs.length === 0 && <Empty>No events yet. Run generate, plan, or ship to stream activity here.</Empty>}
              {filteredLogs.map((l) => (
                <div key={l.id} style={{ marginBottom: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ color: C.dim }}>{new Date(l.ts).toLocaleTimeString()}</span>
                    <span style={{ color: levelColor(l.level), fontWeight: 700, textTransform: 'uppercase' }}>{l.level}</span>
                    <span style={{ color: C.gold }}>{l.source}</span>
                  </div>
                  <div style={{ color: C.text, marginTop: 3, lineHeight: 1.45 }}>{l.message}</div>
                  {l.detail && (
                    <pre style={{
                      margin: '6px 0 0', whiteSpace: 'pre-wrap', color: C.muted, fontSize: 10,
                      background: C.panel, padding: 8, borderRadius: 6, maxHeight: 120, overflow: 'auto',
                    }}>
                      {l.detail.slice(0, 4000)}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {pane === 'meta' && (
          <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
            {!job && <Empty>Select a job to view ownership, audit, and SEO metadata.</Empty>}
            {job && (
              <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                {onUpdateMeta && (
                  <div style={{
                    display: 'grid', gap: 8, padding: 10, borderRadius: 8,
                    background: C.panel, border: `1px solid ${C.border}`, marginBottom: 4,
                  }}>
                    <div style={{ fontWeight: 700, color: C.gold, fontSize: 11, textTransform: 'uppercase' }}>
                      Admin meta controls
                    </div>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ color: C.dim, fontSize: 11 }}>Title</span>
                      <input
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        style={metaInput}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ color: C.dim, fontSize: 11 }}>Primary keyword</span>
                      <input
                        value={metaKeyword}
                        onChange={(e) => setMetaKeyword(e.target.value)}
                        style={metaInput}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <span style={{ color: C.dim, fontSize: 11 }}>Region</span>
                        <select value={metaRegion} onChange={(e) => setMetaRegion(e.target.value)} style={metaInput}>
                          {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                        <input
                          type="checkbox"
                          checked={metaIndexable}
                          onChange={(e) => setMetaIndexable(e.target.checked)}
                        />
                        <span style={{ color: C.text, fontSize: 12 }}>Indexable</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onUpdateMeta({
                          title: metaTitle,
                          primary_keyword: metaKeyword,
                          region: metaRegion,
                          indexable: metaIndexable,
                        })
                      }
                      style={btn(C.gold, true)}
                    >
                      Save meta + re-resolve ownership
                    </button>
                  </div>
                )}
                <Row label="Keyword" value={job.primary_keyword || job.topic || '—'} />
                <Row label="Region" value={job.region || '—'} />
                <Row label="Type" value={job.content_type || '—'} />
                <Row label="Host" value={job.owner_host || '—'} />
                <Row label="Repo" value={job.target_repo || '—'} mono />
                <Row label="Path" value={job.content_path || '—'} mono />
                <Row label="Canonical" value={job.canonical_url || '—'} mono />
                <Row label="Indexable" value={job.indexable === false ? 'no' : 'yes'} />
                <Row label="Ship mode" value={job.ship_mode || '—'} />
                <Row label="AI" value={job.ai_provider ? `${job.ai_provider}${job.ai_model ? ` · ${job.ai_model}` : ''}` : '—'} />
                <Row label="SEO score" value={job.seo_score != null ? String(job.seo_score) : '—'} />
                <Row label="Words" value={job.word_count != null ? String(job.word_count) : String(words)} />
                <Row label="Job ID" value={job.id} mono />
                <Row label="Created" value={job.created_at ? new Date(job.created_at).toLocaleString() : '—'} />
                <Row label="Updated" value={job.updated_at ? new Date(job.updated_at).toLocaleString() : '—'} />
                {job.audit_json && (
                  <div>
                    <div style={{ color: C.muted, marginBottom: 4 }}>Audit JSON</div>
                    <pre style={{
                      margin: 0, whiteSpace: 'pre-wrap', fontSize: 10, color: C.muted,
                      background: C.panel, padding: 10, borderRadius: 8, maxHeight: 220, overflow: 'auto',
                    }}>
                      {JSON.stringify(job.audit_json, null, 2).slice(0, 6000)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.55, padding: 8 }}>
      {children}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, alignItems: 'start' }}>
      <div style={{ color: C.dim, fontSize: 11 }}>{label}</div>
      <div style={{
        color: C.text, fontSize: 12, wordBreak: 'break-all',
        fontFamily: mono ? C.mono : 'inherit',
      }}>
        {value}
      </div>
    </div>
  )
}

function btn(bg?: string, strong?: boolean): React.CSSProperties {
  return {
    background: bg || 'rgba(255,255,255,0.06)',
    color:
      strong && (bg === C.gold || bg === C.cyan || bg === C.green)
        ? '#0B1220'
        : C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    opacity: 1,
  }
}

const metaInput: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: 12,
  boxSizing: 'border-box',
}
