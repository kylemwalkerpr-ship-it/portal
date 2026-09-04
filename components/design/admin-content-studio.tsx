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
import { StudioLiveDesk, ENGINE_ACTION_LABEL, type DeskLiveState } from './studio-live-desk'
import { AeoRemediationQueue } from './studio-aeo-remediation'
import { actionHeadings, countryFromUrl, type CitationRemediation } from '@/lib/seoEngine/citationRemediation'
import { ensureKeywordFloors } from '@/lib/seoEngine/keywordFloors'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { autoMapKeywordsToH2s } from '@/lib/seoFactory/keywordPlacement'
import { mergeInterlinkLists, type StudioInterlink } from '@/lib/seoFactory/studioInterlinks'
import type { DepthRescueStats } from '@/lib/seoFactory/depthRescue'
import { DISSERTATION_STAGES, isStudioStage, nearestAvailableStage, resolveStudioStage, transferCompetingWinner, type StudioStage } from '@/lib/seoFactory/studioPipeline'
import { consumeSseStream, describeGenerationFailure } from '@/lib/seoFactory/sse'
import SeoIntelligenceDashboard from './seo-intelligence-dashboard'
import EditorSeoIntelPanel from './editor-seo-intel-panel'
import { subscribeToTable, subscribeToTables } from '@/lib/supabaseRealtime'
import { collectDiscoverCitationUrls, isCitableSource, mergeCitationUrlLists, sourcesForBrief } from '@/lib/seoFactory/officialSources'
import { buildSectionBudgets, ensureSectionBudgets, syncSectionBudgetsToOutline } from '@/lib/seoFactory/prompts'
import { jobDetailShouldAutoLoadBody } from '@/lib/seoFactory/jobColumns'
import {
  asQueueUiFilter,
  queueClearConfirmCopy,
  queueDeleteConfirmCopy,
  queueFilterForJobStatus,
  queueJobsListPath,
  queueTabCount,
  type QueueClearAction,
  type QueueUiFilter,
} from '@/lib/seoFactory/jobsQueue'
import { clampBriefWordBudget, countBodyWords, depthSpecForType, editorialTypeForDepth, formatBodyWordDisplay, targetWordsForType } from '@/lib/seoFactory/contentDepth'
import {
  extractMetricValues,
  directionForMetric,
  arrowForMetric,
  formatMetricValue,
  formatCtr,
  type Metric,
} from '@/lib/seoFactory/publishLedgerMetric'
import { RankingModelBlock } from './admin-ranking-model-block'
import {
  classifyCannibalMergeResult,
  formatCannibalSweepNotice,
  type CannibalMergeResponseBody,
  type CannibalResolveOutcome,
} from '@/lib/seoFactory/cannibalResolveOutcome'
import GscConnectModal from './admin-gsc-connect-modal'
import AdminDeepInterlinkPanel from './admin-deep-interlink-panel'
import AdminSiteHealthPanel from './admin-site-health-panel'
import OrphanWatch from './studio-orphan-watch'
import AdminRhythmAlertsPanel from './admin-rhythm-alerts-panel'
import AiKeyVaultPanel from './ai-key-vault-panel'
import AdminInlineEditor from './admin-inline-editor'
import { resolveShipRefusalBanner, shipActionsEnabled, shipGateFromResponse, shipGateReady, type ShipGate } from '@/lib/seoFactory/currentGate'
import { StudioModelHostSelect } from './studio-model-host-select'
import { DEFAULT_BRIEF_PIN, DEFAULT_DRAFT_PIN, DEFAULT_REVIEW_PIN, parseStudioPin, resolveJobPickerPin } from '@/lib/contentAiCatalog'
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
  isOpenPr,
  isPublishedJob,
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
  shipGateFromAuditPayload,
  shipGateIsCleared,
} from './studio-ui-shared'
import { QueueStats, QueueTable } from './studio-queue'
import { ReviewDraftsPanel } from './studio-review-panels'
import { MasterEnginePanel } from './master-engine-panel'


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
  'runbios-glm-53-flash': 'glm-5.3-flash',
  'runbios-glm-52': 'glm-5.2',
  'runbios-deepseek-flash': 'deepseek-v4-flash',
  'runbios-deepseek-pro': 'deepseek-v4-pro',
  'runbios-minimax': 'minimax-m3',
  'runbios-kimi': 'kimi-k2.7-code',
  'runbios-qwen': 'qwen3.5-397b-a17b',
  'runbios-adaptive': 'bios-adaptive',
  'runbios-claude-sonnet': 'claude-sonnet-5',
  'runbios-claude-opus': 'claude-opus-5',
  openai: 'gpt-5.6-terra',
  custom: 'gpt-5.6-terra',
  'gpt-5.6-sol': 'gpt-5.6-sol',
  'gpt-5.6-terra': 'gpt-5.6-terra',
  grok: 'grok-4.6',
  deepseek: 'deepseek-chat',
  'nvidia-minimax': 'minimaxai/minimax-m3',
  'nvidia-nemotron': 'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia-glm': 'z-ai/glm-5.2',
  'baseten-deepseek': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'baseten-deepseek-pro': 'deepseek-ai/DeepSeek-V4-Pro-0813',
  'parasail-deepseek': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'parasail-deepseek-pro': 'deepseek-ai/DeepSeek-V4-Pro-0813',
  'parasail-glm': 'z-ai/glm-5.2',
  'nvidia-deepseek': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'deepseek-flash': 'deepseek-ai/DeepSeek-V4-Flash-0731',
  'deepseek-pro': 'deepseek-ai/DeepSeek-V4-Pro-0813',
  'entrim-deepseek': 'deepseek-ai/DeepSeek-V4-Flash',
  'entrim-qwen-27b': 'Qwen/Qwen3.6-27B',
  'zai-glm': 'glm-5.2',
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
  valueScore?: number
  priorityTier?: 'high' | 'medium' | 'low'
  trend: 'rising' | 'flat' | 'declining'
  play: 'content_gap' | 'quick_win' | 'refresh' | 'defend' | 'cannibalization'
  intent: 'informational' | 'commercial' | 'transactional' | 'local' | 'navigational'
  contentType?: 'blog_post' | 'article' | 'regional_page'
  intentCategory: string
  profitability: 'high' | 'medium' | 'low'
  reason: string
  signals: string[]
  interlinks?: StudioInterlink[]
  coverage?: { matched: boolean; matches: string[] }
  sourcePage?: string
  cluster?: {
    clusterId: string; canonicalTerm: string; keywords: string[]; intent: string
    totalImpressions: number; mode: 'expand' | 'new'; targetUrl: string | null; reason: string
  } | null
  /** Lean ranking-model view (total · confidence · recommendedActions · forecast) — attached by the suggestions API. */
  ranking?: LeanRanking
  aeoRemediation?: {
    query: string
    url: string | null
    jobId: string | null
    mode: 'expand' | 'new'
    actions: Array<{ priority: number; action: string; evidence: string }>
  }
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

// Drafting model × host is defined in lib/contentAiCatalog (StudioModelHostSelect).

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

// ── Editorial chrome — shared by every stage panel ──
// Single source for the gold mono section kickers + paper card surfaces so the
// Discover / Research / Draft / Approve stages read as one product.
const kickerStyle: React.CSSProperties = { ...E.kicker }
const kickerStyleSm: React.CSSProperties = { ...E.kicker, fontSize: 9, letterSpacing: '0.14em' }
const panelCard: React.CSSProperties = {
  padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow,
}
const panelCardPlain: React.CSSProperties = {
  background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow,
}
// Top gold rule used by stage cards to echo ChapterIntro / the stage nav.
function GoldRule({ offset = 18 }: { offset?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, left: offset, right: offset, height: 2,
        borderRadius: E.radiusFull, background: E.goldRule, opacity: 0.8,
      }}
    />
  )
}

