'use client'

/**
 * Studio copy desk — live queue + Master Engine floor board.
 *
 * Counts come from the full jobs table summary and /api/seo-engine/status
 * (exact head counts + latest-row timestamps). The board also lists the
 * actual in-flight jobs so the strip can never look "idle" while work is
 * moving, and it paints stale/offline when a poll is missed.
 */

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import { formatEngineRunSummary } from '@/lib/seoEngine/engineRunSummary'
import type { QueueUiFilter } from '@/lib/seoFactory/jobsQueue'
import type { ContentJob, QueueSummary } from './studio-ui-shared'

const KEYFRAMES = `
@keyframes deskPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.28 } }
@keyframes deskBlink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
@keyframes deskSweep { 0% { transform: translateX(-40%) } 100% { transform: translateX(240%) } }
`

export const ENGINE_ACTION_LABEL: Record<string, string> = {
  ingest: 'knowledge ingestion',
  plan: 'planner',
  llm: 'LLM visibility audit',
}

export const ENGINE_PARAMS: Record<string, string> = {
  ingest: 'limitPerSource=8 · maxAiItems=0 · hung feeds skip after 6–8s',
  plan: 'GSC demand + knowledge · limit=10',
  llm: 'adaptive slate · skip recent · planner + losses',
}

export type DeskLiveState = 'connecting' | 'live' | 'poll' | 'stale' | 'offline'

type EngineStatus = {
  fetchedAt?: string
  lifecycle?: { seededCells?: number }
  knowledge?: { total?: number; latestTitle?: string | null; latestAt?: string | null }
  plans?: { total?: number; latestTerm?: string | null; latestAt?: string | null }
  interlinks?: { planned?: number; applied?: number; latestAt?: string | null }
  llmVisibility?: { total?: number; cited?: number; shareOfVoice?: number; latestQuery?: string | null; latestAt?: string | null }
  rankingModel?: { computed?: number; latestTotal?: number | null; latestTopic?: string | null; latestAt?: string | null }
  gate?: { runs?: number; passed?: number; passRate?: number; avgScore?: number; latestAt?: string | null; source?: string }
  runs?: Array<Record<string, unknown>>
  authMode?: 'service-role' | 'degraded-anon'
  demandSnapshot?: { source?: string; mode?: string | null; siteUrl?: string | null; ageDays?: number; stale?: boolean; generatedAt?: string | null }
}

type TraceStep = { seq: number; phase: string; message: string; detail?: string; tone: string }

function parseMs(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(n) ? n : null
}

export function ageLabel(ms: number | null, now: number): string {
  if (!ms) return '—'
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 4) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function resolveDeskFreshness(engineAt: number | null, now: number): DeskLiveState {
  if (!engineAt) return 'connecting'
  const age = now - engineAt
  if (age > 45_000) return 'stale'
  return 'live'
}

function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statusInk(status: string): string {
  if (status === 'failed') return E.red
  if (status === 'merged') return E.mossGreen
  if (status === 'pr_created') return E.blue
  if (status === 'publishing' || status === 'drafting') return E.ember
  return E.inkMuted
}

function floorJobs(jobs: ContentJob[]): ContentJob[] {
  const rank: Record<string, number> = {
    drafting: 0, pending: 1, publishing: 2, pr_created: 3, failed: 4,
  }
  return [...jobs]
    .filter((j) => ['pending', 'drafting', 'publishing', 'pr_created', 'failed'].includes(j.status))
    .sort((a, b) => {
      const ra = rank[a.status] ?? 9
      const rb = rank[b.status] ?? 9
      if (ra !== rb) return ra - rb
      return Date.parse(b.updated_at) - Date.parse(a.updated_at)
    })
    .slice(0, 6)
}

function lastMovementMs(engine: EngineStatus, jobs: ContentJob[], engineAt: number | null): number | null {
  const stamps: number[] = []
  if (engineAt) stamps.push(engineAt)
  const push = (v?: string | null) => { const n = parseMs(v); if (n) stamps.push(n) }
  push(engine.fetchedAt)
  push(engine.knowledge?.latestAt)
  push(engine.plans?.latestAt)
  push(engine.interlinks?.latestAt)
  push(engine.llmVisibility?.latestAt)
  push(engine.gate?.latestAt)
  push(engine.rankingModel?.latestAt)
  for (const r of engine.runs || []) {
    push(String(r.started_at || r.finished_at || ''))
  }
  for (const j of jobs.slice(0, 12)) push(j.updated_at)
  return stamps.length ? Math.max(...stamps) : null
}

