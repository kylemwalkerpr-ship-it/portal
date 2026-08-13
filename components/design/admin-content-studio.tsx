'use client'
/**
 * CONTENT STUDIO — Research-ideology pipeline.
 *
 * Mirrors the research process without academic jargon:
 * discover gaps → research keywords & intent → plan the brief →
 * draft & generate → review quality → approve & merge → track live impact.
 *
 *   I.   Discover — GSC signals, radar, insights, LLM visibility, gaps & opportunities.
 *   II.  Research — Keyword research, search intent, topical authority, competitor landscape.
 *   III. Plan     — Brief, target audience, content type, interlinks strategy.
 *   IV.  Draft    — AI generation, pipeline jobs, live streaming, queue management.
 *   V.   Review   — Quality gate, compliance audit, re-audit, fix blockers.
 *   VI.  Approve  — PR, merge to main, deploy monitor.
 *   VII. Track    — Publication ledger, canonical verification, GSC position tracking.
 *
 * Marketplace content is intentionally out of scope: this studio only ships
 * blog/article/regional content to the approved editorial repositories.
 */
import React from 'react'
import type { LeanRanking } from '@/lib/seoEngine/rankingModel'
import type { DepthRescueStats } from '@/lib/seoFactory/depthRescue'
import { DISSERTATION_STAGES, isStudioStage, nearestAvailableStage, resolveStudioStage, transferCompetingWinner, type StudioStage } from '@/lib/seoFactory/studioPipeline'
import {
  extractMetricValues,
  directionForMetric,
  arrowForMetric,
  formatMetricValue,
  formatCtr,
  type Metric,
} from '@/lib/seoFactory/publishLedgerMetric'
import { RankingModelBlock } from './admin-ranking-model-block'
import { subscribeToTable } from '@/lib/supabaseRealtime'
import GscConnectModal from './admin-gsc-connect-modal'
import AdminDeepInterlinkPanel from './admin-deep-interlink-panel'
import AdminSiteHealthPanel from './admin-site-health-panel'
import AdminRhythmAlertsPanel from './admin-rhythm-alerts-panel'
import AiKeyVaultPanel from './ai-key-vault-panel'
import AdminInlineEditor from './admin-inline-editor'
import { StudioStageNav } from './studio-stage-nav'
import { ChapterIntro } from './studio-chapter-intro'
import { studioTokens as E } from './studio-tokens'
import {
  CardHeader,
  QUEUE_FILTERS,
  canonicalMergeStem,
  formatDate,
  gateBadge,
  GscMini,
  jobWebPath,
  statusBadge,
  type CannibalMergeRecord,
  type ContentJob,
  type ContentType,
  type GscMiniStats,
  type JobStatus,
  type MergeUrlHit,
  type QueueSummary,
  type Region,
  type Tone,
  btnGhost,
  inputStyle,
} from './studio-ui-shared'
import { QueueStats, QueueTable } from './studio-queue'
import { ReviewDraftsPanel } from './studio-review-panels'


const C = E

// ── Color tokens (legacy + new editorial palette) ──

const TYPE = {
  display:   { fontFamily: E.serif, fontSize: 36,  lineHeight: 1.05, fontWeight: 700, color: E.inkBlack, letterSpacing: '-0.01em' },
  kicker:    { fontFamily: E.serif, fontSize: 28,  lineHeight: 1.1,  fontWeight: 700, color: E.inkBlack, letterSpacing: '-0.01em' },
  headline:  { fontFamily: E.serif, fontSize: 22,  lineHeight: 1.15, fontWeight: 600, color: E.inkBlack },
  byline:    { fontFamily: E.serif, fontSize: 16,  lineHeight: 1.3,  fontWeight: 500, fontStyle: 'italic' as const, color: E.inkSoft },
  body:      { fontFamily: E.serif, fontSize: 14,  lineHeight: 1.55, color: E.ink },
  caption:   { fontFamily: E.mono,  fontSize: 10,  lineHeight: 1.4,  color: E.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
  microFig:  { fontFamily: E.mono,  fontSize: 9,   letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: E.inkDim },
  metric:    { fontFamily: E.mono,  fontSize: 11, color: E.ink, fontWeight: 600 },
} as const

// ── Provider → default model (mirrors contentAiProvider defaults) ──
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.6-terra',
  custom: 'gpt-5.6-terra',
  'gpt-5.6-sol': 'gpt-5.6-sol',
  'gpt-5.6-terra': 'gpt-5.6-terra',
  grok: 'grok-3',
  deepseek: 'deepseek-chat',
  'nvidia-nemotron': 'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia-glm': 'z-ai/glm-5.2',
  'baseten-deepseek': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'nvidia-deepseek': 'deepseek-ai/deepseek-v4-flash-0731',
  'cloudflare-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
}
type StudioTab = StudioStage

function isStudioTab(value: string | null): value is StudioTab {
  return isStudioStage(value)
}

interface ContentStudioProps {
  services: any[]; refreshAdminData: () => void; setActionNotice: (msg: string) => void
}

interface InterlinkSuggestion {
  label: string; url: string; site: string; kind: string; priority: number
  matchedOn: string[]; note?: string
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
  { value: 'blog_post', label: 'Blog Post', ext: '.tsx', repo: 'yousafe-consultancy', icon: '📝', hint: 'Short-form thought leadership → yousafe-consultancy /blog/' },
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

// Drafting-only provider options — GPT is NOT offered for the draft itself.
// Research/Plan keeps GPT Terra (via the brief endpoint) and Review keeps GPT
// Sol (senior editor), but the actual drafting runs on open-source models
// with GLM 5.2 Fast (Baseten) as the default. GLM Fast is the fastest,
// lowest-cost partner for high-volume drafting.
const DRAFTING_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'baseten-glm-fast', label: 'GLM 5.2 Fast · Baseten (zai-org/GLM-5.2-Fast · default)' },
  { value: 'auto', label: 'Auto (cascade: GLM Fast → DeepSeek → NVIDIA → rest)' },
  { value: 'nvidia-glm', label: 'NVIDIA GLM 5.2 (z-ai/glm-5.2)' },
  { value: 'baseten-deepseek', label: 'DeepSeek V4 Flash · Baseten' },
  { value: 'nvidia-nemotron', label: 'NVIDIA Nemotron 3 Ultra (nvidia/nemotron-3-ultra-550b-a55b)' },
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted,
  textTransform: 'uppercase', marginBottom: 5, fontFamily: C.mono,
}
const btnSolid = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: bg, color: fg, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
})

// ── Editorial toolbar button styles ─────────────────────────────────────────────
const actionBtnStyle = (color: string): React.CSSProperties => ({
  padding: '6px 11px', borderRadius: 0,
  border: `1px solid ${color}`,
  background: 'transparent', color,
  fontFamily: E.mono, fontSize: 10.5, fontWeight: 700,
  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
})
const actionDisabledStyle = (color: string): React.CSSProperties => ({
  ...actionBtnStyle(color),
  opacity: 0.6, cursor: 'progress', background: `${color}1A`,
})
const actionGhostStyle = (): React.CSSProperties => ({
  padding: '6px 10px', borderRadius: 0,
  border: `1px solid ${E.hairline}`,
  background: 'transparent', color: E.inkSoft,
  fontFamily: E.mono, fontSize: 10.5, fontWeight: 700,
  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
})

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