// ── SEO Master Engine masthead — live telemetry helpers ────────────────────────
// The masthead strip is a live instrument panel, not a static label: every signal
// cell is re-read from the engine status DB, and the telemetry panel streams the
// SSE trace of the running action (or the engine's recent run history when idle)
// so the operator can SEE the engine reasoning instead of a frozen number.




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

  let finalResult: any = null
  await consumeSseStream(response.body, (event) => {
    onEvent(event)
    if (event.type === 'final') finalResult = event.result
    if (event.type === 'error') throw new Error(String(event.error || 'Generation pipeline failed'))
  })
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
// Surfaces three approval surfaces: completed drafts (approve → ship), open
// PRs (merge or decline), and the latest merge/deploy activity.
function ApprovePanel({
  selectedJob, jobs, merges, onOpenJob, setActionNotice, onApproveAndMerge, onMergePr, onDeclinePr, onMerged,
  shipGateByJob,
}: {
  selectedJob: ContentJob | null
  jobs: ContentJob[]
  merges: any[]
  onOpenJob: (j: ContentJob) => void
  setActionNotice?: (msg: string) => void
  onApproveAndMerge?: (j: ContentJob) => Promise<{ ok: boolean; message?: string; rhythmDetail?: { key: string; count: number } | null }>
  /** Merge the job's already-open PR (no re-ship). Used by PR rows. */
  onMergePr?: (j: ContentJob) => Promise<{ ok: boolean; message?: string }>
  /** Decline/close the job's open PR. */
  onDeclinePr?: (j: ContentJob) => Promise<{ ok: boolean; message?: string }>
  onMerged?: () => void
  /** Canonical ship-gate snapshots per job — approve is only offered the
   *  moment one exists AND passes (shipReady && blockers === 0). */
  shipGateByJob?: ReadonlyMap<string, ShipGate> | null
}) {
  const prOpen = jobs.filter(isOpenPr)
  // Ready drafts = generation finished AND the ship gate has actually cleared.
  // A finished draft (content present) WITHOUT a confirmed ship gate is listed
  // separately below with honest "awaiting audit" copy — never bulk_approve.
  const gateOf = (j: ContentJob): ShipGate => shipGateByJob?.get(j.id) ?? shipGateFromAuditPayload(j.audit_json ?? null)
  const gateCleared = (j: ContentJob) => shipGateIsCleared(gateOf(j))
  const gateBlocked = (j: ContentJob) => { const g = gateOf(j); return g !== null && !shipGateIsCleared(g) }
  const readyDraftCandidates = jobs.filter((j) => j.status === 'drafting' && Boolean(j.content))
  const readyToApprove = readyDraftCandidates.filter(gateCleared)
  const unGatedDrafts = readyDraftCandidates.filter((j) => !gateCleared(j))
  // Still running: queued (pending) or drafting with nothing written yet.
  const inProgress = jobs.filter((j) => j.status === 'pending' || (j.status === 'drafting' && !j.content))
  const recentMerges = (merges || []).slice(0, 8)

  // Per-job approve progress: 'idle' | 'opening' | 'merging' | 'monitoring' | 'ok' | 'failed'
  // bulk_approve resolves only when the full sequence is done, so we project
  // coarse stage milestones to keep the admin informed during CI.
  type ApproveProgress = 'idle' | 'opening' | 'merging' | 'monitoring' | 'ok' | 'failed' | 'closed'
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
  // Poll the live monitor endpoint for real deploy status (started only AFTER
  // the approve/merge call resolves — polling a pre-ship job just returns
  // "checking" forever).
  const startMonitoring = React.useCallback((jobId: string, started: number) => {
    const timer = setInterval(async () => {
      try {
        const mr = await fetch(`/api/seo-factory/monitor?jobId=${encodeURIComponent(jobId)}`, {
          credentials: 'same-origin',
        })
        const md = await mr.json().catch(() => ({})) as Record<string, unknown>
        if (!mr.ok || !md.ok) {
          setApproveProgress((prev) => prev[jobId]
            ? { ...prev, [jobId]: { ...prev[jobId], stage: 'monitoring', message: String(md.checkState || 'Checking deploy…') } }
            : prev)
          return
        }
        const state = String(md.checkState || '')
        if (state === 'success' || state === 'deployed' || state === 'live') {
          clearInterval(timer)
          setApproveProgress((prev) => prev[jobId]
            ? { ...prev, [jobId]: { stage: 'ok', message: md.deployUrl ? `✓ Deployed → ${md.deployUrl}` : (md.prUrl ? `✓ PR #${md.prNumber || '?'} merged · deploy live` : '✓ Merged · deploy live'), startedAt: prev[jobId].startedAt, finishedAt: Date.now() } }
            : prev)
        } else if (state === 'failure' || state === 'error') {
          clearInterval(timer)
          setApproveProgress((prev) => prev[jobId]
            ? { ...prev, [jobId]: { stage: 'failed', message: String(md.action || 'Deploy failed'), startedAt: prev[jobId].startedAt, finishedAt: Date.now() } }
            : prev)
        } else {
          setApproveProgress((prev) => prev[jobId]
            ? { ...prev, [jobId]: { ...prev[jobId], stage: 'monitoring', message: String(state || 'Building…') } }
            : prev)
        }
      } catch {
        // keep polling
      }
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  const runApproveRow = React.useCallback(async (j: ContentJob) => {
    if (!onApproveAndMerge) return
    const started = Date.now()
    setApproveProgress((prev) => ({
      ...prev,
      [j.id]: { stage: 'opening', message: 'Shipping…', startedAt: started },
    }))
    try {
      const result = await onApproveAndMerge(j)
      const ok = result.ok
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: {
          stage: ok ? 'monitoring' : 'failed',
          message: result.message || (ok ? 'Shipped — monitoring deploy' : 'Push failed'),
          startedAt: prev[j.id]?.startedAt || started,
          finishedAt: ok ? undefined : Date.now(),
        },
      }))
      // Surface the ship-time rhythm refusal (structured detail from the
      // approve API) as a dedicated notice naming the opener + count.
      const rhythmDetail = (result as { rhythmDetail?: { key: string; count: number } | null }).rhythmDetail
      setRhythmRefusal(j.id, rhythmDetail ?? null)
      if (ok) {
        startMonitoring(j.id, started)
        onMerged?.()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push failed'
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: { stage: 'failed', message, startedAt: started, finishedAt: Date.now() },
      }))
      setRhythmRefusal(j.id, null)
      setActionNotice?.(message)
    }
  }, [onApproveAndMerge, setActionNotice, onMerged, setRhythmRefusal, startMonitoring])

  // Merge an already-open PR — no re-ship. Mirrors runApproveRow's progress
  // lifecycle but delegates to onMergePr (PATCH merge_pr).
  const runMergePrRow = React.useCallback(async (j: ContentJob) => {
    if (!onMergePr) return
    const started = Date.now()
    setApproveProgress((prev) => ({
      ...prev,
      [j.id]: { stage: 'opening', message: `Merging PR #${j.pr_number ?? '?'}…`, startedAt: started },
    }))
    try {
      const result = await onMergePr(j)
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: {
          stage: result.ok ? 'monitoring' : 'failed',
          message: result.message || (result.ok ? 'Merged — monitoring deploy' : 'Merge failed'),
          startedAt: prev[j.id]?.startedAt || started,
          finishedAt: result.ok ? undefined : Date.now(),
        },
      }))
      setRhythmRefusal(j.id, null)
      if (result.ok) {
        startMonitoring(j.id, started)
        onMerged?.()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed'
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: { stage: 'failed', message, startedAt: started, finishedAt: Date.now() },
      }))
      setActionNotice?.(message)
    }
  }, [onMergePr, setActionNotice, onMerged, setRhythmRefusal, startMonitoring])

  // Decline an open PR — closes it on GitHub + marks the job closed.
  const runDeclinePrRow = React.useCallback(async (j: ContentJob) => {
    if (!onDeclinePr) return
    const started = Date.now()
    setApproveProgress((prev) => ({
      ...prev,
      [j.id]: { stage: 'opening', message: `Closing PR #${j.pr_number ?? '?'}…`, startedAt: started },
    }))
    try {
      const result = await onDeclinePr(j)
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: {
          stage: result.ok ? 'closed' : 'failed',
          message: result.message || (result.ok ? 'PR closed' : 'Close failed'),
          startedAt: prev[j.id]?.startedAt || started,
          finishedAt: Date.now(),
        },
      }))
      if (result.ok) onMerged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Close failed'
      setApproveProgress((prev) => ({
        ...prev,
        [j.id]: { stage: 'failed', message, startedAt: started, finishedAt: Date.now() },
      }))
      setActionNotice?.(message)
    }
  }, [onDeclinePr, setActionNotice, onMerged])
  return (
    <div data-testid="studio-approve-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...panelCard, position: 'relative', boxShadow: E.panelShadow }}>
        <GoldRule offset={18} />
        <div style={kickerStyle}>STAGE V · APPROVE</div>
        <h3 style={{ margin: '4px 0 12px', fontFamily: C.serif, fontSize: 22, color: E.ink }}>Push to main · {prOpen.length} open PR{prOpen.length === 1 ? '' : 's'}</h3>
        {prOpen.length === 0 && (
          <p style={{ margin: 0, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic' }}>
            No PRs awaiting merge. Drafts that clear the review ship gate appear here as PRs to merge.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prOpen.map((j) => {
            const progress = approveProgress[j.id]
            const isWorking = progress && progress.stage !== 'ok' && progress.stage !== 'failed' && progress.stage !== 'closed'
            const stageColor =
              progress?.stage === 'ok' ? '#0f7a3a'
              : progress?.stage === 'failed' ? '#a32525'
              : progress?.stage === 'closed' ? '#6b7280'
              : isWorking ? '#b87a00'
              : 'transparent'
            const stageLabel =
              progress?.stage === 'ok' ? '✓ MERGED · LIVE'
              : progress?.stage === 'failed' ? '✕ FAILED'
              : progress?.stage === 'closed' ? '✕ DECLINED · PR CLOSED'
              : progress?.stage === 'monitoring' ? '⏳ MONITORING DEPLOY'
              : progress?.stage === 'merging' ? '⏳ MERGING'
              : progress?.stage === 'opening' ? '⏳ MERGING PR'
              : isWorking ? '⏳ WORKING...'
              : (onMergePr ? '🚀 MERGE PR → MAIN' : 'READY TO MERGE')
            return (
              <div key={j.id} data-testid={`studio-approve-row-${j.id}`} data-stage={progress?.stage || 'idle'} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: 12, background: E.ivory,
                border: `1px solid ${E.hairline}`, borderRadius: 0,
              }}>
                <button
                  type="button"
                  onClick={() => onMergePr ? runMergePrRow(j) : onOpenJob(j)}
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
                {/* Decline/close the open PR — reject without merging. */}
                {onDeclinePr && (
                  <div style={{ display: 'flex', gap: 8, paddingTop: 6, borderTop: `1px dashed ${E.hairline}` }}>
                    <button
                      type="button"
                      onClick={() => runDeclinePrRow(j)}
                      disabled={Boolean(isWorking)}
                      data-testid={`studio-approve-decline-${j.id}`}
                      title="Close this PR on GitHub and mark the job closed (reject without merging)"
                      style={{
                        fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '4px 10px', borderRadius: 0,
                        border: `1px solid #DC2626`, background: 'transparent', color: '#DC2626',
                        cursor: isWorking ? 'progress' : 'pointer',
                      }}
                    >
                      ✕ DECLINE PR
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenJob(j)}
                      disabled={Boolean(isWorking)}
                      style={{
                        fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '4px 10px', borderRadius: 0,
                        border: `1px solid ${E.hairline}`, background: 'transparent', color: E.inkMuted,
                        cursor: isWorking ? 'progress' : 'pointer',
                      }}
                    >
                      OPEN EDITOR
                    </button>
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
        <div style={{ ...panelCard }}>
          <div style={{ ...kickerStyle, marginBottom: 8 }}>
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
      {readyToApprove.length > 0 && (
        <div style={{ ...panelCard }}>
          <div style={{ ...kickerStyle, marginBottom: 8 }}>
            READY TO APPROVE · {readyToApprove.length} COMPLETED DRAFT{readyToApprove.length === 1 ? '' : 'S'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readyToApprove.map((j) => {
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
                : progress?.stage === 'opening' ? '⏳ SHIPPING…'
                : isWorking ? '⏳ WORKING…'
                : (onApproveAndMerge ? '✓ APPROVE → SHIP' : 'OPEN EDITOR')
              return (
                <div key={j.id} data-testid={`studio-approve-draft-row-${j.id}`} data-stage={progress?.stage || 'idle'} style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: 12, background: E.ivory,
                  border: `1px solid ${E.hairline}`, borderRadius: 0,
                }}>
                  <button
                    type="button"
                    onClick={() => onApproveAndMerge ? runApproveRow(j) : onOpenJob(j)}
                    disabled={Boolean(isWorking)}
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
                        {j.region} · {(j.content_type || '').toUpperCase()} · {j.word_count ? `${j.word_count} words` : 'draft complete'}
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
                    </div>
                  )}
                  {/* Ship-time rhythm refusal — name the repeated opener + count
                      and direct to the AI targeted sweep (same as PR rows). */}
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
      )}
      {unGatedDrafts.length > 0 && (
        <div style={{ ...panelCard }}>
          <div style={{ ...kickerStyle, color: '#B45309', marginBottom: 8 }}>
            AWAITING SHIP GATE · {unGatedDrafts.length} DRAFT{unGatedDrafts.length === 1 ? '' : 'S'}
          </div>
          <p style={{ margin: '0 0 10px', fontFamily: C.serif, fontSize: 12.5, color: E.inkMuted, fontStyle: 'italic' }}>
            A draft is only approve-able after a re-audit confirms the ship gate (quality + depth + zero blockers). Open it in the editor to run the gate.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unGatedDrafts.map((j) => (
              <div key={j.id} data-testid={`studio-ungated-draft-row-${j.id}`} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', background: E.ivory,
                border: `1px solid ${E.hairline}`, borderRadius: 0,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: C.serif, fontSize: 14, color: E.ink, fontWeight: 600 }}>{j.title}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 10.5, color: E.inkMuted }}>
                    {j.region} · {(j.content_type || '').toUpperCase()} · {j.word_count ? `${j.word_count} words` : 'draft complete'}
                  </div>
                </div>
                <span style={{
                  padding: '3px 9px', fontFamily: C.mono, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  background: gateBlocked(j) ? '#FEE2E2' : '#FEF3C7',
                  color: gateBlocked(j) ? '#991B1B' : '#92400E',
                }}>
                  {gateBlocked(j) ? '✕ GATE BLOCKED' : '⏳ AWAITING AUDIT'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenJob(j)}
                  style={{ padding: '7px 14px', background: E.gold, color: E.ivory, border: 'none', borderRadius: E.radiusXs, cursor: 'pointer', fontFamily: C.serif, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  Open in editor →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {inProgress.length > 0 && (
        <div style={{ fontFamily: C.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
          {inProgress.length} job{inProgress.length === 1 ? '' : 's'} still generating. They will appear here as ready to approve once complete.
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
  merges, jobs, onOpenJob, setActionNotice, onRevertJob,
}: {
  merges: any[]
  jobs: ContentJob[]
  onOpenJob: (j: ContentJob) => void
  setActionNotice?: (msg: string) => void
  /** Rollback a merged/live change to its pre-ship state. */
  onRevertJob?: (j: ContentJob) => Promise<{ ok: boolean; message?: string }>
}) {
  // Per-stamp revert state so the button reflects in-flight rollbacks.
  const [reverting, setReverting] = React.useState<Record<string, boolean>>({})
  const [revertNotice, setRevertNotice] = React.useState<Record<string, string | null>>({})
  const runRevert = React.useCallback(async (j: ContentJob) => {
    if (!onRevertJob || !j.canonical_url) return
    if (typeof window !== 'undefined' && !window.confirm(`Rollback "${j.title}"?\n\nThis reverts ${j.canonical_url} to its pre-ship state (or deletes it if it was a net-new page).`)) return
    setReverting((prev) => ({ ...prev, [j.id]: true }))
    setRevertNotice((prev) => ({ ...prev, [j.id]: null }))
    try {
      const result = await onRevertJob(j)
      setRevertNotice((prev) => ({ ...prev, [j.id]: result.ok ? (result.message || 'Rollback merged') : `Failed: ${result.message || 'unknown'}` }))
    } catch (err) {
      setRevertNotice((prev) => ({ ...prev, [j.id]: `Failed: ${err instanceof Error ? err.message : 'unknown'}` }))
    } finally {
      setReverting((prev) => ({ ...prev, [j.id]: false }))
    }
  }, [onRevertJob])

  // NEW: per-stamp verify state + batched position-trend lookup.
  type VerifyState =
    | { stage: 'idle' }
    | { stage: 'verifying'; startedAt: number }
    | { stage: 'ok'; message: string; httpStatus: number | null; verifiedAt: string }
    | { stage: 'broken'; message: string; httpStatus: number | null; verifiedAt: string }

  // A stamp is earned ONLY by a genuinely shipped page. `canonical_url` alone
  // is NOT a ship signal — the pipeline writes it onto every job at creation
  // (status 'drafting'), so filtering on it flooded the ledger with drafts that
  // were never merged and would 404 on VERIFY. `status === 'merged'` (or a
  // set `merged_at`) is the authoritative "actually on main" marker.
  const merged = jobs.filter(isPublishedJob)
  // Dedupe by canonical URL — repeated deploys of the same article.
  const seen = new Set<string>()
  const stamps = merged.filter((j) => {
    const key = j.canonical_url || j.slug || j.id
    if (seen.has(key)) return false
    seen.add(key); return true
  })

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

  // Key the memo on the SERIALIZED URL set, not the array reference. `stamps`
  // is a fresh array every render (the parent polls jobs every 6s + realtime
  // subscription), so `[stamps]` made this memo recompute every render, which
  // cascaded into new loadTrends/loadDivergence callbacks and re-ran their
  // effects on every render — the ledger kept re-fetching and flickering. A
  // string key stays referentially stable while the actual URL list is
  // unchanged, so the trend/divergence fetches only fire when it truly changes.
  const canonicalUrlsKey = stamps.map((s) => s.canonical_url || '').join('\u0001')
  const canonicalUrls = React.useMemo(
    () => stamps.map((s) => s.canonical_url).filter((u): u is string => !!u),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalUrlsKey],
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
  // Master Engine summary for the KPI row — persisted composite scores on the
  // merged stamps (computed inline: 89 rows is trivial).
  const engineScored = stamps.filter((s) => s.master_engine_score != null)
  const engineAvg = engineScored.length
    ? Math.round(engineScored.reduce((a, s) => a + (s.master_engine_score ?? 0), 0) / engineScored.length)
    : null
  const gradeMix = Array.from(new Set(engineScored.map((s) => s.master_engine_grade).filter(Boolean) as string[]))
    .sort().join('/')
  return (
    <div data-testid="studio-publish-ledger" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...panelCard }}>
        <div style={kickerStyle}>
          STAGE IV · APPROVE & TRACK
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
            {
              label: 'Avg Engine Score',
              value: engineAvg != null ? `${engineAvg}/100` : '—',
              sub: engineScored.length > 0 ? `${engineScored.length} scored · grades ${gradeMix || '—'}` : 'run backfill to score merged jobs',
              icon: '🧠',
              accuracy: engineAvg,
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    {onRevertJob && (
                      <button
                        type="button"
                        onClick={() => runRevert(j)}
                        disabled={reverting[j.id] || !canonical}
                        data-testid={`studio-revert-cta-${j.id}`}
                        title="Rollback this live change to its pre-ship state (or delete if it was net-new)"
                        style={{
                          fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                          padding: '4px 10px', borderRadius: 0,
                          border: `1px solid #DC2626`, background: 'transparent', color: '#DC2626',
                          cursor: reverting[j.id] || !canonical ? 'progress' : 'pointer',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {reverting[j.id] ? '⏳ REVERTING…' : '↩ ROLLBACK'}
                      </button>
                    )}
                  </div>
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
                {revertNotice[j.id] && (
                  <div style={{
                    fontFamily: C.mono, fontSize: 10.5,
                    color: revertNotice[j.id]!.startsWith('Failed') ? '#a32525' : '#0f7a3a',
                    paddingTop: 4, borderTop: `1px dashed ${E.hairline}`,
                  }}>
                    {revertNotice[j.id]}
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
                    {j.master_engine_score != null && (
                      <span
                        title={`Master Engine: ${j.master_engine_score}/100 · grade ${j.master_engine_grade} · ${j.master_engine_fetched_at ? `scored ${timeAgo(j.master_engine_fetched_at)}` : ''}`}
                        style={{
                          color: (j.master_engine_grade === 'A' || j.master_engine_grade === 'B') ? E.mossGreen
                            : j.master_engine_grade === 'C' ? '#C47F17'
                            : (j.master_engine_grade === 'D' || j.master_engine_grade === 'F') ? E.red
                            : E.inkMuted,
                          fontWeight: 700,
                        }}
                      >
                        🧠 {j.master_engine_score} · {j.master_engine_grade}
                      </span>
                    )}
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
                {gscStatus.connected && gscStatus.error
                  ? `◐ TOKEN FAILURE — ${String(gscStatus.error)}${gscStatus.mode === 'oauth' ? ' (OAUTH)' : gscStatus.mode === 'service_account' ? ' (SERVICE_ACCOUNT)' : ''}`
                  : gscStatus.connected
                    ? '◐ Connected but not live — these scores are snapshot-based'
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
            <label style={labelStyle}>Drafting model / provider</label>
            <StudioModelHostSelect
              lane="draft"
              pin={aiProvider}
              onPinChange={setAiProvider}
              selectStyle={inputStyle}
              modelAriaLabel="Drafting AI model"
              hostAriaLabel="Drafting AI provider"
            />
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
  /** Owner-model handoff: after a brief resolves, the SAME pin becomes the
   *  drafting + review model (the brief choice is the contract owner). */
  onOwnerModelChange?: (pin: string) => void
  title: string; setTitle: (v: string) => void
  topic: string; setTopic: (v: string) => void
  audience: string; setAudience: (v: string) => void
  keywords: string; setKeywords: (v: string) => void
  suggestions: any[]; gscStatus: any
  brief: AISuggestion | null; onClearBrief: () => void
  briefInterlinks: StudioInterlink[]
  onBriefInterlinksChange?: (links: StudioInterlink[]) => void
  interlinkInventory?: { scanned: number; eligible: number; liveVerified: number } | null
  autoInterlinkBusy: boolean; onAutoInterlink: () => void
  interlinkStage: string; setInterlinkStage: (v: string) => void
  selectedBrief?: AISuggestion | null
  setActionNotice?: (msg: string) => void
  /** Discover-stage intelligence fed into the full-brief generator. */
  radarMeta?: Record<string, unknown> | null
  completedWorkSlugs?: Array<{ slug: string; topic: string }>
  competingUrls?: Array<{ url: string; title?: string; primaryKeyword?: string | null }>
}>(function BriefAssemblyPanel(
  {
    generating, onGenerate,
    contentType, setContentType, onContentTypeTouched,
    region, setRegion,
    tone, setTone,
    aiProvider, setAiProvider,
    onOwnerModelChange,
    title, setTitle,
    topic, setTopic,
    audience, setAudience,
    keywords, setKeywords,
    suggestions, gscStatus,
    brief, onClearBrief, briefInterlinks,
    onBriefInterlinksChange,
    autoInterlinkBusy, onAutoInterlink, interlinkInventory,
    interlinkStage, setInterlinkStage,
    selectedBrief,
    setActionNotice,
    radarMeta,
    completedWorkSlugs,
    competingUrls = [],
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
    if (selectedBrief?.aeoRemediation?.actions?.length) return actionHeadings(selectedBrief.aeoRemediation.actions)
    if (selectedBrief?.keywords?.length) {
      const stems = selectedBrief.keywords.filter(k => k.length > 4).slice(0, 5)
        .map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())
      return stems.length >= 3 ? stems : ['Eligibility Requirements', 'Application Process', 'Required Documents', 'Timeline & Fees', 'Common Questions']
    }
    return ['Overview', 'Eligibility Requirements', 'Application Process', 'Required Documents', 'Timeline & Processing', 'Frequently Asked Questions']
  })
  const [sources, setSources] = React.useState<string[]>(() => collectDiscoverCitationUrls({
    region,
    topic: topic || title,
    keywords: [
      selectedBrief?.primaryKeyword,
      ...String(keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
    ].filter(Boolean) as string[],
    signals: selectedBrief?.signals,
    extraUrls: [
      selectedBrief?.aeoRemediation?.url || '',
      selectedBrief?.cluster?.targetUrl || '',
    ].filter(Boolean),
  }))
  React.useEffect(() => {
    const aeo = selectedBrief?.aeoRemediation
    if (!aeo?.actions?.length) return
    const heads = actionHeadings(aeo.actions)
    if (heads.length) setH2s(heads)
    if (aeo.url) {
      setSources((prev) => (prev.includes(aeo.url!) ? prev : [aeo.url!, ...prev].slice(0, 8)))
    }
  }, [selectedBrief])
  const [minWords, setMinWords] = React.useState<number>(() => clampBriefWordBudget(contentType).minWords)
  const [maxWords, setMaxWords] = React.useState<number>(() => clampBriefWordBudget(contentType).maxWords)
  React.useEffect(() => {
    const w = clampBriefWordBudget(contentType)
    setMinWords(w.minWords)
    setMaxWords(w.maxWords)
  }, [contentType])
  const [targetSlug, setTargetSlug] = React.useState('')
  const [showPromptPreview, setShowPromptPreview] = React.useState(false)
  const [newSource, setNewSource] = React.useState('')
  const [newH2, setNewH2] = React.useState('')

  // SEO Intelligence (first-party intel) writer contract, produced here in the
  // briefing stage by EditorSeoIntelPanel's "Generate SEO Brief". Carried into
  // the Generate handoff as one structured contract so Drafting never has to
  // re-assemble it.
  const [seoIntelBrief, setSeoIntelBrief] = React.useState<{ brief: unknown; writerContract: string } | null>(null)
  const seoBriefSeed = String(selectedBrief?.primaryKeyword || topic || title || '').trim()
  const seoIntelLocked = Boolean(String(seoIntelBrief?.writerContract || '').trim())
  const handleSeoBriefReady = React.useCallback((payload: { brief: unknown; writerContract: string }) => {
    setSeoIntelBrief(payload)
    const cluster = (payload.brief as { targetCluster?: unknown } | null)?.targetCluster
    if (!Array.isArray(cluster) || cluster.length === 0) return
    const extra = cluster.map((k) => String(k).trim()).filter(Boolean)
    if (!extra.length) return
    const existing = String(keywords || '').split(',').map((k) => k.trim()).filter(Boolean)
    const seen = new Set(existing.map((k) => k.toLowerCase()))
    const merged = [...existing]
    for (const term of extra) {
      if (seen.has(term.toLowerCase())) continue
      seen.add(term.toLowerCase())
      merged.push(term)
    }
    setKeywords(merged.join(', '))
  }, [keywords, setKeywords])

  // Keyword placement plan: which keyword → which H2 section
  const [kwH2Map, setKwH2Map] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    setKwH2Map((prev) => autoMapKeywordsToH2s(kwList, h2s, prev))
  }, [kwList, h2s])

  // AI-powered full-brief generation — the selected Brief model ingests ALL
  // Discover intel (radar gaps, GSC demand, keyword research, LLM visibility,
  // backlink gaps, completed work, verified interlinks) and produces a
  // maximally prescriptive brief so the drafting AI has zero room to
  // hallucinate. "Generate Full Brief" is the single integrated action.
  const [briefGenerating, setBriefGenerating] = React.useState(false)
  const [briefIntel, setBriefIntel] = React.useState<{
    reasoning?: string; metaDescription?: string; sectionPlan?: Array<{ heading: string; intent: string; format: string; targetWords: number; keywords: string[] }>
    masterEngine?: { composite?: number | null; grade?: string | null; recommendationCount?: number; coveragePct?: number | null; computedSignals?: number | null; totalSignals?: number | null; phase?: string | null }
  } | null>(null)
  // Strict per-section word budgets from the brief — carried into drafting so
  // the one-run contract is hardlined (never a three-copy echo).
  const [sectionBudgets, setSectionBudgets] = React.useState<Array<{ heading: string; minWords: number; maxWords: number }> | null>(null)
  // Brief engine is MANUAL: Entrim Qwen / Entrim DeepSeek / Grok. Nothing
  // runs until Generate Full Brief is clicked with the selected pin.
  const [briefModel, setBriefModel] = React.useState(DEFAULT_BRIEF_PIN)
  const briefParsed = parseStudioPin(briefModel)
  const briefModelName = `${briefParsed.model.label} · ${briefParsed.host.label}`
  const handleGenerateBrief = async () => {
    if (!topic.trim()) { setActionNotice?.('Enter a topic first'); return }
    setBriefGenerating(true)
    const briefAbort = new AbortController()
    const briefTimer = window.setTimeout(() => briefAbort.abort(), 660_000)
    try {
      const r = (radarMeta && typeof radarMeta === 'object') ? radarMeta as Record<string, unknown> : {}
      const res = await fetch('/api/content-studio/suggest-brief', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: briefAbort.signal,
        body: JSON.stringify({
          topic, region, contentType, primaryKeyword: selectedBrief?.primaryKeyword || topic, audience,
          // Brief model selected above (Entrim Qwen / Claude Opus 5 / Grok /
          // DeepSeek V4 Flash …). We pass the explicit choice; the brief
          // endpoint's policy coerces unknown values to the Entrim Qwen
          // default. The same pin is carried into the Draft stage below.
          aiProvider: briefModel,
          radarGaps: Array.isArray(r.gapOpportunities) ? r.gapOpportunities : [],
          llmVisibility: r.llmVisibility || null,
          backlinkGaps: Array.isArray(r.backlinkGaps) ? r.backlinkGaps : [],
          completedWork: completedWorkSlugs || [],
          interlinks: briefInterlinks || [],
          opportunity: selectedBrief ? {
            title: selectedBrief.title,
            primaryKeyword: selectedBrief.primaryKeyword,
            valueScore: selectedBrief.valueScore ?? selectedBrief.opportunityScore,
            priorityTier: selectedBrief.priorityTier,
            play: selectedBrief.play,
            intent: selectedBrief.intent,
            signals: selectedBrief.signals,
            cluster: selectedBrief.cluster,
          } : null,
          discoverSources: sources,
          competingUrls: competingUrls,
        }),
      })
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) throw new Error(String(data.error || 'Unknown error'))
      // The model chosen in the Brief stage is the contract OWNER:
      // carry it into the Draft AND Review stages so the same selected
      // backend writes the article and later re-audits/fixes (previously the
      // brief choice was dropped after the brief and drafting/review ran on
      // their separate pins).
      setAiProvider(briefModel)
      onOwnerModelChange?.(briefModel)
      // Region auto-select: when the topic named a different country than the
      // picker (e.g. "Australia student visa fee" while picker said US), the
      // server re-keyed the whole brief to the detected region. Sync the UI
      // so downstream drafting + audits use the SAME region.
      let regionNote = ''
      if (data.regionAutoSelected && typeof data.region === 'string') {
        setRegion(data.region as Region)
        regionNote = ` · Region auto-selected: ${data.region}`
      }
      const dropped = Array.isArray(data.droppedOffRegion) ? (data.droppedOffRegion as string[]) : []
      if (dropped.length) {
        regionNote += ` · Dropped ${dropped.length} off-region item(s): ${dropped.slice(0, 3).join(', ')}${dropped.length > 3 ? '…' : ''}`
      }
      if (typeof data.suggestedH1 === 'string' && data.suggestedH1.trim()) setTitle(data.suggestedH1)
      if (Array.isArray(data.h2Outline) && data.h2Outline.length) setH2s(data.h2Outline.map(String))
      if (Array.isArray(data.shortTail) && Array.isArray(data.longTail)) {
        const all = [...(data.shortTail as string[]).slice(0, 5), ...(data.longTail as string[]).slice(0, 4)]
        setKeywords(all.join(', '))
      }
      if (Array.isArray(data.sources) && data.sources.length) {
        const incoming = (data.sources as unknown[]).map(String)
        setSources((prev) => mergeCitationUrlLists(prev, incoming, 12))
      }
      if (typeof data.targetSlug === 'string' && data.targetSlug.trim()) setTargetSlug(data.targetSlug)
      if (typeof data.recommendedTone === 'string') setTone(data.recommendedTone as Tone)
      if (typeof data.recommendedAudience === 'string') setAudience(data.recommendedAudience)
      const clamped = clampBriefWordBudget(
        contentType,
        typeof data.minWords === 'number' ? data.minWords : undefined,
        typeof data.maxWords === 'number' ? data.maxWords : undefined,
      )
      setMinWords(clamped.minWords)
      setMaxWords(clamped.maxWords)
      if (data.kwH2Map && typeof data.kwH2Map === 'object') setKwH2Map(data.kwH2Map as Record<string, string>)
      if (Array.isArray(data.sectionBudgets) && data.sectionBudgets.length) setSectionBudgets(data.sectionBudgets as Array<{ heading: string; minWords: number; maxWords: number }>)
      setBriefIntel({
        reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
        metaDescription: typeof data.metaDescription === 'string' ? data.metaDescription : '',
        sectionPlan: Array.isArray(data.sectionPlan) ? data.sectionPlan as Array<{ heading: string; intent: string; format: string; targetWords: number; keywords: string[] }> : [],
        masterEngine: data.masterEngine && typeof data.masterEngine === 'object' ? data.masterEngine as { composite?: number | null; grade?: string | null; recommendationCount?: number; coveragePct?: number | null; computedSignals?: number | null; totalSignals?: number | null; phase?: string | null } : undefined,
      })
      // Merge the brief's interlinkTargets into briefInterlinks (deduped) so
      // the drafting call receives the brief's guaranteed ≥2 verified estate
      // links — not just whatever the registry happened to match earlier.
      const briefTargets = (data as Record<string, unknown>).interlinkTargets
      if (Array.isArray(briefTargets) && briefTargets.length > 0) {
        // Model-selected placements take precedence while the estate ranker's
        // score/reason/live metadata survives for the UI and drafting prompt.
        onBriefInterlinksChange?.(mergeInterlinkLists(briefTargets as Array<Record<string, unknown>>, briefInterlinks).slice(0, 8))
      }
      const engine = data.masterEngine as { ok?: boolean; composite?: number | null; grade?: string | null; recommendationCount?: number } | undefined
      const engineBit = engine?.ok
        ? ` · engine ${engine.grade || ''} ${engine.composite != null ? engine.composite + '/100' : ''} · ${engine.recommendationCount ?? 0} actions`
        : ''
      setActionNotice?.(`🧠 Full brief ready${regionNote}${engineBit}: ${String(data.reasoning || '').slice(0, 120)}`)
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      setActionNotice?.(
        aborted
          ? 'Brief generation timed out after 3 minutes. Grok 4.6 was still thinking — click Generate Full Brief again.'
          : `Brief generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      window.clearTimeout(briefTimer)
      setBriefGenerating(false)
    }
  }

  const addSource = () => {
    const raw = newSource.trim()
    if (!raw) return
    const url = raw.match(/https?:\/\/[^\s)]+/)?.[0] || raw
    if (!/^https?:\/\//i.test(url) || !isCitableSource(url, {
      region,
      topic: topic || title,
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
    })) {
      setActionNotice?.('Citable sources: government/edu/intergov pages, issuing bodies, reputable publications, and on-topic institutional pages (.org/.edu). Random blogs, Wikipedia, social media, and low-authority sites are rejected. Every URL is live-checked before ship.')
      return
    }
    setSources((p) => [...p, raw])
    setNewSource('')
  }
  const loadOfficialSources = () => {
    const seed = sourcesForBrief({
      region,
      topic: topic || title,
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
    })
    const lines = seed.slice(0, 6).map((s) => `${s.title} — ${s.url}`)
    setSources((p) => {
      const seen = new Set(p.map((x) => x.toLowerCase()))
      const next = [...p]
      for (const line of lines) {
        if (!seen.has(line.toLowerCase())) next.push(line)
      }
      return next.slice(0, 8)
    })
  }
  const removeSource = (i: number) => setSources(p => p.filter((_, idx) => idx !== i))
  const addH2 = () => { if (newH2.trim()) { setH2s(p => [...p, newH2.trim()]); setNewH2('') } }
  const removeH2 = (i: number) => setH2s(p => p.filter((_, idx) => idx !== i))
  const moveH2 = (i: number, dir: number) => {
    setH2s(p => { const n = [...p]; const t = i + dir; if (t < 0 || t >= n.length) return p; [n[i], n[t]] = [n[t], n[i]]; return n })
  }
  const pageTarget = targetWordsForType(contentType)
  const liveBudgets = React.useMemo(
    () => syncSectionBudgetsToOutline(h2s, sectionBudgets, { pageMin: minWords, pageMax: maxWords, pageTarget }),
    [h2s, sectionBudgets, minWords, maxWords, pageTarget],
  )
  React.useEffect(() => {
    if (!h2s.length) return
    const same =
      sectionBudgets &&
      sectionBudgets.length === liveBudgets.length &&
      sectionBudgets.every((b, i) => b.heading === liveBudgets[i]?.heading && b.minWords === liveBudgets[i]?.minWords && b.maxWords === liveBudgets[i]?.maxWords)
    if (!same) setSectionBudgets(liveBudgets)
  }, [h2s, minWords, maxWords, pageTarget]) // eslint-disable-line react-hooks/exhaustive-deps
  const setBudgetField = (index: number, field: 'minWords' | 'maxWords', raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0))
    const next = liveBudgets.map((b, i) => {
      if (i !== index) return b
      const lo = field === 'minWords' ? n : b.minWords
      const hi = field === 'maxWords' ? n : b.maxWords
      return { ...b, minWords: Math.min(lo, hi), maxWords: Math.max(lo, hi) }
    })
    setSectionBudgets(ensureSectionBudgets(next, { h2Outline: h2s, pageMin: minWords, pageMax: maxWords, pageTarget }))
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
    else lines.push('- (empty — drafting will use only live-verified official authorities for this topic; no invented URLs)')
    lines.push('')
    lines.push(`### WORD COUNT: ${minWords}–${maxWords} words`)
    // CANONICAL SECTION BUDGETS — the same allocator the pipeline enforces
    // (Σ section minimums ≥ page floor, Σ maximums ≤ page ceiling). Rendering
    // them in the contract closes the loophole where the drafter saw a global
    // window but per-section guesswork, inviting under-runs and restarts.
    const canonicalBudgets = liveBudgets
    if (canonicalBudgets.length) {
      lines.push('')
      lines.push('### SECTION WORD BUDGETS (hard ranges — the sums close the global window)')
      canonicalBudgets.forEach((b) => lines.push(`- ## ${b.heading}: ${b.minWords}–${b.maxWords} body words`))
      const minSum = canonicalBudgets.reduce((a, b) => a + b.minWords, 0)
      const maxSum = canonicalBudgets.reduce((a, b) => a + b.maxWords, 0)
      lines.push(`- Contract invariant: meeting every section minimum reaches ${minSum} words (≥ ${minWords} floor); section maxima sum to ${maxSum} (≤ ${maxWords} cap). Honour the ranges and the article lands inside the window in ONE sweep — never append a second copy.`)
    }
    lines.push('')
    lines.push('### AI PROVIDER')
    lines.push(`- Selected: ${aiProvider || 'auto (cascade)'}`)
    if (seoIntelBrief?.writerContract) {
      lines.push('')
      lines.push('### SEO INTELLIGENCE WRITER CONTRACT (first-party intel)')
      lines.push(seoIntelBrief.writerContract)
    }
    return lines.join('\n')
  }, [title, topic, targetSlug, region, contentType, tone, audience, h2s, kwH2Map, shortKw, longKw, sources, minWords, maxWords, aiProvider, liveBudgets, seoIntelBrief])

  const handleSubmitBrief = () => {
    onGenerate({
      contentType, region, tone, aiProvider: aiProvider || undefined,
      title: title || topic, topic, audience,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      interlinks: briefInterlinks,
      sectionBudgets: liveBudgets,
      h2Outline: h2s,
      sources,
      minWords, maxWords,
      targetSlug: targetSlug || undefined,
      kwH2Map: Object.keys(kwH2Map).length ? kwH2Map : undefined,
      // Single writer contract from SEO Intelligence Briefing — the intel brief
      // the drafting model receives before generation (no re-analysis needed).
      seoBriefContract: seoIntelBrief?.writerContract || undefined,
      seoIntelBrief: seoIntelBrief ? { brief: seoIntelBrief.brief } : undefined,
    })
  }

  // Expose submit() so the pinned-topic CTA in the parent (which lives outside
  // this panel) can advance the full brief — including the H2 outline, sources,
  // min/max words, and keyword→H2 map — straight into generation.
  React.useImperativeHandle(ref, () => ({ submit: handleSubmitBrief }))

  const fieldSection: React.CSSProperties = { marginBottom: 18 }
  const fieldGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }
  const inputBase: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${E.border}`, borderRadius: E.radiusXs, background: E.ivory, color: E.ink, fontSize: 12, fontFamily: C.serif, boxSizing: 'border-box' }
  const labelBase: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 9, fontFamily: C.mono, letterSpacing: '0.14em', color: E.inkMuted, textTransform: 'uppercase', fontWeight: 700 }
  const chip = (ok: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: E.radiusFull, fontSize: 9, fontFamily: C.mono, fontWeight: 700, background: ok ? E.mossSoft : '#fff0f0', color: ok ? E.mossGreen : '#a32525' })
  const mappedKeywordCount = kwList.filter((kw) => Boolean(kwH2Map[kw])).length
  const briefChecks = [
    { label: 'Identity', ok: Boolean(title.trim() && topic.trim() && targetSlug.trim()), detail: title.trim() ? 'H1, query and destination' : 'Needs a reader-ready H1' },
    { label: 'Outline', ok: h2s.length >= 6, detail: `${h2s.length} planned sections` },
    { label: 'Keywords', ok: shortOk && longOk, detail: `${shortKw.length} short · ${longKw.length} long-tail` },
    { label: 'Placement', ok: kwList.length >= 9 && mappedKeywordCount === kwList.length, detail: `${mappedKeywordCount}/${kwList.length || 0} assigned to H2s` },
    { label: 'SEO Intel', ok: seoIntelLocked, detail: seoIntelLocked ? 'Writer contract locked' : 'Generate SEO Brief to lock' },
    { label: 'Evidence', ok: sources.length >= 3, detail: `${sources.length} verified sources` },
    { label: 'Interlinks', ok: (briefInterlinks?.length || 0) >= 2, detail: `${briefInterlinks?.length || 0} estate targets` },
  ]
  const briefReadiness = Math.round((briefChecks.filter((check) => check.ok).length / briefChecks.length) * 100)

  return (
    <div data-testid="studio-brief-assembly" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ position: 'relative', padding: '16px 18px', background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow }}>
        <GoldRule offset={18} />
        <div style={{ ...kickerStyle }}>STAGE II · PLAN</div>
        <h3 style={{ margin: '6px 0 4px', fontFamily: C.serif, fontSize: 20, color: E.ink }}>Brief Assembly</h3>
        <p style={{ margin: 0, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', fontSize: 12 }}>
          Every field below becomes part of the AI\'s strict template. Nothing is guessed — tweak before you generate.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, .72fr) minmax(0, 3fr)', border: `1px solid ${E.hairline}`, background: E.paper }}>
        <div style={{ padding: 16, background: briefReadiness === 100 ? E.inkBlack : E.cream, borderRight: `1px solid ${E.hairline}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: briefReadiness === 100 ? 'rgba(255,255,255,.58)' : E.inkMuted }}>Brief readiness</div>
          <div style={{ marginTop: 5, fontFamily: C.serif, fontSize: 34, fontWeight: 800, color: briefReadiness === 100 ? '#86EFAC' : E.goldDeep }}>{briefReadiness}%</div>
          <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.4, color: briefReadiness === 100 ? 'rgba(255,255,255,.68)' : E.inkMuted }}>{briefGenerating ? `${briefModelName} is resolving the complete contract…` : briefReadiness === 100 ? 'Canonical handoff is complete.' : 'Generation remains locked until the handoff is complete.'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {briefChecks.map((check) => (
            <div key={check.label} style={{ padding: '12px 14px', borderRight: `1px solid ${E.hairline}`, borderBottom: `1px solid ${E.hairline}` }}>
              <div style={{ fontFamily: C.mono, fontSize: 8.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: check.ok ? E.green : E.red }}>{check.ok ? '✓' : '!'} {check.label}</div>
              <div style={{ marginTop: 4, fontFamily: C.serif, fontSize: 11, color: E.inkMuted }}>{check.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div data-testid="studio-brief-engine" style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.inkBlack}`, padding: 14 }}>
        <label style={labelBase}>Brief engine (manual)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StudioModelHostSelect
            lane="brief"
            pin={briefModel}
            onPinChange={setBriefModel}
            disabled={briefGenerating}
            modelAriaLabel="Brief AI model"
            hostAriaLabel="Brief AI provider"
            selectStyle={{ padding: '8px 10px', borderRadius: 0, border: `1px solid ${E.hairline}`, background: E.ivory, color: E.ink, fontSize: 12, fontWeight: 700, fontFamily: E.mono, minWidth: 220 }}
          />
          <button
            type="button"
            onClick={handleGenerateBrief}
            disabled={briefGenerating || !topic.trim() || generating}
            style={{
              padding: '8px 14px', borderRadius: 0, border: `1px solid ${E.inkBlack}`,
              background: briefGenerating ? E.inkBlack : E.gold,
              color: briefGenerating ? E.ivory : E.inkBlack,
              cursor: briefGenerating || !topic.trim() ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 800, fontFamily: E.mono,
              opacity: briefGenerating ? 0.85 : 1,
              whiteSpace: 'nowrap',
            }}
            title={!topic.trim() ? 'Enter a topic first' : `Run ${briefModelName} only when you click. This pin owns the article through ship.`}
          >
            {briefGenerating ? `🧠 ${briefModelName} building contract…` : briefIntel ? '🧠 Rebuild complete brief' : '🧠 Generate Full Brief'}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: E.inkMuted, fontFamily: C.serif }}>
          Choose Qwen, DeepSeek, or Grok, then click generate. Discover does not auto-run this engine.
        </div>
      </div>

      {briefIntel?.reasoning && (
        <div style={{ padding: '13px 16px', background: E.inkBlack, color: E.ivory, borderLeft: `4px solid ${E.gold}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '.13em', textTransform: 'uppercase', color: '#F8E7B0' }}>
            Engine-to-brief strategy · {briefIntel.masterEngine?.grade || 'reviewed'} {briefIntel.masterEngine?.composite != null ? `· ${briefIntel.masterEngine.composite}/100` : ''}
            {briefIntel.masterEngine?.phase === 'plan' && briefIntel.masterEngine.composite != null && (
              <span style={{ color: 'rgba(248,231,176,.55)' }}>
                {' '}· plan snapshot {briefIntel.masterEngine.computedSignals != null && briefIntel.masterEngine.totalSignals != null
                  ? `(${briefIntel.masterEngine.computedSignals}/${briefIntel.masterEngine.totalSignals} signals — page not yet scored)`
                  : '(page not yet scored)'}
              </span>
            )}
          </div>
          <div style={{ marginTop: 6, fontFamily: C.serif, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,.78)' }}>{briefIntel.reasoning}</div>
          <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 9, color: 'rgba(255,255,255,.45)' }}>
            This score reads the market/estate snapshot only (demand, coverage, competition, trust). On-page quality joins the composite once a draft exists — 100/100 requires both a demand-rich query and a ship-ready article, so the brief itself cannot force 100.
          </div>
          {briefIntel.metaDescription && <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 9.5, color: 'rgba(255,255,255,.58)' }}>SERP copy: {briefIntel.metaDescription}</div>}
        </div>
      )}

      {selectedBrief?.aeoRemediation && (
        <div data-testid="aeo-brief-checklist" style={{ padding: 12, border: `1px solid ${E.gold}`, background: E.cream }}>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.14em', color: E.goldDeep, fontWeight: 700, textTransform: 'uppercase' }}>
            LLM audit retrofit · {selectedBrief.aeoRemediation.mode === 'expand' ? 'existing page' : 'new canonical'}
          </div>
          <div style={{ marginTop: 4, fontFamily: C.serif, fontSize: 13, color: E.inkBlack, fontWeight: 700 }}>{selectedBrief.aeoRemediation.query}</div>
          {selectedBrief.aeoRemediation.url && (
            <a href={selectedBrief.aeoRemediation.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4, fontFamily: C.mono, fontSize: 10, color: E.goldDeep }}>
              {selectedBrief.aeoRemediation.url}
            </a>
          )}
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.45, color: E.ink }}>
            {selectedBrief.aeoRemediation.actions.slice(0, 4).map((act) => (
              <li key={act.action}>{act.action}</li>
            ))}
          </ol>
        </div>
      )}

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
            <label style={labelBase}>Drafting model / provider</label>
            <StudioModelHostSelect
              lane="draft"
              pin={aiProvider}
              onPinChange={setAiProvider}
              selectStyle={inputBase}
              modelAriaLabel="Drafting AI model"
              hostAriaLabel="Drafting AI provider"
            />
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
        <label style={{ ...labelBase, marginBottom: 8 }}>H2 Section Outline ({h2s.length} sections) · absolute word quotas</label>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkMuted, marginBottom: 8 }}>
          Each section MUST land inside its min–max. Drafter treats these as hard gates, not targets.
          {liveBudgets.length > 0 && (
            <> · Σ min {liveBudgets.reduce((a, b) => a + b.minWords, 0)} (≥ {minWords}) · Σ max {liveBudgets.reduce((a, b) => a + b.maxWords, 0)} (≤ {maxWords})</>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
          {h2s.map((h, i) => {
            const budget = liveBudgets[i]
            return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted, minWidth: 20 }}>{i + 1}.</span>
              <input
                value={h} onChange={e => setH2s(p => p.map((v, idx) => idx === i ? e.target.value : v))}
                style={{ ...inputBase, flex: 1, background: E.ivory, fontSize: 13 }}
                placeholder={`Section ${i + 1}`}
              />
              <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, whiteSpace: 'nowrap' }}>words</span>
              <input
                type="number"
                min={0}
                value={budget?.minWords ?? ''}
                onChange={(e) => setBudgetField(i, 'minWords', e.target.value)}
                title="Section minimum (inclusive)"
                style={{ ...inputBase, width: 72, padding: '6px 6px', fontFamily: C.mono, fontSize: 11, textAlign: 'right' }}
              />
              <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkMuted }}>–</span>
              <input
                type="number"
                min={0}
                value={budget?.maxWords ?? ''}
                onChange={(e) => setBudgetField(i, 'maxWords', e.target.value)}
                title="Section maximum (inclusive)"
                style={{ ...inputBase, width: 72, padding: '6px 6px', fontFamily: C.mono, fontSize: 11, textAlign: 'right' }}
              />
              <button onClick={() => moveH2(i, -1)} disabled={i === 0} style={{ ...btnGhost, padding: '3px 6px', fontSize: 10, opacity: i === 0 ? 0.3 : 1 }} title="Move up">↑</button>
              <button onClick={() => moveH2(i, 1)} disabled={i === h2s.length - 1} style={{ ...btnGhost, padding: '3px 6px', fontSize: 10, opacity: i === h2s.length - 1 ? 0.3 : 1 }} title="Move down">↓</button>
              <button onClick={() => removeH2(i)} style={{ ...btnGhost, padding: '3px 7px', fontSize: 10, color: '#a32525', borderColor: '#a32525' }} title="Remove">×</button>
            </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newH2} onChange={e => setNewH2(e.target.value)} placeholder="Add section…" style={{ ...inputBase, flex: 1, maxWidth: 320 }} onKeyDown={e => e.key === 'Enter' && addH2()} />
          <button onClick={addH2} style={{ ...btnGhost, padding: '6px 12px' }}>+ Add H2</button>
        </div>
        {briefIntel?.sectionPlan && briefIntel.sectionPlan.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${E.hairline}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 7 }}>
            {briefIntel.sectionPlan.map((section, index) => (
              <div key={`${section.heading}-${index}`} style={{ padding: '9px 10px', background: E.ivory, border: `1px solid ${E.hairlineSoft}` }}>
                <div style={{ fontFamily: C.mono, fontSize: 8, color: E.goldDeep, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{section.intent} · ~{section.targetWords} words</div>
                <div style={{ marginTop: 4, fontFamily: C.serif, fontSize: 11.5, color: E.ink, fontWeight: 700 }}>{section.heading}</div>
                <div style={{ marginTop: 4, fontSize: 10, color: E.inkMuted }}>{section.format}</div>
                {section.keywords?.length > 0 && <div style={{ marginTop: 5, fontFamily: C.mono, fontSize: 8.5, color: E.inkDim }}>{section.keywords.join(' · ')}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── KEYWORDS (single surface: cluster list + H2 assignment) ── */}
      <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="studio-brief-keywords" style={labelBase}>Keywords (comma-separated)</label>
          <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>Clustered from Discover · assign each term to one H2</span>
        </div>
        <textarea
          id="studio-brief-keywords"
          value={keywords} onChange={e => setKeywords(e.target.value)}
          rows={4} placeholder="e.g. uk spouse visa, financial requirement, partner visa 2026, minimum income threshold, appendix fm..."
          style={{ ...inputBase, resize: 'vertical', fontFamily: C.mono, fontSize: 11 }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={chip(shortOk)}>{shortOk ? '✓' : '!'} {shortKw.length}/5 short-tail</span>
          <span style={chip(longOk)}>{longOk ? '✓' : '!'} {longKw.length}/4 long-tail</span>
          <span style={chip(kwList.length >= 9 && mappedKeywordCount === kwList.length && kwList.length > 0)}>
            {mappedKeywordCount}/{kwList.length || 0} placed on H2s
          </span>
        </div>
        {kwList.length > 0 && (
          <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {kwList.map(kw => (
              <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: E.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw}</span>
                <select
                  aria-label={`Place ${kw} on H2`}
                  value={kwH2Map[kw] || ''}
                  onChange={e => setKwH2Map((p) => {
                    const next = { ...p }
                    const value = e.target.value
                    if (value) next[kw] = value
                    else delete next[kw]
                    return next
                  })}
                  style={{ ...inputBase, width: 160, fontSize: 10, padding: '4px 6px' }}
                >
                  <option value="">Auto</option>
                  {h2s.map(h => <option key={h} value={h}>{h.length > 20 ? h.slice(0, 17) + '…' : h}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SOURCES ── */}
      <div style={{ ...fieldSection, background: E.paper, border: `1px solid ${E.hairline}`, padding: 14 }}>
        <label style={labelBase}>Sources to Cite ({sources.length} specified)</label>
        <p style={{ margin: '0 0 8px', fontFamily: C.serif, fontSize: 12, color: E.inkMuted, lineHeight: 1.45 }}>
          Relevant and alive, biased toward formal sources — government departments, official school pages, intergovernmental and issuing bodies preferred; on-topic institutional pages (.org/.edu) allowed. Random low-authority blogs, Wikipedia, and social media are gated out. Generate Full Brief live-checks every URL; dead or off-topic citations are stripped before ship.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {sources.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: E.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {s}</span>
              <button onClick={() => removeSource(i)} style={{ ...btnGhost, padding: '2px 7px', fontSize: 10, color: '#a32525', borderColor: '#a32525' }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="https://www.uscis.gov/…" style={{ ...inputBase, flex: 1, maxWidth: 460 }} onKeyDown={e => e.key === 'Enter' && addSource()} />
          <button onClick={addSource} style={{ ...btnGhost, padding: '6px 12px' }}>+ Add</button>
          <button type="button" onClick={loadOfficialSources} style={{ ...btnGhost, padding: '6px 12px' }}>Load official sources</button>
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
            Blog: 800–1,200 &nbsp;|&nbsp; Legal: 2,200–2,500 &nbsp;|&nbsp; Regional: 1,200–2,000
          </span>
        </div>
      </div>

      {/* ── INTERNAL LINK ARCHITECTURE ── */}
      <section data-testid="brief-interlink-architecture" style={{ background: E.paper, border: `1px solid ${E.inkBlack}` }}>
        <div style={{ padding: '16px 18px', background: E.inkBlack, color: E.ivory, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#E8C875' }}>Canonical estate intelligence</div>
            <h4 style={{ margin: '4px 0 3px', fontFamily: C.serif, fontSize: 18, color: E.ivory }}>Internal Link Architecture</h4>
            <div style={{ fontFamily: C.serif, fontSize: 11, color: 'rgba(255,255,255,.62)' }}>
              Relevance-ranked from live, indexable pages — every destination has a job in the reader journey.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 800, color: '#86EFAC' }}>{interlinkInventory?.scanned ? `${interlinkInventory.scanned} PAGES SCANNED` : 'LIVE ESTATE INDEX'}</div>
              <div style={{ marginTop: 2, fontFamily: C.mono, fontSize: 8, color: 'rgba(255,255,255,.45)' }}>{interlinkInventory?.eligible ? `${interlinkInventory.eligible} indexable · ${interlinkInventory.liveVerified} verified shortlist` : 'Supabase + sitemap verification'}</div>
            </div>
            <button type="button" onClick={onAutoInterlink} disabled={autoInterlinkBusy || !topic.trim()} style={{ ...btnGhost, padding: '8px 12px', borderColor: '#E8C875', color: E.ivory, background: 'rgba(255,255,255,.04)', fontSize: 10 }}>
              {autoInterlinkBusy ? '⏳ Scanning estate…' : briefInterlinks.length ? 'Refresh architecture' : 'Build architecture'}
            </button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {briefInterlinks.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {briefInterlinks.slice(0, 8).map((link, index) => {
                let destination = link.url
                try { const parsed = new URL(link.url); destination = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}` } catch { /* keep URL */ }
                const roleLabel = link.role === 'service-handoff' ? 'Service handoff' : link.role === 'next-step' ? 'Reader next step' : 'Topical authority'
                return (
                  <article key={link.url} style={{ minHeight: 172, padding: 14, border: `1px solid ${E.hairline}`, background: E.ivory, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 6px', background: E.inkBlack, color: E.ivory, fontFamily: C.mono, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase' }}>{roleLabel}</span>
                        <span style={{ padding: '2px 6px', background: E.mossSoft, color: E.mossGreen, fontFamily: C.mono, fontSize: 8, fontWeight: 800 }}>● {link.liveStatus === 'live' ? 'LIVE' : 'VERIFIED'}</span>
                      </div>
                      <button type="button" aria-label={`Remove ${link.label}`} onClick={() => onBriefInterlinksChange?.(briefInterlinks.filter((_, itemIndex) => itemIndex !== index))} style={{ border: 0, background: 'transparent', color: E.inkDim, cursor: 'pointer', fontSize: 15 }}>×</button>
                    </div>
                    <div>
                      <div style={{ fontFamily: C.serif, fontSize: 14, lineHeight: 1.25, color: E.ink, fontWeight: 700 }}>{link.label}</div>
                      <div title={link.url} style={{ marginTop: 4, fontFamily: C.mono, fontSize: 8.5, color: E.goldDeep, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{destination}</div>
                    </div>
                    <div style={{ paddingTop: 7, borderTop: `1px solid ${E.hairline}`, display: 'grid', gap: 5 }}>
                      <div style={{ fontSize: 10, color: E.inkMuted, lineHeight: 1.35 }}><strong style={{ color: E.ink }}>Place in:</strong> {link.placement || 'Most relevant explanatory section'}</div>
                      <div style={{ fontSize: 10, color: E.inkMuted, lineHeight: 1.35 }}>{link.reason || `Supports the reader with a relevant page from ${link.site || 'the YouSafe estate'}.`}</div>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, fontSize: 8, color: E.inkDim }}>
                      <span>{link.site || 'YouSafe estate'}</span><span>{link.score != null ? `${link.score}% relevance` : 'AI selected'}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '28px 18px', textAlign: 'center', background: E.cream, border: `1px dashed ${E.gold}` }}>
              <div style={{ fontFamily: C.serif, fontSize: 15, fontWeight: 700, color: E.ink }}>No arbitrary links will be inserted.</div>
              <div style={{ marginTop: 5, fontFamily: C.serif, fontSize: 11, color: E.inkMuted }}>Build the architecture to scan the estate, exclude dead/noindex pages, and select only contextually useful destinations.</div>
            </div>
          )}
        </div>
      </section>

      {/* ── SEO INTELLIGENCE BRIEFING — first-party intel writer contract ── */}
      <div data-testid="seo-intel-briefing" style={{ background: E.paper, border: `1px solid ${seoIntelBrief ? E.gold : E.hairline}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${E.hairline}` }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: E.goldDeep, fontWeight: 700 }}>First-party demand · §0 budget</div>
            <h4 style={{ margin: '3px 0 0', fontFamily: C.serif, fontSize: 17, color: E.ink }}>SEO Intelligence Briefing</h4>
          </div>
          {seoIntelBrief && (
            <span style={{ fontFamily: C.mono, fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', color: E.mossGreen, background: E.mossSoft, padding: '3px 8px' }}>
              ✓ LOCKED INTO WRITER CONTRACT
            </span>
          )}
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <EditorSeoIntelPanel
            mode="briefing"
            content=""
            title={title}
            topic={seoBriefSeed || topic}
            primaryKeyword={seoBriefSeed}
            clusterKeywords={kwList.length ? kwList : seoBriefSeed ? [seoBriefSeed] : []}
            disabled={generating}
            onBriefReady={handleSeoBriefReady}
            onInsert={() => {}}
            style={{ width: 300, maxWidth: '100%' }}
          />
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: C.serif, fontSize: 12.5, color: E.ink, lineHeight: 1.5 }}>
              Analyze the topic against first-party GSC intel (opportunity, confidence, action, coverage, topic fit, internal-link matches), then
              <strong> Generate SEO Brief</strong> to produce the $0 writer contract. It is merged into the canonical model contract below and
              carried into Drafting — no re-assembly there.
            </div>
            {seoIntelBrief ? (
              <pre style={{ margin: 0, padding: 12, background: E.ivory, border: `1px solid ${E.hairlineSoft}`, fontFamily: C.mono, fontSize: 10, lineHeight: 1.55, color: E.ink, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{seoIntelBrief.writerContract}
              </pre>
            ) : (
              <div style={{ padding: '18px 14px', textAlign: 'center', background: E.cream, border: `1px dashed ${E.gold}` }}>
                <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: E.ink }}>No intel brief yet.</div>
                <div style={{ marginTop: 4, fontSize: 10.5, color: E.inkMuted }}>Click Analyze SEO to read demand, then Generate SEO Brief to lock the writer contract.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODEL CONTRACT + SINGLE HANDOFF ── */}
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
          <span>{showPromptPreview ? '▾' : '▸'} Inspect canonical model contract</span>
          <span style={{ fontSize: 9, fontFamily: C.mono, color: 'rgba(255,255,255,0.45)' }}>
            Read-only · exact handoff
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'stretch', border: `1px solid ${briefReadiness === 100 ? E.gold : E.hairline}`, background: briefReadiness === 100 ? E.parchment : E.paper }}>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: briefReadiness === 100 ? E.mossGreen : E.red }}>{briefReadiness === 100 ? 'Ready for Stage III' : `${briefReadiness}% contract complete`}</div>
          <div style={{ marginTop: 5, fontFamily: C.serif, fontSize: 15, color: E.ink, fontWeight: 700 }}>{title || topic || 'Complete the brief identity'}</div>
          <div style={{ marginTop: 3, fontFamily: C.serif, fontSize: 11, color: E.inkMuted }}>
            {!title.trim() && !topic.trim() ? 'Enter a title or topic to begin.' : briefReadiness < 100 ? 'Resolve the incomplete checks above before drafting.' : `${h2s.length} sections · ${minWords}–${maxWords} words · ${sources.length} sources · ${briefInterlinks.length} contextual links`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSubmitBrief}
          disabled={generating || briefGenerating || briefReadiness < 100}
          style={{
            minWidth: 210, padding: '14px 28px', background: briefReadiness === 100 ? E.gold : E.inkDim,
            color: E.ivory, fontSize: 15, fontWeight: 700, fontFamily: C.serif,
            border: 'none', borderLeft: `1px solid ${E.hairline}`, borderRadius: 0, cursor: generating || briefGenerating || briefReadiness < 100 ? 'not-allowed' : 'pointer',
            opacity: generating || briefGenerating || briefReadiness < 100 ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {generating ? '⏳ Generating…' : 'Generate Draft →'}
        </button>
      </div>
    </div>
  )
})


/**
 * Published-format stream page — renders the streaming markdown the way the
 * article will LOOK once published (Google Docs-style white page):
 *  - YAML frontmatter and <script> JSON-LD blocks are hidden (metadata, not
 *    reader-facing content);
 *  - markdown links become real anchors, bold/italic/code render inline,
 *    headings/lists/blockquotes/dividers get final typography;
 *  - a blinking cursor follows the newest streamed word.
 */
const STUDIO_PAGE_WIDTH = 'min(816px, 100%)'

const studioInlineFormat = (text: string, keyBase: number): React.ReactNode[] => {
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) {
      parts.push(
        <code key={`${keyBase}-${k++}`} style={{ background: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em', fontFamily: C.mono, color: '#B91C1C' }}>
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      parts.push(<strong key={`${keyBase}-${k++}`} style={{ fontWeight: 700, color: '#111827' }}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      parts.push(<em key={`${keyBase}-${k++}`} style={{ fontStyle: 'italic' }}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (lm) {
        parts.push(
          <a key={`${keyBase}-${k++}`} href={lm[2]} target="_blank" rel="noreferrer"
            style={{ color: '#1D4ED8', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {lm[1]}
          </a>,
        )
      } else {
        parts.push(tok)
      }
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

const H1_BODY: React.CSSProperties = { fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontWeight: 700, fontSize: 30, lineHeight: 1.15, margin: '6px 0 22px', color: '#111827' }
const H2_BODY: React.CSSProperties = { fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontWeight: 700, fontSize: 22, lineHeight: 1.25, margin: '30px 0 12px', color: '#17365D' }
const H3_BODY: React.CSSProperties = { fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontWeight: 700, fontSize: 17, lineHeight: 1.3, margin: '22px 0 8px', color: '#1F4E79' }
const P_BODY: React.CSSProperties = { margin: '0 0 14px', fontSize: 15, lineHeight: 1.78, color: '#1F2937' }

const StudioDocPage = React.memo(function StudioDocPage({ source, showCursor }: { source: string; showCursor: boolean }) {
  const blocks = React.useMemo(() => {
    // Hide frontmatter + JSON-LD scripts: they are pipeline metadata, never
    // reader-facing content, and raw <script> in the page is what made the old
    // Word view look like "two copies" (formatted prose + raw markdown dump).
    let md = String(source || '')
    if (md.startsWith('---')) {
      const end = md.indexOf('\n---', 3)
      if (end !== -1) md = md.slice(end + 4).replace(/^\n+/, '')
    }
    md = md.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Keep only the most recent 500 lines so long rescue passes stay fluid.
    const lines = md.split('\n').slice(-500)
    const out: React.ReactNode[] = []
    let i = 0
    let k = 0
    while (i < lines.length) {
      const line = lines[i]
      if (line.trimStart().startsWith('```')) {
        // Raw fenced code is never part of the published page — skip to the fence end.
        i++
        while (i < lines.length && !lines[i].trimStart().startsWith('```')) i++
        i++
        continue
      }
      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
        out.push(<hr key={k++} style={{ border: 'none', borderTop: `1px solid ${E.hairline}`, margin: '22px 0' }} />)
        i++
        continue
      }
      const hm = line.match(/^(#{1,6})\s+(.+)$/)
      if (hm) {
        const level = hm[1].length
        if (level === 1) out.push(<h1 key={k++} style={H1_BODY}>{studioInlineFormat(hm[2], k)}</h1>)
        else if (level === 2) out.push(<h2 key={k++} style={H2_BODY}>{studioInlineFormat(hm[2], k)}</h2>)
        else out.push(<h3 key={k++} style={H3_BODY}>{studioInlineFormat(hm[2], k)}</h3>)
        i++
        continue
      }
      if (line.startsWith('> ')) {
        const q: string[] = []
        while (i < lines.length && lines[i].startsWith('>')) {
          q.push(lines[i].replace(/^>\s?/, ''))
          i++
        }
        out.push(
          <blockquote key={k++} style={{ margin: '14px 0', padding: '10px 16px', borderLeft: `3px solid ${E.gold}`, background: '#FCF8EF', color: '#57534E', fontStyle: 'italic' }}>
            {q.map((ql, qi) => <div key={qi} style={{ marginBottom: 4 }}>{studioInlineFormat(ql, k + qi)}</div>)}
          </blockquote>,
        )
        continue
      }
      if (/^[-*+]\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*+]\s+/, ''))
          i++
        }
        out.push(
          <ul key={k++} style={{ margin: '8px 0 16px', paddingLeft: 26, color: '#1F2937' }}>
            {items.map((it, ii) => (
              <li key={ii} style={{ marginBottom: 5, lineHeight: 1.6, fontSize: 15 }}>{studioInlineFormat(it, k + ii)}</li>
            ))}
          </ul>,
        )
        continue
      }
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''))
          i++
        }
        out.push(
          <ol key={k++} style={{ margin: '8px 0 16px', paddingLeft: 26, color: '#1F2937' }}>
            {items.map((it, ii) => (
              <li key={ii} style={{ marginBottom: 5, lineHeight: 1.6, fontSize: 15 }}>{studioInlineFormat(it, k + ii)}</li>
            ))}
          </ol>,
        )
        continue
      }
      if (!line.trim()) {
        i++
        continue
      }
      // Markdown table — consecutive `| … |` lines render as a real table.
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const rows: string[][] = []
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          const cells = lines[i].trim().split('|').slice(1, -1).map((c) => c.trim())
          // Skip the |---|---| separator row.
          if (!cells.every((c) => /^-{1,}$/.test(c))) rows.push(cells)
          i++
        }
        if (rows.length) {
          const header = rows[0]
          out.push(
            <table key={k++} style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 14 }}>
              <thead>
                <tr>
                  {header.map((cell, ci) => (
                    <th key={ci} style={{ borderBottom: `2px solid ${E.hairline}`, padding: '8px 10px', textAlign: 'left', fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontWeight: 700, color: '#17365D', background: '#F8FAFC' }}>{studioInlineFormat(cell, k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid ${E.hairline}` }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '8px 10px', verticalAlign: 'top', color: '#1F2937' }}>{studioInlineFormat(cell, k + ri)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>,
          )
          continue
        }
      }
      // Paragraph — group consecutive prose lines.
      const para: string[] = [line]
      i++
      while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^[-*+]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !lines[i].startsWith('> ') && !/^<script/i.test(lines[i])) {
        para.push(lines[i])
        i++
      }
      out.push(<p key={k++} style={P_BODY}>{studioInlineFormat(para.join(' '), k)}</p>)
    }
    return out
  }, [source])

  return (
    <div
      data-testid="studio-stream-document-body"
      style={{
        width: STUDIO_PAGE_WIDTH, minHeight: 1056, margin: '0 auto',
        padding: '64px clamp(36px, 7vw, 82px) 96px',
        background: '#fff', borderRadius: 4,
        boxShadow: '0 1px 3px rgba(15,23,42,.12), 0 8px 28px rgba(15,23,42,.1)',
        boxSizing: 'border-box', color: '#1F2937',
        fontFamily: 'Georgia, Cambria, "Times New Roman", serif', fontSize: 15, lineHeight: 1.78,
      }}
    >
      {blocks.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', paddingTop: 120 }}>
          The AI is composing this page…
        </div>
      ) : (
        <>
          {blocks}
          {showCursor && (
            <span style={{
              display: 'inline-block', width: 2, height: 19, background: '#2563EB',
              verticalAlign: 'text-bottom', marginLeft: 1,
              animation: 'studioCursorBlink 1s ease-in-out infinite',
            }} />
          )}
        </>
      )}
    </div>
  )
})

// ── III · DRAFT WORKSPACE ──
// Word-document style workspace where AI-generated content streams inline.
// The admin sees every token as it arrives and can edit in real time.
// Replaces the old dark LiveGenerationPanel with a proper document editor.
function DraftWorkspace({
  generating, generationEvents, generationStartedAt, generationBuffer,
  rescueStats, triedProviders,
  completedJob, selectedJob, setSelectedJob, generationJobId,
  onContinueToReview, selectTab, queueOpen, onToggleQueue, queueCount, onCancelGeneration, error, setError,
  onApprove, onShipReadyChange, onJobAttached, approving, studioRegion, studioContentType,
}: {
  generating: boolean
  generationEvents: GenerationActivity[]
  generationStartedAt: number | null
  generationBuffer: React.MutableRefObject<string>
  rescueStats: DepthRescueStats | null
  triedProviders: string[]
  completedJob: ContentJob | null
  selectedJob: ContentJob | null
  generationJobId?: string
  setSelectedJob: (j: ContentJob | null) => void
  onContinueToReview: () => void
  selectTab: (k: StudioTab) => void
  queueOpen: boolean
  onToggleQueue: () => void
  queueCount: number
  onCancelGeneration?: () => void
  error: string | null
  setError: (e: string | null) => void
  onApprove?: (jobId?: string) => void
  onShipReadyChange?: (gate: ShipGate) => void
  onJobAttached?: (jobId: string) => void
  approving?: boolean
  studioRegion?: string
  studioContentType?: string
}) {   const [draftContent, setDraftContent] = React.useState('')
  const [generationText, setGenerationText] = React.useState('')
  const [draftTitle, setDraftTitle] = React.useState('')
  const [reviewModel, setReviewModel] = React.useState(DEFAULT_REVIEW_PIN)
  const [streamView, setStreamView] = React.useState<'document' | 'source'>('document')
  const lastEventRef = React.useRef<string>('')
  const livePreviewRef = React.useRef<HTMLDivElement | null>(null)
  const draftContentRef = React.useRef('')
  draftContentRef.current = draftContent

  // Streaming text lives inside this isolated editor. Reading the mutable SSE
  // buffer here prevents every token from re-rendering the 7k-line studio,
  // queue, dashboards, and review panels. A 900ms paint cadence remains fluid
  // while avoiding repeated whole-document parsing on the main thread.
  React.useEffect(() => {
    if (!generating) {
      if (generationBuffer.current) {
        setGenerationText(generationBuffer.current)
        setDraftContent((current) => current || generationBuffer.current)
      }
      return
    }
    // A fresh generation starts from an empty editor. NEVER inherit the
    // previous job's body: draftContent (and its ref) feed the unmount flush
    // and the inline-editor autosave, so a stale article would otherwise be
    // persisted onto the new claimed job row (title/body cross-write).
    setDraftContent('')
    draftContentRef.current = ''
    setGenerationText('')
    const timer = window.setInterval(() => {
      const next = generationBuffer.current
      setGenerationText((current) => current === next ? current : next)
    }, 900)
    return () => window.clearInterval(timer)
  }, [generating, generationBuffer])

  // Leaving Draft unmounts this workspace when no job id is attached. Flush
  // the local buffer so the body is not discarded with the panel.
  React.useEffect(() => {
    const jobId = completedJob?.id || selectedJob?.id || generationJobId || ''
    const title = completedJob?.title || selectedJob?.title || ''
    const topic = completedJob?.topic || selectedJob?.topic || title
    const contentType = completedJob?.content_type || selectedJob?.content_type
    const region = completedJob?.region || selectedJob?.region
    return () => {
      const body = (draftContentRef.current || generationBuffer.current || '').trim()
      if (body.length < 40) return
      void fetch('/api/content-studio/drafts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId || undefined,
          content: body,
          source: 'autosave',
          title,
          topic,
          contentType,
          region,
        }),
      }).catch(() => {})
    }
  }, [completedJob?.id, selectedJob?.id, generationJobId, completedJob?.title, selectedJob?.title, completedJob?.topic, selectedJob?.topic, completedJob?.content_type, selectedJob?.content_type, completedJob?.region, selectedJob?.region, generationBuffer])

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
  // Word count recomputed only when the (throttled) stream text changes —
  // not twice per render on every keystroke of the stream.
  const generationWordCount = React.useMemo(
    () => (generating ? countBodyWords(generationText) : 0),
    [generating, generationText],
  )
  const generationChars = generationText.length
  const hasContent = draftContent.length > 0
  const latestEvent = generationEvents[generationEvents.length - 1]
  const isStreaming = generating
  const hasCompleted = Boolean(completedJob && !generating)
  // Ship gate is ONLY green when the audit payload explicitly confirms
  // shipReady === true AND zero blockers (canonical currentGate). The score —
  // even 100 — never implies readiness, and a fresh generation with no
  // shipReady on record is UNKNOWN, not "passed". Submit for audit in Review.
  const jobAuditJson = (completedJob?.audit_json ?? null) as unknown as {
    shipReady?: unknown; blockers?: unknown
  } | null
  const draftGate = shipGateFromResponse({
    shipReady: jobAuditJson?.shipReady,
    blockers: (() => {
      const b = jobAuditJson?.blockers
      return Array.isArray(b) ? b.length : typeof b === 'number' ? b : 0
    })(),
  })
  const gatePassed = shipGateReady(draftGate)
  const auditScore = completedJob?.audit_json?.score ?? null
  const wordCount = countBodyWords(draftContent || completedJob?.content || '') || completedJob?.word_count || 0
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
                ✓ Generation complete · {wordCount} words · ship gate passed
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
                Generation complete · {wordCount} words{auditScore != null ? ` · score ${auditScore}/100` : ''} · re-audit to confirm the ship gate
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
        <div style={{ background: E.redSoft, border: `1px solid ${E.redBorder}`, borderLeft: `3px solid ${E.red}`, padding: '10px 16px', fontSize: 12, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: C.mono, fontSize: 11 }}>⚠ {error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: C.red }}>×</button>
        </div>
      )}

      {/* ── Document workspace — clean editorial canvas ── */}
      <div style={{ position: 'relative', background: `linear-gradient(180deg, ${E.parchment} 0%, #EBE4D2 100%)`, border: `1px solid ${E.hairline}`, minHeight: 520, display: 'flex', flexDirection: 'column', boxShadow: '0 12px 34px rgba(17,21,28,.12)' }}>
        {/* Docs-style header: title · status · view toggle · actions */}
        <div style={{
          minHeight: 56, padding: '0 16px', background: E.paper,
          borderBottom: `1px solid ${E.hairline}`,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'relative',
        }}>
          <button
            type="button"
            onClick={() => selectTab('research')}
            title="Back to the brief"
            style={{ padding: '6px 10px', border: 'none', background: 'transparent', color: E.inkMuted, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: C.serif }}
          >
            ← Brief
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke={E.gold} strokeWidth="1.5" />
              <path d="M14 2v6h6" fill="none" stroke={E.gold} strokeWidth="1.5" />
              <path d="M8 13h8M8 17h8" stroke={E.gold} strokeWidth="1.5" />
            </svg>
            <div style={{
              fontFamily: C.serif, fontSize: 15, fontWeight: 700,
              color: E.inkBlack, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340,
            }} title={draftTitle || completedJob?.title || 'Untitled draft'}>
              {draftTitle || completedJob?.title || 'Untitled draft'}
            </div>
            <span style={{
              fontSize: 10, fontFamily: C.mono, color: generating ? E.amber : hasCompleted ? E.green : E.inkDim,
              whiteSpace: 'nowrap',
            }}>
              {generating ? '● AI writing…' : hasCompleted ? '✓ Saved to job history' : 'Ready'}
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* View toggle — published page vs raw markdown */}
            <div style={{ display: 'inline-flex', border: `1px solid ${E.hairline}`, borderRadius: E.radiusFull, overflow: 'hidden', background: E.surface2 }}>
              {(['document', 'source'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={mode === 'document' ? 'studio-stream-document' : 'studio-stream-source'}
                  onClick={() => setStreamView(mode)}
                  aria-pressed={streamView === mode}
                  style={{
                    padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                    fontFamily: C.mono, letterSpacing: '0.04em',
                    background: streamView === mode ? E.inkBlack : 'transparent',
                    color: streamView === mode ? E.ivory : E.inkMuted,
                  }}
                >
                  {mode === 'document' ? 'Document' : 'Markdown'}
                </button>
              ))}
            </div>

            {/* Word count chip */}
            <span style={{ fontFamily: C.mono, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '4px 10px', border: `1px solid ${E.hairline}`, borderRadius: E.radiusFull, background: E.surface2 }}>
              {(() => {
                const wc = generating ? generationWordCount : wordCount
                const editorial = editorialTypeForDepth({
                  studioType: studioContentType,
                  contentType: completedJob?.content_type || selectedJob?.content_type,
                  canonicalUrl: completedJob?.canonical_url || selectedJob?.canonical_url,
                  filePath: completedJob?.content_path || selectedJob?.content_path,
                  content: draftContent || completedJob?.content || selectedJob?.content,
                })
                const spec = depthSpecForType(
                  studioContentType === 'blog_post' || editorial === 'blog_post' ? 'blog_post' : editorial,
                )
                const minW = spec.minWords
                const maxW = spec.maxWords
                const overMax = wc > maxW
                const underMin = wc < minW
                const wcColor = overMax ? C.red : underMin ? C.orange : '#0F7A3A'
                return (
                  <>
                    <span style={{ color: wcColor, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>{wc.toLocaleString()} w</span>
                    <span style={{ color: E.inkDim }}>/ {minW.toLocaleString()}–{maxW.toLocaleString()}</span>
                  </>
                )
              })()}
            </span>

            {generating && onCancelGeneration && (
              <button
                type="button"
                onClick={onCancelGeneration}
                title="Stop the AI immediately — any checkpointed draft stays in the queue and can be resumed"
                style={{
                  padding: '6px 12px', border: `1px solid ${E.redBorder}`, borderRadius: E.radiusXs,
                  background: E.redSoft, color: E.red,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: C.mono, letterSpacing: '0.04em',
                }}
              >
                ■ Cancel draft
              </button>
            )}

            <button
              type="button"
              disabled={generating || !hasCompleted}
              onClick={onContinueToReview}
              style={{
                padding: '6px 14px', border: 'none', borderRadius: E.radiusXs,
                background: generating || !hasCompleted ? E.surface2 : E.inkBlack,
                color: generating || !hasCompleted ? E.inkDim : E.ivory,
                fontSize: 11, fontWeight: 700, cursor: generating || !hasCompleted ? 'not-allowed' : 'pointer',
                fontFamily: C.mono, letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Audit & Fix
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={onToggleQueue}
              aria-pressed={queueOpen}
              style={{
                padding: '6px 12px', border: `1px solid ${E.hairline}`, borderRadius: E.radiusXs,
                background: queueOpen ? E.goldSoft : E.paper, color: queueOpen ? E.goldDeep : E.inkMuted,
                fontSize: 11, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: C.mono, letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Jobs ({queueCount})
            </button>
          </div>
        </div>

        {/* Editor body */}
        {generating && generationText.length > 0 ? (
          /* Live preview — document view renders the published page; source is the raw stream. */
          <div ref={livePreviewRef} data-testid="studio-stream-preview" style={{
            marginTop: 0, background: `linear-gradient(180deg, ${E.parchment} 0%, #EBE4D2 100%)`,
            border: 'none', borderRadius: 0,
            height: 'min(72vh, 860px)', minHeight: 560, overflowY: 'auto', padding: '20px 12px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              position: 'sticky', top: 0, zIndex: 2, margin: '0 auto 12px',
              width: 'min(816px, 100%)', padding: '6px 14px',
              background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(4px)',
              border: `1px solid ${E.hairline}`, borderRadius: E.radiusXs,
              fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: E.goldDeep, fontWeight: 800, letterSpacing: '0.08em' }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 9, background: E.mossGreen, animation: 'pulse 1.5s infinite' }} />
                ✍️ AI WRITING LIVE
              </span>
              <span style={{ marginLeft: 'auto' }}>
                {generationText.length.toLocaleString()} chars · {generationWordCount.toLocaleString()} body words
              </span>
            </div>
            {streamView === 'document' ? (
              <StudioDocPage source={generationText} showCursor />
            ) : (
              <div
                data-testid="studio-stream-source-body"
                style={{
                  width: 'min(816px, 100%)', margin: '0 auto', minHeight: 'min(68vh, 840px)',
                  padding: '24px 28px', background: E.paper, borderRadius: E.radiusSm,
                  boxShadow: E.paperShadow,
                  fontFamily: C.mono, fontSize: 12, lineHeight: 1.7, color: E.ink,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
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
            )}
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
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: e.level === 'error' ? E.red : e.level === 'warn' ? E.amber : e.level === 'success' ? E.green : E.blue, flex: 1 }}>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : hasContent && !selectedJob ? (
          /* Content ready — render in AdminInlineEditor. Hidden while a job is
             open in the JobDetail modal (it carries its own editor) so a draft
             is never editable in two places for the same job. */
          <div style={{ flex: 1, padding: 0 }}>
            <AdminInlineEditor
              content={draftContent}
              jobId={completedJob?.id || selectedJob?.id || generationJobId || ''}
              onChange={(text) => setDraftContent(text)}
              disabled={generating}
              onApprove={onApprove}
              approving={approving}
              onShipReadyChange={onShipReadyChange}
              onJobAttached={onJobAttached}
              title={completedJob?.title || selectedJob?.title}
              topic={completedJob?.topic || selectedJob?.topic}
              contentType={studioContentType === 'blog_post' ? 'blog_post' : (completedJob?.content_type || studioContentType)}
              primaryKeyword={completedJob?.primary_keyword ?? undefined}
              indexable={completedJob?.indexable}
              region={completedJob?.region ?? selectedJob?.region ?? studioRegion}
              competingSnippets={completedJob?.competing_snippets ?? undefined}
              competingUrls={completedJob?.competing_urls ?? undefined}
              requiredShortKeywords={completedJob?.required_short_keywords ?? undefined}
              requiredLongTailKeywords={completedJob?.required_long_tail_keywords ?? undefined}
              reviewModel={reviewModel}
              onReviewModelChange={setReviewModel}
            />
          </div>
        ) : hasContent && selectedJob ? (
          /* A job is open in the JobDetail modal — its editor owns this draft
             until the modal closes. Keep the workspace quiet so the same job
             is never editable in two places. */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }} data-testid="studio-modal-editor-active">
            <div style={{ fontFamily: C.serif, fontSize: 18, color: E.inkMuted, fontStyle: 'italic' }}>
              Editing in the job editor
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: E.inkDim, textAlign: 'center', maxWidth: 420 }}>
              “{selectedJob.title}” is open in its detail editor. Close it to return to the draft workspace.
            </div>
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
            marginTop: 14, padding: '10px 14px', background: E.cream, borderTop: `1px solid ${E.hairline}`,
            border: `1px solid ${E.hairline}`, borderRadius: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <div style={{ ...kickerStyleSm }}>
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

// ── Job Timeline (built from the already-loaded job — never re-fetches) ──
const TIMELINE_CAP = 40

function buildJobTimelineEntries(job: ContentJob, lineage: Array<Record<string, any>> = []): TimelineEntry[] {
  const derived: TimelineEntry[] = []
  const pushStage = (ts: unknown, source: string, message: string, detail?: string, level: LogLevel = 'success') => {
    const ms = typeof ts === 'number' ? ts : ts ? new Date(String(ts)).getTime() : NaN
    if (Number.isFinite(ms)) derived.push({ ts: ms, level, source, message, detail, kind: 'stage' })
  }
  for (const node of lineage.slice(-8)) {
    pushStage(node.created_at, 'lineage', `${node.regeneration_mode ? `${node.regeneration_mode} · ` : ''}${node.status || 'job'}: ${node.title || node.topic || node.id}`, node.regeneration_reason || undefined, node.status === 'failed' ? 'error' : 'info')
  }
  pushStage(job.created_at, 'job', 'Job created (queued)', undefined, 'info')
  if (job.pr_number || job.pr_url) {
    pushStage(job.created_at, 'github', `Pull request #${job.pr_number ?? ''} opened`, job.pr_url || undefined, 'info')
  }
  if (job.deployed_at) pushStage(job.deployed_at, 'cloudflare', 'Deployed to Cloudflare', undefined, 'success')
  if (job.merged_at) pushStage(job.merged_at, 'github', 'Pull request merged', undefined, 'success')
  if (job.closed_at) pushStage(job.closed_at, 'github', 'Pull request closed without merge', undefined, 'warn')
  if (job.status === 'failed' || job.error_message) {
    pushStage(job.updated_at ?? Date.now(), 'pipeline', job.error_message || 'Job failed', undefined, 'error')
  }
  const rawLog = Array.isArray(job.event_log) ? (job.event_log as any[]).slice(-TIMELINE_CAP) : []
  const logs: TimelineEntry[] = rawLog.map((e) => ({
        ts: typeof e.ts === 'number' ? e.ts : new Date(String(e.ts)).getTime(),
        level: (['success', 'info', 'warn', 'error'].includes(e.level) ? e.level : 'info') as LogLevel,
        source: String(e.source || 'studio'),
        message: String(e.message || '').slice(0, 400),
        detail: e.detail ? String(e.detail).slice(0, 500) : undefined,
        kind: 'log' as const,
      })).filter((e) => Number.isFinite(e.ts))
  const seen = new Set<string>()
  return [...logs, ...derived]
    .filter((e) => {
      const key = `${e.ts}-${e.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.ts - b.ts)
    .slice(-TIMELINE_CAP)
}

function JobTimeline({ job, lineage = [] }: { job: ContentJob; lineage?: Array<Record<string, any>> }) {
  const entries = React.useMemo(() => buildJobTimelineEntries(job, lineage), [job, lineage])

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
  const [jobLineage, setJobLineage] = React.useState<Array<Record<string, any>>>([])
  const [editorContent, setEditorContent] = React.useState(job.content || '')
  const loadGenRef = React.useRef(0)
  const jobIdRef = React.useRef(job.id)
  jobIdRef.current = job.id
  const generationFailed = Boolean(detail.error_message) && (detail.status === 'drafting' || detail.status === 'failed' || detail.status === 'pending')
  const storedDraftLikely = Boolean(job.content) || Number(job.word_count) > 0
  // Failed / regen-needed jobs open instantly. Auto-fetching the stored body
  // is what froze this modal (JSON parse + editor mount on a fat draft).
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionNotice, setLocalActionNotice] = React.useState<string | null>(null)
  const [activeAction, setActiveAction] = React.useState<string | null>(null)
  const [actionEvents, setActionEvents] = React.useState<GenerationActivity[]>([])
  const [actionStartedAt, setActionStartedAt] = React.useState<number | null>(null)
  const [aiProvider, setAiProvider] = React.useState<string>(DEFAULT_DRAFT_PIN)
  const [reviewModel, setReviewModel] = React.useState<string>(DEFAULT_REVIEW_PIN)
  const [actionChars, setActionChars] = React.useState(0)
  const [resumeAvailable, setResumeAvailable] = React.useState(false)
  const actionAbortRef = React.useRef<AbortController | null>(null)
  const [audit, setAudit] = React.useState<unknown>(null)
  // Canonical ship-gate snapshot from the LATEST audit/fix response. `null`
  // means UNKNOWN — the current content version has not been audited (or was
  // edited after the last audit), so the banner must never claim a pass and
  // Approve must stay disabled. The green stale-refusal banner is driven by
  // this state now, never by `audit.score` (score is not ship readiness).
  const [editorShipGate, setEditorShipGate] = React.useState<ShipGate>(null)
  React.useEffect(() => {
    // Reset stale audit/ship state when the selected job changes so one job's
    // result can never bleed into another job's banner or buttons.
    setEditorShipGate(null)
    setAudit(null)
  }, [job.id])

  // Owner contract: pickers DEFAULT to the operator/brief pin (lineage
  // ownerProvider, then stored ai_provider). Last cascade runtime must not
  // overwrite the pin unless the operator changes the picker.
  React.useEffect(() => {
    const owner = resolveJobPickerPin(job)
    if (!owner || owner === 'auto') return
    setAiProvider(owner)
    setReviewModel(owner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id])

  const loadDetail = React.useCallback(async (opts: { body?: boolean } = {}) => {
    const gen = ++loadGenRef.current
    const wantBody = opts.body !== false
    if (wantBody) setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const qs = new URLSearchParams({ id: jobIdRef.current })
      if (wantBody) qs.set('body', '1')
      const response = await fetch(`/api/content-studio/jobs?${qs.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({})) as { job?: ContentJob; lineage?: Array<Record<string, any>>; error?: string }
      if (gen !== loadGenRef.current) return
      if (!response.ok || !data.job) throw new Error(data.error || `HTTP ${response.status}`)
      const next = { ...job, ...data.job, id: jobIdRef.current }
      setDetail(next)
      if (typeof data.job.content === 'string') {
        // Guard: huge content (failed jobs with error logs) freezes the editor
        if (data.job.content.length > 60_000) {
          setEditorContent(data.job.content.slice(0, 60_000) + '\n\n<!-- Content truncated — ' + (data.job.content.length - 60_000).toLocaleString() + ' chars omitted -->')
        } else {
          setEditorContent(data.job.content)
        }
      }
      setActionError(null)
      if (next.error_message && (next.status === 'drafting' || next.status === 'failed' || next.status === 'pending')) {
        setResumeAvailable(Boolean(next.content || job.content))
      }
    } catch (error) {
      if (gen !== loadGenRef.current) return
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      setActionError(
        aborted
          ? 'Draft body took too long to load. The window stays usable — Regenerate, Load draft, or close with Esc.'
          : (error instanceof Error ? error.message : 'Failed to load the full job'),
      )
      setResumeAvailable(storedDraftLikely)
    } finally {
      clearTimeout(timer)
      if (gen === loadGenRef.current) setLoading(false)
    }
  }, [job, storedDraftLikely])

  React.useEffect(() => {
    if (!jobDetailShouldAutoLoadBody(job)) {
      setLoading(false)
      return
    }
    void loadDetail({ body: true })
    return () => { loadGenRef.current += 1 }
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          sectionBudgets: ((detail as { section_budgets?: string | Array<{ heading: string; minWords: number; maxWords: number }> | null }).section_budgets
            ? JSON.parse(String((detail as { section_budgets?: string | Array<Record<string, unknown>> | null }).section_budgets))
            : undefined),
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
      const checkpointed = Boolean(result?.shipError && /resume from checkpoint|budget exhausted/i.test(String(result.shipError)))
      const message = checkpointed
        ? 'Checkpoint saved. Continue the saved draft when ready; shipping remains paused until the audit completes.'
        : replacementId
        ? `Regeneration complete. Replacement job ${replacementId} is now in the queue.`
        : 'Regeneration complete. Refresh the queue to view the new job.'
      setResumeAvailable(checkpointed || Boolean(result?.content))
      setLocalActionNotice(message)
      setActionNotice(message)
      if (replacementId) onReplacementJob?.(String(replacementId))
      await loadDetail()
      await onRefresh()
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError'
      const rawMessage = error instanceof Error ? error.message : 'Regeneration failed'
      const resumable = cancelled || streamedChars > 0

      // Surface the real error: the user needs to know WHAT stopped the stream,
      // not just that it stopped. A Cloudflare CPU timeout needs a different
      // action than an AI provider error.
      const cause = cancelled
        ? 'Generation was cancelled or the browser connection closed.'
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

      if (resumable) await onRefresh()
    } finally {
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
        if (data.job.content != null && action !== 'regenerate') {
          const c = String(data.job.content)
          setEditorContent(c.length > 60_000 ? c.slice(0, 60_000) + '\n\n<!-- Truncated -->' : c)
        }
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
  // One canonical source of truth for the ship-refusal banner, blocker panel,
  // and Approve/Ship-PR enablement — the latest audit's shipGate snapshot.
  const shipRefused = Boolean(detail.error_message) && /ship refused/i.test(detail.error_message)
  const shipRefusalBanner = resolveShipRefusalBanner({ refused: shipRefused, gate: editorShipGate })
  const shipReady = shipActionsEnabled(editorShipGate)

  const actionBtn = (label: string, opts: { bg?: string; fg?: string; border?: string; disabled?: boolean; onClick: () => void; title?: string; testId?: string }) => (
    <button type="button" disabled={opts.disabled} onClick={opts.onClick} title={opts.title} data-testid={opts.testId} style={{
      padding: '8px 12px', borderRadius: C.radiusXs, cursor: opts.disabled ? 'not-allowed' : 'pointer',
      fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: opts.disabled ? 0.5 : 1,
      background: opts.bg || C.surface, color: opts.fg || C.text,
      border: opts.border ? `1px solid ${opts.border}` : `1px solid ${C.border}`,
    }}>
      {label}
    </button>
  )

  return (
    <div role="dialog" aria-modal="true" aria-label={detail.title || 'Job details'} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
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
            { label: 'Body words', value: formatBodyWordDisplay(countBodyWords(editorContent || detail.content || ''), detail.word_count) },
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
            <StudioModelHostSelect
              lane="draft"
              pin={aiProvider}
              onPinChange={setAiProvider}
              modelAriaLabel="Regeneration AI model"
              hostAriaLabel="Regeneration AI provider"
              selectStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: C.radiusXs, padding: '6px 8px', fontSize: 11, color: C.text, fontFamily: C.mono }}
            />
          </label>
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
              <JobTimeline job={detail} lineage={jobLineage} />

        </div>

        {shipRefusalBanner === 'cleared' ? (
          <div data-testid="studio-stale-refusal-clear" style={{ background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: C.radiusXs, padding: '10px 14px', fontSize: 11, color: '#166534', marginBottom: 10 }}>
            Previous ship refusal is stale — this version passed the full audit with zero blockers. Click <strong>Approve → main</strong> to ship it.
          </div>
        ) : shipRefusalBanner === 'active' ? (
          <div data-testid="studio-refusal-active" style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusXs, padding: '10px 14px', fontSize: 11, color: C.red, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Ship refusal is active — this draft still has blockers. Approve stays disabled.</div>
            <div style={{ fontFamily: C.mono, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{detail.error_message}</div>
            <div style={{ marginTop: 4 }}>Resolve the blockers in Content editor (Audit &amp; Fix), then Approve becomes available.</div>
          </div>
        ) : shipRefusalBanner === 'unknown' ? (
          <div data-testid="studio-refusal-unknown" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: C.radiusXs, padding: '10px 14px', fontSize: 11, color: '#92400E', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ship gate status unknown — run <strong>Audit &amp; Fix</strong> (Re-audit) to verify this draft before approving.</div>
            <div style={{ fontFamily: C.mono, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{detail.error_message}</div>
            <div style={{ marginTop: 4 }}>Approve stays disabled until an audit confirms the current content version passes with zero blockers.</div>
          </div>
        ) : detail.error_message ? (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: C.radiusXs, padding: '10px 14px', fontSize: 11, color: C.red, marginBottom: 10, fontFamily: C.mono, whiteSpace: 'pre-wrap' }}>{detail.error_message}</div>
        ) : null}

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
          {loading && !editorContent.trim()
            ? <div style={{ fontSize: 11, color: C.textDim, padding: 18 }}>
                Loading draft body…
                <div style={{ marginTop: 8, fontSize: 10 }}>This never blocks the window. Close with Esc, or use Regenerate / Load draft below.</div>
              </div>
            : editorContent.trim()
              ? <AdminInlineEditor content={editorContent} jobId={detail.id} onChange={(v: string) => setEditorContent(v)} disabled={busy || terminal} onScoreChange={(s) => setAudit(s != null ? { score: s } : null)} onShipReadyChange={setEditorShipGate} onApprove={editorShipGate?.shipReady && !terminal ? () => void runAction('approve') : undefined} approving={busy && activeAction === 'approve'} contentType={detail.content_type} primaryKeyword={detail.primary_keyword ?? undefined} indexable={detail.indexable} region={detail.region ?? undefined} targetUrl={detail.canonical_url ?? undefined} competingUrls={detail.competing_urls ?? undefined} requiredShortKeywords={detail.required_short_keywords ?? undefined} requiredLongTailKeywords={detail.required_long_tail_keywords ?? undefined} reviewModel={reviewModel} onReviewModelChange={setReviewModel} />
              : (
                <div style={{ padding: 18, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  {generationFailed && storedDraftLikely
                    ? `This run failed after a ${Number(detail.word_count || job.word_count) || 'partial'} word draft was stored. The window stays open so you can Regenerate (Grok is the SuperGrok fallback) or Load the saved draft to edit it.`
                    : generationFailed
                    ? 'Generation failed before a full draft was stored. Click Regenerate to rewrite with another model (Grok is the SuperGrok fallback), or Duplicate to start a fresh job from this brief.'
                    : 'No draft body is stored on this job yet. Regenerate to write one.'}
                </div>
              )}
        </div>

        {/* ── Dedicated action groups ── */}
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 6 }}>✏️ Editing the draft</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
          {actionBtn('💾 Save draft', { border: C.gold, bg: dirty ? '#FFFBEB' : C.surface2, disabled: busy || !dirty || !editorContent.trim(), onClick: () => void runAction('save'), title: 'Persist your edits to the job' })}
          {actionBtn('🔁 Regenerate', { border: C.red, fg: C.red, bg: '#FFF5F5', disabled: busy, onClick: () => void runAction('regenerate'), title: 'Rewrite the full piece with AI (creates a replacement job)' })}
          {generationFailed && storedDraftLikely && actionBtn(loading ? '↻ Loading draft…' : '↻ Load saved draft', { border: C.navy, fg: C.navy, disabled: busy || loading, onClick: () => void loadDetail({ body: true }), title: 'Fetch the stored draft body so you can edit it' })}
          {generationFailed && !storedDraftLikely && actionBtn('↻ Retry load', { border: C.navy, fg: C.navy, disabled: busy, onClick: () => void loadDetail({ body: true }), title: 'Fetch the stored draft again' })}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em', marginBottom: 6 }}>🚀 Delivering to the sites</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
          {actionBtn('📦 Ship PR only', { testId: 'studio-ship-pr', bg: C.cyan, fg: '#FFF', disabled: busy || !editorContent.trim() || terminal || !shipReady, onClick: () => void runAction('reship'), title: !shipReady ? 'Re-audit until the ship gate is ready, then ship a PR' : 'Open / update the pull request without merging' })}
          {actionBtn('✅ Approve → main', { testId: 'studio-approve-main', bg: C.green, fg: '#FFF', disabled: busy || !editorContent.trim() || terminal || !shipReady, onClick: () => void runAction('approve'), title: !shipReady ? 'Re-audit and clear blockers before Approve → main' : 'Approve content and trigger deployment to main' })}
          {detail.pr_number && !terminal && actionBtn(`🔀 Merge open PR #${detail.pr_number}`, { border: C.green, fg: C.green, bg: '#F0FDF4', disabled: busy, onClick: () => void runAction('merge_pr'), title: 'Merge the open pull request on GitHub' })}
          {actionBtn('🩺 Monitor deploy', { disabled: busy, onClick: () => void runAction('monitor'), title: 'Verify the deployed URL: purge, sitemap, IndexNow' })}
          {actionBtn('⧉ Duplicate', { disabled: busy, onClick: () => void runAction('duplicate'), title: 'Clone this job as the starting point for a new piece' })}
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
type WorkPlanCategory = 'gap' | 'refresh' | 'expansion' | 'cannibal' | 'merge' | 'backlink' | 'visibility' | 'ubersuggest'
interface WorkPlanItem {
  id: string
  category: WorkPlanCategory
  title: string
  topic: string
  source: string
  priority: number
  priorityTier: 'high' | 'medium' | 'low'
  clusterId?: string
  clusterSize?: number
  signals: string[]
  keywords?: string[]
  audience?: string
  play?: string
  shipped?: boolean
  suggestion?: AISuggestion
  mergeRecord?: CannibalMergeRecord
  competingPages?: string[]
}

const CATEGORY_META: Record<WorkPlanCategory, { label: string; bg: string; fg: string; icon: string }> = {
  gap: { label: 'GAP', bg: '#DBEAFE', fg: '#1E40AF', icon: '🧩' },
  refresh: { label: 'REFRESH', bg: '#FEF3C7', fg: '#92400E', icon: '🔄' },
  expansion: { label: 'EXPAND', bg: '#D1FAE5', fg: '#065F46', icon: '📈' },
  cannibal: { label: 'CANNIBAL', bg: '#FEE2E2', fg: '#991B1B', icon: '⚠️' },
  merge: { label: 'MERGE', bg: '#F3E8FF', fg: '#6B21A8', icon: '🔀' },
  backlink: { label: 'BACKLINK', bg: '#FFF7ED', fg: '#9A3412', icon: '🔗' },
  visibility: { label: 'AEO GAP', bg: '#ECFDF5', fg: '#065F46', icon: '◎' },
  ubersuggest: { label: 'UBER', bg: '#EDE9FE', fg: '#5B21B6', icon: '◇' },
}

/** Mirror of lib/seoFactory/cannibalMerge.ts `canonicalStem` — kept local so the
 *  client bundle never imports the server-only merge executor (Supabase / GitHub
 *  / GSC modules). Used to hide already-merged cannibal clusters. */
function cannibalTermStem(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
}

/** Mirror of `clusterIdFromTerm` — matches the `cluster_id` the merge executor
 *  writes to cannibal_merges so resolved clusters can be filtered locally. */
function cannibalClusterIdForTerm(term: string): string {
  return `cluster_${cannibalTermStem(term).replace(/[^a-z0-9]+/g, '_').slice(0, 48)}`
}

function buildWorkPlan(
  radar: AISuggestion[],
  radarMeta: Record<string, unknown> | null,
  merges: CannibalMergeRecord[],
  clearedTopics: Set<string> = new Set(),
  uberBriefs: AISuggestion[] = [],
): WorkPlanItem[] {
  const items: WorkPlanItem[] = []
  const radarTopics = new Set(radar.map((s) => String(s.topic || '').toLowerCase()).filter(Boolean))
  const seenClusters = new Set<string>()
  // Radar opportunities → gaps, quick wins, refreshes
  for (const s of radar) {
    if (s.play === 'cannibalization' && isJunkQuery(s.topic)) continue
    const clusterId = s.cluster?.clusterId || `topic:${cannibalTermStem(s.topic)}`
    if (seenClusters.has(clusterId)) continue
    seenClusters.add(clusterId)
    const cat: WorkPlanCategory = s.play === 'refresh' || s.play === 'defend' ? 'refresh'
      : s.play === 'cannibalization' ? 'cannibal'
      : 'gap'
    const engineValue = s.valueScore ?? s.opportunityScore ?? s.demandScore ?? 0
    const rankingValue = Number(s.ranking?.total)
    const priority = Number.isFinite(rankingValue)
      ? Math.round(engineValue * 0.65 + rankingValue * 0.35)
      : engineValue
    items.push({
      id: `radar-${s.topic}`,
      category: cat,
      title: s.title,
      topic: s.topic,
      source: 'Radar',
      priority,
      priorityTier: priority >= 75 ? 'high' : priority >= 50 ? 'medium' : 'low',
      clusterId,
      clusterSize: Math.max(1, s.cluster?.keywords?.length || s.keywords?.length || 1),
      signals: [
        ...(s.signals ?? [s.reason]),
        ...(Number.isFinite(rankingValue) ? [`Contract score blends portfolio value ${engineValue}/100 with ranking-model confidence ${rankingValue}/100`] : []),
        ...(s.cluster?.reason ? [`Cluster: ${s.cluster.reason}`] : []),
      ],
      keywords: s.cluster?.keywords?.length ? s.cluster.keywords : s.keywords,
      audience: s.audience,
      play: s.play,
      suggestion: s,
    })
  }
  for (const s of uberBriefs) {
    const topicKey = String(s.topic || '').toLowerCase()
    if (!topicKey || radarTopics.has(topicKey) || isJunkQuery(s.topic)) continue
    // play === 'refresh' means the server already matched this against shipped content
    const isShipped = s.play === 'refresh'
    const priority = isShipped ? 10 : (s.valueScore ?? ((s.opportunityScore ?? s.demandScore ?? 0) + 8))
    items.push({
      id: `uber-${s.topic}`,
      category: 'ubersuggest',
      title: s.title || s.topic,
      topic: s.topic,
      source: 'Ubersuggest',
      priority,
      priorityTier: priority >= 75 ? 'high' : priority >= 50 ? 'medium' : 'low',
      signals: s.signals ?? [s.reason],
      keywords: s.keywords,
      audience: s.audience,
      play: s.play,
      shipped: isShipped,
      suggestion: s,
    })
  }
  // Cannibalization from radar meta — hide clusters that already have a
  // terminal decision (merged / skipped / deferred) so Resolve-all and junk
  // dismissals stay off the Work Plan after a refresh.
  const resolvedMerges = merges.filter((m) => m.status === 'merged' || m.status === 'skipped' || m.status === 'deferred')
  const mergedClusterIds = new Set(resolvedMerges.map((m) => m.clusterId))
  const mergedStems = new Set(resolvedMerges.map((m) => String(m.stem || '').toLowerCase()).filter(Boolean))
  const mergedTerms = new Set(resolvedMerges.flatMap((m) => m.terms ?? []).map((t) => String(t).toLowerCase()))
  const cannibalList = (radarMeta?.cannibalization as Array<{ term: string; pages: string[] }> | null) || []
  for (const c of cannibalList) {
    if (isJunkQuery(c.term)) continue
    if (clearedTopics.has(c.term.toLowerCase())) continue
    const stem = cannibalTermStem(c.term)
    if (
      mergedClusterIds.has(cannibalClusterIdForTerm(c.term)) ||
      mergedStems.has(stem) ||
      mergedTerms.has(c.term.toLowerCase())
    ) continue
    items.push({
      id: `cannibal-${c.term}`,
      category: 'cannibal',
      title: `Consolidate: ${c.term}`,
      topic: c.term,
      source: 'Cannibal Watch',
      priority: 70,
      priorityTier: 'medium',
      signals: [`${(c.pages || []).length} competing pages target this term`],
      competingPages: Array.isArray(c.pages) ? c.pages : [],
    })
  }
  // Merge history
  for (const m of merges) {
    const termCount = Array.isArray(m.terms) ? m.terms.length : 0
    items.push({
      id: `merge-${m.clusterId}`,
      category: 'merge',
      title: `Merged cluster: ${m.stem}`,
      topic: m.stem,
      source: 'Merge History',
      priority: m.status === 'merged' ? 40 : 25,
      priorityTier: 'low',
      shipped: true,
      signals: [`${termCount} terms · ${m.redirectsCreated} redirects · ${m.status}`],
      mergeRecord: m,
    })
  }
  return items.sort((a, b) => b.priority - a.priority)
}

function WorkPlanTable({
  items, selectedIds, onToggleSelect, onSelectAll, onClearSelection, onSendToResearch, onResolveCannibal, onResolveAllCannibal, resolvingIds, resolvingAll, resolvedIds,
}: {
  items: WorkPlanItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onSendToResearch: (items: WorkPlanItem[]) => void
  onResolveCannibal: (item: WorkPlanItem) => void
  onResolveAllCannibal: () => void
  resolvingIds?: Set<string>
  resolvingAll?: boolean
  resolvedIds?: Set<string>
}) {
  const [filterCat, setFilterCat] = React.useState<WorkPlanCategory | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = React.useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [showShipped, setShowShipped] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const shippedCount = items.filter((i) => i.shipped).length
  const activeItems = items.filter((i) => {
    if (i.category === 'cannibal' && resolvedIds?.has(i.id)) return false
    if (i.shipped && !showShipped) return false
    return true
  })
  const withoutLedger = activeItems.filter((i) => i.category !== 'merge')
  const mergeLedger = items.filter((i) => i.category === 'merge')
  const categoryFiltered = filterCat === 'merge'
    ? mergeLedger
    : filterCat === 'all'
      ? withoutLedger
      : withoutLedger.filter((i) => i.category === filterCat)
  const filtered = [...(priorityFilter === 'all' ? categoryFiltered : categoryFiltered.filter((i) => i.priorityTier === priorityFilter))]
    .sort((a, b) => (b.priority - a.priority) || a.title.localeCompare(b.title))
  const smartCandidates = filtered.filter((i) => !i.shipped && i.category !== 'merge' && i.category !== 'cannibal' && i.priorityTier !== 'low').slice(0, 6)
  const allSelected = smartCandidates.length > 0 && smartCandidates.every((i) => selectedIds.has(i.id))
  const selectedItems = activeItems.filter((i) => selectedIds.has(i.id) && !i.shipped)
  const cannibalItems = activeItems.filter((i) => i.category === 'cannibal')
  const actionableItems = activeItems.filter((i) => !i.shipped && i.category !== 'merge')
  const sourceCount = new Set(activeItems.map((i) => i.source)).size
  const averagePriority = actionableItems.length
    ? Math.round(actionableItems.reduce((sum, item) => sum + Math.max(0, Math.min(100, Number(item.priority) || 0)), 0) / actionableItems.length)
    : 0
  const highPriority = actionableItems.filter((i) => i.priority >= 75).length
  const mediumPriority = actionableItems.filter((i) => i.priority >= 50 && i.priority < 75).length
  const lowPriority = actionableItems.filter((i) => i.priority < 50).length

  const CATS: Array<{ key: WorkPlanCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'gap', label: '🧩 Gaps' },
    { key: 'refresh', label: '🔄 Refresh' },
    { key: 'expansion', label: '📈 Expand' },
    { key: 'cannibal', label: '⚠️ Cannibal' },
    { key: 'merge', label: '🔀 Merges' },
    { key: 'backlink', label: '🔗 Backlinks' },
    { key: 'visibility', label: '◎ AEO Gaps' },
    { key: 'ubersuggest', label: '◇ Ubersuggest' },
  ]

  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Executive readout: answer "what did the engine find?" before showing rows. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', border: `1px solid ${E.hairline}`, background: E.inkBlack }}>
        {[
          { label: 'Open opportunities', value: actionableItems.length, detail: `${sourceCount} signal sources`, color: '#F8E7B0' },
          { label: 'High priority', value: highPriority, detail: `${mediumPriority} medium · ${lowPriority} low`, color: '#86EFAC' },
          { label: 'Cannibal risks', value: cannibalItems.length, detail: cannibalItems.length ? 'needs consolidation' : 'estate is clear', color: cannibalItems.length ? '#FCA5A5' : '#86EFAC' },
          { label: 'Portfolio score', value: actionableItems.length ? `${averagePriority}/100` : '—', detail: 'mean value score (not a count)', color: '#93C5FD' },
        ].map((metric, index) => (
          <div key={metric.label} style={{ padding: '16px 18px', borderRight: index < 3 ? '1px solid rgba(255,255,255,0.12)' : 'none' }}>
            <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.52)' }}>{metric.label}</div>
            <div style={{ marginTop: 5, fontFamily: C.serif, fontSize: 28, lineHeight: 1, fontWeight: 700, color: metric.color }}>{metric.value}</div>
            <div style={{ marginTop: 5, fontFamily: C.mono, fontSize: 8.5, color: 'rgba(255,255,255,0.58)' }}>{metric.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 9, color: E.goldDeep, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Engine recommendation stack</div>
          <div style={{ marginTop: 3, fontFamily: C.serif, fontSize: 14, color: E.inkSoft }}>Ranked by opportunity strength. Open a card to inspect the evidence behind the recommendation.</div>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim }}>{filtered.length} shown · {items.length} total</div>
      </div>

      {/* Filters are compact and secondary to the ranked recommendations. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${E.hairline}` }}>
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilterCat(c.key)}
            style={{
              padding: '6px 10px', borderRadius: 999, border: filterCat === c.key ? `1px solid ${E.inkBlack}` : `1px solid ${E.hairline}`,
              background: filterCat === c.key ? E.inkBlack : E.paper,
              color: filterCat === c.key ? E.ivory : E.inkMuted,
              fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: C.mono,
            }}
          >{c.label}</button>
        ))}
        <span style={{ width: 1, height: 22, background: E.hairline, margin: '0 3px' }} />
        {(['all', 'high', 'medium', 'low'] as const).map((tier) => (
          <button key={tier} type="button" onClick={() => setPriorityFilter(tier)}
            style={{
              padding: '6px 10px', borderRadius: 999,
              border: priorityFilter === tier ? `1px solid ${tier === 'high' ? E.green : tier === 'medium' ? E.orange : E.inkMuted}` : `1px solid ${E.hairline}`,
              background: priorityFilter === tier ? (tier === 'high' ? E.greenSoft : tier === 'medium' ? '#FFF7ED' : E.surface2) : E.paper,
              color: tier === 'high' ? E.green : tier === 'medium' ? E.orange : E.inkMuted,
              fontSize: 9, fontWeight: 800, cursor: 'pointer', fontFamily: C.mono, textTransform: 'uppercase',
            }}
          >{tier === 'all' ? 'All value tiers' : `${tier} value`}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onResolveAllCannibal}
            disabled={cannibalItems.length === 0 || resolvingAll}
            title={cannibalItems.length === 0 ? 'No cannibalization alerts to resolve' : 'Resolve every cannibal alert in one sweep (winner = highest impressions, 301 losers → winner)'}
            style={{
              padding: '5px 10px', borderRadius: 0, border: `1px solid ${E.red}`,
              background: resolvingAll ? E.redSoft : 'transparent', color: E.red,
              fontSize: 10, fontWeight: 700, fontFamily: C.mono, cursor: cannibalItems.length === 0 || resolvingAll ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', opacity: cannibalItems.length === 0 || resolvingAll ? 0.55 : 1,
            }}
          >
            {resolvingAll ? 'Resolving…' : `⚠ Resolve all${cannibalItems.length ? ` (${cannibalItems.length})` : ''}`}
          </button>
          {shippedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowShipped(!showShipped)}
              style={{
                padding: '5px 10px', borderRadius: 0, border: `1px solid ${E.green}`,
                background: showShipped ? E.greenSoft : 'transparent', color: E.green,
                fontSize: 10, fontWeight: 700, fontFamily: C.mono, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {showShipped ? `✓ Hide shipped (${shippedCount})` : `✓ Show shipped (${shippedCount})`}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, cursor: filtered.length ? 'pointer' : 'default' }}>
          <input type="checkbox" checked={allSelected} onChange={allSelected ? onClearSelection : () => onSelectAll(smartCandidates.map((i) => i.id))} disabled={!smartCandidates.length} style={{ cursor: 'pointer', accentColor: E.gold }} />
          {allSelected ? 'Clear smart selection' : `Smart-select highest value${smartCandidates.length ? ` (${smartCandidates.length})` : ''}`}
        </label>
        {selectedItems.length > 0 && <span style={{ fontFamily: C.mono, fontSize: 9.5, color: E.goldDeep, fontWeight: 800 }}>{selectedItems.length} queued for Research</span>}
      </div>

      {/* Ranked cards expose title, rationale and evidence without horizontal scanning. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '34px 24px', textAlign: 'center', color: E.inkMuted, background: E.cream, border: `1px dashed ${E.hairline}`, fontFamily: C.serif, fontStyle: 'italic', fontSize: 14 }}>
            No recommendations in this view. Run the Master Engine planner or choose another signal filter.
          </div>
        ) : (
          filtered.map((item, i) => {
            const cm = CATEGORY_META[item.category]
            const checked = selectedIds.has(item.id)
            const expanded = expandedIds.has(item.id)
            return (
              <div key={item.id} style={{
                display: 'flex', flexDirection: 'column', minHeight: 174,
                padding: 16, border: checked ? `1px solid ${E.gold}` : `1px solid ${E.hairline}`,
                borderTop: `3px solid ${item.shipped ? E.green : cm.fg}`,
                background: checked ? '#FFFDF5' : item.shipped ? 'rgba(236,253,245,0.55)' : E.paper,
                boxShadow: checked ? E.goldGlow : E.paperShadow,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                opacity: item.shipped ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={checked} onChange={() => onToggleSelect(item.id)}
                    style={{ cursor: 'pointer', accentColor: E.gold }} disabled={item.shipped} />
                  <span style={{
                    display: 'inline-block', padding: '3px 7px', borderRadius: 3,
                    fontSize: 8, fontWeight: 700, fontFamily: C.mono,
                    background: item.shipped ? '#DCFCE7' : cm.bg,
                    color: item.shipped ? '#166534' : cm.fg, whiteSpace: 'nowrap',
                  }}>{item.shipped ? '✓ SHIPPED' : `${cm.icon} ${cm.label}`}</span>
                  <span style={{
                    display: 'inline-block', padding: '3px 7px', borderRadius: 3,
                    fontSize: 8, fontWeight: 800, fontFamily: C.mono, textTransform: 'uppercase',
                    background: item.priorityTier === 'high' ? E.greenSoft : item.priorityTier === 'medium' ? '#FFF7ED' : E.surface2,
                    color: item.priorityTier === 'high' ? E.green : item.priorityTier === 'medium' ? E.orange : E.inkMuted,
                  }}>{item.priorityTier} value</span>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 0.9, fontWeight: 800, color: item.priority >= 70 ? E.green : item.priority >= 40 ? E.orange : E.inkMuted }}>{item.priority}</div>
                    <div style={{ marginTop: 4, fontFamily: C.mono, fontSize: 7.5, color: E.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>priority</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, minWidth: 0 }}>
                  <div style={{ fontFamily: C.serif, fontSize: 17, lineHeight: 1.18, fontWeight: 700, color: E.ink, textDecoration: item.shipped ? 'line-through' : 'none' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {item.source} · {item.play || item.category}{item.clusterSize ? ` · ${item.clusterSize} clustered queries` : ''}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: E.inkSoft }}>{item.signals[0] || 'Engine-ranked opportunity.'}</div>
                  {expanded && item.signals.slice(1).map((signal, signalIndex) => (
                    <div key={`${item.id}-signal-${signalIndex}`} style={{ marginTop: 5, paddingLeft: 11, borderLeft: `2px solid ${E.goldSoft}`, fontSize: 10.5, lineHeight: 1.4, color: E.inkMuted }}>↳ {signal}</div>
                  ))}
                  {expanded && item.keywords && item.keywords.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
                      {item.keywords.slice(0, 7).map((keyword) => <span key={keyword} style={{ padding: '3px 6px', background: E.surface2, border: `1px solid ${E.hairlineSoft}`, fontFamily: C.mono, fontSize: 8.5, color: E.inkMuted }}>{keyword}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 'auto', paddingTop: 14 }}>
                  {(item.signals.length > 1 || Boolean(item.keywords?.length)) && (
                    <button type="button" onClick={() => toggleExpanded(item.id)} style={{ ...actionGhostStyle(), padding: '4px 8px', fontSize: 8.5 }}>{expanded ? 'Less evidence' : `Evidence (${item.signals.length})`}</button>
                  )}
                  <div style={{ marginLeft: 'auto' }}>
                  {item.category === 'cannibal' ? (
                    resolvedIds?.has(item.id) ? (
                      <span
                        title="Cleared — merge completed or the cluster was dismissed as unresolvable"
                        style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 0, border: `1px solid ${E.green}`, background: E.greenSoft,
                          color: E.green, fontSize: 9, fontWeight: 700, fontFamily: C.mono, whiteSpace: 'nowrap',
                        }}
                      >
                        ✅ Resolved
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onResolveCannibal(item)}
                        disabled={resolvingIds?.has(item.id)}
                        title="Auto-resolve: winner = highest impressions, 301 losers → winner, retire losers at the source"
                        style={{
                          padding: '4px 10px', borderRadius: 0, border: `1px solid ${E.red}`, background: resolvingIds?.has(item.id) ? E.redSoft : 'transparent',
                          color: E.red, cursor: resolvingIds?.has(item.id) ? 'wait' : 'pointer', fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                          whiteSpace: 'nowrap', opacity: resolvingIds?.has(item.id) ? 0.6 : 1,
                        }}
                      >
                        {resolvingIds?.has(item.id) ? 'Resolving…' : '⚠ Resolve'}
                      </button>
                    )
                  ) : item.suggestion ? (
                    <button type="button" onClick={() => {
                      // Single-item quick apply
                      if (item.suggestion) {
                        // applyBrief is called from parent — we use onSendToResearch for single
                        onSendToResearch([item])
                      }
                    }}
                      style={{ padding: '4px 10px', borderRadius: 0, border: `1px solid ${E.gold}`, background: 'transparent', color: E.gold, cursor: 'pointer', fontSize: 9, fontWeight: 700, fontFamily: C.mono }}>
                      Build brief →
                    </button>
                  ) : (
                    <span style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono }}>—</span>
                  )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedItems.length > 0 && (
        <div style={{ position: 'sticky', bottom: 12, zIndex: 4, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: E.inkBlack, color: E.ivory, boxShadow: '0 12px 30px rgba(17,21,28,0.24)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F8E7B0' }}>{selectedItems.length} recommendation{selectedItems.length === 1 ? '' : 's'} selected</div>
            <div style={{ marginTop: 3, fontFamily: C.serif, fontSize: 12, color: 'rgba(255,255,255,0.66)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItems.map((item) => item.topic).join(' · ')}</div>
          </div>
          <button type="button" onClick={onClearSelection} style={{ ...actionGhostStyle(), color: E.ivory, borderColor: 'rgba(255,255,255,0.3)' }}>Clear</button>
          <button type="button" onClick={() => onSendToResearch(selectedItems)} style={{ ...actionBtnStyle('#F8E7B0'), background: '#F8E7B0', color: E.inkBlack }}>Send to Research →</button>
        </div>
      )}
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
          <div style={{ ...kickerStyleSm }}>Live evidence services</div>
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
  // Live-generation cancel: the admin can abort an in-flight draft instead of
  // watching the model overshoot the word budget. The server's try/finally
  // finalizes the job row (checkpointed → 'drafting' resumable, empty → failed)
  // when the client disconnect lands.
  const genAbortRef = React.useRef<AbortController | null>(null)
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
  const [aiProvider, setAiProvider] = React.useState(DEFAULT_DRAFT_PIN)
  const [reviewModel, setReviewModel] = React.useState(DEFAULT_REVIEW_PIN)
  const [title, setTitle] = React.useState('')
  const [topic, setTopic] = React.useState('')
  const [audience, setAudience] = React.useState('')
  const [keywords, setKeywords] = React.useState('')
  const [interlinkStage, setInterlinkStage] = React.useState('visa')
  const [showRadar, setShowRadar] = React.useState(true)
  const [selectedBrief, setSelectedBrief] = React.useState<AISuggestion | null>(null)
  const [aeoRemediations, setAeoRemediations] = React.useState<CitationRemediation[]>([])
  const [aeoOpenedQuery, setAeoOpenedQuery] = React.useState<string | null>(null)
  const briefPanelRef = React.useRef<{ submit: () => void }>(null)
  const [briefInterlinks, setBriefInterlinks] = React.useState<StudioInterlink[]>([])
  const [interlinkInventory, setInterlinkInventory] = React.useState<{ scanned: number; eligible: number; liveVerified: number } | null>(null)
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
  const [ga4Status, setGa4Status] = React.useState<{ connected?: boolean; propertyId?: string | null; lastError?: string | null } | null>(null)
  const [ga4PropertyInput, setGa4PropertyInput] = React.useState('')
  const [ga4Busy, setGa4Busy] = React.useState(false)
  const [ga4Notice, setGa4Notice] = React.useState<string | null>(null)
  const [uberStatus, setUberStatus] = React.useState<{
    connected?: boolean
    hasToken?: boolean
    hasRefresh?: boolean
    toolCount?: number
    lastError?: string | null
    creditsExhaustedUntil?: string | null
    mode?: 'oauth' | 'token' | null
    lastIntel?: { keywordCount?: number; toolsUsed?: string[]; layers?: string[]; pulledAt?: string } | null
  } | null>(null)
  const [uberTokenInput, setUberTokenInput] = React.useState('')
  const [uberShowToken, setUberShowToken] = React.useState(false)
  const [uberBusy, setUberBusy] = React.useState(false)
  const [uberNotice, setUberNotice] = React.useState<string | null>(null)

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
    ga4Connected?: boolean
    ubersuggestConnected?: boolean
    interlinkTotal: number
    interlinkActive: number
    lastSiteScan: string | null
    totalShipped: number
  } | null>(null)
  const [siteAuditBusy, setSiteAuditBusy] = React.useState(false)

  // Generation stream events
  const [generationEvents, setGenerationEvents] = React.useState<GenerationActivity[]>([])
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(null)
  const [triedProviders, setTriedProviders] = React.useState<string[]>([])
  // SSE text is kept outside parent state. DraftWorkspace samples this ref on
  // its own cadence, so the full studio/queue tree never re-renders per token.
  const generationBufRef = React.useRef('')
  const [generationReviewJob, setGenerationReviewJob] = React.useState<ContentJob | null>(null)
  const [generationJobId, setGenerationJobId] = React.useState(() => {
    if (typeof window === 'undefined') return ''
    try { return String(sessionStorage.getItem('yousafe.studio.liveDraftJobId') || '').trim() } catch { return '' }
  })
  const [keepDraftWorkspace, setKeepDraftWorkspace] = React.useState(() => Boolean(generationJobId))
  const [workspaceShipGate, setWorkspaceShipGate] = React.useState<ShipGate>(null)
  const [draftOperationsOpen, setDraftOperationsOpen] = React.useState(false)
  const [generationMergeBusy, setGenerationMergeBusy] = React.useState(false)
  // Depth-rescue (PASS 2) stats — expansion rounds, stalls, time budget, set
  // from the structured `rescue` SSE event and surfaced in the Draft queue.
  const [rescueStats, setRescueStats] = React.useState<DepthRescueStats | null>(null)

  // Merge index + merge history (Ship Ledger) + engine status + gates
  const [mergeIndex, setMergeIndex] = React.useState<{ byPath: Map<string, MergeUrlHit>; byStem: Map<string, MergeUrlHit> }>({ byPath: new Map(), byStem: new Map() })
  const [merges, setMerges] = React.useState<CannibalMergeRecord[]>([])
  const [engineStatus, setEngineStatus] = React.useState<Record<string, unknown> | null>(null)

  // Clear stale generation state when the selected job changes so the modal
  // does not hold onto large generationText / events / triedProviders in memory.
  React.useEffect(() => {
    setGenerationEvents([])
    setTriedProviders([])
    setRescueStats(null)
  }, [selectedJob?.id])
  const [gateByJob, setGateByJob] = React.useState<Map<string, { score: number; passed: boolean }>>(new Map())
  // Full re-audit result for the Review stage — includes blockers, warnings, annotations.
  // Populated by auto-gate-run when entering Review and by AdminInlineEditor re-audits.
  const [reviewAuditResult, setReviewAuditResult] = React.useState<{
    score: number; ok: boolean; blockers: number; warnings: number
    summary: string; annotations?: Array<{ code: string; severity: string; message: string; fix: string }>
    shipReady?: boolean | null
    depthGate?: { ok: boolean; message: string } | null
  } | null>(null)

  // Canonical per-job ship-gate book for the approve surfaces (Ready-to-Approve
  // rows, the Approve → merge handler, and queue bulk Approve). Only evidence
  // is ever a pass: a live re-audit of the selected job supersedes persisted
  // audit_json, and an unknown state is NOT a pass — the score never suffices.
  const shipGateBook = React.useMemo<ReadonlyMap<string, ShipGate>>(() => {
    const m = new Map<string, ShipGate>()
    for (const j of jobs) {
      const g = shipGateFromAuditPayload(j.audit_json ?? null)
      if (g !== null) m.set(j.id, g)
    }
    if (selectedJob && reviewAuditResult) {
      const g = shipGateFromResponse({
        shipReady: reviewAuditResult.shipReady,
        blockers: reviewAuditResult.blockers,
      })
      if (g !== null) m.set(selectedJob.id, g)
    }
    const liveId = generationReviewJob?.id || generationJobId
    if (liveId && workspaceShipGate) m.set(liveId, workspaceShipGate)
    return m
  }, [jobs, selectedJob, reviewAuditResult, generationReviewJob?.id, generationJobId, workspaceShipGate])

  // Ref to avoid stale closure in onScoreChange callbacks — always points to latest content.
  const latestJobContentRef = React.useRef(selectedJob?.content)
  latestJobContentRef.current = selectedJob?.content
  const [engineBusy, setEngineBusy] = React.useState(false)
  // Live SSE trace for the masthead engine actions (Ingest / Plan / LLM audit).
  const [engineTrace, setEngineTrace] = React.useState<Array<{ seq: number; phase: string; message: string; detail?: string; tone: string }>>([])
  const [engineAction, setEngineAction] = React.useState<string | null>(null)
  // Live telemetry clock — startedAt drives the elapsed counter, statusAt drives
  // the "synced" readout so the cells are never a silent mount-time snapshot.
  const [engineStartedAt, setEngineStartedAt] = React.useState<number | null>(null)
  const [engineStatusAt, setEngineStatusAt] = React.useState<number | null>(null)
  const [engineTick, setEngineTick] = React.useState(0)
  const engineStatusRefreshRef = React.useRef(0)
  const [deskLive, setDeskLive] = React.useState<DeskLiveState>('connecting')
  const [queueFocusJobId, setQueueFocusJobId] = React.useState<string | null>(null)
  const [autoInterlinkBusy, setAutoInterlinkBusy] = React.useState(false)
  // Work Plan — multi-select table for Discover stage

  // Bulk queue-selection — surfaces real actions against many jobs at once
  // (rerun, resume, clear queue, re-audit, refresh PR, abandon).
  const [selectedJobIds, setSelectedJobIds] = React.useState<Set<string>>(new Set())
  const [queueBulkBusy, setQueueBulkBusy] = React.useState(false)
  const [queueBulkAction, setQueueBulkAction] = React.useState<string | null>(null)
  const [queueBulkProgress, setQueueBulkProgress] = React.useState<{ done: number; total: number; failed: number } | null>(null)
  const [queueStatusFilter, setQueueStatusFilter] = React.useState<QueueUiFilter>('all')
  const queueStatusFilterRef = React.useRef<QueueUiFilter>('all')
  queueStatusFilterRef.current = queueStatusFilter
  const [jobMatched, setJobMatched] = React.useState(0)
  const [queueViewJobs, setQueueViewJobs] = React.useState<ContentJob[] | null>(null)
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
  // List payloads omit `content`, so Boolean(j.content) is always false on the
  // queue window. Unlock Approve from status / PR / table summary / the live
  // generation id — otherwise a just-merged job greys the stage out.
  const hasApproval =
    Boolean(generationJobId || generationReviewJob) ||
    (jobSummary?.pr_created ?? 0) > 0 ||
    (jobSummary?.merged ?? 0) > 0 ||
    jobs.some(
      (j) =>
        j.status === 'pr_created' ||
        j.status === 'merged' ||
        j.status === 'publishing' ||
        (Boolean(j.pr_url || j.pr_number) && j.status !== 'closed') ||
        (j.status === 'drafting' && (Number(j.word_count) || 0) >= 40),
    )
  const hasPublication = jobs.some(isPublishedJob)

  const stageAvailability = React.useMemo<Record<StudioTab, { available: boolean; reason: string }>>(() => ({
    discover: { available: true, reason: 'Discover is always the first stage — signals before strategy.' },
    research: { available: true, reason: 'Research keywords and build the brief — always accessible.' },
    // Draft & Review is unlocked by EITHER a ready brief (generate a new
    // draft) OR an existing job in the queue (review/repair prior work).
    // Gating solely on hasBriefReady made the stage unreachable whenever an
    // admin wanted to revisit previously drafted content without starting a
    // fresh brief first.
    draft: { available: hasBriefReady || hasDraft, reason: 'Complete the research brief, or open an existing draft from the queue to review.' },
    approve: { available: hasApproval, reason: 'A completed draft or open PR must exist before approval.' },
    configure: { available: true, reason: 'System configuration is always accessible.' },
    shop: { available: true, reason: 'Shop product blog pipeline — generate and manage product articles.' },
  }), [hasTopic, hasBriefReady, hasDraft, hasReviewableJob, hasApproval, hasPublication, generationJobId, generationReviewJob, jobSummary])

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

  const [clearedCannibalTopics, setClearedCannibalTopics] = React.useState<Set<string>>(new Set())
  const [uberOpps, setUberOpps] = React.useState<AISuggestion[]>([])
  const [uberOppsLoading, setUberOppsLoading] = React.useState(false)
  const [uberOppsMeta, setUberOppsMeta] = React.useState<{
    connected?: boolean
    source?: string
    lastError?: string | null
    lastIntel?: { keywordCount?: number; toolsUsed?: string[]; layers?: string[]; pulledAt?: string }
  }>({})

  const workPlanItems = React.useMemo(
    () => buildWorkPlan(radar, radarMeta, merges, clearedCannibalTopics, uberOpps),
    [radar, radarMeta, merges, clearedCannibalTopics, uberOpps],
  )

  const handleSendToResearch = React.useCallback((selected: WorkPlanItem[]) => {
    if (selected.length === 0) return
    const first = selected[0]
    // Populate research fields from the first selected item
    setTopic(first.topic)
    if (first.suggestion) {
      const extraKw = selected.slice(1).map((item) => item.topic).filter(Boolean)
      const keywords = [...new Set([...(first.suggestion.keywords || []), ...extraKw])].filter(Boolean)
      setTitle(first.suggestion.title)
      if (keywords.length) setKeywords(ensureKeywordFloors(keywords, first.topic).join(', '))
      if (first.suggestion.audience) setAudience(first.suggestion.audience)
      if (first.suggestion.contentType && !contentTypeTouched) setContentType(first.suggestion.contentType as ContentType)
      setSelectedBrief({ ...first.suggestion, keywords: keywords.length ? keywords : first.suggestion.keywords })
      setBriefInterlinks(first.suggestion.interlinks ?? [])
    } else {
      setTitle(first.title || first.topic)
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
  }, [selectTab, setActionNotice, radarMeta, contentTypeTouched])

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
      const res = await fetch(queueJobsListPath({ limit: 100, filter: 'all' }), { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 503) { setError('Server busy (503). Waiting before next refresh…'); return [] }
      const data = await res.json().catch(() => ({})) as { jobs?: ContentJob[]; total?: number; matched?: number; summary?: QueueSummary; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      let nextJobs = data.jobs ?? []
      try {
        const hotRes = await fetch('/api/content-studio/jobs?limit=80&status=drafting,pending,publishing,pr_created,merged,failed', { credentials: 'same-origin', cache: 'no-store' })
        const hot = await hotRes.json().catch(() => ({})) as { jobs?: ContentJob[] }
        if (hotRes.ok && Array.isArray(hot.jobs) && hot.jobs.length) {
          const seen = new Set(nextJobs.map((j) => j.id))
          nextJobs = [...hot.jobs.filter((j) => !seen.has(j.id)), ...nextJobs]
        }
      } catch { /* desk hydration is best-effort */ }
      setJobs(nextJobs)
      setJobTotal(typeof data.total === 'number' ? data.total : nextJobs.length)
      if (queueStatusFilterRef.current === 'all') {
        setJobMatched(typeof data.matched === 'number' ? data.matched : (typeof data.total === 'number' ? data.total : nextJobs.length))
      }
      setJobSummary(data.summary ?? null)
      setError(null)
      return nextJobs
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
      return []
    } finally { setLoading(false) }
  }, [])

  const fetchQueueView = React.useCallback(async (filter: QueueUiFilter, offset = 0, append = false) => {
    if (filter === 'all') {
      setQueueViewJobs(null)
      return
    }
    try {
      const res = await fetch(queueJobsListPath({ limit: 100, offset, filter }), { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 503) return
      const data = await res.json().catch(() => ({})) as { jobs?: ContentJob[]; total?: number; matched?: number; summary?: QueueSummary; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const next = data.jobs ?? []
      setQueueViewJobs((prev) => {
        if (!append || !prev) return next
        const seen = new Set(prev.map((j) => j.id))
        return [...prev, ...next.filter((j) => !seen.has(j.id))]
      })
      if (typeof data.total === 'number') setJobTotal(data.total)
      if (typeof data.matched === 'number') setJobMatched(data.matched)
      if (data.summary) setJobSummary(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filtered jobs')
    }
  }, [])

  React.useEffect(() => {
    setSelectedJobIds(new Set())
    if (queueStatusFilter === 'all') {
      setQueueViewJobs(null)
      setJobMatched(jobTotal)
      return
    }
    void fetchQueueView(queueStatusFilter, 0, false)
  }, [queueStatusFilter, fetchQueueView])

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

  // One-click cannibal resolution from the Work Plan: resolve the competing
  // pages (winner = highest impressions) and execute the merge — 301 losers →
  // winner, retire losers at the source, enrich the winner. The decision is
  // recorded to cannibal_merges and the Merge History panel refreshes so the
  // cluster shows as resolved. Mirrors ResearchLiveOperations' resolve flow.
  const [resolvingCannibalIds, setResolvingCannibalIds] = React.useState<Set<string>>(new Set())
  const [resolvingAllCannibal, setResolvingAllCannibal] = React.useState(false)
  const [resolvedCannibalIds, setResolvedCannibalIds] = React.useState<Set<string>>(new Set())

  // Shared merge call: returns a per-item outcome so the single-row Resolve
  // button and the Resolve-all sweep share identical behavior.
  const resolveOneCannibal = React.useCallback(async (item: WorkPlanItem): Promise<CannibalResolveOutcome> => {
    try {
      const urls = (item.competingPages || []).filter((u) => /^https?:\/\//i.test(u))
      const payload = urls.length >= 2
        ? { term: item.topic, winnerUrl: urls[0], loserUrls: urls.slice(1), mode: 'merge' as const }
        : { term: item.topic, mode: 'merge' as const }
      const res = await fetch('/api/seo-factory/cannibal-merge', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({})) as CannibalMergeResponseBody
      return classifyCannibalMergeResult({ ok: res.ok, status: res.status, body })
    } catch (err) {
      return { status: 'failed', detail: err instanceof Error ? err.message : 'unknown error' }
    }
  }, [])

  const handleResolveCannibal = React.useCallback(async (item: WorkPlanItem) => {
    setResolvingCannibalIds((prev) => new Set(prev).add(item.id))
    try {
      const r = await resolveOneCannibal(item)
      if (r.status === 'resolved' || r.status === 'skipped') {
        setResolvedCannibalIds((prev) => new Set(prev).add(item.id))
        setClearedCannibalTopics((prev) => new Set(prev).add(item.topic.toLowerCase()))
      }
      setActionNotice(r.status === 'failed' ? `Cannibal resolve failed: ${r.detail}` : r.status === 'skipped' ? `⚠ Cannibal cleared: ${r.detail}` : `⚠ Cannibal resolved: ${r.detail}`)
      void fetchMergeHistory()
    } finally {
      setResolvingCannibalIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }, [resolveOneCannibal, fetchMergeHistory, setActionNotice])

  // Resolve all cannibal alerts in one sweep: iterate rows sequentially (avoids
  // hammering GSC/GitHub), then report an aggregate notice + refresh Merge
  // History once.
  const handleResolveAllCannibal = React.useCallback(async () => {
    const cannibals = workPlanItems.filter((i) => i.category === 'cannibal')
    if (cannibals.length === 0 || resolvingAllCannibal) return
    setResolvingAllCannibal(true)
    setResolvingCannibalIds(new Set(cannibals.map((i) => i.id)))
    let resolved = 0
    let skipped = 0
    let failed = 0
    const failures: string[] = []
    const resolvedIds: string[] = []
    try {
      for (const item of cannibals) {
        const r = await resolveOneCannibal(item)
        if (r.status === 'resolved') { resolved += 1; resolvedIds.push(item.id) }
        else if (r.status === 'skipped') { skipped += 1; resolvedIds.push(item.id) }
        else { failed += 1; failures.push(`${item.topic}: ${r.detail}`) }
      }
      if (resolvedIds.length) {
        setResolvedCannibalIds((prev) => new Set([...prev, ...resolvedIds]))
        setClearedCannibalTopics((prev) => new Set([...prev, ...cannibals.filter((i) => resolvedIds.includes(i.id)).map((i) => i.topic.toLowerCase())]))
        setRadarMeta((prev) => {
          if (!prev) return prev
          const gone = new Set(cannibals.filter((i) => resolvedIds.includes(i.id)).map((i) => i.topic.toLowerCase()))
          const list = Array.isArray(prev.cannibalization) ? (prev.cannibalization as Array<{ term?: string }>) : []
          return { ...prev, cannibalization: list.filter((c) => !gone.has(String(c.term || '').toLowerCase())) }
        })
      }
      setActionNotice(formatCannibalSweepNotice({ resolved, skipped, failed, failures }))
      void fetchMergeHistory()
    } finally {
      setResolvingAllCannibal(false)
      setResolvingCannibalIds(new Set())
    }
  }, [workPlanItems, resolvingAllCannibal, resolveOneCannibal, fetchMergeHistory, setActionNotice])

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
        setRadarMeta({ source: data.source, coverage: data.coverageStats, cannibalization: data.cannibalization, region: data.region, snapshot: data.snapshot ?? null })
      } else {
        setSuggestionsError((data as { error?: string }).error ?? 'Failed to load suggestions')
      }
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Suggestion fetch failed')
    } finally { setSuggestionsLoading(false) }
  }, [])

  const fetchUberOpps = React.useCallback(async (refresh = false) => {
    setUberOppsLoading(true)
    try {
      const res = await fetch('/api/content-studio/ubersuggest/opportunities', {
        method: refresh ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: refresh ? { 'Content-Type': 'application/json' } : undefined,
        body: refresh ? JSON.stringify({ refresh: true }) : undefined,
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        connected?: boolean
        source?: string
        lastError?: string | null
        opportunities?: AISuggestion[]
        snapshot?: { toolsUsed?: string[]; keywordCount?: number; layers?: string[] } | null
      }
      if (!res.ok) {
        setUberOppsMeta({ connected: false, source: 'error', lastError: data.lastError || 'Ubersuggest opportunities failed' })
        return
      }
      setUberOpps(Array.isArray(data.opportunities) ? data.opportunities : [])
      setUberOppsMeta({
        connected: Boolean(data.connected),
        source: data.source,
        lastError: data.lastError || null,
        lastIntel: data.snapshot
          ? { keywordCount: data.snapshot.keywordCount, toolsUsed: data.snapshot.toolsUsed, layers: data.snapshot.layers as string[] | undefined, pulledAt: undefined }
          : undefined,
      })
      if (!refresh && data.connected && !(data.opportunities || []).length) {
        const live = await fetch('/api/content-studio/ubersuggest/opportunities', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: true }),
        })
        const liveData = await live.json().catch(() => ({})) as typeof data
        if (live.ok) {
          setUberOpps(Array.isArray(liveData.opportunities) ? liveData.opportunities : [])
          setUberOppsMeta({ connected: Boolean(liveData.connected), source: liveData.source, lastError: liveData.lastError || null })
        }
      }
    } catch (err) {
      setUberOppsMeta({ connected: false, source: 'error', lastError: err instanceof Error ? err.message : 'Ubersuggest opportunities failed' })
    } finally {
      setUberOppsLoading(false)
    }
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

  const loadGa4Status = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/ga4/status', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) {
        setGa4Status(data)
        if (data.propertyId) setGa4PropertyInput((prev) => prev || String(data.propertyId))
      }
    } catch { /* silent */ }
  }, [])

  const loadUberStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/ubersuggest/status', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setUberStatus(data)
    } catch { /* silent */ }
  }, [])

  React.useEffect(() => {
    void loadGa4Status()
    void loadUberStatus()
  }, [loadGa4Status, loadUberStatus])

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

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('uber_connected')
    const err = params.get('uber_error')
    if (!connected && !err) return
    if (connected === 'true') {
      setUberNotice('Ubersuggest MCP authorized — Discover will list market opportunities')
      void loadUberStatus()
      void loadSystemHealth()
      void fetchUberOpps(true)
    } else if (err) {
      setUberNotice(err)
    }
    params.delete('uber_connected')
    params.delete('uber_error')
    params.set('tab', 'configure')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
  }, [loadUberStatus, loadSystemHealth, fetchUberOpps])

  // Autopilot: one click applies the full brief — everything stays editable.
  const applyBrief = React.useCallback((s: AISuggestion) => {
    setTopic(s.topic)
    setKeywords(ensureKeywordFloors(s.keywords && s.keywords.length ? s.keywords : [s.primaryKeyword || s.topic], s.primaryKeyword || s.topic).join(', '))
    if (s.title) setTitle(s.title)
    if (s.audience) setAudience(s.audience)
    if (s.contentType && !contentTypeTouched) setContentType(s.contentType as ContentType)
    if (s.intent) setTone(TONE_FOR_INTENT[s.intent] ?? 'educational')
    setSelectedBrief(s)
    setBriefInterlinks(s.interlinks ?? [])
    setSuggestions(prev => [s, ...prev.filter(x => x.topic !== s.topic)])
    selectTab('research')
    setShowRadar(true)
  }, [contentTypeTouched, selectTab])

  const openAeoRemediation = React.useCallback(async (item: CitationRemediation, opts?: { openUrl?: boolean }) => {
    const brief = item.brief as unknown as AISuggestion
    applyBrief(brief)
    setAeoOpenedQuery(item.query)
    const hostCountry = countryFromUrl(item.match.url)
    if (hostCountry === 'US' || hostCountry === 'UK' || hostCountry === 'CA' || hostCountry === 'AU') {
      setRegion(hostCountry)
    }
    if (opts?.openUrl && item.match.url) {
      window.open(item.match.url, '_blank', 'noopener,noreferrer')
    }
    if (item.match.jobId) {
      try {
        const res = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(item.match.jobId)}`, { credentials: 'same-origin' })
        const data = await res.json().catch(() => ({})) as { job?: ContentJob }
        if (res.ok && data.job) {
          setSelectedJob(data.job)
          selectTab('draft')
          setActionNotice(`AEO retrofit · ${item.query} · existing job opened. Apply the four citation actions on this URL.`)
          return
        }
      } catch { /* brief is already loaded */ }
    }
    selectTab('research')
    setActionNotice(
      item.match.url
        ? `AEO retrofit · ${item.query} · brief prefilled for ${item.match.url}`
        : `AEO retrofit · ${item.query} · no live URL — draft one canonical`,
    )
  }, [applyBrief, selectTab, setActionNotice])

  const aeoDeepLinkRef = React.useRef(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || aeoDeepLinkRef.current) return
    const params = new URLSearchParams(window.location.search)
    const aeoId = params.get('aeo')
    if (!aeoId) return
    aeoDeepLinkRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/seo-engine/llm-visibility', { credentials: 'same-origin', cache: 'no-store' })
        const data = await res.json().catch(() => ({})) as { remediations?: CitationRemediation[]; audits?: Array<{ id?: string; remediation?: CitationRemediation }> }
        if (!res.ok || cancelled) return
        const list = Array.isArray(data.remediations) ? data.remediations : []
        setAeoRemediations(list)
        const hit = list.find((item) => item.id === aeoId)
          || data.audits?.find((row) => String(row.id) === aeoId)?.remediation
        if (hit) await openAeoRemediation(hit, { openUrl: true })
      } catch { /* deep-link is best-effort */ }
      if (cancelled) return
      params.delete('aeo')
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
    })()
    return () => { cancelled = true }
  }, [openAeoRemediation])

  React.useEffect(() => { fetchSuggestions('US') }, [fetchSuggestions])
  React.useEffect(() => { void fetchUberOpps(false) }, [fetchUberOpps])
  React.useEffect(() => { fetchJobs() }, [fetchJobs])

  const rememberLiveDraftJob = React.useCallback((id: string) => {
    const v = String(id || '').trim()
    if (!v) return
    setGenerationJobId(v)
    try { sessionStorage.setItem('yousafe.studio.liveDraftJobId', v) } catch { /* private mode */ }
  }, [])

  React.useEffect(() => {
    const saved = generationJobId
    if (!saved) return
    setKeepDraftWorkspace(true)
    void (async () => {
      try {
        const res = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(saved)}`, { credentials: 'same-origin' })
        const data = await res.json().catch(() => ({})) as { job?: ContentJob }
        if (!data.job) {
          setQueueStatusFilter('drafting')
          return
        }
        setQueueStatusFilter(queueFilterForJobStatus(data.job.status))
        setJobs((prev) => (prev.some((j) => j.id === data.job!.id) ? prev : [data.job!, ...prev]))
        setGenerationReviewJob(data.job)
      } catch { /* queue restore is best-effort */ }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { fetchMergeIndex(); void fetchMergeHistory() }, [fetchMergeIndex, fetchMergeHistory])

  // Engine surfaces — non-fatal
  const fetchEngineStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seo-engine/status', { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) {
        setDeskLive((prev) => (prev === 'live' ? prev : 'offline'))
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data.ok) {
        setEngineStatus(data)
        setEngineStatusAt(Date.now())
        setDeskLive((prev) => (prev === 'offline' ? 'poll' : prev === 'connecting' ? 'poll' : prev))
      } else {
        setDeskLive((prev) => (prev === 'live' ? prev : 'offline'))
      }
    } catch {
      setDeskLive((prev) => (prev === 'live' ? prev : 'offline'))
    }
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

  // 1s tick while an engine action runs — drives the elapsed clock and the
  // blinking "thinking" cursor so the instrument panel visibly advances.
  React.useEffect(() => {
    if (!engineBusy) return
    const id = setInterval(() => setEngineTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [engineBusy])

  // 10s status poll — the desk never sits on a 30s-old snapshot.
  React.useEffect(() => {
    const id = setInterval(() => { fetchEngineStatus() }, 10_000)
    return () => clearInterval(id)
  }, [fetchEngineStatus])

  // Realtime: any engine-table write refreshes the desk (debounced).
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    let subscribed = 0
    const kick = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => { void fetchEngineStatus() }, 350)
    }
    const onStatus = (status: string) => {
      if (status === 'SUBSCRIBED') {
        subscribed += 1
        setDeskLive('live')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setDeskLive((prev) => (prev === 'live' && subscribed > 0 ? prev : 'poll'))
      }
    }
    const fallback = window.setTimeout(() => {
      setDeskLive((prev) => (prev === 'connecting' ? 'poll' : prev))
    }, 4000)
    const off = subscribeToTables([
      'seo_knowledge',
      'seo_cluster_plans',
      'seo_interlinks',
      'seo_llm_visibility',
      'seo_gate_runs',
      'seo_engine_runs',
      'seo_ranking_scores',
    ], 'public', kick, onStatus)
    return () => {
      if (t) clearTimeout(t)
      window.clearTimeout(fallback)
      off()
    }
  }, [fetchEngineStatus])

  const engineElapsed = engineBusy && engineStartedAt ? Math.max(0, Math.floor((Date.now() - engineStartedAt) / 1000)) : 0

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
            region: selectedJob.region ?? undefined,
            requiredShortKeywords: selectedJob.required_short_keywords ?? undefined,
            requiredLongTailKeywords: selectedJob.required_long_tail_keywords ?? undefined,
            competingUrls: selectedJob.competing_urls ?? undefined,
            targetUrl: selectedJob.canonical_url ?? undefined,
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
  const [approveBusy, setApproveBusy] = React.useState(false)

  const runApproveAndMerge = React.useCallback(async (j: ContentJob): Promise<{ ok: boolean; message?: string; rhythmDetail?: { key: string; count: number } | null }> => {
    // Client-side currentGate guard: never ship a draft that has not cleared
    // the ship gate (shipReady === true && blockers === 0). Unknown = not ready.
    const liveId = generationReviewJob?.id || generationJobId
    const gate = shipGateBook.get(j.id)
      ?? (liveId && j.id === liveId ? workspaceShipGate : null)
      ?? shipGateFromAuditPayload(j.audit_json ?? null)
    if (!shipGateIsCleared(gate) && !shipGateIsCleared(workspaceShipGate)) {
      const message = 'Ship gate not cleared — re-audit the draft in the editor before Approve → main.'
      setActionNotice?.(message)
      return { ok: false, message }
    }
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
  }, [fetchJobs, setActionNotice, shipGateBook, generationReviewJob?.id, generationJobId, workspaceShipGate])

  // ── Merge an ALREADY-OPEN PR (pr_created) — no re-ship, no duplicate branch.
  // The Approve panel's PR rows use this; shipContent re-ships a fresh branch
  // which would strand the existing PR, so merge_pr is the correct path here.
  const runMergePr = React.useCallback(async (j: ContentJob): Promise<{ ok: boolean; message?: string }> => {
    try {
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: j.id, action: 'merge_pr' }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string }
      if (!response.ok) throw new Error(data.error || data.message || `Merge failed (HTTP ${response.status})`)
      const message = data.message || `PR #${j.pr_number ?? '?'} merged to main`
      setActionNotice?.(message)
      void fetchJobs().catch(() => { /* best-effort refresh */ })
      return { ok: true, message }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed'
      setActionNotice?.(message)
      return { ok: false, message }
    }
  }, [fetchJobs, setActionNotice])

  // ── Decline an open PR: closes it on GitHub + marks the job closed ──
  const runDeclinePr = React.useCallback(async (j: ContentJob): Promise<{ ok: boolean; message?: string }> => {
    try {
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: j.id, action: 'close_pr' }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string }
      if (!response.ok) throw new Error(data.error || data.message || `Close failed (HTTP ${response.status})`)
      const message = data.message || `PR #${j.pr_number ?? '?'} closed`
      setActionNotice?.(message)
      void fetchJobs().catch(() => { /* best-effort refresh */ })
      return { ok: true, message }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Close failed'
      setActionNotice?.(message)
      return { ok: false, message }
    }
  }, [fetchJobs, setActionNotice])

  // ── Rollback a merged/live change (Track stage) — revert the shipped file
  // to its pre-ship state via a PR→CI→merge.
  const runRevertJob = React.useCallback(async (j: ContentJob): Promise<{ ok: boolean; message?: string }> => {
    try {
      const response = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: j.id, action: 'revert', dryRun: false }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string; revert?: { action?: string; status?: string } }
      if (!response.ok) throw new Error(data.error || data.message || `Rollback failed (HTTP ${response.status})`)
      const message = data.message || (data.revert?.action === 'deleted' ? 'Rollback merged — page deleted' : 'Rollback merged — pre-ship content restored')
      setActionNotice?.(message)
      void fetchJobs().catch(() => { /* best-effort refresh */ })
      return { ok: true, message }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rollback failed'
      setActionNotice?.(message)
      return { ok: false, message }
    }
  }, [fetchJobs, setActionNotice])

  // ── Bulk queue actions: rerun, resume, clear queue, re-audit, refresh PR, abandon ──
  // The bulk_* POST handler accepts up to 25 ids per request; we chunk large
  // selections and surface a progress bar so the admin sees the work moving.
  const runBulkQueueAction = React.useCallback(async (kind: 'bulk_reaudit' | 'bulk_abandon' | 'bulk_approve' | 'bulk_monitor' | 'rerun_resume' | 'refresh_pr' | 'clear_drafts' | 'clear_stuck' | 'clear_failed' | 'bulk_delete') => {
    if (queueBulkBusy) return
    const isClearBucket = kind === 'clear_drafts' || kind === 'clear_stuck' || kind === 'clear_failed'
    let ids: string[] = isClearBucket ? [] : Array.from(selectedJobIds)
    // Bulk Approve never ships ungated drafts: only ids whose canonical ship
    // gate is present AND passes survive the filter. Everything else is left
    // for the editor's re-audit — no POST is even attempted when none pass.
    if (kind === 'bulk_approve') {
      const byId = new Map(jobs.map((j) => [j.id, j]))
      const gated = ids.filter((id) => {
        const j = byId.get(id)
        return shipGateIsCleared(shipGateBook.get(id) ?? shipGateFromAuditPayload(j?.audit_json ?? null))
      })
      if (gated.length === 0) {
        setActionNotice('None of the selected drafts have cleared the ship gate — re-audit them in the editor first.')
        return
      }
      if (gated.length < ids.length) {
        setActionNotice(`${gated.length} of ${ids.length} selected draft(s) cleared the ship gate. Skipping the rest — re-audit them in the editor first.`)
      }
      ids = gated
    }
    if (!ids.length && !isClearBucket) {
      setActionNotice('Select at least one job first.')
      return
    }
    // Destructive ops require a second click (toggle arming).
    if ((isClearBucket || kind === 'bulk_abandon' || kind === 'bulk_delete') && queueBulkConfirmArmed !== kind) {
      setQueueBulkConfirmArmed(kind)
      // Status-scoped clears act on the FULL bucket, not the 100-row window,
      // so the confirm count comes from the real table summary (jobSummary),
      // except 'stuck' which is a computed stale-row estimate.
      const bucketCount = kind === 'clear_drafts' ? (jobSummary?.pending ?? 0)
        : kind === 'clear_failed' ? (jobSummary?.failed ?? 0)
        : jobs.filter((j) => (j.status === 'drafting' || j.status === 'pending') && Date.now() - new Date(j.updated_at).getTime() > 30 * 60_000).length
      const n = isClearBucket ? bucketCount : ids.length
      const confirmCopy = isClearBucket
        ? queueClearConfirmCopy(kind as QueueClearAction, n)
        : kind === 'bulk_delete'
          ? queueDeleteConfirmCopy(n)
          : `Click again to confirm abandon on ${n} job(s).`
      setActionNotice(confirmCopy)
      return
    }
    setQueueBulkConfirmArmed(null)
    setQueueBulkBusy(true)
    setQueueBulkAction(kind)
    setQueueBulkProgress({ done: 0, total: isClearBucket ? 1 : ids.length, failed: 0 })
    try {
      let successCount = 0
      let failCount = 0
      let failReason = ''
      if (isClearBucket) {
        // Send NO ids so the route resolves the ENTIRE status bucket from the
        // DB. The in-memory `jobs` list is only the 100-row window; sending
        // window ids left the rest of the bucket uncleared (e.g. "Clear
        // failed" cleared 43 of 95, then 43 more re-appeared on refresh).
        const res = await fetch('/api/content-studio/jobs', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: kind, ids: [] }),
        })
        const data = await res.json().catch(() => ({})) as { ok?: boolean; processed?: number; message?: string; error?: string }
        if (res.ok && data.ok) {
          successCount += Number(data.processed || 0)
        } else {
          failCount++
          failReason = data.message || data.error || `HTTP ${res.status}`
        }
      } else {
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
              failReason = data.message || data.error || `HTTP ${res.status}`
              console.warn('[queue] bulk action failed', kind, data.error || res.status)
            }
          }
          setQueueBulkProgress((p) => p ? { done: Math.min(p.total, p.done + chunk.length), total: p.total, failed: failCount } : p)
        }
      }
      if (failCount && failReason) {
        setError(`${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')} failed: ${failReason}`)
      }
      setActionNotice(
        failCount
          ? `${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')}: ${successCount} ok, ${failCount} failed${failReason ? ` — ${failReason}` : ''}`
          : `${kind.replace('bulk_', '').replace('clear_', 'clear ').replace('_', ' ')}: ${successCount} job(s) processed`,
      )
      setSelectedJobIds(new Set())
      await fetchJobs()
      if (queueStatusFilterRef.current !== 'all') {
        await fetchQueueView(queueStatusFilterRef.current, 0, false)
      }
      await fetchGateRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} failed`)
    } finally {
      setQueueBulkBusy(false)
      setQueueBulkAction(null)
      setTimeout(() => setQueueBulkProgress(null), 1500)
    }
  }, [queueBulkBusy, queueBulkConfirmArmed, selectedJobIds, jobs, jobSummary, fetchJobs, fetchQueueView, fetchGateRuns, setActionNotice, setError, shipGateBook])

  const queueSelectionCounts = React.useMemo(() => {
    const counts = { pending: 0, drafting: 0, failed: 0, stuck: 0, total: 0 }
    for (const j of jobs) {
      counts.total++
      if (j.status === 'pending') counts.pending++
      if (j.status === 'drafting') counts.drafting++
      if (j.status === 'failed') counts.failed++
      // Stuck = idle >30min in drafting/pending (NOT every drafting job — that
      // would label actively-writing drafts as stuck and abandon them).
      if ((j.status === 'drafting' || j.status === 'pending') && Date.now() - new Date(j.updated_at).getTime() > 30 * 60_000) counts.stuck++
    }
    return counts
  }, [jobs])

  // Selected ids whose canonical ship gate is actually cleared — queue bulk
  // Approve only ever targets THIS set (see runBulkQueueAction's filter).
  const gatedApprovableIds = React.useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]))
    return new Set(Array.from(selectedJobIds).filter((id) => {
      const j = byId.get(id)
      return shipGateIsCleared(shipGateBook.get(id) ?? shipGateFromAuditPayload(j?.audit_json ?? null))
    }))
  }, [jobs, selectedJobIds, shipGateBook])

  const visibleQueueJobs = React.useMemo(() => {
    if (queueStatusFilter === 'all') return jobs
    if (queueStatusFilter === 'stuck') {
      const pool = queueViewJobs ?? jobs
      return pool.filter((j) => (j.status === 'drafting' || j.status === 'pending') && Date.now() - new Date(j.updated_at).getTime() > 30 * 60_000)
    }
    return queueViewJobs ?? jobs.filter((j) => j.status === queueStatusFilter)
  }, [jobs, queueStatusFilter, queueViewJobs])

  // Auto-interlink: Master Engine ontology + live estate registry/inventory.
  const runAutoInterlink = React.useCallback(async () => {
    if (!topic.trim()) return
    setAutoInterlinkBusy(true)
    setError(null)
    try {
      const country = ['US', 'UK', 'CA', 'AU'].includes(region) ? region : 'US'
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seo-page'
      const kwArr = keywords.split(',').map((s) => s.trim()).filter(Boolean)
      const [engineRes, estateRes] = await Promise.all([
        fetch('/api/seo-engine/interlink', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceSlug: slug,
            stage: interlinkStage,
            country,
            contentType,
            relatedTerms: kwArr.slice(0, 8),
          }),
        }),
        fetch('/api/content-studio/interlinks', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.trim(), keywords: kwArr, region: country, maxResults: 8 }),
        }),
      ])
      const engine = await engineRes.json().catch(() => ({})) as { ok?: boolean; error?: string; edges?: Array<Record<string, unknown>> }
      const estate = await estateRes.json().catch(() => ({})) as { suggestions?: Array<Record<string, unknown>>; inventory?: { scanned: number; eligible: number; liveVerified: number }; error?: string }
      if (!engineRes.ok && !estateRes.ok) {
        throw new Error(engine.error || estate.error || 'interlink failed')
      }
      const merged = mergeInterlinkLists(estate.suggestions, engine.edges).slice(0, 10)
      if (!merged.length) throw new Error('No live estate links found for this topic — try a clearer keyword or stage.')
      setBriefInterlinks(merged)
      setInterlinkInventory(estate.inventory || null)
      setActionNotice(`🔗 ${merged.length} cohesive interlink${merged.length === 1 ? '' : 's'} ready${estate.inventory?.scanned ? ` from ${estate.inventory.scanned} estate pages` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-interlink failed')
    } finally {
      setAutoInterlinkBusy(false)
    }
  }, [topic, region, interlinkStage, keywords, contentType, setActionNotice])

  // Page further into the queue — older jobs stay reachable beyond the window.
  const loadMoreJobs = React.useCallback(async () => {
    if (queueStatusFilter !== 'all') {
      const loaded = (queueViewJobs ?? []).length
      await fetchQueueView(queueStatusFilter, loaded, true)
      return
    }
    try {
      const res = await fetch(queueJobsListPath({ limit: 100, offset: jobs.length, filter: 'all' }), { credentials: 'same-origin' })
      if (res.status === 503) return
      const data = await res.json().catch(() => ({})) as { jobs?: ContentJob[]; total?: number; matched?: number; summary?: QueueSummary; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const more = data.jobs ?? []
      setJobs(prev => {
        const seen = new Set(prev.map(j => j.id))
        return [...prev, ...more.filter(j => !seen.has(j.id))]
      })
      if (typeof data.total === 'number') setJobTotal(data.total)
      if (typeof data.matched === 'number') setJobMatched(data.matched)
      if (data.summary) setJobSummary(data.summary)
    } catch { /* silent */ }
  }, [jobs.length, queueStatusFilter, queueViewJobs, fetchQueueView])

  // Poll active jobs — pause while a detail modal is open so the queue
  // refresh cannot freeze the dialog on a fat JSON parse.
  React.useEffect(() => {
    if (selectedJob || generating) return
    const hasActive = jobs.some(j => ['pending', 'drafting', 'publishing'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 6_000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs, selectedJob, generating])

  // Background jobs poll — 10s so the desk never sits on a 30s-old queue.
  React.useEffect(() => {
    if (selectedJob || generating) return
    const id = setInterval(fetchJobs, 10_000)
    return () => clearInterval(id)
  }, [fetchJobs, selectedJob, generating])

  // REAL-TIME: any content_jobs INSERT/UPDATE/DELETE refreshes the queue
  // instantly — a draft finishing or a PR landing shows up without a poll.
  React.useEffect(() => {
    const off = subscribeToTable('content_jobs', 'public', () => {
      if (selectedJob || generating) return
      fetchJobs()
    }, (status) => {
      if (status === 'SUBSCRIBED') setDeskLive('live')
    })
    return off
  }, [fetchJobs, selectedJob, generating])

  // Coming back to the tab must pull a fresh desk, not the last hidden snapshot.
  // Skip while a job modal is open — a queue refresh must never contend with
  // the dialog (or re-parse a fat payload on the main thread).
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (selectedJob || generating) return
      void fetchJobs()
      void fetchEngineStatus()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchJobs, fetchEngineStatus, selectedJob, generating])

  const handleGenerate = async (formData: any) => {
    setGenerating(true)
    setKeepDraftWorkspace(true)
    setDraftOperationsOpen(false)
    selectTab('draft') // Auto-navigate to Draft stage to watch the live stream
    setGenerationReviewJob(null)
    setError(null)
    setGenerationStartedAt(Date.now())
    generationBufRef.current = ''
    setRescueStats(null)
    setTriedProviders([])
    setGenerationEvents([{ id: `start-${Date.now()}`, ts: Date.now(), stage: 'connect', message: 'Connecting to the SEO generation pipeline…', level: 'info' }])

    const record = (stage: string, message: string, level: GenerationActivity['level'] = 'info') => {
      setGenerationEvents((prev) => {
        const last = prev[prev.length - 1]
        if (last?.stage === stage && last.message === message && last.level === level) return prev
        return [...prev, { id: `${Date.now()}-${prev.length}`, ts: Date.now(), stage, message, level }].slice(-32)
      })
    }

    try {
      const contentTypeMap: Record<string, string> = {
        blog_post: 'blog_post', article: 'legal_guide', legal: 'legal_guide', marketplace_gig: 'blog_post', gig: 'blog_post',
        regional_page: 'regional_page', regional_from: 'regional_from',
        regional_university: 'regional_university', blog_summary: 'blog_summary',
        legal_guide: 'legal_guide',
      }
      const rawType = String(formData.contentType || formData.content_type || '').trim()
      const ct = contentTypeMap[rawType] || rawType || 'legal_guide'
      const regionArg = formData.region || 'US'

      let claimedId = ''
      try {
        const claimRes = await fetch('/api/content-studio/jobs', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'claim_drafting',
            title: formData.title || formData.topic,
            topic: formData.topic,
            contentType: ct,
            region: regionArg,
            primaryKeyword: formData.topic || (formData.keywords && formData.keywords[0]),
          }),
        })
        const claimData = await claimRes.json().catch(() => ({})) as { jobId?: string }
        claimedId = String(claimData.jobId || '').trim()
      } catch { /* stream still creates a row if this claim fails */ }
      if (claimedId) {
        rememberLiveDraftJob(claimedId)
        setQueueStatusFilter('drafting')
        const nowIso = new Date().toISOString()
        const stub = {
          id: claimedId,
          title: String(formData.title || formData.topic || 'Untitled draft'),
          topic: String(formData.topic || formData.title || ''),
          content_type: (ct === 'legal_guide' ? 'article' : ct) as ContentJob['content_type'],
          tone: (formData.tone || 'educational') as ContentJob['tone'],
          region: regionArg as ContentJob['region'],
          target_repo: '',
          status: 'drafting' as const,
          source_job_id: null,
          slug: null,
          content: null,
          branch_name: null,
          content_path: null,
          pr_url: null,
          pr_number: null,
          merged_at: null,
          closed_at: null,
          error_message: null,
          ai_provider: null,
          word_count: 0,
          seo_score: null,
          created_at: nowIso,
          updated_at: nowIso,
        }
        setJobs((prev) => (prev.some((j) => j.id === claimedId) ? prev : [stub, ...prev]))
        void fetchJobs().catch(() => {})
      }

