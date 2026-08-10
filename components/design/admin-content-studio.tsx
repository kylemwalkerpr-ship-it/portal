'use client'
/**
 * CONTENT STUDIO — v3 rebuild
 *
 * One workspace, three dedicated surfaces. No guessing, no buried controls.
 *
 *   ✏️  Create   — numbered wizard: Target → Brief → Interlinks → Generate.
 *                  Autopilot cards pre-fill every field (always editable),
 *                  the engine link plan is one click, and there is exactly
 *                  one primary CTA: “Generate & Open PR”.
 *   📋  Queue    — every job in one searchable, filterable table with
 *                  status, compliance gate, SEO score and merge badges.
 *   📊  Insights — GSC overview, scored Opportunity Radar, merge history,
 *                  interlink suggestions, site health, deep interlinks.
 *
 * The SEO Master Engine strip on top keeps the six brain surfaces one
 * command away (ingest / plan / LLM audit) and every job's detail modal
 * enforces the compliance gate with dedicated action groups.
 */
import React from 'react'
import type { LeanRanking } from '@/lib/seoEngine/rankingModel'
import { RankingModelBlock } from './admin-ranking-model-block'
import { subscribeToTable } from '@/lib/supabaseRealtime'
import GscConnectModal from './admin-gsc-connect-modal'
import AdminDeepInterlinkPanel from './admin-deep-interlink-panel'
import AdminSiteHealthPanel from './admin-site-health-panel'
const AdminCommandCenter = React.lazy(() => import('./admin-command-center'))
import AdminInlineEditor from './admin-inline-editor'

// ── Color tokens (match admin-templates.tsx) ──
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
  radius: 12, radiusSm: 8, radiusXs: 6,
}

// ── Provider → default model (mirrors contentAiProvider defaults) ──
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.6-luna',
  custom: 'gpt-5.6-luna',
  grok: 'grok-3',
  deepseek: 'deepseek-chat',
  'nvidia-glm': 'z-ai/glm-5.2',
  'baseten-deepseek': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'nvidia-deepseek': 'deepseek-ai/deepseek-v4-pro',
  'cloudflare-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
}

// ── Types ──
// marketplace_gig intentionally excluded — studio never creates marketplace content.
// Marketplace pages are fed exclusively by service providers from their dashboard.
type ContentType = 'blog_post' | 'article' | 'regional_page'
type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'
type StudioTab = 'create' | 'queue' | 'insights'

interface ContentJob {
  id: string; title: string; topic: string; content_type: ContentType
  tone: Tone; region: Region; target_repo: string; status: JobStatus
  source_job_id: string | null
  regeneration_reason?: string | null
  regeneration_mode?: string | null
  lineage?: Record<string, unknown> | null
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
  source: 'live' | 'snapshot' | null
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
  contentType?: 'blog_post' | 'article' | 'regional_page'
  intentCategory: string
  profitability: 'high' | 'medium' | 'low'
  reason: string
  signals: string[]
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  coverage?: { matched: boolean; matches: string[] }
  sourcePage?: string
  /** Lean ranking-model view (total · confidence · recommendedActions · forecast) — attached by the suggestions API. */
  ranking?: LeanRanking
}

// ── Options ──
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

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; ext: string; repo: string; icon: string; hint: string }[] = [
  { value: 'blog_post', label: 'Blog Post', ext: '.md', repo: 'caseworks', icon: '📝', hint: 'Short-form thought leadership' },
  { value: 'article', label: 'Long-Form Article', ext: '.mdx', repo: 'caseworks', icon: '📄', hint: 'Deep legal guides & explainers' },
  { value: 'regional_page', label: 'Regional Page', ext: '.mdx', repo: 'yousafe-consultancy', icon: '🌐', hint: 'Country / city landing pages' },
  // marketplace_gig removed — studio ships to caseworks + yousafe-consultancy only
]

const LIFE_CYCLE_STAGES: { value: string; label: string; hint: string }[] = [
  { value: 'intent', label: 'Intent to move', hint: 'exploring countries and options' },
  { value: 'schools', label: 'Schools & study', hint: 'education and student pathways' },
  { value: 'work', label: 'Work', hint: 'jobs, permits and professional routes' },
  { value: 'housing', label: 'Housing', hint: 'renting, buying and settling in' },
  { value: 'visa', label: 'Visa & legal', hint: 'applications, status and compliance' },
  { value: 'settlement', label: 'Settlement', hint: 'arrival, services and integration' },
  { value: 'citizenship', label: 'PR & citizenship', hint: 'permanent residence and naturalization' },
  { value: 'family', label: 'Family', hint: 'marriage, children and dependants' },
  { value: 'relatives', label: 'Relatives', hint: 'bringing parents and extended family' },
]

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
const AI_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto (Grok → OpenAI → rest)' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'openai', label: 'OpenAI (GPT-5.6 Luna)' },
  { value: 'nvidia-glm', label: 'NVIDIA GLM 5.2 (z-ai/glm-5.2 · preferred)' },
  { value: 'baseten-deepseek', label: 'DeepSeek V4 Flash · Baseten (preferred)' },
  { value: 'nvidia-deepseek', label: 'NVIDIA DeepSeek' },
  { value: 'cloudflare-ai', label: 'Cloudflare Workers AI' },
  { value: 'groq', label: 'Groq (Llama)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
]

