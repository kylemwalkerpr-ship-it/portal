'use client'
/**
 * SEO COMMAND CENTER — v3 rebuild
 *
 * Six dedicated surfaces, no buried controls:
 *
 *   🎯 Radar     — the full Opportunity Engine play list (signals trail on
 *                  every row), autopilot selection, cannibal merge actions.
 *   🚀 Launch    — the autopilot brief composer: every radar play lands here
 *                  pre-filled and editable, with a single primary CTA.
 *   📋 Pipeline  — every job in one filterable table with open/approve/ship.
 *   🧭 Engine    — the full SEO Master Engine (six brain surfaces, one tab).
 *   📜 Missions  — the persistent audit trail of every launch/merge/run.
 *   ⚙️ Systems   — health, metrics, strategies, GSC source, AI key vault.
 *
 * The workspace pane stays pinned to the right whenever a job or a query
 * history chart is open. The radar, the engine, and the pipeline all share
 * one brain: the Opportunity Engine.
 */
import React from 'react'
import ContentStudioWorkspace, {
  createLog,
  type PrStatus,
  type StudioJob,
  type StudioLogEntry,
} from './content-studio-workspace'
import AiKeyVaultPanel from './ai-key-vault-panel'
import SeoMasterEngine from './admin-seo-engine'

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
  shadowLifted: '0 8px 28px rgba(15,23,42,0.10)',
  radius: 12, radiusSm: 8, radiusXs: 6,
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto' | 'merge'
type CcTab = 'radar' | 'launch' | 'pipeline' | 'knowledge' | 'engine' | 'missions' | 'systems'
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

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Queued', bg: '#F3F4F6', fg: '#6B7280' },
  drafting: { label: 'Drafting', bg: '#FEF3C7', fg: '#D97706' },
  publishing: { label: 'Opening PR', bg: '#DBEAFE', fg: '#3B82F6' },
  pr_created: { label: 'PR Ready', bg: '#DBEAFE', fg: '#2563EB' },
  merged: { label: 'Merged', bg: '#D1FAE5', fg: '#166534' },
  closed: { label: 'Closed', bg: '#F3F4F6', fg: '#6B7280' },
  failed: { label: 'Failed', bg: '#FEE2E2', fg: '#DC2626' },
}

const MISSION_KINDS: Array<[string, string]> = [
  ['all', 'All'], ['launch', 'Launch'], ['autopilot', 'Autopilot'],
  ['merge', 'Merge'], ['save', 'Save'], ['refresh', 'Refresh'],
]
const MISSION_STATUSES: Array<[string, string]> = [
  ['all', 'All'], ['success', '✓'], ['error', '✕'], ['warn', '⚠'],
]

// ── Life-cycle ontology (mirrors lib/seoEngine/ontology.ts) ────────────
type LifecycleStage =
  | 'intent' | 'schools' | 'work' | 'housing' | 'visa'
  | 'settlement' | 'citizenship' | 'family' | 'relatives'

const LIFECYCLE_STAGES: Array<{
  key: LifecycleStage
  label: string
  short: string
  icon: string
  hint: string
  funnel: 'top' | 'middle' | 'bottom'
}> = [
  { key: 'intent',      label: 'Intent to move',      short: 'Why move & where',        icon: '🧭', hint: 'Awareness · top funnel · why-this-country comparisons',          funnel: 'top' },
  { key: 'schools',     label: 'Schools & study',     short: 'Secure education',        icon: '🎓', hint: 'Study permits, admissions, tuition → PGWP / OPT bridge',              funnel: 'top' },
  { key: 'work',        label: 'Work & career',       short: 'Secure employment',       icon: '💼', hint: 'H-1B / Skilled Worker / 189-190 / Express Entry — sponsor logic', funnel: 'middle' },
  { key: 'housing',     label: 'Housing & settling',  short: 'Secure housing',          icon: '🏠', hint: 'Rentals, deposits, neighborhoods, transit, tenant rights',            funnel: 'middle' },
  { key: 'visa',        label: 'Visa & legal',        short: 'The application',         icon: '📝', hint: 'Forms, fees, processing times, refusals → marketplace conversion',funnel: 'bottom' },
  { key: 'settlement',  label: 'Settlement',          short: 'Banking, health, docs',   icon: '🏢', hint: 'SSN / NI / SIN / TFN, healthcare, driving licence, day-1 logistics',   funnel: 'middle' },
  { key: 'citizenship', label: 'PR & citizenship',    short: 'Secure permanent status', icon: '🏛', hint: 'Naturalisation tests, residence requirements, dual-citizenship',       funnel: 'bottom' },
  { key: 'family',      label: 'Family & marriage',   short: 'Bring the family',        icon: '👨‍👩‍👧‍👦', hint: 'Spouse, partner, children, dependants → YMYL — cite statutes',     funnel: 'bottom' },
  { key: 'relatives',   label: 'Moving relatives',    short: 'Extended family',         icon: '🧑', hint: 'Parents, siblings, dependent relatives — sponsor backlog-aware',     funnel: 'bottom' },
]

const STAGE_META: Record<LifecycleStage, { label: string; icon: string }> =
  Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.key, { label: s.label, icon: s.icon }])) as Record<LifecycleStage, { label: string; icon: string }>

const REASON_META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  journey_prev:       { label: 'Journey back',     bg: '#EDE9FE', fg: '#5B21B6', icon: '←' },
  journey_next:       { label: 'Journey next',     bg: '#DBEAFE', fg: '#1D4ED8', icon: '→' },
  cross_country:      { label: 'Cross-country',    bg: '#FEF3C7', fg: '#92400E', icon: '🌐' },
  marketplace_cta:    { label: 'Marketplace',      bg: '#D1FAE5', fg: '#166534', icon: '🛍' },
  cluster_related:    { label: 'Cluster sibling',  bg: '#FEE2E2', fg: '#991B1B', icon: '🕵' },
  ontology_neighbor:  { label: 'Neighbor',         bg: '#E5E7EB', fg: '#374151', icon: '🔗' },
}

/** Heuristic to map an opportunity's signals / topic to the most plausible life-cycle stage. */
function autoDetectStage(topic: string, signals: string[] | undefined): LifecycleStage {
  const hay = `${topic} ${(signals || []).join(' ')}`.toLowerCase()
  if (/(citizenship|naturali[sz]ation|n-400|life in (the )?uk test|ilr|p\.?r|permanent residence|dual citizens|passport)/.test(hay)) return 'citizenship'
  if (/(spouse|partner|marriage|fianc[eé]|family[- ]?based|i-130|i-129f|k-?1|820|801|dependent child)/.test(hay)) return 'family'
  if (/(parent|sibling|brother|sister|aunt|uncle|f4|f2a|grandparent|aged parent)/.test(hay)) return 'relatives'
  if (/(housing|rent|apartment|landlord|tenant|nhk|deposit|neighbourhood|neighborhood)/.test(hay)) return 'housing'
  if (/(ssn|national insurance|\bsin\b|tfn|medicare|nhs|gp\b|driv(e|ing) licen[cs]e|open(ing)? a bank|tax file)/.test(hay)) return 'settlement'
  if (/(h-?1b|skilled worker|tier ?2|subclass ?(189|190|491|482)|express entry|lmia|pnp|\b485\b|opt\b|i-?765|ead\b|cpt\b)/.test(hay)) return 'work'
  if (/(f-?1\b|j-?1\b|student visa|study permit|sevp|i-20|ds-?2019|\bcoe\b|\bcas\b|graduate route|subclass ?500)/.test(hay)) return 'schools'
  if (/(visa|permit|application|form|filing|consulate|embassy|uscis|home office|ircc|mara|processing time|refus)/.test(hay)) return 'visa'
  if (/(why|compare|best country|move to|immigrate to|life in|cost of living)/.test(hay)) return 'intent'
  return 'visa'
}

function stageMeta(stage: string): { label: string; icon: string } | null {
  return (STAGE_META as Record<string, { label: string; icon: string }>)[stage] || null
}

/**
 * The journey ladder \u2014 which stage comes BEFORE and AFTER each stage in the
 * same country. Mirrors `lib/seoEngine/ontology.ts:LIFECYCLE_STAGES[*].countries[*].neighbors`.
 * Kept client-side so the wizard can show placement before any API call.
 */
const JOURNEY_NEIGHBORS: Record<LifecycleStage, { prev?: LifecycleStage; next?: LifecycleStage }> = {
  intent:      { next: 'schools' },
  schools:     { prev: 'intent',      next: 'work' },
  work:        { prev: 'schools',     next: 'visa' },
  housing:     { prev: 'visa',        next: 'settlement' },
  visa:        { prev: 'work',        next: 'housing' },
  settlement:  { prev: 'housing',     next: 'citizenship' },
  citizenship: { prev: 'settlement',  next: 'family' },
  family:      { prev: 'citizenship', next: 'relatives' },
  relatives:   { prev: 'family' },
}

/** Mirror of ontology's `neighbors.across` \u2014 same life-cycle role across neighbour stages. */
const STAGE_PEERS: Record<LifecycleStage, LifecycleStage[]> = {
  intent:      ['schools', 'work', 'visa', 'settlement'],
  schools:     ['intent', 'work', 'visa', 'citizenship'],
  work:        ['schools', 'visa', 'citizenship', 'housing'],
  housing:     ['work', 'settlement', 'relatives'],
  visa:        ['work', 'housing', 'citizenship', 'family'],
  settlement:  ['housing', 'work', 'citizenship'],
  citizenship: ['work', 'settlement', 'family', 'relatives'],
  family:      ['citizenship', 'relatives', 'work'],
  relatives:   ['citizenship', 'family'],
}

interface JourneyMap {
  prev: LifecycleStage | null
  current: LifecycleStage
  next: LifecycleStage | null
  peers: LifecycleStage[]
}

