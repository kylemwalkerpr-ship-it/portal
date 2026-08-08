'use client'
import React from 'react'
import AdminDeepInterlinkPanel from './admin-deep-interlink-panel'
import AdminSiteHealthPanel from './admin-site-health-panel'
const AdminCommandCenter = React.lazy(() => import('./admin-command-center'))
import AdminInlineEditor from './admin-inline-editor'

// ── Color tokens (match admin-templates.tsx) ──
const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', cyan: '#3C3B6E', red: '#DC2626', green: '#166534',
  orange: '#D97706', purple: '#7C3AED', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', gold: '#9A7B3B', navy: '#0F172A', blue: '#2563EB',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
}

// ── Provider → default model (mirrors contentAiProvider defaults) ──
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.6-luna',
  custom: 'gpt-5.6-luna',
  grok: 'grok-3',
  deepseek: 'deepseek-chat',
  'nvidia-deepseek': 'deepseek-ai/deepseek-v4-pro',
  'cloudflare-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
}

// ── Types ──
type ContentType = 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'

interface ContentJob {
  id: string; title: string; topic: string; content_type: ContentType
  tone: Tone; region: Region; target_repo: string; status: JobStatus
  slug: string | null; content: string | null; branch_name: string | null
  content_path: string | null; pr_url: string | null; pr_number: number | null
  merged_at: string | null; closed_at: string | null; error_message: string | null
  ai_provider: string | null; ai_model?: string | null; word_count: number | null; seo_score: number | null
  audit_json?: { model?: string; score?: number; grade?: string; attempts?: number } | null
  primary_keyword?: string | null; ship_mode?: string | null; indexable?: boolean
  created_at: string; updated_at: string
}

interface ContentStudioProps {
  services: any[]; refreshAdminData: () => void; setActionNotice: (msg: string) => void
}

interface InterlinkSuggestion {
  label: string; url: string; site: string; kind: string; priority: number
  matchedOn: string[]; note?: string
}

interface GscMiniStats {
  clicks: number; impressions: number; ctr: number; position: number
  topQuery: string; topQueryClicks: number
}

interface AISuggestion {
  topic: string
  title: string
  primaryKeyword: string
  keywords: string[]
  audience: string
  impressions: number
  clicks?: number
  ctr?: number
  position?: number
  demandScore: number
  upsideScore?: number
  difficultyScore?: number
  opportunityScore: number
  trend: 'rising' | 'flat' | 'declining'
  play: 'content_gap' | 'quick_win' | 'refresh' | 'defend' | 'cannibalization'
  intent: 'informational' | 'commercial' | 'transactional' | 'local' | 'navigational'
  contentType?: 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
  intentCategory: string
  profitability: 'high' | 'medium' | 'low'
  reason: string
  signals: string[]
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  coverage?: { matched: boolean; matches: string[] }
  sourcePage?: string
}


// ── Helpers ──

const REGION_OPTIONS: { value: Region; label: string; flag: string }[] = [
  { value: 'US', label: 'United States', flag: '🇺🇸' },
  { value: 'CA', label: 'Canada', flag: '🇨🇦' },
  { value: 'AU', label: 'Australia', flag: '🇦🇺' },
  { value: 'UK', label: 'United Kingdom', flag: '🇬🇧' },
  { value: 'COMPARE', label: 'Cross-Country Comparison', flag: '🔀' },
]

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'educational', label: 'Educational' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'casual', label: 'Casual' },
]

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; ext: string; repo: string; icon: string }[] = [
  { value: 'blog_post', label: 'Blog Post', ext: '.md', repo: 'caseworks', icon: '📝' },
  { value: 'article', label: 'Long-Form Article', ext: '.mdx', repo: 'caseworks', icon: '📄' },
  { value: 'regional_page', label: 'Regional Page', ext: '.mdx', repo: 'yousafe-consultancy', icon: '🌐' },
  { value: 'marketplace_gig', label: 'Marketplace Gig', ext: '.mdx', repo: 'portal', icon: '🏪' },
]

// ── Opportunity Radar presentation maps ──
const PLAY_META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  quick_win: { label: 'QUICK WIN', bg: '#D1FAE5', fg: '#065F46', icon: '⚡' },
  content_gap: { label: 'GAP', bg: '#DBEAFE', fg: '#1E40AF', icon: '🧩' },
  refresh: { label: 'REFRESH', bg: '#FEF3C7', fg: '#92400E', icon: '🔄' },
  defend: { label: 'DEFEND', bg: '#EEF2FF', fg: '#3730A3', icon: '🛡️' },
  cannibalization: { label: 'CANNIBAL', bg: '#FEE2E2', fg: '#991B1B', icon: '⚠️' },
}
const INTENT_LABELS: Record<string, string> = {
  informational: '📖 Informational', commercial: '🔍 Commercial',
  transactional: '🛒 Transactional', local: '📍 Local', navigational: '🧭 Navigational',
}
const TONE_FOR_INTENT: Record<string, Tone> = {
  informational: 'educational', commercial: 'persuasive', transactional: 'professional',
  local: 'educational', navigational: 'authoritative',
}
const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  rising: { icon: '↗', color: '#059669', label: 'Rising' },
  flat: { icon: '→', color: '#9CA3AF', label: 'Flat' },
  declining: { icon: '↘', color: '#DC2626', label: 'Declining' },
}
const RADAR_FILTERS: Array<{ key: 'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'quick_win', label: '⚡ Quick Wins' },
  { key: 'content_gap', label: '🧩 Gaps' },
  { key: 'rising', label: '↗ Rising' },
  { key: 'refresh', label: '🔄 Refresh' },
]
function fmtN(n: number | undefined | null): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

function statusBadge(status: JobStatus) {
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
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}
  </span>
}

function statusStepper(status: JobStatus) {
  const steps: { key: JobStatus; label: string }[] = [
    { key: 'pending', label: 'Queued' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'publishing', label: 'PR' },
    { key: 'pr_created', label: 'PR Ready' },
    { key: 'merged', label: 'Merged' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const isFailed = status === 'failed'
  const isClosed = status === 'closed'
  if (isFailed) return <span style={{ fontSize: 10, color: C.red, fontWeight: 600, fontFamily: C.mono }}>⚠ Failed</span>
  if (isClosed) return <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, fontFamily: C.mono }}>✕ Closed</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx
        const color = done ? C.green : active ? C.gold : C.textDim
        const bg = done ? C.green : active ? C.gold : 'transparent'
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ width: 12, height: 1, background: done ? C.green : C.border, flexShrink: 0 }} />}
            <span title={s.label} style={{
              width: 8, height: 8, borderRadius: 999, flexShrink: 0,
              background: active ? bg : 'transparent',
              border: `2px solid ${color}`,
            }} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '' }
}

// ── Summary Cards ──