// ── Helpers ──
function fmtN(n: number | undefined | null): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}
function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s}s`
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
function timeAgoMs(ts: number): string {
  try { return timeAgo(new Date(ts).toISOString()) } catch { return '' }
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
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}
    </span>
  )
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }} title={steps.map(s => s.label).join(' → ')}>
      {steps.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx
        const color = done ? C.green : active ? C.gold : C.textDim
        const bg = done ? C.green : active ? C.gold : 'transparent'
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ width: 12, height: 1, background: done ? C.green : C.border, flexShrink: 0 }} />}
            <span style={{
              width: 8, height: 8, borderRadius: 999, flexShrink: 0,
              background: active ? bg : 'transparent', border: `2px solid ${color}`,
            }} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

function gateBadge(score: number | null | undefined, passed: boolean | null | undefined) {
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

// ── Cannibalization merge records (shared with Command Center) ──
interface CannibalMergeRecord {
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

interface MergeUrlHit {
  role: 'winner' | 'loser'
  clusterId: string
  stem: string
  winnerUrl: string
  redirectsCreated: number
  prUrl?: string
  prNumber?: number
  mergedAt: number
}

function normMergePath(u: string): string {
  try {
    const p = new URL(u)
    let path = p.pathname
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
    if (path.endsWith('/index.html')) path = path.slice(0, -'/index.html'.length)
    return (path || '/').toLowerCase()
  } catch {
    return u.trim().toLowerCase()
  }
}
function canonicalMergeStem(q: string): string {
  return q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 4).join(' ')
}
function jobWebPath(j: ContentJob): string {
  if (!j.slug) return ''
  const slug = j.slug.replace(/^\/+|\/+$/g, '')
  return slug ? `/${slug.toLowerCase()}` : ''
}

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

/** Consume the SEO Factory SSE contract and return its final result. */
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

// ── Section header — used by every card ──
function CardHeader({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: React.ReactNode }) {
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

// ── Live generation activity ──
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
  active, events, startedAt, streamedChars, completedJob, mergeBusy, onOpenReview, onPushToMerge,
}: {
  active: boolean
  events: GenerationActivity[]
  startedAt: number | null
  streamedChars: number
  completedJob?: ContentJob | null
  mergeBusy?: boolean
  onOpenReview?: () => void
  onPushToMerge?: () => void
}) {
  if (!active && events.length === 0) return null
  const latest = events[events.length - 1]
  const elapsed = startedAt ? fmtDur(Date.now() - startedAt) : ''
  const levelColor = latest?.level === 'error' ? C.red : latest?.level === 'warn' ? C.orange : latest?.level === 'success' ? C.green : C.blue
  return (
    <div style={{ marginBottom: 14, background: C.navy, color: '#FFF', borderRadius: C.radius, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.14)' }}>
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
      {!active && completedJob && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.12)', background: completedJob.status === 'merged' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: completedJob.status === 'merged' ? '#A7F3D0' : '#BFDBFE' }}>
              {completedJob.status === 'merged' ? '✓ This PR is merged into main' : completedJob.pr_number ? `PR #${completedJob.pr_number} is ready for your decision` : 'Draft saved — review the job before delivery'}
            </div>
            <div style={{ marginTop: 3, fontSize: 9.5, color: 'rgba(255,255,255,0.62)', fontFamily: C.mono }}>
              {completedJob.pr_number ? 'Review the audit, then push the approved PR to main.' : 'The job has not exposed a mergeable PR yet.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {onOpenReview && <button type="button" onClick={onOpenReview} style={{ padding: '8px 11px', borderRadius: C.radiusXs, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.1)', color: '#FFF', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit' }}>Open review</button>}
            {completedJob.status !== 'merged' && completedJob.pr_number && onPushToMerge && <button type="button" onClick={onPushToMerge} disabled={mergeBusy} style={{ padding: '8px 12px', borderRadius: C.radiusXs, border: 'none', background: mergeBusy ? '#6B7280' : '#34D399', color: '#052E16', cursor: mergeBusy ? 'not-allowed' : 'pointer', fontSize: 10.5, fontWeight: 800, fontFamily: 'inherit', opacity: mergeBusy ? 0.7 : 1 }}>{mergeBusy ? '⏳ Pushing…' : '🚀 Push to merge'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Autopilot radar card (used inside the Create wizard) ──
function RadarCard({ s, active, onApply }: { s: AISuggestion; active: boolean; onApply: (s: AISuggestion) => void }) {
  const pm = PLAY_META[s.play] || PLAY_META.content_gap
  const score = s.opportunityScore ?? s.demandScore
  const tm = TREND_META[s.trend || 'flat'] || TREND_META.flat
  return (
    <button
      type="button"
      onClick={() => onApply(s)}
      style={{
        minWidth: 232, maxWidth: 260, flexShrink: 0, textAlign: 'left', padding: '10px 12px', borderRadius: C.radiusSm,
        border: active ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
        background: active ? '#FEF9EC' : C.surface, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s', boxShadow: C.shadowCard,
      }}
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
    </button>
  )
}

// ── CREATE TAB ──
// Numbered wizard: 1 Target → 2 Brief → 3 Interlinks → Generate.
// Props carry all state up so the parent can run generation.
function CreateWizard({
  generating,
  onGenerate,
  contentType, setContentType,
  region, setRegion,
  tone, setTone,
  aiProvider, setAiProvider,
  title, setTitle,
  topic, setTopic,
  audience, setAudience,
  keywords, setKeywords,
  suggestions, suggestionsLoading, suggestionsError, radarMeta, gscStatus, onConnectGsc,
  onRefreshSuggestions,
  onApplySuggestion,
  brief, onClearBrief,
  briefInterlinks, interlinkStage, setInterlinkStage, onAutoInterlink, autoInterlinkBusy,
  showRadar, setShowRadar,
  regenerationPlays, setRegenerationPlays,
  regenerationMinScore, setRegenerationMinScore,
  regenerationMaxDifficulty, setRegenerationMaxDifficulty,
}: {
  generating: boolean
  onGenerate: (data: any) => void
  contentType: ContentType; setContentType: (v: ContentType) => void
  region: Region; setRegion: (v: Region) => void
  tone: Tone; setTone: (v: Tone) => void
  aiProvider: string; setAiProvider: (v: string) => void
  title: string; setTitle: (v: string) => void
  topic: string; setTopic: (v: string) => void
  audience: string; setAudience: (v: string) => void
  keywords: string; setKeywords: (v: string) => void
  suggestions?: AISuggestion[]
  suggestionsLoading?: boolean
  suggestionsError?: string | null
  radarMeta?: Record<string, unknown> | null
  gscStatus?: Record<string, unknown> | null
  onConnectGsc?: () => void
  onRefreshSuggestions?: (region: string) => void
  onApplySuggestion?: (s: AISuggestion) => void
  brief?: AISuggestion | null
  onClearBrief?: () => void
  briefInterlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  interlinkStage: string; setInterlinkStage: (v: string) => void
  onAutoInterlink?: () => void
  autoInterlinkBusy?: boolean
  showRadar: boolean
  setShowRadar: (v: boolean) => void
  regenerationPlays: string[]
  setRegenerationPlays: (v: string[]) => void
  regenerationMinScore: number
  setRegenerationMinScore: (v: number) => void
  regenerationMaxDifficulty: number
  setRegenerationMaxDifficulty: (v: number) => void
}) {
  const [filter, setFilter] = React.useState<'all' | 'quick_win' | 'content_gap' | 'rising' | 'refresh'>('all')
  const canGenerate = Boolean(topic.trim() || title.trim())

  const visibleSuggestions = React.useMemo(() => {
    if (!suggestions) return suggestions
    if (filter === 'all') return suggestions
    return suggestions.filter((s) => {
      const configuredPlay = regenerationPlays.length === 0 || regenerationPlays.includes(s.play)
      const scoreOk = (s.opportunityScore ?? 0) >= regenerationMinScore
      const difficultyOk = (s.difficultyScore ?? 100) <= regenerationMaxDifficulty
      const filterOk = filter === 'rising' ? s.trend === 'rising'
        : filter === 'quick_win' ? s.play === 'quick_win'
        : filter === 'content_gap' ? s.play === 'content_gap'
        : filter === 'refresh' ? (s.play === 'refresh' || s.play === 'defend')
        : true
      return configuredPlay && scoreOk && difficultyOk && s.play !== 'cannibalization' && filterOk
    })
  }, [suggestions, filter, regenerationPlays, regenerationMinScore, regenerationMaxDifficulty])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canGenerate) return
    onGenerate({
      content_type: contentType, region, tone,
      title: title.trim() || topic.trim(), topic: topic.trim(),
      audience: audience.trim(),
      keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
      aiProvider,
      interlinks: briefInterlinks ?? [],
      opportunity: brief,
      intelligenceLineage: brief ? {
        modelVersion: 'seo-intelligence-v1',
        topic: brief.topic,
        play: brief.play,
        opportunityScore: brief.opportunityScore,
        signals: brief.signals,
        sourcePage: brief.sourcePage,
      } : null,
    })
  }

  const stepLabel = (n: number, label: string, done: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <span style={{
        width: 18, height: 18, borderRadius: 999, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: done ? C.green : C.navy, color: '#FFF',
        fontSize: 9, fontWeight: 800, fontFamily: C.mono,
      }}>
        {done ? '✓' : n}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: C.serif }}>{label}</span>
    </div>
  )

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="✏️" title="Create content"
        sub="Four numbered steps. Every field is editable — the radar and engine only pre-fill."
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

      {/* ── STEP 0 · Autopilot radar (optional) ── */}
      {showRadar && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: '#FCFAF6' }}>
          {/* Data-source truthfulness: never let snapshot suggestions look live */}
          {(radarMeta?.source || suggestionsLoading) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textDim }}>Autopilot radar</span>
              {radarMeta?.source && (
                (() => {
                  const src = String(radarMeta?.source ?? '')
                  const snapAt = (radarMeta?.snapshot as { generatedAt?: string } | null)?.generatedAt
                  const snapLabel = snapAt && src === 'snapshot'
                    ? ` · ${new Date(snapAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : ''
                  const mode = gscStatus?.mode === 'oauth' ? 'OAUTH' : gscStatus?.mode === 'service_account' ? 'SERVICE_ACCOUNT' : null
                  return (
                    <span title={src === 'live' ? `Scored from live Search Console data (${mode || 'mode unknown'})` : 'Scored from the committed snapshot — connect GSC for live demand'} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: src === 'live' ? C.greenSoft : '#FFFBEB', color: src === 'live' ? C.green : '#92400E' }}>
                      {src === 'live' ? `● LIVE GSC${mode ? ` · ${mode}` : ''}` : `◐ SNAPSHOT${snapLabel}`}
                    </span>
                  )
                })()
              )}
              {suggestionsLoading && <span style={{ fontSize: 9, fontFamily: C.mono, color: C.textDim }}>scanning…</span>}
            </div>
          )}
          {/* GSC live probe + connect CTA — snapshot-vs-live is obvious here too */}
          {gscStatus && !(gscStatus.connected && gscStatus.live) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 10.5, fontFamily: C.mono, color: gscStatus.connected ? C.red : '#92400E', flexWrap: 'wrap' }}>
              <span>
                {gscStatus.connected
                  ? `◐ TOKEN FAILURE — ${String(gscStatus.error || 'refresh failed')}${gscStatus.mode === 'oauth' ? ' (OAUTH)' : gscStatus.mode === 'service_account' ? ' (SERVICE_ACCOUNT)' : ''}`
                  : '◐ GSC not connected — these scores are snapshot-based'}
              </span>
              <button type="button" onClick={onConnectGsc} style={{ padding: '2px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#F59E0B', color: '#fff', fontSize: 9.5, fontWeight: 800 }}>
                {gscStatus.connected ? 'Re-connect →' : 'Connect GSC →'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {RADAR_FILTERS.map((f) => (

              <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{
                padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                fontFamily: C.mono, background: filter === f.key ? C.navy : C.surface2, color: filter === f.key ? '#FFF' : C.textMuted,
              }}>
                {f.label}
              </button>
            ))}
          </div>
          {suggestionsLoading ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ minWidth: 220, height: 108, borderRadius: 8, background: C.surface3, opacity: 0.5, flexShrink: 0 }} />
              ))}
            </div>
          ) : (visibleSuggestions && visibleSuggestions.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollBehavior: 'smooth' }}>
              {visibleSuggestions.map((s) => (
                <RadarCard key={s.topic} s={s} active={Boolean(brief && brief.topic === s.topic)} onApply={(x) => onApplySuggestion?.(x)} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '10px 0', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
              No opportunities for this filter — rescan or switch filter.
            </div>
          ))}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono }}>Regeneration filters</span>
            {(['content_gap', 'quick_win', 'refresh'] as const).map((play) => {
              const active = regenerationPlays.includes(play)
              return <button key={play} type="button" onClick={() => setRegenerationPlays(active ? regenerationPlays.filter((p) => p !== play) : [...regenerationPlays, play])} style={{ padding: '3px 7px', borderRadius: 999, border: `1px solid ${active ? C.blue : C.border}`, background: active ? C.blueSoft : C.surface, color: active ? C.blue : C.textDim, cursor: 'pointer', fontSize: 8.5, fontFamily: C.mono }}>{play.replace('_', ' ')}</button>
            })}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: C.textDim, fontFamily: C.mono }}>
              score ≥ {regenerationMinScore}
              <input type="range" min={0} max={90} step={5} value={regenerationMinScore} onChange={(e) => setRegenerationMinScore(Number(e.target.value))} />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: C.textDim, fontFamily: C.mono }}>
              difficulty ≤ {regenerationMaxDifficulty}
              <input type="range" min={20} max={100} step={5} value={regenerationMaxDifficulty} onChange={(e) => setRegenerationMaxDifficulty(Number(e.target.value))} />
            </label>
            <span style={{ fontSize: 8.5, color: C.green, fontFamily: C.mono }}>cannibalized terms excluded</span>
          </div>
          {suggestionsError && (
            <div style={{ margin: '4px 0 0', fontSize: 10, color: C.orange, fontFamily: C.mono }}>⚠ {suggestionsError}</div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '16px 18px 18px' }}>
        {/* ── STEP 1 · Target ── */}
        {stepLabel(1, 'Pick the target — where should this live?', Boolean(contentType))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginBottom: 12 }}>
          {CONTENT_TYPE_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setContentType(opt.value)} style={{
              textAlign: 'left', padding: '9px 11px', borderRadius: C.radiusXs,
              border: contentType === opt.value ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
              background: contentType === opt.value ? C.surface2 : C.surface,
              cursor: 'pointer', fontSize: 11, color: C.text, fontFamily: 'inherit',
            }}>
              <span style={{ marginRight: 4 }}>{opt.icon}</span>
              <span style={{ fontWeight: 700 }}>{opt.label}</span>
              <span style={{ display: 'block', fontSize: 9, color: C.textDim, marginTop: 2 }}>{opt.ext} → {opt.repo} · {opt.hint}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
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

        {/* ── STEP 2 · Brief ── */}
        {stepLabel(2, 'Shape the brief — what should the AI write?', Boolean(topic.trim() || title.trim()))}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Title <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none' }}>(optional — autopilot suggests one)</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. F-1 OPT Application: Complete 2026 Timeline" maxLength={120} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Topic <span style={{ color: C.red }}>*</span></label>
          <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={3} required={!title.trim()} style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Describe what to write — visa types, forms, timelines, comparison angles..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Audience</label>
            <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="international students, H-1B holders..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Keywords (comma-separated)</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="F-1 visa, OPT timeline, I-765..." style={inputStyle} />
          </div>
        </div>

        {/* Autopilot brief preview */}
        {brief && (
          <div style={{ marginBottom: 14, border: '1px solid #F0D9A8', background: '#FEF9EC', borderRadius: C.radiusSm, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.gold, textTransform: 'uppercase', fontFamily: C.mono }}>
                🧭 Autopilot brief — every field pre-filled & editable
              </span>
              <button type="button" onClick={onClearBrief} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: C.textDim, fontFamily: 'inherit' }}>
                ✕ Clear brief
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{brief.primaryKeyword || brief.topic}</span>
              <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono, background: (PLAY_META[brief.play] || {}).bg || C.surface3, color: (PLAY_META[brief.play] || {}).fg || C.textMuted }}>
                {(brief.play || 'content_gap').replace('_', ' ')} · {brief.opportunityScore ?? brief.demandScore}/100
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
            {/* Ranking model block (score · recommended actions · forecast) — same brain as the command-center launch composer */}
            {brief.ranking && (
              <div style={{ marginBottom: 8 }}>
                <RankingModelBlock ranking={brief.ranking} />
              </div>
            )}
            <p style={{ margin: 0, fontSize: 9.5, color: C.gold, fontFamily: C.mono }}>
              Opportunity signals + interlinks will be sent to the generator. Review the fields above, then generate.
            </p>
          </div>
        )}

        {/* ── STEP 3 · Interlinks ── */}
        {stepLabel(3, 'Wire the internal links — who links to whom, and why', Boolean(briefInterlinks && briefInterlinks.length > 0))}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 360px) 1fr', gap: 10, alignItems: 'end', marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Life-cycle stage for this link plan</label>
            <select
              value={interlinkStage}
              onChange={e => setInterlinkStage(e.target.value)}
              style={inputStyle}
              title="Choose the immigrant journey stage whose neighboring pages should be linked"
            >
              {LIFE_CYCLE_STAGES.map(stage => (
                <option key={stage.value} value={stage.value}>{stage.label} — {stage.hint}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.45 }}>
            The engine will use this stage to choose journey neighbors, marketplace paths, and cross-country targets. Change it before generating a new plan.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <button type="button" onClick={onAutoInterlink} disabled={autoInterlinkBusy || !topic.trim()}
            title="Generate a scored internal-link plan from the SEO Master Engine (journey neighbors, marketplace CTA, cross-country)"
            style={autoInterlinkBusy || !topic.trim() ? { ...btnSolid('#1E1B4B'), opacity: 0.55, cursor: 'not-allowed' } : { ...btnSolid('#1E1B4B') }}>
            {autoInterlinkBusy ? '⏳ Generating…' : '⚡ Generate link plan'}
          </button>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
            {briefInterlinks && briefInterlinks.length > 0
              ? `${briefInterlinks.length} links ready — they will be injected into the draft`
              : 'no links yet — generate from the engine or leave empty'}
          </span>
        </div>
        {briefInterlinks && briefInterlinks.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
            {briefInterlinks.slice(0, 8).map((l, li) => (
              <span key={li} title={String(l.url || '')} style={{ padding: '3px 8px', borderRadius: 4, background: C.blueSoft, border: `1px solid ${C.border}`, fontSize: 9, color: C.text, fontFamily: C.mono }}>
                🔗 {l.label} → {String(l.url || '').replace(/^https?:\/\//, '').slice(0, 42)}
              </span>
            ))}
          </div>
        )}

        {/* ── Primary CTA ── */}
        <button type="submit" disabled={generating || !canGenerate} style={{
          width: '100%', marginTop: 16, padding: '12px 0', borderRadius: C.radiusXs, border: 'none',
          cursor: generating || !canGenerate ? 'not-allowed' : 'pointer',
          background: generating ? C.textDim : C.navy, color: '#FFFFFF',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: generating || !canGenerate ? 0.6 : 1,
          boxShadow: '0 4px 14px rgba(15,23,42,0.18)',
        }}>
          {generating ? '⚡ Generating… (watch the live pipeline below)' : '⚡ Generate & Open PR'}
        </button>
        {!canGenerate && (
          <div style={{ marginTop: 6, fontSize: 9.5, color: C.textDim, textAlign: 'center', fontFamily: C.mono }}>
            Add a topic or title to enable generation.
          </div>
        )}
      </form>
    </div>
  )
}

// ── QUEUE TAB ──
const QUEUE_FILTERS: Array<{ key: 'all' | 'active' | 'pr_created' | 'merged' | 'failed'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'pr_created', label: 'PR ready' },
  { key: 'merged', label: 'Merged' },
  { key: 'failed', label: 'Failed' },
]

type QueueSummary = {
  total?: number
  [status: string]: number | undefined
}

function QueueStats({ jobs, total: totalOverride, summary }: {
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

function QueueTable({ jobs, total, summary, onSelect, loading, mergeIndex, gateByJob, focusJobId, onLoadMore }: {
  jobs: ContentJob[]
  total?: number
  summary?: QueueSummary | null
  onSelect: (j: ContentJob) => void
  loading: boolean
  mergeIndex: { byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }
  gateByJob?: Map<string, { score: number; passed: boolean }>
  focusJobId?: string | null
  onLoadMore?: () => void
}) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'pr_created' | 'merged' | 'failed'>('all')
  const [search, setSearch] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)

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
      <div style={{ overflowX: 'auto', marginTop: 6 }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: C.textDim }}>Loading jobs…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>📭</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              {jobs.length === 0 ? 'No jobs yet — head to the Create tab and launch your first piece.' : 'No jobs match this filter / search.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
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
                return (
                  <tr key={j.id} onClick={() => onSelect(j)} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border2}`, transition: 'background 0.12s', background: j.id === focusJobId ? '#EFF6FF' : 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = j.id === focusJobId ? '#EFF6FF' : 'transparent' }}>
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
      {filtered.length > 12 && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setShowAll(!showAll)} style={btnGhost}>
            {showAll ? '▲ Show fewer' : `▼ Show all ${filtered.length} matching`}
          </button>
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

// ── INSIGHTS TAB pieces ──
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
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🎯" title="Opportunity Radar"
        sub={`${source}${coverage ? ` · ${coverage.total ?? 0} known pages · ${coverage.gaps ?? 0} gaps` : ''}`}
        right={
          <button type="button" onClick={() => setExpanded(!expanded)} style={btnGhost}>
            {expanded ? '▲ Collapse' : '▼ Expand'}
          </button>
        }
      />
      {list.map((o, i) => {
        const pm = PLAY_META[o.play] || PLAY_META.content_gap
        const score = o.opportunityScore ?? o.demandScore
        return (
          <div key={`${o.topic}-${i}`} style={{ padding: '9px 16px', borderBottom: i < list.length - 1 ? `1px solid ${C.border2}` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 34, fontSize: 12, fontWeight: 800, fontFamily: C.mono, color: score >= 70 ? C.green : score >= 45 ? C.orange : C.textDim }}>{score}</span>
            <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono, background: pm.bg, color: pm.fg, whiteSpace: 'nowrap' }}>{pm.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
              <div style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {o.signals && o.signals[0] ? o.signals[0] : o.reason}
              </div>
            </div>
            <button type="button" onClick={() => onApply(o)} style={btnSolid(C.navy)}>✏️ Brief</button>
          </div>
        )
      })}
      {(!list || list.length === 0) && (
        <div style={{ padding: '16px', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
          No scored opportunities yet — rescan from the Create tab.
        </div>
      )}
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

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🔗" title="Interlink suggestions"
        sub="caseworks → regional → marketplace funnel"
        right={
          <button type="button" onClick={fetchLinks} disabled={loading} style={btnSolid(C.navy)}>
            {loading ? 'Searching…' : fetched ? 'Refresh' : 'Find'}
          </button>
        }
      />
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
      {!fetched && (
        <div style={{ padding: '12px 16px', fontSize: 10.5, color: C.textDim, fontFamily: C.mono }}>
          Enter a topic in the Create tab, then hit “Find”.
        </div>
      )}
    </div>
  )
}

// ── Merge History (shared with Command Center) ──
function MergeHistory() {
  const [merges, setMerges] = React.useState<CannibalMergeRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [guidance, setGuidance] = React.useState<string | null>(null)

  const fetchMerges = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setGuidance(null)
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; guidance?: string; merges?: CannibalMergeRecord[] }
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        setGuidance(data.guidance ?? null)
        return
      }
      setMerges(data.merges ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merge history')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { fetchMerges() }, [fetchMerges])

  const mergedCount = merges.filter(m => m.status === 'merged').length

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
      <CardHeader
        icon="🔀" title="Merge history"
        sub="Every consolidation decision, from the portal and the Command Center."
        right={
          <button type="button" onClick={fetchMerges} disabled={loading} style={btnGhost}>
            {loading ? '…' : '↻'}
          </button>
        }
      />
      {loading ? (
        <div style={{ padding: 18, textAlign: 'center', fontSize: 11, color: C.textDim }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: C.orange, fontFamily: C.mono }}>⚠ {error}</div>
          {guidance && <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, marginTop: 4 }}>{guidance}</div>}
        </div>
      ) : merges.length === 0 ? (
        <div style={{ padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>🔀</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>No merge decisions yet — resolved clusters will appear here.</div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, padding: '6px 16px 8px', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{merges.length} decisions</span>
            <span style={{ fontSize: 9, color: C.green, fontFamily: C.mono }}>{mergedCount} merged</span>
            <span style={{ fontSize: 9, color: C.orange, fontFamily: C.mono }}>{merges.length - mergedCount} skipped</span>
            <span style={{ fontSize: 9, color: C.purple, fontFamily: C.mono }}>
              {merges.filter(m => m.source === 'command_center').length} from Command Center
            </span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {merges.map(m => (
              <div key={`${m.clusterId}-${m.source}`} style={{ padding: '9px 16px', borderBottom: `1px solid ${C.border2}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: C.mono,
                    background: m.status === 'merged' ? '#D1FAE5' : '#FEF3C7', color: m.status === 'merged' ? C.green : C.orange,
                  }}>
                    {m.status === 'merged' ? '✓ MERGED' : '⏭ SKIPPED'}
                  </span>
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 600, fontFamily: C.mono,
                    background: m.source === 'command_center' ? '#DBEAFE' : '#F3E8FF', color: m.source === 'command_center' ? C.blue : C.purple,
                  }}>
                    {m.source === 'command_center' ? 'COMMAND CENTER' : 'PORTAL'}
                  </span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{timeAgoMs(m.mergedAt)}</span>
                  {m.prNumber ? (
                    <a href={m.prUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontSize: 9, fontWeight: 700, fontFamily: C.mono }}>
                      PR #{m.prNumber} ↗
                    </a>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                  {m.terms && m.terms.length ? m.terms.slice(0, 3).join(', ') : m.stem}
                </div>
                <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.loserUrls.length} loser{m.loserUrls.length === 1 ? '' : 's'} → {String(m.winnerUrl || '').replace(/^https?:\/\//, '')} · {m.redirectsCreated} redirect{m.redirectsCreated === 1 ? '' : 's'}
                </div>
                {m.message && <div style={{ fontSize: 9.5, color: C.textMuted, marginTop: 3 }}>{m.message}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Job Timeline ──
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
        const lineage = Array.isArray((data as { lineage?: unknown[] }).lineage) ? (data as { lineage: any[] }).lineage : []

        const derived: TimelineEntry[] = []
        const pushStage = (ts: unknown, source: string, message: string, detail?: string, level: LogLevel = 'success') => {
          const ms = typeof ts === 'number' ? ts : ts ? new Date(String(ts)).getTime() : NaN
          if (Number.isFinite(ms)) derived.push({ ts: ms, level, source, message, detail, kind: 'stage' })
        }
        for (const node of lineage) {
          pushStage(node.created_at, 'lineage', `${node.regeneration_mode ? `${node.regeneration_mode} · ` : ''}${node.status || 'job'}: ${node.title || node.topic || node.id}`, node.regeneration_reason || undefined, node.status === 'failed' ? 'error' : 'info')
          if (node.lineage?.evidence) pushStage(node.created_at, 'evidence', `Evidence snapshot attached · ${node.lineage.modelVersion || 'model'}`, JSON.stringify(node.lineage.evidence).slice(0, 600), 'info')
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
            {!isLast && <span style={{ position: 'absolute', left: -14, top: 16, bottom: -4, width: 2, background: C.border }} />}
            <span style={{
              position: 'absolute', left: -19, top: 2, width: 12, height: 12, borderRadius: 999,
              background: color, color: '#FFF', fontSize: 8, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{LEVEL_ICON[e.level] ?? ''}</span>
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
                  <summary style={{ fontSize: 9, color: C.textDim, cursor: 'pointer', fontFamily: C.mono }}>detail</summary>
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

// ── JOB DETAIL MODAL ──
function JobDetail({
  job, onClose, onRefresh, setActionNotice, gateFor, onReplacementJob,
}: {
  job: ContentJob
  onClose: () => void
  onRefresh: () => Promise<void> | void
  setActionNotice: (msg: string) => void
  onReplacementJob?: (jobId: string) => void
  gateFor?: { score: number; passed: boolean } | null
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
    // Cloudflare maxDuration is 300s; abort 10s before so we get a clean
    // error instead of a 503 HTML page that breaks the JSON parser.
    const timeout = setTimeout(() => controller.abort(), 290_000)
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
          maxRefine: 3,
          supersedesJobId: detail.id,
          regenerationMode: resume ? 'resume' : 'refresh',
          regenerationReason: resume ? 'Continue saved checkpoint after interrupted generation' : 'Refresh from current quality gate and evidence signals',
          intelligenceLineage: detail.lineage || null,
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
      if (replacementId) onReplacementJob?.(String(replacementId))
      await loadDetail()
      await onRefresh()
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      const rawMessage = error instanceof Error ? error.message : 'Regeneration failed'
      const resumable = timedOut || streamedChars > 0

      // Surface the real error: the user needs to know WHAT stopped the stream,
      // not just that it stopped. A Cloudflare CPU timeout needs a different
      // action than an AI provider error.
      const cause = timedOut
        ? 'Request timed out after 5 minutes (Cloudflare Worker CPU budget or AI response time).'
        : rawMessage.includes('Generation stream ended')
          ? 'The pipeline completed without a final result — the checkpointed draft may be complete.'
          : rawMessage

      const message = resumable
        ? `${cause} The latest partial draft was checkpointed — continue from the saved draft instead of starting over.`
        : cause

      record('error', message, 'error')
      setResumeAvailable(resumable)
      setActionError(message)
      setActionNotice(resumable ? 'Partial draft saved. Continue when ready.' : 'Regeneration did not complete.')

      // Auto-resume: on timeout with streamed content, don't make the
      // operator click a button — the checkpoint is reliable, just continue.
      if (timedOut && streamedChars > 0) {
        record('info', 'Auto-resuming from the saved checkpoint…', 'info')
        clearTimeout(timeout)
        actionAbortRef.current = null
        setActiveAction(null)
        setBusy(false)
        await runRegenerateStream(true)
        return
      }

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
  const gateScore = gateFor?.score
  const gatePassed = gateFor?.passed

  const actionBtn = (label: string, opts: { bg?: string; fg?: string; border?: string; disabled?: boolean; onClick: () => void; title?: string }) => (
    <button type="button" disabled={opts.disabled} onClick={opts.onClick} title={opts.title} style={{
      padding: '8px 12px', borderRadius: C.radiusXs, cursor: opts.disabled ? 'not-allowed' : 'pointer',
      fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: opts.disabled ? 0.5 : 1,
      background: opts.bg || C.surface, color: opts.fg || C.text,
      border: opts.border ? `1px solid ${opts.border}` : `1px solid ${C.border}`,
    }}>
      {label}
    </button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: C.radius, border: `1px solid ${C.border}`, maxWidth: 840, width: '92vw', maxHeight: '92vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 18, color: C.text }}>{detail.title || '(untitled)'}</h3>
            <div style={{ marginTop: 7, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              {statusBadge(detail.status)} {statusStepper(detail.status)}
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{detail.region} · {detail.content_type?.replace('_', ' ')}</span>
              {gateScore != null && gateBadge(gateScore, gatePassed)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close job details" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textDim }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Word count', value: detail.word_count != null ? String(detail.word_count) : '—' },
            { label: 'SEO score', value: detail.seo_score != null ? `${detail.seo_score}%` : '—' },
            { label: 'AI provider', value: aiProviderCard },
            { label: 'Target repo', value: detail.target_repo ?? '—' },
          ].map(metric => (
            <div key={metric.label} style={{ background: C.surface2, borderRadius: C.radiusXs, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{metric.label}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 2, wordBreak: 'break-all' }}>{metric.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: C.text }}>
            AI model for regeneration
            <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: C.radiusXs, padding: '6px 8px', fontSize: 11, color: C.text, fontFamily: C.mono }}>
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
          <div style={{ marginBottom: 12, fontFamily: C.mono, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
            {detail.branch_name && <div>branch: <span style={{ color: C.text }}>{detail.branch_name}</span></div>}
            {detail.content_path && <div>file: <span style={{ color: C.text }}>{detail.content_path}</span></div>}
            {detail.pr_url && <div><a href={detail.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: 'none', fontWeight: 600 }}>Open PR ↗</a></div>}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 10 }}>⏱ Job timeline · lineage</div>
              {detail.source_job_id && <div style={{ marginBottom: 8, padding: '7px 9px', borderRadius: C.radiusXs, background: C.blueSoft, color: C.blue, fontSize: 9.5, fontFamily: C.mono }}>↻ Replaces job {detail.source_job_id.slice(0, 12)}… · {detail.regeneration_mode || 'regeneration'}{detail.regeneration_reason ? ` · ${detail.regeneration_reason}` : ''}</div>}
              <JobTimeline jobId={detail.id} createdMs={new Date(detail.created_at).getTime()} />

        </div>

        {detail.error_message && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusXs, padding: '10px 14px', fontSize: 11, color: C.red, marginBottom: 10, fontFamily: C.mono, whiteSpace: 'pre-wrap' }}>{detail.error_message}</div>}

        {gateFailure && <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: C.radiusSm, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>Quality gate remediation</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: '#7C2D12' }}>Edit the draft to remove the blocker, save it, re-audit it, then ship. Regenerate rewrites the full piece using the gate guidance.</div>
          <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
            {canResume && <button type="button" disabled={busy || loading} onClick={() => void runRegenerateStream(true)} style={{ padding: '8px 12px', borderRadius: C.radiusXs, border: `1px solid ${C.blue}`, background: '#EFF6FF', color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>↻ Continue saved draft</button>}
            <button type="button" disabled={busy || loading} onClick={() => void runAction('regenerate')} style={{ padding: '8px 12px', borderRadius: C.radiusXs, border: 'none', background: C.red, color: '#FFF', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{activeAction === 'regenerate' ? 'AI working…' : 'Fix & regenerate'}</button>
          </div>
          {actionEvents.length > 0 && <div style={{ marginTop: 10, background: '#1F2937', color: '#E5E7EB', borderRadius: C.radiusXs, padding: 10, fontFamily: C.mono, fontSize: 10 }}>
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

        <div style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Content editor</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>Edit inline, re-audit for quality gate compliance. Click issues to jump to them. Drafts auto-save every 2 seconds.</div>
            </div>
            {dirty && <span style={{ fontSize: 10, color: C.orange, fontFamily: C.mono }}>Unsaved changes</span>}
          </div>
          {loading
            ? <div style={{ fontSize: 11, color: C.textDim, padding: 18 }}>Loading full job content...</div>
            : <AdminInlineEditor content={editorContent} jobId={detail.id} onChange={(v: string) => setEditorContent(v)} disabled={busy || terminal} onScoreChange={(s) => setAudit(s != null ? { score: s } : null)} />}
        </div>

        {/* ── Dedicated action groups ── */}
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 6 }}>✏️ Editing the draft</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
          {actionBtn('💾 Save draft', { border: C.gold, bg: dirty ? '#FFFBEB' : C.surface2, disabled: busy || loading || !dirty || !editorContent.trim(), onClick: () => void runAction('save'), title: 'Persist your edits to the job' })}
          {actionBtn('🔍 Re-audit', { border: C.blue, fg: C.blue, disabled: busy || loading || !editorContent.trim(), onClick: () => void runAction('reaudit'), title: 'Re-run the quality audit on the current text' })}
          {actionBtn('🔁 Regenerate', { border: C.red, fg: C.red, bg: '#FFF5F5', disabled: busy || loading, onClick: () => void runAction('regenerate'), title: 'Rewrite the full piece with AI (creates a replacement job)' })}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 6 }}>🚀 Delivering to the sites</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
          {actionBtn('📦 Ship PR only', { bg: C.cyan, fg: '#FFF', disabled: busy || loading || !editorContent.trim() || terminal, onClick: () => void runAction('reship'), title: 'Open / update the pull request without merging' })}
          {actionBtn('✅ Approve → main', { bg: C.green, fg: '#FFF', disabled: busy || loading || !editorContent.trim() || terminal, onClick: () => void runAction('approve'), title: 'Approve content and trigger deployment to main' })}
          {detail.pr_number && !terminal && actionBtn(`🔀 Merge open PR #${detail.pr_number}`, { border: C.green, fg: C.green, bg: '#F0FDF4', disabled: busy, onClick: () => void runAction('merge_pr'), title: 'Merge the open pull request on GitHub' })}
          {actionBtn('🩺 Monitor deploy', { disabled: busy || loading, onClick: () => void runAction('monitor'), title: 'Verify the deployed URL: purge, sitemap, IndexNow' })}
          {actionBtn('⧉ Duplicate', { disabled: busy || loading, onClick: () => void runAction('duplicate'), title: 'Clone this job as the starting point for a new piece' })}
        </div>

        {audit && <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono }}>Raw audit JSON</summary><pre style={{ maxHeight: 180, overflow: 'auto', background: C.surface3, borderRadius: C.radiusXs, padding: 10, fontSize: 9, whiteSpace: 'pre-wrap', color: C.text }}>{JSON.stringify(audit, null, 2)}</pre></details>}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ──
export default function AdminContentStudio({ services: _services, refreshAdminData: _refreshAdminData, setActionNotice }: ContentStudioProps) {
  const [tab, setTab] = React.useState<StudioTab>('create')
  const [jobs, setJobs] = React.useState<ContentJob[]>([])
  const [jobTotal, setJobTotal] = React.useState(0)
  const [jobSummary, setJobSummary] = React.useState<QueueSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState<ContentJob | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showFactory, setShowFactory] = React.useState(false)

  // Composer state (lifted so generation + auto-interlink can use it)
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
  const [regenerationPlays, setRegenerationPlays] = React.useState<string[]>(['content_gap', 'quick_win', 'refresh'])
  const [regenerationMinScore, setRegenerationMinScore] = React.useState(45)
  const [regenerationMaxDifficulty, setRegenerationMaxDifficulty] = React.useState(80)
  const regenerationFiltersRef = React.useRef({ plays: regenerationPlays, minOpportunityScore: regenerationMinScore, maxDifficultyScore: regenerationMaxDifficulty })
  React.useEffect(() => {
    regenerationFiltersRef.current = { plays: regenerationPlays, minOpportunityScore: regenerationMinScore, maxDifficultyScore: regenerationMaxDifficulty }
  }, [regenerationPlays, regenerationMinScore, regenerationMaxDifficulty])

  // Radar + suggestions
  const [suggestions, setSuggestions] = React.useState<AISuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false)
  const [suggestionsError, setSuggestionsError] = React.useState<string | null>(null)
  const [radar, setRadar] = React.useState<AISuggestion[]>([])
  const [radarMeta, setRadarMeta] = React.useState<Record<string, unknown> | null>(null)
  const radarSeenTopicsRef = React.useRef<Set<string>>(new Set())

  // GSC live probe (polled) + connect modal — snapshot-vs-live must be obvious
  // before generating.
  const [gscStatus, setGscStatus] = React.useState<Record<string, unknown> | null>(null)
  const gscStatusRef = React.useRef<Record<string, unknown> | null>(null)
  const [gscConnectOpen, setGscConnectOpen] = React.useState(false)

  // Generation stream events
  const [generationEvents, setGenerationEvents] = React.useState<GenerationActivity[]>([])
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(null)
  const [generationChars, setGenerationChars] = React.useState(0)
  const [generationReviewJob, setGenerationReviewJob] = React.useState<ContentJob | null>(null)
  const [generationMergeBusy, setGenerationMergeBusy] = React.useState(false)

  // Merge index + engine status + gates
  const [mergeIndex, setMergeIndex] = React.useState<{ byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }>({ byPath: new Map(), byStem: new Map() })
  const [engineStatus, setEngineStatus] = React.useState<Record<string, unknown> | null>(null)
  const [gateByJob, setGateByJob] = React.useState<Map<string, { score: number; passed: boolean }>>(new Map())
  const [engineBusy, setEngineBusy] = React.useState(false)
  const [queueFocusJobId, setQueueFocusJobId] = React.useState<string | null>(null)
  const [autoInterlinkBusy, setAutoInterlinkBusy] = React.useState(false)

  // Fetch jobs
  const fetchJobs = React.useCallback(async (): Promise<ContentJob[]> => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return []
    try {
      const res = await fetch('/api/content-studio/jobs?limit=100', { credentials: 'same-origin' })
      if (res.status === 503) { setError('Server busy (503). Waiting before next refresh…'); return [] }
      const data = await res.json().catch(() => ({})) as { jobs?: ContentJob[]; total?: number; summary?: QueueSummary; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const nextJobs = data.jobs ?? []
      setJobs(nextJobs)
      setJobTotal(typeof data.total === 'number' ? data.total : nextJobs.length)
      setJobSummary(data.summary ?? null)
      setError(null)
      return nextJobs
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
      return []
    } finally { setLoading(false) }
  }, [])

  // Best-effort index of merged clusters → job pages
  const fetchMergeIndex = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as { error?: string; merges?: CannibalMergeRecord[] }
      const byPath = new Map<string, MergeUrlHit>()
      const byStem = new Map<string, MergeUrlHit>()
      for (const m of (data.merges ?? [])) {
        if (m.status !== 'merged') continue
        const hit: MergeUrlHit = {
          role: 'winner', clusterId: m.clusterId, stem: m.stem, winnerUrl: m.winnerUrl,
          redirectsCreated: m.redirectsCreated, prUrl: m.prUrl, prNumber: m.prNumber, mergedAt: m.mergedAt,
        }
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
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: regionArg,
          limit: 12,
          nonce: `${Date.now()}-${radarSeenTopicsRef.current.size}`,
          excludeTopics: Array.from(radarSeenTopicsRef.current).slice(-160),
          plays: regenerationFiltersRef.current.plays,
          excludeCannibalization: true,
          minOpportunityScore: regenerationFiltersRef.current.minOpportunityScore,
          maxDifficultyScore: regenerationFiltersRef.current.maxDifficultyScore,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const nextSuggestions = data.suggestions ?? []
        const nextRadar = data.opportunities ?? nextSuggestions
        for (const item of [...nextSuggestions, ...nextRadar]) {
          if (item?.topic) radarSeenTopicsRef.current.add(String(item.topic).toLowerCase())
        }
        setSuggestions(nextSuggestions)
        setRadar(nextRadar)
        setRadarMeta({ source: data.source, coverage: data.coverageStats, cannibalization: data.cannibalization, region: data.region })
      } else {
        setSuggestionsError((data as { error?: string }).error ?? 'Failed to load suggestions')
      }
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Suggestion fetch failed')
    } finally { setSuggestionsLoading(false) }
  }, [])

  // GSC live probe — polled so the composer shows token health + a connect
  // CTA. On the false→true transition the radar rescans so suggestions flip
  // from snapshot to live immediately after connecting.
  const loadGscStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/gsc/connect', { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) return
      const prev = gscStatusRef.current
      gscStatusRef.current = data
      setGscStatus(data)
      // Refresh when the connection becomes usable: fresh connect OR a healed
      // token after re-authorization (live false→true) — both flip the radar
      // suggestions to live.
      if ((!prev?.connected && data.connected) || (!prev?.live && data.live)) {
        fetchSuggestions(region)
      }
    } catch { /* silent */ }
  }, [fetchSuggestions, region])

  React.useEffect(() => {
    loadGscStatus()
    const id = setInterval(loadGscStatus, 30_000)
    return () => clearInterval(id)
  }, [loadGscStatus])

  // Autopilot: one click applies the full brief — everything stays editable.
  const applyBrief = React.useCallback((s: AISuggestion) => {
    setTopic(s.topic)
    setKeywords((s.keywords && s.keywords.length ? s.keywords : [s.primaryKeyword || s.topic]).join(', '))
    if (s.title) setTitle(s.title)
    if (s.audience) setAudience(s.audience)
    if (s.contentType) setContentType(s.contentType as ContentType)
    if (s.intent) setTone(TONE_FOR_INTENT[s.intent] ?? 'educational')
    setSelectedBrief(s)
    setBriefInterlinks(s.interlinks ?? [])
    setSuggestions(prev => [s, ...prev.filter(x => x.topic !== s.topic)])
    setTab('create')
    setShowRadar(true)
  }, [])

  React.useEffect(() => { fetchSuggestions('US') }, [fetchSuggestions])
  React.useEffect(() => { fetchJobs() }, [fetchJobs])
  React.useEffect(() => { fetchMergeIndex() }, [fetchMergeIndex])

  // Engine surfaces — non-fatal
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
        const id = String(r.subject_id || '')
        if (!id) continue
        map.set(id, { score: Number(r.score) || 0, passed: Boolean(r.passed) })
      }
      setGateByJob(map)
    } catch { /* best-effort */ }
  }, [])

  React.useEffect(() => { fetchEngineStatus(); fetchGateRuns() }, [fetchEngineStatus, fetchGateRuns])

  // Keep the completed generation attached to the visible activity panel so the
  // operator can merge immediately, without having to find the job in the queue.
  const pushGenerationToMerge = React.useCallback(async () => {
    const job = generationReviewJob
    if (!job?.id || !job.pr_number || generationMergeBusy || job.status === 'merged') return
    if (typeof window !== 'undefined' && !window.confirm(`Push PR #${job.pr_number} to main?\n\nThis merges the reviewed content and starts the deployment monitor.`)) return

    setGenerationMergeBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, action: 'merge_pr' }),
      })
      const data = await response.json().catch(() => ({})) as { job?: ContentJob; message?: string; error?: string }
      if (!response.ok || !data.job) throw new Error(data.error || data.message || `Merge failed (HTTP ${response.status})`)
      setGenerationReviewJob(data.job)
      setActionNotice(data.message || `PR #${job.pr_number} merged to main`)
      const refreshed = await fetchJobs()
      const refreshedJob = refreshed.find((candidate) => candidate.id === job.id)
      if (refreshedJob) setGenerationReviewJob(refreshedJob)
      await fetchGateRuns()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push to merge failed'
      setError(message)
      setActionNotice(message)
    } finally {
      setGenerationMergeBusy(false)
    }
  }, [generationReviewJob, generationMergeBusy, fetchJobs, fetchGateRuns, setActionNotice])

  // Auto-interlink from the engine for the current topic
  const runAutoInterlink = React.useCallback(async () => {
    if (!topic.trim()) return
    setAutoInterlinkBusy(true)
    setError(null)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-interlink failed')
    } finally {
      setAutoInterlinkBusy(false)
    }
  }, [topic, region, interlinkStage])

  // Page further into the queue — older jobs stay reachable beyond the window.
  const loadMoreJobs = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/content-studio/jobs?limit=100&offset=${jobs.length}`, { credentials: 'same-origin' })
      if (res.status === 503) return
      const data = await res.json().catch(() => ({})) as { jobs?: ContentJob[]; total?: number; summary?: QueueSummary; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const more = data.jobs ?? []
      setJobs(prev => {
        const seen = new Set(prev.map(j => j.id))
        return [...prev, ...more.filter(j => !seen.has(j.id))]
      })
      if (typeof data.total === 'number') setJobTotal(data.total)
      if (data.summary) setJobSummary(data.summary)
    } catch { /* silent */ }
  }, [jobs.length])

  // Poll active jobs
  React.useEffect(() => {
    const hasActive = jobs.some(j => ['pending', 'drafting', 'publishing'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 6_000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  // Background jobs poll — queue badges stay fresh even when nothing is drafting.
  React.useEffect(() => {
    const id = setInterval(fetchJobs, 30_000)
    return () => clearInterval(id)
  }, [fetchJobs])

  // REAL-TIME: any content_jobs INSERT/UPDATE/DELETE refreshes the queue
  // instantly — a draft finishing or a PR landing shows up without a poll.
  React.useEffect(() => {
    const off = subscribeToTable('content_jobs', 'public', () => { fetchJobs() })
    return off
  }, [fetchJobs])

  const handleGenerate = async (formData: any) => {
    setGenerating(true)
    setGenerationReviewJob(null)
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
        regional_page: 'regional_page',
      }
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
          region: regionArg, contentType: ct,
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
      const generatedJobId = String(data.jobId || data.job?.id || data.ship?.jobId || '')
      const notice = data.ship?.prUrl
        ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError
          ? `Generated (audit ${data.audit?.score ?? '—'}) but ship paused: ${data.shipError}`
          : `Generated via ${data.provider || 'AI'} · audit ${data.audit?.score ?? '—'}`
      setActionNotice(notice)
      setTab('queue')
      const refreshedJobs = await fetchJobs()
      if (generatedJobId) {
        let reviewJob = refreshedJobs.find((candidate) => candidate.id === generatedJobId) || null
        if (!reviewJob) {
          try {
            const detailResponse = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(generatedJobId)}`, { credentials: 'same-origin' })
            const detailData = await detailResponse.json().catch(() => ({})) as { job?: ContentJob }
            reviewJob = detailResponse.ok ? detailData.job || null : null
          } catch { /* queue refresh remains the source of truth */ }
        }
        setGenerationReviewJob(reviewJob)
      }
      await fetchGateRuns()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      record('error', message, 'error')
      setError(message)
      setActionNotice('Content generation failed.')
    } finally { setGenerating(false) }
  }

  const runEngineAction = async (kind: 'plan' | 'llm' | 'ingest') => {
    setEngineBusy(true)
    setError(null)
    try {
      if (kind === 'plan') {
        await fetch('/api/seo-engine/plan', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 10, draftBriefs: false }) })
      } else if (kind === 'llm') {
        await fetch('/api/seo-engine/llm-visibility', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxAudits: 6 }) })
      } else {
        await fetch('/api/seo-engine/knowledge', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitPerSource: 8, maxAiItems: 8 }) })
      }
      await fetchEngineStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} failed`)
    } finally {
      setEngineBusy(false)
    }
  }

  const engine = (engineStatus || {}) as Record<string, any>
  const engLife = (engine.lifecycle as { seededCells?: number } | undefined)?.seededCells
  const engKnow = (engine.knowledge as { total?: number } | undefined)?.total
  const engPlans = (engine.plans as { total?: number } | undefined)?.total
  const engLinks = (engine.interlinks as { planned?: number } | undefined)?.planned
  const engVoice = (engine.llmVisibility as { shareOfVoice?: number } | undefined)?.shareOfVoice
  const engGate = (engine.gate as { passRate?: number } | undefined)?.passRate

  const TABS: Array<{ key: StudioTab; icon: string; label: string; hint: string }> = [
    { key: 'create', icon: '✏️', label: 'Create', hint: 'Launch new content' },
    { key: 'queue', icon: '📋', label: 'Queue', hint: `${jobTotal || jobs.length} jobs` },
    { key: 'insights', icon: '📊', label: 'Insights', hint: 'Radar · GSC · merges' },
  ]

  return (
    <div style={{ padding: '16px 20px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: C.serif, fontSize: 26, fontWeight: 700, color: C.text }}>
            Content Studio
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
            One verifiable pipeline: radar → brief → AI draft → compliance gate → GitHub PR → live
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setShowFactory(!showFactory); if (!showFactory) setTab('create') }} style={showFactory ? btnSolid(C.gold) : { ...btnGhost, border: `2px solid ${C.gold}`, color: C.gold, fontWeight: 700 }}>
            {showFactory ? '✕ Close Command Center' : '🏭 Command Center'}
          </button>
          <button type="button" onClick={() => { void fetchJobs(); void fetchMergeIndex(); void fetchGateRuns() }} disabled={loading} style={btnGhost}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Live AI activity ── */}
      <LiveGenerationPanel
        active={generating}
        events={generationEvents}
        startedAt={generationStartedAt}
        streamedChars={generationChars}
        completedJob={generationReviewJob}
        mergeBusy={generationMergeBusy}
        onOpenReview={generationReviewJob ? () => setSelectedJob(generationReviewJob) : undefined}
        onPushToMerge={() => void pushGenerationToMerge()}
      />

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusSm, padding: '10px 16px', fontSize: 12, color: C.red, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 18 }}>×</button>
        </div>
      )}

      {/* ── Command Center (full-width, conditional) ── */}
      {showFactory && (
        <div style={{ marginBottom: 14 }}>
          <React.Suspense fallback={<div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: C.textDim }}>Loading Command Center…</div>}>
            <AdminCommandCenter setActionNotice={setActionNotice} />
          </React.Suspense>
        </div>
      )}

      {/* ── SEO Master Engine strip ── */}
      <div style={{
        background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: C.radius,
        padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: C.shadowCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: C.serif }}>🧠 SEO Master Engine</span>
          <span style={{ fontSize: 9, fontFamily: C.mono, color: '#9A7B3B', background: '#FEF3C7', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>v2</span>
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
            🗺 {engLife ?? '—'} cells · 🌐 {engKnow ?? '—'} intel · 🧭 {engPlans ?? '—'} plans · 🔗 {engLinks ?? '—'} links · 🤖 {engVoice ?? '—'}% LLM voice · 🛡 {engGate ?? '—'}% gate pass
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => void runEngineAction('ingest')} disabled={engineBusy} style={btnSolid(C.navy)} title="Scrape all intelligence sources now">
            {engineBusy ? '⏳ …' : '🌐 Ingest knowledge'}
          </button>
          <button type="button" onClick={() => void runEngineAction('plan')} disabled={engineBusy} style={{ ...btnSolid(C.gold) }} title="Rank GSC demand into life-cycle missions">
            {engineBusy ? '⏳ …' : '🧭 Run planner'}
          </button>
          <button type="button" onClick={() => void runEngineAction('llm')} disabled={engineBusy} style={{ ...btnSolid('#6D28D9') }} title="Run an LLM share-of-voice audit (10 estate queries)">
            {engineBusy ? '⏳ …' : '🤖 LLM audit'}
          </button>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
              background: tab === t.key ? C.navy : C.surface, color: tab === t.key ? '#FFF' : C.textMuted,
              border: `1px solid ${tab === t.key ? C.navy : C.border}`, transition: 'all 0.15s',
              boxShadow: tab === t.key ? '0 3px 10px rgba(15,23,42,0.18)' : 'none',
            }}
          >
            {t.icon} {t.label}
            <span style={{ marginLeft: 6, fontSize: 9, fontFamily: C.mono, opacity: 0.75 }}>{t.hint}</span>
          </button>
        ))}
      </div>

      {/* ══════════ CREATE ══════════ */}
      {tab === 'create' && (
        <>
          {/* GSC live probe banner — snapshot-vs-live is obvious before generating */}
          {gscStatus && !(gscStatus.connected && gscStatus.live) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '9px 14px', borderRadius: C.radiusSm, border: '1px solid #FDE68A', background: '#FFFBEB', fontSize: 11.5, flexWrap: 'wrap' }}>
              {gscStatus.connected && (gscStatus.mode === 'oauth' || gscStatus.mode === 'service_account') && (
                <span title={gscStatus.mode === 'oauth' ? 'Google OAuth consent flow' : 'Pasted service-account key'} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, fontFamily: C.mono, background: gscStatus.mode === 'oauth' ? '#EEF2FF' : '#ECFDF5', color: gscStatus.mode === 'oauth' ? '#3730A3' : '#166534', border: `1px solid ${gscStatus.mode === 'oauth' ? '#C7D2FE' : '#A7F3D0'}` }}>
                  {gscStatus.mode === 'oauth' ? 'OAUTH' : 'SERVICE_ACCOUNT'}
                </span>
              )}
              {gscStatus.connected ? (
                <span style={{ color: '#92400E', flex: 1, minWidth: 200, lineHeight: 1.45 }}>
                  <strong>GSC token is failing</strong> — {String(gscStatus.error || 'refresh failed')}. Autopilot stays on snapshot data until it's fixed.
                </span>
              ) : (
                <span style={{ color: '#92400E', flex: 1, minWidth: 200, lineHeight: 1.45 }}>
                  <strong>Suggestions are scored from the committed snapshot</strong>
                  {(() => {
                    const raw = (radarMeta?.snapshot as { generatedAt?: string } | null)?.generatedAt
                    const d = raw ? new Date(raw) : null
                    return radarMeta?.source === 'snapshot' && d && !Number.isNaN(d.getTime())
                      ? ` (${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`
                      : ''
                  })()}
                  {' '}— connect Search Console to score from real queries and clicks.
                </span>
              )}
              <button type="button" onClick={() => setGscConnectOpen(true)} style={{ padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#F59E0B', color: '#fff', fontSize: 10.5, fontWeight: 800 }}>
                {gscStatus.connected ? 'Re-connect GSC →' : 'Connect GSC →'}
              </button>
            </div>
          )}
          <CreateWizard
            generating={generating}
            onGenerate={handleGenerate}
            contentType={contentType} setContentType={setContentType}
            region={region} setRegion={setRegion}
            tone={tone} setTone={setTone}
            aiProvider={aiProvider} setAiProvider={setAiProvider}
            title={title} setTitle={setTitle}
            topic={topic} setTopic={setTopic}
            audience={audience} setAudience={setAudience}
            keywords={keywords} setKeywords={setKeywords}
            suggestions={suggestions} suggestionsLoading={suggestionsLoading} suggestionsError={suggestionsError} radarMeta={radarMeta}
            gscStatus={gscStatus}
            onConnectGsc={() => setGscConnectOpen(true)}
            onRefreshSuggestions={fetchSuggestions}
            onApplySuggestion={applyBrief}
            brief={selectedBrief}
            onClearBrief={() => { setSelectedBrief(null); setBriefInterlinks([]) }}
            briefInterlinks={briefInterlinks}
            interlinkStage={interlinkStage} setInterlinkStage={setInterlinkStage}
            onAutoInterlink={runAutoInterlink}
            autoInterlinkBusy={autoInterlinkBusy}
            showRadar={showRadar} setShowRadar={setShowRadar}
            regenerationPlays={regenerationPlays} setRegenerationPlays={setRegenerationPlays}
            regenerationMinScore={regenerationMinScore} setRegenerationMinScore={setRegenerationMinScore}
            regenerationMaxDifficulty={regenerationMaxDifficulty} setRegenerationMaxDifficulty={setRegenerationMaxDifficulty}
          />
        </>
      )}

      {/* ══════════ QUEUE ══════════ */}
      {tab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!loading && (jobs.length > 0 || jobTotal > 0) && <QueueStats jobs={jobs} total={jobTotal} summary={jobSummary} />}
          <QueueTable
            jobs={jobs}
            total={jobTotal}
            summary={jobSummary}
            onSelect={(job) => { setQueueFocusJobId(null); setSelectedJob(job) }}
            focusJobId={queueFocusJobId}
            loading={loading}
            mergeIndex={mergeIndex}
            gateByJob={gateByJob}
            onLoadMore={loadMoreJobs}
          />
        </div>
      )}

      {/* ══════════ INSIGHTS ══════════ */}
      {tab === 'insights' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GscMini />
            <OpportunityRadar opportunities={radar} meta={radarMeta} onApply={applyBrief} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MergeHistory />
            <InterlinksMini topic={topic} keywords={keywords} />
            <AdminSiteHealthPanel />
            <AdminDeepInterlinkPanel setActionNotice={setActionNotice} />
          </div>
        </div>
      )}

      {/* ── Detail modal ── */}
      {selectedJob && (
        <JobDetail
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onRefresh={async () => { await fetchJobs() }}
          setActionNotice={setActionNotice}
          onReplacementJob={(jobId) => { setQueueFocusJobId(jobId); setSelectedJob(null); setTab('queue') }}
          gateFor={gateByJob.get(selectedJob.id) ?? null}
        />
      )}

      {/* ── GSC connect modal (reuses the command-center flow) ── */}
      {gscConnectOpen && (
        <GscConnectModal
          initialStatus={gscStatus}
          reconnect={Boolean(gscStatus?.connected && !gscStatus?.live)}
          onConnected={() => loadGscStatus()}
          onClose={() => setGscConnectOpen(false)}
        />
      )}
    </div>
  )
}