function buildJourneyMap(stage: LifecycleStage): JourneyMap {
  const nb = JOURNEY_NEIGHBORS[stage] || {}
  return { prev: nb.prev || null, current: stage, next: nb.next || null, peers: STAGE_PEERS[stage] || [] }
}

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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted,
  textTransform: 'uppercase', marginBottom: 5, fontFamily: C.mono,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
}
const btnSolid = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: bg, color: fg, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
})
const btnGhost: React.CSSProperties = {
  padding: '7px 14px', borderRadius: C.radiusXs, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
}
const btnSmall: React.CSSProperties = {
  padding: '4px 9px', borderRadius: 5, border: 'none', cursor: 'pointer',
  background: C.surface2, color: C.text, fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
}
const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textDim, fontFamily: C.mono, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, verticalAlign: 'middle' }

function CardHeader({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: C.serif }}>{icon} {title}</div>
        {sub && <div style={{ marginTop: 1, fontSize: 10.5, color: C.textMuted }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

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
  const [tab, setTab] = React.useState<CcTab>('radar')
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
  const [jobsTotal, setJobsTotal] = React.useState(0)
  const [jobStatusFilter, setJobStatusFilter] = React.useState('all')
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
  const [selectedJob, setSelectedJob] = React.useState<StudioJob | null>(null)
  const [editorContent, setEditorContent] = React.useState('')
  const [prStatus, setPrStatus] = React.useState<PrStatus | null>(null)
  const [logs, setLogs] = React.useState<StudioLogEntry[]>([])

  // Cannibal resolver state (explicit winner/loser picks per term)
  const [cannibalPages, setCannibalPages] = React.useState<Record<string, Array<{ url: string; impressions: number; clicks: number; position: number }>>>({})
  const [cannibalSource, setCannibalSource] = React.useState<Record<string, string>>({})
  const [cannibalWinner, setCannibalWinner] = React.useState<Record<string, string>>({})
  const [cannibalLosers, setCannibalLosers] = React.useState<Record<string, Set<string>>>({})
  const [cannibalExpanded, setCannibalExpanded] = React.useState<Set<string>>(new Set())
  const [cannibalBusyTerm, setCannibalBusyTerm] = React.useState<string | null>(null)

  // Systems
  const [health, setHealth] = React.useState<any>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const [strategies, setStrategies] = React.useState<any>(null)

  // Trend detail (per-query history chart)
  const [trendDetail, setTrendDetail] = React.useState<any | null>(null)

  // Mission Log (persistent audit trail)
  const [missionLog, setMissionLog] = React.useState<MissionEntry[]>([])
  const [missionKind, setMissionKind] = React.useState('all')
  const [missionStatus, setMissionStatus] = React.useState('all')
  const [missionReload, setMissionReload] = React.useState(0)
  const [missionLoading, setMissionLoading] = React.useState(false)

  const pushLog = (level: StudioLogEntry['level'], source: string, message: string, detail?: string) =>
    setLogs((prev) => [...prev, createLog(level, source, message, detail)].slice(-150))

  const notify = (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
    setActionNotice(msg)
    pushLog(kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info', 'command', msg)
  }

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
  }, [missionKind, missionStatus, missionReload])

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
      // limit=100 so the queue shows more than the old hard 40; the API now
      // returns total + hasMore so the pill shows the real table size.
      const res = await fetch('/api/content-studio/jobs?limit=100', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) {
        setJobs((data as { jobs?: StudioJob[] }).jobs ?? [])
        const total = (data as { total?: number }).total
        if (typeof total === 'number') setJobsTotal(total)
      }
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
      stage: (o.stage || o.lifecycleStage || autoDetectStage(o.term, o.signals)) as LifecycleStage,
      interlinks: o.interlinks || [],
      score: scoreOf(o),
      cluster: o.cluster || null,
    })
    setLaunchFeed([])
    setWorkspaceOpen(false)
    setTab('launch')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Fire-and-forget: rebuild the link plan for the detected stage so the Launch
    // tab lands with stage-aware edges instead of plain registry hits.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const stage = (o.stage || o.lifecycleStage || autoDetectStage(o.term, o.signals)) as LifecycleStage
        void recomputeInterlinks({
          stage,
          country: regionFilter || 'US',
          contentType: o.contentType || (play === 'cannibalization' || play === 'cannibal_merge' ? 'article' : 'blog_post'),
          keywords: kw,
          clusterId: o.cluster?.id,
          topic: o.term,
        })
      }, 30)
    }
  }

  const clearBrief = () => setBrief(null)

  const recomputeInterlinks = async (opts: {
    stage: LifecycleStage
    country: string
    contentType: string
    keywords: string[]
    clusterId?: string
    topic: string
  }) => {
    setRelinking(true)
    try {
      const slugBase = `${(opts.contentType || 'blog_post').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${opts.stage}-${(opts.country || 'US').toLowerCase()}-${(opts.topic || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`
      const res = await fetch('/api/seo-engine/interlink', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceSlug: slugBase,
          stage: opts.stage,
          country: (opts.country || 'US').toUpperCase(),
          contentType: ['regional_page', 'blog_post', 'casework', 'marketplace_landing', 'faq_hub'].includes(opts.contentType)
            ? opts.contentType : 'blog_post',
          clusterId: opts.clusterId,
          relatedTerms: (opts.keywords || []).slice(0, 4),
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; error?: string; edges?: Array<{
          sourceSlug: string; targetUrl: string; targetHost: string;
          anchorText: string; contextH2?: string; reason: string; score: number
        }>
      }
      if (!res.ok || !data.ok) {
        notify(data.error || `Could not build the link plan for "${opts.stage}"`, 'error')
        return
      }
      const normalized = (data.edges || []).map((e) => ({
        label: e.anchorText,
        url: e.targetUrl,
        reason: e.reason,
        contextH2: e.contextH2 || '',
        score: e.score,
        host: e.targetHost || 'apex',
      }))
      setBrief((prev) => prev ? { ...prev, interlinks: normalized as any } : prev)
      notify(`Link plan rebuilt for ${opts.stage} — ${normalized.length} target${normalized.length === 1 ? '' : 's'}.`, 'success')
      // Refresh persisted-state footer so the operator sees what just landed in seo_interlinks.
      void fetchPersistedCell(opts.stage, (opts.country || 'US').toUpperCase())
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Interlink recompute failed', 'error')
    } finally {
      setRelinking(false)
    }
  }

  // ── Region → Country normalization ───────────────────────────────────────
  const [relinking, setRelinking] = React.useState(false)

  interface PersistedCell {
    stage: string
    country: string
    total: number
    applied: number
    planned: number
    byReason: Record<string, number>
    topTargets: Array<{ url: string; host: string; anchor: string; reason: string; score: number; status: string }>
    lastUpdated: string | null
  }
  const [interlinkPersisted, setInterlinkPersisted] = React.useState<PersistedCell | null>(null)
  const [inspectingPersisted, setInspectingPersisted] = React.useState(false)
  const lastInspectKey = React.useRef('')

  const [previewCache, setPreviewCache] = React.useState<Record<string, {
    ok: boolean; httpStatus: number; title: string | null; isEstate: boolean;
    wordCount: number; anchorCount: number; hasSchemaOrg: boolean;
    finalUrl: string; error?: string;
  } | null>>({})
  const [auditingUrl, setAuditingUrl] = React.useState<string | null>(null)

  // ─────────── Backlink engine state (Knowledge Radar) ───────────
  const BACKLINK_VIEWS = ['external', 'inbound', 'outbound'] as const
  type BacklinkView = (typeof BACKLINK_VIEWS)[number]
  const [backlinkView, setBacklinkView] = React.useState<BacklinkView>('external')
  const BACKLINK_LANES = ['all', 'gov', 'ngo', 'media', 'edu', 'industry'] as const
  type BacklinkLane = (typeof BACKLINK_LANES)[number]
  const [backlinkLaneFilter, setBacklinkLaneFilter] = React.useState<BacklinkLane>('all')
  const [backlinkReport, setBacklinkReport] = React.useState<{
    targets: any[]; inboundGaps: any[]; outboundGaps: any[];
    totals?: { won: number; sent: number; drafted: number; govt: number };
    generatedAt?: string;
  } | null>(null)
  const [backlinkBusy, setBacklinkBusy] = React.useState(false)
  const [backlinkLastFetched, setBacklinkLastFetched] = React.useState<Date | null>(null)

  // ─────────── Outreach draft modal state ───────────
  interface DraftModalContent { subject: string; body: string; model: string | null }
  const BACKLINK_TARGET_TYPES = ['gov', 'ngo', 'media', 'edu', 'industry'] as const
  const [draftModalTarget, setDraftModalTarget] = React.useState<any | null>(null)
  const [draftModalContent, setDraftModalContent] = React.useState<DraftModalContent | null>(null)
  const [draftModalBusy, setDraftModalBusy] = React.useState(false)
  const [draftModalError, setDraftModalError] = React.useState<string | null>(null)

  const auditPersistedTarget = React.useCallback(async (url: string) => {
    setAuditingUrl(url)
    setPreviewCache((c) => ({ ...c, [url]: null }))
    try {
      const res = await fetch('/api/seo-engine/interlink/preview-target', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) {
        setPreviewCache((c) => ({ ...c, [url]: { ok: false, httpStatus: 0, isEstate: false, title: null, wordCount: 0, anchorCount: 0, hasSchemaOrg: false, finalUrl: url, error: data.error || ('HTTP ' + res.status) } }))
        return
      }
      setPreviewCache((c) => ({ ...c, [url]: { ok: true, httpStatus: data.httpStatus || 0, title: data.title || null, isEstate: !!data.isEstate, wordCount: data.wordCount || 0, anchorCount: data.anchorCount || 0, hasSchemaOrg: !!data.hasSchemaOrg, finalUrl: data.finalUrl || url } }))
    } catch (e) {
      setPreviewCache((c) => ({ ...c, [url]: { ok: false, httpStatus: 0, isEstate: false, title: null, wordCount: 0, anchorCount: 0, hasSchemaOrg: false, finalUrl: url, error: e instanceof Error ? e.message : 'audit failed' } }))
    } finally {
      setAuditingUrl(null)
    }
  }, [])

  const fetchPersistedCell = React.useCallback(async (stage: LifecycleStage, country: string) => {
    const key = `${stage}|${country}`
    if (lastInspectKey.current === key) return
    lastInspectKey.current = key
    setInspectingPersisted(true)
    try {
      const res = await fetch(`/api/seo-engine/interlink?stage=${encodeURIComponent(stage)}&country=${encodeURIComponent(country)}`, {
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; error?: string; total?: number; applied?: number; planned?: number;
        byReason?: Record<string, number>;
        topTargets?: Array<{ url: string; host: string; anchor: string; reason: string; score: number; status: string }>;
        lastUpdated?: string | null;
      }
      if (!res.ok || !data.ok) return
      setInterlinkPersisted({
        stage, country,
        total: data.total || 0,
        applied: data.applied || 0,
        planned: data.planned || 0,
        byReason: data.byReason || {},
        topTargets: data.topTargets || [],
        lastUpdated: data.lastUpdated || null,
      })
    } catch {
      // silent \u2014 the footer just stays in its last-known state
    } finally {
      setInspectingPersisted(false)
    }
  }, [])

  // Auto-refresh the persisted-state footer whenever the operator pivots to a
  // different (stage x country) cell, or when the recompute just landed.
  React.useEffect(() => {
    if (!brief || !brief.stage) return
    lastInspectKey.current = ''
    void fetchPersistedCell(brief.stage as LifecycleStage, brief.region || 'US')
  }, [brief?.stage, brief?.region, (brief?.interlinks as any[] | undefined)?.length])

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
          stage: brief.stage || 'visa',
          lifeCycleStage: brief.stage || 'visa',
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

  // ── Cannibal merge (proper resolution: explicit winner + losers) ────────
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

  // Proper cannibalization resolution (what Google expects): the operator
  // explicitly picks ONE winner and ≥1 loser from the real competing pages
  // (resolved from GSC query×page, with a content-inventory fallback), then
  // we 301 the losers → winner + retire them at the source.
  const fetchCannibalPages = async (term: string) => {
    if (cannibalPages[term]?.length) {
      setCannibalExpanded((prev) => {
        const n = new Set(prev)
        if (n.has(term)) n.delete(term)
        else n.add(term)
        return n
      })
      return
    }
    setCannibalBusyTerm(term)
    try {
      const res = await fetch('/api/seo-factory/cannibal-pages', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify(data.guidance || data.error || `No pages found for “${term}”`, 'info')
        setCannibalExpanded((prev) => new Set(prev).add(term))
        return
      }
      const pages = (data.pages || []) as Array<{ url: string; impressions: number; clicks: number; position: number }>
      setCannibalPages((prev) => ({ ...prev, [term]: pages }))
      setCannibalSource((prev) => ({ ...prev, [term]: String(data.source || 'unknown') }))
      setCannibalWinner((prev) => ({ ...prev, [term]: String(data.suggestedWinner || pages[0]?.url || '') }))
      const loserSet = new Set<string>()
      for (const p of pages) {
        if (p.url !== (data.suggestedWinner || pages[0]?.url)) loserSet.add(p.url)
      }
      setCannibalLosers((prev) => ({ ...prev, [term]: loserSet }))
      setCannibalExpanded((prev) => new Set(prev).add(term))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to resolve competing pages', 'error')
    } finally {
      setCannibalBusyTerm(null)
    }
  }

  const pickCannibalWinner = (term: string, url: string) => {
    setCannibalWinner((prev) => ({ ...prev, [term]: url }))
    setCannibalLosers((prev) => {
      const cur = new Set(prev[term] || [])
      cur.delete(url)
      return { ...prev, [term]: cur }
    })
  }

  const toggleCannibalLoser = (term: string, url: string) => {
    setCannibalLosers((prev) => {
      const cur = new Set(prev[term] || [])
      if (cur.has(url)) cur.delete(url)
      else cur.add(url)
      return { ...prev, [term]: cur }
    })
  }

  const resolveCannibal = async (term: string) => {
    const pages = cannibalPages[term] || []
    const winner = cannibalWinner[term]
    const losers = [...(cannibalLosers[term] || [])]
    if (!winner || losers.length === 0) {
      notify(`Pick a winner and at least one loser for “${term}”`, 'info')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/seo-factory/cannibal-merge', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, winnerUrl: winner, loserUrls: losers, mode: 'merge' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'cannibal merge failed')
      setResolvedTerms((prev) => new Set(prev).add(term))
      notify(`Resolved “${term}” → ${winner.split('/').pop() || winner} (${(data.redirectsAdded || []).length} redirects)`, 'success')
      recordMission({
        kind: 'merge', status: 'success', source: 'cannibal-merge',
        message: `Resolved “${term}” → ${winner.split('/').pop() || winner}`,
        detail: { term, winner, losers: losers.length, redirects: (data.redirectsAdded || []).length },
      })
      loadRadar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Resolution failed', 'error')
      recordMission({
        kind: 'merge', status: 'error', source: 'cannibal-merge',
        message: `Resolution failed · ${e instanceof Error ? e.message : 'cannibal merge failed'}`,
        detail: { term },
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
  // Pipeline hint uses the REAL table total (jobsTotal) instead of the fetched
  // window — this is what fixes the "queue always says 40" confusion.
  const TABS: Array<{ key: CcTab; icon: string; label: string; hint: string }> = [
    { key: 'radar', icon: '🎯', label: 'Radar', hint: `${kpis.actionable} plays` },
    { key: 'launch', icon: '🚀', label: 'Launch', hint: brief ? 'brief ready' : 'composer' },
    { key: 'pipeline', icon: '📋', label: 'Pipeline', hint: jobsTotal > 0 ? `${jobsTotal} jobs` : `${jobs.length} jobs` },
    { key: 'knowledge', icon: '📚', label: 'Knowledge', hint: 'backlinks & gaps' },
    { key: 'engine', icon: '🧭', label: 'Engine', hint: 'six brains' },
    { key: 'missions', icon: '📜', label: 'Missions', hint: 'audit trail' },
    { key: 'systems', icon: '⚙️', label: 'Systems', hint: 'health & keys' },
  ]

// ── Recheck-due fix verification ────────────────────────────────────────
// Visual cohesion: matches the Command Center's KPI strip / Cannibalization
// Watch by using the same gold channel accent, mono typography, and 12px
// radius language. The panel is split into a hero stats strip, a filterable
// source chip row, and a dense table-style list with overdue escalation.
const RES_BADGE: Record<string, { label: string; dot: string; bg: string; fg: string }> = {
  consolidate:    { label: 'CONSOLIDATED',    dot: '●', bg: C.orangeSoft, fg: C.orange },
  differentiate:  { label: 'DIFFERENTIATED',  dot: '◆', bg: C.blueSoft,   fg: C.blue   },
  defer:          { label: 'DEFERRED',        dot: '○', bg: C.surface2,   fg: C.textMuted },
}

function daysBetween(a: number, b: number): number {
  const ms = Math.abs(a - b)
  return Math.max(0, Math.round(ms / 86_400_000))
}

function HeroStat({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent: 'gold' | 'green' | 'navy' }) {
  const color = accent === 'gold' ? C.gold : accent === 'green' ? C.green : C.text
  return (
    <div style={{ flex: '1 1 0', minWidth: 140, padding: '10px 14px', borderRight: `1px solid ${C.border2}` }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: C.serif, fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{sub}</span>
      </div>
    </div>
  )
}

function RefreshSpinner() {
  return (
    <span style={{
      display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(0,0,0,0.18)',
      borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    }} />
  )
}

function EmptyState({ upcoming, onRefresh }: { upcoming: number; onRefresh: () => void }) {
  return (
    <div style={{ padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', background: C.greenSoft, color: C.green,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
        border: `1px solid ${C.greenBorder}`,
      }}>✓</div>
      <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>No fixes due for verification</div>
      <div style={{ fontSize: 10.5, color: C.textMuted, textAlign: 'center', maxWidth: 380 }}>
        {upcoming > 0
          ? `${upcoming} resolution${upcoming === 1 ? '' : 's'} still in the verification window — they will surface here automatically when their recheck is due.`
          : 'Resolve a cluster (in the Radar or Content Studio) to schedule its verification against fresh GSC data.'}
      </div>
      <button type="button" onClick={onRefresh} style={{ ...btnGhost, marginTop: 4 }}>↻ Re-check</button>
    </div>
  )
}

function RecheckRow({ m }: { m: any }) {
  const badge = RES_BADGE[m.resolutionType ?? 'consolidate'] ?? RES_BADGE.consolidate
  const overdueHours = m.recheckDue && m.followUpAt
  const inWindow = !m.recheckDue && !!m.followUpAt
  const elapsed = m.followUpAt ? daysBetween(m.followUpAt, Date.now()) : 0
  const overdueTone = !overdueHours ? C.textMuted
    : elapsed >= 14 ? C.orange
      : C.gold
  const title = (m.terms && m.terms.length ? m.terms : [m.stem]).slice(0, 4).join(' · ') || m.stem
  const detail = m.resolutionType === 'consolidate'
    ? `${(m.loserUrls || []).length} duplicate${(m.loserUrls || []).length === 1 ? '' : 's'} → ${String(m.winnerUrl || '').replace(/^https?:\/\//, '')}`
    : m.resolutionType === 'differentiate'
      ? `${(m.differentiationPlan || []).length} page angle${(m.differentiationPlan || []).length === 1 ? '' : 's'} to verify`
      : 'Deferred for monitoring'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) auto auto auto',
      gap: 0, padding: '11px 16px', borderBottom: `1px solid ${C.border2}`,
      alignItems: 'center',
      background: overdueHours && elapsed >= 14 ? '#FFFBF4' : overdueHours ? '#FFFCF1' : 'transparent',
      transition: 'background 0.15s',
    }} onMouseEnter={(e) => { e.currentTarget.style.background = overdueHours && elapsed >= 14 ? '#FFF4E6' : overdueHours ? '#FFF7E3' : C.bg }} onMouseLeave={(e) => { e.currentTarget.style.background = overdueHours && elapsed >= 14 ? '#FFFBF4' : overdueHours ? '#FFFCF1' : 'transparent' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
          {m.prNumber ? <a href={m.prUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: C.blue, fontSize: 10, fontFamily: C.mono }}>PR #{m.prNumber} ↗</a> : null}
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </div>
      </div>
      <div style={{ padding: '0 12px' }}>
        <span style={{
          padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.fg,
          fontSize: 9, fontWeight: 800, fontFamily: C.mono, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ fontSize: 10 }}>{badge.dot}</span>{badge.label}
        </span>
      </div>
      <div style={{ padding: '0 12px' }}>
        <span style={{
          padding: '3px 8px', borderRadius: 6,
          background: m.source === 'command_center' ? C.blueSoft : C.surface2,
          color: m.source === 'command_center' ? C.blue : C.textMuted,
          fontSize: 9, fontWeight: 700, fontFamily: C.mono, whiteSpace: 'nowrap',
          border: `1px solid ${m.source === 'command_center' ? C.blueBorder : C.border}`,
        }}>
          {m.source === 'command_center' ? 'COMMAND CENTER' : 'PORTAL'}
        </span>
      </div>
      <div style={{ textAlign: 'right', paddingLeft: 12 }}>
        <span style={{
          fontFamily: C.mono, fontSize: 11, fontWeight: 800,
          color: overdueHours ? overdueTone : inWindow ? C.textMuted : C.textDim,
        }}>
          {overdueHours ? `${elapsed}d overdue` : inWindow ? `${elapsed}d` : 'unverified'}
        </span>
      </div>
    </div>
  )
}

function RecheckDueTable({ rows }: { rows: Array<any> }) {
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) auto auto auto',
        gap: 0, padding: '8px 16px', background: C.surface2,
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        fontSize: 9, fontWeight: 700, fontFamily: C.mono, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: C.textDim,
      }}>
        <span>Subject</span>
        <span>Resolution</span>
        <span>Source</span>
        <span style={{ textAlign: 'right' }}>Overdue</span>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 18, fontSize: 11, color: C.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
            No clusters match the current source filter.
          </div>
        ) : rows.map((m) => <RecheckRow key={`${m.clusterId}-${m.source}`} m={m} />)}
      </div>
      <div style={{ padding: '9px 16px', borderTop: `1px solid ${C.border}`, background: C.bg, fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
        Hint: hit <strong style={{ color: C.text }}>Rescan radar</strong> in the Command Center to refresh GSC, then verify whether overlap has cleared. If it persists, resolve again with the correct intent path (consolidate / differentiate / defer).
      </div>
    </div>
  )
}