function SummaryCards({ jobs }: { jobs: ContentJob[] }) {
  const total = jobs.length
  const merged = jobs.filter(j => j.status === 'merged').length
  const inProgress = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
  const prReady = jobs.filter(j => j.status === 'pr_created').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const cards = [
    { label: 'Total Jobs', value: total, color: C.cyan, icon: '📋' },
    { label: 'In Progress', value: inProgress, color: C.orange, icon: '⚙️' },
    { label: 'PR Ready', value: prReady, color: C.blue, icon: '🔀' },
    { label: 'Merged', value: merged, color: C.green, icon: '✅' },
    { label: 'Failed', value: failed, color: C.red, icon: '⚠️' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 16px', borderTop: `3px solid ${c.color}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>{c.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: C.serif }}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Opportunity Radar + Autopilot Quick Create ────────────────────────────

function QuickCreate({
  expanded, onToggle, generating, onGenerate,
  topic, keywords, onTopicChange, onKeywordsChange,
  suggestions, suggestionsLoading, suggestionsError, onRefreshSuggestions, onApplySuggestion,
  brief, briefInterlinks, onClearBrief,
}: {
  expanded: boolean; onToggle: () => void; generating: boolean
  onGenerate: (data: any) => void
  topic: string; keywords: string; onTopicChange: (v: string) => void; onKeywordsChange: (v: string) => void
  suggestions?: AISuggestion[]; suggestionsLoading?: boolean; suggestionsError?: string | null
  onRefreshSuggestions?: (region: string) => void; onApplySuggestion?: (s: AISuggestion) => void
  brief?: AISuggestion | null
  briefInterlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  onClearBrief?: () => void
}) {
  const [contentType, setContentType] = React.useState<ContentType>('blog_post')
  const [region, setRegion] = React.useState<Region>('US')
  const [tone, setTone] = React.useState<Tone>('educational')
  const [aiProvider, setAiProvider] = React.useState('auto')
  const [title, setTitle] = React.useState('')
  const [audience, setAudience] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'>('all')

  // Autopilot: applying a radar card auto-fills every field, not just topic/keywords.
  // Every value remains editable — the radar only pre-fills.
  React.useEffect(() => {
    if (!brief) return
    if (brief.contentType) setContentType(brief.contentType as ContentType)
    if (brief.intent) setTone(TONE_FOR_INTENT[brief.intent] ?? 'educational')
    if (brief.title) setTitle(brief.title)
    if (brief.audience) setAudience(brief.audience)
  }, [brief])

  const visibleSuggestions = React.useMemo(() => {
    if (!suggestions) return suggestions
    if (filter === 'all') return suggestions
    return suggestions.filter((s) =>
      filter === 'rising' ? s.trend === 'rising'
      : filter === 'quick_win' ? s.play === 'quick_win'
      : filter === 'content_gap' ? s.play === 'content_gap'
      : filter === 'refresh' ? (s.play === 'refresh' || s.play === 'defend')
      : true)
  }, [suggestions, filter])

  const playOf = (s: AISuggestion) => s.play ?? (s.coverage?.matched ? 'refresh' : 'content_gap')
  const scoreOf = (s: AISuggestion) => s.opportunityScore ?? s.demandScore

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveTitle = title.trim()
    const effectiveTopic = topic.trim() || effectiveTitle
    if (!effectiveTopic) return
    onGenerate({
      content_type: contentType, region, tone,
      title: effectiveTitle || effectiveTopic, topic: effectiveTopic,
      audience: audience.trim(),
      keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
      aiProvider,
      interlinks: briefInterlinks ?? [],
      opportunity: brief,
    })
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '14px 18px', border: 'none', background: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'inherit',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif, textAlign: 'left' }}>
            ✨ Quick Create — Autopilot
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted, textAlign: 'left' }}>
            Opportunity Radar → autofilled brief → AI draft → GitHub PR.
          </p>
        </div>
        <span style={{ fontSize: 18, color: C.textDim, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {expanded && (
        <>
          {/* ── Opportunity Radar strip ── */}
          <div style={{ padding: '0 16px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono }}>
                🎯 Opportunity Radar
              </span>
              <button type="button" onClick={() => onRefreshSuggestions?.(region)} disabled={suggestionsLoading} style={{
                padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: C.surface2, color: C.textDim, fontSize: 9, fontWeight: 600, fontFamily: 'inherit',
              }}>
                {suggestionsLoading ? '⏳ Scanning…' : '🔄 Rescan'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {RADAR_FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
                  padding: '3px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                  fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
                  transition: 'all 0.15s',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            {suggestionsLoading ? (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ minWidth: 200, height: 108, borderRadius: 8, background: C.surface3, opacity: 0.5, flexShrink: 0 }} />
                ))}
              </div>
            ) : (visibleSuggestions && visibleSuggestions.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollBehavior: 'smooth' }}>
                {visibleSuggestions.map((s) => {
                  const pm = PLAY_META[playOf(s)] || PLAY_META.content_gap
                  const score = scoreOf(s)
                  const tm = TREND_META[s.trend || 'flat'] || TREND_META.flat
                  const active = brief && brief.topic === s.topic
                  return (
                    <button
                      key={s.topic}
                      type="button"
                      onClick={() => onApplySuggestion?.(s)}
                      style={{
                        minWidth: 216, maxWidth: 250, flexShrink: 0,
                        textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                        border: active ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                        background: active ? '#FEF9EC' : C.surface,
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surface2; e.currentTarget.style.borderColor = C.gold }}
                      onMouseLeave={e => { e.currentTarget.style.background = active ? '#FEF9EC' : C.surface; e.currentTarget.style.borderColor = active ? C.gold : C.border }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg }}>
                          {pm.icon} {pm.label}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, fontFamily: C.mono, color: score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim }}>{score}</span>
                          <span style={{ fontSize: 12, color: tm.color, fontWeight: 700 }} title={tm.label}>{tm.icon}</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 5 }}>
                        {s.title.length > 64 ? s.title.slice(0, 61) + '…' : s.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>#{s.position ?? '—'}</span>
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{fmtN(s.impressions)} imp</span>
                        <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, fontFamily: C.mono, background: C.surface3, color: C.textMuted }}>
                          {INTENT_LABELS[s.intent] || s.intentCategory || '📖 Informational'}
                        </span>
                      </div>
                      {(s.signals && s.signals.length ? s.signals.slice(0, 2) : [s.reason]).map((sig, si) => (
                        <p key={si} style={{ margin: 0, fontSize: 8.5, color: C.textDim, lineHeight: 1.35 }}>• {sig}</p>
                      ))}
                      <div style={{ marginTop: 5, fontSize: 8.5, color: C.gold, fontFamily: C.mono }}>
                        {s.interlinks && s.interlinks.length ? `🔗 ${s.interlinks.length} link targets` : '🔗 no registry match'}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: '10px 0', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                No opportunities for this filter — rescan or switch filter.
              </div>
            ))}
            {suggestionsError && (
              <div style={{ margin: '4px 0 8px', fontSize: 10, color: C.orange, fontFamily: C.mono }}>⚠ {suggestionsError}</div>
            )}
          </div>

          {/* ── Autopilot brief preview ── */}
          {brief && (
            <div style={{ margin: '4px 16px 12px', border: '1px solid #F0D9A8', background: '#FEF9EC', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.gold, textTransform: 'uppercase', fontFamily: C.mono }}>
                  🧭 Autopilot brief — every field pre-filled & editable
                </span>
                <button type="button" onClick={onClearBrief} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: C.textDim, fontFamily: 'inherit' }}>
                  ✕ Clear
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{brief.primaryKeyword || brief.topic}</span>
                <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono, background: (PLAY_META[brief.play] || {}).bg || C.surface3, color: (PLAY_META[brief.play] || {}).fg || C.textMuted }}>
                  {(brief.play || 'content_gap').replace('_', ' ')} · {scoreOf(brief)}/100
                </span>
                <span style={{ fontSize: 9, color: C.textMuted, fontFamily: C.mono }}>
                  {brief.intent} · {brief.contentType || 'blog_post'} · {brief.trend}
                </span>
              </div>
              {brief.keywords && brief.keywords.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {brief.keywords.slice(0, 8).map(k => (
                    <span key={k} style={{ padding: '1px 6px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #F0D9A8', fontSize: 8.5, color: C.textMuted, fontFamily: C.mono }}>{k}</span>
                  ))}
                </div>
              )}
              {briefInterlinks && briefInterlinks.length > 0 && (
                <div>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: C.gold, fontFamily: C.mono }}>🔗 INTERNAL LINKING ({briefInterlinks.length})</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {briefInterlinks.slice(0, 4).map((l, li) => (
                      <span key={li} style={{ padding: '2px 7px', borderRadius: 4, background: '#FFFFFF', border: '1px solid #F0D9A8', fontSize: 8.5, color: C.text, fontFamily: C.mono }}>
                        {l.label} → {String(l.url || '').replace(/^https?:\/\//, '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            {/* Content type */}
            <div style={{ marginTop: 14, marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
                Content Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                {CONTENT_TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setContentType(opt.value)} style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                    border: contentType === opt.value ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                    background: contentType === opt.value ? C.surface2 : C.surface,
                    cursor: 'pointer', fontSize: 11, color: C.text, fontFamily: 'inherit',
                  }}>
                    <span style={{ marginRight: 4 }}>{opt.icon}</span>
                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ display: 'block', fontSize: 9, color: C.textDim, marginTop: 1 }}>{opt.ext} → {opt.repo}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Region + Tone + AI Model */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Region</label>
                <select value={region} onChange={e => { setRegion(e.target.value as Region); onRefreshSuggestions?.(e.target.value) }} style={inputStyle}>
                  {REGION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.flag} {r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tone</label>
                <select value={tone} onChange={e => setTone(e.target.value as Tone)} style={inputStyle}>
                  {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>AI Model</label>
              <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={inputStyle}>
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

            {/* Title */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Title <span style={{ color: C.textDim, fontWeight: 400 }}>(optional — radar suggests one)</span></label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. F-1 OPT Application: Complete 2026 Timeline" maxLength={120} style={inputStyle} />
            </div>

            {/* Topic */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Topic <span style={{ color: C.red }}>*</span></label>
              <textarea value={topic} onChange={e => onTopicChange(e.target.value)} rows={3} required style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Describe what to write — visa types, forms, timelines, comparison angles..." />
            </div>

            {/* Audience + Keywords */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Audience</label>
                <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="international students, H-1B holders..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Keywords (comma-separated)</label>
                <input value={keywords} onChange={e => onKeywordsChange(e.target.value)} placeholder="F-1 visa, OPT timeline, I-765..." style={inputStyle} />
              </div>
            </div>

            {brief && (
              <p style={{ margin: '0 0 8px', fontSize: 9.5, color: C.gold, fontFamily: C.mono }}>
                Autopilot brief applied — interlinks + opportunity signals will be sent to the generator. Review fields, then generate.
              </p>
            )}

            <button type="submit" disabled={generating || (!topic.trim() && !title.trim())} style={{
              width: '100%', padding: '10px 0', borderRadius: 6, border: 'none',
              cursor: generating ? 'not-allowed' : 'pointer',
              background: generating ? C.textDim : C.navy, color: '#FFFFFF',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: generating ? 0.6 : 1,
            }}>
              {generating ? '⚡ Generating…' : '⚡ Generate & Open PR'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

// ── Opportunity Radar (full scored list) ──────────────────────────────────

function OpportunityRadar({ opportunities, meta, onApply }: {
  opportunities: AISuggestion[]
  meta?: Record<string, unknown> | null
  onApply: (s: AISuggestion) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const list = (opportunities ?? []).slice(0, expanded ? 24 : 8)
  const source = (meta?.source as string) || '—'
  const coverage = (meta?.coverage as { total?: number; covered?: number; gaps?: number } | null) || null
  const cannibal = (meta?.cannibalization as Array<{ term: string; pages: string[] }> | null) || null
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.serif }}>🎯 Opportunity Radar</h4>
          <p style={{ margin: '2px 0 0', fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>
            {source}
            {coverage ? ` · ${coverage.total ?? 0} known pages · ${coverage.gaps ?? 0} gaps` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: C.textMuted, fontFamily: 'inherit' }}>
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        {list.map((o, i) => {
          const pm = PLAY_META[o.play] || PLAY_META.content_gap
          const score = o.opportunityScore ?? o.demandScore
          return (
            <div key={`${o.topic}-${i}`} style={{ padding: '9px 16px', borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ minWidth: 34, fontSize: 12, fontWeight: 800, fontFamily: C.mono, color: score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim }}>{score}</span>
              <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg, whiteSpace: 'nowrap' }}>{pm.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
                <div style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {o.signals && o.signals[0] ? o.signals[0] : o.reason}
                </div>
              </div>
              <button type="button" onClick={() => onApply(o)} style={{
                flexShrink: 0, padding: '4px 9px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: C.navy, color: '#FFFFFF', fontSize: 9, fontWeight: 700, fontFamily: 'inherit',
              }}>Draft</button>
            </div>
          )
        })}
        {(!list || list.length === 0) && (
          <div style={{ padding: '14px 16px', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
            No scored opportunities yet — rescan the radar above.
          </div>
        )}
      </div>
      {cannibal && cannibal.length > 0 && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, background: '#FEF2F2' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.red, fontFamily: C.mono }}>⚠ CANNIBALIZATION WATCH ({cannibal.length})</span>
          {cannibal.slice(0, 3).map((c, ci) => (
            <div key={ci} style={{ fontSize: 8.5, color: C.textMuted, fontFamily: C.mono, marginTop: 2 }}>
              “{c.term}” targeted by {c.pages.length} pages — consolidate, don't create another
            </div>
          ))}
        </div>
      )}
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
  boxSizing: 'border-box',
}

// ── Interlinks Mini Panel ──

function InterlinksMini({ topic, keywords }: { topic: string; keywords: string }) {
  const [suggestions, setSuggestions] = React.useState<InterlinkSuggestion[]>([])
  const [loading, setLoading] = React.useState(false)
  const [fetched, setFetched] = React.useState(false)
  const kwArr = keywords.split(',').map(s => s.trim()).filter(Boolean)

  const fetchLinks = React.useCallback(async () => {
    if (!topic.trim() && kwArr.length === 0) return
    setLoading(true)
    setFetched(true)
    try {
      const res = await fetch('/api/content-studio/interlinks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), keywords: kwArr, maxResults: 4 }),
      })
      const data = await res.json()
      if (res.ok) setSuggestions(data.suggestions ?? [])
    } catch {} finally { setLoading(false) }
  }, [topic, keywords])

  const siteIcon = (s: string) => s === 'marketplace' ? '🏪' : s === 'caseworks' ? '📚' : '🌐'
  const siteColor = (s: string) => s === 'marketplace' ? C.green : s === 'caseworks' ? C.navy : C.orange

  if (!fetched && !topic.trim() && kwArr.length === 0) return null

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: suggestions.length > 0 ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.serif }}>🔗 Interlink Suggestions</h4>
          <p style={{ margin: '1px 0 0', fontSize: 10, color: C.textDim }}>caseworks → regional → marketplace funnel</p>
        </div>
        <button onClick={fetchLinks} disabled={loading} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: C.navy, color: '#FFF', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
        }}>
          {loading ? 'Searching…' : fetched ? 'Refresh' : 'Find'}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {suggestions.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4,
              background: C.surface2, textDecoration: 'none', color: C.text, fontSize: 11,
              borderLeft: `2px solid ${siteColor(s.site)}`,
            }}>
              <span style={{ fontSize: 12 }}>{siteIcon(s.site)}</span>
              <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{s.site}</span>
            </a>
          ))}
        </div>
      )}
      {fetched && suggestions.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: C.textDim, textAlign: 'center' }}>
          No matches — try broader keywords
        </div>
      )}
    </div>
  )
}

