'use client'
import { useState, useCallback, useEffect } from 'react'

// ── Color system (matches sibling admin panels) ─────────────────────
const C = {
  surface: '#FFFFFF', border: 'rgba(0,0,0,0.07)',
  red: '#DC2626', redBg: '#FEF2F2', green: '#166534', greenBg: '#F0FDF4',
  orange: '#D97706', orangeBg: '#FFFBEB', amber: '#92400E',
  text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  purple: '#7C3AED', blue: '#2563EB', blueBg: '#EFF6FF',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Garamond, Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, Monaco, monospace)",
}

type Alert = {
  id: string; job_id: string; title: string | null; status: string | null
  content_type: string | null; region: string | null; primary_keyword: string | null
  rhythm_key: string; count: number; severity: string; remediable: boolean; run_ts: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: C.textDim, drafting: C.orange, drafting_retry: C.orange, drafting_blocked: C.red,
  review: C.blue, approved: C.green, merged: C.green, closed: C.textMuted, failed: C.red,
}

const timeAgo = (ts: string | null) => {
  if (!ts) return 'never'
  const ms = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function AdminRhythmAlertsPanel({ onOpenJob }: { onOpenJob?: (jobId: string) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [latestRunTs, setLatestRunTs] = useState<string | null>(null)
  const [totals, setTotals] = useState({ flagged: 0, remediable: 0, blockers: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'all' | 'remediable' | 'blocker'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/content-studio/rhythm-alerts', { headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(e.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setAlerts(data.alerts || [])
      setLatestRunTs(data.latestRunTs || null)
      setTotals(data.totals || { flagged: 0, remediable: 0, blockers: 0 })
    } catch (err: any) {
      setError(err.message || 'Failed to load rhythm alerts')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = alerts.filter((a) => {
    if (filter === 'remediable') return a.remediable
    if (filter === 'blocker') return a.severity === 'blocker'
    return true
  })

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const pill = (fg: string, bg: string, label: string) => (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: bg, color: fg, fontFamily: C.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
  )

  return (
    <div>
      {/* Totals + controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {pill(C.red, C.redBg, `${totals.flagged} FLAGGED`)}
          {pill(C.green, C.greenBg, `${totals.remediable} ONE-CLICK FIX`)}
          {totals.blockers > 0 && pill(C.amber, C.orangeBg, `${totals.blockers} BLOCKER`)}
          <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>last scan {timeAgo(latestRunTs)}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['all', 'remediable', 'blocker'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '2px 8px', borderRadius: 4, border: `1px solid ${filter === f ? C.blue : C.border}`,
                background: filter === f ? C.blueBg : C.surface, color: filter === f ? C.blue : C.textMuted,
                fontFamily: C.mono, fontSize: 8, cursor: 'pointer', fontWeight: 600,
              }}
            >
              {f === 'all' ? 'All' : f === 'remediable' ? 'Fixable' : 'Blockers'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            style={{
              padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontFamily: C.mono, fontSize: 8,
              cursor: busy ? 'wait' : 'pointer', fontWeight: 600,
            }}
          >
            {busy ? '⟳' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 10px', borderLeft: `3px solid ${C.red}`, background: C.redBg, color: C.red, fontFamily: C.mono, fontSize: 9, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '6px 10px', borderLeft: `3px solid ${C.green}`, background: C.greenBg, color: C.green, fontFamily: C.mono, fontSize: 9, marginBottom: 8 }}>
          {notice}
        </div>
      )}

      {!busy && filtered.length === 0 && !error && (
        <div style={{ padding: '14px 0', color: C.textMuted, fontFamily: C.mono, fontSize: 9 }}>
          {alerts.length === 0
            ? 'No rhythm alerts yet — the weekly scan (Mon 06:00 UTC) will populate this list. Use the workflow_dispatch trigger to run it now.'
            : 'No alerts match this filter.'}
        </div>
      )}

      {/* Alert rows */}
      {filtered.slice(0, 50).map((a) => {
        const key = `${a.run_ts}:${a.job_id}`
        const isOpen = expanded.has(key)
        return (
          <div
            key={key}
            style={{
              border: `1px solid ${C.border}`, borderRadius: 4, marginBottom: 5,
              background: a.severity === 'blocker' ? '#FDF2F8' : C.surface,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(key) } }}
              style={{ padding: '7px 10px', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap' }}
            >
              <span style={{ fontFamily: C.mono, fontSize: 9, color: a.severity === 'blocker' ? C.red : C.orange, fontWeight: 700, minWidth: 34 }}>
                {a.count}×
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 9, color: C.text, flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                “{a.rhythm_key}…”
              </span>
              <span style={{ fontFamily: C.serif, fontSize: 11, color: C.text, flex: 2, minWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title || a.primary_keyword || a.job_id}
              </span>
              {a.status && pill(STATUS_COLORS[a.status] || C.textMuted, '#F9FAFB', String(a.status).toUpperCase())}
              {a.severity === 'blocker' && pill(C.red, C.redBg, 'BLOCKER')}
              {a.remediable && pill(C.green, C.greenBg, 'FIXABLE')}
              <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>{isOpen ? '▾' : '▸'}</span>
            </div>
            {isOpen && (
              <div style={{ padding: '4px 10px 10px', borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 8, color: C.textMuted, margin: '6px 0 8px' }}>
                  <span>job <strong style={{ color: C.text }}>{a.job_id}</strong></span>
                  {a.content_type && <span>type <strong style={{ color: C.text }}>{a.content_type}</strong></span>}
                  {a.region && <span>region <strong style={{ color: C.text }}>{a.region}</strong></span>}
                  {a.primary_keyword && <span>kw <strong style={{ color: C.text }}>{a.primary_keyword}</strong></span>}
                  <span>run <strong style={{ color: C.text }}>{new Date(a.run_ts).toLocaleString()}</strong></span>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 8, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                  {a.remediable
                    ? 'Deterministic repair fully clears this warning — open the draft and click Re-audit / Fix all warnings.'
                    : 'Extreme repetition — deterministic repair reduces it but cannot fully clear. The AI targeted sweep (Re-audit) is required.'}
                </div>
                {onOpenJob && (
                  <button
                    type="button"
                    onClick={() => onOpenJob(a.job_id)}
                    style={{
                      padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.blue}`,
                      background: C.blue, color: '#FFF', fontFamily: C.mono, fontSize: 8,
                      cursor: 'pointer', fontWeight: 700,
                    }}
                  >
                    Open in editor →
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {filtered.length > 50 && (
        <div style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim, padding: '6px 0' }}>
          …showing 50 of {filtered.length} — use the filter chips to narrow.
        </div>
      )}
    </div>
  )
}
