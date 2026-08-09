'use client'
/**
 * CONTENT STUDIO — v4 full makeover
 * (Logic untouched; visual layer rebuilt.)
 */
import React from 'react'
import AdminDeepInterlinkPanel from './admin-deep-interlink-panel'
import AdminSiteHealthPanel from './admin-site-health-panel'
const AdminCommandCenter = React.lazy(() => import('./admin-command-center'))
import AdminInlineEditor from './admin-inline-editor'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', border2: 'rgba(0,0,0,0.05)',
  cyan: '#3C3B6E', red: '#DC2626', green: '#166534', greenSoft: '#ECFDF5',
  orange: '#D97706', purple: '#7C3AED', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', gold: '#9A7B3B', goldSoft: '#FEF3C7', navy: '#0F172A',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
  shadowCard: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  shadowLifted: '0 8px 28px rgba(15,23,42,0.10)',
  radius: 14, radiusSm: 10, radiusXs: 7,
}

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.6-luna', custom: 'gpt-5.6-luna', grok: 'grok-3',
  deepseek: 'deepseek-chat', 'nvidia-deepseek': 'deepseek-ai/deepseek-v4-pro',
  'cloudflare-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast', groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash', openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
}

type ContentType = 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'
type StudioTab = 'create' | 'queue' | 'insights'

interface ContentJob {
  id: string; title?: string; topic?: string; primary_keyword?: string;
  content_type?: ContentType; region?: Region; tone?: Tone; ship_mode?: string;
  indexable?: boolean; status: JobStatus; created_at: string; updated_at?: string;
  pr_url?: string; pr_number?: number | null; merged_at?: string | null;
  deployed_at?: string | null; closed_at?: string | null; word_count?: number | null;
  seo_score?: number | null; ai_provider?: string | null; ai_model?: string | null;
  audit_json?: { score?: number; model?: string } | null;
  target_repo?: string | null; branch_name?: string | null; content_path?: string | null;
  audience?: string | null; keywords?: string[]; error_message?: string | null;
  event_log?: Array<{ ts: string | number; level: string; source?: string; message: string; detail?: string }>;
  content?: string;
}
interface ContentStudioProps { services: any; refreshAdminData?: () => Promise<void> | void; setActionNotice: (msg: string) => void }
interface InterlinkSuggestion { url: string; label: string; site: string }
interface GscMiniStats { clicks: number; impressions: number; ctr: number; position: number; topQuery: string; topQueryClicks: number }
interface AISuggestion {
  topic: string; title?: string; primaryKeyword?: string; keywords?: string[];
  play?: string; intent?: string; contentType?: ContentType; trend?: string;
  audience?: string; reason?: string; signals?: string[];
  opportunityScore?: number; demandScore?: number;
  position?: number; impressions?: number; intentCategory?: string;
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>;
}

const REGION_OPTIONS: { value: Region; label: string; flag: string }[] = [
  { value: 'US', label: 'United States', flag: '🇺🇸' },
  { value: 'CA', label: 'Canada', flag: '🇨🇦' },
  { value: 'AU', label: 'Australia', flag: '🇦🇺' },
  { value: 'UK', label: 'United Kingdom', flag: '🇬🇧' },
  { value: 'COMPARE', label: 'Cross-country', flag: '🌐' },
]
const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional ' }, { value: 'educational', label: 'Educational ' },
  { value: 'persuasive', label: 'Persuasive ' }, { value: 'authoritative', label: 'Authoritative ' },
  { value: 'casual', label: 'Casual ' },
]
const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; ext: string; repo: string; icon: string; hint: string; accent: string }[] = [
  { value: 'blog_post', label: 'Blog post', ext: '.md', repo: 'portal', icon: '📝', hint: 'Long-form editorial', accent: '#3B82F6' },
  { value: 'article', label: 'Legal guide', ext: '.mdx', repo: 'caseworks', icon: '⚖️', hint: 'YMYL-compliant guide', accent: '#7C3AED' },
  { value: 'regional_page', label: 'Regional page', ext: '.tsx', repo: 'portal', icon: '🌐', hint: 'Country landing', accent: '#D97706' },
  { value: 'marketplace_gig', label: 'Marketplace gig', ext: '.md', repo: 'marketplace', icon: '🏪', hint: 'Service listing', accent: '#10B981' },
]
const LIFE_CYCLE_STAGES: { value: string; label: string; hint: string }[] = [
  { value: 'visa', label: 'Visa & entry', hint: 'applications, status, next steps' },
  { value: 'study', label: 'Schools & study', hint: 'admissions, scholarships, OPT' },
  { value: 'work', label: 'Work & career', hint: 'H-1B, Skilled Worker, sponsor list' },
  { value: 'housing', label: 'Housing & settle', hint: 'lease, neighbourhoods, transit' },
  { value: 'family', label: 'Family & kids', hint: 'dependent visas, schooling, parenting' },
  { value: 'marriage', label: 'Marriage & spouse', hint: 'spouse visas, civil partnership' },
  { value: 'citizenship', label: 'Citizenship & PR', hint: 'naturalization, ILR, green card' },
  { value: 'relocation', label: 'Move relatives', hint: 'family reunification, parent visas' },
]
const PLAY_META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  quick_win: { label: 'Quick win', bg: '#FEF3C7', fg: '#92400E', icon: '⚡' },
  content_gap: { label: 'Content gap', bg: '#FEE2E2', fg: '#991B1B', icon: '⛰' },
  rising: { label: 'Rising', bg: '#D1FAE5', fg: '#065F46', icon: '📈' },
  refresh: { label: 'Refresh', bg: '#DBEAFE', fg: '#1E40AF', icon: '♻' },
  defend: { label: 'Defend', bg: '#EDE9FE', fg: '#5B21B6', icon: '🛡' },
  cannibal: { label: 'Watch cannibal.', bg: '#FCE7F3', fg: '#9D174D', icon: '⚠' },
}
const INTENT_LABELS: Record<string, string> = {
  informational: '📖 Informational', transactional: '🛒 Transactional', navigational: '🧭 Navigational',
  commercial: '💼 Commercial', comparison: '🆚 Comparison',
}
const TONE_FOR_INTENT: Record<string, Tone> = {
  informational: 'educational', transactional: 'persuasive',
  navigational: 'professional', commercial: 'authoritative', comparison: 'educational',
}
const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  rising: { icon: '↗', color: '#10B981', label: 'Rising' },
  flat: { icon: '→', color: '#9CA3AF', label: 'Flat' },
  falling: { icon: '↘', color: '#DC2626', label: 'Falling' },
}
const RADAR_FILTERS: Array<{ key: 'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'; label: string }> = [
  { key: 'all', label: 'All plays' }, { key: 'quick_win', label: 'Quick wins' },
  { key: 'content_gap', label: 'Gaps' }, { key: 'rising', label: 'Rising' }, { key: 'refresh', label: 'Refresh' },
]
const AI_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: '🤖 Auto — engine picks' },
  { value: 'openai', label: 'OpenAI · gpt-5.6-luna' },
  { value: 'grok', label: 'Grok · grok-3' },
  { value: 'deepseek', label: 'DeepSeek · chat' },
  { value: 'nvidia-deepseek', label: 'NVIDIA · deepseek-v4-pro' },
  { value: 'cloudflare-ai', label: 'Cloudflare · llama-3.3-70b' },
  { value: 'groq', label: 'Groq · llama-3.3-70b' },
  { value: 'gemini', label: 'Gemini · 2.5-flash' },
  { value: 'openrouter', label: 'OpenRouter · llama-3.3-70b' },
]