// ── GSC Mini Stats Card ──

function GscMini() {
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
        })
      } else if (data.source === 'snapshot') {
        setStats({
          clicks: data.totals?.clicks ?? 0,
          impressions: data.totals?.impressions ?? 0,
          ctr: 0, position: 0,
          topQuery: data.rows?.[0]?.keys?.[0] ?? '—',
          topQueryClicks: data.rows?.[0]?.clicks ?? 0,
        })
      } else { setError(data.error || 'No data') }
    } catch { setError('Failed to load') } finally { setLoading(false) }
  }

  React.useEffect(() => { fetchGsc() }, [])

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: stats ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.serif }}>📊 GSC Overview (28d)</h4>
        <button onClick={fetchGsc} disabled={loading} style={{
          padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: C.surface3, color: C.textMuted, fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
        }}>{loading ? '…' : '↻'}</button>
      </div>
      {stats && (
        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Clicks', value: stats.clicks.toLocaleString(), color: C.green },
              { label: 'Impressions', value: stats.impressions.toLocaleString(), color: C.blue },
              { label: 'CTR', value: `${stats.ctr.toFixed(1)}%`, color: C.purple },
              { label: 'Avg Pos', value: stats.position.toFixed(1), color: C.orange },
            ].map(m => (
              <div key={m.label} style={{ background: C.surface2, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
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
      )}
      {error && <div style={{ padding: '10px 16px', fontSize: 10, color: C.textDim }}>{error}</div>}
    </div>
  )
}

// ── Live Pipeline ──

function LivePipeline({ jobs, onSelect }: { jobs: ContentJob[]; onSelect: (j: ContentJob) => void }) {
  const active = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).slice(0, 6)
  if (active.length === 0) return (
    <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: C.textDim }}>
      No active jobs — create one to see the pipeline
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {active.map(j => (
        <div key={j.id} onClick={() => onSelect(j)} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: 'pointer',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {j.title || '(untitled)'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{j.content_type?.replace('_', ' ')}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>·</span>
              <span style={{ fontSize: 10, color: C.textDim }}>{j.region}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>·</span>
              <span style={{ fontSize: 10, color: C.textDim }}>{timeAgo(j.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusStepper(j.status)}
            {j.pr_url && (
              <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ color: C.blue, textDecoration: 'none', fontSize: 10, fontWeight: 600, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                PR #{j.pr_number} ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const STAGE_PROGRESS: Record<string, number> = {
  connect: 4, plan: 12, gsc: 20, generate: 35, provider: 45,
  audit: 62, refine: 80, depth: 88, ship: 95, complete: 100,
}

function progressFromEvents(events: GenerationActivity[], active: boolean): number {
  let p = active ? 4 : 0
  for (const e of events) {
    const key = String(e.stage || '').toLowerCase()
    if (key in STAGE_PROGRESS) p = Math.max(p, STAGE_PROGRESS[key])
    if (e.level === 'error') return 100
  }
  return Math.min(100, p)
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(4, Math.min(100, value))}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: C.mono, color: 'rgba(255,255,255,0.75)', minWidth: 34, textAlign: 'right' }}>{Math.round(value)}%</span>
    </div>
  )
}

function LiveGenerationPanel({
  active,
  events,
  startedAt,
  streamedChars,
}: {
  active: boolean
  events: GenerationActivity[]
  startedAt: number | null
  streamedChars: number
}) {
  if (!active && events.length === 0) return null
  const latest = events[events.length - 1]
  const elapsed = startedAt ? fmtDur(Date.now() - startedAt) : ''
  const levelColor = latest?.level === 'error' ? C.red : latest?.level === 'warn' ? C.orange : latest?.level === 'success' ? C.green : C.blue
  return (
    <div style={{ marginBottom: 16, background: C.navy, color: '#FFF', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.14)' }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: active ? '#34D399' : levelColor, boxShadow: active ? '0 0 0 4px rgba(52,211,153,0.16)' : 'none' }} />
            {active ? 'AI work in progress' : latest?.level === 'error' ? 'Generation stopped' : 'Latest generation activity'}
          </div>
          <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.62)', fontFamily: C.mono }}>
            {active ? `Live pipeline · ${elapsed}${streamedChars ? ` · ${streamedChars.toLocaleString()} streamed characters` : ''}` : 'Activity captured from the generation pipeline'}
          </div>
        </div>
        <span style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 4, background: active ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.1)', color: active ? '#A7F3D0' : 'rgba(255,255,255,0.75)', fontSize: 9, fontFamily: C.mono, textTransform: 'uppercase' }}>
          {active ? 'streaming' : 'complete'}
        </span>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <ProgressBar value={progressFromEvents(events, active)} color={active ? '#34D399' : levelColor} />
      </div>
      <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {events.slice(-6).map((event, index, visible) => (
          <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, opacity: index === visible.length - 1 ? 1 : 0.68 }}>
            <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: event.level === 'error' ? 'rgba(248,113,113,0.18)' : event.level === 'warn' ? 'rgba(251,191,36,0.18)' : event.level === 'success' ? 'rgba(52,211,153,0.18)' : 'rgba(96,165,250,0.18)', color: event.level === 'error' ? '#FCA5A5' : event.level === 'warn' ? '#FCD34D' : event.level === 'success' ? '#6EE7B7' : '#93C5FD', fontSize: 9, fontWeight: 800 }}>
              {event.level === 'error' ? '!' : event.level === 'success' ? '✓' : '•'}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: '#F8FAFC' }}>{event.message}</div>
              <div style={{ marginTop: 2, fontSize: 9, color: 'rgba(255,255,255,0.45)', fontFamily: C.mono }}>{event.stage} · {fmtTime(event.ts)}</div>
            </div>
          </div>
        ))}
        {active && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: C.mono, paddingLeft: 26 }}>Waiting for the next pipeline event…</div>}
      </div>
    </div>
  )
}