const controller = new AbortController()
      genAbortRef.current = controller
      const res = await fetch('/api/seo-factory/generate-stream', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: controller.signal,
        body: JSON.stringify({
          topic: formData.topic, title: formData.title || formData.topic,
          primaryKeyword: formData.topic || (formData.keywords && formData.keywords[0]),
          region: regionArg, contentType: ct,
          tone: formData.tone || 'educational', audience: formData.audience,
          keywords: formData.keywords, shipMode: 'pr', indexable: true,
          minAuditScore: 55, maxRefine: 3,
          interlinks: briefInterlinks,
          opportunity: selectedBrief,
          aiProvider: formData.aiProvider || undefined,
          intelligenceLineage: formData.intelligenceLineage
            ? { ...formData.intelligenceLineage, seoBrief: formData.seoIntelBrief ?? null }
            : formData.seoIntelBrief ? { seoBrief: formData.seoIntelBrief } : null,
          // SEO Intelligence writer contract from Brief Assembly — the drafting
          // model receives it as the brief (writeHint in the streaming pipeline).
          seoBriefContract: formData.seoBriefContract || undefined,
          modelGuidance: selectedBrief?.ranking
            ? {
                total: selectedBrief.ranking.total,
                confidence: selectedBrief.ranking.confidence,
                recommendedActions: selectedBrief.ranking.recommendedActions,
                forecast: selectedBrief.ranking.forecast,
              }
            : undefined,
          // Brief Assembly Panel fields — the full template
          h2Outline: formData.h2Outline || undefined,
          sources: formData.sources || undefined,
          minWords: formData.minWords || undefined,
          maxWords: formData.maxWords || undefined,
          targetSlug: formData.targetSlug || undefined,
          sectionBudgets: formData.sectionBudgets || undefined,
        kwH2Map: formData.kwH2Map || undefined,
        competingUrls: competingUrls.length ? competingUrls : undefined,
        existingJobId: claimedId || undefined,
      }),
      })
      let streamChars = 0
      // Attempt-boundary tracker: deltas of a NEW attempt must REPLACE the
      // live buffer, not append onto the previous attempt's text. Without
      // this, a refine pass that rewrites from zero glued draft+revision
      // into the operator's live document (the NCLEX double-copy view).
      let lastDeltaAttempt: number | undefined = undefined
      // Early 'drafting' job row created by the pipeline — lets the Draft queue
      // show '1 In Progress' in realtime while the AI writes, before the final row.
      let liveJobId = ''
      const data = await consumeSseResponse(res, (event: any) => {
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
          if (liveJobId) rememberLiveDraftJob(liveJobId)
          setQueueStatusFilter('drafting')
          fetchJobs().catch(() => {})
        }
        else if (event.type === 'attempt') record('audit', `Attempt ${event.attempt}: score ${event.score ?? '—'} · ${event.wordCount ?? 0} words${event.goodEnough ? ' · quality threshold met' : ''}`, event.goodEnough ? 'success' : 'info')
        else if (event.type === 'rescue') {
          const s = event.stats
          setRescueStats(s)
          record('refine', `Depth rescue complete · ${s.expandPasses} expand/append pass${s.expandPasses === 1 ? '' : 'es'}${s.stallCount > 0 ? ` · ${s.stallCount} stall${s.stallCount === 1 ? '' : 's'}` : ''} · ${fmtDur(s.timeMs)} used`, s.stallCount > 0 ? 'warn' : 'success')
        }
        else if (event.type === 'delta') {
          const at = typeof event.attempt === 'number' ? event.attempt : undefined
          if (at !== undefined && lastDeltaAttempt !== undefined && at !== lastDeltaAttempt) {
            // New writing pass restarts from zero — replace, never glue.
            generationBufRef.current = String(event.text || '')
          } else {
            // Buffer only — the 400ms flush interval owns the state updates.
            generationBufRef.current += String(event.text || '')
          }
          if (at !== undefined) lastDeltaAttempt = at
          streamChars = generationBufRef.current.length
        } else if (event.type === 'ship') record('ship', event.ship?.prUrl ? `Pull request opened · audit passed` : event.shipError ? `Ship paused: ${event.shipError}` : 'Draft audited; preparing delivery', event.shipError ? 'warn' : 'info')
        else if (event.type === 'final') {
          record('complete', event.result?.ship?.prUrl ? 'PR opened. The job is now ready for review.' : 'Generation complete. Job details are being refreshed.', 'success')
        }
      })
      const generatedJobId = String(data.jobId || data.job?.id || data.ship?.jobId || liveJobId || '')
      if (generatedJobId) rememberLiveDraftJob(generatedJobId)
      const shipBlocked = Boolean(data.shipError)
      const notice = data.ship?.prUrl
        ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError
          ? /resume from checkpoint|budget exhausted/i.test(String(data.shipError))
            ? 'Checkpoint saved · continue the draft to complete its audit before shipping'
            : `Generated (audit ${data.audit?.score ?? '—'}) but ship paused: ${data.shipError}`
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
        if (reviewJob) {
          setJobs((prev) => {
            const rest = prev.filter((j) => j.id !== reviewJob!.id)
            return [reviewJob!, ...rest]
          })
          setQueueStatusFilter(queueFilterForJobStatus(reviewJob.status))
        } else {
          setQueueStatusFilter(data.ship?.prUrl ? 'pr_created' : 'drafting')
        }
      }
      await fetchGateRuns()
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'AbortError'
      const message = cancelled ? 'Generation cancelled — the checkpointed draft (if any) is safe to continue.' : describeGenerationFailure(err)
      record('error', message, 'error')
      if (!cancelled) {
        setError(message)
        setActionNotice(`Content generation failed — ${message}`)
      } else {
        setActionNotice('Generation cancelled. The AI stopped immediately; any checkpointed draft stays in the queue.')
      }
      fetchJobs().catch(() => {})
    } finally {
      genAbortRef.current = null
      setGenerating(false)
    }
  }

  /** Cancel the in-flight generation stream (server finalizes the job row). */
  const cancelGeneration = React.useCallback(() => {
    genAbortRef.current?.abort()
  }, [])

  const runEngineAction = async (kind: 'plan' | 'llm' | 'ingest') => {
    setEngineBusy(true)
    setError(null)
    setEngineAction(kind)
    setEngineStartedAt(Date.now())
    engineStatusRefreshRef.current = 0
    // Immediate feedback — render the feed the instant the click lands, even
    // before the first SSE frame arrives, so a busy button is never silent.
    setEngineTrace([{ seq: -1, phase: 'connect', message: 'Connecting to engine stream…', tone: 'info' }])
    const controller = new AbortController()
    const timeoutMs = kind === 'ingest' || kind === 'llm' ? 180_000 : 90_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch('/api/seo-engine/action-stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          kind,
          limit: kind === 'plan' ? 20 : 10,
          draftBriefs: false,
          maxAudits: kind === 'llm' ? 4 : 6,
          limitPerSource: 8,
          maxAiItems: 0,
          aiSummarize: false,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `Engine action returned ${res.status}`)
      }
      let summary: string | null = null
      await consumeSseStream(res.body, (ev) => {
        if (ev.type === 'progress' && ev.step) {
          const s = ev.step as { seq: number; phase: string; message: string; detail?: string; tone: string }
          setEngineTrace((prev) => [...prev, s])
          // Live-refresh the signal cells as the action persists rows (throttled
          // to ~2s) so the intel/plans/links counts tick upward in real time.
          const now = Date.now()
          if (now - engineStatusRefreshRef.current > 2000) {
            engineStatusRefreshRef.current = now
            void fetchEngineStatus()
          }
        } else if (ev.type === 'done') {
          summary = String((ev as { summary?: string }).summary || 'Engine action complete')
          if (kind === 'llm') {
            const rem = (ev as { result?: { remediations?: CitationRemediation[] } }).result?.remediations
            if (Array.isArray(rem)) {
              setAeoRemediations(rem)
              if (rem[0]) void openAeoRemediation(rem[0], { openUrl: true })
            }
          }
        } else if (ev.type === 'error') {
          throw new Error(String(ev.error || 'Engine action failed'))
        }
      })
      if (!summary && kind === 'ingest') {
        setEngineTrace((prev) => [...prev, { seq: 9000, phase: 'fallback', message: 'Stream ended before done — finishing ingest without live tape…', tone: 'warn' }])
        const fb = await fetch('/api/seo-engine/knowledge', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limitPerSource: 8, maxAiItems: 0, aiSummarize: false }),
        })
        const fbData = await fb.json().catch(() => ({})) as { itemsStored?: number; sourcesRun?: number; error?: string }
        if (!fb.ok) throw new Error(fbData.error || 'Knowledge ingest fallback failed')
        summary = `Ingested ${fbData.itemsStored ?? 0} items from ${fbData.sourcesRun ?? 0} sources`
        setEngineTrace((prev) => [...prev, { seq: 9001, phase: 'done', message: summary || 'Ingest complete', tone: 'ok' }])
      }
      if (summary) setActionNotice(summary)
      await fetchEngineStatus()
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'AbortError'
      const timeoutHint = kind === 'ingest'
        ? 'hung feeds were skipped'
        : kind === 'plan'
          ? 'failed feeders were skipped'
          : 'the audit was aborted'
      const message = timedOut
        ? `${kind} timed out after ${Math.round(timeoutMs / 1000)}s — ${timeoutHint}`
        : e instanceof Error ? e.message : `${kind} failed`
      setEngineTrace((prev) => [...prev, { seq: 9999, phase: timedOut ? 'timeout' : 'error', message, tone: 'warn' }])
      setError(message)
    } finally {
      clearTimeout(timeout)
      setEngineBusy(false)
      setEngineStartedAt(null)
      void fetchEngineStatus()
    }
  }

  const engGatePass = Number((engineStatus as { gate?: { passRate?: number } } | null)?.gate?.passRate)

  // Pipeline taxonomy. Each tab routes to a distinct stage.
  // Shop SEO ('shop') stays a StudioStage so ?tab=shop deep links still
  // resolve, but its tab is OMITTED from the live nav until it can ship
  // content through the canal (product blog pipeline has no shipContent).
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
        position: 'relative',
        marginBottom: 18, padding: '22px 26px 20px',
        background: `linear-gradient(135deg, ${E.ivory} 0%, ${E.parchment} 100%)`,
        border: `1px solid ${E.hairline}`,
        borderBottom: `2px solid ${E.gold}`,
        boxShadow: E.panelShadow,
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
      }}>
        <GoldRule offset={26} />
        <div>
          <div style={{ ...kickerStyleSm, marginBottom: 7 }}>
            THE CONTENT STUDIO · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={{ ...TYPE.display, fontSize: 30, margin: 0, color: E.inkBlack }}>
            One Pipeline, End‑to‑End.
          </h1>
          <p style={{ ...TYPE.byline, margin: '6px 0 0', color: E.inkSoft, fontStyle: 'italic' }}>
            From SEO Master Engine ingestion to a live, verifiable URL — every step tracked, every PR stamped.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', minWidth: 200 }}>
          <span style={{ ...TYPE.microFig, color: E.goldDeep }}>VOL · I · NO · {String(Math.max(1, jobs.length + merges.length)).padStart(3, '0')}</span>
          <span style={{ ...TYPE.microFig, color: engineBusy ? E.blue : E.inkDim }}>{engineBusy ? `ENGINE · ${(ENGINE_ACTION_LABEL[engineAction ?? 'ingest'] || 'running').toUpperCase()}` : Number.isFinite(engGatePass) && engGatePass > 0 ? `${engGatePass}% GATE PASS` : deskLive === 'live' ? 'ENGINE · LIVE' : 'ENGINE · IDLE'}</span>
          <button type="button" onClick={async () => {
            if (loading) return
            setError(null)
            try {
              await Promise.allSettled([
                fetchJobs(),
                fetchMergeIndex(),
                fetchMergeHistory(),
                fetchGateRuns(),
                fetchEngineStatus(),
              ])
              setLastRefreshAt(Date.now())
              setActionNotice(null)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Refresh failed'
              setError(msg)
              setActionNotice(`Refresh failed — ${msg}`)
            }
          }} disabled={loading} style={{
            marginTop: 6, padding: '8px 18px', borderRadius: E.radiusXs,
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

      <StudioLiveDesk
        summary={jobSummary}
        jobs={jobs}
        generating={generating}
        engine={engineStatus}
        engineAt={engineStatusAt}
        engineBusy={engineBusy}
        engineAction={engineAction}
        engineElapsed={engineElapsed}
        engineTrace={engineTrace}
        liveState={deskLive}
        onIngest={() => void runEngineAction('ingest')}
        onPlan={() => void runEngineAction('plan')}
        onLlm={() => void runEngineAction('llm')}
        onOpenJob={(job) => { setSelectedJob(job); selectTab('draft') }}
        onFilterQueue={(status) => { setQueueStatusFilter(asQueueUiFilter(status)); selectTab('draft') }}
        onRefresh={() => { void fetchJobs(); void fetchEngineStatus() }}
      />

      <AeoRemediationQueue
        items={aeoRemediations}
        autoOpenedQuery={aeoOpenedQuery}
        onOpen={(item) => void openAeoRemediation(item, { openUrl: true })}
      />

      <StudioStageNav
        tabs={TABS}
        active={tab}
        availability={stageAvailability}
        onSelect={selectTab}
      />
      {/* ══════════ IV · DRAFT ══════════ */}
      {/* Stage IV — generate content: the live stream, editor surface,
          jobs clock, and queue stats. Downstream of Discover → Research → Plan. */}
      {tab === 'draft' && !generating && (
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
      {(tab === 'draft' || generating || keepDraftWorkspace || Boolean(generationReviewJob || generationJobId)) && (
        <div id="studio-panel-draft" role="tabpanel" aria-labelledby="studio-tab-draft" hidden={tab !== 'draft'} style={{ marginBottom: 14, display: tab === 'draft' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
          {/* ── Draft workspace — inline editor with live streaming ── */}            <DraftWorkspace
              studioRegion={region}
              studioContentType={contentType}
              generating={generating}
              generationEvents={generationEvents}
              generationStartedAt={generationStartedAt}
              generationBuffer={generationBufRef}
              rescueStats={rescueStats}
              triedProviders={triedProviders}
              completedJob={generationReviewJob}
            selectedJob={selectedJob}
            generationJobId={generationJobId}
            approving={approveBusy}
            onJobAttached={(id) => {
              rememberLiveDraftJob(id)
              setQueueStatusFilter('drafting')
              void fetchJobs().catch(() => {})
            }}
            setSelectedJob={setSelectedJob}
            onShipReadyChange={setWorkspaceShipGate}
            onApprove={(jobId) => {
              void (async () => {
                const id = String(jobId || generationJobId || generationReviewJob?.id || '').trim()
                if (!id) {
                  setActionNotice('Approve needs a saved job — wait for the queue row, then try again.')
                  setError('Approve needs a saved job — wait for the queue row, then try again.')
                  return
                }
                setApproveBusy(true)
                try {
                  let j = generationReviewJob?.id === id ? generationReviewJob : jobs.find((x) => x.id === id) || null
                  if (!j) {
                    const detailResponse = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
                    const detailData = await detailResponse.json().catch(() => ({})) as { job?: ContentJob }
                    j = detailResponse.ok ? detailData.job || null : null
                  }
                  if (!j) {
                    setActionNotice(`Job ${id.slice(0, 8)}… is not in the queue yet — refresh Jobs, then Approve.`)
                    return
                  }
                  if (j.status === 'pr_created' && j.pr_number) {
                    const merged = await runMergePr(j)
                    if (merged.ok) {
                      setQueueStatusFilter('merged')
                      selectTab('approve')
                    }
                    return
                  }
                  const shipped = await runApproveAndMerge(j)
                  if (shipped.ok) {
                    setQueueStatusFilter('merged')
                    selectTab('approve')
                  }
                } finally {
                  setApproveBusy(false)
                }
              })()
            }}
            onContinueToReview={() => {
              if (generationReviewJob) setSelectedJob(generationReviewJob)
              setDraftOperationsOpen(true)
              window.setTimeout(() => document.getElementById('studio-panel-draft-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            }}
            selectTab={selectTab}
            queueOpen={draftOperationsOpen}
            onToggleQueue={() => setDraftOperationsOpen((open) => !open)}
            queueCount={jobTotal || jobs.length}
            onCancelGeneration={cancelGeneration}
            error={error}
            setError={setError}
          />
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
      <div id="studio-panel-research" role="tabpanel" aria-labelledby="studio-tab-research" hidden={tab !== 'research'} style={{ marginBottom: 14, display: tab === 'research' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
          {/* GSC live probe banner — snapshot-vs-live is obvious before generating */}
          {gscStatus && !(gscStatus.connected && gscStatus.live) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '9px 14px', borderRadius: C.radiusSm, border: '1px solid #FDE68A', background: '#FFFBEB', fontSize: 11.5, flexWrap: 'wrap' }}>
              {gscStatus.connected && (gscStatus.mode === 'oauth' || gscStatus.mode === 'service_account') && (
                <span title={gscStatus.mode === 'oauth' ? 'Google OAuth consent flow' : 'Pasted service-account key'} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, fontFamily: C.mono, background: gscStatus.mode === 'oauth' ? '#EEF2FF' : '#ECFDF5', color: gscStatus.mode === 'oauth' ? '#3730A3' : '#166534', border: `1px solid ${gscStatus.mode === 'oauth' ? '#C7D2FE' : '#A7F3D0'}` }}>
                  {gscStatus.mode === 'oauth' ? 'OAUTH' : 'SERVICE_ACCOUNT'}
                </span>
              )}
              {gscStatus.connected && gscStatus.error ? (
                <span style={{ color: '#92400E', flex: 1, minWidth: 200, lineHeight: 1.45 }}>
                  <strong>GSC token is failing</strong> — {String(gscStatus.error || 'refresh failed')}. Autopilot stays on snapshot data until it's fixed.
                </span>
              ) : gscStatus.connected ? (
                <span style={{ color: '#92400E', flex: 1, minWidth: 200, lineHeight: 1.45 }}>
                  <strong>GSC is connected but not serving live data</strong> — suggestions are scored from the committed snapshot{(() => {
                    const raw = (radarMeta?.snapshot as { generatedAt?: string } | null)?.generatedAt
                    const d = raw ? new Date(raw) : null
                    return radarMeta?.source === 'snapshot' && d && !Number.isNaN(d.getTime())
                      ? ` (${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`
                      : ''
                  })()}.
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
              onOwnerModelChange={setReviewModel}
              title={title} setTitle={setTitle}
              topic={topic} setTopic={setTopic}
              audience={audience} setAudience={setAudience}
              keywords={keywords} setKeywords={setKeywords}
              suggestions={suggestions}
              gscStatus={gscStatus}
              brief={selectedBrief}
              onClearBrief={() => { setSelectedBrief(null); setBriefInterlinks([]); setInterlinkInventory(null) }}
              briefInterlinks={briefInterlinks}
              onBriefInterlinksChange={setBriefInterlinks}
              interlinkInventory={interlinkInventory}
              interlinkStage={interlinkStage} setInterlinkStage={setInterlinkStage}
              onAutoInterlink={runAutoInterlink}
              autoInterlinkBusy={autoInterlinkBusy}
              selectedBrief={selectedBrief}
              setActionNotice={setActionNotice}
              radarMeta={radarMeta}
              competingUrls={competingUrls}
            />

        </div>

      {tab === 'draft' && !generating && draftOperationsOpen && (
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
                disabled={queueBulkBusy || !selectedJobIds.size || gatedApprovableIds.size === 0}
                style={queueBulkAction === 'bulk_approve' ? actionDisabledStyle(E.mossGreen) : actionBtnStyle(E.mossGreen)}
                title={
                  gatedApprovableIds.size < selectedJobIds.size
                    ? `Approve only drafts that cleared the ship gate (${gatedApprovableIds.size} of ${selectedJobIds.size} selected) — re-audit the rest first`
                    : 'Approve selected drafts that cleared the ship gate (push PRs to main)'
                }
              >
                {queueBulkAction === 'bulk_approve' ? '⏳ Approving…' : `✅ Approve (${gatedApprovableIds.size || 0})`}
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
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('bulk_delete') }}
                disabled={queueBulkBusy || !selectedJobIds.size}
                style={queueBulkAction === 'bulk_delete' || queueBulkConfirmArmed === 'bulk_delete' ? actionDisabledStyle(E.ember) : actionBtnStyle(E.ember)}
                title={queueBulkConfirmArmed === 'bulk_delete' ? `Click again to permanently delete ${selectedJobIds.size} selected job(s)` : 'Permanently delete selected jobs from the queue'}
              >
                {queueBulkAction === 'bulk_delete'
                  ? '⏳ Deleting…'
                  : queueBulkConfirmArmed === 'bulk_delete'
                    ? `⚠ Confirm delete (${selectedJobIds.size})`
                    : `⌫ Delete (${selectedJobIds.size || 0})`}
              </button>
              <span style={{ width: 1, height: 22, background: E.hairline, margin: '0 4px' }} />
              {/* Status-filter clear buttons (act on the visible bucket, not selection) */}
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_drafts') }}
                disabled={queueBulkBusy || (jobSummary?.pending ?? 0) === 0}
                style={queueBulkConfirmArmed === 'clear_drafts' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_drafts' ? `Click again to confirm clearing all ${jobSummary?.pending ?? 0} queued drafts` : `Clear all ${jobSummary?.pending ?? 0} pending drafts`}
              >
                {queueBulkConfirmArmed === 'clear_drafts'
                  ? `⚠ Confirm clear queue (${jobSummary?.pending ?? 0})`
                  : `🧹 Clear queue (${jobSummary?.pending ?? 0})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_stuck') }}
                disabled={queueBulkBusy || queueSelectionCounts.stuck === 0}
                style={queueBulkConfirmArmed === 'clear_stuck' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_stuck' ? `Click again to confirm abandoning ${queueSelectionCounts.stuck} stuck jobs` : `Abandon ${queueSelectionCounts.stuck} stuck jobs (>30min in drafting/pending)`}
              >
                {queueBulkConfirmArmed === 'clear_stuck'
                  ? `⚠ Confirm abandon stuck (${queueSelectionCounts.stuck})`
                  : `🚧 Abandon stuck (${queueSelectionCounts.stuck})`}
              </button>
              <button
                type="button"
                onClick={() => { void runBulkQueueAction('clear_failed') }}
                disabled={queueBulkBusy || (jobSummary?.failed ?? 0) === 0}
                style={queueBulkConfirmArmed === 'clear_failed' ? actionDisabledStyle(E.ember) : actionGhostStyle()}
                title={queueBulkConfirmArmed === 'clear_failed' ? `Click again to confirm abandoning ${jobSummary?.failed ?? 0} failed jobs` : `Abandon ${jobSummary?.failed ?? 0} failed jobs`}
              >
                {queueBulkConfirmArmed === 'clear_failed'
                  ? `⚠ Confirm clear failed (${jobSummary?.failed ?? 0})`
                  : `❌ Clear failed (${jobSummary?.failed ?? 0})`}
              </button>
            </div>
          )}

          {/* ── Status filter row ── */}
          {!loading && (jobs.length > 0 || jobTotal > 0) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '0 4px', alignItems: 'center' }}>
              <span style={{ ...TYPE.microFig, color: E.inkDim, fontSize: 10, fontWeight: 800 }}>FILTER</span>
              {(['all', 'pending', 'drafting', 'pr_created', 'merged', 'failed', 'stuck'] as const).map((s) => {
                const active = queueStatusFilter === s
                const count = queueTabCount(s, jobSummary, {
                  total: jobTotal || queueSelectionCounts.total,
                  pending: queueSelectionCounts.pending,
                  drafting: queueSelectionCounts.drafting,
                  failed: queueSelectionCounts.failed,
                  stuck: queueSelectionCounts.stuck,
                  pr_created: jobs.filter((j) => j.status === 'pr_created').length,
                  merged: jobs.filter((j) => j.status === 'merged').length,
                })
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
                  ↺ Reset filter
                </button>
              </span>
            </div>
          )}

          {(jobs.length > 0 || jobTotal > 0 || (jobSummary?.failed ?? 0) > 0) && <QueueTable
            jobs={visibleQueueJobs}
            total={jobMatched || jobTotal || visibleQueueJobs.length}
            summary={jobSummary}
            hideFilters
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
      {tab === 'draft' && !generating && draftOperationsOpen && (
        <div id="studio-panel-draft-review" role="tabpanel" aria-labelledby="studio-tab-draft" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px 0', borderTop: `1px solid ${E.hairline}` }}>
            <span style={{ ...kickerStyle, fontSize: 10 }}>REVIEW &amp; GATES</span>
            <span style={{ fontSize: 10.5, color: E.inkSoft, fontFamily: E.mono }}>quality · compliance · depth · link integrity — every gate must clear before approve</span>
          </div>
          <ReviewDraftsPanel
            jobs={jobs}
            gateByJob={gateByJob}
            selectedJobId={selectedJob?.id ?? null}
            onOpenJob={(j) => { setSelectedJob(j) }}
            reviewAuditResult={reviewAuditResult}
            setActionNotice={setActionNotice}
            shipGateByJob={shipGateBook}
          />
          {/* AI-enabled inline editor — fix blockers interactively.
              Only when NO job is open in the JobDetail modal (which carries
              its own AdminInlineEditor) so the same job never gets two
              editors at once. */}
          {!selectedJob && selectedJob?.content && (
            <div style={{ marginTop: 14, ...panelCard }}>
              <div style={{ ...kickerStyle, marginBottom: 12 }}>
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
                targetUrl={selectedJob.canonical_url ?? undefined}
                competingSnippets={selectedJob.competing_snippets ?? undefined}
                competingUrls={selectedJob.competing_urls ?? undefined}
                requiredShortKeywords={selectedJob.required_short_keywords ?? undefined}
                requiredLongTailKeywords={selectedJob.required_long_tail_keywords ?? undefined}
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

          {/* Master SEO Engine — 130+ signal layered analysis of the selected job */}
          <MasterEnginePanel job={selectedJob} notice={setActionNotice} />
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
              { chip: 'Opportunity', text: 'Radar, Ubersuggest market demand (no planner required), reward forecasts, weak families, and cannibalization risk.' },
              { chip: 'Constraints', text: 'Ownership registry, destination repo, format rules, and canonical supply are known before research begins.' },
            ]}
            next="II · Research"
            onJump={selectTab}
          />
          <div id="studio-panel-discover" role="tabpanel" aria-labelledby="studio-tab-discover" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SeoIntelligenceDashboard />
            {/* ── UNIFIED WORK PLAN — all signal sources aggregated ── */}
            <div style={{ position: 'relative', background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.panelShadow, overflow: 'hidden' }}>
              <GoldRule offset={18} />
              <div style={{ padding: '22px 22px 18px', background: `linear-gradient(120deg, ${E.inkBlack} 0%, #202A3A 72%, #473B25 100%)`, color: E.ivory, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                <div style={{ maxWidth: 780 }}>
                  <div style={{ ...kickerStyleSm, color: '#E8C979', fontSize: 9, letterSpacing: '0.18em' }}>SEO Master Engine · decision output</div>
                  <h3 style={{ margin: '7px 0 0', fontFamily: C.serif, fontSize: 26, lineHeight: 1.08, color: '#FFFFFF' }}>What the search landscape says to do next</h3>
                  <p style={{ margin: '8px 0 0', maxWidth: 690, color: 'rgba(255,255,255,0.68)', fontFamily: C.serif, fontSize: 13.5, lineHeight: 1.5 }}>
                    One ranked view of demand, topical gaps, estate conflicts and answer-engine visibility. Select only the opportunities worth turning into a research brief.
                  </p>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 13 }}>
                    {['GSC demand', 'Master Engine', 'Ubersuggest', 'Estate graph', 'AEO visibility'].map((source) => (
                      <span key={source} style={{ padding: '4px 7px', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.72)', fontFamily: C.mono, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{source}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchUberOpps(true)}
                  disabled={uberOppsLoading}
                  title={uberOppsMeta.connected === false ? 'Connect Ubersuggest in Configure first' : 'Pull fresh Ubersuggest market opportunities (uses MCP credits)'}
                  style={{
                    padding: '8px 12px', border: '1px solid rgba(255,255,255,0.38)', background: 'rgba(255,255,255,0.08)', color: '#FFFFFF',
                    fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderRadius: E.radiusXs,
                    cursor: uberOppsLoading ? 'wait' : 'pointer',
                  }}
                >
                  {uberOppsLoading ? '◇ Loading Ubersuggest…' : `◇ Refresh Ubersuggest (${uberOpps.length})`}
                </button>
              </div>
              <div style={{ padding: 18 }}>
              {uberOppsMeta.lastError && !uberOpps.length && (
                <div style={{ marginBottom: 12, padding: '9px 11px', background: E.redSoft, border: `1px solid ${E.redBorder}`, fontFamily: C.mono, fontSize: 10, color: C.red }}>
                  Ubersuggest: {uberOppsMeta.lastError}{uberOppsMeta.connected === false ? ' — connect it in Configure.' : ''}
                </div>
              )}
              <WorkPlanTable
                items={workPlanItems}
                selectedIds={selectedWorkPlanIds}
                onToggleSelect={(id) => setSelectedWorkPlanIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id); else next.add(id)
                  return next
                })}
                onSelectAll={(ids) => setSelectedWorkPlanIds(new Set(ids))}
                onClearSelection={() => setSelectedWorkPlanIds(new Set())}
                onSendToResearch={handleSendToResearch}
                onResolveCannibal={handleResolveCannibal}
                onResolveAllCannibal={handleResolveAllCannibal}
                resolvingIds={resolvingCannibalIds}
                resolvingAll={resolvingAllCannibal}
                resolvedIds={resolvedCannibalIds}
              />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 14, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <GscMini />
                <OpportunityRadar opportunities={radar} meta={radarMeta} onApply={applyBrief} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MergeHistory />
                <OrphanWatch setActionNotice={setActionNotice} />
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
              { chip: 'Push to main',  text: 'Approves a completed draft and ships it, or merges an already-open PR to main.' },
              { chip: 'Deploy watch',  text: 'Monitors Cloudflare Pages deploy + the canary route status.' },
              { chip: 'Decline',       text: 'Reject an open PR — closes it on GitHub and marks the job closed.' },
            ]}
            prev="III · Draft"
            next="V · Configure"
            onJump={selectTab}
          />
          <ApprovePanel
            selectedJob={selectedJob}
            jobs={jobs}
            merges={merges}
            onOpenJob={(j) => { setSelectedJob(j) }}
            setActionNotice={setActionNotice}
            onApproveAndMerge={runApproveAndMerge}
            onMergePr={runMergePr}
            onDeclinePr={runDeclinePr}
            onMerged={() => { void fetchJobs(); selectTab('approve') }}
            shipGateByJob={shipGateBook}
          />
          <PublishLedger
            merges={merges}
            jobs={jobs}
            onOpenJob={(j) => { setSelectedJob(j) }}
            setActionNotice={setActionNotice}
            onRevertJob={runRevertJob}
          />
        </>
      )}

      {/* ══════════ VII · TRACK ══════════ */}

      {/* ══════════ VII · CONFIGURE ══════════ */}
      {tab === 'configure' && (
        <>
          <ChapterIntro
            numeral="V"
            title="Configure"
            subtitle="System configurator: manage AI provider keys, connect Google Search Console, audit site health, and maintain the deep interlink registry — all from one place."
            chapterKey="configure"
            scope={[
              { chip: '🔑 AI keys', text: 'Manage API keys for every content provider (OpenAI, Nemotron, Grok, DeepSeek, GLM, Gemini, and more).' },
              { chip: '🔗 GSC', text: 'Connect Search Console via OAuth or service-account JSON. Live status with green / amber / red indicator.' },
              { chip: '📈 GA4', text: 'Wire Google Analytics 4 (same service account as GSC) so the engine consumes landing-page sessions.' },
              { chip: '◇ Ubersuggest', text: 'Authorize the official Ubersuggest MCP over OAuth from this tab — connect or disconnect at will.' },
              { chip: '🩺 Health', text: 'Site-wide audit, broken link detection, deep interlink registry, and system diagnostics.' },
            ]}
            prev="IV · Approve & Track"
            onJump={selectTab}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── Row 1: AI Key Vault (full width) ── */}
            <section style={{ ...panelCard }}>
              <div style={{ ...kickerStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🔑</span>AI PROVIDER KEYS
              </div>
              <AiKeyVaultPanel onChanged={() => { fetchSuggestions(region) }} />
            </section>

            {/* ── Row 2: Model Calibration (full width) ── */}
            <section style={panelCard}>
              <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <section style={panelCard}>
              <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      label: 'Google Analytics',
                      value: systemHealth.ga4Connected ? 'Connected' : 'Offline',
                      sub: ga4Status?.propertyId ? `property ${ga4Status.propertyId}` : 'no property ID',
                      icon: systemHealth.ga4Connected ? '📈' : '📉',
                      color: systemHealth.ga4Connected ? E.mossGreen : C.red,
                    },
                    {
                      label: 'Ubersuggest MCP',
                      value: systemHealth.ubersuggestConnected ? 'Connected' : 'Disconnected',
                      sub: uberStatus?.connected
                        ? (uberStatus.mode === 'oauth' ? `OAuth · ${uberStatus.toolCount || 0} tools` : `${uberStatus.toolCount || 0} tools`)
                        : 'authorize in configurator',
                      icon: systemHealth.ubersuggestConnected ? '◇' : '○',
                      color: systemHealth.ubersuggestConnected ? E.mossGreen : C.red,
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
              <section style={panelCard}>
                <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🔗</span>SEARCH CONSOLE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: gscStatus?.connected ? (gscStatus?.live ? '#16A34A' : E.amber) : E.red,
                    boxShadow: gscStatus?.connected ? `0 0 0 3px ${gscStatus?.live ? 'rgba(22,163,74,0.16)' : 'rgba(217,119,6,0.16)'}` : `0 0 0 3px rgba(220,38,38,0.16)`,
                  }} />
                  <div>
                    <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 600, color: E.ink }}>
                      {gscStatus?.connected ? (gscStatus?.live ? 'Connected · Live data' : 'Connected · Snapshot only') : 'Not connected'}
                    </div>
                    <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                      {gscStatus?.mode ? (
                        <span style={{
                          padding: '1px 6px', borderRadius: E.radiusXs, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                          background: String(gscStatus.mode) === 'oauth' ? E.blueSoft : E.amberSoft,
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

              {/* Google Analytics 4 */}
              <section style={panelCard}>
                <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📈</span>GOOGLE ANALYTICS 4
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: ga4Status?.connected ? '#16A34A' : E.red,
                    boxShadow: ga4Status?.connected ? '0 0 0 3px rgba(22,163,74,0.16)' : '0 0 0 3px rgba(220,38,38,0.16)',
                  }} />
                  <div>
                    <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 600, color: E.ink }}>
                      {ga4Status?.connected ? 'Connected · landing-page demand' : 'Not connected'}
                    </div>
                    <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                      Reuses the GSC service-account key · add the SA as a Viewer on the GA4 property
                    </div>
                  </div>
                </div>
                <input
                  value={ga4PropertyInput}
                  onChange={(e) => setGa4PropertyInput(e.target.value)}
                  placeholder="GA4 property ID (e.g. 123456789)"
                  style={{
                    width: '100%', marginBottom: 8, padding: '8px 10px',
                    border: `1px solid ${E.hairline}`, background: E.ivory,
                    fontFamily: C.mono, fontSize: 12, color: E.ink,
                  }}
                />
                {ga4Notice && (
                  <div style={{ fontSize: 10, fontFamily: C.mono, color: ga4Status?.connected ? E.mossGreen : C.red, marginBottom: 8 }}>{ga4Notice}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={ga4Busy}
                    onClick={async () => {
                      setGa4Busy(true)
                      setGa4Notice(null)
                      try {
                        const res = await fetch('/api/content-studio/ga4/connect', {
                          method: 'POST',
                          credentials: 'same-origin',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ propertyId: ga4PropertyInput, enabled: true }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'GA4 connect failed')
                        setGa4Notice(`Live · ${data.sessions ?? 0} sessions in last 7 days`)
                        await loadGa4Status()
                        await loadSystemHealth()
                      } catch (e) {
                        setGa4Notice(e instanceof Error ? e.message : 'GA4 connect failed')
                      } finally { setGa4Busy(false) }
                    }}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 0,
                      border: `1px solid ${E.gold}`, background: E.gold, color: E.ivory,
                      cursor: ga4Busy ? 'progress' : 'pointer',
                      fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {ga4Busy ? 'Connecting…' : ga4Status?.connected ? '↻ Re-test GA4' : '→ Connect GA4'}
                  </button>
                  <button
                    type="button"
                    disabled={ga4Busy || !ga4Status?.connected}
                    onClick={async () => {
                      setGa4Busy(true)
                      try {
                        await fetch('/api/content-studio/ga4/connect', { method: 'DELETE', credentials: 'same-origin' })
                        setGa4Notice('Disconnected')
                        await loadGa4Status()
                        await loadSystemHealth()
                      } finally { setGa4Busy(false) }
                    }}
                    style={{
                      padding: '8px 12px', borderRadius: 0,
                      border: `1px solid ${E.hairline}`, background: 'transparent', color: E.inkMuted,
                      cursor: ga4Status?.connected ? 'pointer' : 'not-allowed',
                      fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </section>

              {/* Ubersuggest MCP */}
              <section style={panelCard}>
                <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>◇</span>UBERSUGGEST MCP
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: uberStatus?.connected ? '#16A34A' : E.red,
                    boxShadow: uberStatus?.connected ? '0 0 0 3px rgba(22,163,74,0.16)' : '0 0 0 3px rgba(220,38,38,0.16)',
                  }} />
                  <div>
                    <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 600, color: E.ink }}>
                      {uberStatus?.creditsExhaustedUntil && Date.parse(uberStatus.creditsExhaustedUntil) > Date.now()
                        ? 'Credits paused · using last good pull'
                        : uberStatus?.connected
                          ? `Connected · ${uberStatus.toolCount || 'MCP'} tools`
                          : 'Not connected'}
                    </div>
                    <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                      {uberStatus?.mode === 'oauth' ? 'OAuth · ' : ''}
                      {uberStatus?.lastIntel?.keywordCount
                        ? `Last engine pull: ${uberStatus.lastIntel.keywordCount} keywords · ${(uberStatus.lastIntel.layers || []).join(', ') || 'layers'} · ${uberStatus.lastIntel.toolsUsed?.length || 0} tools`
                        : 'Planner spends 16 MCP calls per run: keyword markets first, then owned-domain, SERP, content, backlinks. Failed tools skip.'}
                    </div>
                  </div>
                </div>
                {uberNotice && (
                  <div style={{ fontSize: 10, fontFamily: C.mono, color: uberStatus?.connected && !/fail|error|denied|mismatch/i.test(uberNotice) ? E.mossGreen : C.red, marginBottom: 8 }}>{uberNotice}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={uberBusy}
                    onClick={async () => {
                      setUberBusy(true)
                      setUberNotice(null)
                      try {
                        if (!uberStatus?.connected && (uberStatus?.hasRefresh || uberStatus?.hasToken) && !uberTokenInput) {
                          const res = await fetch('/api/content-studio/ubersuggest/connect', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ enabled: true }),
                          })
                          const data = await res.json()
                          if (res.ok) {
                            setUberNotice('MCP re-enabled — planner will pull keyword volume')
                            await loadUberStatus()
                            await loadSystemHealth()
                            return
                          }
                          if (!data.needsOAuth) throw new Error(data.error || 'Ubersuggest connect failed')
                        }
                        const res = await fetch('/api/content-studio/ubersuggest/auth', { credentials: 'same-origin' })
                        const data = await res.json()
                        if (!res.ok || !data.authUrl) throw new Error(data.error || 'Could not start Ubersuggest OAuth')
                        window.location.href = data.authUrl
                      } catch (e) {
                        setUberNotice(e instanceof Error ? e.message : 'Ubersuggest connect failed')
                      } finally { setUberBusy(false) }
                    }}
                    style={{
                      flex: 1, minWidth: 160, padding: '8px 0', borderRadius: 0,
                      border: `1px solid ${E.gold}`, background: E.gold, color: E.ivory,
                      cursor: uberBusy ? 'progress' : 'pointer',
                      fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {uberBusy ? 'Connecting…' : uberStatus?.connected ? '↻ Reconnect MCP' : '→ Connect MCP'}
                  </button>
                  <button
                    type="button"
                    disabled={uberBusy || !uberStatus?.connected}
                    onClick={async () => {
                      setUberBusy(true)
                      try {
                        await fetch('/api/content-studio/ubersuggest/connect', { method: 'DELETE', credentials: 'same-origin' })
                        setUberNotice('Disconnected — OAuth tokens kept for one-click reconnect')
                        await loadUberStatus()
                        await loadSystemHealth()
                      } finally { setUberBusy(false) }
                    }}
                    style={{
                      padding: '8px 12px', borderRadius: 0,
                      border: `1px solid ${E.hairline}`, background: 'transparent', color: E.inkMuted,
                      cursor: uberStatus?.connected ? 'pointer' : 'not-allowed',
                      fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Disconnect
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setUberShowToken((v) => !v)}
                  style={{
                    marginTop: 10, padding: 0, border: 'none', background: 'transparent',
                    color: E.inkMuted, cursor: 'pointer', fontFamily: C.mono, fontSize: 10,
                    letterSpacing: '0.04em',
                  }}
                >
                  {uberShowToken ? 'Hide advanced token paste' : 'Advanced · paste a bearer token'}
                </button>
                {uberShowToken && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="password"
                      value={uberTokenInput}
                      onChange={(e) => setUberTokenInput(e.target.value)}
                      placeholder={uberStatus?.hasToken ? 'Token saved · paste a new one to replace' : 'Ubersuggest MCP bearer token'}
                      style={{
                        width: '100%', marginBottom: 8, padding: '8px 10px',
                        border: `1px solid ${E.hairline}`, background: E.ivory,
                        fontFamily: C.mono, fontSize: 12, color: E.ink,
                      }}
                    />
                    <button
                      type="button"
                      disabled={uberBusy || !uberTokenInput.trim()}
                      onClick={async () => {
                        setUberBusy(true)
                        setUberNotice(null)
                        try {
                          const res = await fetch('/api/content-studio/ubersuggest/connect', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accessToken: uberTokenInput, enabled: true }),
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Ubersuggest connect failed')
                          setUberTokenInput('')
                          setUberShowToken(false)
                          setUberNotice('MCP connected with pasted token')
                          await loadUberStatus()
                          await loadSystemHealth()
                        } catch (e) {
                          setUberNotice(e instanceof Error ? e.message : 'Ubersuggest connect failed')
                        } finally { setUberBusy(false) }
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 0,
                        border: `1px solid ${E.hairline}`, background: 'transparent', color: E.ink,
                        cursor: uberTokenInput.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: C.serif, fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Save token
                    </button>
                  </div>
                )}
              </section>

              {/* Site Health */}
              <section style={panelCard}>
                <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🩺</span>SITE HEALTH
                </div>
                <AdminSiteHealthPanel />
              </section>

              {/* Rhythm Alerts (weekly scan) */}
              <section style={panelCard}>
                <div style={{ ...kickerStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🎼</span>RHYTHM ALERTS <span style={{ color: E.inkMuted, fontWeight: 400 }}>— weekly sentence-opening scan</span>
                </div>
                <AdminRhythmAlertsPanel onOpenJob={(jobId) => { void openRhythmAlertJob(jobId) }} />
              </section>
            </div>

            {/* ── Row 5: Deep Interlinks (full width) ── */}
            <section style={panelCard}>
              <div style={{ ...kickerStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
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
          key={selectedJob.id}
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

      {/* ── VI · SHOP SEO (hidden until shop content ships via shipContent) ── */}
      {tab === 'shop' && (
        <div id="studio-panel-shop" role="tabpanel" aria-labelledby="studio-tab-shop" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '22px 24px', background: E.paper, border: `1px solid ${E.hairline}` }}>
            <div style={{ fontFamily: C.serif, fontSize: 16, color: E.ink, fontWeight: 600 }}>
              Shop SEO hidden until shipContent
            </div>
            <p style={{ margin: '6px 0 0', fontFamily: C.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
              The product-blog pipeline has no shipContent door, so this console stays hidden until it can ship through the single Git write door.
            </p>
          </div>
        </div>
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