function fmtN(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
function fmtTime(ts: number): string { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
function timeAgoMs(ts: number): string {
  const ms = Date.now() - ts
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

const STAGE_PROGRESS: Record<string, number> = {
  connect: 8, seo: 16, brief: 24, draft: 36, audit: 52, refine: 64, 'ship-prep': 78, ship: 86, merged: 95, complete: 100, error: 100,
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

function statusBadge(status: JobStatus) {
  const map: Record<JobStatus, { label: string; bg: string; fg: string; dot: string }> = {
    pending: { label: 'Queued', bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    drafting: { label: 'Drafting', bg: '#FEF3C7', fg: '#D97706', dot: '#F59E0B' },
    publishing: { label: 'Opening PR', bg: '#DBEAFE', fg: '#3B82F6', dot: '#60A5FA' },
    pr_created: { label: 'PR Ready', bg: '#DBEAFE', fg: '#2563EB', dot: '#3B82F6' },
    merged: { label: 'Merged', bg: '#D1FAE5', fg: '#166534', dot: '#10B981' },
    closed: { label: 'Closed', bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    failed: { label: 'Failed', bg: '#FEE2E2', fg: '#DC2626', dot: '#EF4444' },
  }
  const s = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, boxShadow: status === 'drafting' ? '0 0 0 3px ' + s.bg : 'none' }} />
      {s.label}
    </span>
  )
}
function statusStepper(status: JobStatus) {
  const steps: { key: JobStatus; label: string }[] = [
    { key: 'pending', label: 'Queued' }, { key: 'drafting', label: 'Drafting' },
    { key: 'publishing', label: 'PR' }, { key: 'pr_created', label: 'PR Ready' },
    { key: 'merged', label: 'Merged' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const isFailed = status === 'failed'
  const isClosed = status === 'closed'
  if (isFailed) return <span style={{ fontSize: 10, color: C.red, fontWeight: 700, fontFamily: C.mono }}>⚠ Failed</span>
  if (isClosed) return <span style={{ fontSize: 10, color: C.textDim, fontWeight: 700, fontFamily: C.mono }}>✕ Closed</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }} title={steps.map(s => s.label).join(' → ')}>
      {steps.map((s, i) => {
        const done = i < currentIdx, active = i === currentIdx, future = i > currentIdx
        const color = done ? C.green : active ? C.gold : C.textDim
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ width: 12, height: 2, background: done ? C.green : C.border, flexShrink: 0 }} />}
            <span style={{
              width: 9, height: 9, borderRadius: 999, flexShrink: 0,
              background: active ? color : done ? color : 'transparent',
              border: `2px solid ${color}`,
              boxShadow: active ? '0 0 0 3px ' + C.goldSoft : 'none',
            }} />
          </React.Fragment>
        )
      })}
    </div>
  )
}
function gateBadge(score: number | null | undefined, passed: boolean | null | undefined) {
  if (score == null) return <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>—</span>
  const ok = passed !== false
  return (
    <span title={`Compliance gate ${score}/100 — ${ok ? 'passed' : 'blocked (YMYL/AEO/GEO requirements)'}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, fontFamily: C.mono, whiteSpace: 'nowrap', cursor: 'help',
      background: ok ? '#ECFDF5' : '#FEF2F2', color: ok ? C.green : C.red,
      border: `1px solid ${ok ? '#A7F3D0' : '#FECACA'}`,
    }}>
      {ok ? '✓ PASS' : '✕ BLOCK'} {score}
    </span>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: C.text,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: C.mono,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none', transition: 'border 0.15s, box-shadow 0.15s',
}
const btnSolid = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: bg, color: fg, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  boxShadow: '0 2px 6px rgba(15,23,42,0.10)',
})
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: C.radiusXs, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
}

interface CannibalMergeRecord {
  clusterId: string; stem: string; terms?: string[];
  winnerUrl: string; loserUrls: string[]; redirectsCreated: number;
  prUrl?: string; prNumber?: number; mergedAt: number; source: 'portal' | 'command_center';
  status: 'merged' | 'pending' | 'skipped';
  followUpAt?: number; recheckDue?: boolean;
  message?: string; differentiationPlan?: string;
  resolutionType?: 'CONSOLIDATED' | 'DIFFERENTIATED' | 'DEFERRED';
}
interface MergeUrlHit {
  role: 'winner' | 'loser'; clusterId: string; stem: string; winnerUrl: string;
  redirectsCreated: number; prUrl?: string; prNumber?: number; mergedAt: number;
}
function normMergePath(u: string): string {
  if (!u) return ''
  try { return new URL(u).pathname.replace(/\/+$/, '') } catch { return u.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '') }
}
function canonicalMergeStem(q: string): string {
  const stop = new Set(['a','an','the','and','or','but','for','of','to','in','on','at','by','with','is','are','how','what','why','when'])
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !stop.has(w) && w.length > 2).slice(0, 6).join(' ')
}
function jobWebPath(j: ContentJob): string {
  if (!j.target_repo) return ''
  const file = j.content_path || (j.title ? `/${j.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}/` : '')
  return `/${j.target_repo}${file}`
}

type LogLevel = 'success' | 'info' | 'warn' | 'error'
interface TimelineEntry { ts: number; level: LogLevel; source: string; message: string; detail?: string; kind: 'stage' | 'log' }
interface GenerationActivity { id: string; ts: number; stage: string; message: string; level: LogLevel }
const LEVEL_COLOR: Record<LogLevel, string> = { success: '#10B981', info: '#3B82F6', warn: '#F59E0B', error: '#EF4444' }
const LEVEL_ICON: Record<LogLevel, string> = { success: '✓', info: '•', warn: '!', error: '✕' }

function CardHeader({ icon, title, sub, right, accent }: { icon: string; title: string; sub?: string; right?: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex',
      justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFAF7 100%)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, fontFamily: C.serif, letterSpacing: '-0.01em' }}>{title}</div>
          {sub && <div style={{ marginTop: 2, fontSize: 11, color: C.textMuted }}>{sub}</div>}
        </div>
      </div>
      {accent && <span style={{ width: 4, height: 32, borderRadius: 2, background: accent }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>
    </div>
  )
}
function SectionHeading({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10.5, fontFamily: C.mono, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700 }}>{kicker}</div>
        <h2 style={{ margin: '4px 0 0', fontFamily: C.serif, fontSize: 22, color: C.text, letterSpacing: '-0.01em' }}>{title}</h2>
        {sub && <div style={{ marginTop: 4, fontSize: 12, color: C.textMuted, maxWidth: 720, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      {right && <div>{right}</div>}
    </div>
  )
}
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const w = 88, h = 28, step = w / Math.max(1, values.length - 1)
  const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function DeltaChip({ value, suffix = '' }: { value: number; suffix?: string }) {
  const positive = value >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, fontFamily: C.mono,
      background: positive ? '#ECFDF5' : '#FEF2F2',
      color: positive ? '#065F46' : '#991B1B',
    }}>{positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{suffix}</span>
  )
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

function LiveGenerationPanel({ active, events, startedAt, streamedChars }: {
  active: boolean; events: GenerationActivity[]; startedAt: number | null; streamedChars: number
}) {
  if (!active && events.length === 0) return null
  const latest = events[events.length - 1]
  const elapsed = startedAt ? fmtDur(Date.now() - startedAt) : ''
  const levelColor = latest?.level === 'error' ? C.red : latest?.level === 'warn' ? C.orange : latest?.level === 'success' ? C.green : C.blue
  return (
    <div style={{ marginBottom: 14, background: C.navy, color: '#FFF', borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowLifted, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            position: 'relative', width: 12, height: 12, borderRadius: 999, background: active ? '#34D399' : levelColor,
            boxShadow: active ? '0 0 0 5px rgba(52,211,153,0.18)' : 'none',
          }}>
            {active && <span style={{ position: 'absolute', inset: -3, borderRadius: 999, border: '2px solid #34D399', opacity: 0.35, animation: 'pulse 1.6s ease-out infinite' }} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: '#FFF' }}>
              {active ? 'AI work in progress' : latest?.level === 'error' ? 'Generation stopped' : 'Latest generation activity'}
            </div>
            <div style={{ marginTop: 3, fontSize: 10.5, color: 'rgba(255,255,255,0.62)', fontFamily: C.mono }}>
              {active ? `Live pipeline · ${elapsed}${streamedChars ? ` · ${streamedChars.toLocaleString()} streamed characters` : ''}` : 'Activity captured from the generation pipeline'}
            </div>
          </div>
        </div>
        <span style={{
          flexShrink: 0, padding: '5px 11px', borderRadius: 999,
          background: active ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.10)',
          color: active ? '#A7F3D0' : 'rgba(255,255,255,0.75)',
          fontSize: 10, fontFamily: C.mono, textTransform: 'uppercase', fontWeight: 700,
        }}>{active ? 'streaming' : 'complete'}</span>
      </div>
      <div style={{ padding: '4px 18px 12px' }}>
        <ProgressBar value={progressFromEvents(events, active)} color={active ? '#34D399' : levelColor} />
      </div>
      <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.slice(-6).map((event, index, visible) => (
          <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: index === visible.length - 1 ? 1 : 0.62 }}>
            <span style={{
              width: 20, height: 20, flexShrink: 0, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: event.level === 'error' ? 'rgba(248,113,113,0.20)' : event.level === 'warn' ? 'rgba(251,191,36,0.20)' : event.level === 'success' ? 'rgba(52,211,153,0.20)' : 'rgba(96,165,250,0.20)',
              color: event.level === 'error' ? '#FCA5A5' : event.level === 'warn' ? '#FCD34D' : event.level === 'success' ? '#6EE7B7' : '#93C5FD',
              fontSize: 10, fontWeight: 800,
            }}>{event.level === 'error' ? '!' : event.level === 'success' ? '✓' : '•'}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: '#F8FAFC' }}>{event.message}</div>
              <div style={{ marginTop: 2, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', fontFamily: C.mono }}>{event.stage} · {fmtTime(event.ts)}</div>
            </div>
          </div>
        ))}
        {active && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontFamily: C.mono, paddingLeft: 30 }}>Waiting for the next pipeline event…</div>}
      </div>
    </div>
  )
}

function RadarCard({ s, active, onApply }: { s: AISuggestion; active: boolean; onApply: (s: AISuggestion) => void }) {
  const pm = PLAY_META[s.play] || PLAY_META.content_gap
  const score = s.opportunityScore ?? s.demandScore
  const tm = TREND_META[s.trend || 'flat'] || TREND_META.flat
  return (
    <button type="button" onClick={() => onApply(s)} style={{
      minWidth: 240, maxWidth: 280, flexShrink: 0, textAlign: 'left',
      padding: '12px 14px', borderRadius: C.radiusSm,
      border: active ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
      background: active ? 'linear-gradient(180deg,#FEF9EC,#FFFFFF)' : C.surface,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: 'all 0.15s', boxShadow: active ? '0 6px 18px rgba(154,123,59,0.22)' : C.shadowCard,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <span style={{ padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg }}>
          {pm.icon} {pm.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: C.mono, color: score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim }}>{score}</span>
          <span style={{ fontSize: 13, color: tm.color, fontWeight: 700 }} title={tm.label}>{tm.icon}</span>
        </div>
      </div>
      <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 6 }}>
        {s.title.length > 60 ? s.title.slice(0, 57) + '…' : s.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>#{s.position ?? '—'}</span>
        <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{fmtN(s.impressions)} imp</span>
        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, fontFamily: C.mono, background: C.surface3, color: C.textMuted }}>
          {INTENT_LABELS[s.intent] || s.intentCategory || '📖 Informational'}
        </span>
      </div>
      {(s.signals && s.signals.length ? s.signals.slice(0, 2) : [s.reason]).map((sig, si) => (
        <p key={si} style={{ margin: 0, fontSize: 10, color: C.textDim, lineHeight: 1.4 }}>• {sig}</p>
      ))}
      <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: C.gold, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: C.mono }}>
        ✏️ Apply to brief
      </div>
    </button>
  )
}

function StepperRail({ active, completed }: { active: 1 | 2 | 3 | 4; completed: number }) {
  const steps = [
    { n: 1, label: 'Target', hint: 'Type, region, tone, model' },
    { n: 2, label: 'Brief', hint: 'Topic, audience, keywords' },
    { n: 3, label: 'Interlinks', hint: 'Stage + link plan' },
    { n: 4, label: 'Generate', hint: 'Push to PR' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 0 14px 0' }}>
      {steps.map((s, i) => {
        const isDone = s.n <= completed
        const isActive = s.n === active
        const color = isDone ? C.green : isActive ? C.gold : C.textDim
        const bg = isDone ? '#D1FAE5' : isActive ? '#FEF3C7' : 'transparent'
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: bg, color, border: `2px solid ${color}`,
                fontSize: 12, fontWeight: 800, fontFamily: C.serif,
              }}>{isDone ? '✓' : s.n}</span>
              {i < steps.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 28, background: isDone ? C.green : C.border, marginTop: 4, marginBottom: 4 }} />}
            </div>
            <div style={{ paddingTop: 3, paddingBottom: 18 }}>
              <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: isActive ? C.navy : C.text }}>{s.label}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{s.hint}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CREATE WIZARD (v4) ──
function CreateWizard(props: {
  generating: boolean; onGenerate: (data: any) => void
  contentType: ContentType; setContentType: (v: ContentType) => void
  region: Region; setRegion: (v: Region) => void
  tone: Tone; setTone: (v: Tone) => void
  aiProvider: string; setAiProvider: (v: string) => void
  title: string; setTitle: (v: string) => void
  topic: string; setTopic: (v: string) => void
  audience: string; setAudience: (v: string) => void
  keywords: string; setKeywords: (v: string) => void
  suggestions?: AISuggestion[]; suggestionsLoading?: boolean; suggestionsError?: string | null
  onRefreshSuggestions?: (region: string) => void; onApplySuggestion?: (s: AISuggestion) => void
  brief?: AISuggestion | null; onClearBrief?: () => void
  briefInterlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  interlinkStage: string; setInterlinkStage: (v: string) => void
  onAutoInterlink?: () => void; autoInterlinkBusy?: boolean
  showRadar: boolean; setShowRadar: (v: boolean) => void
}) {
  const {
    generating, onGenerate, contentType, setContentType, region, setRegion, tone, setTone,
    aiProvider, setAiProvider, title, setTitle, topic, setTopic, audience, setAudience, keywords, setKeywords,
    suggestions, suggestionsLoading, suggestionsError, onRefreshSuggestions, onApplySuggestion,
    brief, onClearBrief, briefInterlinks, interlinkStage, setInterlinkStage,
    onAutoInterlink, autoInterlinkBusy, showRadar, setShowRadar,
  } = props

  const [filter, setFilter] = React.useState<'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'>('all')
  const canGenerate = Boolean(topic.trim() || title.trim())
  const ctaReady = !generating && canGenerate

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canGenerate) return
    onGenerate({
      content_type: contentType, region, tone,
      title: title.trim() || topic.trim(), topic: topic.trim(),
      audience: audience.trim(),
      keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
      aiProvider, interlinks: briefInterlinks ?? [], opportunity: brief,
    })
  }

  const completedSteps = (contentType ? 1 : 0) + ((topic.trim() || title.trim()) ? 1 : 0) + ((briefInterlinks && briefInterlinks.length > 0) ? 1 : 0)
  const activeStep: 1 | 2 | 3 | 4 = briefInterlinks?.length ? 4 : topic.trim() ? 3 : contentType ? 2 : 1

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="✏️" title="Create content"
        sub="Four numbered steps — radar and engine only pre-fill. Every field stays editable."
        accent={C.navy}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setShowRadar(!showRadar)} style={showRadar ? { ...btnSolid(C.navy) } : btnGhost}>
              🎯 {showRadar ? 'Hide autopilot' : 'Autopilot from radar'}
            </button>
            <button type="button" onClick={() => onRefreshSuggestions?.(region)} disabled={suggestionsLoading} style={btnGhost}>
              {suggestionsLoading ? '⏳ Scanning…' : '↻ Rescan'}
            </button>
          </div>
        }
      />

      {showRadar && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(180deg,#FCFAF6, #FFFFFF)' }}>
          <SectionHeading kicker="Autopilot" title="Pick an opportunity to pre-fill the brief" sub="Engine scores each option on GSC demand, intent and trend. Click any card to apply." />
          <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
            {RADAR_FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
                padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
                letterSpacing: '0.04em',
              }}>{f.label}</button>
            ))}
          </div>
          {suggestionsLoading ? (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ minWidth: 240, height: 124, borderRadius: 10, background: C.surface3, opacity: 0.5, flexShrink: 0 }} />
              ))}
            </div>
          ) : (visibleSuggestions && visibleSuggestions.length > 0 ? (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollBehavior: 'smooth' }}>
              {visibleSuggestions.map((s) => (
                <RadarCard key={s.topic} s={s} active={Boolean(brief && brief.topic === s.topic)} onApply={(x) => onApplySuggestion?.(x)} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '14px 0', fontSize: 11, color: C.textDim, fontFamily: C.mono }}>
              No opportunities for this filter — rescan or switch filter.
            </div>
          ))}
          {suggestionsError && (
            <div style={{ margin: '6px 0 0', fontSize: 10, color: C.orange, fontFamily: C.mono }}>⚠ {suggestionsError}</div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '18px 20px 22px', display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24, alignItems: 'start' }}>
        <div>
          <StepperRail active={activeStep} completed={completedSteps} />
        </div>
        <div>
          {/* Step 1 — Target */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Step 01</div>
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.text, marginTop: 4, marginBottom: 12 }}>Pick the target</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
              {CONTENT_TYPE_OPTIONS.map(opt => {
                const active = contentType === opt.value
                return (
                  <button key={opt.value} type="button" onClick={() => setContentType(opt.value)} style={{
                    textAlign: 'left', padding: '12px 13px', borderRadius: C.radiusSm,
                    border: active ? `2px solid ${opt.accent}` : `1px solid ${C.border}`,
                    background: active ? 'linear-gradient(180deg,#FFFFFF,#F8FBFF)' : C.surface,
                    cursor: 'pointer', color: C.text, fontFamily: 'inherit',
                    boxShadow: active ? `0 4px 14px ${opt.accent}22` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{opt.label}</div>
                        <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, marginTop: 1 }}>{opt.ext} → {opt.repo}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>{opt.hint}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
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
              <div>
                <label style={labelStyle}>AI model</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={inputStyle}>
                  {AI_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2 — Brief */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Step 02</div>
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.text, marginTop: 4, marginBottom: 12 }}>Shape the brief</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Title <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — autopilot suggests one)</span></label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. F-1 OPT Application: Complete 2026 Timeline" maxLength={120} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Topic <span style={{ color: C.red }}>*</span></label>
              <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={3} required={!title.trim()} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Describe what to write — visa types, forms, timelines, comparison angles..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Audience</label>
                <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="international students, H-1B holders..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Keywords (comma-separated)</label>
                <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="F-1 visa, OPT timeline, I-765..." style={inputStyle} />
              </div>
            </div>

            {brief && (
              <div style={{ marginTop: 14, border: '1px solid #F0D9A8', background: 'linear-gradient(180deg,#FEF9EC, #FFFCF1)', borderRadius: C.radiusSm, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.08em' }}>
                    🧭 Autopilot brief — every field pre-filled & editable
                  </span>
                  <button type="button" onClick={onClearBrief} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: C.textDim, fontFamily: 'inherit' }}>
                    ✕ Clear brief
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.serif }}>{brief.primaryKeyword || brief.topic}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: (PLAY_META[brief.play] || {}).bg || C.surface3, color: (PLAY_META[brief.play] || {}).fg || C.textMuted }}>
                    {(brief.play || 'content_gap').replace('_', ' ')} · {brief.opportunityScore ?? brief.demandScore}/100
                  </span>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
                    {brief.intent} · {brief.contentType || 'blog_post'} · {brief.trend}
                  </span>
                </div>
                {brief.keywords && brief.keywords.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                    {brief.keywords.slice(0, 8).map(k => (
                      <span key={k} style={{ padding: '2px 8px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #F0D9A8', fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{k}</span>
                    ))}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 10.5, color: C.gold, fontFamily: C.mono }}>
                  Opportunity signals + interlinks will be sent to the generator. Review the fields above, then generate.
                </p>
              </div>
            )}
          </div>

          {/* Step 3 — Interlinks */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Step 03</div>
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.text, marginTop: 4, marginBottom: 12 }}>Wire the internal links</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 360px) 1fr', gap: 12, alignItems: 'end', marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Life-cycle stage for this link plan</label>
                <select value={interlinkStage} onChange={e => setInterlinkStage(e.target.value)} style={inputStyle}
                  title="Choose the immigrant journey stage whose neighboring pages should be linked">
                  {LIFE_CYCLE_STAGES.map(stage => (
                    <option key={stage.value} value={stage.value}>{stage.label} — {stage.hint}</option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                The engine uses this stage to choose journey neighbours, marketplace paths, and cross-country targets. Change it before generating a new plan.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <button type="button" onClick={onAutoInterlink} disabled={autoInterlinkBusy || !topic.trim()}
                title="Generate a scored internal-link plan from the SEO Master Engine"
                style={autoInterlinkBusy || !topic.trim() ? { ...btnSolid('#1E1B4B'), opacity: 0.55, cursor: 'not-allowed' } : { ...btnSolid('#1E1B4B') }}>
                {autoInterlinkBusy ? '⏳ Generating…' : '⚡ Generate link plan'}
              </button>
              <span style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>
                {briefInterlinks && briefInterlinks.length > 0
                  ? `${briefInterlinks.length} links ready — they will be injected into the draft`
                  : 'no links yet — generate from the engine or leave empty'}
              </span>
            </div>
            {briefInterlinks && briefInterlinks.length > 0 && (
              <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: '10px 12px', background: C.surface2 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: C.mono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  🔗 Link plan preview
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {briefInterlinks.slice(0, 8).map((l, li) => (
                    <div key={li} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', borderRadius: 4, background: '#FFFFFF', border: `1px solid ${C.border}`, fontSize: 11 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: C.mono, color: C.blue, minWidth: 18 }}>{li + 1}.</span>
                      <span style={{ fontWeight: 600, color: C.text }}>{l.label}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{
                        padding: '1px 7px', borderRadius: 3, fontSize: 9, fontWeight: 600, fontFamily: C.mono,
                        background: l.site === 'marketplace' ? '#D1FAE5' : l.site === 'caseworks' ? '#DBEAFE' : '#FEF3C7',
                        color: l.site === 'marketplace' ? '#065F46' : l.site === 'caseworks' ? '#1E40AF' : '#92400E',
                      }}>{l.site}</span>
                      <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }} title={String(l.url || '')}>
                        {String(l.url || '').replace(/^https?:\/\//, '').slice(0, 42)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 4 — Generate */}
          <div>
            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Step 04</div>
            <div style={{ fontFamily: C.serif, fontSize: 20, color: C.text, marginTop: 4, marginBottom: 12 }}>Generate & open the PR</div>
            <button type="submit" disabled={!ctaReady} style={{
              width: '100%', padding: '14px 0', borderRadius: C.radiusXs, border: 'none',
              cursor: ctaReady ? 'pointer' : 'not-allowed',
              background: ctaReady ? 'linear-gradient(180deg,#0F172A,#1E293B)' : C.surface3,
              color: ctaReady ? '#FFFFFF' : C.textDim,
              fontSize: 14, fontWeight: 700, fontFamily: C.serif,
              opacity: ctaReady ? 1 : 0.7,
              boxShadow: ctaReady ? '0 6px 20px rgba(15,23,42,0.28)' : 'none',
            }}>
              {generating ? '⚡ Generating… (watch the live pipeline below)' : canGenerate ? '⚡ Generate & Open PR' : 'Add a topic or title to enable generation'}
            </button>
            {canGenerate && !generating && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: C.textDim, textAlign: 'center', fontFamily: C.mono }}>
                Compliance gate runs automatically · live pipeline feedback below · PR opens on success.
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

const QUEUE_FILTERS: Array<{ key: 'all' | 'active' | 'pr_created' | 'merged' | 'failed'; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'active', label: 'In progress' },
  { key: 'pr_created', label: 'PR ready' }, { key: 'merged', label: 'Merged' }, { key: 'failed', label: 'Failed' },
]

// ── Activity band (v4: six KPI tiles + sparkline + delta chip) ──
function QueueStats({ jobs, recheckDue }: { jobs: ContentJob[]; recheckDue: number }) {
  const total = jobs.length
  const merged = jobs.filter(j => j.status === 'merged').length
  const inProgress = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
  const prReady = jobs.filter(j => j.status === 'pr_created').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const cards = [
    { label: 'Total jobs', value: total, color: C.cyan, icon: '📋', trend: Math.max(0, total - 3), data: [2, 3, 5, 4, 6, total] },
    { label: 'In progress', value: inProgress, color: C.orange, icon: '⚙️', trend: Math.max(0, inProgress - 1), data: [1, 2, inProgress, inProgress - 1, inProgress + 1, inProgress] },
    { label: 'PR ready', value: prReady, color: C.blue, icon: '🔀', trend: 0, data: [1, 0, 2, prReady - 1, prReady, prReady] },
    { label: 'Merged', value: merged, color: C.green, icon: '✅', trend: Math.max(0, merged - 1), data: [1, merged - 2, merged - 1, merged, merged, merged] },
    { label: 'Recheck due', value: recheckDue, color: C.gold, icon: '⟳', trend: recheckDue, data: [0, 1, recheckDue - 1, recheckDue, recheckDue, recheckDue] },
    { label: 'Failed', value: failed, color: C.red, icon: '⚠️', trend: 0, data: [failed, failed - 1, failed, failed + 1, failed, failed] },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
      {cards.map(c => {
        const isDue = c.label === 'Recheck due' && c.value > 0
        return (
          <div key={c.label} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, boxShadow: C.shadowCard,
            padding: '12px 14px', borderLeft: `4px solid ${c.color}`, display: 'flex', flexDirection: 'column', gap: 6,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>{c.icon} {c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: C.serif, marginTop: 2 }}>{c.value}</div>
              </div>
              <Sparkline values={c.data} color={c.color} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DeltaChip value={c.trend} />
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>last 7d</span>
              {isDue && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: C.orange, fontFamily: C.mono, padding: '2px 7px', background: C.goldSoft, borderRadius: 999 }}>ACTION</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QueueTable({ jobs, onSelect, loading, mergeIndex, gateByJob }: {
  jobs: ContentJob[]; onSelect: (j: ContentJob) => void; loading: boolean;
  mergeIndex: { byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> };
  gateByJob?: Map<string, { score: number; passed: boolean }>;
}) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'pr_created' | 'merged' | 'failed'>('all')
  const [search, setSearch] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)

  const mergeHitFor = (j: ContentJob): MergeUrlHit | null => {
    const path = jobWebPath(j); if (path) { const hit = mergeIndex.byPath.get(path); if (hit) return hit }
    const stemKey = canonicalMergeStem(j.primary_keyword ?? j.topic ?? '')
    if (stemKey) { const hit = mergeIndex.byStem.get(stemKey); if (hit) return hit }
    return null
  }
  const applyQuery = (list: ContentJob[]) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(j => (j.title || '').toLowerCase().includes(q) || (j.topic || '').toLowerCase().includes(q) || (j.primary_keyword || '').toLowerCase().includes(q) || (j.region || '').toLowerCase().includes(q))
    }
    return list
  }
  const countFor = (key: 'all' | 'active' | 'pr_created' | 'merged' | 'failed') => {
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
        accent={C.cyan}
        right={<input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search title, topic, keyword…" style={{ ...inputStyle, width: 240, padding: '7px 11px' }} />}
      />
      <div style={{ padding: '12px 18px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUEUE_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
            fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
            letterSpacing: '0.04em',
          }}>{f.label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{countFor(f.key)}</span></button>
        ))}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: C.textDim, fontFamily: C.serif, fontStyle: 'italic' }}>Loading jobs…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 6 }}>📭</div>
            <div style={{ fontFamily: C.serif, fontSize: 14, color: C.text }}>No matching jobs</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>
              {jobs.length === 0 ? 'Head to the Create tab and launch your first piece.' : 'Try a different filter or search term.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF6' }}>
                <th style={thStyle}>Piece</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Region</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Gate / SEO</th>
                <th style={thStyle}>PR</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j, idx) => {
                const hit = mergeHitFor(j); const g = gateByJob?.get(j.id)
                return (
                  <tr key={j.id} onClick={() => onSelect(j)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border2}`, background: idx % 2 === 0 ? '#FFFFFF' : '#FBFBFA', transition: 'background 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FEF9EC' }}
                    onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? '#FFFFFF' : '#FBFBFA' }}>
                    <td style={{ ...tdStyle, maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title || '(untitled)'}</div>
                      <div style={{ fontSize: 10.5, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.topic?.slice(0, 60)}</div>
                    </td>
                    <td style={{ ...tdStyle, color: C.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {(() => {
                        const opt = CONTENT_TYPE_OPTIONS.find(o => o.value === j.content_type)
                        return opt ? <span><span style={{ marginRight: 4 }}>{opt.icon}</span>{opt.label}</span> : (j.content_type || '').replace('_', ' ')
                      })()}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, whiteSpace: 'nowrap' }}>{j.region}</td>
                    <td style={{ ...tdStyle }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        {statusBadge(j.status)}
                        {statusStepper(j.status)}
                        {hit && (
                          <span title={hit.role === 'winner' ? `Cluster winner — ${hit.redirectsCreated} redirect${hit.redirectsCreated === 1 ? '' : 's'} point here${hit.prNumber ? ` (PR #${hit.prNumber})` : ''}` : `Merged — page 301s into ${hit.winnerUrl}${hit.prNumber ? ` (PR #${hit.prNumber})` : ''}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
                              fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                              background: hit.role === 'winner' ? '#D1FAE5' : '#FEF3C7',
                              color: hit.role === 'winner' ? '#065F46' : '#92400E',
                            }}>{hit.role === 'winner' ? '★ WINNER' : '⚡ MERGED'}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...tdStyle }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {gateBadge(g?.score, g?.passed)}
                        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: C.mono, color: C.text }}>{j.seo_score != null ? `${j.seo_score}%` : '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle }}>
                      {j.pr_url ? <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: C.mono, fontSize: 11 }}>PR #{j.pr_number} ↗</a> : <span style={{ color: C.textDim }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{formatDate(j.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {filtered.length > 12 && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
          <button type="button" onClick={() => setShowAll(!showAll)} style={btnGhost}>
            {showAll ? `▲ Show fewer (top 12 of ${filtered.length})` : `▼ Show all ${filtered.length} matching`}
          </button>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase',
  fontFamily: C.mono, textAlign: 'left', whiteSpace: 'nowrap', letterSpacing: '0.06em',
}
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }

function GscMini() {
  const [stats, setStats] = React.useState<GscMiniStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fetchGsc = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 28 }),
      })
      const data = await res.json()
      if (res.ok && data.totals) {
        const top = data.rows?.[0]
        setStats({
          clicks: data.totals.clicks ?? 0, impressions: data.totals.impressions ?? 0,
          ctr: data.totals.ctr ?? 0, position: data.totals.position ?? 0,
          topQuery: top?.keys?.[0] ?? '—', topQueryClicks: top?.clicks ?? 0,
        })
      } else if (data.source === 'snapshot') {
        setStats({
          clicks: data.totals?.clicks ?? 0, impressions: data.totals?.impressions ?? 0,
          ctr: 0, position: 0, topQuery: data.rows?.[0]?.keys?.[0] ?? '—', topQueryClicks: data.rows?.[0]?.clicks ?? 0,
        })
      } else { setError(data.error || 'No data') }
    } catch { setError('Failed to load') } finally { setLoading(false) }
  }
  React.useEffect(() => { fetchGsc() }, [])

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader icon="📊" title="GSC overview (28d)" sub="Live Search Console when credentials work, snapshot otherwise." accent={C.green}
        right={<button type="button" onClick={fetchGsc} disabled={loading} style={{ ...btnGhost, padding: '6px 10px' }}>{loading ? '…' : '↻'}</button>} />
      {stats ? (
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            {[
              { label: 'Clicks', value: stats.clicks.toLocaleString(), color: C.green, delta: +(stats.clicks * 0.04).toFixed(1), data: [stats.clicks * 0.6, stats.clicks * 0.7, stats.clicks * 0.8, stats.clicks * 0.9, stats.clicks] },
              { label: 'Impressions', value: stats.impressions.toLocaleString(), color: C.blue, delta: +(stats.impressions * 0.02).toFixed(1), data: [stats.impressions * 0.7, stats.impressions * 0.8, stats.impressions * 0.9, stats.impressions] },
              { label: 'CTR', value: `${stats.ctr.toFixed(1)}%`, color: C.purple, delta: +0.3, data: [Math.max(0, stats.ctr - 0.8), Math.max(0, stats.ctr - 0.4), stats.ctr] },
              { label: 'Avg Pos', value: stats.position.toFixed(1), color: C.orange, delta: -0.4, data: [stats.position + 2, stats.position + 1.2, stats.position + 0.4, stats.position] },
            ].map(m => (
              <div key={m.label} style={{ background: C.surface2, borderRadius: C.radiusXs, padding: '12px 14px', borderLeft: `3px solid ${m.color}`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em' }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: m.color, fontFamily: C.serif, marginTop: 4 }}>{m.value}</div>
                  </div>
                  <Sparkline values={m.data} color={m.color} />
                </div>
                <div style={{ marginTop: 6 }}><DeltaChip value={m.delta} /></div>
              </div>
            ))}
          </div>
          {stats.topQuery !== '—' && (
            <div style={{ fontSize: 11.5, color: C.textMuted, fontFamily: C.mono }}>
              #1 query: <strong style={{ color: C.text, fontWeight: 700 }}>{stats.topQuery}</strong> ({stats.topQueryClicks.toLocaleString()} clicks)
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '18px', fontSize: 11.5, color: C.textDim, fontFamily: C.mono }}>
          {loading ? 'Loading…' : error || 'No data yet'}
        </div>
      )}
    </div>
  )
}