// ── Job History Table ──

function JobHistory({ jobs, expanded, onToggle, onSelect, loading }: {
  jobs: ContentJob[]; expanded: boolean; onToggle: () => void; onSelect: (j: ContentJob) => void; loading: boolean
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '11px 16px', border: 'none', background: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'inherit', borderBottom: expanded ? `1px solid ${C.border}` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.serif }}>📋 Job History</span>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{loading ? '...' : jobs.length}</span>
        </div>
        <span style={{ fontSize: 14, color: C.textDim, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {expanded && (
        loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: C.textDim }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>📝</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>No jobs yet. Create your first piece above.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  <th style={thStyle}>Title / Topic</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Region</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>SEO</th>
                  <th style={thStyle}>PR</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, expanded ? 50 : 10).map(j => (
                  <tr key={j.id} onClick={() => onSelect(j)} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title || '(untitled)'}</div>
                      <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.topic?.slice(0, 60)}</div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 10, color: C.textMuted }}>{j.content_type?.replace('_', ' ')}</span></td>
                    <td style={tdStyle}>{j.region}</td>
                    <td style={tdStyle}>{statusBadge(j.status)}</td>
                    <td style={tdStyle}>{j.seo_score != null ? `${j.seo_score}%` : '—'}</td>
                    <td style={tdStyle}>
                      {j.pr_url ? <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none', fontWeight: 500 }}>PR #{j.pr_number} ↗</a> : '—'}
                    </td>
                    <td style={tdStyle}>{formatDate(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 9, fontWeight: 600, color: C.textDim,
  textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em',
  textAlign: 'left', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, color: C.text, verticalAlign: 'top',
}

// ── Job Timeline ──
//
// Fetches the full job row (?id=) which includes event_log — the durable
// per-job activity log seeded at creation (pipeline) and appended by the
// deploy monitor. Derived stage timestamps (created_at / merged_at /
// closed_at / deployed_at / pr timestamps) are merged in so the timeline
// shows the full lifecycle even before monitor entries exist.

type LogLevel = 'success' | 'info' | 'warn' | 'error'

interface TimelineEntry {
  ts: number
  level: LogLevel
  source: string
  message: string
  detail?: string
  kind: 'log' | 'stage'
}

interface GenerationActivity {
  id: string
  ts: number
  stage: string
  message: string
  level: 'info' | 'success' | 'warn' | 'error'
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  success: C.green, info: C.blue, warn: C.orange, error: C.red,
}

const LEVEL_ICON: Record<LogLevel, string> = {
  success: '✓', info: 'ℹ', warn: '▲', error: '✕',
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s}s`
}

/** Consume the existing SEO Factory SSE contract and return its final result. */
async function consumeSseResponse(
  response: Response,
  onEvent: (event: any) => void,
): Promise<any> {
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(failure.error || `Generation stream HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('Generation stream returned no readable body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: any = null
  const consume = (raw: string) => {
    const dataLine = raw.split(/\r?\n/).find(line => line.startsWith('data:'))
    if (!dataLine) return
    const payload = dataLine.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    const event = JSON.parse(payload)
    onEvent(event)
    if (event.type === 'final') finalResult = event.result
    if (event.type === 'error') throw new Error(event.error || 'Generation pipeline failed')
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = chunks.pop() || ''
    for (const chunk of chunks) consume(chunk)
    if (done) break
  }
  if (buffer.trim()) consume(buffer)
  if (!finalResult) throw new Error('Generation stream ended before a final result was received')
  return finalResult
}

function JobTimeline({ jobId, createdMs }: { jobId: string; createdMs: number }) {
  const [entries, setEntries] = React.useState<TimelineEntry[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/content-studio/jobs?id=${jobId}`, { credentials: 'same-origin' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
        if (cancelled) return
        const job = (data as { job?: any }).job ?? {}

        // Derived stage markers from the job row
        const derived: TimelineEntry[] = []
        const pushStage = (ts: unknown, source: string, message: string, detail?: string, level: LogLevel = 'success') => {
          const ms = typeof ts === 'number' ? ts : ts ? new Date(String(ts)).getTime() : NaN
          if (Number.isFinite(ms)) derived.push({ ts: ms, level, source, message, detail, kind: 'stage' })
        }
        pushStage(job.created_at ?? createdMs, 'job', 'Job created (queued)', undefined, 'info')
        if (job.pr_number || job.pr_url) {
          pushStage(job.created_at ?? createdMs, 'github', `Pull request #${job.pr_number ?? ''} opened`, job.pr_url || undefined, 'info')
        }
        if (job.deployed_at) pushStage(job.deployed_at, 'cloudflare', 'Deployed to Cloudflare', undefined, 'success')
        if (job.merged_at) pushStage(job.merged_at, 'github', 'Pull request merged', undefined, 'success')
        if (job.closed_at) pushStage(job.closed_at, 'github', 'Pull request closed without merge', undefined, 'warn')
        if (job.status === 'failed') {
          pushStage(job.updated_at ?? Date.now(), 'pipeline', job.error_message || 'Job failed', undefined, 'error')
        }

        // event_log entries from the pipeline + deploy monitor
        const logs: TimelineEntry[] = Array.isArray(job.event_log)
          ? (job.event_log as any[]).map((e) => ({
              ts: typeof e.ts === 'number' ? e.ts : new Date(String(e.ts)).getTime(),
              level: (['success', 'info', 'warn', 'error'].includes(e.level) ? e.level : 'info') as LogLevel,
              source: String(e.source || 'studio'),
              message: String(e.message || ''),
              detail: e.detail ? String(e.detail) : undefined,
              kind: 'log' as const,
            })).filter((e) => Number.isFinite(e.ts))
          : []

        // Merge, dedupe by (ts, message), sort ascending (oldest → newest)
        const merged = [...logs, ...derived]
        const seen = new Set<string>()
        const deduped = merged
          .filter((e) => {
            const key = `${e.ts}-${e.message}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .sort((a, b) => a.ts - b.ts)

        if (cancelled) return
        setEntries(deduped.length > 0 ? deduped : [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load timeline')
      }
    }
    load()
    // Keep the detail timeline live while the pipeline is still running. The
    // endpoint returns the durable event_log and current lifecycle status.
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      await load()
      if (!cancelled) timer = setTimeout(poll, 2500)
    }
    timer = setTimeout(poll, 2500)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, createdMs])

  if (error) {
    return <div style={{ fontSize: 11, color: C.red, fontFamily: C.mono }}>Timeline unavailable: {error}</div>
  }
  if (entries === null) {
    return <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>Loading timeline…</div>
  }
  if (entries.length === 0) {
    return <div style={{ fontSize: 11, color: C.textDim }}>No timeline events recorded yet.</div>
  }

  // Durations between consecutive stages
  const withDur = entries.map((e, i) => {
    const prev = i > 0 ? entries[i - 1] : null
    const dur = prev && prev.ts <= e.ts ? e.ts - prev.ts : null
    return { ...e, dur }
  })

  return (
    <div style={{ position: 'relative', paddingLeft: 22, marginBottom: 4 }}>
      {withDur.map((e, i) => {
        const isLast = i === withDur.length - 1
        const color = LEVEL_COLOR[e.level] ?? C.textDim
        return (
          <div key={`${e.ts}-${i}`} style={{ position: 'relative', paddingBottom: isLast ? 2 : 12 }}>
            {/* vertical connector */}
            {!isLast && <span style={{ position: 'absolute', left: -14, top: 16, bottom: -4, width: 2, background: C.border }} />}
            {/* dot */}
            <span style={{
              position: 'absolute', left: -19, top: 2, width: 12, height: 12, borderRadius: 999,
              background: color, color: '#FFF', fontSize: 8, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{LEVEL_ICON[e.level] ?? ''}</span>
            {/* content */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{e.message}</span>
                <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{fmtTime(e.ts)}</span>
                {e.dur !== null && i > 0 && (
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, background: C.surface3, padding: '0 5px', borderRadius: 3 }}>
                    +{fmtDur(e.dur)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <span style={{
                  fontSize: 9, padding: '0 6px', borderRadius: 3, fontFamily: C.mono, fontWeight: 600,
                  background: e.kind === 'stage' ? C.surface3 : color + '1A', color,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {e.source} · {e.kind === 'stage' ? 'stage' : 'log'}
                </span>
              </div>
              {e.detail && e.detail !== 'undefined' && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 9, color: C.textDim, cursor: 'pointer', fontFamily: C.mono }}>
                    detail
                  </summary>
                  <pre style={{
                    margin: '4px 0 0', maxHeight: 120, overflow: 'auto', background: C.surface3,
                    borderRadius: 4, padding: 8, fontSize: 9, fontFamily: C.mono, lineHeight: 1.5,
                    color: C.textMuted, whiteSpace: 'pre-wrap',
                  }}>{e.detail}</pre>
                </details>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Job Detail Modal ──

function JobDetail({
  job,
  onClose,
  onRefresh,
  setActionNotice,
}: {
  job: ContentJob
  onClose: () => void
  onRefresh: () => Promise<void> | void
  setActionNotice: (msg: string) => void
}) {
  const [detail, setDetail] = React.useState<ContentJob>(job)
  const [editorContent, setEditorContent] = React.useState(job.content || '')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionNotice, setLocalActionNotice] = React.useState<string | null>(null)
  const [activeAction, setActiveAction] = React.useState<string | null>(null)
  const [actionEvents, setActionEvents] = React.useState<GenerationActivity[]>([])
  const [actionStartedAt, setActionStartedAt] = React.useState<number | null>(null)
  const [actionChars, setActionChars] = React.useState(0)
  const [resumeAvailable, setResumeAvailable] = React.useState(false)
  // AI model override for regeneration (empty/auto = use job default or cascade)
  const [aiProvider, setAiProvider] = React.useState<string>('auto')
  const actionAbortRef = React.useRef<AbortController | null>(null)
  const [audit, setAudit] = React.useState<unknown>(null)

  const loadDetail = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(job.id)}`, { credentials: 'same-origin' })
      const data = await response.json().catch(() => ({})) as { job?: ContentJob; error?: string }
      if (!response.ok || !data.job) throw new Error(data.error || `HTTP ${response.status}`)
      setDetail(data.job)
      setEditorContent(data.job.content || '')
      setAudit((data.job as ContentJob & { audit_json?: unknown }).audit_json || null)
      setActionError(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load the full job')
    } finally {
      setLoading(false)
    }
  }, [job.id])

  React.useEffect(() => { void loadDetail() }, [loadDetail])

  const runRegenerateStream = async (resume = false) => {
    if (busy) return
    setBusy(true)
    setActiveAction('regenerate')
    setActionError(null)
    setLocalActionNotice(null)
    setActionStartedAt(Date.now())
    setActionChars(0)
    setActionEvents([{
      id: `action-${Date.now()}`, ts: Date.now(), stage: 'connect',
      message: resume ? 'Continuing from the latest saved checkpoint…' : 'Starting a live AI regeneration stream…', level: 'info',
    }])
    const controller = new AbortController()
    actionAbortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 240_000)
    const record = (stage: string, message: string, level: GenerationActivity['level'] = 'info') => {
      setActionEvents(prev => [...prev, { id: `${Date.now()}-${prev.length}`, ts: Date.now(), stage, message, level }].slice(-60))
    }
    let streamedChars = 0
    try {
      const contentType = detail.content_type === 'article' ? 'legal_guide' : detail.content_type || 'legal_guide'
      const response = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          topic: detail.topic,
          title: detail.title || detail.topic,
          primaryKeyword: detail.primary_keyword || detail.topic,
          region: detail.region || 'US',
          contentType,
          tone: detail.tone || 'educational',
          keywords: [detail.primary_keyword || detail.topic],
          shipMode: detail.ship_mode || 'pr',
          indexable: detail.indexable !== false,
          minAuditScore: 55,
          maxRefine: 2,
          supersedesJobId: detail.id,
          resume,
          aiProvider: aiProvider !== 'auto' ? aiProvider : (detail as { ai_provider?: string | null }).ai_provider || undefined,
        }),
      })
      const result = await consumeSseResponse(response, (event) => {
        if (event.type === 'progress') record(event.stage || 'pipeline', event.message || 'Working…')
        else if (event.type === 'provider') record('provider', `Using ${event.provider || 'AI'}${event.model ? ` · ${event.model}` : ''}`)
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'delta') {
          streamedChars += String(event.text || '').length
          setActionChars(streamedChars)
        } else if (event.type === 'ship') record('ship', event.ship?.prUrl ? 'Replacement PR opened' : event.shipError ? `Ship paused: ${event.shipError}` : 'Draft audited; preparing delivery', event.shipError ? 'warn' : 'info')
        else if (event.type === 'final') record('complete', event.result?.jobId ? `Replacement job ${event.result.jobId} created` : 'Regeneration complete', 'success')
      })
      const replacementId = result?.jobId
      const message = replacementId
        ? `Regeneration complete. Replacement job ${replacementId} is now in the queue.`
        : 'Regeneration complete. Refresh the queue to view the new job.'
      setResumeAvailable(false)
      setLocalActionNotice(message)
      setActionNotice(message)
      await loadDetail()
      await onRefresh()
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      const rawMessage = error instanceof Error ? error.message : 'Regeneration failed'
      const resumable = timedOut || streamedChars > 0
      const message = resumable
        ? 'The stream stopped, but the latest partial draft was checkpointed. Continue from the saved draft instead of starting over.'
        : rawMessage
      record('error', message, 'error')
      setResumeAvailable(resumable)
      setActionError(message)
      setActionNotice(resumable ? 'Partial draft saved. Continue when ready.' : 'Regeneration did not complete.')
      if (resumable) await onRefresh()
    } finally {
      clearTimeout(timeout)
      actionAbortRef.current = null
      setActiveAction(null)
      setBusy(false)
    }
  }

  const qualityGateFailure = (message: string | null) => {
    const value = (message || '').toLowerCase()
    return value.includes('ship refused') || value.includes('content quality gate') ||
      value.includes('guarantee language') || value.includes('emdash') ||
      value.includes('sentence opening')
  }

  const runAction = async (action: string) => {
    if (busy) return
    if (action === 'regenerate' || action === 'approve' || action === 'merge_pr') {
      const prompt = action === 'regenerate'
        ? 'Regenerate this job and create a replacement job?'
        : action === 'approve'
          ? 'Approve this content for main and trigger deployment?'
          : 'Merge the open pull request?'
      if (typeof window !== 'undefined' && !window.confirm(prompt)) return
    }
    if (action === 'regenerate') {
      void runRegenerateStream()
      return
    }
    setBusy(true)
    setActiveAction(action)
    setActionError(null)
    setLocalActionNotice(null)
    try {
      const body: Record<string, unknown> = { id: detail.id, action }
      if (action === 'save' || action === 'reaudit' || action === 'reship' || action === 'approve') {
        body.content = editorContent
      }
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({})) as { job?: ContentJob; audit?: unknown; message?: string; error?: string }
      if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`)
      if (data.job) {
        setDetail(data.job)
        if (data.job.content != null && action !== 'regenerate') setEditorContent(data.job.content)
      }
      if (data.audit) setAudit(data.audit)
      const message = data.message || `${action.replace('_', ' ')} complete`
      setLocalActionNotice(message)
      setActionNotice(message)
      await onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setActiveAction(null)
      setBusy(false)
    }
  }

  const dirty = editorContent !== (detail.content || '')
  const terminal = detail.status === 'merged' || detail.status === 'closed'
  const gateFailure = qualityGateFailure(detail.error_message)
  const canResume = resumeAvailable || (detail.status === 'drafting' && Boolean(detail.content))
  const resolvedModel =
    detail.ai_model ||
    detail.audit_json?.model ||
    (detail.ai_provider ? DEFAULT_MODEL_BY_PROVIDER[detail.ai_provider] : null) ||
    null
  const aiProviderCard = resolvedModel
    ? `${detail.ai_provider || '—'} · ${resolvedModel}`
    : detail.ai_provider || '—'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, maxWidth: 820, width: '92vw', maxHeight: '90vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 18, color: C.text }}>{detail.title || '(untitled)'}</h3>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {statusBadge(detail.status)} {statusStepper(detail.status)}
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{detail.region} · {detail.content_type?.replace('_', ' ')}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close job details" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textDim }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Word Count', value: detail.word_count ?? '—' },
            { label: 'SEO Score', value: detail.seo_score != null ? `${detail.seo_score}%` : '—' },
            { label: 'AI Provider', value: aiProviderCard },
            { label: 'Target Repo', value: detail.target_repo ?? '—' },
          ].map(metric => (
            <div key={metric.label} style={{ background: C.surface2, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{metric.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>{metric.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: C.text }}>
            AI Model
            <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', fontSize: 11, color: C.text, fontFamily: C.mono }}>
              <option value="auto">Auto (Grok → OpenAI → rest)</option>
              <option value="grok">Grok (xAI)</option>
              <option value="openai">OpenAI (GPT-5.6 Luna)</option>
              <option value="nvidia-deepseek">NVIDIA DeepSeek</option>
              <option value="cloudflare-ai">Cloudflare Workers AI</option>
              <option value="groq">Groq (Llama)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </label>
          {aiProvider === 'auto' && detail.ai_provider && (
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>job default: {aiProviderCard}</span>
          )}
          {aiProvider !== 'auto' && (
            <span style={{ fontSize: 10, color: C.blue, fontFamily: C.mono }}>regeneration will use: {aiProvider}</span>
          )}
        </div>

        {(detail.branch_name || detail.content_path || detail.pr_url) && (
          <div style={{ marginBottom: 12, fontFamily: C.mono, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
            {detail.branch_name && <div>branch: <span style={{ color: C.text }}>{detail.branch_name}</span></div>}
            {detail.content_path && <div>file: <span style={{ color: C.text }}>{detail.content_path}</span></div>}
            {detail.pr_url && <div><a href={detail.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontWeight: 600 }}>Open PR ↗</a></div>}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 10 }}>⏱ Job Timeline</div>
          <JobTimeline jobId={detail.id} createdMs={new Date(detail.created_at).getTime()} />
        </div>

        {detail.error_message && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: C.red, marginBottom: 10, fontFamily: C.mono, whiteSpace: 'pre-wrap' }}>{detail.error_message}</div>}

        {gateFailure && <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>Quality gate remediation</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: '#7C2D12' }}>Edit the draft to remove the blocker, save it, re-audit it, then ship. Regenerate rewrites the full piece using the gate guidance.</div>
          {canResume && <button type="button" disabled={busy || loading} onClick={() => void runRegenerateStream(true)} style={{ marginTop: 8, marginRight: 7, padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.blue}`, background: '#EFF6FF', color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>↻ Continue saved draft</button>}
          <button type="button" disabled={busy || loading} onClick={() => void runAction('regenerate')} style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, border: 'none', background: C.red, color: '#FFF', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{activeAction === 'regenerate' ? 'AI working…' : 'Fix & regenerate'}</button>
          {actionEvents.length > 0 && <div style={{ marginTop: 10, background: '#1F2937', color: '#E5E7EB', borderRadius: 6, padding: 10, fontFamily: C.mono, fontSize: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, color: activeAction ? '#FCD34D' : '#86EFAC', fontWeight: 700 }}>
              <span>{activeAction ? '● LIVE AI ACTIVITY' : '✓ LAST AI ACTIVITY'}</span>
              {actionChars > 0 && <span>{actionChars.toLocaleString()} streamed chars</span>}
            </div>
            <div style={{ marginBottom: 6 }}>
              <ProgressBar value={progressFromEvents(actionEvents, Boolean(activeAction))} color={activeAction ? '#FCD34D' : '#86EFAC'} />
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {actionEvents.slice(-6).map(event => <div key={event.id} style={{ display: 'flex', gap: 7, lineHeight: 1.4 }}>
                <span style={{ color: event.level === 'error' ? '#FCA5A5' : event.level === 'success' ? '#86EFAC' : '#93C5FD' }}>›</span>
                <span>{event.message}</span>
              </div>)}
            </div>
            {actionStartedAt && <div style={{ marginTop: 7, color: '#9CA3AF' }}>elapsed {fmtDur(Date.now() - actionStartedAt)} · detailed timeline refreshes below</div>}
          </div>}
        </div>}

        {actionError && <div style={{ color: C.red, fontSize: 11, marginBottom: 10 }}>{actionError}</div>}
        {actionNotice && <div style={{ color: C.green, fontSize: 11, marginBottom: 10 }}>{actionNotice}</div>}

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Content editor</div><div style={{ fontSize: 10, color: C.textMuted }}>Edit inline, re-audit for quality gate compliance. Click issues to jump to them. Drafts auto-save every 2 seconds.</div></div>
            {dirty && <span style={{ fontSize: 10, color: C.orange, fontFamily: C.mono }}>Unsaved changes</span>}
          </div>
          {loading ? <div style={{ fontSize: 11, color: C.textDim, padding: 18 }}>Loading full job content...</div> : <AdminInlineEditor content={editorContent} jobId={detail.id} onChange={(v: string) => setEditorContent(v)} disabled={busy || terminal} onScoreChange={(s) => setAudit(s != null ? { score: s } : null)} />}
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy || loading || !dirty || !editorContent.trim()} onClick={() => void runAction('save')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.gold}`, background: dirty ? '#FFFBEB' : C.surface2, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Save draft</button>
          <button type="button" disabled={busy || loading || !editorContent.trim()} onClick={() => void runAction('reaudit')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.blue}`, background: C.surface, color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Re-audit</button>
          <button type="button" disabled={busy || loading || !editorContent.trim() || terminal} onClick={() => void runAction('reship')} style={{ padding: '8px 11px', borderRadius: 6, border: 'none', background: C.cyan, color: '#FFF', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Ship PR only</button>
          <button type="button" disabled={busy || loading || !editorContent.trim() || terminal} onClick={() => void runAction('approve')} style={{ padding: '8px 11px', borderRadius: 6, border: 'none', background: C.green, color: '#FFF', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Approve → main</button>
          {detail.pr_number && !terminal && <button type="button" disabled={busy} onClick={() => void runAction('merge_pr')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.green}`, background: '#F0FDF4', color: C.green, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Merge open PR</button>}
          <button type="button" disabled={busy || loading} onClick={() => void runAction('monitor')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Monitor deploy</button>
          <button type="button" disabled={busy || loading} onClick={() => void runAction('duplicate')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Duplicate</button>
          <button type="button" disabled={busy || loading} onClick={() => void runAction('regenerate')} style={{ padding: '8px 11px', borderRadius: 6, border: `1px solid ${C.red}`, background: '#FFF5F5', color: C.red, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Regenerate</button>
        </div>

        {audit && <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono }}>Raw audit JSON</summary><pre style={{ maxHeight: 180, overflow: 'auto', background: C.surface3, borderRadius: 6, padding: 10, fontSize: 9, whiteSpace: 'pre-wrap', color: C.text }}>{JSON.stringify(audit, null, 2)}</pre></details>}
      </div>
    </div>
  )
}

// ── Main Component ──

export default function AdminContentStudio({ services: _services, refreshAdminData: _refreshAdminData, setActionNotice }: ContentStudioProps) {
  const [jobs, setJobs] = React.useState<ContentJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState<ContentJob | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showFactory, setShowFactory] = React.useState(false)
  const [createExpanded, setCreateExpanded] = React.useState(true)
  const [historyExpanded, setHistoryExpanded] = React.useState(false)
  const [topic, setTopic] = React.useState('')
  const [keywords, setKeywords] = React.useState('')
  const [generationEvents, setGenerationEvents] = React.useState<GenerationActivity[]>([])
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(null)
  const [generationChars, setGenerationChars] = React.useState(0)
  const [suggestions, setSuggestions] = React.useState<AISuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false)
  const [suggestionsError, setSuggestionsError] = React.useState<string | null>(null)
  const [radar, setRadar] = React.useState<AISuggestion[]>([])
  const [radarMeta, setRadarMeta] = React.useState<Record<string, unknown> | null>(null)
  const [selectedBrief, setSelectedBrief] = React.useState<AISuggestion | null>(null)
  const [briefInterlinks, setBriefInterlinks] = React.useState<Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>>([])

  // Fetch jobs
  const fetchJobs = React.useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const res = await fetch('/api/content-studio/jobs?limit=40', { credentials: 'same-origin' })
      if (res.status === 503) { setError('Server busy (503). Waiting before next refresh…'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      setJobs((data as { jobs?: ContentJob[] }).jobs ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally { setLoading(false) }
  }, [])

  const fetchSuggestions = React.useCallback(async (region: string) => {
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, limit: 6 }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuggestions(data.suggestions ?? [])
        setRadar(data.opportunities ?? data.suggestions ?? [])
        setRadarMeta({ source: data.source, coverage: data.coverageStats, cannibalization: data.cannibalization, region: data.region })
      } else {
        setSuggestionsError((data as { error?: string }).error ?? 'Failed to load suggestions')
      }
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Suggestion fetch failed')
    } finally { setSuggestionsLoading(false) }
  }, [])

  // Autopilot: one click applies the full brief — topic, keywords, title,
  // audience, content type, tone, interlinks — everything stays editable.
  const applyBrief = React.useCallback((s: AISuggestion) => {
    setTopic(s.topic)
    setKeywords((s.keywords && s.keywords.length ? s.keywords : [s.primaryKeyword || s.topic]).join(', '))
    setSelectedBrief(s)
    setBriefInterlinks(s.interlinks ?? [])
    setSuggestions(prev => [s, ...prev.filter(x => x.topic !== s.topic)])
  }, [])

  // Load suggestions on mount
  React.useEffect(() => { fetchSuggestions('US') }, [fetchSuggestions])

  React.useEffect(() => { fetchJobs() }, [fetchJobs])

  // Poll active jobs
  React.useEffect(() => {
    const hasActive = jobs.some(j => ['pending', 'drafting', 'publishing'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 6_000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  const handleGenerate = async (formData: any) => {
    setGenerating(true)
    setError(null)
    setGenerationStartedAt(Date.now())
    setGenerationChars(0)
    setGenerationEvents([{ id: `start-${Date.now()}`, ts: Date.now(), stage: 'connect', message: 'Connecting to the SEO generation pipeline…', level: 'info' }])

    const record = (stage: string, message: string, level: GenerationActivity['level'] = 'info') => {
      setGenerationEvents(prev => [...prev, { id: `${Date.now()}-${prev.length}`, ts: Date.now(), stage, message, level }].slice(-80))
    }

    try {
      const contentTypeMap: Record<string, string> = {
        blog_post: 'blog_summary', article: 'legal_guide',
        regional_page: 'regional_page', marketplace_gig: 'marketplace_gig',
      }
      const ct = contentTypeMap[formData.content_type] || formData.content_type || 'legal_guide'
      const region = formData.region || 'US'

      // Enrich with SEO canon data from GSC before generating
      let seoEnrichment: any = {}
      record('seo', 'Fetching GSC keyword portfolio to enrich generation…')
      try {
        const gscRes = await fetch('/api/content-studio/gsc/suggestions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region, topic: formData.topic, limit: 4 }),
        })
        if (gscRes.ok) {
          const gscData = await gscRes.json()
          seoEnrichment = {
            suggestions: gscData.suggestions?.slice(0, 3) ?? [],
            strategyHints: gscData.strategyHints ?? [],
            portfolioSnapshot: gscData.portfolioSnapshot ?? {},
            source: gscData.source ?? 'unknown',
            opportunity: selectedBrief,
            interlinks: briefInterlinks,
          }
          record('seo', `SEO canon loaded: ${gscData.portfolioSnapshot?.primaryCount ?? 0} primary, ${gscData.portfolioSnapshot?.secondaryCount ?? 0} secondary keywords from ${gscData.source}`)
        }
      } catch (seoErr) {
        record('seo', 'SEO enrichment unavailable — proceeding with user-provided keywords', 'warn')
      }

      const res = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          topic: formData.topic, title: formData.title || formData.topic,
          primaryKeyword: (formData.keywords && formData.keywords[0]) || formData.topic,
          region, contentType: ct,
          tone: formData.tone || 'educational', audience: formData.audience,
          keywords: formData.keywords, shipMode: 'pr', indexable: true,
          minAuditScore: 55, maxRefine: 2,
          seoEnrichment,
          interlinks: briefInterlinks,
          opportunity: selectedBrief,
          aiProvider: formData.aiProvider || undefined,
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
      let finalResult: any = null
      let streamChars = 0
      const consume = (raw: string) => {
        const dataLine = raw.split(/\r?\n/).find(line => line.startsWith('data:'))
        if (!dataLine) return
        const payload = dataLine.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        const event = JSON.parse(payload) as any
        if (event.type === 'progress') record(event.stage || 'pipeline', event.message || 'Working…')
        else if (event.type === 'provider') record('provider', `Using ${event.provider || 'AI'}${event.model ? ` · ${event.model}` : ''}`)
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · quality threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'delta') {
          streamChars += String(event.text || '').length
          setGenerationChars(streamChars)
        } else if (event.type === 'ship') record('ship', event.ship?.prUrl ? `Pull request opened · audit passed` : event.shipError ? `Ship paused: ${event.shipError}` : 'Draft audited; preparing delivery', event.shipError ? 'warn' : 'info')
        else if (event.type === 'final') {
          finalResult = event.result
          record('complete', event.result?.ship?.prUrl ? 'PR opened. The job is now ready for review.' : 'Generation complete. Job details are being refreshed.', 'success')
        } else if (event.type === 'error') throw new Error(event.error || 'Generation pipeline failed')
      }

      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const chunks = buffer.split(/\r?\n\r?\n/)
        buffer = chunks.pop() || ''
        for (const chunk of chunks) consume(chunk)
        if (done) break
      }
      if (buffer.trim()) consume(buffer)
      if (!finalResult) throw new Error('Generation stream ended before a final result was received')

      const data = finalResult
      const notice = data.ship?.prUrl
        ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError
          ? `Generated (audit ${data.audit?.score ?? '—'}) but ship paused: ${data.shipError}`
          : `Generated via ${data.provider || 'AI'} · audit ${data.audit?.score ?? '—'}`
      setActionNotice(notice)
      setCreateExpanded(false)
      setShowFactory(true)
      await fetchJobs()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      record('error', message, 'error')
      setError(message)
      setActionNotice('Content generation failed.')
    } finally { setGenerating(false) }
  }

  return (
    <div style={{ padding: '16px 20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: C.serif, fontSize: 26, fontWeight: 700, color: C.text }}>
            Content Studio
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
            AI-drafted SEO content → GitHub PRs → caseworks / consultancy / portal
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { setShowFactory(!showFactory); if (!showFactory) setCreateExpanded(false) }} style={{
            padding: '9px 18px', borderRadius: 6, border: `2px solid ${C.gold}`,
            background: showFactory ? C.gold : 'transparent', color: showFactory ? '#FFF' : C.gold,
            cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}>
            {showFactory ? '✕ Close Command Center' : '🏭 Command Center'}
          </button>
          <button onClick={fetchJobs} disabled={loading} style={{
            padding: '9px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.surface, color: C.textMuted, cursor: 'pointer',
            fontSize: 12, fontFamily: 'inherit',
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* Live AI activity */}
      <LiveGenerationPanel active={generating} events={generationEvents} startedAt={generationStartedAt} streamedChars={generationChars} />

      {/* Error banner */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: C.red, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Stats */}
      {!loading && jobs.length > 0 && <SummaryCards jobs={jobs} />}

      {/* Command Center (full-width, conditional) */}
      {showFactory && (
        <div style={{ marginBottom: 16 }}>
          <React.Suspense fallback={<div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: C.textDim }}>Loading Command Center…</div>}>
            <AdminCommandCenter setActionNotice={setActionNotice} />
          </React.Suspense>
        </div>
      )}

      {/* Main two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <QuickCreate
            expanded={createExpanded}
            onToggle={() => setCreateExpanded(!createExpanded)}
            generating={generating} onGenerate={handleGenerate}
            topic={topic} keywords={keywords}
            onTopicChange={setTopic} onKeywordsChange={setKeywords}
            suggestions={suggestions} suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            onRefreshSuggestions={fetchSuggestions}
            onApplySuggestion={applyBrief}
            brief={selectedBrief}
            briefInterlinks={briefInterlinks}
            onClearBrief={() => { setSelectedBrief(null); setBriefInterlinks([]) }}
          />
          <OpportunityRadar opportunities={radar} meta={radarMeta} onApply={applyBrief} />
          <AdminSiteHealthPanel />
          <AdminDeepInterlinkPanel  setActionNotice={setActionNotice} />
          <InterlinksMini topic={topic} keywords={keywords} />
          <GscMini />
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Live Pipeline */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif }}>
                🔄 Live Pipeline
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
                Active jobs with status tracking — auto-refreshes for in-progress jobs
              </p>
            </div>
            <LivePipeline jobs={jobs} onSelect={setSelectedJob} />
          </div>

          {/* Job History */}
          <JobHistory
            jobs={jobs} expanded={historyExpanded}
            onToggle={() => setHistoryExpanded(!historyExpanded)}
            onSelect={setSelectedJob} loading={loading}
          />
        </div>
      </div>

      {/* Detail modal */}
      {selectedJob && <JobDetail job={selectedJob} onClose={() => setSelectedJob(null)} onRefresh={fetchJobs} setActionNotice={setActionNotice} />}
    </div>
  )
}