'use client'
/**
 * SEO Command Center — full rebuild of the war room.
 *
 * One mission surface (no tab sprawl):
 *   Command bar  → live source + controls
 *   KPI strip    → clickable mission readout
 *   Radar        → Opportunity Engine plays, ranked with signals
 *   Brief        → autopilot composer (everything auto-filled, editable)
 *   Pipeline     → live job queue + cannibal watch
 *   Systems      → health · metrics · strategies · GSC status
 *   Workspace    → pinned editor + PR + log pane
 */
import React from 'react'
import ContentStudioWorkspace, {
  createLog,
  type PrStatus,
  type StudioJob,
  type StudioLogEntry,
} from './content-studio-workspace'
import AiKeyVaultPanel from './ai-key-vault-panel'

// ── Color tokens (match portal identity) ──
const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', border2: 'rgba(0,0,0,0.05)',
  cyan: '#1E1B4B', cyan2: '#3C3B6E', cyanSoft: '#EEF2FF',
  gold: '#9A7B3B', goldSoft: '#FEF3C7', goldBorder: '#FDE68A',
  text: '#111827', textMuted: '#6B7280', textDim: '#9CA3AF', textFaint: '#D1D5DB',
  green: '#065F46', greenSoft: '#ECFDF5', greenBorder: '#A7F3D0',
  red: '#991B1B', redSoft: '#FEF2F2', redBorder: '#FECACA',
  orange: '#9A3412', orangeSoft: '#FFF7ED',
  blue: '#1D4ED8', blueSoft: '#EFF6FF', blueBorder: '#BFDBFE',
  violet: '#6D28D9', violetSoft: '#F5F3FF',
  navy: '#0F172A',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
  shadowCard: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
  radius: 12, radiusSm: 8, radiusXs: 6,
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto' | 'merge'
type RadarPlay =
  | 'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh' | 'defend' | 'cannibalization'
  | 'title_ctr_rewrite' | 'strike_distance' | 'deep_demand_build'
  | 'cannibal_merge' | 'aeo_entity_hub' | 'page1_defend' | 'decay_refresh'

const PLAY_META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  quick_win: { label: 'QUICK WIN', bg: '#D1FAE5', fg: '#065F46', icon: '⚡' },
  content_gap: { label: 'CONTENT GAP', bg: '#DBEAFE', fg: '#1E40AF', icon: '🧩' },
  refresh: { label: 'REFRESH', bg: '#FEF3C7', fg: '#92400E', icon: '🔄' },
  defend: { label: 'DEFEND', bg: '#EEF2FF', fg: '#3730A3', icon: '🛡️' },
  cannibalization: { label: 'CANNIBAL', bg: '#FEE2E2', fg: '#991B1B', icon: '⚠️' },
  cannibal_merge: { label: 'CANNIBAL MERGE', bg: '#FEE2E2', fg: '#991B1B', icon: '⚠️' },
  strike_distance: { label: 'STRIKE', bg: '#DBEAFE', fg: '#1E40AF', icon: '⚡' },
  deep_demand_build: { label: 'DEEP BUILD', bg: '#EDE9FE', fg: '#5B21B6', icon: '🧱' },
  title_ctr_rewrite: { label: 'CTR REWRITE', bg: '#FEF3C7', fg: '#92400E', icon: '✏️' },
  aeo_entity_hub: { label: 'AEO HUB', bg: '#F5F3FF', fg: '#6D28D9', icon: '🧠' },
  page1_defend: { label: 'PAGE-1 DEFEND', bg: '#ECFDF5', fg: '#065F46', icon: '🛡️' },
  decay_refresh: { label: 'DECAY REFRESH', bg: '#FFF7ED', fg: '#9A3412', icon: '⏳' },
}

const INTENT_LABELS: Record<string, string> = {
  informational: '📖 Informational', commercial: '🔍 Commercial',
  transactional: '🛒 Transactional', local: '📍 Local', navigational: '🧭 Navigational',
}

const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  rising: { icon: '↗', color: '#059669', label: 'Rising' },
  flat: { icon: '→', color: '#9CA3AF', label: 'Flat' },
  declining: { icon: '↘', color: '#DC2626', label: 'Declining' },
}

const RADAR_FILTERS: Array<{ key: RadarPlay; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'quick_win', label: '⚡ Quick Wins' },
  { key: 'content_gap', label: '🧩 Gaps' },
  { key: 'rising', label: '↗ Rising' },
  { key: 'refresh', label: '🔄 Refresh' },
  { key: 'defend', label: '🛡️ Defend' },
  { key: 'cannibalization', label: '⚠️ Cannibal' },
]

function fmtN(n: number | undefined | null): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

function timeAgo(ts: string | undefined | null): string {
  if (!ts) return '—'
  const d = new Date(ts).getTime()
  if (!Number.isFinite(d)) return '—'
  const s = Math.max(0, Math.round((Date.now() - d) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Queued', bg: '#F3F4F6', fg: '#6B7280' },
  drafting: { label: 'Drafting', bg: '#FEF3C7', fg: '#D97706' },
  publishing: { label: 'Opening PR', bg: '#DBEAFE', fg: '#3B82F6' },
  pr_created: { label: 'PR Ready', bg: '#DBEAFE', fg: '#2563EB' },
  merged: { label: 'Merged', bg: '#D1FAE5', fg: '#166534' },
  closed: { label: 'Closed', bg: '#F3F4F6', fg: '#6B7280' },
  failed: { label: 'Failed', bg: '#FEE2E2', fg: '#DC2626' },
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = STATUS_META[String(status || '')] || { label: String(status || '—'), bg: '#F3F4F6', fg: '#6B7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: s.fg }} />{s.label}
    </span>
  )
}

function PlayBadge({ play }: { play?: string | null }) {
  const pm = PLAY_META[String(play || '')] || PLAY_META.content_gap
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg, whiteSpace: 'nowrap' }}>
      {pm.icon} {pm.label}
    </span>
  )
}

function TrendSpark({ o, onOpen }: { o: any; onOpen?: (row: any) => void }) {
  const hist = Array.isArray(o?.history) ? o.history.filter((h: any) => h && h.position > 0) : []
  if (hist.length < 2) {
    const tm = TREND_META[o?.trend || 'flat'] || TREND_META.flat
    return <span style={{ fontSize: 10, fontFamily: C.mono, color: tm.color }}>{tm.icon} {tm.label}</span>
  }
  const pts = hist.map((h: any) => Number(h.position))
  const w = 64, h = 18, pad = 2
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = Math.max(1, max - min)
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2)
  const y = (p: number) => pad + ((max - p) / span) * (h - pad * 2)
  const first = pts[0], last = pts[pts.length - 1]
  const improving = last < first
  const color = improving ? '#059669' : last > first ? '#DC2626' : '#9CA3AF'
  const poly = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const clickable = !!onOpen
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={() => onOpen && onOpen(o)}
        title={clickable ? 'Open position history' : undefined}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: clickable ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
        }}
      >
        <svg width={w} height={h} style={{ display: 'block' }}>
          <polyline points={poly} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={x(pts.length - 1)} cy={y(last)} r={2} fill={color} />
        </svg>
        <span style={{ fontSize: 9, fontFamily: C.mono, color, whiteSpace: 'nowrap' }}>
          #{first}→#{last}
        </span>
      </button>
      {clickable && (
        <span style={{ fontSize: 9, color: C.blue, cursor: 'pointer' }} title="Open position history">↗</span>
      )}
    </div>
  )
}