function RecheckDuePanel() {
  const [merges, setMerges] = React.useState<Array<any>>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = React.useState<'all' | 'command_center' | 'portal'>('all')

  const fetchMerges = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; merges?: Array<any> }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMerges(data.merges ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fix verification queue')
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { fetchMerges() }, [fetchMerges])

  const due = merges.filter((m) => m.recheckDue)
  const upcoming = merges.filter((m) => m.followUpAt && !m.recheckDue)
  const consolidated = merges.filter((m) => m.resolutionType === 'consolidate').length
  const differentiated = merges.filter((m) => m.resolutionType === 'differentiate').length
  const deferred = merges.filter((m) => m.resolutionType === 'defer').length
  const oldestOverdue = due
    .map((m) => ({ m, days: m.followUpAt ? daysBetween(m.followUpAt, Date.now()) : 0 }))
    .sort((a, b) => b.days - a.days)[0]

  const filteredDue = sourceFilter === 'all'
    ? due
    : due.filter((m) => m.source === sourceFilter)
  const upcomingFirstDays = upcoming[0]?.followUpAt
    ? Math.max(0, Math.round((upcoming[0].followUpAt - Date.now()) / 86_400_000)) : null
  const oldestLabel = oldestOverdue
    ? `${oldestOverdue.days}d overdue`
    : 'none outstanding'
  const oldestTint: 'gold' | 'green' = due.length === 0
    ? 'green'
    : (oldestOverdue && oldestOverdue.days >= 14) ? 'gold' : 'gold'

  const dueTint = due.length === 0
    ? C.green
    : oldestOverdue && oldestOverdue.days >= 14 ? C.orange : C.gold

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${due.length ? C.goldBorder : C.border}`,
      borderLeft: `6px solid ${dueTint}`,
      borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard,
    }}>
      <CardHeader
        icon="⟳"
        title="Fix verification"
        sub={`Google-aligned: resolutions stay hidden from the radar until fresh GSC data verifies them. Currently ${due.length} due · ${upcoming.length} in window.`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '3px 10px', borderRadius: 999,
              background: due.length ? C.goldSoft : C.greenSoft,
              color: due.length ? C.orange : C.green,
              fontSize: 9.5, fontWeight: 800, fontFamily: C.mono,
            }}>
              {due.length ? `${due.length} RECHECK${due.length === 1 ? '' : 'S'} DUE` : '✓ ALL VERIFIED'}
            </span>
            <button type="button" onClick={fetchMerges} disabled={loading} style={btnGhost}
              title="Re-read the shared cannibal merge history from the portal and Command Center">
              {loading ? '…' : '↻'}
            </button>
          </div>
        }
      />

      {/* Hero stats strip — three KPIs share a row */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: 'wrap' }}>
        <HeroStat label="Recheck due" value={due.length} sub={oldestLabel} accent={oldestTint} />
        <HeroStat label="In verification window" value={upcoming.length}
          sub={upcomingFirstDays === null ? 'no future checks' : `next in ${upcomingFirstDays}d`} accent="navy" />
        <HeroStat label="Resolution mix" value={`${consolidated}/${differentiated}/${deferred}`}
          sub="consolidate · differentiate · defer" accent="navy" />
      </div>

      {/* Source filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: '#FAFAFB', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontFamily: C.mono, fontWeight: 700, color: C.textDim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Source</span>
        {([
          { k: 'all',            label: 'All',            count: due.length },
          { k: 'command_center', label: 'Command Center', count: due.filter((m) => m.source === 'command_center').length },
          { k: 'portal',         label: 'Portal',         count: due.filter((m) => m.source === 'portal').length },
        ] as const).map((f) => {
          const active = sourceFilter === f.k
          return (
            <button key={f.k} type="button" onClick={() => setSourceFilter(f.k)} style={{
              padding: '4px 10px', borderRadius: 999, border: `1px solid ${active ? C.goldBorder : C.border}`,
              background: active ? C.goldSoft : C.surface, color: active ? C.orange : C.textMuted,
              fontSize: 10, fontWeight: active ? 800 : 600, fontFamily: C.mono, cursor: 'pointer',
            }}>
              {f.label} <span style={{ opacity: 0.7 }}>· {f.count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.textDim, fontSize: 11, fontFamily: C.mono }}>
          <RefreshSpinner />
          Checking resolution follow-ups…
        </div>
      ) : error ? (
        <div style={{ padding: '12px 16px', fontSize: 11, color: C.orange, fontFamily: C.mono }}>
          <strong>⚠ Could not load verification queue.</strong> {error}
        </div>
      ) : due.length === 0 ? (
        <EmptyState upcoming={upcoming.length} onRefresh={fetchMerges} />
      ) : (
        <RecheckDueTable rows={filteredDue} />
      )}
    </div>
  )
}

  const renderRadarTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Autopilot selection bar */}
      {selectedTerms.size > 0 && (
        <div style={{ padding: '10px 16px', borderRadius: C.radiusSm, background: C.cyanSoft, border: `1px solid ${C.blueBorder}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.cyan2, fontWeight: 700 }}>{selectedTerms.size} play(s) selected</span>
          <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={{ padding: '5px 8px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, background: C.surface }}>
            <option value="pr">Create + PR</option>
            <option value="autodeploy">Create + approve</option>
            <option value="merge">Create + merge</option>
            <option value="none">Draft only</option>
          </select>
          <button type="button" onClick={runAutopilot} disabled={busy} style={{ ...btnSolid(C.cyan2), padding: '7px 16px' }}>
            {busy ? 'Running…' : `▶ Run autopilot (${selectedTerms.size})`}
          </button>
          <button type="button" onClick={() => setSelectedTerms(new Set())} style={btnGhost}>Clear</button>
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>batch-generates every selected play → PR → merge</span>
        </div>
      )}

      {/* Cannibal watch — proper resolution: resolve pages, pick winner + losers */}
      {cannibals.length > 0 && (
        <div style={{ background: '#FEF2F2', border: `1px solid ${C.redBorder}`, borderRadius: C.radius, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.red, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ⚠ Cannibalization watch ({cannibals.length})
            </span>
            <span style={{ fontSize: 10, color: C.textMuted }}>
              resolve each cluster to ONE winner — every other page 301s into it and is retired at the source
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cannibals.slice(0, 8).map((o, i) => {
              const term = String(o.term || '')
              const expanded = cannibalExpanded.has(term)
              const pages = cannibalPages[term] || []
              const winner = cannibalWinner[term]
              const losers = cannibalLosers[term] || new Set<string>()
              const resolved = resolvedTerms.has(term)
              return (
                <div key={i} style={{ background: '#fff', border: `1px solid ${C.redBorder}`, borderRadius: C.radiusXs, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                    <button type="button" onClick={() => void fetchCannibalPages(term)} disabled={cannibalBusyTerm === term}
                      title="Resolve competing pages from GSC / content inventory"
                      style={{ ...btnSmall, background: C.surface2, color: C.text, fontWeight: 700 }}>
                      {cannibalBusyTerm === term ? '⏳' : expanded ? '▾' : '▸'}
                    </button>
                    <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      “{term}”
                    </span>
                    {cannibalSource[term] && (
                      <span style={{ fontSize: 9, fontFamily: C.mono, padding: '1px 7px', borderRadius: 999, background: cannibalSource[term] === 'gsc_live' ? C.greenSoft : C.goldSoft, color: cannibalSource[term] === 'gsc_live' ? C.green : C.orange }}>
                        {cannibalSource[term] === 'gsc_live' ? 'GSC live' : 'inventory'}
                      </span>
                    )}
                    {resolved && <span style={{ fontSize: 9, fontFamily: C.mono, padding: '1px 7px', borderRadius: 999, background: C.greenSoft, color: C.green, fontWeight: 800 }}>✓ RESOLVED</span>}
                    <button type="button" style={{ ...btnSmall, background: C.redSoft, color: C.red, fontWeight: 700, whiteSpace: 'nowrap' }} onClick={() => void runCannibalMerge(o)} disabled={busy} title="Auto-resolve: winner = highest impressions">
                      Auto merge
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ borderTop: `1px solid ${C.redBorder}`, padding: '9px 12px', background: '#FFFCFC' }}>
                      {cannibalBusyTerm === term && pages.length === 0 ? (
                        <div style={{ fontSize: 10.5, fontFamily: C.mono, color: C.textMuted }}>Resolving competing pages…</div>
                      ) : pages.length === 0 ? (
                        <div style={{ fontSize: 10.5, fontFamily: C.mono, color: C.textMuted }}>
                          No competing pages resolved for this term yet — click ▾ to retry, or use <strong>Auto merge</strong>.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {pages.map((p, pi) => {
                            const isWinner = winner === p.url
                            const isLoser = losers.has(p.url)
                            return (
                              <label key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, background: isWinner ? '#D1FAE5' : isLoser ? '#FEE2E2' : C.surface2, fontSize: 10, fontFamily: C.mono, cursor: 'pointer' }}>
                                <input type="radio" name={`cannibal-winner-${term}`} checked={isWinner}
                                  onChange={() => pickCannibalWinner(term, p.url)} />
                                <input type="checkbox" checked={isLoser} disabled={isWinner}
                                  onChange={() => toggleCannibalLoser(term, p.url)} />
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }} title={p.url}>
                                  {p.url.replace(/^https?:\/\//, '').split('/').slice(0, 3).join('/')}
                                </span>
                                <span style={{ color: C.textDim, whiteSpace: 'nowrap' }}>
                                  {p.impressions > 0 ? `${fmtN(p.impressions)} imp · #${p.position}` : 'no GSC data'}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: isWinner ? C.green : isLoser ? C.red : C.textDim, minWidth: 46, textAlign: 'right' }}>
                                  {isWinner ? '★ WINNER' : isLoser ? '→ 301' : ''}
                                </span>
                              </label>
                            )
                          })}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
                              {winner ? `${losers.size} loser(s) → ${winner.split('/').pop() || winner}` : 'pick a winner + ≥1 loser'}
                            </span>
                            <button type="button" disabled={busy || !winner || losers.size === 0}
                              onClick={() => void resolveCannibal(term)}
                              title="301 losers → winner, retire losers at the source, enrich winner with merged queries"
                              style={{ marginLeft: 'auto', ...btnSmall, background: C.red, color: '#fff', fontWeight: 800, opacity: busy || !winner || losers.size === 0 ? 0.5 : 1 }}>
                              {busy ? 'Resolving…' : 'Resolve & 301 → winner'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* Radar table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
        <CardHeader
          icon="🎯" title="Opportunity Radar"
          sub="Every play carries its signals trail — the exact data that drove the score. Click a row's trend sparkline for full position history."
          right={
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {RADAR_FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setRadarFilter(f.key)} style={{
                  padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: radarFilter === f.key ? C.navy : C.surface2,
                  color: radarFilter === f.key ? '#fff' : C.textMuted, transition: 'all 0.15s',
                }}>{f.label}</button>
              ))}
            </div>
          }
        />
        {radarBusy && !radar ? (
          <div style={{ padding: 28, textAlign: 'center', color: C.textDim, fontSize: 13, fontFamily: C.mono }}>
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

                          {(() => {
                            const detectedStage = (o.stage || o.lifecycleStage || autoDetectStage(o.term, o.signals)) as LifecycleStage
                            const m = stageMeta(detectedStage)
                            if (!m) return null
                            return (
                              <span
                                title={'Stage cell: ' + detectedStage + ' \u00d7 ' + (regionFilter || 'us').toLowerCase() + ' \u2014 placement fit before clicking Brief'}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                                  padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                                  fontFamily: C.mono, whiteSpace: 'nowrap',
                                  background: '#FFFEF5', color: C.gold,
                                  border: '1px dashed ' + C.goldBorder, cursor: 'default',
                                  display: 'block', width: 'fit-content',
                                }}
                              >
                                {m.icon} {m.label}
                              </span>
                            )
                          })()}
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
                            ✏️ Brief
                          </button>
                        )}
                        {isCannibal ? (
                          <button type="button" style={{ ...btnSmall, background: C.redSoft, color: C.red, fontWeight: 700 }} onClick={() => runCannibalMerge(o)} disabled={busy}>
                            Merge
                          </button>
                        ) : (
                          <button type="button" style={{ ...btnSmall, background: C.navy, color: '#fff' }} onClick={() => { setSelectedTerms(new Set([String(o.term)])); runAutopilot() }} disabled={busy}>
                            ▶ Ship
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
    </div>
  )

  const renderLaunchTab = () => (
    <div style={{ background: C.surface, border: `1px solid ${brief ? C.goldBorder : C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🚀" title="Launch play"
        sub="Every radar brief lands here pre-filled and editable. Draft → quality gates → GitHub PR."
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {brief && (
              <>
                <PlayBadge play={brief.play} />
                <ScoreMeter score={brief.score} />
                <button type="button" onClick={clearBrief} style={btnGhost}>✕ Clear brief</button>
              </>
            )}
          </div>
        }
      />
      {!brief ? (
        <div style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🎯</div>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600 }}>No play selected yet</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, fontFamily: C.mono }}>
            Pick a play in the Radar tab (✏️ Brief) or the Engine tab (⚡ Brief) — the composer will be pre-filled.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Topic <span style={{ color: C.red }}>*</span></label>
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
              <label style={labelStyle}>AI model</label>
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
            {/* ── Life-cycle stage for this link plan ────────────── */}
            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.goldBorder}`, background: '#FFFBEB', boxShadow: C.shadowCard }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0, color: C.gold }}>
                  🎯 LIFE-CYCLE STAGE FOR THIS LINK PLAN
                </label>
                {brief.stage && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: C.mono,
                    background: C.goldSoft, color: C.gold, border: `1px solid ${C.goldBorder}`,
                  }} title={`Stage cell: ${brief.stage} × ${brief.region || 'US'}`}>
                    {stageMeta(brief.stage)?.icon} {stageMeta(brief.stage)?.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                <select
                  value={brief.stage || 'visa'}
                  onChange={(e) => {
                    const newStage = e.target.value as LifecycleStage
                    setBrief({ ...brief, stage: newStage })
                    void recomputeInterlinks({
                      stage: newStage,
                      country: brief.region || 'US',
                      contentType: brief.contentType || 'blog_post',
                      keywords: brief.keywords || [],
                      clusterId: brief.cluster?.id,
                      topic: brief.topic,
                    })
                  }}
                  style={{ ...inputStyle, fontWeight: 700 }}
                  title="Picking the right life-cycle stage anchors the link plan to the correct cell in the (stage × country) matrix. Neighbors, cross-country comparisons, and marketplace CTA will all re-target."
                >
                  {LIFECYCLE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.icon} {s.label} · {s.short}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => recomputeInterlinks({
                    stage: (brief.stage || 'visa') as LifecycleStage,
                    country: brief.region || 'US',
                    contentType: brief.contentType || 'blog_post',
                    keywords: brief.keywords || [],
                    clusterId: brief.cluster?.id,
                    topic: brief.topic,
                  })}
                  disabled={relinking}
                  style={{
                    padding: '7px 12px', borderRadius: 6, cursor: relinking ? 'wait' : 'pointer',
                    border: 'none', background: C.navy, color: '#FFFFFF', fontSize: 11, fontWeight: 700,
                    fontFamily: C.mono, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  title="Rebuild the link plan for the chosen stage and country"
                >
                  {relinking
                    ? '… Rebuilding'
                    : '↻ Recompute for stage'}
                </button>
              </div>
              {brief.stage && (
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, fontFamily: C.mono, lineHeight: 1.5 }}>
                  <strong style={{ color: C.gold }}>Why this matters.</strong>{' '}
                  {LIFECYCLE_STAGES.find((s) => s.key === brief.stage)?.hint}
                </div>
              )}

              {/* \u2500\u2500 Journey map (prev / current / next + cross-stage peers) \u2500\u2500 */}
              {brief.stage && (() => {
                const j = buildJourneyMap(brief.stage as LifecycleStage)
                const country = (brief.region || 'us').toLowerCase()
                const jumpToStage = (k: LifecycleStage) => {
                  setBrief({ ...brief, stage: k })
                  void recomputeInterlinks({
                    stage: k,
                    country: brief.region || 'US',
                    contentType: brief.contentType || 'blog_post',
                    keywords: brief.keywords || [],
                    clusterId: brief.cluster?.id,
                    topic: brief.topic,
                  })
                }
                const StageChip = ({ k }: { k: LifecycleStage }) => {
                  const m = stageMeta(k)
                  if (!m) return null
                  return (
                    <button
                      type="button"
                      onClick={() => jumpToStage(k)}
                      title={`Jump to ${m.label}` + ' \u00b7 rebuild the plan for that cell'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 8px', borderRadius: 999,
                        border: `1px solid ${C.border}`, background: C.surface,
                        color: C.text, fontSize: 10, fontFamily: C.mono, fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.goldSoft; e.currentTarget.style.borderColor = C.goldBorder }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border }}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  )
                }
                const CurrentChip = () => (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 999,
                    background: C.gold, color: '#fff', fontSize: 11, fontFamily: C.mono, fontWeight: 800,
                    border: `1px solid ${C.gold}`, boxShadow: '0 2px 8px rgba(154,123,59,0.30)',
                  }} title="This is your active stage cell">
                    <span>{stageMeta(j.current)?.icon}</span>
                    <span>{stageMeta(j.current)?.label}</span>
                    <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 700 }}>(you are here)</span>
                  </span>
                )
                return (
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: C.radiusSm,
                    border: `1px dashed ${C.goldBorder}`, background: '#FFFEF5',
                  }}>
                    <div style={{
                      fontSize: 9, color: C.gold, fontFamily: C.mono, fontWeight: 800,
                      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
                    }}>
                      \ud83e\udded Journey placement \u00b7 <span style={{
                        textTransform: 'none', color: C.textMuted, fontWeight: 600,
                      }}>cell <strong style={{ color: C.text }}>{brief.stage}</strong> \u00d7 <strong style={{ color: C.text }}>{country}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {j.prev && (
                        <>
                          <StageChip k={j.prev} />
                          <span style={{ color: C.textDim, fontFamily: C.mono }}>\u2190</span>
                        </>
                      )}
                      <CurrentChip />
                      {j.next && (<>
                        <span style={{ color: C.textDim, fontFamily: C.mono }}>\u2192</span>
                        <StageChip k={j.next} />
                      </>)}
                    </div>
                    {j.peers.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 9, color: C.textDim, fontFamily: C.mono, fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>Cross-stage peers</span>
                        {j.peers.slice(0, 6).map((p) => (
                          <StageChip key={String(p)} k={p} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              {brief.interlinks && (brief.interlinks as any[]).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Internal linking targets ({(brief.interlinks as any[]).length})
                    </span>
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>
                      cell: {brief.stage} × {(brief.region || 'US').toLowerCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(brief.interlinks as any[]).slice(0, 8).map((l: any, i: number) => {
                      const r = REASON_META[l.reason] || REASON_META.cluster_related
                      const ctx = l.contextH2 ? `In section “${l.contextH2}” · score ${(Number(l.score) || 0).toFixed(2)}` : `score ${(Number(l.score) || 0).toFixed(2)}`
                      return (
                        <span
                          key={i}
                          title={ctx}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px 3px 4px', borderRadius: 5,
                            background: r.bg, border: `1px solid ${C.border}`,
                            fontSize: 10, fontFamily: C.mono, color: '#111',
                          }}
                        >
                          <span style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 3,
                            background: r.fg, color: '#fff', fontWeight: 700, letterSpacing: '0.04em',
                          }}>{r.icon} {r.label}</span>
                          <span style={{ color: r.fg, fontWeight: 600 }}>{l.label}</span>
                          <span style={{ color: C.textMuted }}>→ {String(l.url || '').replace(/^https?:\/\//, '').slice(0, 48)}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {brief.interlinks && (brief.interlinks as any[]).length === 0 && (
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, fontFamily: C.mono }}>
                  No target edges yet — click <strong>Recompute for stage</strong> to build the plan.
                </div>
              )}

              {/* \u2500\u2500 Persisted-state footer (what is currently in seo_interlinks) \u2500\u2500 */}
              <div style={{
                marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.goldBorder}`,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: C.mono, fontSize: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 999,
                      background: C.navy, color: '#fff', fontWeight: 800, fontSize: 9,
                      letterSpacing: '0.06em',
                    }}>\ud83d\uddc4 seo_interlinks</span>
                    {interlinkPersisted ? (
                      <>
                        <span style={{ color: C.textMuted }}>
                          <strong style={{ color: C.text, fontSize: 11 }}>{interlinkPersisted.total}</strong> planned
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 7px', borderRadius: 999,
                          background: C.greenSoft, color: C.green, fontFamily: C.mono, fontSize: 9,
                          fontWeight: 700,
                        }}>
                          <strong>{interlinkPersisted.applied}</strong> applied
                        </span>
                        <span style={{ color: C.textMuted }}>
                          awaiting <strong style={{ color: C.gold }}>{interlinkPersisted.planned}</strong>
                        </span>
                      </>
                    ) : (
                      <span style={{ color: C.textDim }}>{inspectingPersisted ? 'Inspecting persisted rows\u2026' : 'No persisted rows inspected yet.'}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => brief?.stage && void fetchPersistedCell(brief.stage as LifecycleStage, brief.region || 'US')}
                      title="Re-run the persisted-cell inspector against seo_interlinks"
                      style={{
                        marginLeft: 6, padding: '3px 9px', borderRadius: 999,
                        border: `1px solid ${C.border}`, background: C.surface,
                        color: C.textMuted, fontFamily: C.mono, fontSize: 9,
                        fontWeight: 700, cursor: 'pointer',
                      }}
                    >\u21bb Inspect</button>
                  </div>
                  {interlinkPersisted?.lastUpdated && (
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>
                      last write \u00b7 {timeAgo(interlinkPersisted.lastUpdated)}
                    </span>
                  )}
                </div>
                {interlinkPersisted && interlinkPersisted.total > 0 && (
                  <>
                    {/* Reasons bar \u2014 proportional, deterministic */}
                    {/* Compliance-gate rows (manual / paused / awaiting_gate / rejected) */}
                    {interlinkPersisted.byStatus && Object.entries(interlinkPersisted.byStatus).filter(([k]) => ['manual','paused','awaiting_gate','rejected'].includes(k)).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4, borderTop: '1px dashed ' + C.border2 }}>
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Compliance gate</span>
                        {Object.entries(interlinkPersisted.byStatus).filter(([k]) => ['manual','paused','awaiting_gate','rejected'].includes(k)).sort((a,b)=>b[1]-a[1]).map(([k, count]) => {
                          const map: Record<string, { bg: string; fg: string; icon: string }> = {
                            manual:        { bg: '#FEF9EC', fg: C.gold,   icon: '\u270e' },
                            paused:        { bg: '#FEF3C7', fg: '#92400E', icon: '\u23f8' },
                            awaiting_gate: { bg: '#DBEAFE', fg: C.blue,   icon: '\u23f3' },
                            rejected:      { bg: '#FEE2E2', fg: C.red,    icon: '\u2715' },
                          }
                          const m = map[k] || { bg: C.surface, fg: C.text, icon: '\u2022' }
                          return (
                            <span key={k} title={count + ' edges in ' + k + ' state \u2014 manual review or paused by the compliance gate'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 3, background: m.bg, color: m.fg, fontFamily: C.mono, fontSize: 9, fontWeight: 700 }}>
                              {m.icon} {k.replace('_', ' ')} {count}
                            </span>
                          )
                        })}
                      </div>
                    )}

                                        {(() => {
                      const reasons = Object.entries(interlinkPersisted.byReason).sort((a, b) => b[1] - a[1])
                      if (!reasons.length) return null
                      const max = reasons[0][1] || 1
                      return (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          {reasons.slice(0, 6).map(([reason, count]) => {
                            const m = REASON_META[reason] || REASON_META.cluster_related
                            const w = Math.max(8, Math.round((count / max) * 80))
                            return (
                              <span key={reason} title={`${m.label} \u00b7 ${count} persisted`} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '2px 7px', borderRadius: 3,
                                background: m.bg, color: '#111', fontFamily: C.mono, fontSize: 9,
                              }}>
                                <span style={{ width: w, height: 6, borderRadius: 3, background: m.fg, display: 'inline-block' }} />
                                <span style={{ fontWeight: 700 }}>{m.label}</span>
                                <span style={{ color: m.fg, fontWeight: 700 }}>{count}</span>
                              </span>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {/* Top persisted targets (compact) */}
                    {interlinkPersisted.topTargets.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {interlinkPersisted.topTargets.slice(0, 4).map((t, i) => (
                          <span key={i} style={{
                            fontSize: 9, fontFamily: C.mono, color: C.textMuted,
                            padding: '2px 7px', borderRadius: 3, background: C.surface,
                            border: `1px solid ${C.border}`,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }} title={`${t.url} \u00b7 status=${t.status} \u00b7 score=${t.score.toFixed(2)}`}>
                            <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>
                              {t.anchor.length > 32 ? t.anchor.slice(0, 30) + '\u2026' : t.anchor}
                            </a>
                            <span style={{ color: C.textDim }}>\u00b7 {t.host}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
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
              style={{ ...btnSolid(C.navy), width: '100%', padding: '12px 0', fontSize: 13, opacity: generating ? 0.7 : 1, justifyContent: 'center' }}
            >
              {generating ? '⚡ Generating… (watch the live feed above)' : `⚡ Generate & Open PR — “${brief.topic.slice(0, 48)}${brief.topic.length > 48 ? '…' : ''}”`}
            </button>
          </div>
        </>
      )}
    </div>
  )

  const renderPipelineTab = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="📋" title="Mission Pipeline"
        sub={jobsTotal > 0 ? `Live job queue — ${filteredJobs.length} of ${jobsTotal} jobs shown (window is the most recent 100).` : 'Live job queue — auto-refreshes while drafting.'}
        right={
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
        }
      />
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
  )


  const openDraftModal = async (target: any) => {
    setDraftModalTarget(target)
    setDraftModalContent(null)
    setDraftModalError(null)
    setDraftModalBusy(true)
    try {
      const res = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft',
          target_id: target.id,
          brief: { topic: target.title || target.domain, stage: (target.stages && target.stages[0]) || 'intent', country: (target.countries && target.countries[0]) || 'US' },
        }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) {
        setDraftModalError(data.error || `HTTP ${res.status}`)
      } else {
        setDraftModalContent({ subject: String(data.subject || ''), body: String(data.body || ''), model: data.model || null })
      }
    } catch (e) {
      setDraftModalError(e instanceof Error ? e.message : 'Draft failed')
    } finally {
      setDraftModalBusy(false)
    }
  }

  const saveDraftedOutreach = async (status: 'drafted' | 'sent') => {
    if (!draftModalTarget || !draftModalContent) return
    try {
      const res = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          target_id: draftModalTarget.id,
          subject: draftModalContent.subject,
          message_body: draftModalContent.body,
          status,
          operator_id: 'admin@portal',
        }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) throw new Error(data.error || 'save failed')
      notify(status === 'sent' ? 'Outreach recorded as sent.' : 'Draft saved.', 'success')
      setDraftModalTarget(null); setDraftModalContent(null)
      void loadBacklinkReport(true)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Save failed', 'error')
    }
  }


  const loadBacklinkReport = React.useCallback(async (force = false) => {
    if (backlinkBusy) return
    if (!force && backlinkReport) return
    setBacklinkBusy(true)
    try {
      const qs = regionFilter ? `?report=full&country=${encodeURIComponent(regionFilter)}` : '?report=full'
      const res = await fetch(`/api/seo-engine/backlink${qs}`, {
        method: 'GET', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) throw new Error(data.error || 'report failed')
      setBacklinkReport({
        targets: data.targets || [],
        inboundGaps: data.inboundGaps || [],
        outboundGaps: data.outboundGaps || [],
        totals: data.totals || undefined,
        generatedAt: data.generatedAt || new Date().toISOString(),
      })
      setBacklinkLastFetched(new Date())
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Backlink report failed', 'error')
    } finally {
      setBacklinkBusy(false)
    }
  }, [backlinkBusy, backlinkReport, regionFilter])

  const openDraftModal = async (target: any) => {
    setDraftModalTarget(target)
    setDraftModalContent(null)
    setDraftModalError(null)
    setDraftModalBusy(true)
    try {
      const res = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft', target_id: target.id }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) {
        setDraftModalError(data.error || `HTTP ${res.status}`)
        setDraftModalContent({ subject: '', body: '', model: null })
        return
      }
      setDraftModalContent({ subject: String(data.subject || ''), body: String(data.body || ''), model: data.model || null })
    } catch (e) {
      setDraftModalError(e instanceof Error ? e.message : 'Draft failed')
    } finally {
      setDraftModalBusy(false)
    }
  }

  const saveDraftedOutreach = async (status: 'drafted' | 'sent') => {
    if (!draftModalTarget || !draftModalContent) return
    try {
      const res = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          target_id: draftModalTarget.id,
          subject: draftModalContent.subject,
          message_body: draftModalContent.body,
          status,
          operator_id: 'admin@portal',
        }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || !data.ok) throw new Error(data.error || 'save failed')
      notify(status === 'sent' ? 'Outreach recorded as sent.' : 'Draft saved.', 'success')
      setDraftModalTarget(null); setDraftModalContent(null)
      void loadBacklinkReport(true)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Save failed', 'error')
    }
  }

  const renderKnowledgeTab = () => {
    const targets = backlinkReport?.targets || []
    const inboundGaps = backlinkReport?.inboundGaps || []
    const outboundGaps = backlinkReport?.outboundGaps || []
    const filteredTargets = backlinkLaneFilter === 'all'
      ? targets
      : targets.filter((t) => t.lane === backlinkLaneFilter)
    const wonCount = targets.filter((t) => t.status === 'won').length
    const sentCount = targets.filter((t) => t.status === 'sent').length
    const govCount = targets.filter((t) => t.kind === 'gov').length
    const KINDS = [
      { key: 'external',  label: 'External targets', count: targets.length },
      { key: 'inbound',   label: 'Inbound gaps',     count: inboundGaps.length },
      { key: 'outbound',  label: 'Outbound gaps',     count: outboundGaps.length },
    ] as const
    return (
      <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: C.radius, padding: 16, boxShadow: C.shadowCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold }}>Knowledge Radar</div>
            <h2 style={{ margin: '4px 0 4px', fontFamily: C.serif, fontSize: 22, color: C.text }}>Backlinks & link-graph gaps</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.textMuted, maxWidth: 720 }}>
              Two halves of the estate\u2019s link graph: inbound referrals from external authoritative sites, and our own internal pages that need more inbound or outbound edges. Curated target list + outreach timeline + the AI cascade drafting outreach messages on demand.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {backlinkLastFetched && <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>inspected {timeAgo(backlinkLastFetched.toISOString())}</span>}
            <button type="button" onClick={() => void loadBacklinkReport(true)} disabled={backlinkBusy}
              style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: C.navy, color: '#FFF', fontSize: 11, fontWeight: 700, fontFamily: C.mono, cursor: backlinkBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {backlinkBusy ? 'Scanning\u2026' : '\u21bb Re-scan link graph'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 10 }}>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: C.greenSoft, color: C.green, fontWeight: 700 }}>{wonCount} won</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: C.blueSoft, color: C.blue, fontWeight: 700 }}>{sentCount} sent</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: C.goldSoft, color: C.gold, fontWeight: 700 }}>{govCount} govt</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: C.surface, color: C.textMuted, border: '1px solid ' + C.border, fontWeight: 700 }}>{inboundGaps.length} inbound gaps</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: C.surface, color: C.textMuted, border: '1px solid ' + C.border, fontWeight: 700 }}>{outboundGaps.length} outbound gaps</span>
        </div>

        {/* Sub-toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setBacklinkView(k.key)}
              style={{ padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: C.mono,
                background: backlinkView === k.key ? C.navy : C.surface,
                color: backlinkView === k.key ? '#FFF' : C.textMuted,
                border: '1px solid ' + (backlinkView === k.key ? C.navy : C.border),
                display: 'inline-flex', alignItems: 'center', gap: 6 }} title={'Open ' + k.label}>
              {k.label}
              <span style={{ padding: '2px 6px', borderRadius: 999, background: backlinkView === k.key ? 'rgba(255,255,255,0.18)' : C.surface2, fontSize: 9 }}>{k.count}</span>
            </button>
          ))}
          {backlinkView === 'external' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['all','editorial','guest_post','resource_page'] as const).map((lane) => (
                <button key={lane} type="button" onClick={() => setBacklinkLaneFilter(lane)}
                  style={{ padding: '4px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                    background: backlinkLaneFilter === lane ? C.gold : C.surface,
                    color: backlinkLaneFilter === lane ? '#FFF' : C.textMuted,
                    border: '1px solid ' + (backlinkLaneFilter === lane ? C.gold : C.border) }}>
                  {lane}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sub-view content */}
        {backlinkView === 'external' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border, color: C.textDim }}>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Domain</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kind</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lane</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Authority</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Geography</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stages</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.slice(0, 50).map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid ' + C.border2 }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, color: C.navy }}>{t.domain}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{t.title || '\u2014'}</div>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10 }}>{t.kind}</td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10 }}>{t.lane}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 6, borderRadius: 3, background: C.surface2 }}>
                          <div style={{ width: Math.round(t.authority_score) + '%', height: 6, borderRadius: 3, background: t.authority_score >= 80 ? C.green : t.authority_score >= 60 ? C.gold : C.textDim }} />
                        </div>
                        <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700 }}>{Math.round(t.authority_score)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10 }}>{(t.countries || []).join(' / ') || '\u2014'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10 }}>{(t.stages || []).slice(0, 3).join(', ') || '\u2014'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono }}>
                      <span style={{ padding: '2px 7px', borderRadius: 999,
                        background: t.status === 'won' ? C.greenSoft : t.status === 'sent' ? C.blueSoft : C.surface2,
                        color: t.status === 'won' ? C.green : t.status === 'sent' ? C.blue : C.textMuted,
                        fontSize: 9, fontWeight: 700 }}>{t.status}</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button type="button" onClick={() => void openDraftModal(t)}
                        style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: C.gold, color: '#FFF', fontSize: 10, fontWeight: 700, fontFamily: C.mono, cursor: 'pointer' }}>
                        \u270d Draft message
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredTargets.length && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
                    {backlinkBusy ? 'Scanning link graph\u2026' : 'No targets match the current filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {backlinkView === 'inbound' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border, color: C.textDim }}>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source / page</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inbound links</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recommendation</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top anchors</th>
                </tr>
              </thead>
              <tbody>
                {inboundGaps.slice(0, 30).map((g) => (
                  <tr key={g.source_slug} style={{ borderBottom: '1px solid ' + C.border2 }}>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 11 }}>{g.source_slug}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, background: g.inbound_links === 0 ? '#FEE2E2' : '#FEF3C7', color: g.inbound_links === 0 ? C.red : C.gold, fontFamily: C.mono, fontSize: 10, fontWeight: 700 }}>{g.inbound_links}</span>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>{g.recommendation.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>
                      {(g.inbound_anchors || []).slice(0, 3).join(' \u00b7 ') || '\u2014'}
                    </td>
                  </tr>
                ))}
                {!inboundGaps.length && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: C.green, fontSize: 12 }}>
                     No inbound gaps \u2014 every published page has \u2265 3 inbound links.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {backlinkView === 'outbound' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border, color: C.textDim }}>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source page</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outbound count</th>
                  <th style={{ padding: '7px 10px', fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {outboundGaps.slice(0, 30).map((g) => (
                  <tr key={g.source_slug} style={{ borderBottom: '1px solid ' + C.border2 }}>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 11 }}>{g.source_slug}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, background: g.outbound_links === 0 ? '#FEE2E2' : '#FEF3C7', color: g.outbound_links === 0 ? C.red : C.gold, fontFamily: C.mono, fontSize: 10, fontWeight: 700 }}>{g.outbound_links}</span>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>{g.recommendation.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
                {!outboundGaps.length && (
                  <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: C.green, fontSize: 12 }}>
                     No outbound gaps \u2014 every published page has \u2265 3 outbound edges.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n  // Draft-message modal (Knowledge Radar \u2192 External \u2192 \u270d Draft message)\n  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  const renderDraftModal = () => {
    if (!draftModalTarget) return null
    return (
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }} onClick={() => !draftModalBusy && setDraftModalTarget(null)}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: C.surface, borderRadius: 12, padding: 20, width: 'min(720px, 96vw)',
          boxShadow: '0 30px 80px rgba(15,23,42,0.40)', border: '1px solid ' + C.border,
          maxHeight: '90vh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.gold, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 800 }}>Outreach draft</div>
              <h3 style={{ margin: '4px 0 4px', fontFamily: C.serif, fontSize: 20, color: C.text }}>{draftModalTarget.domain}</h3>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>{draftModalTarget.kind} \u00b7 lane {draftModalTarget.lane} \u00b7 authority {Math.round(draftModalTarget.authority_score)}</div>
            </div>
            <button type="button" onClick={() => setDraftModalTarget(null)} disabled={draftModalBusy} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + C.border, background: C.surface, color: C.textMuted, fontSize: 11, fontFamily: C.mono, cursor: draftModalBusy ? 'not-allowed' : 'pointer' }}>\u2715 Close</button>
          </div>
          {draftModalBusy && (
            <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontFamily: C.mono, fontSize: 12 }}>
              Drafting message via the AI cascade\u2026
              <div style={{ marginTop: 10, fontSize: 10, color: C.textDim }}>fallback template ships if the cascade is unavailable</div>
            </div>
          )}
          {draftModalError && (
            <div style={{ padding: 18, borderRadius: 8, background: '#FEE2E2', color: C.red, fontFamily: C.mono, fontSize: 12 }}>{draftModalError}</div>
          )}
          {draftModalContent && !draftModalBusy && (
            <div>
              <label style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject</label>
              <input value={draftModalContent.subject} onChange={(e) => setDraftModalContent({ ...draftModalContent, subject: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontFamily: C.mono, fontSize: 12, color: C.text, marginBottom: 12 }} />
              <label style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Body</label>
              <textarea value={draftModalContent.body} onChange={(e) => setDraftModalContent({ ...draftModalContent, body: e.target.value })} rows={14} style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid ' + C.border, fontFamily: 'inherit', fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 12 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>model: {draftModalContent.model || '\u2014'} \u00b7 editable above</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => saveDraftedOutreach('drafted')} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid ' + C.border, background: C.surface, color: C.text, fontSize: 11, fontWeight: 700, fontFamily: C.mono, cursor: 'pointer' }}>\u2913 Save draft</button>
                  <button type="button" onClick={() => saveDraftedOutreach('sent')} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: C.gold, color: '#FFF', fontSize: 11, fontWeight: 700, fontFamily: C.mono, cursor: 'pointer' }}>\u2709 Mark as sent</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderEngineTab = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, padding: 16, boxShadow: C.shadowCard }}>
      <SeoMasterEngine
        onBrief={(p: any) => applyBrief({
          term: p.primary_term || p.primaryTerm || '',
          title: (p.plan && (p.plan.pillar || p.plan.title)) || p.primary_term || p.primaryTerm || '',
          primaryKeyword: p.primary_term || p.primaryTerm || '',
          keywords: [p.primary_term || p.primaryTerm || '', ...((p.related_terms || p.relatedTerms || []) as string[])].filter(Boolean).slice(0, 8),
          contentType: (p.plan && p.plan.contentType) || 'blog_post',
          intent: p.intent || 'informational',
          interlinks: (p.interlinks || []) as string[],
          signals: (p.related_terms || p.relatedTerms || []) as string[],
          cluster: null,
          stage: p.stage,
          country: p.country,
        })}
        onIngest={(r: any) => notify(`Knowledge ingested: ${r.stored} stored / ${r.fetched} fetched (${r.aiSummarized} AI-summarized)`, 'success')}
      />
    </div>
  )

  const renderMissionsTab = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="📜" title="Mission Log"
        sub={`persistent audit trail · ${missionLog.length} shown${missionLoading ? ' · loading…' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {MISSION_KINDS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMissionKind(k)} style={{
                padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                fontFamily: C.mono, background: missionKind === k ? C.navy : C.surface2,
                color: missionKind === k ? '#fff' : C.textMuted,
              }}>
                {label}
              </button>
            ))}
            <span style={{ width: 1, height: 14, background: C.border, margin: '0 4px' }} />
            {MISSION_STATUSES.map(([k, label]) => (
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
        }
      />
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {missionLog.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
            {missionLoading ? 'Loading mission history…' : 'No missions recorded yet — launch a play to start the audit trail.'}
          </div>
        )}
        {missionLog.map((m) => (
          <div key={m.id} style={{ padding: '9px 16px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
    </div>
  )

  const renderSystemsTab = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {/* Health */}
      <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, boxShadow: C.shadowCard }}>
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
      <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, boxShadow: C.shadowCard }}>
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
      <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, boxShadow: C.shadowCard }}>
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
      <div style={{ padding: 12, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, boxShadow: C.shadowCard }}>
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
  )

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: workspaceOpen ? 'minmax(0, 1fr) minmax(360px, 380px)' : '1fr',
      gap: 0, minHeight: 'calc(100vh - 120px)', margin: '0 -8px',
    }}>
      {/* ── Command surface ── */}
      <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* ── Hero command band ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
          color: '#FFFFFF', borderRadius: C.radius, padding: '18px 22px', marginBottom: 16,
          boxShadow: C.shadowLifted, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -40, top: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(252,211,77,0.10)', zIndex: 0 }} />
          <div style={{ position: 'absolute', left: -50, bottom: -80, width: 240, height: 240, borderRadius: '50%', background: 'rgba(96,165,250,0.08)', zIndex: 0 }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: kpis.liveGsc ? '#34D399' : '#FCD34D', display: 'inline-block', boxShadow: kpis.liveGsc ? '0 0 0 3px rgba(52,211,153,0.25)' : '0 0 0 3px rgba(252,211,77,0.25)' }} />
                <h1 style={{ margin: 0, fontSize: 26, color: '#FFFFFF', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: C.serif }}>
                  SEO Command Center
                </h1>
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: kpis.liveGsc ? 'rgba(52,211,153,0.16)' : 'rgba(252,211,77,0.16)',
                  color: kpis.liveGsc ? '#A7F3D0' : '#FCD34D', letterSpacing: '0.06em',
                }}>
                  {kpis.liveGsc ? '● LIVE GSC' : '◐ SNAPSHOT'}
                </span>
              </div>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 13, maxWidth: 660 }}>
                Six dedicated surfaces — one brain for radar, brief, pipeline, engine, audit and systems.
                {radarLastRefreshed && <span style={{ fontFamily: C.mono, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}> · last sync {Math.round((Date.now() - radarLastRefreshed.getTime()) / 60_000)}m ago</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                Region
                <select value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setRadar(null); loadRadar() }} style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.10)', color: '#FFF', fontSize: 11 }}>
                  <option value="" style={{ color: '#111' }}>All</option>
                  {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => <option key={r} value={r} style={{ color: '#111' }}>{r}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry-run
              </label>
              <button type="button" onClick={loadRadar} disabled={radarBusy} style={{ padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.10)', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {radarBusy ? <span style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} /> : '⟳'}
                {radarBusy ? 'Scanning…' : 'Rescan radar'}
              </button>
              <button type="button" onClick={() => setWorkspaceOpen((v) => !v)} style={workspaceOpen ? { padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: '#FCD34D', color: '#0F172A', border: 'none', fontSize: 11, fontWeight: 800 } : { padding: '7px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.10)', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700 }}>
                {workspaceOpen ? '✕ Hide workspace' : '◈ Workspace'}
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI command cards — each navigates to the surface it reports ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Actionable plays', value: String(kpis.actionable), sub: 'radar queue', icon: '🎯', color: C.cyan2, to: () => { setRadarFilter('all'); setTab('radar') } },
            { label: 'Est. clicks / mo', value: `~${fmtN(kpis.gain)}`, sub: 'if plays ship', icon: '📈', color: C.green, to: () => { setRadarFilter('all'); setTab('radar') } },
            { label: 'Queries analyzed', value: fmtN(kpis.analyzed), sub: 'GSC signals', icon: '🔍', color: C.text, to: () => setTab('radar') },
            { label: 'Avg authority', value: String(kpis.authority || '—'), sub: 'win probability', icon: '🏛', color: C.violet, to: () => setTab('radar') },
            { label: 'In flight', value: String(kpis.inflight), sub: 'jobs drafting', icon: '⚙️', color: C.orange, to: () => { setJobStatusFilter('drafting'); setTab('pipeline') } },
            { label: 'PRs open', value: String(kpis.pr), sub: 'awaiting review', icon: '🔀', color: C.blue, to: () => { setJobStatusFilter('pr_created'); setTab('pipeline') } },
            { label: 'Cannibal watch', value: String(kpis.cannibals), sub: 'consolidate', icon: '⚠️', color: C.red, to: () => { setRadarFilter('cannibalization'); setTab('radar') } },
            { label: 'Total jobs', value: String(jobsTotal > 0 ? jobsTotal : jobs.length), sub: 'in the pipeline', icon: '📋', color: C.cyan2, to: () => { setJobStatusFilter('all'); setTab('pipeline') } },
          ].map((k) => (
            <button key={k.label} type="button" onClick={k.to} title={`Open ${k.label}`} style={{
              textAlign: 'left', padding: '11px 13px', borderRadius: C.radiusSm,
              background: C.surface, border: `1px solid ${C.border}`, cursor: 'pointer',
              boxShadow: C.shadowCard, transition: 'transform 0.12s, box-shadow 0.12s', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', gap: 2,
            }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = C.shadowHover; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = C.shadowCard; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>{k.icon}</span>
                <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, fontWeight: 800 }}>→</span>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: C.mono, lineHeight: 1.2 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.textDim }}>{k.sub}</div>
            </button>
          ))}
        </div>

        {/* ── Surface navigation — each pill leads to its component ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              title={`Open ${t.label}`}
              style={{
                padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
                background: tab === t.key ? C.navy : C.surface, color: tab === t.key ? '#FFF' : C.textMuted,
                border: `1px solid ${tab === t.key ? C.navy : C.border}`, transition: 'all 0.15s',
                boxShadow: tab === t.key ? '0 3px 10px rgba(15,23,42,0.18)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.icon} {t.label}
              <span style={{ marginLeft: 4, fontSize: 9, fontFamily: C.mono, opacity: 0.75 }}>{t.hint}</span>
            </button>
          ))}
        </div>

        {/* ══════════ TAB: RADAR ══════════ */}
        {tab === 'radar' && renderRadarTab()}

        {/* ══════════ TAB: LAUNCH ══════════ */}
        {tab === 'launch' && renderLaunchTab()}

        {/* ══════════ TAB: PIPELINE ══════════ */}
        {tab === 'pipeline' && renderPipelineTab()}

        {/* ═════════ TAB: KNOWLEDGE RADAR ═════════ */}
        {tab === 'knowledge' && renderKnowledgeTab()}

        {/* ══════════ TAB: ENGINE ══════════ */}
        {tab === 'engine' && renderEngineTab()}

        {/* ══════════ TAB: MISSIONS ══════════ */}
        {tab === 'missions' && renderMissionsTab()}

        {/* ══════════ TAB: SYSTEMS ══════════ */}
        {tab === 'systems' && renderSystemsTab()}

{renderDraftModal()}

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