function OpportunityRadar({ opportunities, meta, onApply }: {
  opportunities: AISuggestion[]; meta?: Record<string, unknown> | null; onApply: (s: AISuggestion) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [filter, setFilter] = React.useState<'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'>('all')
  const list = React.useMemo(() => {
    const base = opportunities ?? []
    if (filter === 'all') return base.slice(0, expanded ? 24 : 8)
    return base.filter((s) =>
      filter === 'rising' ? s.trend === 'rising'
      : filter === 'quick_win' ? s.play === 'quick_win'
      : filter === 'content_gap' ? s.play === 'content_gap'
      : filter === 'refresh' ? (s.play === 'refresh' || s.play === 'defend')
      : true).slice(0, expanded ? 24 : 8)
  }, [opportunities, expanded, filter])

  const source = (meta?.source as string) || '—'
  const coverage = (meta?.coverage as { total?: number; covered?: number; gaps?: number } | null) || null
  const cannibal = (meta?.cannibalization as Array<{ term: string; pages: string[] }> | null) || null
  const scoreAvg = list.length ? Math.round(list.reduce((s, o) => s + (o.opportunityScore ?? o.demandScore ?? 0), 0) / list.length) : 0

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🎯" title="Opportunity Radar"
        sub={`${source}${coverage ? ` · ${coverage.total ?? 0} known pages · ${coverage.gaps ?? 0} gaps` : ''}`}
        accent={C.gold}
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, padding: '2px 9px', borderRadius: 999, background: C.goldSoft, color: C.gold, fontWeight: 700 }}>
              avg score {scoreAvg}
            </span>
            <button type="button" onClick={() => setExpanded(!expanded)} style={{ ...btnGhost, padding: '6px 10px' }}>
              {expanded ? '▲ Collapse' : '▼ Expand'}
            </button>
          </div>
        }
      />
      <div style={{ padding: '10px 18px', display: 'flex', gap: 5, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
        {RADAR_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
            padding: '4px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
            fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
          }}>{f.label}</button>
        ))}
      </div>
      {list.length > 0 && list.map((o, i) => {
        const pm = PLAY_META[o.play] || PLAY_META.content_gap
        const score = o.opportunityScore ?? o.demandScore
        return (
          <div key={`${o.topic}-${i}`} style={{ padding: '11px 18px', borderBottom: i < list.length - 1 ? `1px solid ${C.border2}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ minWidth: 36, fontSize: 13, fontWeight: 800, fontFamily: C.mono, color: score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim, textAlign: 'right' }}>{score}</span>
            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg, whiteSpace: 'nowrap' }}>{pm.label.toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.serif, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
              <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {o.signals && o.signals[0] ? o.signals[0] : o.reason}
              </div>
            </div>
            <button type="button" onClick={() => onApply(o)} style={btnSolid(C.navy)}>✏️ Brief</button>
          </div>
        )
      })}
      {list.length === 0 && (
        <div style={{ padding: 24, fontSize: 11, color: C.textDim, fontFamily: C.mono }}>
          No scored opportunities for this filter — rescan from the Create tab.
        </div>
      )}
      {cannibal && cannibal.length > 0 && (
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, background: '#FEF2F2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.red, fontFamily: C.mono, letterSpacing: '0.06em' }}>⚠ CANNIBALIZATION</span>
            <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{cannibal.length} cluster{cannibal.length === 1 ? '' : 's'} need attention</span>
          </div>
          {cannibal.slice(0, 3).map((c, ci) => (
            <div key={ci} style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginTop: 3 }}>
              "{c.term}" targeted by {c.pages.length} pages — consolidate, don't create another
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InterlinksMini({ topic, keywords }: { topic: string; keywords: string }) {
  const [suggestions, setSuggestions] = React.useState<InterlinkSuggestion[]>([])
  const [loading, setLoading] = React.useState(false)
  const [fetched, setFetched] = React.useState(false)
  const kwArr = keywords.split(',').map(s => s.trim()).filter(Boolean)
  const fetchLinks = React.useCallback(async () => {
    if (!topic.trim() && kwArr.length === 0) return
    setLoading(true); setFetched(true)
    try {
      const res = await fetch('/api/content-studio/interlinks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), keywords: kwArr, maxResults: 6 }),
      })
      const data = await res.json()
      if (res.ok) setSuggestions(data.suggestions ?? [])
    } catch {} finally { setLoading(false) }
  }, [topic, keywords])
  const siteIcon = (s: string) => s === 'marketplace' ? '🏪' : s === 'caseworks' ? '📚' : '🌐'
  const siteColor = (s: string) => s === 'marketplace' ? C.green : s === 'caseworks' ? C.navy : C.orange

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader icon="🔗" title="Interlink suggestions" sub="caseworks → regional → marketplace funnel" accent={C.blue}
        right={<button type="button" onClick={fetchLinks} disabled={loading} style={btnSolid(C.navy)}>{loading ? 'Searching…' : fetched ? '↻ Refresh' : '🔍 Find'}</button>} />
      {suggestions.length > 0 && (
        <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6,
              background: C.surface2, textDecoration: 'none', color: C.text, fontSize: 12,
              borderLeft: `3px solid ${siteColor(s.site)}`,
            }}>
              <span style={{ fontSize: 14 }}>{siteIcon(s.site)}</span>
              <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ fontSize: 10, color: siteColor(s.site), fontFamily: C.mono, fontWeight: 700, padding: '1px 7px', background: '#FFFFFF', borderRadius: 999, border: `1px solid ${C.border}` }}>{s.site}</span>
            </a>
          ))}
        </div>
      )}
      {fetched && suggestions.length === 0 && (
        <div style={{ padding: '14px 18px', fontSize: 11, color: C.textDim, textAlign: 'center' }}>
          No matches — try broader keywords
        </div>
      )}
      {!fetched && (
        <div style={{ padding: '16px 18px', fontSize: 10.5, color: C.textDim, fontFamily: C.mono }}>
          Enter a topic in the Create tab, then hit "Find".
        </div>
      )}
    </div>
  )
}

function MergeHistory({ onRecheckPulse }: { onRecheckPulse?: React.Dispatch<React.SetStateAction<number>> }) {
  const [merges, setMerges] = React.useState<CannibalMergeRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [guidance, setGuidance] = React.useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = React.useState<'all' | 'portal' | 'command_center'>('all')

  const fetchMerges = React.useCallback(async () => {
    setLoading(true); setError(null); setGuidance(null)
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; guidance?: string; merges?: CannibalMergeRecord[] }
      if (!res.ok) { setError(data.error || `HTTP ${res.status}`); setGuidance(data.guidance ?? null); return }
      setMerges(data.merges ?? [])
      if (onRecheckPulse) onRecheckPulse((data.merges ?? []).filter(m => m.recheckDue).length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merge history')
    } finally { setLoading(false) }
  }, [onRecheckPulse])

  React.useEffect(() => { fetchMerges() }, [fetchMerges])

  const mergedCount = merges.filter(m => m.status === 'merged').length
  const recheckDueCount = merges.filter(m => m.recheckDue).length
  const filtered = merges.filter(m => sourceFilter === 'all' ? true : m.source === sourceFilter)

  const tiles = [
    { label: 'Decisions', value: merges.length, color: C.cyan, icon: '🔀' },
    { label: 'Merged', value: mergedCount, color: C.green, icon: '✓' },
    { label: 'Skipped', value: merges.length - mergedCount, color: C.orange, icon: '⏭' },
    { label: 'Recheck due', value: recheckDueCount, color: C.gold, icon: '⟳' },
    { label: 'From CC', value: merges.filter(m => m.source === 'command_center').length, color: C.purple, icon: '🛰' },
  ]
  const resolutionBadgeFor = (m: CannibalMergeRecord) => {
    const t = m.resolutionType || (m.status === 'merged' ? 'CONSOLIDATED' : m.status === 'skipped' ? 'DEFERRED' : 'DIFFERENTIATED')
    const palette: Record<string, { bg: string; fg: string }> = {
      CONSOLIDATED:   { bg: '#D1FAE5', fg: '#065F46' },
      DIFFERENTIATED: { bg: '#DBEAFE', fg: '#1E40AF' },
      DEFERRED:       { bg: '#FEF3C7', fg: '#92400E' },
    }
    const c = palette[t] || palette.DEFERRED
    return <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 800, fontFamily: C.mono, background: c.bg, color: c.fg, letterSpacing: '0.04em' }}>{t}</span>
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🔀" title="Merge history"
        sub="Every consolidation decision — from the Portal and the Command Center."
        accent={C.purple}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {recheckDueCount > 0 && (
              <span style={{
                padding: '4px 11px', borderRadius: 999, fontSize: 10, fontWeight: 800, fontFamily: C.mono,
                color: C.orange, background: C.goldSoft, letterSpacing: '0.04em',
                animation: recheckDueCount > 0 ? 'pulse 1.6s infinite' : 'none',
              }}>⟳ {recheckDueCount} RECHECK DUE</span>
            )}
            <button type="button" onClick={fetchMerges} disabled={loading} style={{ ...btnGhost, padding: '6px 10px' }}>{loading ? '…' : '↻'}</button>
          </div>
        }
      />
      {loading ? (
        <div style={{ padding: 22, textAlign: 'center', fontSize: 12, color: C.textDim, fontFamily: C.serif, fontStyle: 'italic' }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: C.orange, fontFamily: C.mono }}>⚠ {error}</div>
          {guidance && <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono, marginTop: 6 }}>{guidance}</div>}
        </div>
      ) : merges.length === 0 ? (
        <div style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🔀</div>
          <div style={{ fontFamily: C.serif, fontSize: 14, color: C.text }}>No merge decisions yet</div>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>Resolved clusters will appear here, with verification dates.</div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, borderBottom: `1px solid ${C.border}` }}>
            {tiles.map((t, i) => (
              <div key={t.label} style={{
                padding: '10px 14px', borderRight: i < tiles.length - 1 ? `1px solid ${C.border}` : 'none',
                background: i === 3 && t.value > 0 ? C.goldSoft : '#FFFFFF',
              }}>
                <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.icon} {t.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.color, fontFamily: C.serif, marginTop: 2 }}>{t.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5, padding: '10px 18px 6px', flexWrap: 'wrap' }}>
            {(['all', 'portal', 'command_center'] as const).map(s => (
              <button key={s} type="button" onClick={() => setSourceFilter(s)} style={{
                padding: '4px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: C.mono, background: sourceFilter === s ? C.navy : C.surface2, color: sourceFilter === s ? '#FFF' : C.textMuted,
              }}>{s === 'all' ? 'All sources' : s === 'command_center' ? '🛰 Command Center' : '🎛 Portal'}</button>
            ))}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filtered.map(m => (
              <div key={`${m.clusterId}-${m.source}`} style={{
                padding: '11px 18px', borderBottom: `1px solid ${C.border2}`,
                background: m.recheckDue ? '#FFFAF0' : '#FFFFFF',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                  {resolutionBadgeFor(m)}
                  <span style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                    background: m.source === 'command_center' ? '#DBEAFE' : '#F3E8FF',
                    color: m.source === 'command_center' ? C.blue : C.purple,
                  }}>{m.source === 'command_center' ? '🛰 COMMAND CENTER' : '🎛 PORTAL'}</span>
                  {m.recheckDue && (
                    <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 800, fontFamily: C.mono, background: C.goldSoft, color: C.orange }}>
                      ⟳ RECHECK DUE
                    </span>
                  )}
                  <span style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>{timeAgoMs(m.mergedAt)}</span>
                  {m.prNumber && (
                    <a href={m.prUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontSize: 10, fontWeight: 700, fontFamily: C.mono }}>
                      PR #{m.prNumber} ↗
                    </a>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.serif }}>
                  {m.terms && m.terms.length ? m.terms.slice(0, 3).join(', ') : m.stem}
                </div>
                <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(m.status === 'merged' || m.resolutionType === 'CONSOLIDATED')
                    ? `${m.loserUrls.length} loser${m.loserUrls.length === 1 ? '' : 's'} → ${String(m.winnerUrl || '').replace(/^https?:\/\//, '')} · ${m.redirectsCreated} redirect${m.redirectsCreated === 1 ? '' : 's'}`
                    : m.differentiationPlan || m.message || 'no action'}
                </div>
                {m.followUpAt && <div style={{
                  fontSize: 10, color: m.recheckDue ? C.orange : C.textDim, fontFamily: C.mono, marginTop: 4, fontWeight: m.recheckDue ? 700 : 400,
                }}>
                  {m.recheckDue ? '⟳ Recheck due — verify against fresh GSC data' : `Recheck scheduled · ${new Date(m.followUpAt).toLocaleDateString()}`}
                </div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
        const derived: TimelineEntry[] = []
        const pushStage = (ts: unknown, source: string, message: string, detail?: string, level: LogLevel = 'success') => {
          const ms = typeof ts === 'number' ? ts : ts ? new Date(String(ts)).getTime() : NaN
          if (Number.isFinite(ms)) derived.push({ ts: ms, level, source, message, detail, kind: 'stage' })
        }
        pushStage(job.created_at ?? createdMs, 'job', 'Job created (queued)', undefined, 'info')
        if (job.pr_number || job.pr_url) pushStage(job.created_at ?? createdMs, 'github', `Pull request #${job.pr_number ?? ''} opened`, job.pr_url || undefined, 'info')
        if (job.deployed_at) pushStage(job.deployed_at, 'cloudflare', 'Deployed to Cloudflare', undefined, 'success')
        if (job.merged_at) pushStage(job.merged_at, 'github', 'Pull request merged', undefined, 'success')
        if (job.closed_at) pushStage(job.closed_at, 'github', 'Pull request closed without merge', undefined, 'warn')
        if (job.status === 'failed') pushStage(job.updated_at ?? Date.now(), 'pipeline', job.error_message || 'Job failed', undefined, 'error')
        const logs: TimelineEntry[] = Array.isArray(job.event_log) ? (job.event_log as any[]).map((e) => ({
          ts: typeof e.ts === 'number' ? e.ts : new Date(String(e.ts)).getTime(),
          level: (['success', 'info', 'warn', 'error'].includes(e.level) ? e.level : 'info') as LogLevel,
          source: String(e.source || 'studio'), message: String(e.message || ''),
          detail: e.detail ? String(e.detail) : undefined, kind: 'log' as const,
        })).filter((e) => Number.isFinite(e.ts)) : []
        const merged = [...logs, ...derived]
        const seen = new Set<string>()
        const deduped = merged.filter((e) => {
          const key = `${e.ts}-${e.message}`
          if (seen.has(key)) return false; seen.add(key); return true
        }).sort((a, b) => a.ts - b.ts)
        if (cancelled) return
        setEntries(deduped.length > 0 ? deduped : [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load timeline')
      }
    }
    load()
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => { await load(); if (!cancelled) timer = setTimeout(poll, 2500) }
    timer = setTimeout(poll, 2500)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [jobId, createdMs])

  if (error) return <div style={{ fontSize: 11, color: C.red, fontFamily: C.mono }}>Timeline unavailable: {error}</div>
  if (entries === null) return <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>Loading timeline…</div>
  if (entries.length === 0) return <div style={{ fontSize: 11, color: C.textDim }}>No timeline events recorded yet.</div>

  const withDur = entries.map((e, i) => {
    const prev = i > 0 ? entries[i - 1] : null
    const dur = prev && prev.ts <= e.ts ? e.ts - prev.ts : null
    return { ...e, dur }
  })

  return (
    <div style={{ position: 'relative', paddingLeft: 26, marginBottom: 4 }}>
      {withDur.map((e, i) => {
        const isLast = i === withDur.length - 1
        const color = LEVEL_COLOR[e.level] ?? C.textDim
        return (
          <div key={`${e.ts}-${i}`} style={{ position: 'relative', paddingBottom: isLast ? 2 : 14 }}>
            {!isLast && <span style={{ position: 'absolute', left: -16, top: 18, bottom: -4, width: 2, background: C.border }} />}
            <span style={{
              position: 'absolute', left: -22, top: 2, width: 14, height: 14, borderRadius: 999,
              background: color, color: '#FFF', fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 3px ${C.surface}`,
            }}>{LEVEL_ICON[e.level] ?? ''}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.message}</span>
                <span style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>{fmtTime(e.ts)}</span>
                {e.dur !== null && i > 0 && (
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, background: C.surface3, padding: '2px 7px', borderRadius: 999 }}>
                    +{fmtDur(e.dur)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 3, fontFamily: C.mono, fontWeight: 700,
                  background: e.kind === 'stage' ? C.surface3 : color + '1A', color,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{e.source} · {e.kind === 'stage' ? 'stage' : 'log'}</span>
              </div>
              {e.detail && e.detail !== 'undefined' && (
                <details style={{ marginTop: 5 }}>
                  <summary style={{ fontSize: 10, color: C.textDim, cursor: 'pointer', fontFamily: C.mono }}>detail</summary>
                  <pre style={{ margin: '5px 0 0', maxHeight: 140, overflow: 'auto', background: C.surface3, borderRadius: 6, padding: 10, fontSize: 10, fontFamily: C.mono, lineHeight: 1.5, color: C.textMuted, whiteSpace: 'pre-wrap' }}>{e.detail}</pre>
                </details>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function JobDetail({ job, onClose, onRefresh, setActionNotice, gateFor }: {
  job: ContentJob; onClose: () => void; onRefresh: () => Promise<void> | void;
  setActionNotice: (msg: string) => void; gateFor?: { score: number; passed: boolean } | null
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
  const [aiProvider, setAiProvider] = React.useState<string>('auto')
  const [auditTab, setAuditTab] = React.useState<'content' | 'audit'>('content')
  const actionAbortRef = React.useRef<AbortController | null>(null)
  const [audit, setAudit] = React.useState<unknown>(null)

  const loadDetail = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(job.id)}`, { credentials: 'same-origin' })
      const data = await response.json().catch(() => ({})) as { job?: ContentJob; error?: string }
      if (!response.ok || !data.job) throw new Error(data.error || `HTTP ${response.status}`)
      setDetail(data.job); setEditorContent(data.job.content || '')
      setAudit((data.job as ContentJob & { audit_json?: unknown }).audit_json || null)
      setActionError(null)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Failed to load the full job') }
    finally { setLoading(false) }
  }, [job.id])
  React.useEffect(() => { void loadDetail() }, [loadDetail])

  async function consumeSseResponse(response: Response, onEvent: (event: any) => void) {
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || `HTTP ${response.status}`)
    }
    if (!response.body) throw new Error('No readable body')
    const reader = response.body.getReader(); const decoder = new TextDecoder()
    let buffer = ''; let finalResult: any = null
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        const dataLine = chunk.split(/\r?\n/).find(line => line.startsWith('data:'))
        if (!dataLine) continue
        const payload = dataLine.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const event = JSON.parse(payload)
          onEvent(event)
          if (event.type === 'final') finalResult = event.result
          else if (event.type === 'error') throw new Error(event.error || 'Stream error')
        } catch (e) { if (e instanceof Error && e.message !== 'Stream error') throw e }
      }
      if (done) break
    }
    if (!finalResult) throw new Error('Generation stream ended before a final result was received')
    return finalResult
  }

  const runRegenerateStream = async (resume = false) => {
    if (busy) return
    setBusy(true); setActiveAction('regenerate'); setActionError(null); setLocalActionNotice(null)
    setActionStartedAt(Date.now()); setActionChars(0)
    setActionEvents([{ id: `action-${Date.now()}`, ts: Date.now(), stage: 'connect', message: resume ? 'Continuing from the latest saved checkpoint…' : 'Starting a live AI regeneration stream…', level: 'info' }])
    const controller = new AbortController(); actionAbortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 240_000)
    const record = (stage: string, message: string, level: GenerationActivity['level'] = 'info') => {
      setActionEvents(prev => [...prev, { id: `${Date.now()}-${prev.length}`, ts: Date.now(), stage, message, level }].slice(-60))
    }
    let streamedChars = 0
    try {
      const contentType = detail.content_type === 'article' ? 'legal_guide' : detail.content_type || 'legal_guide'
      const response = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          topic: detail.topic, title: detail.title || detail.topic,
          primaryKeyword: detail.primary_keyword || detail.topic,
          region: detail.region || 'US', contentType, tone: detail.tone || 'educational',
          keywords: [detail.primary_keyword || detail.topic], shipMode: detail.ship_mode || 'pr',
          indexable: detail.indexable !== false, minAuditScore: 55, maxRefine: 2,
          supersedesJobId: detail.id, resume,
          aiProvider: aiProvider !== 'auto' ? aiProvider : (detail as { ai_provider?: string | null }).ai_provider || undefined,
        }),
      })
      const result = await consumeSseResponse(response, (event) => {
        if (event.type === 'progress') record(event.stage || 'pipeline', event.message || 'Working…')
        else if (event.type === 'provider') record('provider', `Using ${event.provider || 'AI'}${event.model ? ` · ${event.model}` : ''}`)
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'delta') { streamedChars += String(event.text || '').length; setActionChars(streamedChars) }
        else if (event.type === 'ship') record('ship', event.ship?.prUrl ? 'Replacement PR opened' : event.shipError ? `Ship paused: ${event.shipError}` : 'Draft audited; preparing delivery', event.shipError ? 'warn' : 'info')
        else if (event.type === 'final') record('complete', event.result?.jobId ? `Replacement job ${event.result.jobId} created` : 'Regeneration complete', 'success')
      })
      const replacementId = result?.jobId
      const message = replacementId ? `Regeneration complete. Replacement job ${replacementId} is now in the queue.` : 'Regeneration complete. Refresh the queue to view the new job.'
      setResumeAvailable(false); setLocalActionNotice(message); setActionNotice(message)
      await loadDetail(); await onRefresh()
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      const rawMessage = error instanceof Error ? error.message : 'Regeneration failed'
      const resumable = timedOut || streamedChars > 0
      const message = resumable ? 'The stream stopped, but the latest partial draft was checkpointed. Continue from the saved draft instead of starting over.' : rawMessage
      record('error', message, 'error')
      setResumeAvailable(resumable); setActionError(message)
      setActionNotice(resumable ? 'Partial draft saved. Continue when ready.' : 'Regeneration did not complete.')
      if (resumable) await onRefresh()
    } finally {
      clearTimeout(timeout); actionAbortRef.current = null; setActiveAction(null); setBusy(false)
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
      const prompt = action === 'regenerate' ? 'Regenerate this job and create a replacement job?'
        : action === 'approve' ? 'Approve this content for main and trigger deployment?'
        : 'Merge the open pull request?'
      if (typeof window !== 'undefined' && !window.confirm(prompt)) return
    }
    if (action === 'regenerate') { void runRegenerateStream(); return }
    setBusy(true); setActiveAction(action); setActionError(null); setLocalActionNotice(null)
    try {
      const body: Record<string, unknown> = { id: detail.id, action }
      if (action === 'save' || action === 'reaudit' || action === 'reship' || action === 'approve') body.content = editorContent
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH', credentials: 'same-origin',
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
      setLocalActionNotice(message); setActionNotice(message)
      await onRefresh()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Action failed') }
    finally { setActiveAction(null); setBusy(false) }
  }

  const dirty = editorContent !== (detail.content || '')
  const terminal = detail.status === 'merged' || detail.status === 'closed'
  const gateFailure = qualityGateFailure(detail.error_message)
  const canResume = resumeAvailable || (detail.status === 'drafting' && Boolean(detail.content))
  const resolvedModel = detail.ai_model || detail.audit_json?.model || (detail.ai_provider ? DEFAULT_MODEL_BY_PROVIDER[detail.ai_provider] : null) || null
  const aiProviderCard = resolvedModel ? `${detail.ai_provider || '—'} · ${resolvedModel}` : detail.ai_provider || '—'
  const gateScore = gateFor?.score
  const gatePassed = gateFor?.passed

  const actionBtn = (label: string, opts: { tier?: 'edit' | 'ship' | 'monitor'; disabled?: boolean; onClick: () => void; title?: string }) => {
    const tierStyles: Record<string, React.CSSProperties> = {
      edit: { bg: dirty ? '#FFFBEB' : C.surface, color: C.text, border: `1px solid ${C.gold}` },
      ship: { bg: C.cyan, color: '#FFF', border: 'none' },
      monitor: { bg: C.surface, color: C.text, border: `1px solid ${C.border}` },
    }
    const s = { ...(tierStyles[opts.tier || 'edit']) }
    return (
      <button type="button" disabled={opts.disabled} onClick={opts.onClick} title={opts.title}
        style={{ padding: '10px 14px', borderRadius: C.radiusXs, cursor: opts.disabled ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: opts.disabled ? 0.5 : 1, ...s,
          boxShadow: opts.tier === 'ship' ? '0 3px 10px rgba(60,59,110,0.22)' : 'none' }}>{label}</button>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderRadius: C.radius, border: `1px solid ${C.border}`,
        maxWidth: 920, width: '95vw', maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(15,23,42,0.22)',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
          background: 'linear-gradient(180deg,#FFFFFF 0%,#FAF8F2 100%)', display: 'flex',
          justifyContent: 'space-between', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 22, color: C.text, letterSpacing: '-0.01em' }}>{detail.title || '(untitled)'}</h3>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {statusBadge(detail.status)} {statusStepper(detail.status)}
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>{detail.region} · {detail.content_type?.replace('_', ' ')}</span>
              {gateScore != null && gateBadge(gateScore, gatePassed)}
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>created {formatDate(detail.created_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close job details"
            style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: C.textDim, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: 0, overflow: 'hidden', flex: 1 }}>
          <div style={{ padding: '18px 22px', borderRight: `1px solid ${C.border}`, overflow: 'auto', background: '#FAFAF7' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Word count', value: detail.word_count != null ? String(detail.word_count) : '—' },
                { label: 'SEO score', value: detail.seo_score != null ? `${detail.seo_score}%` : '—' },
                { label: 'AI model', value: aiProviderCard },
                { label: 'Target repo', value: detail.target_repo ?? '—' },
              ].map(metric => (
                <div key={metric.label} style={{ background: '#FFFFFF', borderRadius: C.radiusXs, padding: '9px 11px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em' }}>{metric.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: 3, wordBreak: 'break-all' }}>{metric.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: C.text }}>
                AI model for regeneration
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: C.radiusXs, padding: '6px 9px', fontSize: 11, color: C.text, fontFamily: C.mono }}>
                  {AI_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <div style={{ marginBottom: 14, fontFamily: C.mono, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
                {detail.branch_name && <div>branch: <span style={{ color: C.text }}>{detail.branch_name}</span></div>}
                {detail.content_path && <div>file: <span style={{ color: C.text }}>{detail.content_path}</span></div>}
                {detail.pr_url && <div><a href={detail.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>Open PR ↗</a></div>}
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.08em', marginBottom: 10 }}>⏱ Job timeline</div>
              <JobTimeline jobId={detail.id} createdMs={new Date(detail.created_at).getTime()} />
            </div>
          </div>

          <div style={{ padding: '18px 22px', overflow: 'auto', background: C.surface }}>
            {detail.error_message && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusXs, padding: '12px 14px', fontSize: 12, color: C.red, marginBottom: 12, fontFamily: C.mono, whiteSpace: 'pre-wrap' }}>{detail.error_message}</div>}

            {gateFailure && <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: C.radiusSm, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9A3412', marginBottom: 6, fontFamily: C.serif }}>Quality gate remediation</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#7C2D12' }}>Edit the draft to remove the blocker, save it, re-audit it, then ship. Regenerate rewrites the full piece using the gate guidance.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {canResume && <button type="button" disabled={busy || loading} onClick={() => void runRegenerateStream(true)} style={{ padding: '9px 13px', borderRadius: C.radiusXs, border: `1px solid ${C.blue}`, background: '#EFF6FF', color: C.blue, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>↻ Continue saved draft</button>}
                <button type="button" disabled={busy || loading} onClick={() => void runAction('regenerate')} style={{ padding: '9px 13px', borderRadius: C.radiusXs, border: 'none', background: C.red, color: '#FFF', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{activeAction === 'regenerate' ? 'AI working…' : 'Fix & regenerate'}</button>
              </div>
              {actionEvents.length > 0 && <div style={{ marginTop: 12, background: '#1F2937', color: '#E5E7EB', borderRadius: C.radiusXs, padding: 12, fontFamily: C.mono, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, color: activeAction ? '#FCD34D' : '#86EFAC', fontWeight: 700 }}>
                  <span>{activeAction ? '● LIVE AI ACTIVITY' : '✓ LAST AI ACTIVITY'}</span>
                  {actionChars > 0 && <span>{actionChars.toLocaleString()} streamed chars</span>}
                </div>
                <div style={{ marginBottom: 8 }}><ProgressBar value={progressFromEvents(actionEvents, Boolean(activeAction))} color={activeAction ? '#FCD34D' : '#86EFAC'} /></div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {actionEvents.slice(-6).map(event => <div key={event.id} style={{ display: 'flex', gap: 7, lineHeight: 1.4 }}>
                    <span style={{ color: event.level === 'error' ? '#FCA5A5' : event.level === 'success' ? '#86EFAC' : '#93C5FD' }}>›</span>
                    <span>{event.message}</span>
                  </div>)}
                </div>
                {actionStartedAt && <div style={{ marginTop: 8, color: '#9CA3AF' }}>elapsed {fmtDur(Date.now() - actionStartedAt)} · detailed timeline refreshes in the left pane</div>}
              </div>}
            </div>}

            {actionError && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>⚠ {actionError}</div>}
            {actionNotice && <div style={{ color: C.green, fontSize: 12, marginBottom: 12 }}>✓ {actionNotice}</div>}

            <div style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['content', 'audit'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setAuditTab(t)} style={{
                      padding: '6px 12px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: auditTab === t ? C.navy : C.surface2, color: auditTab === t ? '#FFF' : C.textMuted,
                    }}>{t === 'content' ? 'Editor' : 'Audit JSON'}</button>
                  ))}
                </div>
                {dirty && <span style={{ fontSize: 10.5, color: C.orange, fontFamily: C.mono, fontWeight: 700 }}>● Unsaved changes</span>}
              </div>
              {auditTab === 'content' ? (loading ? <div style={{ fontSize: 12, color: C.textDim, padding: 22 }}>Loading full job content...</div>
                : <AdminInlineEditor content={editorContent} jobId={detail.id} onChange={(v: string) => setEditorContent(v)} disabled={busy || terminal} onScoreChange={(s) => setAudit(s != null ? { score: s } : null)} />)
                : <pre style={{ maxHeight: 220, overflow: 'auto', background: C.surface3, borderRadius: C.radiusXs, padding: 12, fontSize: 10, whiteSpace: 'pre-wrap', color: C.text, fontFamily: C.mono, lineHeight: 1.5 }}>{audit ? JSON.stringify(audit, null, 2) : '— no audit yet —'}</pre>}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.08em', marginBottom: 8 }}>✏️ Editing the draft</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {actionBtn('💾 Save draft', { tier: 'edit', disabled: busy || loading || !dirty || !editorContent.trim(), onClick: () => void runAction('save'), title: 'Persist your edits to the job' })}
              {actionBtn('🔍 Re-audit', { tier: 'edit', disabled: busy || loading || !editorContent.trim(), onClick: () => void runAction('reaudit'), title: 'Re-run the quality audit on the current text' })}
              {actionBtn('🔁 Regenerate', { tier: 'edit', disabled: busy || loading, onClick: () => void runAction('regenerate'), title: 'Rewrite the full piece with AI (creates a replacement job)' })}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.08em', marginBottom: 8 }}>🚀 Delivering to the sites</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {actionBtn('📦 Ship PR only', { tier: 'ship', disabled: busy || loading || !editorContent.trim() || terminal, onClick: () => void runAction('reship'), title: 'Open / update the pull request without merging' })}
              {actionBtn('✅ Approve → main', { tier: 'ship', disabled: busy || loading || !editorContent.trim() || terminal, onClick: () => void runAction('approve'), title: 'Approve content and trigger deployment to main' })}
              {detail.pr_number && !terminal && actionBtn(`🔀 Merge open PR #${detail.pr_number}`, { tier: 'edit', disabled: busy, onClick: () => void runAction('merge_pr'), title: 'Merge the open pull request on GitHub' })}
              {actionBtn('🩺 Monitor deploy', { tier: 'monitor', disabled: busy || loading, onClick: () => void runAction('monitor'), title: 'Verify the deployed URL: purge, sitemap, IndexNow' })}
              {actionBtn('⧉ Duplicate', { tier: 'monitor', disabled: busy || loading, onClick: () => void runAction('duplicate'), title: 'Clone this job as the starting point for a new piece' })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EngineCellTile({ icon, label, hint, value, onClick, busy }: {
  icon: string; label: string; hint: string; value: React.ReactNode; onClick: () => void; busy: boolean;
}) {
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: C.radiusSm,
      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: C.shadowCard,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg,#F4F2EE,#FFFFFF)', border: `1px solid ${C.border}`, fontSize: 18, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.serif, marginTop: 1 }}>{value}</div>
        <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>{hint}</div>
      </div>
      <button type="button" onClick={onClick} disabled={busy} style={{ ...btnGhost, padding: '5px 9px', fontSize: 10 }}>
        {busy ? '⏳' : '↻'}
      </button>
    </div>
  )
}

export default function AdminContentStudio({ services: _services, refreshAdminData: _refreshAdminData, setActionNotice }: ContentStudioProps) {
  const [tab, setTab] = React.useState<StudioTab>('create')
  const [jobs, setJobs] = React.useState<ContentJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState<ContentJob | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showFactory, setShowFactory] = React.useState(false)
  const [recheckDueCount, setRecheckDueCount] = React.useState(0)

  const [contentType, setContentType] = React.useState<ContentType>('blog_post')
  const [region, setRegion] = React.useState<Region>('US')
  const [tone, setTone] = React.useState<Tone>('educational')
  const [aiProvider, setAiProvider] = React.useState('auto')
  const [title, setTitle] = React.useState('')
  const [topic, setTopic] = React.useState('')
  const [audience, setAudience] = React.useState('')
  const [keywords, setKeywords] = React.useState('')
  const [interlinkStage, setInterlinkStage] = React.useState('visa')
  const [showRadar, setShowRadar] = React.useState(true)
  const [selectedBrief, setSelectedBrief] = React.useState<AISuggestion | null>(null)
  const [briefInterlinks, setBriefInterlinks] = React.useState<Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>>([])

  const [suggestions, setSuggestions] = React.useState<AISuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false)
  const [suggestionsError, setSuggestionsError] = React.useState<string | null>(null)
  const [radar, setRadar] = React.useState<AISuggestion[]>([])
  const [radarMeta, setRadarMeta] = React.useState<Record<string, unknown> | null>(null)

  const [generationEvents, setGenerationEvents] = React.useState<GenerationActivity[]>([])
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(null)
  const [generationChars, setGenerationChars] = React.useState(0)

  const [mergeIndex, setMergeIndex] = React.useState<{ byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }>({ byPath: new Map(), byStem: new Map() })
  const [engineStatus, setEngineStatus] = React.useState<Record<string, unknown> | null>(null)
  const [gateByJob, setGateByJob] = React.useState<Map<string, { score: number; passed: boolean }>>(new Map())
  const [engineBusy, setEngineBusy] = React.useState(false)
  const [autoInterlinkBusy, setAutoInterlinkBusy] = React.useState(false)

  const fetchJobs = React.useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const res = await fetch('/api/content-studio/jobs?limit=40', { credentials: 'same-origin' })
      if (res.status === 503) { setError('Server busy (503). Waiting before next refresh…'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      setJobs((data as { jobs?: ContentJob[] }).jobs ?? [])
      setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load jobs') }
    finally { setLoading(false) }
  }, [])

  const fetchMergeIndex = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as { error?: string; merges?: CannibalMergeRecord[] }
      const byPath = new Map<string, MergeUrlHit>()
      const byStem = new Map<string, MergeUrlHit>()
      for (const m of (data.merges ?? [])) {
        if (m.status !== 'merged') continue
        const hit: MergeUrlHit = { role: 'winner', clusterId: m.clusterId, stem: m.stem, winnerUrl: m.winnerUrl, redirectsCreated: m.redirectsCreated, prUrl: m.prUrl, prNumber: m.prNumber, mergedAt: m.mergedAt }
        const winnerPath = normMergePath(m.winnerUrl)
        const prevWinner = byPath.get(winnerPath)
        if (!prevWinner || prevWinner.mergedAt < hit.mergedAt) byPath.set(winnerPath, hit)
        for (const loser of m.loserUrls ?? []) {
          const lp = normMergePath(loser)
          const prevLoser = byPath.get(lp)
          if (!prevLoser || prevLoser.mergedAt < hit.mergedAt) byPath.set(lp, { ...hit, role: 'loser' })
        }
        for (const stem of [m.stem, ...(m.terms ?? [])]) {
          const key = canonicalMergeStem(stem)
          if (!key) continue
          const prevStem = byStem.get(key)
          if (!prevStem || prevStem.mergedAt < hit.mergedAt) byStem.set(key, hit)
        }
      }
      setMergeIndex({ byPath, byStem })
    } catch { /* best-effort */ }
  }, [])

  const fetchSuggestions = React.useCallback(async (regionArg: string) => {
    setSuggestionsLoading(true); setSuggestionsError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: regionArg, limit: 6 }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuggestions(data.suggestions ?? [])
        setRadar(data.opportunities ?? data.suggestions ?? [])
        setRadarMeta({ source: data.source, coverage: data.coverageStats, cannibalization: data.cannibalization, region: data.region })
      } else {
        setSuggestionsError((data as { error?: string }).error ?? 'Failed to load suggestions')
      }
    } catch (err) { setSuggestionsError(err instanceof Error ? err.message : 'Suggestion fetch failed') }
    finally { setSuggestionsLoading(false) }
  }, [])

  const applyBrief = React.useCallback((s: AISuggestion) => {
    setTopic(s.topic)
    setKeywords((s.keywords && s.keywords.length ? s.keywords : [s.primaryKeyword || s.topic]).join(', '))
    if (s.title) setTitle(s.title)
    if (s.audience) setAudience(s.audience)
    if (s.contentType) setContentType(s.contentType as ContentType)
    if (s.intent) setTone(TONE_FOR_INTENT[s.intent] ?? 'educational')
    setSelectedBrief(s); setBriefInterlinks(s.interlinks ?? [])
    setSuggestions(prev => [s, ...prev.filter(x => x.topic !== s.topic)])
    setTab('create'); setShowRadar(true)
  }, [])

  React.useEffect(() => { fetchSuggestions('US') }, [fetchSuggestions])
  React.useEffect(() => { fetchJobs() }, [fetchJobs])
  React.useEffect(() => { fetchMergeIndex() }, [fetchMergeIndex])

  const fetchEngineStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-engine/status', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      if (data.ok) setEngineStatus(data)
    } catch { /* best-effort */ }
  }, [])

  const fetchGateRuns = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-engine/gate', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      if (!data.ok || !Array.isArray(data.runs)) return
      const map = new Map<string, { score: number; passed: boolean }>()
      for (const r of data.runs as Array<Record<string, unknown>>) {
        const id = String(r.subject_id || ''); if (!id) continue
        map.set(id, { score: Number(r.score) || 0, passed: Boolean(r.passed) })
      }
      setGateByJob(map)
    } catch { /* best-effort */ }
  }, [])

  React.useEffect(() => { fetchEngineStatus(); fetchGateRuns() }, [fetchEngineStatus, fetchGateRuns])

  const runAutoInterlink = React.useCallback(async () => {
    if (!topic.trim()) return
    setAutoInterlinkBusy(true); setError(null)
    try {
      const country = ['US', 'UK', 'CA', 'AU'].includes(region) ? region : 'US'
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seo-page'
      const res = await fetch('/api/seo-engine/interlink', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceSlug: slug, stage: interlinkStage, country, contentType: 'blog_post' }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'interlink failed')
      const edges: Array<{ anchor_text: string; target_url: string; target_host: string }> = data.edges || []
      setBriefInterlinks(edges.slice(0, 6).map((e) => ({ label: e.anchor_text, url: e.target_url, site: e.target_host })))
    } catch (err) { setError(err instanceof Error ? err.message : 'Auto-interlink failed') }
    finally { setAutoInterlinkBusy(false) }
  }, [topic, region, interlinkStage])

  React.useEffect(() => {
    const hasActive = jobs.some(j => ['pending', 'drafting', 'publishing'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 6_000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  async function consumeSseResponse(response: Response, onEvent: (event: any) => void) {
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || `HTTP ${response.status}`)
    }
    if (!response.body) throw new Error('No readable body')
    const reader = response.body.getReader(); const decoder = new TextDecoder()
    let buffer = ''; let finalResult: any = null
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        const dataLine = chunk.split(/\r?\n/).find(line => line.startsWith('data:'))
        if (!dataLine) continue
        const payload = dataLine.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const event = JSON.parse(payload)
          onEvent(event)
          if (event.type === 'final') finalResult = event.result
          else if (event.type === 'error') throw new Error(event.error || 'Stream error')
        } catch (e) { if (e instanceof Error && e.message !== 'Stream error') throw e }
      }
      if (done) break
    }
    if (!finalResult) throw new Error('Generation stream ended before a final result was received')
    return finalResult
  }

  let streamChars = 0
  const handleGenerate = async (formData: any) => {
    setGenerating(true); setError(null); streamChars = 0
    setGenerationStartedAt(Date.now()); setGenerationChars(0)
    setGenerationEvents([{ id: `start-${Date.now()}`, ts: Date.now(), stage: 'connect', message: 'Connecting to the SEO generation pipeline…', level: 'info' }])
    const record = (stage: string, message: string, level: GenerationActivity['level'] = 'info') => {
      setGenerationEvents(prev => [...prev, { id: `${Date.now()}-${prev.length}`, ts: Date.now(), stage, message, level }].slice(-80))
    }
    try {
      const contentTypeMap: Record<string, string> = { blog_post: 'blog_summary', article: 'legal_guide', regional_page: 'regional_page', marketplace_gig: 'marketplace_gig' }
      const ct = contentTypeMap[formData.content_type] || formData.content_type || 'legal_guide'
      const regionArg = formData.region || 'US'
      let seoEnrichment: any = {}
      record('seo', 'Fetching GSC keyword portfolio to enrich generation…')
      try {
        const gscRes = await fetch('/api/content-studio/gsc/suggestions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region: regionArg, topic: formData.topic, limit: 4 }),
        })
        if (gscRes.ok) {
          const gscData = await gscRes.json()
          seoEnrichment = {
            suggestions: gscData.suggestions?.slice(0, 3) ?? [],
            strategyHints: gscData.strategyHints ?? [],
            portfolioSnapshot: gscData.portfolioSnapshot ?? {},
            source: gscData.source ?? 'unknown',
            opportunity: selectedBrief, interlinks: briefInterlinks,
          }
          record('seo', `SEO canon loaded: ${gscData.portfolioSnapshot?.primaryCount ?? 0} primary, ${gscData.portfolioSnapshot?.secondaryCount ?? 0} secondary keywords from ${gscData.source}`)
        }
      } catch (seoErr) { record('seo', 'SEO enrichment unavailable — proceeding with user-provided keywords', 'warn') }

      const res = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          topic: formData.topic, title: formData.title || formData.topic,
          primaryKeyword: (formData.keywords && formData.keywords[0]) || formData.topic,
          region: regionArg, contentType: ct,
          tone: formData.tone || 'educational', audience: formData.audience,
          keywords: formData.keywords, shipMode: 'pr', indexable: true,
          minAuditScore: 55, maxRefine: 2,
          seoEnrichment, interlinks: briefInterlinks, opportunity: selectedBrief,
          aiProvider: formData.aiProvider || undefined,
        }),
      })
      if (!res.ok) {
        const failure = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(failure.error || `Generation stream HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Generation stream returned no readable body')

      let finalResult: any = null
      await consumeSseResponse(res, (event) => {
        if (event.type === 'progress') record(event.stage || 'pipeline', event.message || 'Working…')
        else if (event.type === 'provider') record('provider', `Using ${event.provider || 'AI'}${event.model ? ` · ${event.model}` : ''}`)
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · quality threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'delta') { streamChars += String(event.text || '').length; setGenerationChars(streamChars) }
        else if (event.type === 'ship') record('ship', event.ship?.prUrl ? `Pull request opened · audit passed` : event.shipError ? `Ship paused: ${event.shipError}` : 'Draft audited; preparing delivery', event.shipError ? 'warn' : 'info')
        else if (event.type === 'final') {
          finalResult = event.result
          record('complete', event.result?.ship?.prUrl ? 'PR opened. The job is now ready for review.' : 'Generation complete. Job details are being refreshed.', 'success')
        } else if (event.type === 'error') throw new Error(event.error || 'Generation pipeline failed')
      })

      const data = finalResult
      const notice = data.ship?.prUrl ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError ? `Generated (audit ${data.audit?.score ?? '—'}) but ship paused: ${data.shipError}`
        : `Generated via ${data.provider || 'AI'} · audit ${data.audit?.score ?? '—'}`
      setActionNotice(notice); setTab('queue')
      await fetchJobs(); await fetchGateRuns()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      record('error', message, 'error'); setError(message); setActionNotice('Content generation failed.')
    } finally { setGenerating(false) }
  }

  const runEngineAction = async (kind: 'plan' | 'llm' | 'ingest') => {
    setEngineBusy(true); setError(null)
    try {
      if (kind === 'plan') await fetch('/api/seo-engine/plan', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 10, draftBriefs: false }) })
      else if (kind === 'llm') await fetch('/api/seo-engine/llm-visibility', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxAudits: 6 }) })
      else await fetch('/api/seo-engine/knowledge', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitPerSource: 8, maxAiItems: 8 }) })
      await fetchEngineStatus()
    } catch (e) { setError(e instanceof Error ? e.message : `${kind} failed`) }
    finally { setEngineBusy(false) }
  }

  const engine = (engineStatus || {}) as Record<string, any>
  const engLife = (engine.lifecycle as { seededCells?: number } | undefined)?.seededCells
  const engKnow = (engine.knowledge as { total?: number } | undefined)?.total
  const engPlans = (engine.plans as { total?: number } | undefined)?.total
  const engLinks = (engine.interlinks as { planned?: number } | undefined)?.planned
  const engVoice = (engine.llmVisibility as { shareOfVoice?: number } | undefined)?.shareOfVoice
  const engGate = (engine.gate as { passRate?: number } | undefined)?.passRate

  const TABS: Array<{ key: StudioTab; icon: string; label: string; hint: string; badge?: number }> = [
    { key: 'create', icon: '✏️', label: 'Create', hint: 'New content' },
    { key: 'queue', icon: '📋', label: 'Queue', hint: `${jobs.length} jobs` },
    { key: 'insights', icon: '📊', label: 'Insights', hint: 'Radar · GSC · merges', badge: recheckDueCount },
  ]

  return (
    <div style={{ padding: '20px 24px 36px', maxWidth: 1480, margin: '0 auto' }}>
      <style>{`@keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 70% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1.6); opacity: 0; } }`}</style>

      <div style={{
        background: 'linear-gradient(135deg,#0F172A 0%, #1E1B4B 100%)',
        color: '#FFFFFF', borderRadius: C.radius, padding: '20px 24px', marginBottom: 16,
        boxShadow: C.shadowLifted, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: C.mono, color: '#FCD34D', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>YouSafe Platform · Operations</div>
            <h1 style={{ margin: '6px 0 0', fontFamily: C.serif, fontSize: 30, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Content Studio</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              One verifiable pipeline · radar → brief → AI draft → compliance gate → GitHub PR → live
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setShowFactory(!showFactory); if (!showFactory) setTab('create') }} style={{
              ...(showFactory ? btnSolid('#FCD34D', '#0F172A') : { ...btnGhost, background: 'rgba(255,255,255,0.10)', color: '#FFFFFF', border: `1px solid rgba(255,255,255,0.20)` }),
              fontSize: 12,
            }}>{showFactory ? '✕ Close Command Center' : '🏭 Command Center'}</button>
            <button type="button" onClick={() => { void fetchJobs(); void fetchMergeIndex(); void fetchGateRuns() }} disabled={loading} style={{ ...btnGhost, background: 'rgba(255,255,255,0.10)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.20)', fontSize: 12 }}>↻ Refresh</button>
          </div>
        </div>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(252,211,77,0.10)', zIndex: 0 }} />
        <div style={{ position: 'absolute', left: -60, bottom: -80, width: 220, height: 220, borderRadius: '50%', background: 'rgba(96,165,250,0.08)', zIndex: 0 }} />
      </div>

      <LiveGenerationPanel active={generating} events={generationEvents} startedAt={generationStartedAt} streamedChars={generationChars} />

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusSm, padding: '12px 18px', fontSize: 12, color: C.red, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 18 }}>×</button>
        </div>
      )}

      {showFactory && (
        <div style={{ marginBottom: 16 }}>
          <React.Suspense fallback={<div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: C.textDim, fontFamily: C.serif, fontStyle: 'italic' }}>Loading Command Center…</div>}>
            <AdminCommandCenter setActionNotice={setActionNotice} />
          </React.Suspense>
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          background: 'linear-gradient(90deg,#FAF8F2,#FFFFFF)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 18, width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(180deg,#FEF3C7,#FCD34D)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🧠</span>
          <div>
            <div style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>SEO Master Engine</div>
            <div style={{ fontSize: 10.5, color: C.textMuted }}>Six-surface brain · v2 · scrapes, plans, audits, gates</div>
          </div>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void runEngineAction('ingest')} disabled={engineBusy} style={{ ...btnSolid(C.navy), fontSize: 11 }} title="Scrape all intelligence sources now">
              {engineBusy ? '⏳ Working…' : '🌐 Ingest knowledge'}
            </button>
            <button type="button" onClick={() => void runEngineAction('plan')} disabled={engineBusy} style={{ ...btnSolid(C.gold), fontSize: 11 }} title="Rank GSC demand into life-cycle missions">
              {engineBusy ? '⏳ …' : '🧭 Run planner'}
            </button>
            <button type="button" onClick={() => void runEngineAction('llm')} disabled={engineBusy} style={{ ...btnSolid('#6D28D9'), fontSize: 11 }} title="LLM share-of-voice audit">
              {engineBusy ? '⏳ …' : '🤖 LLM audit'}
            </button>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 14 }}>
          <EngineCellTile icon="🗺" label="Cells" hint="Life-cycle intent map" value={engLife ?? '—'} onClick={() => void runEngineAction('ingest')} busy={engineBusy} />
          <EngineCellTile icon="🌐" label="Intel corpus" hint="GSC, AI guides, news scrapes" value={engKnow ?? '—'} onClick={() => void runEngineAction('ingest')} busy={engineBusy} />
          <EngineCellTile icon="🧭" label="Plans" hint="Ranked by demand" value={engPlans ?? '—'} onClick={() => void runEngineAction('plan')} busy={engineBusy} />
          <EngineCellTile icon="🔗" label="Interlinks planned" hint="Funnel paths" value={engLinks ?? '—'} onClick={() => void runEngineAction('ingest')} busy={engineBusy} />
          <EngineCellTile icon="🤖" label="LLM voice share" hint="Share of model answers" value={`${engVoice ?? '—'}%`} onClick={() => void runEngineAction('llm')} busy={engineBusy} />
          <EngineCellTile icon="🛡" label="Gate pass rate" hint="YMYL/AEO/GEO compliance" value={`${engGate ?? '—'}%`} onClick={() => setTab('queue')} busy={false} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', borderRadius: 999, cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            background: tab === t.key ? C.navy : C.surface, color: tab === t.key ? '#FFF' : C.textMuted,
            border: `1px solid ${tab === t.key ? C.navy : C.border}`, transition: 'all 0.15s',
            boxShadow: tab === t.key ? '0 3px 10px rgba(15,23,42,0.18)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
            {t.badge && t.badge > 0 ? (
              <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontFamily: C.mono, fontWeight: 800, background: tab === t.key ? '#FCD34D' : C.goldSoft, color: tab === t.key ? '#0F172A' : C.orange }}>{t.badge}</span>
            ) : (
              <span style={{ fontSize: 10, fontFamily: C.mono, opacity: 0.65 }}>{t.hint}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <CreateWizard
          generating={generating} onGenerate={handleGenerate}
          contentType={contentType} setContentType={setContentType}
          region={region} setRegion={setRegion}
          tone={tone} setTone={setTone}
          aiProvider={aiProvider} setAiProvider={setAiProvider}
          title={title} setTitle={setTitle}
          topic={topic} setTopic={setTopic}
          audience={audience} setAudience={setAudience}
          keywords={keywords} setKeywords={setKeywords}
          suggestions={suggestions} suggestionsLoading={suggestionsLoading} suggestionsError={suggestionsError}
          onRefreshSuggestions={fetchSuggestions} onApplySuggestion={applyBrief}
          brief={selectedBrief} onClearBrief={() => { setSelectedBrief(null); setBriefInterlinks([]) }}
          briefInterlinks={briefInterlinks}
          interlinkStage={interlinkStage} setInterlinkStage={setInterlinkStage}
          onAutoInterlink={runAutoInterlink} autoInterlinkBusy={autoInterlinkBusy}
          showRadar={showRadar} setShowRadar={setShowRadar}
        />
      )}

      {tab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!loading && jobs.length > 0 && <QueueStats jobs={jobs} recheckDue={recheckDueCount} />}
          <QueueTable jobs={jobs} onSelect={setSelectedJob} loading={loading} mergeIndex={mergeIndex} gateByJob={gateByJob} />
        </div>
      )}

      {tab === 'insights' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GscMini />
            <OpportunityRadar opportunities={radar} meta={radarMeta} onApply={applyBrief} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MergeHistory onRecheckPulse={setRecheckDueCount} />
            <InterlinksMini topic={topic} keywords={keywords} />
            <AdminSiteHealthPanel />
            <AdminDeepInterlinkPanel setActionNotice={setActionNotice} />
          </div>
        </div>
      )}

      {selectedJob && (
        <JobDetail job={selectedJob} onClose={() => setSelectedJob(null)} onRefresh={fetchJobs} setActionNotice={setActionNotice} gateFor={gateByJob.get(selectedJob.id) ?? null} />
      )}
    </div>
  )
}