// ── Per-query position history chart (workspace pane) ──────────────────────
function QueryTrendChart({ o }: { o: any }) {
  const hist = Array.isArray(o?.history) ? o.history.filter((h: any) => h && h.position > 0) : []
  const W = 320, H = 170, padL = 28, padR = 12, padT = 14, padB = 24
  if (hist.length < 2) {
    return (
      <div style={{ padding: 18, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>
        No position history for this query yet.
        <br />
        <span style={{ fontSize: 10 }}>Connect live GSC to track movement over time.</span>
      </div>
    )
  }
  const pts = hist.map((h: any) => Number(h.position))
  const imps = hist.map((h: any) => Number(h.impressions) || 0)
  const maxImp = Math.max(...imps, 1)
  const minPos = Math.min(...pts), maxPos = Math.max(...pts)
  const posSpan = Math.max(1, maxPos - minPos)
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW
  const y = (p: number) => padT + ((maxPos - p) / posSpan) * plotH
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const area = `${padL},${padT + plotH} ${line} ${x(pts.length - 1).toFixed(1)},${padT + plotH}`
  const improving = pts[pts.length - 1] < pts[0]
  const color = improving ? '#059669' : pts[pts.length - 1] > pts[0] ? '#DC2626' : '#9CA3AF'
  const first = pts[0], last = pts[pts.length - 1]
  const gridVals = Array.from(new Set([minPos, Math.round((minPos + maxPos) / 2), maxPos]))
  const dateLabel = (d?: string) => (d ? d.slice(5) : '')
  return (
    <div>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
        {gridVals.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke={C.border2} strokeWidth={1} />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize={8} fill={C.textDim} fontFamily={C.mono}>
              #{g}
            </text>
          </g>
        ))}
        {imps.map((v, i) => {
          const bh = Math.max(2, (v / maxImp) * plotH * 0.32)
          return (
            <rect key={`b${i}`} x={x(i) - 6} y={padT + plotH - bh} width={12} height={bh}
              fill={C.cyanSoft} rx={2} opacity={0.75} />
          )
        })}
        <polygon points={area} fill={color} opacity={0.08} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={`d${i}`}>
            <circle cx={x(i)} cy={y(p)} r={3.2} fill={color} stroke="#fff" strokeWidth={1.2} />
            <text x={x(i)} y={y(p) - 7} textAnchor="middle" fontSize={8.5} fill={C.textMuted} fontFamily={C.mono} fontWeight={700}>
              #{p}
            </text>
          </g>
        ))}
        {hist.map((h: any, i: number) => (
          <text key={`x${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize={8} fill={C.textDim} fontFamily={C.mono}>
            {dateLabel(h.date)}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          ['First', `#${first}`],
          ['Now', `#${last}`],
          ['Δ', `${last - first > 0 ? '+' : ''}${last - first}`],
          ['Peak imp', fmtN(maxImp)],
          ['Windows', String(pts.length)],
        ].map(([k, v]) => (
          <div key={k} style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, lineHeight: 1.4 }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 11 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreMeter({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.max(2, Math.min(100, (Number(score) || 0) / max * 100))
  const color = score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.surface3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: C.mono, color, minWidth: 26, textAlign: 'right' }}>{Math.round(score)}</span>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted,
  textTransform: 'uppercase', marginBottom: 5, fontFamily: C.mono,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 12, fontFamily: 'inherit',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: C.navy, color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: C.radiusXs, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontFamily: 'inherit',
}
const btnSmall: React.CSSProperties = {
  padding: '4px 9px', borderRadius: 5, border: 'none', cursor: 'pointer',
  background: C.surface2, color: C.text, fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
}
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textDim, fontFamily: C.mono, fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, verticalAlign: 'middle' }

type MissionEntry = {
  id: string
  kind: string
  status: 'success' | 'error' | 'info' | 'warn'
  source: string
  message: string
  detail: Record<string, unknown> | null
  job_id: string | null
  pr_url: string | null
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
export default function AdminCommandCenter({
  setActionNotice,
}: {
  setActionNotice: (msg: string) => void
}) {
  // ── Mission state ──
  const [busy, setBusy] = React.useState(false)
  const [activityLine, setActivityLine] = React.useState<string | null>(null)
  const [dryRun, setDryRun] = React.useState(false)
  const [regionFilter, setRegionFilter] = React.useState('')
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false)

  // Radar
  const [radar, setRadar] = React.useState<any>(null)
  const [radarBusy, setRadarBusy] = React.useState(false)
  const [radarFilter, setRadarFilter] = React.useState<RadarPlay>('all')
  const [radarLastRefreshed, setRadarLastRefreshed] = React.useState<Date | null>(null)
  const [resolvedTerms, setResolvedTerms] = React.useState<Set<string>>(new Set())
  const [selectedTerms, setSelectedTerms] = React.useState<Set<string>>(new Set())

  // Brief / launch
  const [brief, setBrief] = React.useState<any | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [launchFeed, setLaunchFeed] = React.useState<Array<{ ts: number; level: 'info' | 'success' | 'warn' | 'error'; msg: string }>>([])
  const [autoLimit, setAutoLimit] = React.useState(3)
  const [shipMode, setShipMode] = React.useState<ShipMode>('merge')
  const [minAudit, setMinAudit] = React.useState(65)
  const [maxRefine, setMaxRefine] = React.useState(2)
  const [aiProvider, setAiProvider] = React.useState('auto')

  // Pipeline / workspace
  const [jobs, setJobs] = React.useState<StudioJob[]>([])
  const [jobStatusFilter, setJobStatusFilter] = React.useState('all')
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
  const [selectedJob, setSelectedJob] = React.useState<StudioJob | null>(null)
  const [editorContent, setEditorContent] = React.useState('')
  const [prStatus, setPrStatus] = React.useState<PrStatus | null>(null)
  const [logs, setLogs] = React.useState<StudioLogEntry[]>([])

  // Systems
  const [health, setHealth] = React.useState<any>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const [strategies, setStrategies] = React.useState<any>(null)
  const [systemsOpen, setSystemsOpen] = React.useState(false)

  const pushLog = (level: StudioLogEntry['level'], source: string, message: string, detail?: string) =>
    setLogs((prev) => [...prev, createLog(level, source, message, detail)].slice(-150))

  const notify = (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
    setActionNotice(msg)
    pushLog(kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info', 'command', msg)
  }

  // ── Trend detail (per-query history chart) ───────────────────────────────
  const [trendDetail, setTrendDetail] = React.useState<any | null>(null)

  // ── Mission Log (persistent audit trail) ─────────────────────────────────
  const [missionLog, setMissionLog] = React.useState<MissionEntry[]>([])
  const [missionOpen, setMissionOpen] = React.useState(true)
  const [missionKind, setMissionKind] = React.useState('all')
  const [missionStatus, setMissionStatus] = React.useState('all')
  const [missionReload, setMissionReload] = React.useState(0)
  const [missionLoading, setMissionLoading] = React.useState(false)

  const recordMission = React.useCallback(
    (entry: {
      kind: string
      status: 'success' | 'error' | 'info' | 'warn'
      source?: string
      message: string
      detail?: Record<string, unknown>
      jobId?: string | null
      prUrl?: string | null
    }) => {
      const optimistic: MissionEntry = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: entry.kind,
        status: entry.status,
        source: entry.source || 'command',
        message: entry.message,
        detail: entry.detail ?? null,
        job_id: entry.jobId || null,
        pr_url: entry.prUrl || null,
        created_at: new Date().toISOString(),
      }
      setMissionLog((prev) => [optimistic, ...prev].slice(0, 120))
      fetch('/api/seo-factory/mission-log', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: entry.kind, status: entry.status, source: entry.source || 'command',
          message: entry.message, detail: entry.detail || {},
          job_id: entry.jobId || null, pr_url: entry.prUrl || null,
        }),
      }).catch(() => {})
    },
    [],
  )

  React.useEffect(() => {
    if (!missionOpen) return
    let cancelled = false
    setMissionLoading(true)
    const q = new URLSearchParams({ limit: '60' })
    if (missionKind !== 'all') q.set('kind', missionKind)
    if (missionStatus !== 'all') q.set('status', missionStatus)
    fetch(`/api/seo-factory/mission-log?${q.toString()}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setMissionLog(Array.isArray(data.entries) ? data.entries : [])
      })
      .catch(() => {
        if (!cancelled) setMissionLog((prev) => prev.filter((m) => m.id.startsWith('local-')))
      })
      .finally(() => {
        if (!cancelled) setMissionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [missionOpen, missionKind, missionStatus, missionReload])

  // ── Radar ────────────────────────────────────────────────────────────────
  const loadRadar = React.useCallback(async () => {
    setRadarBusy(true)
    try {
      const res = await fetch('/api/seo-factory/war-room', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90, limit: 50, minImpressions: 2, regionFilter: regionFilter || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Radar failed')
      setRadar(data)
      setRadarLastRefreshed(new Date())
      for (const w of data.warnings || []) pushLog('warn', 'radar', String(w))
      notify(
        data.kpis?.liveGsc
          ? `Radar · ${data.kpis.actionable} plays · ~${data.kpis.estimatedGainClicksSum} est. clicks/mo (live GSC)`
          : `Radar · ${data.kpis?.actionable || 0} plays · snapshot data`,
        'success',
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Radar failed', 'error')
    } finally {
      setRadarBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter])

  const playOf = (o: any): string => o.enginePlay || o.play || 'content_gap'
  const scoreOf = (o: any): number => o.opportunityScore ?? o.priorityScore ?? 0

  const radarQueue = React.useMemo(() => {
    const q: any[] = (radar?.queue || []).filter((o: any) => !resolvedTerms.has(String(o.term || '')))
    if (radarFilter === 'all') return q
    if (radarFilter === 'rising') return q.filter((o) => o.trend === 'rising')
    if (radarFilter === 'quick_win') return q.filter((o) => playOf(o) === 'quick_win' || playOf(o) === 'strike_distance')
    if (radarFilter === 'content_gap') return q.filter((o) => playOf(o) === 'content_gap' || playOf(o) === 'deep_demand_build')
    if (radarFilter === 'refresh') return q.filter((o) => playOf(o) === 'refresh' || playOf(o) === 'decay_refresh' || playOf(o) === 'title_ctr_rewrite')
    if (radarFilter === 'defend') return q.filter((o) => playOf(o) === 'defend' || playOf(o) === 'page1_defend')
    return q.filter((o) => playOf(o) === radarFilter || o.play === radarFilter)
  }, [radar, radarFilter, resolvedTerms])

  const cannibals = React.useMemo(() => {
    const fromQueue = (radar?.queue || []).filter((o: any) => playOf(o) === 'cannibalization' || o.play === 'cannibal_merge')
    const fromBuckets = (radar?.buckets?.cannibal_merge || [])
    return [...fromQueue, ...fromBuckets].filter(
      (o, i, arr) => arr.findIndex((x) => x.term === o.term) === i,
    )
  }, [radar])

  const kpis = React.useMemo(() => {
    const rk = radar?.kpis || {}
    const c = { inflight: 0, pr: 0, merged: 0, failed: 0 }
    for (const j of jobs) {
      const s = String(j.status || '').toLowerCase()
      if (s === 'drafting' || s === 'publishing' || s === 'pending') c.inflight++
      else if (s === 'pr_created') c.pr++
      else if (s === 'merged') c.merged++
      else if (s === 'failed') c.failed++
    }
    return {
      actionable: rk.actionable ?? radarQueue.length,
      gain: Math.round(rk.estimatedGainClicksSum ?? radarQueue.reduce((s, o) => s + (Number(o.estimatedGainClicks) || 0), 0)),
      analyzed: rk.queriesAnalyzed ?? 0,
      authority: rk.avgAuthority ?? 0,
      inflight: c.inflight, pr: c.pr, failed: c.failed,
      liveGsc: rk.liveGsc ?? false,
      cannibals: cannibals.length,
    }
  }, [radar, radarQueue, jobs, cannibals])

  // ── Jobs / workspace ─────────────────────────────────────────────────────
  const loadJobs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/jobs?limit=40', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setJobs((data as { jobs?: StudioJob[] }).jobs ?? [])
    } catch {
      /* silent background poll */
    }
  }, [])

  const selectJob = React.useCallback(async (id: string) => {
    setSelectedJobId(id)
    setWorkspaceOpen(true)
    setPrStatus(null)
    try {
      const res = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok && data.job) {
        setSelectedJob(data.job)
        setEditorContent(data.job.content || '')
        if (Array.isArray(data.job.event_log)) setLogs(data.job.event_log.slice(-150))
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Job load failed', 'error')
    }
  }, [notify])

  const closeJob = React.useCallback(() => {
    setSelectedJobId(null)
    setSelectedJob(null)
    setEditorContent('')
    setPrStatus(null)
  }, [])

  const saveJobContent = async () => {
    if (!selectedJobId) return
    setBusy(true)
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedJobId, action: 'save', content: editorContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (data.job) setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
      notify(`Draft saved · SEO ${data.audit?.score ?? data.job?.seo_score ?? '—'} · ${data.job?.word_count ?? '—'} words`, 'success')
      recordMission({
        kind: 'save', status: 'success', source: 'jobs',
        message: `Draft saved · ${selectedJobId.slice(0, 8)}`,
        detail: {
          seo: data.audit?.score ?? data.job?.seo_score ?? null,
          words: data.job?.word_count ?? null,
        },
        jobId: selectedJobId,
      })
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Save failed', 'error')
      recordMission({
        kind: 'save', status: 'error', source: 'jobs',
        message: `Save failed · ${e instanceof Error ? e.message : 'save error'}`,
        jobId: selectedJobId,
      })
    } finally {
      setBusy(false)
    }
  }

  const jobAction = async (
    id: string,
    action: 'reship' | 'regenerate' | 'abandon' | 'approve' | 'merge_pr' | 'monitor' | 'reaudit' | 'duplicate' | 'update_meta',
    extra?: Record<string, unknown>,
  ) => {
    if (action === 'abandon' && !window.confirm('Abandon (close) this job?')) return
    if (action === 'regenerate' && !window.confirm('Regenerate will close this job and create a new one. Continue?')) return
    setBusy(true)
    setActivityLine(`${action}…`)
    pushLog('info', 'jobs', `${action} · ${id.slice(0, 8)}`)
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, action,
          shipMode: action === 'approve' ? 'autodeploy' : 'pr',
          minAuditScore: minAudit, maxRefine,
          dryRun: action === 'approve' ? dryRun : false,
          ...(extra || {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${action} failed`)
      if (data.job) setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
      notify(`${action} · ${id.slice(0, 8)}${data.prUrl ? ` → ${data.prUrl}` : ''}`, 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : `${action} failed`, 'error')
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const refreshPrStatus = async () => {
    if (!selectedJobId) return
    setBusy(true)
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedJobId, action: 'refresh_pr' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'PR refresh failed')
      if (data.job) setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
      setPrStatus(data.prStatus || null)
      recordMission({
        kind: 'refresh', status: 'success', source: 'jobs',
        message: `PR status refreshed · ${selectedJobId.slice(0, 8)}${data.prStatus?.state ? ` · ${data.prStatus.state}` : ''}`,
        jobId: selectedJobId,
        prUrl: data.prStatus?.url || null,
      })
    } catch (e) {
      notify(e instanceof Error ? e.message : 'PR refresh failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  // ── Brief / autopilot composer ───────────────────────────────────────────
  const applyBrief = (o: any) => {
    const play = playOf(o)
    // Prefer the keyword-cluster's terms (real GSC clustering) over signal-splitting heuristics.
    const clusterKw = Array.isArray(o.cluster?.keywords) ? o.cluster.keywords : []
    const kw = clusterKw.length
      ? clusterKw.slice(0, 8)
      : [o.term, ...((o.signals || []).map((s: string) => s.split(' ').slice(0, 3).join(' ')).filter((s: string) => s.length > 4))].slice(0, 6)
    setBrief({
      topic: o.term,
      title: o.writeHint && String(o.writeHint).startsWith('PLAY') ? o.term.replace(/\b\w/g, (c: string) => c.toUpperCase()) : o.term,
      primaryKeyword: o.term,
      keywords: kw,
      audience: 'international students, H-1B professionals, green card applicants',
      contentType: o.contentType || (play === 'cannibalization' || play === 'cannibal_merge' ? 'article' : 'blog_post'),
      tone: o.intent === 'commercial' ? 'persuasive' : o.intent === 'transactional' ? 'professional' : 'educational',
      region: regionFilter || 'US',
      play,
      intent: o.intent || 'informational',
      signals: o.signals || [],
      interlinks: o.interlinks || [],
      score: scoreOf(o),
      cluster: o.cluster || null,
    })
    setLaunchFeed([])
    setWorkspaceOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const clearBrief = () => setBrief(null)

  const runGenerate = async () => {
    if (!brief) return
    setGenerating(true)
    setLaunchFeed([{ ts: Date.now(), level: 'info', msg: 'Connecting to the SEO generation pipeline…' }])
    const record = (level: 'info' | 'success' | 'warn' | 'error', msg: string) =>
      setLaunchFeed((prev) => [...prev, { ts: Date.now(), level, msg }].slice(-60))
    try {
      const contentTypeMap: Record<string, string> = {
        blog_post: 'blog_summary', article: 'legal_guide',
        regional_page: 'regional_page', marketplace_gig: 'marketplace_gig',
      }
      const res = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          topic: brief.topic, title: brief.title || brief.topic,
          primaryKeyword: brief.primaryKeyword || brief.topic,
          region: brief.region || 'US', contentType: contentTypeMap[brief.contentType] || 'legal_guide',
          tone: brief.tone || 'educational', audience: brief.audience,
          keywords: brief.keywords, shipMode: 'pr', indexable: true,
          minAuditScore: minAudit, maxRefine,
          aiProvider,
          interlinks: brief.interlinks || [],
          cluster: brief.cluster || null,
          opportunity: { primaryKeyword: brief.primaryKeyword, play: brief.play, intent: brief.intent, opportunityScore: brief.score, signals: brief.signals },
        }),
      })
      if (!res.ok) {
        const failure = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(failure.error || `Generation stream HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Generation stream returned no readable body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let jobId: string | null = null
      let lastPrUrl: string | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          let ev: any
          try { ev = JSON.parse(payload) } catch { continue }
          if (ev.type === 'progress') record('info', String(ev.message || ev.stage || 'progress'))
          else if (ev.type === 'provider') record('info', `Provider: ${ev.provider}${ev.model ? ` · ${ev.model}` : ''}`)
          else if (ev.type === 'delta') {
            const chars = ev.charCount ?? ev.bytes ?? ''
            if (chars) setLaunchFeed((prev) => [...prev.slice(0, -1), { ts: Date.now(), level: 'info', msg: `Drafting… ${chars} chars` }])
          }
          else if (ev.type === 'attempt') record('info', `Refine attempt ${ev.attempt} · score ${ev.audit?.score ?? '—'}`)
          else if (ev.type === 'ship') {
            record('success', `Shipped: ${ev.mode || 'pr'}${ev.prUrl ? ` → ${ev.prUrl}` : ''}`)
            if (ev.prUrl) lastPrUrl = String(ev.prUrl)
          }
          else if (ev.type === 'final') {
            jobId = ev.jobId || ev.job?.id || null
            record('success', `Done · job ${String(jobId || '').slice(0, 8)}`)
          }
          else if (ev.type === 'error') throw new Error(ev.error || 'Generation failed')
        }
      }
      if (jobId) {
        await loadJobs()
        setSelectedJobId(jobId)
        selectJob(jobId)
      }
      notify(jobId ? `Generation complete · ${jobId.slice(0, 8)}` : 'Generation complete', 'success')
      recordMission({
        kind: 'launch', status: 'success', source: 'generate-stream',
        message: `Launch complete · “${brief.topic.slice(0, 60)}”`,
        detail: {
          topic: brief.topic,
          contentType: brief.contentType || null,
          provider: aiProvider,
          play: brief.play || null,
          score: brief.score ?? null,
        },
        jobId,
        prUrl: lastPrUrl,
      })
    } catch (e) {
      record('error', e instanceof Error ? e.message : 'Generation failed')
      notify(e instanceof Error ? e.message : 'Generation failed', 'error')
      recordMission({
        kind: 'launch', status: 'error', source: 'generate-stream',
        message: `Launch failed · ${e instanceof Error ? e.message : 'generation failed'}`,
        detail: { topic: brief.topic },
      })
    } finally {
      setGenerating(false)
    }
  }

  // ── Autopilot (batch run selected radar plays) ───────────────────────────
  const runAutopilot = async () => {
    const terms = [...selectedTerms]
    if (!terms.length) {
      notify('Select radar plays first', 'info')
      return
    }
    setBusy(true)
    setWorkspaceOpen(true)
    setActivityLine(`Auto-Pilot · ${terms.length} plays · ${shipMode}…`)
    pushLog('info', 'autopilot', `Start auto-run · ${terms.length} terms · mode ${shipMode}`)
    let autoSummary: any = null
    const body = JSON.stringify({
      limit: terms.length, shipMode, dryRun,
      minAuditScore: minAudit, maxRefine, skipRecent: true,
      regionFilter: regionFilter || undefined,
      terms, useWarRoom: true, minImpressions: 2, aiProvider,
    })
    try {
      const res = await fetch('/api/seo-factory/auto-run-stream', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body,
      })
      if (!res.ok) {
        const failure = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(failure.error || `Auto-pilot HTTP ${res.status}`)
      }
      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            let ev: any
            try { ev = JSON.parse(payload) } catch { continue }
            if (ev.type === 'progress' || ev.type === 'attempt' || ev.type === 'ship' || ev.type === 'final') {
              const m = ev.message || (ev.type === 'ship' ? `Shipped ${ev.term || ''}` : ev.type)
              if (m) pushLog('info', 'autopilot', String(m))
              if (ev.type === 'ship' && ev.prUrl) pushLog('success', 'autopilot', `PR: ${ev.prUrl}`)
              if (ev.type === 'final') autoSummary = ev
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Auto-pilot failed')
            }
          }
        }
      }
      await loadJobs()
      const results = Array.isArray(autoSummary?.results) ? autoSummary.results : []
      const shipped =
        autoSummary?.shipped != null
          ? autoSummary.shipped
          : results.filter((r: any) => r.ok).length
      recordMission({
        kind: 'autopilot', status: 'success', source: 'auto-run-stream',
        message: `Auto-pilot complete · ${terms.length} play${terms.length === 1 ? '' : 's'} · ${shipped} shipped`,
        detail: {
          terms,
          shipMode,
          provider: aiProvider,
          shipped,
          candidateCount: autoSummary?.candidateCount ?? results.length,
          results: results.slice(0, 12).map((r: any) => ({
            term: r.term || null, ok: !!r.ok, jobId: r.jobId || null, prUrl: r.prUrl || null,
          })),
        },
      })
      notify('Auto-pilot run complete', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Auto-pilot failed', 'error')
      recordMission({
        kind: 'autopilot', status: 'error', source: 'auto-run-stream',
        message: `Auto-pilot failed · ${e instanceof Error ? e.message : 'auto-pilot error'}`,
        detail: { terms },
      })
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  // ── Cannibal merge ───────────────────────────────────────────────────────
  const runCannibalMerge = async (o: any) => {
    const pages = (o.pages || []) as Array<{ url?: string; impressions?: number }>
    const winner = [...pages].sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0]?.url || pages[0]?.url
    if (!winner) {
      notify(`No pages to merge for “${o.term}”`, 'error')
      return
    }
    setBusy(true)
    try {
      const losers = pages.map((p) => String(p.url || '')).filter((u) => u && u !== winner)
      const res = await fetch('/api/seo-factory/cannibal-merge', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: o.term, winnerUrl: winner, loserUrls: losers, mode: 'merge' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'cannibal merge failed')
      setResolvedTerms((prev) => new Set(prev).add(String(o.term)))
      notify(`Merged “${o.term}” → ${winner.split('/').pop() || winner} (${(data.redirectsAdded || []).length} redirects)`, 'success')
      recordMission({
        kind: 'merge', status: 'success', source: 'cannibal-merge',
        message: `Merged “${o.term}” → ${winner.split('/').pop() || winner}`,
        detail: { term: o.term, winner, losers, redirects: (data.redirectsAdded || []).length },
      })
      loadRadar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'cannibal merge failed', 'error')
      recordMission({
        kind: 'merge', status: 'error', source: 'cannibal-merge',
        message: `Merge failed · ${e instanceof Error ? e.message : 'cannibal merge failed'}`,
        detail: { term: o.term },
      })
    } finally {
      setBusy(false)
    }
  }

  // ── Systems loaders ──────────────────────────────────────────────────────
  const loadHealth = async () => {
    try {
      const res = await fetch('/api/seo-factory/health', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setHealth(data)
    } catch { /* ignore */ }
  }
  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/seo-factory/metrics', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setMetrics(data)
    } catch { /* ignore */ }
  }
  const loadStrategies = async () => {
    try {
      const res = await fetch('/api/seo-factory/strategies?pack=index', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setStrategies(data.index || data)
    } catch { /* ignore */ }
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    loadRadar()
    loadJobs()
    loadHealth()
    loadMetrics()
    loadStrategies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll jobs while any are active
  React.useEffect(() => {
    const active = jobs.some((j) => ['pending', 'drafting', 'publishing'].includes(String(j.status || '')))
    if (!active) return
    const interval = setInterval(loadJobs, 6_000)
    return () => clearInterval(interval)
  }, [jobs, loadJobs])

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleTerm = (term: string) =>
    setSelectedTerms((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })

  const filteredJobs = jobs.filter((j) =>
    jobStatusFilter === 'all' ? true : String(j.status || '') === jobStatusFilter,
  )

  const jobCounts = React.useMemo(() => {
    const c: Record<string, number> = { all: jobs.length, drafting: 0, pr_created: 0, merged: 0, failed: 0 }
    for (const j of jobs) {
      const s = String(j.status || '')
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [jobs])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: workspaceOpen ? 'minmax(0, 1fr) minmax(360px, 380px)' : '1fr',
      gap: 0, minHeight: 'calc(100vh - 120px)', margin: '0 -8px',
    }}>
      {/* ── Command surface ── */}
      <div style={{ padding: '16px 20px 20px', width: '100%', maxWidth: 'none', overflow: 'auto', minWidth: 0 }}>
        {/* Command bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 16, flexWrap: 'wrap', marginBottom: 14,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: kpis.liveGsc ? C.green : C.gold, display: 'inline-block', boxShadow: `0 0 0 3px ${kpis.liveGsc ? 'rgba(6,95,70,0.15)' : 'rgba(154,123,59,0.2)'}` }} />
              <h1 style={{ margin: 0, fontSize: 26, color: C.navy, fontWeight: 700, letterSpacing: '-0.02em' }}>
                SEO Command Center
              </h1>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                fontFamily: C.mono, background: kpis.liveGsc ? C.greenSoft : C.goldSoft,
                color: kpis.liveGsc ? C.green : C.orange, letterSpacing: '0.06em',
              }}>
                {kpis.liveGsc ? '● LIVE GSC' : '◐ SNAPSHOT'}
              </span>
            </div>
            <p style={{ margin: 0, color: C.textMuted, fontSize: 13, maxWidth: 640 }}>
              The Opportunity Engine ranks what to ship — <strong>verifiable signals, one brain</strong> for radar, brief, and pipeline.
              {radarLastRefreshed && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}> · last sync {Math.round((Date.now() - radarLastRefreshed.getTime()) / 60_000)}m ago</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted }}>
              Region
              <select value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setRadar(null); loadRadar() }} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                <option value="">All</option>
                {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted }}>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry-run
            </label>
            <button type="button" onClick={loadRadar} disabled={radarBusy} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {radarBusy ? <span style={{ width: 11, height: 11, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: C.navy, borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} /> : '⟳'}
              {radarBusy ? 'Scanning…' : 'Rescan radar'}
            </button>
            <button type="button" onClick={() => setWorkspaceOpen((v) => !v)} style={{ ...btnSecondary, background: workspaceOpen ? C.navy : C.surface, color: workspaceOpen ? '#fff' : C.text }}>
              {workspaceOpen ? '✕ Hide workspace' : '◈ Workspace'}
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Actionable plays', value: String(kpis.actionable), sub: 'in radar queue', color: C.cyan2, onClick: () => setRadarFilter('all') },
            { label: 'Est. clicks / mo', value: `~${fmtN(kpis.gain)}`, sub: 'if plays ship', color: C.green, onClick: () => setRadarFilter('all') },
            { label: 'Queries analyzed', value: fmtN(kpis.analyzed), sub: 'GSC signals', color: C.text, onClick: () => {} },
            { label: 'Avg authority', value: String(kpis.authority || '—'), sub: 'win probability', color: C.violet, onClick: () => {} },
            { label: 'In flight', value: String(kpis.inflight), sub: 'jobs drafting', color: C.orange, onClick: () => setJobStatusFilter('drafting') },
            { label: 'PRs open', value: String(kpis.pr), sub: 'awaiting review', color: C.blue, onClick: () => setJobStatusFilter('pr_created') },
            { label: 'Cannibal watch', value: String(kpis.cannibals), sub: 'consolidate', color: C.red, onClick: () => setRadarFilter('cannibalization') },
          ].map((k) => (
            <button key={k.label} type="button" onClick={k.onClick} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: C.radiusSm,
              background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer',
              boxShadow: C.shadowCard, transition: 'transform 0.12s, box-shadow 0.12s', fontFamily: 'inherit',
            }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = C.shadowHover; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = C.shadowCard; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textDim, fontFamily: C.mono }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: C.mono, lineHeight: 1.2, marginTop: 2 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{k.sub}</div>
            </button>
          ))}
        </div>

        {/* ── Opportunity Radar ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🎯 Opportunity Radar</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
                Every play carries its <strong>signals trail</strong> — the exact data that drove the score.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {RADAR_FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setRadarFilter(f.key)} style={{
                  padding: '4px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: radarFilter === f.key ? C.navy : C.surface2,
                  color: radarFilter === f.key ? '#fff' : C.textMuted, transition: 'all 0.15s',
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          {selectedTerms.size > 0 && (
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`, background: C.cyanSoft, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.cyan2, fontWeight: 600 }}>{selectedTerms.size} play(s) selected</span>
              <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11 }}>
                <option value="pr">Create + PR</option>
                <option value="autodeploy">Create + approve</option>
                <option value="merge">Create + merge</option>
                <option value="none">Draft only</option>
              </select>
              <button type="button" onClick={runAutopilot} disabled={busy} style={{ ...btnPrimary, background: C.cyan2 }}>
                {busy ? 'Running…' : `Run autopilot (${selectedTerms.size})`}
              </button>
              <button type="button" onClick={() => setSelectedTerms(new Set())} style={btnSmall}>Clear</button>
            </div>
          )}

          {radarBusy && !radar ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 13, fontFamily: C.mono }}>
              Scanning GSC + coverage + registry…
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>
                    <th style={th}></th>
                    <th style={th}>Score</th>
                    <th style={th}>Play</th>
                    <th style={th}>Query</th>
                    <th style={th}>Pos</th>
                    <th style={th}>Trend</th>
                    <th style={th}>Impr</th>
                    <th style={th}>CTR</th>
                    <th style={th}>+Clicks</th>
                    <th style={th}>Why (signals)</th>
                    <th style={th}>Links</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {radarQueue.slice(0, 30).map((o) => {
                    const play = playOf(o)
                    const isCannibal = play === 'cannibalization' || play === 'cannibal_merge'
                    const tm = TREND_META[o.trend || 'flat'] || TREND_META.flat
                    return (
                      <tr key={o.id || o.term} style={{ borderBottom: `1px solid ${C.border2}`, transition: 'background 0.1s' }} onMouseEnter={(e) => { e.currentTarget.style.background = C.surface2 }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ ...td, width: 28 }}>
                          <input
                            type="checkbox"
                            checked={selectedTerms.has(String(o.term))}
                            onChange={() => toggleTerm(String(o.term))}
                            disabled={isCannibal}
                          />
                        </td>
                        <td style={{ ...td, minWidth: 100 }}>
                          <ScoreMeter score={scoreOf(o)} />
                        </td>
                        <td style={td}><PlayBadge play={play} /></td>
                        <td style={{ ...td, maxWidth: 240 }}>
                          <strong style={{ color: C.text }}>{o.term}</strong>
                          {o.intent && (
                            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 1 }}>
                              {INTENT_LABELS[o.intent] || o.intent} · {tm.icon} {tm.label}
                            </div>
                          )}
                          {o.cluster && (
                            <div style={{ marginTop: 3 }}>
                              <span title={o.cluster.reason || undefined} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999,
                                fontSize: 9, fontWeight: 700, fontFamily: C.mono, whiteSpace: 'nowrap',
                                background: o.cluster.mode === 'expand' ? C.goldSoft : C.blueSoft,
                                color: o.cluster.mode === 'expand' ? C.gold : C.blue,
                                border: `1px solid ${o.cluster.mode === 'expand' ? C.goldBorder : C.blueBorder}`,
                                cursor: 'default',
                              }}>
                                🕸 {o.cluster.keywords?.length || 1}-kw
                                {o.cluster.mode === 'expand'
                                  ? ` · expands ${String(o.cluster.targetUrl || '').split('/').filter(Boolean).slice(-2).join('/') || 'page'}`
                                  : ' · new page'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, fontFamily: C.mono }}>#{o.position ?? '—'}</td>
                        <td style={{ ...td, minWidth: 96 }}>
                          <TrendSpark o={o} onOpen={(row) => { setTrendDetail(row); setWorkspaceOpen(true) }} />
                        </td>
                        <td style={{ ...td, fontFamily: C.mono }}>{fmtN(o.impressions)}</td>
                        <td style={{ ...td, fontFamily: C.mono }}>{(Number(o.ctr) * 100).toFixed(1)}%</td>
                        <td style={{ ...td, color: C.green, fontWeight: 700, fontFamily: C.mono }}>~{fmtN(o.estimatedGainClicks ?? 0)}</td>
                        <td style={{ ...td, maxWidth: 300 }}>
                          <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.4 }}>
                            {(o.signals || [o.rationale]).slice(0, 2).map((s: string, i: number) => (
                              <div key={i}>• {s}</div>
                            ))}
                          </div>
                        </td>
                        <td style={{ ...td, fontSize: 10, color: C.gold, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                          {o.interlinks && o.interlinks.length ? `🔗 ${o.interlinks.length}` : '—'}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {!isCannibal && (
                            <button type="button" style={{ ...btnSmall, marginRight: 4 }} onClick={() => applyBrief(o)}>
                              Brief
                            </button>
                          )}
                          {isCannibal ? (
                            <button type="button" style={{ ...btnSmall, borderColor: C.redBorder, color: C.red }} onClick={() => runCannibalMerge(o)} disabled={busy}>
                              Merge
                            </button>
                          ) : (
                            <button type="button" style={{ ...btnSmall, background: C.navy, color: '#fff' }} onClick={() => { setSelectedTerms(new Set([String(o.term)])); runAutopilot() }} disabled={busy}>
                              Ship
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {radarQueue.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: 18, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                      No plays for this filter — rescan or change filter.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Brief composer ── */}
        {brief && (
          <div style={{ background: C.surface, border: `1px solid ${C.goldBorder}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.goldBorder}`, background: '#FEF9EC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🚀 Launch Play</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
                  Autopilot brief from the radar — every field pre-filled and editable. Draft → quality gates → GitHub PR.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <PlayBadge play={brief.play} />
                <ScoreMeter score={brief.score} />
                <button type="button" onClick={clearBrief} style={btnSmall}>✕ Clear</button>
              </div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Topic</label>
                <input value={brief.topic} onChange={(e) => setBrief({ ...brief, topic: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={brief.title} onChange={(e) => setBrief({ ...brief, title: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Keywords (comma-separated)</label>
                <input
                  value={(brief.keywords || []).join(', ')}
                  onChange={(e) => setBrief({ ...brief, keywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  style={inputStyle}
                />
                {brief.cluster && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
                      fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                      background: brief.cluster.mode === 'expand' ? C.goldSoft : C.blueSoft,
                      color: brief.cluster.mode === 'expand' ? C.gold : C.blue,
                      border: `1px solid ${brief.cluster.mode === 'expand' ? C.goldBorder : C.blueBorder}`,
                    }}>
                      🕸 Cluster · {brief.cluster.keywords?.length || 1} keywords · {brief.cluster.mode === 'expand' ? `expands ${brief.cluster.targetUrl || 'existing page'}` : 'one new unique page'}
                    </span>
                    {brief.cluster.reason && (
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{brief.cluster.reason}</span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Content type</label>
                <select
                  value={brief.contentType}
                  onChange={(e) => setBrief({ ...brief, contentType: e.target.value })}
                  style={inputStyle}
                >
                  <option value="blog_post">Blog Post</option>
                  <option value="article">Long-Form Article</option>
                  <option value="regional_page">Regional Page</option>
                  <option value="marketplace_gig">Marketplace Gig</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tone</label>
                <select value={brief.tone} onChange={(e) => setBrief({ ...brief, tone: e.target.value })} style={inputStyle}>
                  <option value="professional">Professional</option>
                  <option value="educational">Educational</option>
                  <option value="persuasive">Persuasive</option>
                  <option value="authoritative">Authoritative</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Audience</label>
                <input value={brief.audience || ''} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>AI Model</label>
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={inputStyle}>
                  <option value="auto">Auto (Grok → OpenAI → rest)</option>
                  <option value="grok">Grok (xAI)</option>
                  <option value="openai">OpenAI (GPT-5.6 Luna)</option>
                  <option value="nvidia-deepseek">NVIDIA DeepSeek</option>
                  <option value="cloudflare-ai">Cloudflare Workers AI</option>
                  <option value="groq">Groq (Llama)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              {brief.interlinks && brief.interlinks.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>🔗 Internal linking targets ({brief.interlinks.length})</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {brief.interlinks.slice(0, 6).map((l: any, i: number) => (
                      <span key={i} style={{ padding: '3px 8px', borderRadius: 5, background: '#FEF9EC', border: `1px solid ${C.goldBorder}`, fontSize: 10, fontFamily: C.mono, color: C.text }}>
                        {l.label} → {String(l.url || '').replace(/^https?:\/\//, '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Launch feed */}
            {launchFeed.length > 0 && (
              <div style={{ margin: '0 16px 12px', background: C.navy, color: '#E5E7EB', borderRadius: C.radiusSm, padding: '10px 12px', maxHeight: 180, overflowY: 'auto', fontFamily: C.mono, fontSize: 11 }}>
                {launchFeed.map((f, i) => (
                  <div key={i} style={{ color: f.level === 'success' ? '#34D399' : f.level === 'error' ? '#F87171' : f.level === 'warn' ? '#FBBF24' : '#E5E7EB' }}>
                    {f.level === 'success' ? '✓ ' : f.level === 'error' ? '✕ ' : '› '}{f.msg}
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '0 16px 16px' }}>
              <button
                type="button"
                onClick={runGenerate}
                disabled={generating || !brief.topic.trim()}
                style={{ ...btnPrimary, width: '100%', padding: '11px 0', fontSize: 13, opacity: generating ? 0.7 : 1 }}
              >
                {generating ? '⚡ Generating…' : `⚡ Generate & Open PR — “${brief.topic.slice(0, 48)}${brief.topic.length > 48 ? '…' : ''}”`}
              </button>
            </div>
          </div>
        )}

        {/* ── Pipeline ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🔀 Mission Pipeline</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Live job queue — auto-refreshes while drafting.</p>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['all', 'All'], ['drafting', 'Drafting'], ['pr_created', 'PRs'], ['merged', 'Merged'], ['failed', 'Failed']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setJobStatusFilter(k)} style={{
                  padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: jobStatusFilter === k ? C.navy : C.surface2,
                  color: jobStatusFilter === k ? '#fff' : C.textMuted,
                }}>
                  {label}{k !== 'all' && jobCounts[k] > 0 ? ` (${jobCounts[k]})` : ''}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>
                  <th style={th}>Status</th>
                  <th style={th}>Title / Topic</th>
                  <th style={th}>Model</th>
                  <th style={th}>Words</th>
                  <th style={th}>SEO</th>
                  <th style={th}>Created</th>
                  <th style={th}>PR</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.slice(0, 25).map((j) => (
                  <tr key={j.id} style={{ borderBottom: `1px solid ${C.border2}`, cursor: 'pointer' }} onClick={() => selectJob(j.id)} onMouseEnter={(e) => { e.currentTarget.style.background = C.surface2 }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={td}><StatusBadge status={j.status} /></td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.title || j.topic || j.primary_keyword || j.id.slice(0, 8)}</div>
                      <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>
                        {j.content_type || ''}{j.region ? ` · ${j.region}` : ''}{j.target_repo ? ` · ${j.target_repo}` : ''}
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: 10, fontFamily: C.mono, color: C.textMuted }}>
                      {j.ai_model || j.ai_provider || '—'}
                    </td>
                    <td style={{ ...td, fontFamily: C.mono }}>{fmtN(j.word_count ?? 0)}</td>
                    <td style={{ ...td, fontFamily: C.mono, fontWeight: 700, color: (j.seo_score ?? 0) >= 70 ? C.green : (j.seo_score ?? 0) >= 55 ? C.orange : C.textDim }}>
                      {j.seo_score ?? '—'}
                    </td>
                    <td style={{ ...td, fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{timeAgo(j.created_at)}</td>
                    <td style={{ ...td }}>
                      {j.pr_url ? (
                        <a href={j.pr_url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 11, fontFamily: C.mono, textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                          PR #{j.pr_number || '—'} ↗
                        </a>
                      ) : <span style={{ color: C.textDim, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" style={btnSmall} onClick={() => selectJob(j.id)}>Open</button>{' '}
                      {j.status === 'pr_created' && (
                        <button type="button" style={{ ...btnSmall, background: C.greenSoft, color: C.green }} onClick={() => jobAction(j.id, 'approve')}>Approve</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredJobs.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>No jobs yet — launch a play.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Cannibal watch ── */}
        {cannibals.length > 0 && (
          <div style={{ background: '#FEF2F2', border: `1px solid ${C.redBorder}`, borderRadius: C.radius, padding: '12px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.red, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Cannibalization watch ({cannibals.length})</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {cannibals.slice(0, 6).map((o, i) => (
                <span key={i} style={{ padding: '4px 10px', borderRadius: 6, background: '#fff', border: `1px solid ${C.redBorder}`, fontSize: 10, fontFamily: C.mono, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  “{o.term}”
                  <button type="button" style={{ ...btnSmall, color: C.red }} onClick={() => runCannibalMerge(o)} disabled={busy}>Merge</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Mission Log (persistent audit trail) ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={() => setMissionOpen((v) => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>📜 Mission Log</h2>
                <span style={{ fontSize: 12, color: C.textDim }}>{missionOpen ? '▲' : '▼'}</span>
              </button>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                persistent audit trail · {missionLog.length} shown{missionLoading ? ' · loading…' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {[['all', 'All'], ['launch', 'Launch'], ['autopilot', 'Autopilot'], ['merge', 'Merge'], ['save', 'Save'], ['refresh', 'Refresh']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setMissionKind(k)} style={{
                  padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: missionKind === k ? C.navy : C.surface2,
                  color: missionKind === k ? '#fff' : C.textMuted,
                }}>
                  {label}
                </button>
              ))}
              <span style={{ width: 1, height: 14, background: C.border, margin: '0 4px' }} />
              {[['all', 'All'], ['success', '✓'], ['error', '✕'], ['warn', '⚠']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setMissionStatus(k)} style={{
                  padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: missionStatus === k ? C.navy : C.surface2,
                  color: missionStatus === k ? '#fff' : C.textMuted,
                }}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setMissionReload((n) => n + 1)} style={btnSmall} disabled={missionLoading}>
                {missionLoading ? '…' : '↻'}
              </button>
            </div>
          </div>
          {missionOpen && (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {missionLog.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                  {missionLoading ? 'Loading mission history…' : 'No missions recorded yet — launch a play to start the audit trail.'}
                </div>
              )}
              {missionLog.map((m) => (
                <div key={m.id} style={{ padding: '9px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0,
                    background: m.status === 'success' ? C.green : m.status === 'error' ? C.red : m.status === 'warn' ? '#D97706' : C.textDim }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted }}>{m.kind}</span>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{m.message}</span>
                      {m.pr_url && (
                        <a href={m.pr_url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 10, fontFamily: C.mono, textDecoration: 'none' }}>PR ↗</a>
                      )}
                      {m.job_id && <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>job {m.job_id.slice(0, 8)}</span>}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 2, wordBreak: 'break-word' }}>
                      {timeAgo(m.created_at)} · {m.source}
                      {m.detail && Object.keys(m.detail).length > 0 ? ` · ${JSON.stringify(m.detail).slice(0, 140)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Systems ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <button type="button" onClick={() => setSystemsOpen((v) => !v)} style={{
            width: '100%', padding: '12px 18px', border: 'none', background: 'none', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: C.serif }}>⚙️ Systems</span>
            <span style={{ fontSize: 14, color: C.textDim }}>{systemsOpen ? '▲' : '▼'}</span>
          </button>
          {systemsOpen && (
            <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {/* Health */}
              <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: health?.ready ? C.green : C.orange }} />
                  System health {health?.ready ? '· ready' : '· needs setup'}
                </div>
                {(health?.checks || []).slice(0, 8).map((c: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: `1px solid ${C.border2}` }}>
                    <span style={{ color: C.textMuted }}>{c.label || c.name || c.key}</span>
                    <span style={{ fontFamily: C.mono, color: c.ok ? C.green : C.red }}>{c.ok ? 'OK' : 'FAIL'}</span>
                  </div>
                ))}
                {(health?.checks || []).length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>No checks loaded — <button type="button" style={btnSmall} onClick={loadHealth}>reload</button></div>}
              </div>
              {/* Metrics */}
              <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono, marginBottom: 8 }}>📊 Metrics</div>
                {metrics ? (
                  <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                    {Object.entries(metrics).filter(([k]) => !['daily', 'byDate'].includes(k)).slice(0, 10).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{k.replace(/([A-Z])/g, ' $1')}</span>
                        <span style={{ fontFamily: C.mono, color: C.text }}>{typeof v === 'number' ? fmtN(v) : String(v ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textDim }}>— <button type="button" style={btnSmall} onClick={loadMetrics}>load</button></div>
                )}
              </div>
              {/* Strategies */}
              <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono, marginBottom: 8 }}>🗂 Strategies registry</div>
                {strategies ? (
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    {(Array.isArray(strategies) ? strategies : strategies.groups || strategies.categories || []).slice(0, 8).map((s: any, i: number) => (
                      <div key={i} style={{ padding: '3px 0', borderBottom: `1px solid ${C.border2}`, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{s.title || s.label || s.name || String(s.path || s)}</span>
                        {(s.count != null || s.docs != null) && <span style={{ fontFamily: C.mono, color: C.text }}>{s.count ?? s.docs}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textDim }}>— <button type="button" style={btnSmall} onClick={loadStrategies}>load</button></div>
                )}
              </div>
              {/* GSC status */}
              <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono, marginBottom: 8 }}>🔎 GSC data source</div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                  <div>Mode: <strong style={{ color: C.text, fontFamily: C.mono }}>{radar?.source || '—'}</strong>
                    {radar?.historyAvailable ? <span style={{ color: C.green }}> · position history ✓</span> : null}
                  </div>
                  <div>Site: <span style={{ fontFamily: C.mono, color: C.text, wordBreak: 'break-all' }}>{radar?.siteUrl || '—'}</span></div>
                  {radar?.range ? (
                    <div>Range: <span style={{ fontFamily: C.mono, color: C.text }}>{radar.range.startDate} → {radar.range.endDate} ({radar.range.days}d)</span></div>
                  ) : null}
                  {radar?.snapshot?.generatedAt ? (
                    <div>Snapshot: <span style={{ fontFamily: C.mono, color: C.text }}>{radar.snapshot.generatedAt}</span>{radar.snapshot.source ? ` · ${radar.snapshot.source}` : ''}</div>
                  ) : null}
                  {radar?.source === 'live' && !radar?.historyAvailable ? (
                    <div style={{ color: C.orange, fontSize: 10 }}>⚠ History unavailable — bucket queries failed or range too short</div>
                  ) : null}
                  <div style={{ marginTop: 6 }}>
                    {(radar?.warnings || []).slice(0, 3).map((w: string, i: number) => (
                      <div key={i} style={{ color: C.orange, fontSize: 10 }}>⚠ {w}</div>
                    ))}
                  </div>
                </div>
              </div>
              {/* AI Keys vault */}
              <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.goldBorder}`, background: '#FFFDF7' }}>
                <AiKeyVaultPanel onChanged={loadHealth} />
              </div>
            </div>
          )}
        </div>

        {activityLine && (
          <div style={{ position: 'fixed', bottom: 16, right: workspaceOpen ? 404 : 20, padding: '10px 16px', borderRadius: C.radiusSm, background: C.navy, color: '#fff', fontSize: 12, fontFamily: C.mono, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
            {activityLine}
          </div>
        )}
      </div>

      {/* ── Workspace pane ── */}
      {workspaceOpen && (
        <div style={{ minHeight: 0, maxHeight: 'calc(100vh - 100px)', position: 'sticky', top: 0, alignSelf: 'start' }}>
          {trendDetail && (
            <div style={{ background: C.surface, border: `1px solid ${C.goldBorder}`, borderRadius: C.radius, boxShadow: C.shadowHover, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, wordBreak: 'break-word' }}>{trendDetail.term}</div>
                  <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <PlayBadge play={playOf(trendDetail)} />
                    <span style={{ color: (TREND_META[trendDetail.trend || 'flat'] || TREND_META.flat).color }}>
                      {(TREND_META[trendDetail.trend || 'flat'] || TREND_META.flat).icon} {(TREND_META[trendDetail.trend || 'flat'] || TREND_META.flat).label}
                    </span>
                    {trendDetail.positionDelta != null ? (
                      <span style={{ color: trendDetail.positionDelta < 0 ? C.green : trendDetail.positionDelta > 0 ? C.red : C.textDim }}>
                        Δ{trendDetail.positionDelta > 0 ? '+' : ''}{trendDetail.positionDelta}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button type="button" style={{ ...btnSmall, background: C.navy, color: '#fff' }} onClick={() => applyBrief(trendDetail)}>
                    ⚡ Brief
                  </button>
                  <button type="button" style={btnSmall} onClick={() => setTrendDetail(null)}>✕</button>
                </div>
              </div>
              <div style={{ padding: '14px 14px 12px' }}>
                <QueryTrendChart o={trendDetail} />
                {(trendDetail.signals || []).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border2}` }}>
                    {(trendDetail.signals || []).slice(0, 3).map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>• {s}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <ContentStudioWorkspace
            job={selectedJob}
            jobs={jobs as StudioJob[]}
            editorContent={editorContent}
            onEditorChange={setEditorContent}
            onSelectJob={selectJob}
            onSave={saveJobContent}
            onShip={() => selectedJobId && jobAction(selectedJobId, 'reship')}
            onApprove={() => selectedJobId && jobAction(selectedJobId, 'approve')}
            onMonitor={() => selectedJobId && jobAction(selectedJobId, 'monitor')}
            onRegenerate={() => selectedJobId && jobAction(selectedJobId, 'regenerate')}
            onRefreshPr={refreshPrStatus}
            onCloseJob={closeJob}
            onReaudit={() => selectedJobId && jobAction(selectedJobId, 'reaudit')}
            onDuplicate={() => selectedJobId && jobAction(selectedJobId, 'duplicate')}
            onMergePr={() => selectedJobId && jobAction(selectedJobId, 'merge_pr')}
            onAbandon={() => selectedJobId && jobAction(selectedJobId, 'abandon')}
            onUpdateMeta={(patch) => selectedJobId && jobAction(selectedJobId, 'update_meta', patch)}
            dryRun={dryRun}
            onToggleDryRun={() => setDryRun((d) => !d)}
            busy={busy}
            logs={logs}
            onClearLogs={() => setLogs([])}
            prStatus={prStatus}
            activityLine={activityLine}
          />
        </div>
      )}
    </div>
  )
}