// ── VII · APPROVE PANEL ──
// Surfaces the PR/monitor surface for the selected job. Each merged job
// renders a status badge, deploy indicator, and a one-click rollback.
function ApprovePanel({
  selectedJob, jobs, merges, onOpenJob, setActionNotice, onApproveAndMerge, onMerged,
}: {
  selectedJob: ContentJob | null
  jobs: ContentJob[]
  merges: any[]
  onOpenJob: (j: ContentJob) => void
  setActionNotice?: (msg: string) => void
  onApproveAndMerge?: (j: ContentJob) => Promise<{ ok: boolean; message?: string; rhythmDetail?: { key: string; count: number } | null }>
  onMerged?: () => void
}) {
  const prOpen = jobs.filter((j) => j.status === 'pr_created' || j.pr_url)
  const approvable = jobs.filter((j) => j.status === 'drafting' || j.status === 'pending')
  const recentMerges = (merges || []).slice(0, 8)

  // Per-job approve progress: 'idle' | 'opening' | 'merging' | 'monitoring' | 'ok' | 'failed'
  // bulk_approve resolves only when the full sequence is done, so we project
  // coarse stage milestones to keep the admin informed during CI.
  type ApproveProgress = 'idle' | 'opening' | 'merging' | 'monitoring' | 'ok' | 'failed'
  const [approveProgress, setApproveProgress] = React.useState<Record<string, {
    stage: ApproveProgress
    message: string
    startedAt: number
    finishedAt?: number
  }>>({})
  // Ship-time rhythm refusals per job (structured detail from the approve API):
  // opener key + count, so the row can name exactly what the AI sweep must fix.
  const [rhythmRefusals, setRhythmRefusals] = React.useState<Record<string, { key: string; count: number } | null>>({})
  const setRhythmRefusal = React.useCallback((jobId: string, refusal: { key: string; count: number } | null) => {
    setRhythmRefusals((prev) => ({ ...prev, [jobId]: refusal }))
  }, [])
  const runApproveRow = React.useCallback(async (j: ContentJob) => {
    if (!onApproveAndMerge) return
    const started = Date.now()
    setApproveProgress((prev) => ({
      ...prev,
      [j.id]: { stage: 'opening', message: 'Opening PR...', startedAt: started },
    }))
    // Poll the live monitor endpoint for real deploy status instead of
    // projecting coarse fake timeouts.
    let monitorTimer: ReturnType<typeof setInterval> | null = null
    const startMonitoring = () => {
      monitorTimer = setInterval(async () => {
        try {
          const mr = await fetch(`/api/seo-factory/monitor?jobId=${encodeURIComponent(j.id)}`, {
            credentials: 'same-origin',
          })
          const md = await mr.json().catch(() => ({})) as Record<string, unknown>
          if (!mr.ok || !md.ok) {
            setApproveProgress((prev) => prev[j.id]
              ? { ...prev, [j.id]: { ...prev[j.id], stage: 'monitoring', message: String(md.checkState || 'Checking deploy…') } }
              : prev)
            return
          }
          const state = String(md.checkState || '')
          if (state === 'success' || state === 'deployed' || state === 'live') {
            if (monitorTimer) clearInterval(monitorTimer)
            setApproveProgress((prev) => prev[j.id]
              ? { ...prev, [j.id]: { stage: 'ok', message: md.deployUrl ? `✓ Deployed → ${md.deployUrl}` : (md.prUrl ? `✓ PR #${md.prNumber || '?'} merged · deploy live` : '✓ Merged · deploy live'), startedAt: prev[j.id].startedAt, finishedAt: Date.now() } }
              : prev)
            onMerged?.()
          } else if (state === 'failure' || state === 'error') {
            if (monitorTimer) clearInterval(monitorTimer)
            setApproveProgress((prev) => prev[j.id]
              ? { ...prev, [j.id]: { stage: 'failed', message: String(md.action || 'Deploy failed'), startedAt: prev[j.id].startedAt, finishedAt: Date.now() } }
              : prev)
          } else {
            setApproveProgress((prev) => prev[j.id]
              ? { ...prev, [j.id]: { ...prev[j.id], stage: 'monitoring', message: String(state || 'Building…') } }
              : prev)
          }
        } catch {
          // keep polling
        }
      }, 6000)
    }

    // After the approve call returns, start real monitoring
    startMonitoring()

    try {
      const result = await onApproveAndMerge(j)
      const ok = result.ok
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: {
          stage: ok ? 'ok' : 'failed',
          message: result.message || (ok ? 'PR merged · deploy live' : 'Push failed'),
          startedAt: prev[j.id]?.startedAt || started,
          finishedAt: Date.now(),
        },
      }))
      // Surface the ship-time rhythm refusal (structured detail from the
      // approve API) as a dedicated notice naming the opener + count.
      const rhythmDetail = (result as { rhythmDetail?: { key: string; count: number } | null }).rhythmDetail
      setRhythmRefusal(j.id, rhythmDetail ?? null)
      if (ok) onMerged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push failed'
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: { stage: 'failed', message, startedAt: started, finishedAt: Date.now() },
      }))
      setRhythmRefusal(j.id, null)
      setActionNotice?.(message)
    }
  }, [onApproveAndMerge, setActionNotice, onMerged, setRhythmRefusal])
  return (
    <div data-testid="studio-approve-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0 }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>STAGE V · APPROVE</div>
        <h3 style={{ margin: '4px 0 12px', fontFamily: C.serif, fontSize: 22, color: E.ink }}>Push to main · {prOpen.length} open PR{prOpen.length === 1 ? '' : 's'}</h3>
        {prOpen.length === 0 && (
          <p style={{ margin: 0, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic' }}>
            No PRs awaiting merge. The drafts that graduate from VI · Defend with a green gate will appear here.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prOpen.map((j) => {
            const progress = approveProgress[j.id]
            const isWorking = progress && progress.stage !== 'ok' && progress.stage !== 'failed'
            const stageColor =
              progress?.stage === 'ok' ? '#0f7a3a'
              : progress?.stage === 'failed' ? '#a32525'
              : isWorking ? '#b87a00'
              : 'transparent'
            const stageLabel =
              progress?.stage === 'ok' ? '✓ MERGED · LIVE'
              : progress?.stage === 'failed' ? '✕ FAILED'
              : progress?.stage === 'monitoring' ? '⏳ MONITORING DEPLOY'
              : progress?.stage === 'merging' ? '⏳ MERGING'
              : progress?.stage === 'opening' ? '⏳ OPENING PR'
              : isWorking ? '⏳ WORKING...'
              : (onApproveAndMerge ? '🚀 PUSH PR → MERGE' : 'READY TO MERGE')
            return (
              <div key={j.id} data-testid={`studio-approve-row-${j.id}`} data-stage={progress?.stage || 'idle'} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: 12, background: E.ivory,
                border: `1px solid ${E.hairline}`, borderRadius: 0,
              }}>
                <button
                  type="button"
                  onClick={() => onApproveAndMerge ? runApproveRow(j) : onOpenJob(j)}
                  disabled={Boolean(isWorking)}
                  data-testid={`studio-approve-cta-${j.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: isWorking ? 'progress' : 'pointer',
                    background: 'transparent', border: 'none', padding: 0,
                    width: '100%', textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: C.serif, fontSize: 15, color: E.ink }}>{j.title}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: E.inkMuted }}>
                      {j.region} · {(j.content_type || '').toUpperCase()} · {j.pr_url ? `PR #${j.pr_number}` : 'PR queued'}
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 10px', fontFamily: C.mono, fontSize: 11, fontWeight: 700,
                    background: stageColor, color: stageColor === 'transparent' ? E.inkMuted : E.ivory,
                    transition: 'background 0.2s',
                  }}>{stageLabel}</div>
                </button>
                {progress && (
                  <div style={{
                    fontFamily: C.mono, fontSize: 10.5, color: E.inkMuted,
                    paddingTop: 4, borderTop: `1px dashed ${E.hairline}`,
                  }}>
                    {progress.message}
                    {progress.finishedAt && (
                      <span style={{ marginLeft: 6, color: E.inkDim }}>
                        · {Math.max(0, Math.round((progress.finishedAt - progress.startedAt) / 1000))}s elapsed
                      </span>
                    )}
                    {j.pr_url && (
                      <div style={{ marginTop: 4, marginBottom: 2 }}>
                        <a href={j.pr_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: E.gold, fontFamily: E.mono, textDecoration: "underline", fontWeight: 600 }}>
                          View PR #{j.pr_number || "?"} ↗
                        </a>
                      </div>
                    )}
                    {j.canonical_url && (progress.stage === "ok" || progress.stage === "monitoring") && (
                      <div style={{ marginTop: 2 }}>
                        <a href={j.canonical_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#166534", fontFamily: E.mono, textDecoration: "underline", fontWeight: 600 }}>
                          {String(j.canonical_url).replace('https://', '').replace('http://', '')} ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}
                {/* Ship-time rhythm refusal: the deterministic repair ran but
                    could not clear the robotic openings — name the exact opener
                    + count and direct to the AI targeted sweep. */}
                {rhythmRefusals[j.id] && (
                  <div data-testid={`studio-rhythm-refusal-${j.id}`} style={{
                    marginTop: 8, padding: '9px 11px', background: '#FEF2F2',
                    border: `1px solid #FECACA`, borderLeft: `3px solid #DC2626`,
                  }}>
                    <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>
                      ⛔ RHYTHM BEYOND REPAIR · {rhythmRefusals[j.id]!.count}× "{rhythmRefusals[j.id]!.key}…"
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 9.5, color: '#7F1D1D', lineHeight: 1.5 }}>
                      The mechanical rhythm repair ran but cannot clear these repeated sentence openings — the AI targeted sweep is required before ship.
                    </div>
                    <div style={{ marginTop: 5 }}>
                      <button
                        type="button"
                        onClick={() => onOpenJob(j)}
                        data-testid={`studio-rhythm-refusal-cta-${j.id}`}
                        style={{
                          padding: '4px 10px', borderRadius: 4, border: 'none',
                          background: '#DC2626', color: '#FFF',
                          fontFamily: C.mono, fontSize: 9, fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Open in editor → Re-audit (AI sweep)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {recentMerges.length > 0 && (
        <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0 }}>
          <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 8 }}>
            LATEST MERGES · AWAITING DEPLOY PROMOTE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentMerges.map((m: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, fontSize: 11, color: E.inkMuted }}>
                <span>{m.path || m.canonical || m.mergeCommitSha?.slice(0, 7) || `merge-${i}`}</span>
                <span>{timeAgo(m.mergedAt || m.deployTime || m.observed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {approvable.length > 0 && (
        <div style={{ fontFamily: C.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
          {approvable.length} draft{approvable.length === 1 ? '' : 's'} are still in early stages. They will promote here once VI · Defend green-lights them.
        </div>
      )}
    </div>
  )
}

// ── VIII · PUBLISH LEDGER ──
// The citation index. Every merged PR renders a stamp: live URL, deploy
// time, merge SHA, region, and the rank observed at the most recent GSC
// snapshot. From here the ranking model replays reward signal.
function PublishLedger({
  merges, jobs, onOpenJob, setActionNotice,
}: {
  merges: any[]
  jobs: ContentJob[]
  onOpenJob: (j: ContentJob) => void
  setActionNotice?: (msg: string) => void
}) {
  // NEW: per-stamp verify state + batched position-trend lookup.
  type VerifyState =
    | { stage: 'idle' }
    | { stage: 'verifying'; startedAt: number }
    | { stage: 'ok'; message: string; httpStatus: number | null; verifiedAt: string }
    | { stage: 'broken'; message: string; httpStatus: number | null; verifiedAt: string }

  const merged = jobs.filter((j) => j.status === 'merged' || j.canonical_url)
  // Dedupe by canonical URL — repeated deploys of the same article.
  const seen = new Set<string>()
  const stamps = merged
    .filter((j) => {
      const key = j.canonical_url || j.slug || j.id
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    .slice(0, 18)

  const [verify, setVerify] = React.useState<Record<string, VerifyState>>({})
  const [trendsLoading, setTrendsLoading] = React.useState(false)
  const [trendsError, setTrendsError] = React.useState<string | null>(null)
  const [trends, setTrends] = React.useState<Record<string, {
    position: number | null
    impressions: number | null
    clicks: number | null
    ctr: number | null
    deltaPosition: number | null
    direction: 'up' | 'down' | 'flat' | 'unknown'
    found: boolean
    points: Array<{ date: string; clicks: number; impressions: number; position: number; ctr: number }>
  }>>({})

  // Per-stamp model-vs-GSC divergence verdict (Flag-in-paper §4.3.4). Fetched
  // in parallel with the trend snapshot so the badge has data the instant the
  // first paint finishes.
  const [divergence, setDivergence] = React.useState<Record<string, {
    status: 'agree' | 'disagree' | 'missing' | 'unknown'
    note: string
    magnitude: number | null
    forecastDirection: 'up' | 'down' | 'flat' | 'unknown'
    topic: string | null
    projection60: number | null
    probabilityTop10: number | null
  }>>({})
  const [divergenceLoading, setDivergenceLoading] = React.useState(false)
  const [divergenceError, setDivergenceError] = React.useState<string | null>(null)

  // Per-stamp sparkline metric switcher (pos / impr / clk). Default 'position'
  // so the existing stamp graphics stay identical when the admin hasn't
  // touched the toggle. The Metric type is imported from
  // lib/seoFactory/publishLedgerMetric (single source of truth).
  const [metricChoice, setMetricChoice] = React.useState<Record<string, Metric>>({})

  const canonicalUrls = React.useMemo(
    () => stamps.map((s) => s.canonical_url).filter((u): u is string => !!u),
    [stamps],
  )

  // Live metrics summary — aggregates trend data into KPI cards
  const metricsSummary = React.useMemo(() => {
    const entries = Object.values(trends).filter(t => t.found !== false)
    const positions = entries.map(t => t.position).filter((p): p is number => p != null)
    const totalClicks = entries.reduce((sum, t) => sum + (typeof t.clicks === 'number' ? t.clicks : 0), 0)
    const totalImpr = entries.reduce((sum, t) => sum + (typeof t.impressions === 'number' ? t.impressions : 0), 0)
    const avgPos = positions.length ? positions.reduce((s, p) => s + p, 0) / positions.length : null
    const avgCtr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : null
    return {
      totalMerged: stamps.length,
      entriesWithData: entries.length,
      avgPosition: avgPos,
      totalClicks,
      totalImpressions: totalImpr,
      avgCtr,
    }
  }, [trends, stamps.length])

  // Model accuracy KPI — aggregates divergence statuses across all tracked URLs.
  // agree = forecast direction matched observed GSC direction.
  const divergenceSummary = React.useMemo(() => {
    const entries = Object.values(divergence)
    const total = entries.filter(d => d.status === 'agree' || d.status === 'disagree').length
    const agreeCount = entries.filter(d => d.status === 'agree').length
    const disagreeCount = entries.filter(d => d.status === 'disagree').length
    const accuracy = total > 0 ? Math.round((agreeCount / total) * 100) : null
    const missing = entries.filter(d => d.status === 'missing').length
    const unknown = entries.filter(d => d.status === 'unknown').length
    return { agreeCount, disagreeCount, total, accuracy, missing, unknown }
  }, [divergence])

  const loadTrends = React.useCallback(async () => {
    if (!canonicalUrls.length) {
      setTrends({}); setTrendsError(null); return
    }
    setTrendsLoading(true); setTrendsError(null)
    try {
      const res = await fetch('/api/content-studio/position-trend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalUrls, days: 28 }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; source?: string; trends?: any[]; error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const next: typeof trends = {}
      for (const t of data.trends || []) {
        next[t.url] = {
          position: t.position,
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.ctr,
          deltaPosition: t.deltaPosition,
          direction: t.direction,
          found: t.found,
          points: Array.isArray(t.points) ? t.points : [],
        }
      }
      setTrends(next)
    } catch (err) {
      setTrendsError(err instanceof Error ? err.message : 'trend fetch failed')
    } finally {
      setTrendsLoading(false)
    }
  }, [canonicalUrls])

  React.useEffect(() => {
    void loadTrends()
  }, [loadTrends])

  // NEW: forecast vs actual verdict — fires after the trend snapshot so the
  // divergence router has the observed positions + direction.
  const loadDivergence = React.useCallback(async () => {
    if (!canonicalUrls.length) {
      setDivergence({}); setDivergenceError(null); return
    }
    setDivergenceLoading(true); setDivergenceError(null)
    try {
      const observations = canonicalUrls.map((url) => {
        const t = trends[url]
        return {
          url,
          position: t?.position ?? null,
          direction: (t?.direction ?? 'unknown') as 'up' | 'down' | 'flat' | 'unknown',
        }
      })
      const res = await fetch('/api/content-studio/forecast-divergence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalUrls, observations }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; entries?: any[]; error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const next: typeof divergence = {}
      for (const e of data.entries || []) {
        next[e.url] = {
          status: e.divergence?.status,
          note: e.divergence?.note,
          magnitude: e.divergence?.magnitude ?? null,
          forecastDirection: e.forecastDirection,
          topic: e.topic,
          projection60: e.forecast?.projection60 ?? null,
          probabilityTop10: e.forecast?.probabilityTop10 ?? null,
        }
      }
      setDivergence(next)
    } catch (err) {
      setDivergenceError(err instanceof Error ? err.message : 'divergence fetch failed')
    } finally {
      setDivergenceLoading(false)
    }
  }, [canonicalUrls, trends])
  React.useEffect(() => {
    void loadDivergence()
  }, [loadDivergence])

  const runVerify = React.useCallback(async (jobId: string, canonicalUrl: string) => {
    setVerify((prev) => ({ ...prev, [jobId]: { stage: 'verifying', startedAt: Date.now() } }))
    try {
      const res = await fetch('/api/content-studio/verify-published', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalUrl, jobId }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; stamp?: { status: string; message: string }
        result?: { httpStatus?: number | null; verifiedAt?: string }
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const status = data.stamp?.status
      const ok = data.ok && (status === 'verified' || data.result?.httpStatus === 200)
      if (ok) {
        setVerify((prev) => ({
          ...prev,
          [jobId]: {
            stage: 'ok',
            message: data.stamp?.message || `HTTP ${data.result?.httpStatus || 200}`,
            httpStatus: data.result?.httpStatus ?? null,
            verifiedAt: data.result?.verifiedAt || new Date().toISOString(),
          },
        }))
      } else {
        setVerify((prev) => ({
          ...prev,
          [jobId]: {
            stage: 'broken',
            message: data.stamp?.message || data.error || 'Verification failed',
            httpStatus: data.result?.httpStatus ?? null,
            verifiedAt: data.result?.verifiedAt || new Date().toISOString(),
          },
        }))
      }
      setActionNotice?.(data.stamp?.message || 'Verified')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verify failed'
      setVerify((prev) => ({
        ...prev,
        [jobId]: { stage: 'broken', message, httpStatus: null, verifiedAt: new Date().toISOString() },
      }))
      setActionNotice?.(message)
    }
  }, [setActionNotice])
  return (
    <div data-testid="studio-publish-ledger" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0 }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
          STAGE VI · TRACK
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: '4px 0 6px', fontFamily: C.serif, fontSize: 22, color: E.ink }}>
            Ship Ledger · {stamps.length} verified stamp{stamps.length === 1 ? '' : 's'}
          </h3>
          <button
            type="button"
            onClick={() => void loadTrends()}
            disabled={trendsLoading}
            data-testid="studio-publish-refresh"
            style={{
              fontFamily: C.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              padding: '5px 12px', border: `1px solid ${E.gold}`, background: 'transparent',
              color: E.gold, cursor: trendsLoading ? 'progress' : 'pointer',
            }}
          >
            {trendsLoading ? '⏳ REFRESHING…' : '↻ REFRESH TRENDS'}
          </button>
        </div>
        <p style={{ margin: '4px 0 0', color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 13 }}>
          Every merged draft earns a stamp below. Click <b>VERIFY</b> on each stamp to re-check HTTP 200 + canonical tag, and watch the live GSC position trend drawn next to the score.
        </p>
      </div>
      {/* Metrics summary bar — live aggregation from GSC trend data */}
      {stamps.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10, marginBottom: 4,
        }}>
          {[
            { label: 'Total Merged', value: String(metricsSummary.totalMerged), sub: `${metricsSummary.entriesWithData} with GSC data`, icon: '📦' },
            { label: 'Avg Position', value: metricsSummary.avgPosition != null ? metricsSummary.avgPosition.toFixed(1) : '—', sub: 'GSC 28-day avg', icon: '🎯' },
            { label: 'Total Clicks', value: fmtN(metricsSummary.totalClicks), sub: `${fmtN(metricsSummary.totalImpressions)} impressions`, icon: '👆' },
            { label: 'Avg CTR', value: metricsSummary.avgCtr != null ? `${metricsSummary.avgCtr.toFixed(1)}%` : '—', sub: 'click-through rate', icon: '📊' },
            {
              label: 'Model Accuracy',
              value: divergenceSummary.accuracy != null ? `${divergenceSummary.accuracy}%` : '—',
              sub: divergenceSummary.total > 0
                ? `${divergenceSummary.agreeCount} agree · ${divergenceSummary.disagreeCount} disagree`
                : divergenceSummary.missing > 0 ? `${divergenceSummary.missing} missing forecast data` : 'forecast vs GSC direction',
              icon: '🤖',
              accuracy: divergenceSummary.accuracy,
            },
          ].map((kpi, i) => (
            <div key={i} style={{
              padding: '10px 14px', background: E.paper,
              border: `1px solid ${E.hairline}`, borderRadius: 0,
              display: 'flex', flexDirection: 'column', gap: 2,
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>{kpi.icon}</span>
                <span style={{ fontSize: 9, fontFamily: E.mono, letterSpacing: '0.14em', color: E.gold, textTransform: 'uppercase', fontWeight: 700 }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{
                fontFamily: C.serif, fontSize: 26, fontWeight: 700,
                color: (kpi as any).accuracy != null
                  ? (kpi as any).accuracy >= 80 ? E.mossGreen
                  : (kpi as any).accuracy >= 50 ? '#C47F17'
                  : C.red
                  : E.ink,
                lineHeight: 1.1,
              }}>
                {(trendsLoading || divergenceLoading) && !metricsSummary.entriesWithData ? (
                  <span style={{ fontSize: 12, color: E.inkDim, fontFamily: E.mono }}>⏳ loading</span>
                ) : kpi.value}
              </div>
              <div style={{ fontSize: 9, color: E.inkDim, fontFamily: E.mono }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>
      )}
      {stamps.length === 0 ? (
        <div style={{
          padding: '48px 32px', background: E.paper,
          border: `1px solid ${E.hairline}`, borderRadius: 0, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📜</div>
          <div style={{ fontFamily: C.serif, fontSize: 20, color: E.ink, marginBottom: 8 }}>Citation Ledger Awaits Its First Entry</div>
          <p style={{ color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', margin: '0 0 16px', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Once a draft passes the quality gate and is merged to main via <b>V · Approve</b>, it earns a permanent stamp here. Each stamp tracks the live canonical URL, GSC position trend, and model-forecast divergence over time.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '6px 12px', background: E.goldSoft, color: E.goldDeep,
              fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              borderRadius: 0,
            }}>I · Discover → gaps & opportunities</span>
            <span style={{ fontSize: 12, color: E.inkDim, fontFamily: C.serif, alignSelf: 'center' }}>→</span>
            <span style={{
              padding: '6px 12px', background: E.goldSoft, color: E.goldDeep,
              fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              borderRadius: 0,
            }}>V · Approve → merge to main</span>
            <span style={{ fontSize: 12, color: E.inkDim, fontFamily: C.serif, alignSelf: 'center' }}>→</span>
            <span style={{
              padding: '6px 12px', background: E.gold, color: E.ivory,
              fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              borderRadius: 0,
            }}>VI · Track → stamp appears here</span>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {stamps.map((j) => {
            const canonical = j.canonical_url || null
            const verifyState = verify[j.id] || { stage: 'idle' }
            const verifying = verifyState.stage === 'verifying'
            const trend = canonical ? trends[canonical] : undefined
            const divergenceEntry = canonical ? divergence[canonical] : undefined
            const divergenceStatus: 'agree' | 'disagree' | 'missing' | 'unknown' =
              divergenceEntry?.status ?? 'unknown'
            // Confidence chip colours — intentionally high-contrast so admins
            // spot a divergence row in <1s even at 18 cards on the page.
            const divergenceVisual: Record<string, { bg: string; fg: string; border: string; glyph: string; label: string }> = {
              agree:    { bg: '#10B981', fg: '#052E16', border: '#10B981', glyph: '✓', label: 'Forecast matches GSC' },
              disagree: { bg: '#DC2626', fg: '#FFFFFF', border: '#DC2626', glyph: '⚠', label: 'Forecast ↔ GSC DIVERGE' },
              missing:  { bg: '#1F2937', fg: '#9CA3AF', border: '#374151', glyph: '·', label: 'No forecast yet' },
              unknown:  { bg: '#1F2937', fg: '#9CA3AF', border: '#374151', glyph: '–', label: 'Awaiting GSC data' },
            }
            const dv = divergenceVisual[divergenceStatus]
            const dvTooltip = divergenceEntry?.note
              ? `${dv.label}\n\n${divergenceEntry.note}${divergenceEntry.magnitude != null ? `\n\nProjected move: ${Math.abs(divergenceEntry.magnitude).toFixed(1)} slots.` : ''}`
              : (divergenceLoading
                  ? 'Comparing forecast to live GSC…'
                  : divergenceError
                    ? `Forecast-vs-GSC lookup failed: ${divergenceError}`
                    : dv.label)
            // Active metric for this stamp (defaults to 'position' so first
            // paint matches the previous shape exactly).
            const activeMetric: Metric = canonical
              ? (metricChoice[canonical] || 'position')
              : 'position'
            // Pure helper: pull this metric's values out of the trend and
            // compute a coarse direction. Lives in
            // lib/seoFactory/publishLedgerMetric (unit-tested).
            const metricValues = extractMetricValues(trend?.points, activeMetric)
            const metricLatest = metricValues.length ? metricValues[metricValues.length - 1] : null
            const metricFirst = metricValues.length ? metricValues[0] : null
            // Position's headline and delta come from the endpoint's
            // aggregate query (authoritative); selected impressions/clicks
            // use the daily series that is actually being plotted.
            const metricDisplayValue = activeMetric === 'position'
              ? (trend?.position ?? null)
              : metricLatest
            const metricDelta = activeMetric === 'position'
              ? (trend?.deltaPosition ?? null)
              : (metricLatest != null && metricFirst != null ? metricLatest - metricFirst : null)
            const metricDirection = activeMetric === 'position'
              ? (trend?.direction ?? 'unknown')
              : directionForMetric(metricValues, activeMetric)
            // Pre-compute the sparkline geometry so the SVG render remains
            // inline and trivial.
            let sparkPath: string | null = null
            let sparkPts: number = 0
            if (trend && metricValues.length >= 2) {
              sparkPts = metricValues.length
              const w = 120, h = 28
              const max = Math.max(...metricValues, 1)
              const min = Math.min(...metricValues, max)
              const range = max - min || 1
              const stepX = sparkPts > 1 ? w / (sparkPts - 1) : w
              sparkPath = metricValues.map((v, i) => {
                const x = (i * stepX).toFixed(2)
                const y = (h - ((v - min) / range) * h).toFixed(2)
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
              }).join(' ')
            }
            // Per-metric colour so the admin's eye matches whatever is plotted.
            // Position: green = improving (lower number); impressions / clicks:
            // green = values rising. Either way the colour rule is "good moves
            // are green" — consistent with the rest of the studio.
            const trendColor =
              metricDirection === 'up' ? '#0f7a3a'
              : metricDirection === 'down' ? '#a32525'
              : metricDirection === 'flat' ? '#6b7280'
              : '#9ca3af'
            const metricGlyph: Record<Metric, string> = { position: '📈', impressions: '👁', clicks: '🖱' }
            const metricLabel: Record<Metric, string> = { position: 'pos', impressions: 'imp', clicks: 'clk' }
            const metricText = (m: Metric) => formatMetricValue(m, metricDisplayValue)
            const arrowGlyph = (m: Metric) => {
              const dir = arrowForMetric(m, metricDelta, metricFirst)
              return dir === 'up' ? '↑' : dir === 'down' ? '↓' : ''
            }
            const setMetric = (m: Metric) => {
              if (!canonical) return
              setMetricChoice((prev) => ({ ...prev, [canonical]: m }))
            }
            return (
              <article
                key={j.id}
                data-testid={`studio-verify-stamp-${j.id}`}
                data-stage={verifyState.stage}
                style={{
                  padding: 14, background: E.paper,
                  border: `1px solid ${E.hairline}`, borderRadius: 0,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: C.mono, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700,
                      background: E.gold, color: E.ivory, padding: '2px 8px',
                    }}>STAMP · {j.region}</span>
                    {canonical && (
                      <span
                        data-testid={`studio-divergence-chip-${j.id}`}
                        title={dvTooltip}
                        style={{
                          fontFamily: C.mono, fontSize: 9, letterSpacing: '0.06em', fontWeight: 700,
                          padding: '2px 7px', borderRadius: 0,
                          background: dv.bg, color: dv.fg, border: `1px solid ${dv.border}`,
                          cursor: 'help', whiteSpace: 'nowrap',
                        }}
                      >
                        {dv.glyph} {divergenceStatus === 'agree' && (divergenceEntry?.magnitude != null
                          ? `FORECAST ✓ GSC (${Math.abs(divergenceEntry.magnitude).toFixed(1)} slots)`
                          : 'FORECAST ✓ GSC')}
                        {divergenceStatus === 'disagree' && (divergenceEntry?.magnitude != null
                          ? `DIVERGE (${Math.abs(divergenceEntry.magnitude).toFixed(1)} off)`
                          : 'DIVERGE')}
                        {divergenceStatus === 'missing' && 'NO FORECAST'}
                        {divergenceStatus === 'unknown' && (divergenceLoading ? 'CHECKING…' : 'AWAITING GSC')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => canonical && runVerify(j.id, canonical)}
                    disabled={verifying || !canonical}
                    data-testid={`studio-verify-cta-${j.id}`}
                    title={canonical ? 'Re-verify HTTP 200 + canonical tag' : 'Stamp is missing a canonical URL'}
                    style={{
                      fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 10px', borderRadius: 0,
                      border: `1px solid ${trendColor}`,
                      background: verifying ? trendColor : 'transparent',
                      color: verifying ? E.ivory : trendColor,
                      cursor: verifying ? 'progress' : 'pointer',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {verifyState.stage === 'verifying' && '⏳ VERIFYING…'}
                    {verifyState.stage === 'ok' && '✓ RE-VERIFY'}
                    {verifyState.stage === 'broken' && '✕ BROKEN · RE-VERIFY'}
                    {verifyState.stage === 'idle' && '✓ VERIFY'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenJob(j)}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ fontFamily: C.serif, fontSize: 16, color: E.ink, lineHeight: 1.2 }}>
                    {j.title}
                  </div>
                </button>
                {canonical && (
                  <div style={{ fontFamily: C.mono, fontSize: 10.5, color: E.gold, wordBreak: 'break-all' }}>
                    {canonical}
                  </div>
                )}
                {verifyState.stage !== 'idle' && (verifyState.stage === 'ok' || verifyState.stage === 'broken') && (
                  <div style={{
                    fontFamily: C.mono, fontSize: 10.5,
                    color: verifyState.stage === 'broken' ? '#a32525' : '#0f7a3a',
                    paddingTop: 4, borderTop: `1px dashed ${E.hairline}`,
                  }}>
                    {verifyState.message}
                    <span style={{ marginLeft: 6, color: E.inkDim }}>
                      · checked {timeAgo(verifyState.verifiedAt)}
                    </span>
                  </div>
                )}
                {verifyState.stage === 'verifying' && (
                  <div style={{
                    fontFamily: C.mono, fontSize: 10.5, color: E.inkMuted,
                    paddingTop: 4, borderTop: `1px dashed ${E.hairline}`,
                  }}>
                    Re-checking HTTP 200 + canonical tag…
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: 6, borderTop: `1px solid ${E.hairline}`,
                }}>
                  {trend && trend.found ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* Metric icon switcher — pos / imp / clk */}
                        <div role="tablist" aria-label="sparkline metric"
                          style={{ display: 'inline-flex', gap: 0, border: `1px solid ${E.hairline}`, borderRadius: 0 }}>
                          {(['position', 'impressions', 'clicks'] as Metric[]).map((m) => {
                            const active = activeMetric === m
                            return (
                              <button key={m} type="button" role="tab"
                                id={`studio-metric-tab-${m}-${j.id}`}
                                aria-selected={active}
                                aria-controls={`studio-metric-panel-${j.id}`}
                                tabIndex={active ? 0 : -1}
                                aria-label={`Show ${m === 'position' ? 'position' : m === 'impressions' ? 'impressions' : 'clicks'} trend`}
                                data-testid={`studio-metric-${m}-${j.id}`}
                                onKeyDown={(event) => {
                                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                                  event.preventDefault()
                                  const metrics: Metric[] = ['position', 'impressions', 'clicks']
                                  const current = metrics.indexOf(m)
                                  const next = event.key === 'ArrowRight'
                                    ? metrics[(current + 1) % metrics.length]
                                    : metrics[(current + metrics.length - 1) % metrics.length]
                                  setMetric(next)
                                  // Keep roving-tab focus aligned with the
                                  // selected tab after keyboard navigation.
                                  requestAnimationFrame(() => {
                                    document.getElementById(`studio-metric-tab-${next}-${j.id}`)?.focus()
                                  })
                                }}
                                onClick={() => setMetric(m)}
                                title={
                                  m === 'position' ? 'Sparkline: average position (lower = better)'
                                  : m === 'impressions' ? 'Sparkline: daily search impressions (higher = better)'
                                  : 'Sparkline: daily clicks (higher = better)'
                                }
                                style={{
                                  fontFamily: C.mono, fontSize: 9, letterSpacing: '0.04em', fontWeight: 700,
                                  padding: '3px 8px', border: 'none', borderRadius: 0,
                                  background: active ? E.ink : 'transparent',
                                  color: active ? E.ivory : E.inkDim,
                                  cursor: 'pointer', transition: 'opacity 0.15s',
                                  opacity: active ? 1 : 0.85,
                                }}
                              >
                                {metricGlyph[m]} {metricLabel[m]}
                              </button>
                            )
                          })}
                        </div>
                        <div id={`studio-metric-panel-${j.id}`} role="tabpanel"
                          aria-labelledby={`studio-metric-tab-${activeMetric}-${j.id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <svg width={sparkPts > 1 ? 120 : 0} height={28} viewBox="0 0 120 28"
                            xmlns="http://www.w3.org/2000/svg" aria-label={`${activeMetric} trend`}>
                            {sparkPath && <path d={sparkPath} fill="none" stroke={trendColor} strokeWidth={1.5} />}
                          </svg>
                          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: E.ink }}>
                            {metricLabel[activeMetric]} {metricText(activeMetric)}
                          {metricDelta != null && Math.abs(metricDelta) >= (activeMetric === 'position' ? 0.05 : 1) && (
                            <span style={{ marginLeft: 4, color: trendColor }}>
                              {arrowGlyph(activeMetric)} {fmtN(Math.abs(metricDelta))}
                            </span>
                          )}
                          </div>
                        </div>
                      </div>
                      {/* Selected series uses the latest daily point; the
                          footer below uses the aggregate GSC snapshot. */}
                      {/* Always show the complete GSC snapshot beneath the
                          selected series: position, impressions, clicks, CTR. */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 9.5, color: E.inkDim, paddingLeft: 4 }}>
                        <span style={{ color: activeMetric === 'position' ? trendColor : E.inkDim }}>pos {trend.position?.toFixed(1) ?? '—'}</span>
                        <span style={{ color: activeMetric === 'impressions' ? trendColor : E.inkDim }}>{fmtN(trend.impressions)} imp</span>
                        <span style={{ color: activeMetric === 'clicks' ? trendColor : E.inkDim }}>{fmtN(trend.clicks)} clk</span>
                        <span>{formatCtr(trend.ctr)} CTR</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontFamily: C.mono, fontSize: 10.5, color: E.inkMuted, fontStyle: 'italic' }}>
                      {trendsLoading
                        ? '⌛ Loading GSC trend…'
                        : trendsError
                          ? `GSC trend unavailable: ${trendsError}`
                          : canonical
                            ? 'Not in GSC top pages yet'
                            : 'Canonical not registered'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: C.mono, fontSize: 10, color: E.inkMuted }}>
                    <span>{j.branch_name || 'main'}</span>
                    <span>·</span>
                    <span>{timeAgo(j.merged_at || j.updated_at || j.created_at)}</span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CREATE TAB ──
// Numbered wizard: 1 Target → 2 Brief → 3 Interlinks → Generate.
// Props carry all state up so the parent can run generation.
function CreateWizard({
  generating,
  onGenerate,
  contentType, setContentType, onContentTypeTouched,
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
  stepScope,
}: {
  generating: boolean
  onGenerate: (data: any) => void
  contentType: ContentType; setContentType: (v: ContentType) => void
  onContentTypeTouched?: () => void
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
  stepScope?: 'define' | 'investigate' | 'all'
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

  const wizardStep = (n: number, label: string, done: boolean) => (
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
        {/* ── STEP 1 · Target ── */}{wizardStep(1,'Pick the target — where should this live?', Boolean(contentType))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginBottom: 12 }}>
          {CONTENT_TYPE_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => { setContentType(opt.value); onContentTypeTouched?.() }} style={{
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
            <label style={labelStyle}>Drafting AI model</label>
            <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={inputStyle}>
              {DRAFTING_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── STEP 2 · Brief ── */}{wizardStep(2,'Shape the brief — what should the AI write?', Boolean(topic.trim() || title.trim()))}
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

        {/* ── STEP 3 · Interlinks ── */}{wizardStep(3,'Wire the internal links — who links to whom, and why', Boolean(briefInterlinks && briefInterlinks.length > 0))}
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
        <div data-step="generate-cta"><button type="submit" disabled={generating || !canGenerate} style={{
          width: '100%', marginTop: 16, padding: '12px 0', borderRadius: C.radiusXs, border: 'none',
          cursor: generating || !canGenerate ? 'not-allowed' : 'pointer',
          background: generating ? C.textDim : C.navy, color: '#FFFFFF',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: generating || !canGenerate ? 0.6 : 1,
          boxShadow: '0 4px 14px rgba(15,23,42,0.18)',
        }}>
          {generating ? '⚡ Generating… (watch the live pipeline below)' : '⚡ Generate & Open PR'}
        </button></div>
        {!canGenerate && (
          <div style={{ marginTop: 6, fontSize: 9.5, color: C.textDim, textAlign: 'center', fontFamily: C.mono }}>
            Add a topic or title to enable generation.
          </div>
        )}
      </form>
    </div>
  )
}

// ── II · RESEARCH QUESTION PANEL ──
// Renders Step 1 (Target) + Step 2 input fields of CreateWizard.
// All state is owned by the parent AdminContentStudio; this is a chrome
// shim that hides the autopilot-preview + interlinks + generate CTA so
// Step III reads as "name the question".
function Step1Define(props: Omit<React.ComponentProps<typeof CreateWizard>, 'stepScope'>) {
  return (
    <div data-testid="studio-define-panel" data-step-scope="define">
      <style>{`
        [data-step-scope="define"] [data-step="autopilot-preview"],
        [data-step-scope="define"] [data-step="3"],
        [data-step-scope="define"] [data-step="generate-cta"] {
          display: none !important;
        }
      `}</style>
      <CreateWizard {...props} stepScope={'define' as const} />
    </div>
  )
}

// ── III · METHOD & BRIEF PANEL ──
// Renders Step 2's autopilot brief preview + Step 3 interlinks + the
// Generate & ship CTA. Step 1 (Target) is hidden so the destination already
// chosen in III · Define persists through investigation.

// ── II · BRIEF ASSEMBLY PANEL ──
// The planning stage surface — every element of the AI's instructions
// is visible and editable here before a single token is generated.
const BriefAssemblyPanel = React.forwardRef<{ submit: () => void }, {
  generating: boolean
  onGenerate: (fd: Record<string, any>) => void
  contentType: ContentType; setContentType: (v: ContentType) => void
  onContentTypeTouched?: () => void
  region: Region; setRegion: (v: Region) => void
  tone: Tone; setTone: (v: Tone) => void
  aiProvider: string; setAiProvider: (v: string) => void
  title: string; setTitle: (v: string) => void
  topic: string; setTopic: (v: string) => void
  audience: string; setAudience: (v: string) => void
  keywords: string; setKeywords: (v: string) => void
  suggestions: any[]; gscStatus: any
  brief: AISuggestion | null; onClearBrief: () => void
  briefInterlinks: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  onBriefInterlinksChange?: (links: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>) => void
  autoInterlinkBusy: boolean; onAutoInterlink: () => void
  interlinkStage: string; setInterlinkStage: (v: string) => void
  selectedBrief?: AISuggestion | null
  setActionNotice?: (msg: string) => void
  /** Discover-stage intelligence fed into the full-brief generator. */
  radarMeta?: Record<string, unknown> | null
  completedWorkSlugs?: Array<{ slug: string; topic: string }>
}>(function BriefAssemblyPanel(
  {
    generating, onGenerate,
    contentType, setContentType, onContentTypeTouched,
    region, setRegion,
    tone, setTone,
    aiProvider, setAiProvider,
    title, setTitle,
    topic, setTopic,
    audience, setAudience,
    keywords, setKeywords,
    suggestions, gscStatus,
    brief, onClearBrief, briefInterlinks,
    onBriefInterlinksChange,
    autoInterlinkBusy, onAutoInterlink,
    interlinkStage, setInterlinkStage,
    selectedBrief,
    setActionNotice,
    radarMeta,
    completedWorkSlugs,
  },
  ref,
) {
  const kwList = React.useMemo(() => keywords.split(',').map(k => k.trim()).filter(Boolean), [keywords])
  const shortKw = React.useMemo(() => kwList.filter(k => k.split(/\s+/).length <= 3), [kwList])
  const longKw = React.useMemo(() => kwList.filter(k => k.split(/\s+/).length >= 4), [kwList])
  const shortOk = shortKw.length >= 5
  const longOk = longKw.length >= 4

  // H2 outline — editable
  const [h2s, setH2s] = React.useState<string[]>(() => {
    if (selectedBrief?.keywords?.length) {
      const stems = selectedBrief.keywords.filter(k => k.length > 4).slice(0, 5)
        .map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())
      return stems.length >= 3 ? stems : ['Eligibility Requirements', 'Application Process', 'Required Documents', 'Timeline & Fees', 'Common Questions']
    }
    return ['Overview', 'Eligibility Requirements', 'Application Process', 'Required Documents', 'Timeline & Processing', 'Frequently Asked Questions']
  })
  const [sources, setSources] = React.useState<string[]>(() => selectedBrief?.signals?.filter((s: string) => s.startsWith('http') || s.includes('.gov') || s.includes('.edu'))?.slice(0, 4) ?? [])
  const [minWords, setMinWords] = React.useState<number>(() => contentType === 'blog_post' ? 900 : contentType === 'regional_page' ? 1400 : 1800)
  const [maxWords, setMaxWords] = React.useState<number>(() => contentType === 'blog_post' ? 1600 : contentType === 'regional_page' ? 2200 : 2800)
  const [targetSlug, setTargetSlug] = React.useState('')
  const [showPromptPreview, setShowPromptPreview] = React.useState(false)
  const [newSource, setNewSource] = React.useState('')
  const [newH2, setNewH2] = React.useState('')

  // Keyword placement plan: which keyword → which H2 section
  const [kwH2Map, setKwH2Map] = React.useState<Record<string, string>>({})
  const [suggestingKeywords, setSuggestingKeywords] = React.useState(false)

  // AI-powered full-brief generation — GPT Luna ingests ALL Discover intel
  // (radar gaps, GSC demand, LLM visibility, backlink gaps, completed work,
  // verified interlinks) and produces a maximally prescriptive brief so the
  // drafting AI has zero room to hallucinate.
  const [briefGenerating, setBriefGenerating] = React.useState(false)
  const handleGenerateBrief = async () => {
    if (!topic.trim()) { setActionNotice?.('Enter a topic first'); return }
    setBriefGenerating(true)
    try {
      const gscData = (gscStatus && typeof gscStatus === 'object') ? gscStatus as Record<string, unknown> : {}
      const r = (radarMeta && typeof radarMeta === 'object') ? radarMeta as Record<string, unknown> : {}
      const res = await fetch('/api/content-studio/suggest-brief', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic, region, contentType, primaryKeyword: title || topic, audience,
          // Research/Plan stays on GPT Terra regardless of the drafting model
          // selection — drafting runs open-source (GLM 5.2 Fast default).
          aiProvider: 'gpt-5.6-terra',
          gscImpressions: gscData.impressions || 0,
          gscPosition: gscData.position || 0,
          gscClicks: gscData.clicks || 0,
          radarGaps: Array.isArray(r.gapOpportunities) ? r.gapOpportunities : [],
          llmVisibility: r.llmVisibility || null,
          backlinkGaps: Array.isArray(r.backlinkGaps) ? r.backlinkGaps : [],
          completedWork: completedWorkSlugs || [],
          interlinks: briefInterlinks || [],
        }),
      })
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) throw new Error(String(data.error || 'Unknown error'))
      if (typeof data.suggestedH1 === 'string' && data.suggestedH1.trim()) setTitle(data.suggestedH1)
      if (Array.isArray(data.h2Outline) && data.h2Outline.length) setH2s(data.h2Outline.map(String))
      if (Array.isArray(data.shortTail) && Array.isArray(data.longTail)) {
        const all = [...(data.shortTail as string[]).slice(0, 5), ...(data.longTail as string[]).slice(0, 4)]
        setKeywords(all.join(', '))
      }
      if (Array.isArray(data.sources) && data.sources.length) setSources(data.sources.map(String))
      if (typeof data.targetSlug === 'string' && data.targetSlug.trim()) setTargetSlug(data.targetSlug)
      if (typeof data.recommendedTone === 'string') setTone(data.recommendedTone as Tone)
      if (typeof data.recommendedAudience === 'string') setAudience(data.recommendedAudience)
      if (typeof data.minWords === 'number' && data.minWords > 0) setMinWords(data.minWords)
      if (typeof data.maxWords === 'number' && data.maxWords > 0) setMaxWords(data.maxWords)
      if (data.kwH2Map && typeof data.kwH2Map === 'object') setKwH2Map(data.kwH2Map as Record<string, string>)
      // Merge the brief's interlinkTargets into briefInterlinks (deduped) so
      // the drafting call receives the brief's guaranteed ≥2 verified estate
      // links — not just whatever the registry happened to match earlier.
      const briefTargets = (data as Record<string, unknown>).interlinkTargets
      if (Array.isArray(briefTargets) && briefTargets.length > 0) {
        const prev = briefInterlinks || []
        const seen = new Set(prev.map((l) => l.url))
        const merged = [...prev]
        for (const t of briefTargets as Array<{ label?: unknown; url?: unknown }>) {
          if (t && typeof t.url === 'string' && t.url.trim() && !seen.has(t.url)) {
            merged.push({ label: String(t.label || ''), url: t.url })
            seen.add(t.url)
          }
        }
        onBriefInterlinksChange?.(merged)
      }
      setActionNotice?.(`🧠 Full brief ready: ${String(data.reasoning || '').slice(0, 120)}`)
    } catch (err) {
      setActionNotice?.(`Brief generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally { setBriefGenerating(false) }
  }

  // AI-powered keyword suggestion — analyzes topic + GSC + competition
  const handleAiSuggest = async () => {
    if (!topic.trim()) {
      setActionNotice?.('Enter a topic first before asking for AI keyword suggestions')
      return
    }
    setSuggestingKeywords(true)
    try {
      const gscData = (gscStatus && typeof gscStatus === 'object') ? gscStatus as Record<string, unknown> : {}
      const res = await fetch('/api/content-studio/suggest-keywords', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic, region, contentType, primaryKeyword: title || topic,
          audience,
          gscImpressions: gscData.impressions || 0,
          gscPosition: gscData.position || 0,
          gscClicks: gscData.clicks || 0,
          competitorTerms: brief?.keywords?.slice(0, 8) || [],
        }),
      })
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) throw new Error(String(data.error || 'Unknown error'))
      if (Array.isArray(data.shortTail) && Array.isArray(data.longTail)) {
        const all = [...(data.shortTail as string[]).slice(0, 5), ...(data.longTail as string[]).slice(0, 4)]
        setKeywords(all.join(', '))
        setActionNotice?.(`AI suggested ${all.length} keywords${data.reasoning ? ': ' + String(data.reasoning).slice(0, 100) + '…' : ''}`)
        if (Array.isArray(data.suggestedH2s) && data.suggestedH2s.length > 0) {
          setH2s(data.suggestedH2s as string[])
        }
        if (!title.trim() && typeof data.suggestedH1 === 'string' && data.suggestedH1.trim()) {
          setTitle(data.suggestedH1)
        }
      }
    } catch (err) {
      setActionNotice?.(`AI keyword suggestion failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSuggestingKeywords(false)
    }
  }

  const addSource = () => { if (newSource.trim()) { setSources(p => [...p, newSource.trim()]); setNewSource('') } }
  const removeSource = (i: number) => setSources(p => p.filter((_, idx) => idx !== i))
  const addH2 = () => { if (newH2.trim()) { setH2s(p => [...p, newH2.trim()]); setNewH2('') } }
  const removeH2 = (i: number) => setH2s(p => p.filter((_, idx) => idx !== i))
  const moveH2 = (i: number, dir: number) => {
    setH2s(p => { const n = [...p]; const t = i + dir; if (t < 0 || t >= n.length) return p; [n[i], n[t]] = [n[t], n[i]]; return n })
  }

  // Build the system prompt preview text
  const promptPreview = React.useMemo(() => {
    const lines: string[] = []
    lines.push(`## BRIEF: ${title || topic || '(untitled)'}`)
    lines.push('')
    lines.push('### PAGE IDENTITY')
    lines.push(`- Title: ${title || '(from topic)'}`)
    lines.push(`- Slug: ${targetSlug || '(auto-generated)'}`)
    lines.push(`- Region: ${region}`)
    lines.push(`- Content Type: ${contentType}`)
    lines.push(`- Tone: ${tone}`)
    if (audience) lines.push(`- Audience: ${audience}`)
    lines.push('')
    lines.push('### H2 OUTLINE')
    h2s.forEach((h, i) => {
      const placedKw = Object.entries(kwH2Map).filter(([_, sec]) => sec === h).map(([k]) => k)
      lines.push(`${i + 1}. ## ${h}${placedKw.length ? ` [keywords: ${placedKw.join(', ')}]` : ''}`)
    })
    lines.push('')
    lines.push('### KEYWORD COVERAGE')
    lines.push(`- Short-tail (≤3 words): ${shortKw.length}/5 required — ${shortKw.join(', ') || '(none)'}`)
    lines.push(`- Long-tail (≥4 words): ${longKw.length}/4 required — ${longKw.join(', ') || '(none)'}`)
    lines.push('')
    lines.push('### SOURCES TO CITE')
    if (sources.length) sources.forEach(s => lines.push(`- ${s}`))
    else lines.push('- (no sources specified — AI will find authoritative references)')
    lines.push('')
    lines.push(`### WORD COUNT: ${minWords}–${maxWords} words`)
    lines.push('')
    lines.push('### AI PROVIDER')
    lines.push(`- Selected: ${aiProvider || 'auto (cascade)'}`)
    return lines.join('\n')
  }, [title, topic, targetSlug, region, contentType, tone, audience, h2s, kwH2Map, shortKw, longKw, sources, minWords, maxWords, aiProvider])

  const handleSubmitBrief = () => {
    onGenerate({
      contentType, region, tone, aiProvider: aiProvider || undefined,
      title: title || topic, topic, audience,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      interlinks: briefInterlinks,
      h2Outline: h2s,
      sources,
      minWords, maxWords,
      targetSlug: targetSlug || undefined,
      kwH2Map: Object.keys(kwH2Map).length ? kwH2Map : undefined,
    })
  }

  // Expose submit() so the pinned-topic CTA in the parent (which lives outside
  // this panel) can advance the full brief — including the H2 outline, sources,
  // min/max words, and keyword→H2 map — straight into generation.
  React.useImperativeHandle(ref, () => ({ submit: handleSubmitBrief }))

  const fieldSection: React.CSSProperties = { marginBottom: 18 }
  const fieldGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }
  const inputBase: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${E.hairline}`, borderRadius: 0, background: E.ivory, color: E.ink, fontSize: 12, fontFamily: C.serif, boxSizing: 'border-box' }
  const labelBase: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 9, fontFamily: C.mono, letterSpacing: '0.14em', color: E.inkMuted, textTransform: 'uppercase', fontWeight: 700 }
  const chip = (ok: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 0, fontSize: 9, fontFamily: C.mono, fontWeight: 700, background: ok ? E.mossSoft : '#fff0f0', color: ok ? E.mossGreen : '#a32525' })

  return (
    <div data-testid="studio-brief-assembly" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: E.paper, border: `1px solid ${E.hairline}` }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>STAGE II · PLAN</div>
        <h3 style={{ margin: '4px 0 6px', fontFamily: C.serif, fontSize: 20, color: E.ink }}>Brief Assembly</h3>
        <p style={{ margin: 0, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 12 }}>
          Every field below becomes part of the AI\'s strict template. Nothing is guessed — tweak before you generate.
        </p>
      </div>

      {/* ── IDENTITY ROW: content type, region, tone, AI provider ── */}
      <div style={fieldSection}>
        <div style={fieldGrid}>
          <div>
            <label style={labelBase}>Content Type</label>
            <select value={contentType} onChange={e => { setContentType(e.target.value as ContentType); onContentTypeTouched?.() }} style={inputBase}>
              {CONTENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label} — {o.hint}</option>)}
            </select>
          </div>
          <div>
            <label style={labelBase}>Region</label>
            <select value={region} onChange={e => setRegion(e.target.value as Region)} style={inputBase}>
              {REGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.flag} {o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelBase}>Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value as Tone)} style={inputBase}>
              {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelBase}>Drafting AI Model</label>
            <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={inputBase}>
              {DRAFTING_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── HEADLINE: H1 title, slug, audience ── */}
      <div style={fieldSection}>
        <div style={fieldGrid}>
          <div>
            <label style={labelBase}>Page Title (H1)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Complete Guide to the UK Spouse Visa 2026" style={inputBase} />
          </div>
          <div>
            <label style={labelBase}>Target Slug</label>
            <input value={targetSlug} onChange={e => setTargetSlug(e.target.value)} placeholder="e.g. uk/spouse-visa-guide-2026" style={inputBase} />
          </div>
          <div>
            <label style={labelBase}>Topic / Query</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What users search for" style={inputBase} />
          </div>
          <div>
            <label style={labelBase}>Target Audience</label>
            <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. international students, spouses" style={inputBase} />
          </div>
        </div>
      </div>

      {/* ── H2 OUTLINE — editable list ── */}
      <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
        <label style={{ ...labelBase, marginBottom: 8 }}>H2 Section Outline ({h2s.length} sections)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
          {h2s.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted, minWidth: 20 }}>{i + 1}.</span>
              <input
                value={h} onChange={e => setH2s(p => p.map((v, idx) => idx === i ? e.target.value : v))}
                style={{ ...inputBase, flex: 1, background: E.ivory, fontSize: 13 }}
                placeholder={`Section ${i + 1}`}
              />
              <button onClick={() => moveH2(i, -1)} disabled={i === 0} style={{ ...btnGhost, padding: '3px 6px', fontSize: 10, opacity: i === 0 ? 0.3 : 1 }} title="Move up">↑</button>
              <button onClick={() => moveH2(i, 1)} disabled={i === h2s.length - 1} style={{ ...btnGhost, padding: '3px 6px', fontSize: 10, opacity: i === h2s.length - 1 ? 0.3 : 1 }} title="Move down">↓</button>
              <button onClick={() => removeH2(i)} style={{ ...btnGhost, padding: '3px 7px', fontSize: 10, color: '#a32525', borderColor: '#a32525' }} title="Remove">×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newH2} onChange={e => setNewH2(e.target.value)} placeholder="Add section…" style={{ ...inputBase, flex: 1, maxWidth: 320 }} onKeyDown={e => e.key === 'Enter' && addH2()} />
          <button onClick={addH2} style={{ ...btnGhost, padding: '6px 12px' }}>+ Add H2</button>
        </div>
      </div>

      {/* ── KEYWORDS + DISTRIBUTION ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Keywords textarea */}
        <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelBase}>Keywords (comma-separated)</label>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={suggestingKeywords || !topic.trim() || generating}
              style={{
                padding: '4px 12px', borderRadius: 6, border: `1px solid ${E.gold}`,
                background: suggestingKeywords ? E.goldSoft : 'transparent',
                color: suggestingKeywords ? E.goldDeep : E.gold,
                cursor: suggestingKeywords || !topic.trim() ? 'not-allowed' : 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: E.mono,
                opacity: suggestingKeywords ? 0.8 : 1,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
              title={!topic.trim() ? 'Enter a topic first' : 'AI analyzes your topic + GSC + content type to suggest optimal short & long-tail keywords'}
            >
              {suggestingKeywords ? '⏳ AI analyzing…' : '🤖 AI Suggest Keywords'}
            </button>
            <button
              type="button"
              onClick={handleGenerateBrief}
              disabled={briefGenerating || !topic.trim() || generating}
              style={{
                padding: '4px 12px', borderRadius: 6, border: `1px solid ${E.inkBlack}`,
                background: briefGenerating ? E.inkBlack : 'transparent',
                color: briefGenerating ? E.ivory : E.inkBlack,
                cursor: briefGenerating || !topic.trim() ? 'not-allowed' : 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: E.mono,
                opacity: briefGenerating ? 0.85 : 1,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
              title={!topic.trim() ? 'Enter a topic first' : 'GPT Luna reads all Discover intel — radar, GSC, LLM visibility, backlinks — and builds a complete prescriptive brief'}
            >
              {briefGenerating ? '🧠 GPT Luna building brief…' : '🧠 Generate Full Brief'}
            </button>
          </div>
          <textarea
            value={keywords} onChange={e => setKeywords(e.target.value)}
            rows={4} placeholder="e.g. uk spouse visa, financial requirement, partner visa 2026, minimum income threshold, appendix fm..."
            style={{ ...inputBase, resize: 'vertical', fontFamily: C.mono, fontSize: 11 }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={chip(shortOk)}>{shortOk ? '✓' : '!'} {shortKw.length}/5 short-tail</span>
            <span style={chip(longOk)}>{longOk ? '✓' : '!'} {longKw.length}/4 long-tail</span>
          </div>
        </div>
        {/* Keyword → section mapping */}
        <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
          <label style={labelBase}>Keyword Placement (assign to H2)</label>
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {kwList.slice(0, 14).map(kw => (
              <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: E.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw}</span>
                <select
                  value={kwH2Map[kw] || ''}
                  onChange={e => setKwH2Map(p => e.target.value ? { ...p, [kw]: e.target.value } : { ...p, [kw]: undefined as any, ...Object.keys(p).filter(k => k !== kw).length ? {} : {} as any })}
                  style={{ ...inputBase, width: 140, fontSize: 10, padding: '4px 6px' }}
                >
                  <option value="">Auto</option>
                  {h2s.map(h => <option key={h} value={h}>{h.length > 20 ? h.slice(0, 17) + '…' : h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SOURCES ── */}
      <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
        <label style={labelBase}>Sources to Cite ({sources.length} specified)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {sources.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: E.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {s}</span>
              <button onClick={() => removeSource(i)} style={{ ...btnGhost, padding: '2px 7px', fontSize: 10, color: '#a32525', borderColor: '#a32525' }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="https://..." style={{ ...inputBase, flex: 1, maxWidth: 460 }} onKeyDown={e => e.key === 'Enter' && addSource()} />
          <button onClick={addSource} style={{ ...btnGhost, padding: '6px 12px' }}>+ Add</button>
        </div>
      </div>

      {/* ── WORD COUNT ── */}
      <div style={fieldSection}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div>
            <label style={labelBase}>Min Words</label>
            <input type="number" value={minWords} onChange={e => setMinWords(Number(e.target.value) || 800)} style={{ ...inputBase, width: 100 }} min={400} max={5000} />
          </div>
          <div>
            <label style={labelBase}>Max Words</label>
            <input type="number" value={maxWords} onChange={e => setMaxWords(Number(e.target.value) || 2000)} style={{ ...inputBase, width: 100 }} min={600} max={8000} />
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, marginLeft: 8 }}>
            Blog: 900–1600 &nbsp;|&nbsp; Article: 1800–2800 &nbsp;|&nbsp; Regional: 1400–2200
          </span>
        </div>
      </div>

      {/* ── INTERLINKS ── */}
      {briefInterlinks && briefInterlinks.length > 0 && (
        <div style={{ background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelBase, marginBottom: 0 }}>Interlink Targets ({briefInterlinks.length} links)</label>
            <button onClick={onAutoInterlink} disabled={autoInterlinkBusy} style={{ ...btnGhost, padding: '4px 10px', fontSize: 10 }}>
              {autoInterlinkBusy ? '⏳ Finding…' : 'Find interlinks'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {briefInterlinks.slice(0, 10).map((l, i) => (
              <span key={i} style={{ padding: '3px 8px', background: E.ivory, border: `1px solid ${E.hairline}`, fontSize: 10, fontFamily: C.mono, color: E.ink }}>
                {l.site ? `${l.site} → ` : ''}{l.label || l.url}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── SYSTEM PROMPT PREVIEW (collapsible) ── */}
      <div style={{ background: '#0F172A', border: `1px solid ${E.hairline}` }}>
        <button
          type="button"
          onClick={() => setShowPromptPreview(p => !p)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#F8FAFC', fontFamily: C.serif, fontSize: 13, fontWeight: 600,
          }}
        >
          <span>{showPromptPreview ? '▾' : '▸'} AI System Prompt Preview</span>
          <span style={{ fontSize: 9, fontFamily: C.mono, color: 'rgba(255,255,255,0.45)' }}>
            This exact text goes to the model
          </span>
        </button>
        {showPromptPreview && (
          <pre style={{
            margin: 0, padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.1)',
            overflowX: 'auto', fontFamily: C.mono, fontSize: 10, lineHeight: 1.5,
            color: '#CBD5E1', background: 'rgba(0,0,0,0.3)', maxHeight: 360, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {promptPreview}
          </pre>
        )}
      </div>

      {/* ── GENERATE DRAFT BUTTON ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
        <div style={{ fontFamily: C.serif, fontSize: 12, color: E.inkMuted, fontStyle: 'italic' }}>
          {!title.trim() && !topic.trim() ? 'Enter a title or topic to begin.' :
           !shortOk || !longOk ? `Add ${!shortOk ? 5 - shortKw.length : 0} more short-tail and ${!longOk ? 4 - longKw.length : 0} more long-tail keywords.` :
           'Ready. Click Generate Draft to send this exact brief to the AI.'}
        </div>
        <button
          type="button"
          onClick={handleSubmitBrief}
          disabled={generating || !(title.trim() || topic.trim()) || !shortOk || !longOk}
          style={{
            padding: '14px 32px', background: (title.trim() || topic.trim()) && shortOk && longOk ? E.gold : E.inkDim,
            color: E.ivory, fontSize: 15, fontWeight: 700, fontFamily: C.serif,
            border: 'none', borderRadius: 0, cursor: generating || !(title.trim() || topic.trim()) || !shortOk || !longOk ? 'not-allowed' : 'pointer',
            opacity: generating || !(title.trim() || topic.trim()) || !shortOk || !longOk ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {generating ? '⏳ Generating…' : 'Generate Draft →'}
        </button>
      </div>
    </div>
  )
})


// ── III · DRAFT WORKSPACE ──
// Word-document style workspace where AI-generated content streams inline.
// The admin sees every token as it arrives and can edit in real time.
// Replaces the old dark LiveGenerationPanel with a proper document editor.
function DraftWorkspace({
  generating, generationEvents, generationStartedAt, generationChars, generationText,
  rescueStats, triedProviders,
  completedJob, selectedJob, setSelectedJob,
  onContinueToReview, selectTab, error, setError,
}: {
  generating: boolean
  generationEvents: GenerationActivity[]
  generationStartedAt: number | null
  generationChars: number
  generationText: string
  rescueStats: DepthRescueStats | null
  triedProviders: string[]
  completedJob: ContentJob | null
  selectedJob: ContentJob | null
  setSelectedJob: (j: ContentJob | null) => void
  onContinueToReview: () => void
  selectTab: (k: StudioTab) => void
  error: string | null
  setError: (e: string | null) => void
}) {   const [draftContent, setDraftContent] = React.useState('')
  const [draftTitle, setDraftTitle] = React.useState('')
  const [reviewModel, setReviewModel] = React.useState('gpt-5.6-sol')
  const lastEventRef = React.useRef<string>('')
  const livePreviewRef = React.useRef<HTMLDivElement | null>(null)

  // Track streaming: accumulate deltas into draftContent
  React.useEffect(() => {
    if (!generating) return
    const latest = generationEvents[generationEvents.length - 1]
    if (!latest || latest.id === lastEventRef.current) return
    lastEventRef.current = latest.id
    // The streaming content comes from the completed job or delta events
    // For now, we show the generation activity in a stream log and rely on
    // the completed job for the full content
  }, [generationEvents, generating])

  // When job completes, load its content into the editor
  React.useEffect(() => {
    if (completedJob?.content) {
      setDraftContent(completedJob.content)
      setDraftTitle(completedJob.title || 'Untitled')
    }
  }, [completedJob])

  // Auto-scroll the live preview to the newest streamed words
  React.useEffect(() => {
    const el = livePreviewRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [generationText])

  const elapsed = generationStartedAt ? fmtDur(Date.now() - generationStartedAt) : ''
  const hasContent = draftContent.length > 0
  const latestEvent = generationEvents[generationEvents.length - 1]
  const isStreaming = generating
  const hasCompleted = Boolean(completedJob && !generating)
  const gatePassed = completedJob?.audit_json && (completedJob.audit_json.score ?? 0) >= 90
  const wordCount = completedJob?.word_count || (draftContent ? draftContent.split(/\s+/).filter(Boolean).length : 0)
  // Depth-rescue / audit activity — recorded from SSE progress (stage 'refine')
  // and attempt (stage 'audit') events. Shown as a persistent realtime feed so
  // expand/append passes with growing word counts stay visible during AND after
  // streaming (the empty-state log alone disappears the moment deltas arrive).
  const auditRecords = generationEvents.filter((e) => e.stage === 'audit' || e.stage === 'refine')
  // Live rescue stats take priority; fall back to the completed job's persisted
  // stats (audit_json.rescue) so the strip survives reloads and queue re-opens.
  const effectiveRescue = rescueStats ?? completedJob?.audit_json?.rescue ?? null

  return (
    <>
      <style>{`
        @keyframes studioCursorBlink {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.15; }
        }
      `}</style>
      <div data-testid="studio-draft-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Streaming status bar (minimal, not the old heavy panel) ── */}
      {(generating || hasCompleted) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
          background: generating ? '#FFF7ED' : hasCompleted && gatePassed ? '#ECFDF5' : '#F9FAFB',
          border: `1px solid ${generating ? '#FED7AA' : hasCompleted && gatePassed ? '#A7F3D0' : E.hairline}`,
          flexWrap: 'wrap',
        }}>
          {generating ? (
            <>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#F59E0B', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
              <span style={{ fontFamily: C.serif, fontSize: 13, color: '#92400E', fontWeight: 600 }}>
                AI is writing… {elapsed}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: '#B45309', marginLeft: 4 }}>
                {generationChars.toLocaleString()} chars streamed
              </span>
              {triedProviders.length > 0 && (
                <span style={{ fontFamily: C.mono, fontSize: 9, color: '#78350F', background: '#FEF3C7', padding: '2px 7px', borderRadius: 3, marginLeft: 6, fontWeight: 600 }}>
                  {triedProviders.length === 1 ? `Trying ${triedProviders[0]}…` : `Cascade: ${triedProviders.join(' → ')}`}
                </span>
              )}
              <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, marginLeft: 'auto' }}>
                {latestEvent?.message || 'Connecting…'}
              </span>
            </>
          ) : hasCompleted && gatePassed ? (
            <>
              <span style={{ fontFamily: C.serif, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                ✓ Generation complete · {wordCount} words · gate passed
              </span>
              <button
                type="button"
                onClick={onContinueToReview}
                style={{
                  marginLeft: 'auto', padding: '8px 18px', background: E.gold, color: E.ivory,
                  border: 'none', borderRadius: 0, cursor: 'pointer',
                  fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                }}
              >
                Continue to Review →
              </button>
            </>
          ) : hasCompleted ? (
            <>
              <span style={{ fontFamily: C.serif, fontSize: 13, color: '#92400E', fontWeight: 600 }}>
                ⚠ Generation complete but gate not yet passed · {wordCount} words
              </span>
              <button
                type="button"
                onClick={onContinueToReview}
                style={{
                  marginLeft: 'auto', padding: '8px 18px', background: '#F59E0B', color: '#FFF',
                  border: 'none', borderRadius: 0, cursor: 'pointer',
                  fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                }}
              >
                Review & fix →
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', padding: '10px 16px', fontSize: 12, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: C.mono, fontSize: 11 }}>⚠ {error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: C.red }}>×</button>
        </div>
      )}

      {/* ── Document editor area — the word-document workspace ── */}
      <div style={{
        background: E.paper, border: `1px solid ${E.hairline}`,
        minHeight: 400, display: 'flex', flexDirection: 'column',
      }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, padding: '0',
          borderBottom: `1px solid ${E.hairline}`, background: '#FAFAFA',
          overflow: 'hidden',
        }}>
          <span style={{
            padding: '8px 14px', fontFamily: C.mono, fontSize: 9, color: E.inkMuted,
            letterSpacing: '0.10em', textTransform: 'uppercase', borderRight: `1px solid ${E.hairline}`,
          }}>
            {generating ? 'STREAMING' : 'DRAFT'}
          </span>
          <span style={{
            padding: '8px 14px', fontFamily: C.mono, fontSize: 9, color: E.inkMuted,
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            {draftTitle || '(untitled)'}
          </span>
          <span style={{ marginLeft: 'auto', padding: '0 14px', fontFamily: C.mono, fontSize: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
            {(() => {
              const wc = generating
                ? generationText.split(/\s+/).filter(Boolean).length
                : wordCount
              const minW = completedJob?.content_type === 'blog_post' ? 800 : completedJob?.content_type === 'regional_page' ? 1200 : 2200
              const maxW = completedJob?.content_type === 'blog_post' ? 1500 : completedJob?.content_type === 'regional_page' ? 2000 : 2800
              const pct = Math.min(100, Math.round((wc / maxW) * 100))
              const overMax = wc > maxW
              const underMin = wc < minW
              const wcColor = overMax ? C.red : underMin ? C.orange : pct >= 80 ? C.mossGreen : C.textDim
              const barColor = overMax ? C.red : underMin ? C.orange : C.gold
              return (
                <>
                  <span style={{ color: wcColor, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>
                    {wc.toLocaleString()} w
                  </span>
                  <span style={{ color: E.inkDim, fontSize: 8 }}>/ {minW.toLocaleString()}–{maxW.toLocaleString()}</span>
                  <span style={{
                    display: 'inline-block', width: 48, height: 3,
                    background: E.hairline, borderRadius: 2, overflow: 'hidden',
                  }}>
                    <span style={{
                      display: 'block', height: '100%',
                      width: `${overMax ? 100 : Math.max(2, pct)}%`,
                      background: barColor,
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }} />
                  </span>
                </>
              )
            })()}
            <span style={{ color: E.inkDim, fontSize: 8 }}>
              {generating ? `${generationText.length.toLocaleString()}c` : `${draftContent.length.toLocaleString()}c`}
            </span>
          </span>
        </div>

        {/* Editor body */}
        {generating && generationText.length > 0 ? (
          /* Live preview — streamed content visible in real-time during generation */
          <div ref={livePreviewRef} style={{
            marginTop: 14, padding: '16px 18px', background: E.paper,
            border: '1px solid ' + E.hairline, borderRadius: 0,
            maxHeight: 480, overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
              borderBottom: '1px solid ' + E.hairline, paddingBottom: 8,
            }}>
              <span style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
                ✍️ AI WRITING LIVE
              </span>
              <span style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono }}>
                {generationText.length.toLocaleString()} chars · ~{Math.round(generationText.split(/\s+/).filter(Boolean).length)} words
              </span>
            </div>
            <div style={{
              fontFamily: C.serif, fontSize: 13, lineHeight: 1.7, color: E.ink,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {generationText.length > 2000
                ? generationText.slice(-2000)
                : generationText}
              <span style={{
                display: 'inline-block', width: 8, height: 14,
                background: E.gold,
                verticalAlign: 'text-bottom', marginLeft: 1,
                animation: 'studioCursorBlink 1s ease-in-out infinite',
              }} />
            </div>
          </div>
        ) : generating && !hasContent ? (
          /* Empty state while streaming hasn't yielded content yet */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
            <div style={{ fontFamily: C.serif, fontSize: 18, color: E.inkMuted, fontStyle: 'italic' }}>
              The AI is composing your draft…
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: E.inkDim }}>
              {latestEvent?.message || 'Initializing pipeline…'}
            </div>
            {/* Minimal activity log */}
            <div style={{ maxWidth: 500, width: '100%', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {generationEvents.slice(-10).map((e) => (
                <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, minWidth: 72 }}>{fmtTime(e.ts)}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: e.level === 'error' ? '#DC2626' : e.level === 'warn' ? '#D97706' : e.level === 'success' ? '#166534' : '#2563EB', flex: 1 }}>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : hasContent ? (
          /* Content ready — render in AdminInlineEditor */
          <div style={{ flex: 1, padding: 0 }}>
            <AdminInlineEditor
              content={draftContent}
              jobId={completedJob?.id || ''}
              onChange={(text) => setDraftContent(text)}
              disabled={generating}
              contentType={completedJob?.content_type}
              primaryKeyword={completedJob?.primary_keyword ?? undefined}
              indexable={completedJob?.indexable}
              region={completedJob?.region ?? undefined}
              reviewModel={reviewModel}
              onReviewModelChange={setReviewModel}
            />
          </div>
        ) : (
          /* No activity yet — prompt to generate */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
            <div style={{ fontFamily: C.serif, fontSize: 22, color: E.ink }}>No draft yet</div>
            <p style={{ color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', margin: 0, textAlign: 'center', maxWidth: 420 }}>
              Go to <b>II · Research & Plan</b> to define your keywords and brief, then click <b>Generate Draft</b>.
              The AI will write live into this workspace.
            </p>
            <button
              type="button"
              onClick={() => selectTab('research')}
              style={{
                marginTop: 8, padding: '10px 22px', background: E.gold, color: E.ivory,
                border: 'none', borderRadius: 0, cursor: 'pointer',
                fontFamily: C.serif, fontSize: 14, fontWeight: 700,
              }}
            >
              ← Go to Research & Plan
            </button>
          </div>
        )}

        {/* ── Depth rescue · attempt feed — realtime expand/append record ──
            Mirrors the rescue loop's progress + attempt events (word counts
            per pass) so the queue shows the draft growing pass by pass. */}
        {(auditRecords.length > 0 || effectiveRescue) && (
          <div data-testid="studio-rescue-feed" style={{
            marginTop: 14, padding: '10px 14px', background: '#FFFDF5',
            border: `1px solid ${E.hairline}`, borderRadius: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
                ⏱ DEPTH RESCUE · ATTEMPT FEED — expand/append passes with word counts
              </div>
              {/* Depth-rescue attempt stats — expansion rounds needed, stall count,
                  and the time budget consumed. Live from the `rescue` event, or
                  read back from the completed job's persisted audit_json.rescue. */}
              {effectiveRescue && (
                <div data-testid="studio-rescue-stats" style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: C.mono, fontSize: 9.5, color: E.inkSoft }}>
                  <span title="Expansion/append rounds the depth rescue needed">
                    <span style={{ color: E.ink, fontWeight: 700 }}>{effectiveRescue.expandPasses}</span> pass{effectiveRescue.expandPasses === 1 ? '' : 'es'}
                  </span>
                  <span
                    title="Consecutive no-growth passes before the rescue moved on"
                    style={{ color: effectiveRescue.stallCount > 0 ? E.ember : E.inkMuted, fontWeight: effectiveRescue.stallCount > 0 ? 700 : 500 }}
                  >
                    {effectiveRescue.stallCount} stall{effectiveRescue.stallCount === 1 ? '' : 's'}
                  </span>
                  <span title="Rescue time budget consumed (budget cap when the draft is saved early)">
                    ⏳ {fmtDur(effectiveRescue.timeMs)} / {fmtDur(effectiveRescue.budgetMs)}
                  </span>
                </div>
              )}
            </div>
            {auditRecords.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {auditRecords.slice(-6).map((e) => (
                  <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontFamily: C.mono, fontSize: 10 }}>
                    <span style={{ color: E.inkDim, minWidth: 70 }}>{fmtTime(e.ts)}</span>
                    <span style={{ color: e.level === 'success' ? '#166534' : e.level === 'warn' ? '#D97706' : '#2563EB', flex: 1 }}>
                      {e.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

function Step2Investigate(props: Omit<React.ComponentProps<typeof CreateWizard>, 'stepScope'>) {
  return (      <div data-testid="studio-method-panel" data-step-scope="investigate">
      <style>{`
        [data-step-scope="investigate"] [data-step="1"] {
          display: none !important;
        }
      `}</style>
      <CreateWizard {...props} stepScope={'investigate' as const} />
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
  // Drafting runs on open-source models — GLM 5.2 Fast (Baseten) is the
  // default. GPT stays out of the draft itself (Research = Terra, Review = Sol).
  const [aiProvider, setAiProvider] = React.useState<string>('baseten-glm-fast')
  const [reviewModel, setReviewModel] = React.useState<string>('gpt-5.6-sol')
  const [actionChars, setActionChars] = React.useState(0)
  const [resumeAvailable, setResumeAvailable] = React.useState(false)
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
              {DRAFTING_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            : <AdminInlineEditor content={editorContent} jobId={detail.id} onChange={(v: string) => setEditorContent(v)} disabled={busy || terminal} onScoreChange={(s) => setAudit(s != null ? { score: s } : null)} contentType={detail.content_type} primaryKeyword={detail.primary_keyword ?? undefined} indexable={detail.indexable} region={detail.region ?? undefined} reviewModel={reviewModel} onReviewModelChange={setReviewModel} />}
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

// ════════════════════════════════════════════════════════════════════════════════
// ── EDITORIAL SPREAD (linear narrative: engine → ledger) ──
// ════════════════════════════════════════════════════════════════════════════════
// ── RESEARCH DOSSIER LIVE OPERATIONS ────────────────────────────────────────
// These compact cards preserve the former Command Center's live evidence
// surfaces without bringing its competing navigation/state machine back into
// the dissertation flow. Every number is fetched from its owning API and is
// explicitly marked with the last successful read; failures remain visible.
// ── UNIFIED WORK PLAN TABLE ──
// Aggregates all signal sources (radar, cannibal, merges, backlinks, visibility)
// into one sortable, filterable table. Multi-select sends items to Research.
type WorkPlanCategory = 'gap' | 'refresh' | 'expansion' | 'cannibal' | 'merge' | 'backlink' | 'visibility'
interface WorkPlanItem {
  id: string
  category: WorkPlanCategory
  title: string
  topic: string
  source: string
  priority: number
  signals: string[]
  keywords?: string[]
  audience?: string
  play?: string
  suggestion?: AISuggestion
  mergeRecord?: CannibalMergeRecord
}

const CATEGORY_META: Record<WorkPlanCategory, { label: string; bg: string; fg: string; icon: string }> = {
  gap: { label: 'GAP', bg: '#DBEAFE', fg: '#1E40AF', icon: '🧩' },
  refresh: { label: 'REFRESH', bg: '#FEF3C7', fg: '#92400E', icon: '🔄' },
  expansion: { label: 'EXPAND', bg: '#D1FAE5', fg: '#065F46', icon: '📈' },
  cannibal: { label: 'CANNIBAL', bg: '#FEE2E2', fg: '#991B1B', icon: '⚠️' },
  merge: { label: 'MERGE', bg: '#F3E8FF', fg: '#6B21A8', icon: '🔀' },
  backlink: { label: 'BACKLINK', bg: '#FFF7ED', fg: '#9A3412', icon: '🔗' },
  visibility: { label: 'AEO GAP', bg: '#ECFDF5', fg: '#065F46', icon: '◎' },
}

function buildWorkPlan(
  radar: AISuggestion[],
  radarMeta: Record<string, unknown> | null,
  merges: CannibalMergeRecord[],
): WorkPlanItem[] {
  const items: WorkPlanItem[] = []
  // Radar opportunities → gaps, quick wins, refreshes
  for (const s of radar) {
    const cat: WorkPlanCategory = s.play === 'refresh' || s.play === 'defend' ? 'refresh'
      : s.play === 'cannibalization' ? 'cannibal'
      : 'gap'
    items.push({
      id: `radar-${s.topic}`,
      category: cat,
      title: s.title,
      topic: s.topic,
      source: 'Radar',
      priority: s.opportunityScore ?? s.demandScore ?? 0,
      signals: s.signals ?? [s.reason],
      keywords: s.keywords,
      audience: s.audience,
      play: s.play,
      suggestion: s,
    })
  }
  // Cannibalization from radar meta
  const cannibalList = (radarMeta?.cannibalization as Array<{ term: string; pages: string[] }> | null) || []
  for (const c of cannibalList) {
    items.push({
      id: `cannibal-${c.term}`,
      category: 'cannibal',
      title: `Consolidate: ${c.term}`,
      topic: c.term,
      source: 'Cannibal Watch',
      priority: 70,
      signals: [`${c.pages.length} competing pages target this term`],
    })
  }
  // Merge history
  for (const m of merges) {
    items.push({
      id: `merge-${m.clusterId}`,
      category: 'merge',
      title: `Merged cluster: ${m.stem}`,
      topic: m.stem,
      source: 'Merge History',
      priority: m.status === 'merged' ? 90 : 50,
      signals: [`${m.terms.length} terms · ${m.redirectsCreated} redirects · ${m.status}`],
      mergeRecord: m,
    })
  }
  return items.sort((a, b) => b.priority - a.priority)
}

function WorkPlanTable({
  items, selectedIds, onToggleSelect, onSelectAll, onClearSelection, onSendToResearch,
}: {
  items: WorkPlanItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onSendToResearch: (items: WorkPlanItem[]) => void
}) {
  const [filterCat, setFilterCat] = React.useState<WorkPlanCategory | 'all'>('all')
  const filtered = filterCat === 'all' ? items : items.filter((i) => i.category === filterCat)
  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id))
  const selectedItems = items.filter((i) => selectedIds.has(i.id))

  const CATS: Array<{ key: WorkPlanCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'gap', label: '🧩 Gaps' },
    { key: 'refresh', label: '🔄 Refresh' },
    { key: 'expansion', label: '📈 Expand' },
    { key: 'cannibal', label: '⚠️ Cannibal' },
    { key: 'merge', label: '🔀 Merges' },
    { key: 'backlink', label: '🔗 Backlinks' },
    { key: 'visibility', label: '◎ AEO Gaps' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilterCat(c.key)}
            style={{
              padding: '5px 10px', borderRadius: 999, border: filterCat === c.key ? `1px solid ${E.gold}` : `1px solid ${E.hairline}`,
              background: filterCat === c.key ? E.goldSoft : 'transparent',
              color: filterCat === c.key ? E.gold : E.inkMuted,
              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: C.mono,
            }}
          >{c.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono }}>
            {selectedItems.length} selected · {items.length} total
          </span>
          {selectedItems.length > 0 && (
            <>
              <button type="button" onClick={onClearSelection} style={actionGhostStyle()}>Clear</button>
              <button type="button" onClick={() => onSendToResearch(selectedItems)}
                style={{ ...actionBtnStyle(E.gold), background: E.gold, color: E.ivory }}>
                Send to Research →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 80px 50px 1fr 100px', gap: 0,
          padding: '8px 12px', borderBottom: `1px solid ${E.hairline}`, background: E.parchment,
          fontSize: 9, fontFamily: C.mono, fontWeight: 700, color: E.inkMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          <div>
            <input type="checkbox" checked={allSelected} onChange={allSelected ? onClearSelection : onSelectAll}
              style={{ cursor: 'pointer', accentColor: E.gold }} />
          </div>
          <div>Category</div>
          <div>Score</div>
          <div>Opportunity</div>
          <div>Action</div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 13 }}>
            No work plan items yet. Run the planner from the masthead to ingest knowledge and discover opportunities.
          </div>
        ) : (
          filtered.map((item, i) => {
            const cm = CATEGORY_META[item.category]
            const checked = selectedIds.has(item.id)
            return (
              <div key={item.id} style={{
                display: 'grid', gridTemplateColumns: '32px 80px 50px 1fr 100px', gap: 0,
                padding: '9px 12px', borderBottom: i < filtered.length - 1 ? `1px solid ${E.hairlineSoft}` : 'none',
                background: checked ? '#FFFDF5' : 'transparent',
                alignItems: 'center',
                transition: 'background 0.1s',
              }}>
                <div>
                  <input type="checkbox" checked={checked} onChange={() => onToggleSelect(item.id)}
                    style={{ cursor: 'pointer', accentColor: E.gold }} />
                </div>
                <div>
                  <span style={{
                    display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                    fontSize: 8, fontWeight: 700, fontFamily: C.mono,
                    background: cm.bg, color: cm.fg, whiteSpace: 'nowrap',
                  }}>{cm.icon} {cm.label}</span>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 800, color: item.priority >= 70 ? C.green : item.priority >= 40 ? C.orange : C.textDim }}>
                  {item.priority}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: E.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 8.5, color: E.inkDim, fontFamily: C.mono, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.source} · {item.signals[0] || ''}
                  </div>
                </div>
                <div>
                  {item.suggestion ? (
                    <button type="button" onClick={() => {
                      // Single-item quick apply
                      if (item.suggestion) {
                        // applyBrief is called from parent — we use onSendToResearch for single
                        onSendToResearch([item])
                      }
                    }}
                      style={{ padding: '4px 10px', borderRadius: 0, border: `1px solid ${E.gold}`, background: 'transparent', color: E.gold, cursor: 'pointer', fontSize: 9, fontWeight: 700, fontFamily: C.mono }}>
                      Brief →
                    </button>
                  ) : (
                    <span style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono }}>—</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function ResearchLiveOperations() {
  type Snapshot = {
    fetchedAt: number
    status: { llmVisibility?: { total?: number; cited?: number; shareOfVoice?: number }; rankingModel?: { computed?: number } } | null
    visibility: { total?: number; cited?: number; shareOfVoice?: number; byStage?: Record<string, number> } | null
    backlink: { summary?: { target_total?: number; target_won?: number; inbound_avg?: number; outbound_avg?: number }; targets?: Array<{ id?: string; domain?: string; title?: string | null; target_url?: string | null; authority_score?: number; status?: string }> } | null
    merges: Array<{ clusterId?: string; stem?: string; winnerUrl?: string; recheckDue?: boolean; followUpAt?: number; status?: string }>
    degraded?: boolean
    guidance?: string | null
    errors: Partial<Record<'status' | 'visibility' | 'backlink' | 'merges', string>>
  }
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [competingPages, setCompetingPages] = React.useState<Array<{ url: string; impressions: number; clicks: number; position: number }> | null>(null)
  const [competingTerm, setCompetingTerm] = React.useState<string | null>(null)
  const [competingWinner, setCompetingWinner] = React.useState<string | null>(null)
  const [competingLosers, setCompetingLosers] = React.useState<Set<string>>(new Set())
  const [competingBusy, setCompetingBusy] = React.useState(false)
  const [competingResolveBusy, setCompetingResolveBusy] = React.useState(false)
  const [outreachTarget, setOutreachTarget] = React.useState<{ id: string; label: string } | null>(null)
  const [outreachDraft, setOutreachDraft] = React.useState<{ subject: string; body: string; model?: string | null } | null>(null)
  const [outreachBusy, setOutreachBusy] = React.useState(false)
  const [outreachSaveBusy, setOutreachSaveBusy] = React.useState(false)
  const loadRef = React.useRef<() => Promise<void>>(() => Promise.resolve())

  const inspectCompetingPages = React.useCallback(async (term: string) => {
    setCompetingTerm(term)
    setCompetingBusy(true)
    try {
      const response = await fetch('/api/seo-factory/cannibal-pages', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ term }),
      })
      const body = await response.json().catch(() => ({})) as { pages?: Array<{ url: string; impressions: number; clicks: number; position: number }>; suggestedWinner?: string | null; error?: string }
      if (!response.ok && !Array.isArray(body.pages)) throw new Error(body.error || `Competing-page lookup failed (${response.status})`)
      const pages = Array.isArray(body.pages) ? body.pages : []
      const winner = body.suggestedWinner || pages[0]?.url || null
      setCompetingPages(pages)
      setCompetingWinner(winner)
      setCompetingLosers(new Set(pages.map((page) => page.url).filter((url) => url !== winner)))
    } catch (cause) {
      setCompetingPages([])
      setError(cause instanceof Error ? cause.message : 'Competing-page lookup failed')
    } finally {
      setCompetingBusy(false)
    }
  }, [])

  const resolveCompetingPages = React.useCallback(async () => {
    if (!competingTerm || !competingWinner || competingLosers.size === 0) return
    setCompetingResolveBusy(true)
    try {
      const response = await fetch('/api/seo-factory/cannibal-merge', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ term: competingTerm, winnerUrl: competingWinner, loserUrls: [...competingLosers], mode: 'merge' }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || `Resolution failed (${response.status})`)
      setCompetingTerm(null)
      setCompetingPages(null)
      setCompetingWinner(null)
      setCompetingLosers(new Set())
      setError(null)
      await loadRef.current()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Competing-page resolution failed')
    } finally {
      setCompetingResolveBusy(false)
    }
  }, [competingLosers, competingTerm, competingWinner])

  const openOutreachDraft = React.useCallback(async (target: { id?: string; domain?: string; title?: string | null }) => {
    if (!target.id) return
    setOutreachTarget({ id: target.id, label: target.title || target.domain || target.id })
    setOutreachDraft(null)
    setOutreachBusy(true)
    try {
      const response = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'draft', target_id: target.id, brief: { topic: target.title || target.domain || 'SEO authority opportunity' } }),
      })
      const body = await response.json().catch(() => ({})) as { subject?: string; body?: string; model?: string | null; error?: string }
      if (!response.ok) throw new Error(body.error || `Outreach draft failed (${response.status})`)
      setOutreachDraft({ subject: String(body.subject || ''), body: String(body.body || ''), model: body.model })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Outreach draft failed')
    } finally {
      setOutreachBusy(false)
    }
  }, [])

  const saveOutreachDraft = React.useCallback(async (status: 'drafted' | 'sent') => {
    if (!outreachTarget || !outreachDraft) return
    setOutreachSaveBusy(true)
    try {
      const response = await fetch('/api/seo-engine/backlink/outreach', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'record', target_id: outreachTarget.id, subject: outreachDraft.subject, message_body: outreachDraft.body, status, operator_id: 'admin@portal' }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || `Outreach save failed (${response.status})`)
      setOutreachTarget(null)
      setOutreachDraft(null)
      await loadRef.current()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Outreach save failed')
    } finally {
      setOutreachSaveBusy(false)
    }
  }, [outreachDraft, outreachTarget])

  const load = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    const requests = [
      ['status', '/api/seo-engine/status'],
      ['visibility', '/api/seo-engine/llm-visibility'],
      ['backlink', '/api/seo-engine/backlink?report=full'],
      ['merges', '/api/seo-factory/cannibal-merges'],
    ] as const
    const read = async (key: typeof requests[number][0], path: string) => {
      try {
        const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
        const body = await response.json().catch(() => ({})) as Record<string, any>
        if (!response.ok) throw new Error(String(body.error || `Live evidence request failed (${response.status})`))
        return { key, body, error: null as string | null }
      } catch (cause) {
        return { key, body: null, error: cause instanceof Error ? cause.message : 'Live evidence request failed' }
      }
    }
    const results = await Promise.all(requests.map(([key, path]) => read(key, path)))
    const errors = Object.fromEntries(results.filter((result) => result.error).map((result) => [result.key, result.error!])) as Snapshot['errors']
    const status = results.find((result) => result.key === 'status')?.body || null
    const visibility = results.find((result) => result.key === 'visibility')?.body || null
    const backlink = results.find((result) => result.key === 'backlink')?.body || null
    const merges = results.find((result) => result.key === 'merges')?.body || null
    setSnapshot({
      fetchedAt: Date.now(),
      status,
      visibility,
      backlink,
      merges: Array.isArray(merges?.merges) ? merges.merges : [],
      degraded: Boolean(merges?.degraded),
      guidance: merges?.guidance || null,
      errors,
    })
    setError(Object.values(errors)[0] || null)
    setBusy(false)
  }, [])

  React.useEffect(() => {
    loadRef.current = load
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const due = snapshot?.merges.filter((merge) => merge.recheckDue) || []
  const visibility = snapshot?.visibility || snapshot?.status?.llmVisibility
  const cited = visibility?.cited
  const total = visibility?.total
  const share = visibility?.shareOfVoice
  const summary = snapshot?.backlink?.summary
  const metric = (value: number | undefined, suffix = '') => value == null ? '—' : `${fmtN(value)}${suffix}`
  const serviceError = (key: keyof Snapshot['errors']) => snapshot?.errors[key]

  return (
    <section data-testid="research-live-operations" aria-label="Live research operations" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.16em', color: E.gold, textTransform: 'uppercase', fontWeight: 700 }}>Live evidence services</div>
          <div style={{ marginTop: 2, fontFamily: C.serif, fontSize: 15, color: E.ink }}>Research operations retained from the former Command Center</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: error ? C.red : E.inkMuted }}>
            {error ? `⚠ ${error}` : snapshot ? `Read ${timeAgoMs(snapshot.fetchedAt)}` : 'Reading live services…'}
          </span>
          <button type="button" onClick={() => void load()} disabled={busy} style={busy ? actionDisabledStyle(E.gold) : actionGhostStyle()}>
            {busy ? '⟳ Reading…' : '↻ Refresh evidence'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        <div data-testid="research-visibility-card" style={{ padding: 12, background: E.paper, border: `1px solid ${E.hairline}` }}>
          <CardHeader icon="◎" title="LLM / AEO visibility" sub="Fan-out citation evidence" />
          <div style={{ padding: '10px 12px 2px', display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <strong style={{ fontFamily: C.mono, fontSize: 22, color: E.ink }}>{share == null ? '—' : `${Math.round(Number(share) || 0)}%`}</strong>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted }}>{metric(cited)} cited / {metric(total)} audited</span>
          </div>
          <div style={{ padding: '5px 12px 10px', fontFamily: C.mono, fontSize: 9, color: serviceError('visibility') ? C.red : E.inkMuted }}>{serviceError('visibility') || (snapshot ? 'Source: seo_llm_visibility' : 'No live audit read yet')}</div>
        </div>
        <div data-testid="research-backlink-card" style={{ padding: 12, background: E.paper, border: `1px solid ${E.hairline}` }}>
          <CardHeader icon="↗" title="Knowledge / backlinks" sub="External authority opportunities" />
          <div style={{ padding: '10px 12px 2px', display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <strong style={{ fontFamily: C.mono, fontSize: 22, color: E.ink }}>{metric(summary?.target_total)}</strong>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted }}>{metric(summary?.target_won)} won</span>
          </div>
          <div style={{ padding: '5px 12px 10px', fontFamily: C.mono, fontSize: 9, color: serviceError('backlink') ? C.red : E.inkMuted }}>{serviceError('backlink') || (snapshot ? 'Source: seo_backlink_dashboard' : 'No live opportunity read yet')}</div>
          {snapshot?.backlink?.targets?.slice(0, 2).map((target, index) => (
            <div key={`${target.domain || 'target'}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px' }}>
              <a href={target.target_url || '#'} target="_blank" rel="noreferrer" style={{ minWidth: 0, flex: 1, color: E.goldDeep, fontFamily: C.mono, fontSize: 9, textDecoration: 'none' }}>
                ↗ {target.domain || target.title || 'authority target'} · {target.authority_score ?? '—'} authority
              </a>
              {target.id && <button type="button" onClick={() => void openOutreachDraft(target)} disabled={outreachBusy} style={{ padding: '3px 6px', border: `1px solid ${E.gold}`, background: E.cream, color: E.goldDeep, fontFamily: C.mono, fontSize: 8, cursor: outreachBusy ? 'wait' : 'pointer' }}>{outreachBusy ? '…' : 'Draft outreach'}</button>}
            </div>
          ))}
        </div>
        <div data-testid="research-recheck-card" style={{ padding: 12, background: E.paper, border: `1px solid ${due.length ? '#FECACA' : E.hairline}` }}>
          <CardHeader icon="◷" title="Recheck / competing pages" sub="Cannibalization follow-up queue" />
          <div style={{ padding: '10px 12px 2px', display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <strong style={{ fontFamily: C.mono, fontSize: 22, color: due.length ? C.red : E.ink }}>{snapshot ? due.length : '—'}</strong>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted }}>{snapshot ? `${snapshot.merges.length} decisions` : 'Loading decisions'}</span>
          </div>
          <div style={{ padding: '5px 12px 10px', fontFamily: C.mono, fontSize: 9, color: due.length ? C.red : serviceError('merges') ? C.red : E.inkMuted }}>
            {serviceError('merges') || (due.length ? 'Due clusters:' : snapshot ? 'No rechecks currently due' : 'No live merge read yet')}
          </div>
          {due.slice(0, 3).map((merge, index) => {
            const term = merge.stem || merge.clusterId || `cluster-${index + 1}`
            return <button key={`${term}-${index}`} type="button" onClick={() => void inspectCompetingPages(term)} style={{ margin: '0 12px 5px', padding: '4px 7px', border: `1px solid ${C.red}55`, background: '#FFF7F7', color: C.red, fontFamily: C.mono, fontSize: 9, cursor: 'pointer' }}>{competingBusy && competingTerm === term ? '⟳ Inspecting…' : `Inspect ${term} →`}</button>
          })}
          {competingTerm && competingPages && (
            <div style={{ margin: '2px 12px 10px', padding: 7, background: E.cream, border: `1px dashed ${E.hairline}`, fontFamily: C.mono, fontSize: 9, color: E.inkMuted }}>
              <strong style={{ color: E.ink }}>Competing pages · {competingTerm}</strong>
              {competingPages.length ? competingPages.map((page) => {
                const position = Number(page.position)
                const isWinner = competingWinner === page.url
                const isLoser = competingLosers.has(page.url)
                return <label key={page.url} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: E.goldDeep, cursor: 'pointer' }}>
                  <input type="radio" name={`research-winner-${competingTerm}`} checked={isWinner} onChange={() => { const selection = transferCompetingWinner(competingWinner, page.url, competingLosers); setCompetingWinner(selection.winner); setCompetingLosers(selection.losers) }} />
                  <input type="checkbox" checked={isLoser} disabled={isWinner} onChange={() => setCompetingLosers((current) => { const next = new Set(current); if (next.has(page.url)) next.delete(page.url); else next.add(page.url); return next })} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{Number.isFinite(position) ? position.toFixed(1) : '—'} · {page.url}</span>
                </label>
              }) : <div style={{ marginTop: 4 }}>No competing pages returned.</div>}
              {competingPages.length > 1 && <button type="button" onClick={() => void resolveCompetingPages()} disabled={competingResolveBusy || !competingWinner || competingLosers.size === 0} style={{ marginTop: 7, padding: '5px 7px', border: 'none', background: competingResolveBusy ? C.textDim : C.red, color: '#FFF', fontFamily: C.mono, fontSize: 8, cursor: competingResolveBusy ? 'wait' : 'pointer', opacity: !competingWinner || competingLosers.size === 0 ? 0.5 : 1 }}>{competingResolveBusy ? 'Resolving…' : 'Resolve & 301 losers → winner'}</button>}
            </div>
          )}
        </div>
      </div>
      {outreachTarget && (
        <div role="dialog" aria-label="Draft backlink outreach" style={{ padding: 12, background: E.paper, border: `1px solid ${E.gold}`, boxShadow: E.paperShadow }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><strong style={{ fontFamily: C.serif, color: E.ink }}>Outreach · {outreachTarget.label}</strong><button type="button" onClick={() => { setOutreachTarget(null); setOutreachDraft(null) }} style={actionGhostStyle()}>Close</button></div>
          {outreachBusy && <div style={{ marginTop: 8, fontFamily: C.mono, fontSize: 9, color: E.inkMuted }}>Generating a reviewable outreach draft…</div>}
          {outreachDraft && <><label style={{ display: 'block', marginTop: 8, fontFamily: C.mono, fontSize: 9, color: E.inkMuted }}>Subject<input value={outreachDraft.subject} onChange={(event) => setOutreachDraft((current) => current ? { ...current, subject: event.target.value } : current)} style={{ ...inputStyle, marginTop: 3 }} /></label><label style={{ display: 'block', marginTop: 8, fontFamily: C.mono, fontSize: 9, color: E.inkMuted }}>Message<textarea value={outreachDraft.body} onChange={(event) => setOutreachDraft((current) => current ? { ...current, body: event.target.value } : current)} rows={5} style={{ ...inputStyle, marginTop: 3, resize: 'vertical' }} /></label><div style={{ display: 'flex', gap: 7, marginTop: 8 }}><button type="button" disabled={outreachSaveBusy} onClick={() => void saveOutreachDraft('drafted')} style={actionGhostStyle()}>Save draft</button><button type="button" disabled={outreachSaveBusy} onClick={() => void saveOutreachDraft('sent')} style={actionBtnStyle(E.gold)}>{outreachSaveBusy ? 'Saving…' : 'Mark as sent'}</button></div></>}
        </div>
      )}
      {snapshot?.degraded && snapshot.guidance && <div style={{ padding: '8px 10px', borderLeft: `3px solid ${C.orange}`, background: '#FFFBEB', color: '#92400E', fontFamily: C.mono, fontSize: 9 }}>{snapshot.guidance}</div>}
    </section>
  )
}

// ── MAIN COMPONENT ──
export default function AdminContentStudio({ services: _services, refreshAdminData: _refreshAdminData, setActionNotice }: ContentStudioProps) {
  const [tab, setTab] = React.useState<StudioTab>(() => {
    if (typeof window === 'undefined') return 'discover'
    const requested = new URLSearchParams(window.location.search).get('tab')
    return resolveStudioStage(requested)
  })
  const [jobs, setJobs] = React.useState<ContentJob[]>([])
  const [jobTotal, setJobTotal] = React.useState(0)
  const [jobSummary, setJobSummary] = React.useState<QueueSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState<ContentJob | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Composer state (lifted so generation + auto-interlink can use it)
  const [contentType, setContentType] = React.useState<ContentType>('blog_post')
  // Explicit user selection is authoritative: Discover suggestions must NOT
  // silently flip a chosen content type (2026-08: 'selected as blog' jobs were
  // stored as 'article' → wrong word-count floor applied at the ship gate).
  const [contentTypeTouched, setContentTypeTouched] = React.useState(false)
  const [region, setRegion] = React.useState<Region>('US')
  const [tone, setTone] = React.useState<Tone>('educational')
  // Drafting default → GLM 5.2 Fast (Baseten); GPT stays for Research/Review.
  const [aiProvider, setAiProvider] = React.useState('baseten-glm-fast')
  const [reviewModel, setReviewModel] = React.useState('gpt-5.6-sol')
  const [title, setTitle] = React.useState('')
  const [topic, setTopic] = React.useState('')
  const [audience, setAudience] = React.useState('')
  const [keywords, setKeywords] = React.useState('')
  const [interlinkStage, setInterlinkStage] = React.useState('visa')
  const [showRadar, setShowRadar] = React.useState(true)
  const [selectedBrief, setSelectedBrief] = React.useState<AISuggestion | null>(null)
  // Imperative handle for the Brief Assembly panel — lets the pinned-topic CTA
  // below the panel trigger the exact same full-brief submit the in-panel
  // button uses (title, topic, keywords, H2 outline, sources, min/max words,
  // keyword→H2 map, interlinks) so generation always receives the full template.
  const briefPanelRef = React.useRef<{ submit: () => void }>(null)
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

  // Model calibration status — fetched once on mount + polled every 5 min
  const [modelCalibration, setModelCalibration] = React.useState<{
    lastCalibratedAt: string | null
    modelVersion: string
    eventsCount: number
    accuracy: number | null
    accuracyTrend: 'improving' | 'stable' | 'declining' | null
    recentRuns: number
  } | null>(null)

  // System health summary — aggregated metrics for Configure tab
  const [systemHealth, setSystemHealth] = React.useState<{
    apiKeysConfigured: number
    gscConnected: boolean
    gscMode: string | null
    interlinkTotal: number
    interlinkActive: number
    lastSiteScan: string | null
    totalShipped: number
  } | null>(null)
  const [siteAuditBusy, setSiteAuditBusy] = React.useState(false)

  // Generation stream events
  const [generationEvents, setGenerationEvents] = React.useState<GenerationActivity[]>([])
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(null)
  const [generationChars, setGenerationChars] = React.useState(0)
  const [generationText, setGenerationText] = React.useState('')
  const [triedProviders, setTriedProviders] = React.useState<string[]>([])
  const [generationReviewJob, setGenerationReviewJob] = React.useState<ContentJob | null>(null)
  const [generationMergeBusy, setGenerationMergeBusy] = React.useState(false)
  // Depth-rescue (PASS 2) stats — expansion rounds, stalls, time budget, set
  // from the structured `rescue` SSE event and surfaced in the Draft queue.
  const [rescueStats, setRescueStats] = React.useState<DepthRescueStats | null>(null)

  // Merge index + merge history (Ship Ledger) + engine status + gates
  const [mergeIndex, setMergeIndex] = React.useState<{ byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }>({ byPath: new Map(), byStem: new Map() })
  const [merges, setMerges] = React.useState<CannibalMergeRecord[]>([])
  const [engineStatus, setEngineStatus] = React.useState<Record<string, unknown> | null>(null)
  const [gateByJob, setGateByJob] = React.useState<Map<string, { score: number; passed: boolean }>>(new Map())
  // Full re-audit result for the Review stage — includes blockers, warnings, annotations.
  // Populated by auto-gate-run when entering Review and by AdminInlineEditor re-audits.
  const [reviewAuditResult, setReviewAuditResult] = React.useState<{
    score: number; ok: boolean; blockers: number; warnings: number
    summary: string; annotations?: Array<{ code: string; severity: string; message: string; fix: string }>
    shipReady?: boolean | null
    depthGate?: { ok: boolean; message: string } | null
  } | null>(null)

  // Ref to avoid stale closure in onScoreChange callbacks — always points to latest content.
  const latestJobContentRef = React.useRef(selectedJob?.content)
  latestJobContentRef.current = selectedJob?.content
  const [engineBusy, setEngineBusy] = React.useState(false)
  const [queueFocusJobId, setQueueFocusJobId] = React.useState<string | null>(null)
  const [autoInterlinkBusy, setAutoInterlinkBusy] = React.useState(false)
  // Work Plan — multi-select table for Discover stage

  // Bulk queue-selection — surfaces real actions against many jobs at once
  // (rerun, resume, clear queue, re-audit, refresh PR, abandon).
  const [selectedJobIds, setSelectedJobIds] = React.useState<Set<string>>(new Set())
  const [queueBulkBusy, setQueueBulkBusy] = React.useState(false)
  const [queueBulkAction, setQueueBulkAction] = React.useState<string | null>(null)
  const [queueBulkProgress, setQueueBulkProgress] = React.useState<{ done: number; total: number; failed: number } | null>(null)
  const [queueStatusFilter, setQueueStatusFilter] = React.useState<ContentJob['status'] | 'all' | 'failed' | 'stuck'>('all')
  // Keep the queue's last refresh timestamped so the refresh button has something
  // honest to display instead of a silent void.
  const [lastRefreshAt, setLastRefreshAt] = React.useState<number | null>(null)
  const [queueBulkConfirmArmed, setQueueBulkConfirmArmed] = React.useState<string | null>(null)

  // ── Dissertation progression contract ──
  // A chapter is not merely a view: it has an evidence prerequisite. The
  // resolver below is shared by tab clicks and browser back/forward so a URL
  // cannot silently bypass the study's research → method → defense chain.
  const hasTopic = Boolean(topic.trim() || title.trim() || selectedBrief)
  const hasBriefReady = Boolean(topic.trim() && title.trim())
  const hasDraft = jobs.length > 0 || jobTotal > 0
  const hasReviewableJob = jobs.some((j) => ['drafting', 'publishing', 'pr_created', 'merged'].includes(j.status))
  const hasApproval = jobs.some((j) => Boolean(j.pr_url || j.pr_number) && j.status !== 'closed')
  const hasPublication = jobs.some((j) => j.status === 'merged' || Boolean(j.canonical_url))

  const stageAvailability = React.useMemo<Record<StudioTab, { available: boolean; reason: string }>>(() => ({
    discover: { available: true, reason: 'Discover is always the first stage — signals before strategy.' },
    research: { available: true, reason: 'Research keywords and build the brief — always accessible.' },
    draft: { available: hasBriefReady, reason: 'Complete the research brief before drafting.' },
    approve: { available: hasApproval, reason: 'A PR must exist before approval.' },
    configure: { available: true, reason: 'System configuration is always accessible.' },
  }), [hasTopic, hasBriefReady, hasDraft, hasReviewableJob, hasApproval, hasPublication])

  const pendingDeepLinkRef = React.useRef<StudioTab | null>(null)

  const safeStage = React.useCallback((requested: StudioTab): StudioTab => (
    nearestAvailableStage(requested, Object.fromEntries(
      DISSERTATION_STAGES.map((stage) => [stage, stageAvailability[stage].available]),
    ) as Partial<Record<StudioTab, boolean>>)
  ), [stageAvailability])

  const selectTab = React.useCallback((requested: StudioTab) => {
    // An explicit operator click supersedes any deferred URL deep link.
    pendingDeepLinkRef.current = null
    const next = safeStage(requested)
    setTab(next)
    if (next !== requested) {
      setActionNotice(`Stage ${requested} is not ready. ${stageAvailability[requested].reason} Opening ${next}.`)
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', next)
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [safeStage, setActionNotice, stageAvailability])

  const [selectedWorkPlanIds, setSelectedWorkPlanIds] = React.useState<Set<string>>(new Set())
  // Competing estate pages detected when sending a topic to research.
  // Populated from radarMeta.cannibalization and the coverage map.
  const [competingUrls, setCompetingUrls] = React.useState<Array<{ url: string; title: string; primaryKeyword?: string | null }>>([])

  const workPlanItems = React.useMemo(
    () => buildWorkPlan(radar, radarMeta, merges),
    [radar, radarMeta, merges],
  )

  const handleSendToResearch = React.useCallback((selected: WorkPlanItem[]) => {
    if (selected.length === 0) return
    const first = selected[0]
    // Populate research fields from the first selected item
    setTopic(first.topic)
    if (first.suggestion) {
      setTitle(first.suggestion.title)
      if (first.suggestion.keywords) setKeywords(first.suggestion.keywords.join(', '))
      if (first.suggestion.audience) setAudience(first.suggestion.audience)
      if (first.suggestion.contentType && !contentTypeTouched) setContentType(first.suggestion.contentType as ContentType)
      setSelectedBrief(first.suggestion)
      setBriefInterlinks(first.suggestion.interlinks ?? [])
    }
    // ── Competing URL detection (anti-cannibalization) ──
    // Wire the Discover stage to call checkCompetingPages() when sending
    // topics to research. Competing URLs are stored in state and flow into
    // the content_jobs row so the quality gate + repair fire on reaudit.
    const topicLower = first.topic.toLowerCase()
    const competing: Array<{ url: string; title: string; primaryKeyword?: string | null }> = []
    const cannibalList = (radarMeta?.cannibalization as Array<{ term: string; pages: string[] }> | null) || []
    for (const c of cannibalList) {
      if (c.term.toLowerCase() === topicLower || topicLower.includes(c.term.toLowerCase())) {
        for (const page of (c.pages || []).slice(0, 5)) {
          competing.push({ url: page, title: c.term, primaryKeyword: c.term })
        }
      }
    }
    // Also check radar items that are flagged as cannibalization plays
    for (const item of selected) {
      if (item.play === 'cannibalization' || item.category === 'cannibal') {
        for (const sig of (item.signals || [])) {
          // Extract URLs from signals like "3 competing pages target this term"
          // The actual URLs live in radarMeta.cannibalization, already handled above
        }
        // Include the topic itself as a competing signal
        if (!competing.some((c) => c.primaryKeyword === item.topic)) {
          competing.push({ url: '', title: item.title, primaryKeyword: item.topic })
        }
      }
    }
    setCompetingUrls(competing)
    // ── End competing URL detection ──
    // If multiple selected, note them in the keywords so Plan stage can queue them
    if (selected.length > 1) {
      const topics = selected.map((s) => s.topic).join(', ')
      setKeywords((prev) => prev ? `${prev}, ${topics}` : topics)
      setActionNotice(`${selected.length} items sent to Research — batch queued`)
    } else {
      setActionNotice(`"${first.title.slice(0, 40)}${first.title.length > 40 ? '…' : ''}" sent to Research`)
    }
    setSelectedWorkPlanIds(new Set())
    selectTab('research')
  }, [selectTab, setActionNotice, radarMeta])

  React.useEffect(() => {
    const requested = resolveStudioStage(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab'))
    // Preserve a deep link while the initial queue is hydrating. Until then,
    // availability is intentionally conservative because jobs/PRs are unknown.
    if (loading) {
      pendingDeepLinkRef.current = requested
    } else {
      if (!stageAvailability[requested].available) pendingDeepLinkRef.current = requested
      const next = safeStage(requested)
      if (next !== requested) {
        setTab(next)
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.set('tab', next)
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        }
      }
    }
    const onPopState = () => {
      const resolved = resolveStudioStage(new URLSearchParams(window.location.search).get('tab'))
      pendingDeepLinkRef.current = loading || !stageAvailability[resolved].available ? resolved : null
      const safe = safeStage(resolved)
      setTab(safe)
      const url = new URL(window.location.href)
      url.searchParams.set('tab', safe)
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loading, safeStage, stageAvailability])

  // Jobs hydrate asynchronously. Restore a requested terminal deep link once
  // the first queue load has completed, but still fall back safely if its
  // prerequisite genuinely does not exist.
  React.useEffect(() => {
    if (loading || !pendingDeepLinkRef.current) return
    const requested = pendingDeepLinkRef.current
    pendingDeepLinkRef.current = null
    const next = safeStage(requested)
    setTab(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', next)
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [loading, safeStage])

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

  // Deep-link from the Rhythm Alerts panel: fetch the job by id (it may not be
  // in the current queue view) and open the JobDetail modal for remediation.
  const openRhythmAlertJob = React.useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(jobId)}`, { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as { job?: ContentJob; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.job) throw new Error('Job not found')
      setSelectedJob(data.job)
      setQueueFocusJobId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open rhythm-alert job')
    }
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

  // Ship Ledger: full merged-PR history (cannibal merges) for the stamp grid at the foot of Pipeline
  const fetchMergeHistory = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-factory/cannibal-merges', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as { error?: string; merges?: CannibalMergeRecord[] }
      setMerges((data?.merges ?? []).slice().sort((a, b) => {
        const aAt = typeof a?.mergedAt === 'number' ? a.mergedAt : 0
        const bAt = typeof b?.mergedAt === 'number' ? b.mergedAt : 0
        return bAt - aAt
      }))
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

  const loadModelCalibration = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/model-calibration', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok && data.ok) setModelCalibration(data)
    } catch { /* silent */ }
  }, [])

  React.useEffect(() => {
    loadModelCalibration()
    const id = setInterval(loadModelCalibration, 5 * 60_000) // every 5 min
    return () => clearInterval(id)
  }, [loadModelCalibration])

  const loadSystemHealth = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/system-health', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok && data.ok) setSystemHealth(data)
    } catch { /* silent */ }
  }, [])

  React.useEffect(() => {
    loadSystemHealth()
    const id = setInterval(loadSystemHealth, 5 * 60_000)
    return () => clearInterval(id)
  }, [loadSystemHealth])

  // Autopilot: one click applies the full brief — everything stays editable.
  const applyBrief = React.useCallback((s: AISuggestion) => {
    setTopic(s.topic)
    setKeywords((s.keywords && s.keywords.length ? s.keywords : [s.primaryKeyword || s.topic]).join(', '))
    if (s.title) setTitle(s.title)
    if (s.audience) setAudience(s.audience)
    if (s.contentType && !contentTypeTouched) setContentType(s.contentType as ContentType)
    if (s.intent) setTone(TONE_FOR_INTENT[s.intent] ?? 'educational')
    setSelectedBrief(s)
    setBriefInterlinks(s.interlinks ?? [])
    setSuggestions(prev => [s, ...prev.filter(x => x.topic !== s.topic)])
    selectTab('research')
    setShowRadar(true)
  }, [])

  React.useEffect(() => { fetchSuggestions('US') }, [fetchSuggestions])
  React.useEffect(() => { fetchJobs() }, [fetchJobs])
  React.useEffect(() => { fetchMergeIndex(); void fetchMergeHistory() }, [fetchMergeIndex, fetchMergeHistory])

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

  // Auto-run quality gate when admin enters the Review stage with a selected draft.
  // This ensures DefendPanel always shows fresh blocker data.
  // NOTE: NOT dependent on selectedJob?.content to avoid re-audit on every keystroke
  // in the inline editor. The onScoreChange callback handles live re-audit updates.
  React.useEffect(() => {
    if (tab !== 'draft' || !selectedJob?.content) return
    const runGate = async () => {
      try {
        const res = await fetch('/api/content-studio/reaudit', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: selectedJob.content,
            contentType: selectedJob.content_type,
            primaryKeyword: selectedJob.primary_keyword ?? undefined,
            indexable: selectedJob.indexable,
          }),
        })
        const data = await res.json().catch(() => ({})) as any
        if (!res.ok) return
        setReviewAuditResult({
          score: data.score ?? 0,
          ok: Boolean(data.ok),
          blockers: data.blockers ?? 0,
          warnings: data.warnings ?? 0,
          summary: data.summary ?? '',
          annotations: data.annotations ?? [],
          shipReady: typeof data.shipReady === 'boolean' ? data.shipReady : null,
          depthGate: data.depthGate || null,
        })
      } catch { /* best-effort */ }
    }
    runGate()
  }, [tab, selectedJob?.id])

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

  // ── VII · Approve & Ship single-job flow (pipeline.approve + runShip) ──
  // Posts to /api/content-studio/jobs with action='bulk_approve' on a single
  // id; the route runs the existing pipeline.approve (audit + deterministic
  // repair + shipContent) and finishes with monitorContentJob. After the
  // promise resolves we re-fetch jobs so VII · Approve surfaces the merged
  // status and VII · Track gets a fresh stamp.
  const runApproveAndMerge = React.useCallback(async (j: ContentJob): Promise<{ ok: boolean; message?: string; rhythmDetail?: { key: string; count: number } | null }> => {
    try {
      const response = await fetch('/api/content-studio/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_approve', ids: [j.id], dryRun: false }),
      })
      const data = await response.json().catch(() => ({})) as {
        ok?: boolean; processed?: number; succeeded?: number; failed?: number
        results?: Array<{ id: string; ok: boolean; detail?: any; error?: string }>
        error?: string; message?: string
      }
      if (!response.ok) throw new Error(data.error || data.message || `Approve failed (HTTP ${response.status})`)
      const first = Array.isArray(data.results) ? data.results[0] : undefined
      const ok = first?.ok === true && data.failed === 0
      const detailMessage = first?.detail && typeof first.detail === 'object' && 'message' in (first.detail as any)
        ? String((first.detail as { message?: string }).message)
        : undefined
      const message = detailMessage || (
        ok
          ? `PR #${j.pr_number ?? '?'} merged · deploy live`
          : `Push failed${first?.error ? `: ${first.error}` : ''}`
      )
      setActionNotice?.(message)
      void fetchJobs().catch(() => { /* best-effort refresh */ })
      return { ok, message, rhythmDetail: (first?.detail && typeof first.detail === 'object' && (first.detail as { code?: string }).code === 'rhythm_beyond_repair')
        ? { key: String((first.detail as { rhythmKey?: string }).rhythmKey || '?'), count: Number((first.detail as { rhythmCount?: number }).rhythmCount) || 0 }
        : null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approve failed'
      setActionNotice?.(message)
      return { ok: false, message }
    }
  }, [fetchJobs, setActionNotice])

  // ── Bulk queue actions: rerun, resume, clear queue, re-audit, refresh PR, abandon ──
  // The bulk_* POST handler accepts up to 25 ids per request; we chunk large
  // selections and surface a progress bar so the admin sees the work moving.
  const runBulkQueueAction = React.useCallback(async (kind: 'bulk_reaudit' | 'bulk_abandon' | 'bulk_approve' | 'bulk_monitor' | 'rerun_resume' | 'refresh_pr' | 'clear_drafts' | 'clear_stuck' | 'clear_failed') => {
    if (queueBulkBusy) return
    let ids: string[] = []
    if (kind === 'clear_drafts' || kind === 'clear_stuck' || kind === 'clear_failed') {
      // Status-filtered ops ignore the checkbox selection and act on the
      // currently visible list, so an admin can wipe an entire queue bucket
      // without selecting 30+ rows manually.
      const statusFilter = kind === 'clear_drafts' ? 'pending'
        : kind === 'clear_stuck' ? 'drafting'
        : 'failed'
      ids = jobs
        .filter((j) => j.status === statusFilter || (kind === 'clear_stuck' && j.status === 'pending'))
        .map((j) => j.id)
    } else {
      ids = Array.from(selectedJobIds)
    }
    if (!ids.length && !['clear_stuck', 'clear_failed', 'clear_drafts'].includes(kind)) {
      setActionNotice('Select at least one job first.')
      return
    }
    // Destructive ops require a second click (toggle arming).
    if ((kind === 'clear_drafts' || kind === 'clear_stuck' || kind === 'clear_failed' || kind === 'bulk_abandon') && queueBulkConfirmArmed !== kind) {
      setQueueBulkConfirmArmed(kind)
      setActionNotice(`Click again to confirm ${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')} on ${ids.length || jobs.filter((j) => (kind === 'clear_failed' ? j.status === 'failed' : kind === 'clear_stuck' ? (j.status === 'drafting' || j.status === 'pending') : j.status === 'pending')).length} job(s).`)
      return
    }
    setQueueBulkConfirmArmed(null)
    setQueueBulkBusy(true)
    setQueueBulkAction(kind)
    setQueueBulkProgress({ done: 0, total: ids.length, failed: 0 })
    try {
      let successCount = 0
      let failCount = 0
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25))
      for (const chunk of chunks) {
        if (kind === 'rerun_resume' || kind === 'refresh_pr') {
          // Per-job PATCH; rerun_resume uses the regenerate action and refresh_pr
          // pulls the latest PR metadata from GitHub.
          const action: 'regenerate' | 'refresh_pr' = kind === 'rerun_resume' ? 'regenerate' : 'refresh_pr'
          const results = await Promise.allSettled(chunk.map(async (id) => {
            const res = await fetch('/api/content-studio/jobs', {
              method: 'PATCH',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, action }),
            })
            const data = await res.json().catch(() => ({})) as { error?: string }
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
            return id
          }))
          successCount += results.filter((r) => r.status === 'fulfilled').length
          failCount += results.filter((r) => r.status === 'rejected').length
        } else {
          const res = await fetch('/api/content-studio/jobs', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: kind, ids: chunk }),
          })
          const data = await res.json().catch(() => ({})) as { ok?: boolean; processed?: number; error?: string; message?: string }
          if (res.ok && data.ok) {
            successCount += Number(data.processed || chunk.length)
          } else {
            failCount += chunk.length
            console.warn('[queue] bulk action failed', kind, data.error || res.status)
          }
        }
        setQueueBulkProgress((p) => p ? { done: Math.min(p.total, p.done + chunk.length), total: p.total, failed: p.failed + failCount - (p.failed || 0) } : p)
      }
      setActionNotice(
        failCount
          ? `${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')}: ${successCount} ok, ${failCount} failed`
          : `${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')}: ${successCount} job(s) processed`,
      )
      setSelectedJobIds(new Set())
      await fetchJobs()
      await fetchGateRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} failed`)
    } finally {
      setQueueBulkBusy(false)
      setQueueBulkAction(null)
      setTimeout(() => setQueueBulkProgress(null), 1500)
    }
  }, [queueBulkBusy, queueBulkConfirmArmed, selectedJobIds, jobs, fetchJobs, fetchGateRuns, setActionNotice, setError])

  const queueSelectionCounts = React.useMemo(() => {
    const counts = { pending: 0, drafting: 0, failed: 0, stuck: 0, total: 0 }
    for (const j of jobs) {
      counts.total++
      if (j.status === 'pending') counts.pending++
      if (j.status === 'drafting') counts.drafting++
      if (j.status === 'failed') counts.failed++
      if (j.status === 'drafting' || (j.status === 'pending' && Date.now() - new Date(j.updated_at).getTime() > 30 * 60_000)) counts.stuck++
    }
    return counts
  }, [jobs])

  const visibleQueueJobs = React.useMemo(() => {
    if (queueStatusFilter === 'all') return jobs
    if (queueStatusFilter === 'stuck') {
      return jobs.filter((j) => j.status === 'drafting' || (j.status === 'pending' && Date.now() - new Date(j.updated_at).getTime() > 30 * 60_000))
    }
    return jobs.filter((j) => j.status === queueStatusFilter)
  }, [jobs, queueStatusFilter])

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
    selectTab('draft') // Auto-navigate to Draft stage to watch the live stream
    setGenerationReviewJob(null)
    setError(null)
    setGenerationStartedAt(Date.now())
    setGenerationChars(0)
    setGenerationText('')
    setRescueStats(null)
    setTriedProviders([])
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
          // Brief Assembly Panel fields — the full template
          h2Outline: formData.h2Outline || undefined,
          sources: formData.sources || undefined,
          minWords: formData.minWords || undefined,
          maxWords: formData.maxWords || undefined,
          targetSlug: formData.targetSlug || undefined,
        kwH2Map: formData.kwH2Map || undefined,
        competingUrls: competingUrls.length ? competingUrls : undefined,
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
      // Early 'drafting' job row created by the pipeline — lets the Draft queue
      // show '1 In Progress' in realtime while the AI writes, before the final row.
      let liveJobId = ''
      const consume = (raw: string) => {
        const dataLine = raw.split(/\r?\n/).find(line => line.startsWith('data:'))
        if (!dataLine) return
        const payload = dataLine.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        const event = JSON.parse(payload) as any
        if (event.type === 'progress') record(event.stage || 'pipeline', event.message || 'Working…')
        else if (event.type === 'provider') {
          setTriedProviders((prev) => {
            const name = String(event.provider || 'AI')
            return prev.includes(name) ? prev : [...prev, name]
          })
          record('provider', `Using ${event.provider || 'AI'}${event.model ? ` · ${event.model}` : ''}`)
        }
        else if (event.type === 'job') {
          liveJobId = String(event.jobId || '')
          // Refresh immediately so the queue strip flips to '1 In Progress'.
          fetchJobs().catch(() => {})
        }
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · quality threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'rescue') {
          const s = event.stats
          setRescueStats(s)
          record('refine', `Depth rescue complete · ${s.expandPasses} expand/append pass${s.expandPasses === 1 ? '' : 'es'}${s.stallCount > 0 ? ` · ${s.stallCount} stall${s.stallCount === 1 ? '' : 's'}` : ''} · ${fmtDur(s.timeMs)} used`, s.stallCount > 0 ? 'warn' : 'success')
        }
        else if (event.type === 'delta') {
          const chunk = String(event.text || '')
          streamChars += chunk.length
          setGenerationChars(streamChars)
          setGenerationText((prev) => prev + chunk)
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
      const generatedJobId = String(data.jobId || data.job?.id || data.ship?.jobId || liveJobId || '')
      const shipBlocked = Boolean(data.shipError)
      const notice = data.ship?.prUrl
        ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError
          ? `Generated (audit ${data.audit?.score ?? '—'}) but ship paused: ${data.shipError}`
          : `Generated via ${data.provider || 'AI'} · audit ${data.audit?.score ?? '—'}`
      setActionNotice(notice)
      // Auto-route: blocked ships land in Review for remediation; clean ships stay in Draft
      selectTab('draft')
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

  // 7-stage pipeline taxonomy. Each tab routes to a distinct stage.
  // Back-compat aliases map legacy tab tokens to the stage they belong to.
  const TABS: Array<{ key: StudioTab; numeral: string; label: string; sub: string; hint: string }> = [
    { key: 'discover',  numeral: 'I',   label: 'Discover',  sub: 'Signal Intelligence',   hint: 'GSC · radar · gaps · opportunities' },
    { key: 'research',  numeral: 'II',  label: 'Research',  sub: 'Keywords & Brief',       hint: 'Intent · keywords · interlinks · template' },
    { key: 'draft',     numeral: 'III', label: 'Draft & Review',   sub: 'Generate · Gate · Fix',    hint: `${jobTotal || jobs.length} jobs · queue · review` },
    { key: 'approve',   numeral: 'IV',  label: 'Approve & Track',  sub: 'Merge · Deploy · Verify',  hint: 'PR · deploy · ledger · GSC' },
    { key: 'configure', numeral: 'V',   label: 'Configure',     sub: 'System Settings',        hint: 'AI models · API keys · GSC · health' },
  ]

  return (
    <div style={{ padding: '24px 28px 40px', maxWidth: 1480, margin: '0 auto', background: E.ivory, minHeight: 'calc(100vh - 80px)' }}>
      {/* ── Masthead — editorial spread-style studio cover ── */}
      <div style={{
        marginBottom: 18, padding: '20px 24px', borderRadius: 0,
        background: `linear-gradient(135deg, ${E.ivory} 0%, ${E.parchment} 100%)`,
        borderBottom: `2px solid ${E.gold}`,
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
      }}>
        <div>
          <div style={{ ...TYPE.caption, color: E.gold, marginBottom: 6, fontWeight: 800 }}>
            THE CONTENT STUDIO · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={{ ...TYPE.display, margin: 0, color: E.inkBlack }}>
            One Pipeline, End‑to‑End.
          </h1>
          <p style={{ ...TYPE.byline, margin: '6px 0 0', color: E.inkSoft, fontStyle: 'italic' }}>
            From SEO Master Engine ingestion to a live, verifiable URL — every step tracked, every PR stamped.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', minWidth: 200 }}>
          <span style={{ ...TYPE.microFig, color: E.goldDeep }}>VOL · I · NO · {String(Math.max(1, jobs.length + merges.length)).padStart(3, '0')}</span>
          <span style={{ ...TYPE.microFig, color: E.inkDim }}>{engGate ? `${Math.round(engGate * 100)}% GATE PASS` : 'ENGINE · IDLE'}</span>
          <button type="button" onClick={async () => {
            if (loading) return
            setError(null)
            try {
              await Promise.allSettled([
                fetchJobs(),
                fetchMergeIndex(),
                fetchMergeHistory(),
                fetchGateRuns(),
              ])
              setLastRefreshAt(Date.now())
              setActionNotice(`Studio data refreshed · ${jobs.length} jobs, ${merges.length} merged PRs`)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Refresh failed'
              setError(msg)
              setActionNotice(`Refresh failed — ${msg}`)
            }
          }} disabled={loading} style={{
            marginTop: 6, padding: '8px 18px', borderRadius: 0,
            background: E.inkBlack, color: E.ivory,
            border: 'none', cursor: loading ? 'progress' : 'pointer', fontSize: 11, fontWeight: 800,
            fontFamily: E.mono, letterSpacing: '0.08em', textTransform: 'uppercase',
            opacity: loading ? 0.5 : 1,
          }}>
            {loading ? '⏳ Loading…' : '↻ Refresh desk'}
          </button>
          {lastRefreshAt && !loading && (
            <span style={{ ...TYPE.microFig, color: E.inkDim, fontSize: 9, marginTop: 4 }}>
              last refreshed {new Date(lastRefreshAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── Realtime queue status strip ── */}
      {!loading && (jobs.length > 0 || jobTotal > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '10px 16px', marginBottom: 12,
          background: E.paper, border: '1px solid ' + E.hairline,
          fontFamily: C.mono, fontSize: 10,
        }}>
          <span style={{ fontWeight: 700, color: E.ink, letterSpacing: '0.06em' }}>QUEUE</span>
          {[
            { label: 'In Progress', count: jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length, color: '#D97706', icon: '⚙️' },
            { label: 'PR Ready', count: jobs.filter(j => j.status === 'pr_created').length, color: '#2563EB', icon: '🔀' },
            { label: 'Merged', count: jobs.filter(j => j.status === 'merged').length, color: '#166534', icon: '✅' },
            { label: 'Failed', count: jobs.filter(j => j.status === 'failed').length, color: '#DC2626', icon: '⚠️' },
          ].map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: E.inkMuted }}>
              {i > 0 && <span style={{ color: E.hairline, marginRight: 2 }}>|</span>}
              <span>{s.icon}</span>
              <span style={{ fontWeight: 700, color: s.color }}>{s.count}</span>
              <span>{s.label}</span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', color: E.inkDim }}>
            {jobTotal || jobs.length} total · {generating ? '🔴 1 generating' : 'idle'}
          </span>
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

      <StudioStageNav
        tabs={TABS}
        active={tab}
        availability={stageAvailability}
        onSelect={selectTab}
      />
      {/* ══════════ IV · DRAFT ══════════ */}
      {/* Stage IV — generate content: the live stream, editor surface,
          jobs clock, and queue stats. Downstream of Discover → Research → Plan. */}
      {tab === 'draft' && (
        <ChapterIntro
          numeral="III"
          title="Draft & Review"
          subtitle="Generate against the plan, then put every claim through the quality gate in one continuous flow: live streaming, the job queue, inline editing, re-audit, and blocker resolution before approval."
          chapterKey="draft"
          scope={[
            { chip: 'Live stream', text: 'SSE-fed, line-by-line generation paired with the SEO-enrichment pass.' },
            { chip: 'Queue',       text: 'Every active job with bulk rerun / resume / abandon / clear; per-job clock + ETA.' },
            { chip: 'Review',      text: 'Re-audit, inline editor, blocker resolution and link-integrity checks — all gates clear here.' },
          ]}
          prev="II · Research"
          next="IV · Approve & Track"
          onJump={selectTab}
        />
      )}
      {tab === 'draft' && (
        <div id="studio-panel-draft" role="tabpanel" aria-labelledby="studio-tab-draft" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Draft workspace — inline editor with live streaming ── */}            <DraftWorkspace
              generating={generating}
              generationEvents={generationEvents}
              generationStartedAt={generationStartedAt}
              generationChars={generationChars}
              generationText={generationText}
              rescueStats={rescueStats}
              triedProviders={triedProviders}
              completedJob={generationReviewJob}
            selectedJob={selectedJob}
            setSelectedJob={setSelectedJob}
            onContinueToReview={() => { if (generationReviewJob) { setSelectedJob(generationReviewJob); selectTab('approve') } }}
            selectTab={selectTab}
            error={error}
            setError={setError}
          />
          <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>STAGE III · GENERATE</div>
                <h3 style={{ margin: '4px 0 6px', fontFamily: C.serif, fontSize: 22, color: E.ink }}>Generate against the plan</h3>
                <p style={{ margin: 0, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 13 }}>
                  Generation is deliberately downstream of Discover, Research, and Plan. The workspace above is where the AI writes live; the queue below is where every job is tracked end-to-end.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => selectTab('research')} style={actionGhostStyle()}>← Research</button>
                <button type="button" onClick={() => selectTab('research')} style={actionBtnStyle(E.gold)}>Review brief →</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                ['Method locked', Boolean(topic.trim() && title.trim())],
                ['Jobs tracked', jobs.length > 0 || jobTotal > 0],
                ['Live events', generationEvents.length > 0],
              ].map(([label, ready]) => (
                <span key={String(label)} style={{ padding: '5px 9px', background: ready ? E.mossSoft : E.parchment, color: ready ? '#24552A' : E.inkMuted, fontFamily: C.mono, fontSize: 10, fontWeight: 700 }}>
                  {ready ? '✓' : '○'} {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ II / III · QUESTION + METHOD ══════════ */}
      {/* Dissertation Chapters II–III — freeze the research question, then
          translate it into a reproducible strategy. */}
      {tab === 'research' && (
        <ChapterIntro
          numeral="II"
          title="Research & Plan"
          subtitle="Keywords are the core. Research intent, validate against cannibalization, wire interlinks, and produce a strict brief template — every parameter frozen before the first token is generated."
          chapterKey="research"
          scope={[
            { chip: 'Keywords',   text: 'Live keyword counts (short-tail ≥5 + long-tail ≥4), density targets, and search intent mapped from GSC signals.' },
            { chip: 'Template',   text: 'A strict instruction set with guard rails: no guesswork, no hallucinations — every section prescribed.' },
            { chip: 'Interlinks', text: 'Wired from the interlink registry: caseworks → regional → marketplace funnel.' },
          ]}
          prev="I · Discover"
          next="III · Draft"
          onJump={selectTab}
        />
      )}
      {tab === 'research' && (
        <div id={`studio-panel-${tab}`} role="tabpanel" aria-labelledby={`studio-tab-${tab}`} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <BriefAssemblyPanel
              ref={briefPanelRef}
              generating={generating}
              onGenerate={handleGenerate}
              contentType={contentType} setContentType={setContentType}
              onContentTypeTouched={() => setContentTypeTouched(true)}
              region={region} setRegion={setRegion}
              tone={tone} setTone={setTone}
              aiProvider={aiProvider} setAiProvider={setAiProvider}
              title={title} setTitle={setTitle}
              topic={topic} setTopic={setTopic}
              audience={audience} setAudience={setAudience}
              keywords={keywords} setKeywords={setKeywords}
              suggestions={suggestions}
              gscStatus={gscStatus}
              brief={selectedBrief}
              onClearBrief={() => { setSelectedBrief(null); setBriefInterlinks([]) }}
              briefInterlinks={briefInterlinks}
              onBriefInterlinksChange={setBriefInterlinks}
              interlinkStage={interlinkStage} setInterlinkStage={setInterlinkStage}
              onAutoInterlink={runAutoInterlink}
              autoInterlinkBusy={autoInterlinkBusy}
              selectedBrief={selectedBrief}
              setActionNotice={setActionNotice}
              radarMeta={radarMeta}
            />

          {/* Next-stage CTA: visible when on Research tab with a topic pinned */}
          {tab === 'research' && topic.trim() && (
            <div style={{ marginTop: 14, padding: '14px 18px', background: E.parchment, border: `1px solid ${E.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: C.serif, fontSize: 15, color: E.ink, fontWeight: 600 }}>Topic pinned: <span style={{ color: E.gold }}>{topic}</span></div>
                <div style={{ fontSize: 11, color: E.inkMuted, marginTop: 2 }}>Your brief is ready. Advance to build the plan.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Advance the full brief into the Draft stage: submit() triggers
                  // the same generation flow as the in-panel button (which
                  // auto-navigates to Draft to watch the live stream). The panel
                  // always renders in this tab before the CTA, so the ref is set.
                  briefPanelRef.current?.submit()
                }}
                disabled={generating}
                style={{ padding: '10px 20px', background: generating ? E.inkDim : E.gold, color: E.ivory, border: 'none', borderRadius: 0, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: C.serif, fontSize: 14, fontWeight: 700, opacity: generating ? 0.6 : 1 }}
              >
                {generating ? '⏳ Generating…' : 'Generate Draft →'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'draft' && (
        <div id="studio-panel-draft-queue" role="tabpanel" aria-labelledby="studio-tab-draft" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!loading && (jobs.length > 0 || jobTotal > 0) && <QueueStats jobs={jobs} total={jobTotal} summary={jobSummary} />}

          {/* ── Queue command bar — bulk actions & visible status counts ── */}
          {!loading && (jobs.length > 0 || jobTotal > 0) && (
            <div role="toolbar" aria-label="Job queue actions" style={{
              padding: '10px 14px',
              background: E.paper,
              border: `1px solid ${E.hairline}`,
              borderRadius: 0,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              boxShadow: E.paperShadow,
            }}>
              <span style={{ ...TYPE.microFig, color: E.gold, fontSize: 10, fontWeight: 800, marginRight: 4 }}>QUEUE CONTROL</span>
              <span style={{ fontSize: 11, color: E.inkSoft, fontFamily: E.mono }}>
                {queueSelectionCounts.total} jobs · {selectedJobIds.size} selected
              </span>
              {queueBulkProgress && (
                <span style={{ fontSize: 10.5, color: E.goldDeep, fontFamily: E.mono, marginLeft: 8 }}>
                  {queueBulkProgress.done}/{queueBulkProgress.total} processed · {queueBulkProgress.failed} failed
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setSelectedJobIds(visibleQueueJobs.length === selectedJobIds.size && visibleQueueJobs.every((j) => selectedJobIds.has(j.id)) ? new Set() : new Set(visibleQueueJobs.map((j) => j.id)))}
                disabled={queueBulkBusy || visibleQueueJobs.length === 0}
                style={{
                  padding: '6px 10px', border: `1px solid ${E.hairline}`, background: 'transparent',
                  color: E.inkSoft, fontFamily: E.mono, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}
              >
                {visibleQueueJobs.length > 0 && visibleQueueJobs.every((j) => selectedJobIds.has(j.id)) ? '✕ Clear selection' : '☐ Select all'}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('rerun_resume') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'rerun_resume' ? actionDisabledStyle(E.goldDeep) : actionBtnStyle(E.gold)}
                title="Rerun selected jobs (regenerate action — AI rewrite, replacement job)"
              >
                {queueBulkAction === 'rerun_resume' ? '⏳ Rerunning…' : `🔁 Rerun (${selectedJobIds.size || 0})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('refresh_pr') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'refresh_pr' ? actionDisabledStyle('#0F766E') : actionBtnStyle('#0F766E')}
                title="Refresh PR status from GitHub (pulls latest commit/CI state for each selected job)"
              >
                {queueBulkAction === 'refresh_pr' ? '⏳ Refreshing PRs…' : `↻ Refresh PR (${selectedJobIds.size || 0})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('bulk_reaudit') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'bulk_reaudit' ? actionDisabledStyle(E.inkSoft) : actionBtnStyle(E.inkSoft)}
                title="Re-audit selected jobs against the current rules"
              >
                {queueBulkAction === 'bulk_reaudit' ? '⏳ Re-auditing…' : `🔍 Re-audit (${selectedJobIds.size || 0})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('bulk_approve') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'bulk_approve' ? actionDisabledStyle(E.mossGreen) : actionBtnStyle(E.mossGreen)}
                title="Approve selected jobs (push PRs to main)"
              >
                {queueBulkAction === 'bulk_approve' ? '⏳ Approving…' : `✅ Approve (${selectedJobIds.size || 0})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('bulk_abandon') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'bulk_abandon' ? actionDisabledStyle(E.ember) : actionBtnStyle(E.ember)}
                title={queueBulkConfirmArmed === 'bulk_abandon' ? 'Click again to confirm abandon' : 'Abandon selected jobs (mark as closed)'}
              >
                {queueBulkAction === 'bulk_abandon'
                  ? '⏳ Abandoning…'
                  : queueBulkConfirmArmed === 'bulk_abandon'
                    ? '⚠ Confirm abandon'
                    : `🗑 Abandon (${selectedJobIds.size || 0})`}
              </button>
              <span style={{ width: 1, height: 22, background: E.hairline, margin: '0 4px' }} />
              {/* Status-filter clear buttons (act on the visible bucket, not selection) */}
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_drafts') }}
                disabled={queueBulkBusy}
                style={queueBulkConfirmArmed === 'clear_drafts' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_drafts' ? `Click again to confirm clearing all ${queueSelectionCounts.pending} queued drafts` : `Clear all ${queueSelectionCounts.pending} pending drafts`}
              >
                {queueBulkConfirmArmed === 'clear_drafts'
                  ? `⚠ Confirm clear queue (${queueSelectionCounts.pending})`
                  : `🧹 Clear queue (${queueSelectionCounts.pending})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_stuck') }}
                disabled={queueBulkBusy}
                style={queueBulkConfirmArmed === 'clear_stuck' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_stuck' ? `Click again to confirm abandoning ${queueSelectionCounts.stuck} stuck jobs` : `Abandon ${queueSelectionCounts.stuck} stuck jobs (>30min in drafting/pending)`}
              >
                {queueBulkConfirmArmed === 'clear_stuck'
                  ? `⚠ Confirm resume cleanup (${queueSelectionCounts.stuck})`
                  : `🚧 Resume stuck (${queueSelectionCounts.stuck})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_failed') }}
                disabled={queueBulkBusy}
                style={queueBulkConfirmArmed === 'clear_failed' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_failed' ? `Click again to confirm abandoning ${queueSelectionCounts.failed} failed jobs` : `Abandon ${queueSelectionCounts.failed} failed jobs`}
              >
                {queueBulkConfirmArmed === 'clear_failed'
                  ? `⚠ Confirm clear failed (${queueSelectionCounts.failed})`
                  : `❌ Clear failed (${queueSelectionCounts.failed})`}
              </button>
            </div>
          )}

          {/* ── Status filter row ── */}
          {!loading && (jobs.length > 0 || jobTotal > 0) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '0 4px', alignItems: 'center' }}>
              <span style={{ ...TYPE.microFig, color: E.inkDim, fontSize: 10, fontWeight: 800 }}>FILTER</span>
              {(['all', 'pending', 'drafting', 'pr_created', 'merged', 'failed', 'stuck'] as const).map((s) => {
                const active = queueStatusFilter === s
                const count = s === 'all' ? queueSelectionCounts.total
                  : s === 'pending' ? queueSelectionCounts.pending
                  : s === 'drafting' ? queueSelectionCounts.drafting
                  : s === 'failed' ? queueSelectionCounts.failed
                  : s === 'stuck' ? queueSelectionCounts.stuck
                  : jobs.filter((j) => j.status === s).length
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQueueStatusFilter(s)}
                    style={{
                      padding: '3px 10px', borderRadius: 0,
                      border: active ? `2px solid ${E.gold}` : `1px solid ${E.hairline}`,
                      background: active ? E.goldSoft : 'transparent',
                      color: active ? E.goldDeep : E.inkSoft,
                      fontFamily: E.mono, fontSize: 9.5, fontWeight: 700,
                      cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}
                  >
                    {s.replace('_', ' ')} · {count}
                  </button>
                )
              })}
              <span style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={() => { setQueueStatusFilter('all'); setSelectedJobIds(new Set()) }}
                  style={{
                    border: 'none', background: 'transparent', padding: '3px 8px',
                    color: E.inkDim, fontFamily: E.mono, fontSize: 9.5, fontWeight: 700,
                    cursor: 'pointer', textTransform: 'uppercase',
                  }}
                >
                  ↺ Reset
                </button>
              </span>
            </div>
          )}

          {(jobs.length > 0 || jobTotal > 0) && <QueueTable
            jobs={visibleQueueJobs}
            total={visibleQueueJobs.length}
            summary={jobSummary}
            onSelect={(job) => { setQueueFocusJobId(null); setSelectedJob(job) }}
            selectedIds={selectedJobIds}
            onToggleSelect={(jobId) => {
              setSelectedJobIds((prev) => {
                const next = new Set(prev)
                if (next.has(jobId)) next.delete(jobId); else next.add(jobId)
                return next
              })
            }}
            onToggleSelectAll={(ids) => setSelectedJobIds(ids.length === selectedJobIds.size ? new Set() : new Set(ids))}
            focusJobId={queueFocusJobId}
            loading={loading}
            mergeIndex={mergeIndex}
            gateByJob={gateByJob}
            onLoadMore={loadMoreJobs}
            onBulkAction={(kind) => { void runBulkQueueAction(kind as Parameters<typeof runBulkQueueAction>[0]) }}
            bulkBusy={queueBulkBusy}
            bulkAction={queueBulkAction}
          />}
        </div>
      )}
      {tab === 'draft' && (
        <div id="studio-panel-draft-review" role="tabpanel" aria-labelledby="studio-tab-draft" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px 0', borderTop: `1px solid ${E.hairline}` }}>
            <span style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>REVIEW &amp; GATES</span>
            <span style={{ fontSize: 10.5, color: E.inkSoft, fontFamily: E.mono }}>quality · compliance · depth · link integrity — every gate must clear before approve</span>
          </div>
          <ReviewDraftsPanel
            jobs={jobs}
            gateByJob={gateByJob}
            selectedJobId={selectedJob?.id ?? null}
            onOpenJob={(j) => { setSelectedJob(j) }}
            reviewAuditResult={reviewAuditResult}
            setActionNotice={setActionNotice}
          />
          {/* AI-enabled inline editor — fix blockers interactively */}
          {selectedJob?.content && (
            <div style={{ marginTop: 14, padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow }}>
              <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12 }}>
                INTERACTIVE EDITOR — RE-AUDIT · FIX ALL · FIX PER ISSUE
              </div>
              <AdminInlineEditor
                content={selectedJob.content}
                jobId={selectedJob.id}
                onChange={(v: string) => {
                  setSelectedJob((prev) => prev ? { ...prev, content: v } : prev)
                }}
                contentType={selectedJob.content_type}
                primaryKeyword={selectedJob.primary_keyword ?? undefined}
                indexable={selectedJob.indexable}
                region={selectedJob.region ?? undefined}
                reviewModel={reviewModel}
                onReviewModelChange={setReviewModel}
                onScoreChange={async (_s) => {
                  void fetchGateRuns()
                  const latestContent = latestJobContentRef.current
                  if (latestContent) {
                    try {
                      const res = await fetch('/api/content-studio/reaudit', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          content: latestContent,
                          contentType: selectedJob?.content_type,
                          primaryKeyword: selectedJob?.primary_keyword ?? undefined,
                          indexable: selectedJob?.indexable,
                        }),
                      })
                      const data = await res.json().catch(() => ({})) as any
                      if (res.ok) {
                        setReviewAuditResult({
                          score: data.score ?? 0,
                          ok: Boolean(data.ok),
                          blockers: data.blockers ?? 0,
                          warnings: data.warnings ?? 0,
                          summary: data.summary ?? '',
                          annotations: data.annotations ?? [],
                        })
                      }
                    } catch { /* best-effort */ }
                  }
                }}
              />
            </div>
          )}
        </div>
      )}


      {/* ══════════ I · DISCOVER ══════════ */}
      {/* Stage I — scan all signals. GSC, radar, insights, LLM/AEO visibility,
          engine knowledge, systems health, and ownership constraints all enter
          before any research question is formed. */}
      {tab === 'discover' && (
        <>
          <ChapterIntro
            numeral="I"
            title="Discover"
            subtitle="No research starts until the signals are assembled. Read the live search landscape, engine knowledge, topical gaps, ownership constraints, and visibility signals before committing to a direction."
            chapterKey="discover"
            scope={[
              { chip: 'Signals', text: 'Live GSC, committed snapshots, engine knowledge, LLM/AEO visibility, and site-health signals.' },
              { chip: 'Opportunity', text: 'Radar and reward forecasts expose gaps, rising demand, weak families, and cannibalization risk.' },
              { chip: 'Constraints', text: 'Ownership registry, destination repo, format rules, and canonical supply are known before research begins.' },
            ]}
            next="II · Research"
            onJump={selectTab}
          />
          <div id="studio-panel-discover" role="tabpanel" aria-labelledby="studio-tab-discover" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── UNIFIED WORK PLAN — all signal sources aggregated ── */}
            <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>WORK PLAN — ALL SIGNALS AGGREGATED</div>
                  <h3 style={{ margin: '4px 0 0', fontFamily: C.serif, fontSize: 20, color: E.ink }}>Select opportunities to research</h3>
                  <p style={{ margin: '2px 0 0', color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 12 }}>
                    Radar gaps · cannibalization alerts · merge candidates · backlink targets · AEO visibility gaps — every signal, one table.
                  </p>
                </div>
              </div>
              <WorkPlanTable
                items={workPlanItems}
                selectedIds={selectedWorkPlanIds}
                onToggleSelect={(id) => setSelectedWorkPlanIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id); else next.add(id)
                  return next
                })}
                onSelectAll={() => setSelectedWorkPlanIds(new Set(workPlanItems.map((i) => i.id)))}
                onClearSelection={() => setSelectedWorkPlanIds(new Set())}
                onSendToResearch={handleSendToResearch}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 14, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <GscMini />
                <OpportunityRadar opportunities={radar} meta={radarMeta} onApply={applyBrief} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MergeHistory />
                <InterlinksMini topic={topic} keywords={keywords} />
                <ResearchLiveOperations />
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: E.cream, border: `1px dashed ${E.hairline}`, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 13 }}>
              The evidence room is complete here: engine status and ingestion controls are in the masthead; GSC, radar, ownership, interlinks, and site health remain attached to this dossier. No second command-center navigation is required.
            </div>
          </div>
        </>
      )}

      {/* ══════════ V · DEFENSE ══════════ */}

      {/* ══════════ VI · APPROVE ══════════ */}
      {/* Stage VI — approve and merge the reviewed draft,
          monitor the Cloudflare build, and ensure the deploy lands before
          the publication record receives the citation. */}
      {tab === 'approve' && (
        <>
          <ChapterIntro
          numeral="IV"
          title="Approve & Track"
          subtitle="Once review is green, the content earns approval. Push the reviewed PR, watch the deployment, verify the live URL, and record the publication in the ledger."
          chapterKey="approve"
            scope={[
              { chip: 'Push to main',  text: 'Opens the PR to the deployment repo; auto-resolves once the build is green.' },
              { chip: 'Deploy watch',  text: 'Monitors Cloudflare Pages deploy + the canary route status.' },
              { chip: 'Rollback',      text: 'A single click reverts the change and removes it from the citation ledger.' },
            ]}
            prev="IV · Review"
            next="VI · Track"
            onJump={selectTab}
          />
          <ApprovePanel
            selectedJob={selectedJob}
            jobs={jobs}
            merges={merges}
            onOpenJob={(j) => { setSelectedJob(j) }}
            setActionNotice={setActionNotice}
            onApproveAndMerge={runApproveAndMerge}
            onMerged={() => { void fetchJobs(); selectTab('approve') }}
          />
          <PublishLedger
            merges={merges}
            jobs={jobs}
            onOpenJob={(j) => { setSelectedJob(j) }}
            setActionNotice={setActionNotice}
          />
        </>
      )}

      {/* ══════════ VII · TRACK ══════════ */}

      {/* ══════════ VII · CONFIGURE ══════════ */}
      {tab === 'configure' && (
        <>
          <ChapterIntro
            numeral="VII"
            title="Configure"
            subtitle="System configurator: manage AI provider keys, connect Google Search Console, audit site health, and maintain the deep interlink registry — all from one place."
            chapterKey="configure"
            scope={[
              { chip: '🔑 AI keys', text: 'Manage API keys for every content provider (OpenAI, Nemotron, Grok, DeepSeek, GLM, Gemini, and more).' },
              { chip: '🔗 GSC', text: 'Connect Search Console via OAuth or service-account JSON. Live status with green / amber / red indicator.' },
              { chip: '🩺 Health', text: 'Site-wide audit, broken link detection, deep interlink registry, and system diagnostics.' },
            ]}
            prev="VI · Track"
            onJump={selectTab}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── Row 1: AI Key Vault (full width) ── */}
            <section style={{
              padding: 18, background: E.paper, border: `1px solid ${E.hairline}`,
            }}>
              <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🔑</span>AI PROVIDER KEYS
              </div>
              <AiKeyVaultPanel onChanged={() => { fetchSuggestions(region) }} />
            </section>

            {/* ── Row 2: Model Calibration (full width) ── */}
            <section style={{
              padding: 18, background: E.paper, border: '1px solid ' + E.hairline,
            }}>
              <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🧠</span>RANKING MODEL CALIBRATION
              </div>
              {!modelCalibration ? (
                <div style={{ fontFamily: C.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
                  Loading calibration status…
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  {/* Accuracy gauge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      border: '3px solid ' + (modelCalibration.accuracy != null
                        ? modelCalibration.accuracy >= 80 ? E.mossGreen
                        : modelCalibration.accuracy >= 50 ? '#C47F17'
                        : C.red
                        : E.hairline),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: modelCalibration.accuracy != null
                        ? (modelCalibration.accuracy >= 80 ? E.mossSoft
                          : modelCalibration.accuracy >= 50 ? '#FFF7ED'
                          : '#FEF2F2')
                        : E.parchment,
                    }}>
                      <span style={{
                        fontFamily: C.serif, fontSize: 16, fontWeight: 700,
                        color: modelCalibration.accuracy != null
                          ? modelCalibration.accuracy >= 80 ? E.mossGreen
                          : modelCalibration.accuracy >= 50 ? '#C47F17'
                          : C.red
                          : E.inkDim,
                      }}>
                        {modelCalibration.accuracy != null ? `${modelCalibration.accuracy}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontFamily: C.serif, fontSize: 14, fontWeight: 600, color: E.ink }}>
                        Forecast Accuracy
                      </div>
                      <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                        {modelCalibration.accuracyTrend === 'improving' ? '↗ Improving' : modelCalibration.accuracyTrend === 'declining' ? '↘ Declining' : modelCalibration.accuracyTrend === 'stable' ? '→ Stable' : 'No trend data'}
                      </div>
                    </div>
                  </div>

                  {/* Calibration details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, minWidth: 70 }}>Version</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: E.ink }}>
                        {modelCalibration.modelVersion}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, minWidth: 70 }}>Last calibrated</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: E.ink }}>
                        {modelCalibration.lastCalibratedAt
                          ? new Date(modelCalibration.lastCalibratedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Never'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, minWidth: 70 }}>Events</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: E.ink }}>
                        {modelCalibration.eventsCount} reward events
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, minWidth: 70 }}>Recent runs</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: E.ink }}>
                        {modelCalibration.recentRuns} forecasts (30d)
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 0, fontSize: 9,
                      fontFamily: C.mono, fontWeight: 700, letterSpacing: '0.08em',
                      background: modelCalibration.lastCalibratedAt
                        ? (modelCalibration.accuracy != null && modelCalibration.accuracy >= 70 ? E.mossSoft : '#FFF7ED')
                        : '#FEF2F2',
                      color: modelCalibration.lastCalibratedAt
                        ? (modelCalibration.accuracy != null && modelCalibration.accuracy >= 70 ? E.mossGreen : '#C47F17')
                        : C.red,
                    }}>
                      {modelCalibration.lastCalibratedAt
                        ? (modelCalibration.accuracy != null && modelCalibration.accuracy >= 70 ? '✓ HEALTHY' : '⚠ NEEDS DATA')
                        : '✕ NOT CALIBRATED'}
                    </span>
                    <span style={{ fontSize: 8, color: E.inkDim, fontFamily: C.mono }}>
                      auto-calibrates weekly via reward loop
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* ── Row 3: System Health Summary ── */}
            <section style={{
              padding: 18, background: E.paper, border: '1px solid ' + E.hairline,
            }}>
              <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>📋</span>SYSTEM HEALTH SUMMARY
              </div>
              {!systemHealth ? (
                <div style={{ fontFamily: C.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
                  Loading system metrics…
                </div>
              ) : (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
                }}>
                  {[
                    {
                      label: 'API Keys',
                      value: String(systemHealth.apiKeysConfigured),
                      sub: 'providers configured',
                      icon: '🔑',
                      color: systemHealth.apiKeysConfigured >= 2 ? E.mossGreen : systemHealth.apiKeysConfigured >= 1 ? '#C47F17' : C.red,
                    },
                    {
                      label: 'GSC Connection',
                      value: systemHealth.gscConnected ? 'Connected' : 'Offline',
                      sub: systemHealth.gscMode ? String(systemHealth.gscMode).replace('_', ' ').toUpperCase() : 'no token',
                      icon: systemHealth.gscConnected ? '🔗' : '🔌',
                      color: systemHealth.gscConnected ? E.mossGreen : C.red,
                    },
                    {
                      label: 'Site Scanned',
                      value: systemHealth.lastSiteScan
                        ? new Date(systemHealth.lastSiteScan).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'Never',
                      sub: siteAuditBusy ? '⏳ auditing…' : systemHealth.lastSiteScan ? 'last audit run' : 'run site health audit',
                      icon: '🩺',
                      color: systemHealth.lastSiteScan ? E.mossGreen : E.inkDim,
                      action: !siteAuditBusy ? (async () => {
                        setSiteAuditBusy(true)
                        try {
                          await fetch('/api/content-studio/site-health', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ action: 'audit', scope: 'all' }),
                          })
                          await loadSystemHealth()
                        } catch { /* silent */ }
                        finally { setSiteAuditBusy(false) }
                      }) : undefined,
                    },
                    {
                      label: 'Interlinks',
                      value: String(systemHealth.interlinkTotal),
                      sub: `${systemHealth.interlinkActive} active · registry size`,
                      icon: '🕸️',
                      color: systemHealth.interlinkTotal > 0 ? E.mossGreen : E.inkDim,
                    },
                    {
                      label: 'Shipped',
                      value: String(systemHealth.totalShipped),
                      sub: 'merged content jobs',
                      icon: '📦',
                      color: systemHealth.totalShipped > 0 ? E.mossGreen : E.inkDim,
                    },
                  ].map((metric, i) => (
                    <div key={i} style={{
                      padding: '12px 14px',
                      border: '1px solid ' + E.hairline,
                      borderRadius: 0,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 20 }}>{metric.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {metric.label}
                        </div>
                        <div style={{
                          fontFamily: C.serif, fontSize: 18, fontWeight: 700,
                          color: metric.color,
                          lineHeight: 1.2,
                        }}>
                          {metric.value}
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 8, color: E.inkDim }}>
                          {metric.sub}
                        </div>
                        {(metric as any).action && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); (metric as any).action() }}
                            style={{
                              marginTop: 4, padding: '3px 8px', borderRadius: 0,
                              border: '1px solid ' + E.gold,
                              background: 'transparent', color: E.gold,
                              fontFamily: C.mono, fontSize: 7, fontWeight: 700,
                              letterSpacing: '0.1em', cursor: 'pointer',
                              textTransform: 'uppercase',
                            }}
                          >
                            {siteAuditBusy ? '⏳ Running…' : 'Run audit →'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Row 4: GSC + Site Health side by side ── */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14,
            }}>
              {/* GSC Connection */}
              <section style={{
                padding: 18, background: E.paper, border: `1px solid ${E.hairline}`,
              }}>
                <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🔗</span>SEARCH CONSOLE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: gscStatus?.connected ? (gscStatus?.live ? '#16A34A' : '#D97706') : '#DC2626',
                    boxShadow: gscStatus?.connected ? `0 0 0 3px ${gscStatus?.live ? 'rgba(22,163,74,0.16)' : 'rgba(217,119,6,0.16)'}` : '0 0 0 3px rgba(220,38,38,0.16)',
                  }} />
                  <div>
                    <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 600, color: E.ink }}>
                      {gscStatus?.connected ? (gscStatus?.live ? 'Connected · Live data' : 'Connected · Snapshot only') : 'Not connected'}
                    </div>
                    <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                      {gscStatus?.mode ? (
                        <span style={{
                          padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                          background: String(gscStatus.mode) === 'oauth' ? '#DBEAFE' : '#FEF3C7',
                          color: String(gscStatus.mode) === 'oauth' ? '#1E40AF' : '#92400E',
                        }}>
                          {String(gscStatus.mode).toUpperCase()}
                        </span>
                      ) : 'No GSC token configured'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGscConnectOpen(true)}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 0,
                    border: `1px solid ${E.gold}`, background: 'transparent',
                    color: E.gold, cursor: 'pointer',
                    fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = E.gold; (e.target as HTMLButtonElement).style.color = E.ivory }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = E.gold }}
                >
                  {gscStatus?.connected ? '↻ Reconnect GSC' : '→ Connect GSC'}
                </button>
              </section>

              {/* Site Health */}
              <section style={{
                padding: 18, background: E.paper, border: `1px solid ${E.hairline}`,
              }}>
                <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🩺</span>SITE HEALTH
                </div>
                <AdminSiteHealthPanel />
              </section>

              {/* Rhythm Alerts (weekly scan) */}
              <section style={{
                padding: 18, background: E.paper, border: `1px solid ${E.hairline}`,
              }}>
                <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🎼</span>RHYTHM ALERTS <span style={{ color: E.inkMuted, fontWeight: 400 }}>— weekly sentence-opening scan</span>
                </div>
                <AdminRhythmAlertsPanel onOpenJob={(jobId) => { void openRhythmAlertJob(jobId) }} />
              </section>
            </div>

            {/* ── Row 5: Deep Interlinks (full width) ── */}
            <section style={{
              padding: 18, background: E.paper, border: `1px solid ${E.hairline}`,
            }}>
              <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🕸️</span>DEEP INTERLINKS
              </div>
              <AdminDeepInterlinkPanel setActionNotice={setActionNotice} />
            </section>
          </div>
        </>
      )}

      {/* ── Detail modal ── */}
      {selectedJob && (
        <JobDetail
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onRefresh={async () => { await fetchJobs() }}
          setActionNotice={setActionNotice}
          onReplacementJob={(jobId) => { setQueueFocusJobId(jobId); setSelectedJob(null); selectTab('draft') }}
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

      {/* ── Sticky bottom navigation — appears when work plan items are selected ── */}
      {tab === 'discover' && selectedWorkPlanIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          padding: '14px 28px',
          background: `linear-gradient(0deg, ${E.ivory} 0%, ${E.ivory}EE 100%)`,
          borderTop: `2px solid ${E.gold}`,
          boxShadow: '0 -4px 24px rgba(17,21,28,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: E.gold, color: E.ivory,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: C.mono, fontSize: 14, fontWeight: 800,
            }}>{selectedWorkPlanIds.size}</span>
            <div>
              <div style={{ fontFamily: C.serif, fontSize: 15, color: E.ink, fontWeight: 600 }}>
                {selectedWorkPlanIds.size} opportunity{selectedWorkPlanIds.size !== 1 ? 'ies' : ''} selected
              </div>
              <div style={{ fontSize: 11, color: E.inkMuted, fontFamily: C.mono }}>
                Ready to research — keywords, intent, cannibalization, and interlinks will be analyzed
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setSelectedWorkPlanIds(new Set())}
              style={{ padding: '10px 16px', borderRadius: 0, border: `1px solid ${E.hairline}`, background: 'transparent', color: E.inkMuted, cursor: 'pointer', fontFamily: C.serif, fontSize: 13, fontWeight: 600 }}>
              Clear selection
            </button>
            <button type="button"
              onClick={() => handleSendToResearch(workPlanItems.filter((i) => selectedWorkPlanIds.has(i.id)))}
              style={{
                padding: '12px 24px', borderRadius: 0, border: 'none',
                background: E.gold, color: E.ivory, cursor: 'pointer',
                fontFamily: C.serif, fontSize: 15, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              Continue to Research →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