export function StudioLiveDesk({
  summary,
  jobs = [],
  generating,
  engine,
  engineAt,
  engineBusy,
  engineAction,
  engineElapsed,
  engineTrace,
  liveState = 'connecting',
  onIngest,
  onPlan,
  onLlm,
  onOpenJob,
  onFilterQueue,
  onRefresh,
}: {
  summary: QueueSummary | null
  jobs?: ContentJob[]
  generating: boolean
  engine: EngineStatus | Record<string, unknown> | null
  engineAt: number | null
  engineBusy: boolean
  engineAction: string | null
  engineElapsed: number
  engineTrace: TraceStep[]
  liveState?: DeskLiveState
  onIngest: () => void
  onPlan: () => void
  onLlm: () => void
  onOpenJob?: (job: ContentJob) => void
  onFilterQueue?: (status: QueueUiFilter) => void
  onRefresh?: () => void
}) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const live = (engine || {}) as EngineStatus
  const inFlight = (summary?.pending || 0) + (summary?.drafting || 0) + (summary?.publishing || 0)
  const prReady = summary?.pr_created || 0
  const merged = summary?.merged || 0
  const failed = summary?.failed || 0
  const total = summary?.total || 0
  const slips = floorJobs(jobs)

  const cells = live.lifecycle?.seededCells ?? null
  const intel = live.knowledge?.total ?? null
  const plans = live.plans?.total ?? null
  const linksPlanned = live.interlinks?.planned ?? 0
  const linksApplied = live.interlinks?.applied ?? 0
  const links = linksPlanned + linksApplied
  const voice = live.llmVisibility
  const gate = live.gate
  const rank = live.rankingModel
  const runs = live.runs || []

  const movement = lastMovementMs(live, jobs, engineAt)
  const pollAge = engineAt ? now - engineAt : null
  const freshness = pollAge != null && pollAge > 45_000 ? 'stale' : liveState === 'offline' ? 'offline' : liveState
  const liveLabel = engineBusy
    ? `${ENGINE_ACTION_LABEL[engineAction || 'ingest']} · ${engineElapsed}s`
    : generating
      ? 'draft generating'
      : freshness === 'stale'
        ? `stale · ${ageLabel(engineAt, now)}`
        : freshness === 'live'
          ? `realtime · ${ageLabel(engineAt, now)}`
          : freshness === 'poll'
            ? `polling · ${ageLabel(engineAt, now)}`
            : freshness === 'offline'
              ? 'offline'
              : 'connecting'

  const liveColor = engineBusy || generating
    ? E.blue
    : freshness === 'stale' || freshness === 'offline'
      ? E.red
      : freshness === 'live'
        ? E.mossGreen
        : E.gold

  const lastRun = runs[0] || null

  const btn = (label: string, onClick: () => void, kind: 'navy' | 'gold' | 'violet', active: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={engineBusy}
      style={{
        padding: '9px 16px', border: 'none', cursor: engineBusy ? 'progress' : 'pointer',
        fontFamily: E.mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        background: kind === 'gold' ? E.gold : kind === 'violet' ? '#3B1764' : E.inkBlack,
        color: E.ivory, opacity: engineBusy && !active ? 0.42 : 1,
      }}
    >
      {active ? `Working · ${engineElapsed}s` : label}
    </button>
  )

  return (
    <section
      data-testid="studio-live-desk"
      data-freshness={freshness}
      style={{
        marginBottom: 18,
        background: E.paper,
        border: `1px solid ${E.hairline}`,
        boxShadow: E.paperShadow,
        display: 'grid',
        gridTemplateColumns: '22px 1fr',
      }}
    >
      <style>{KEYFRAMES}</style>
      <aside aria-hidden style={{
        background: E.inkBlack,
        color: E.goldSoft,
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontFamily: E.mono,
        fontSize: 9,
        letterSpacing: '0.28em',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        COPY DESK
      </aside>

      <div>
        <header style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '14px 18px 12px',
          borderBottom: `1px solid ${E.hairline}`,
          background: `linear-gradient(180deg, ${E.parchment} 0%, ${E.paper} 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {(engineBusy || generating) && (
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: E.goldSoft, overflow: 'hidden',
            }}>
              <div style={{
                width: '28%', height: '100%', background: E.gold,
                animation: 'deskSweep 1.4s linear infinite',
              }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.18em', color: E.gold, fontWeight: 800 }}>
              FLOOR · QUEUE + MASTER ENGINE
            </div>
            <h2 style={{ margin: '4px 0 0', fontFamily: E.serif, fontSize: 24, lineHeight: 1.05, color: E.inkBlack, fontWeight: 700 }}>
              What is moving right now
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: E.mono, fontSize: 10, color: E.inkSoft }}>
              <span style={{
                width: 8, height: 8, borderRadius: 999, background: liveColor, flexShrink: 0,
                animation: engineBusy || generating || freshness === 'live' ? 'deskPulse 1.2s ease-in-out infinite' : undefined,
              }} />
              <span data-testid="desk-live-label">{liveLabel}</span>
            </div>
            <div style={{ fontFamily: E.mono, fontSize: 11, color: E.inkBlack, fontVariantNumeric: 'tabular-nums' }}>
              {clockLabel(now)}
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                style={{
                  padding: '5px 10px', border: `1px solid ${E.hairline}`, background: E.ivory,
                  fontFamily: E.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', color: E.inkSoft, fontWeight: 700,
                }}
              >
                Sync
              </button>
            )}
          </div>
        </header>

        {/* ── Engine health chips (always visible — healthy ≠ invisible) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '7px 16px', borderBottom: `1px solid ${E.hairline}`, background: E.ivory,
          fontFamily: E.mono, fontSize: 9, letterSpacing: '0.04em',
        }}>
          {live.authMode === 'degraded-anon' ? (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: E.goldSoft, color: '#7a5200', fontWeight: 800 }}>
              ⚠ ANON MODE — DB running as public anon key
            </span>
          ) : live.authMode === 'service-role' ? (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: '#E7F0EA', color: E.mossGreen, fontWeight: 800 }}>
              🔐 service-role
            </span>
          ) : null}
          {(() => {
            const snap = (engine && typeof engine === 'object' ? (engine as Record<string, unknown>).demandSnapshot : undefined) as
              | { source?: string; mode?: string | null; siteUrl?: string | null; ageDays?: number; stale?: boolean; generatedAt?: string | null }
              | undefined
            if (!snap) return null
            if (snap.source === 'live') {
              return (
                <span title={`Live Search Console (${snap.mode || 'gsc'}) ${snap.siteUrl || ''}`}
                  style={{ padding: '3px 9px', borderRadius: 999, background: '#E7F0EA', color: E.mossGreen, fontWeight: 800 }}>
                  🗃 GSC live{snap.mode ? ` · ${snap.mode}` : ''}
                </span>
              )
            }
            if (!snap.ageDays || snap.ageDays < 0) {
              return <span style={{ padding: '3px 9px', borderRadius: 999, background: E.hairline, color: E.inkMuted }}>🗃 no snapshot</span>
            }
            const stale = snap.stale === true
            return (
              <span title={`Snapshot generated ${snap.generatedAt || '?'} — ${stale ? 'too old, refused by planner' : 'available as demand fallback'}`}
                style={{ padding: '3px 9px', borderRadius: 999, background: stale ? E.goldSoft : E.hairline, color: stale ? '#7a5200' : E.inkMuted, fontWeight: 800 }}>
                🗃 snapshot {snap.ageDays}d{stale ? ' · STALE' : ''}
              </span>
            )
          })()}
          {(() => {
            const planRun = (runs || []).find((r) => String(r.kind || '') === 'plan' && r.summary && typeof r.summary === 'object' && (r.summary as Record<string, unknown>).plans != null)
            if (!planRun) return null
            const s = planRun.summary as { plans?: number; persisted?: number; persistErrors?: number }
            const plansN = Number(s.plans) || 0
            const failed = Number(s.persistErrors) || 0
            const ok = failed === 0
            return (
              <span title="Latest planner run persistence audit" style={{ padding: '3px 9px', borderRadius: 999, background: ok ? '#E7F0EA' : '#F8E5E5', color: ok ? E.mossGreen : E.red, fontWeight: 800 }}>
                🧭 {plansN} planned{failed ? ` · ⚠ ${failed} unpersisted` : ' · persisted'}
              </span>
            )
          })()}
          <span
            title={
              gate?.source === 'content_jobs'
                ? 'Hydrated from content_jobs.seo_score because seo_gate_runs is empty — studio audits now record gate rows on persist/ship'
                : 'seo_gate_runs: engine compliance + studio quality audits'
            }
            style={{ padding: '3px 9px', borderRadius: 999, background: (gate?.runs ?? 0) > 0 ? '#E7F0EA' : E.hairline, color: (gate?.runs ?? 0) > 0 ? E.mossGreen : E.inkMuted }}
          >
            🛡 gate {gate?.runs ?? 0} runs · {gate?.passRate ?? 0}%
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 0.92fr) minmax(340px, 1.2fr)',
        }}>
          <div style={{ padding: '14px 16px 16px', borderRight: `1px solid ${E.hairline}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.14em', color: E.inkDim, fontWeight: 700 }}>
                NOW ON THE FLOOR
              </div>
              <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>
                {total} jobs in table
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 12 }}>
              <Metric
                label="In flight"
                value={inFlight}
                tone="ember"
                hint="pending + drafting + publishing"
                onClick={() => onFilterQueue?.('drafting')}
              />
              <Metric label="PR ready" value={prReady} tone="blue" hint="open PRs" onClick={() => onFilterQueue?.('pr_created')} />
              <Metric label="Shipped" value={merged} tone="moss" hint="merged to main" onClick={() => onFilterQueue?.('merged')} />
              <Metric label="Failed" value={failed} tone="red" hint="need regenerate" onClick={() => onFilterQueue?.('failed')} />
            </div>

            <div data-testid="desk-floor-slips" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slips.length === 0 ? (
                <div style={{
                  padding: '16px 12px', border: `1px dashed ${E.hairline}`, color: E.inkMuted,
                  fontFamily: E.serif, fontSize: 15, fontStyle: 'italic',
                }}>
                  Floor is clear. Nothing drafting, publishing, or waiting on a PR.
                </div>
              ) : slips.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  data-testid={`desk-slip-${job.id}`}
                  onClick={() => onOpenJob?.(job)}
                  style={{
                    textAlign: 'left', padding: '8px 10px',
                    border: `1px solid ${E.hairline}`, background: E.ivory,
                    cursor: onOpenJob ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      fontFamily: E.mono, fontSize: 9, letterSpacing: '0.1em', fontWeight: 800,
                      color: statusInk(job.status), textTransform: 'uppercase',
                    }}>
                      {job.status.replace('_', ' ')}
                    </span>
                    <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
                      {ageLabel(parseMs(job.updated_at), now)}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: E.serif, fontSize: 15, lineHeight: 1.2, color: E.inkBlack, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {job.title || job.topic || 'Untitled job'}
                  </div>
                  <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted, marginTop: 3 }}>
                    {[job.region, job.ai_provider, job.word_count ? `${job.word_count}w` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.14em', color: E.inkDim, fontWeight: 700 }}>
                MASTER ENGINE · EXACT COUNTS
              </div>
              <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>
                last movement {ageLabel(movement, now)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              <Metric label="Cells" value={cells ?? '—'} hint="lifecycle ontology cells" />
              <Metric label="Intel" value={intel ?? '—'} hint={live.knowledge?.latestTitle || 'knowledge items'} />
              <Metric label="Plans" value={plans ?? '—'} hint={live.plans?.latestTerm || 'cluster plans'} />
              <Metric
                label="Links"
                value={links || '—'}
                hint={`${linksPlanned} planned · ${linksApplied} applied`}
              />
              <Metric
                label="LLM cited"
                value={voice?.total ? `${voice.cited ?? 0}/${voice.total}` : 'n/a'}
                hint={voice?.total ? `${voice.shareOfVoice ?? 0}% share of voice` : 'No LLM audits yet — run LLM audit'}
                tone="gold"
              />
              <Metric
                label="Gate"
                value={gate?.runs ? `${gate.passRate ?? 0}%` : 'n/a'}
                hint={gate?.runs ? `${gate.passed ?? 0}/${gate.runs} passed · avg ${gate.avgScore ?? '—'}` : 'No compliance gate runs yet'}
                tone="moss"
              />
              <Metric
                label="Rank"
                value={rank?.latestTotal ?? '—'}
                hint={rank?.latestTopic ? `${rank.latestTopic} · ${rank.computed ?? 0} scores` : 'No ranking pass yet'}
              />
              <Metric
                label="Voice"
                value={voice?.total ? `${voice.shareOfVoice ?? 0}%` : 'n/a'}
                hint={voice?.latestQuery || 'share of voice across exact audit bank'}
                tone="gold"
              />
            </div>

            <div style={{
              marginTop: 12, padding: '10px 12px', background: E.parchment, border: `1px solid ${E.hairline}`,
            }}>
              <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.12em', color: E.inkDim, fontWeight: 700, marginBottom: 4 }}>
                LAST ENGINE RUN
              </div>
              {lastRun ? (
                <div>
                  <div style={{ fontFamily: E.serif, fontSize: 16, color: E.inkBlack, fontWeight: 700 }}>
                    {String(lastRun.kind || 'run')} · {String(lastRun.status || '')}
                  </div>
                  <div style={{ fontFamily: E.mono, fontSize: 10, color: E.inkMuted, marginTop: 3, lineHeight: 1.45 }}>
                    {lastRun.summary && typeof lastRun.summary === 'object'
                      ? formatEngineRunSummary(lastRun.summary as Record<string, unknown>)
                      : '—'}
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: E.serif, fontSize: 15, fontStyle: 'italic', color: E.inkMuted }}>
                  No engine runs yet. Ingest, plan, or run an LLM audit.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          padding: '10px 16px', borderTop: `1px solid ${E.hairline}`, background: E.ivory,
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {btn('Ingest knowledge', onIngest, 'navy', engineBusy && engineAction === 'ingest')}
            {btn('Run planner', onPlan, 'gold', engineBusy && engineAction === 'plan')}
            {btn('LLM audit', onLlm, 'violet', engineBusy && engineAction === 'llm')}
          </div>
          <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim, maxWidth: 360, textAlign: 'right' }}>
            {engineBusy
              ? `params ${ENGINE_PARAMS[engineAction || 'ingest']}`
              : 'exact Supabase counts · realtime + 10s poll · no-store'}
          </div>
        </div>

        <div style={{ background: E.inkBlack, color: '#D6D3C9', fontFamily: E.mono, fontSize: 10, maxHeight: 168, overflowY: 'auto' }}>
          <div style={{
            padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 9, color: E.goldSoft, fontWeight: 700,
          }}>
            {engineBusy ? `Tape · ${ENGINE_ACTION_LABEL[engineAction || 'ingest']}` : 'Tape · recent engine runs'}
          </div>
          <div style={{ padding: '8px 16px 12px', lineHeight: 1.65 }}>
            {engineBusy || engineTrace.length > 0 ? (
              <>
                {engineTrace.map((s, i) => (
                  <div key={`${s.seq}-${i}`} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ width: 72, color: '#8A8476', flexShrink: 0 }}>{s.phase}</span>
                    <span style={{ color: s.tone === 'ok' ? '#86EFAC' : s.tone === 'warn' ? '#FCD34D' : '#F5F0E6' }}>{s.message}</span>
                    {s.detail && <span style={{ color: '#8A8476' }}> · {s.detail}</span>}
                  </div>
                ))}
                {engineBusy && (
                  <div style={{ display: 'flex', gap: 10, color: '#8A8476' }}>
                    <span style={{ width: 72 }}>think</span>
                    <span style={{ color: E.gold, animation: 'deskBlink 1s steps(1) infinite' }}>▋</span>
                  </div>
                )}
              </>
            ) : runs.length ? (
              runs.slice(0, 6).map((r, i) => {
                const status = String(r.status || '')
                const summaryText = r.summary && typeof r.summary === 'object'
                  ? formatEngineRunSummary(r.summary as Record<string, unknown>)
                  : ''
                const tone = status === 'success' ? '#86EFAC' : status === 'failed' ? '#FCA5A5' : status === 'partial' ? '#FCD34D' : '#A8A29A'
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 72, color: '#8A8476', flexShrink: 0 }}>{String(r.kind || 'run')}</span>
                    <span style={{ color: tone, fontWeight: 700 }}>{status}</span>
                    {summaryText && <span style={{ color: '#A8A29A' }}>{summaryText}</span>}
                    {r.started_at && <span style={{ marginLeft: 'auto', color: '#6B655A' }}>{clockLabel(new Date(String(r.started_at)).getTime())}</span>}
                  </div>
                )
              })
            ) : (
              <div style={{ color: '#8A8476', fontStyle: 'italic' }}>Tape is empty. Ingest, plan, or run an LLM audit.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({
  label, value, hint, tone = 'ink', onClick,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'ink' | 'gold' | 'moss' | 'ember' | 'red' | 'blue'
  onClick?: () => void
}) {
  const color =
    tone === 'gold' ? E.goldDeep
      : tone === 'moss' ? E.mossGreen
        : tone === 'ember' ? E.ember
          : tone === 'red' ? E.red
            : tone === 'blue' ? E.blue
              : E.inkBlack
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      title={hint}
      onClick={onClick}
      data-testid={`desk-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        minWidth: 0, padding: '8px 8px 7px',
        background: E.ivory, border: `1px solid ${E.hairline}`,
        cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
      }}
    >
      <div style={{
        fontFamily: E.mono, fontSize: 8, letterSpacing: '0.11em', textTransform: 'uppercase',
        color: E.inkDim, fontWeight: 700, marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontFamily: E.serif, fontSize: 22, lineHeight: 1, fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </Tag>
  )
}
