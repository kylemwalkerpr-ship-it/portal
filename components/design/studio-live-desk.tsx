'use client'

/**
 * Studio live desk — queue + Master Engine instrument board.
 *
 * Replaces the stale QUEUE strip + v2 engine pills. Counts come from the
 * full jobs table summary and /api/seo-engine/status (exact head counts),
 * not the 100-row queue window.
 */

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import { formatEngineRunSummary } from '@/lib/seoEngine/engineRunSummary'
import type { QueueSummary } from './studio-ui-shared'

const KEYFRAMES = `
@keyframes deskPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
@keyframes deskBlink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
`

export const ENGINE_ACTION_LABEL: Record<string, string> = {
  ingest: 'knowledge ingestion',
  plan: 'planner',
  llm: 'LLM visibility audit',
}

export const ENGINE_PARAMS: Record<string, string> = {
  ingest: 'limitPerSource=8 · maxAiItems=8 · aiSummarize=on',
  plan: 'GSC demand + knowledge · limit=10',
  llm: 'maxAudits=6 · estate queries',
}

type EngineStatus = {
  fetchedAt?: string
  lifecycle?: { seededCells?: number }
  knowledge?: { total?: number }
  plans?: { total?: number }
  interlinks?: { planned?: number; applied?: number }
  llmVisibility?: { total?: number; cited?: number; shareOfVoice?: number }
  rankingModel?: { computed?: number; latestTotal?: number | null; latestTopic?: string | null }
  gate?: { runs?: number; passRate?: number; avgScore?: number }
  runs?: Array<Record<string, unknown>>
}

type TraceStep = { seq: number; phase: string; message: string; detail?: string; tone: string }

function Stat({
  label, value, hint, tone = 'ink',
}: { label: string; value: string | number; hint?: string; tone?: 'ink' | 'gold' | 'moss' | 'ember' | 'red' | 'blue' }) {
  const color =
    tone === 'gold' ? E.goldDeep
      : tone === 'moss' ? E.mossGreen
        : tone === 'ember' ? E.ember
          : tone === 'red' ? E.red
            : tone === 'blue' ? E.blue
              : E.inkBlack
  return (
    <div title={hint} style={{
      minWidth: 88, padding: '10px 12px',
      background: E.ivory, border: `1px solid ${E.hairline}`,
    }}>
      <div style={{
        fontFamily: E.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: E.inkDim, fontWeight: 700, marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontFamily: E.serif, fontSize: 26, lineHeight: 1, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function fmtWhen(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function StudioLiveDesk({
  summary,
  generating,
  engine,
  engineAt,
  engineBusy,
  engineAction,
  engineElapsed,
  engineTrace,
  onIngest,
  onPlan,
  onLlm,
}: {
  summary: QueueSummary | null
  generating: boolean
  engine: EngineStatus | Record<string, unknown> | null
  engineAt: number | null
  engineBusy: boolean
  engineAction: string | null
  engineElapsed: number
  engineTrace: TraceStep[]
  onIngest: () => void
  onPlan: () => void
  onLlm: () => void
}) {
  const live = (engine || {}) as EngineStatus
  const inFlight = (summary?.pending || 0) + (summary?.drafting || 0) + (summary?.publishing || 0)
  const prReady = summary?.pr_created || 0
  const merged = summary?.merged || 0
  const failed = summary?.failed || 0
  const total = summary?.total || 0

  const cells = live.lifecycle?.seededCells ?? null
  const intel = live.knowledge?.total ?? null
  const plans = live.plans?.total ?? null
  const links = (live.interlinks?.planned ?? 0) + (live.interlinks?.applied ?? 0)
  const voice = live.llmVisibility
  const gate = live.gate
  const rank = live.rankingModel
  const runs = live.runs || []

  const btn = (label: string, onClick: () => void, kind: 'navy' | 'gold' | 'violet', active: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={engineBusy}
      style={{
        padding: '8px 14px', border: 'none', cursor: engineBusy ? 'progress' : 'pointer',
        fontFamily: E.mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
        background: kind === 'gold' ? E.gold : kind === 'violet' ? '#4C1D95' : E.inkBlack,
        color: E.ivory, opacity: engineBusy && !active ? 0.45 : 1,
      }}
    >
      {active ? `Working · ${engineElapsed}s` : label}
    </button>
  )

  return (
    <section style={{
      marginBottom: 16, background: E.paper, border: `1px solid ${E.hairline}`,
      boxShadow: E.paperShadow,
    }}>
      <style>{KEYFRAMES}</style>
      <header style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: `1px solid ${E.hairline}`, background: E.parchment,
      }}>
        <div>
          <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.16em', color: E.gold, fontWeight: 800 }}>
            LIVE DESK · QUEUE + MASTER ENGINE
          </div>
          <h2 style={{ margin: '3px 0 0', fontFamily: E.serif, fontSize: 20, color: E.inkBlack, fontWeight: 700 }}>
            What the studio is doing right now
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: E.mono, fontSize: 10, color: E.inkMuted }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999, background: engineBusy || generating ? E.blue : E.mossGreen,
            ...(engineBusy || generating ? { animation: 'deskPulse 1.2s ease-in-out infinite' } : {}),
          }} />
          {engineBusy
            ? `${ENGINE_ACTION_LABEL[engineAction || 'ingest']} · ${engineElapsed}s`
            : generating
              ? 'draft generating'
              : `live · ${fmtWhen(engineAt)}`}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)', gap: 0 }}>
        <div style={{ padding: 14, borderRight: `1px solid ${E.hairline}` }}>
          <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.12em', color: E.inkDim, fontWeight: 700, marginBottom: 10 }}>
            JOB QUEUE · FULL TABLE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Stat label="In flight" value={inFlight} hint="pending + drafting + publishing" tone="ember" />
            <Stat label="PR ready" value={prReady} hint="open PRs awaiting merge" tone="blue" />
            <Stat label="Shipped" value={merged} hint="merged to main" tone="moss" />
            <Stat label="Failed" value={failed} hint="need regenerate or repair" tone="red" />
          </div>
          <div style={{ marginTop: 10, fontFamily: E.mono, fontSize: 10, color: E.inkMuted }}>
            {total} jobs in the table{generating ? ' · 1 generate stream open' : ''}
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.12em', color: E.inkDim, fontWeight: 700, marginBottom: 10 }}>
            MASTER ENGINE · LIVE COUNTS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Stat label="Cells" value={cells ?? '—'} hint="Lifecycle ontology cells" />
            <Stat label="Intel" value={intel ?? '—'} hint="Knowledge items stored" />
            <Stat label="Plans" value={plans ?? '—'} hint="Cluster plans" />
            <Stat label="Links" value={links || '—'} hint={`${live.interlinks?.planned ?? 0} planned · ${live.interlinks?.applied ?? 0} applied`} />
            <Stat
              label="LLM voice"
              value={voice?.total ? `${voice.shareOfVoice ?? 0}%` : 'n/a'}
              hint={voice?.total ? `${voice.cited}/${voice.total} audits cited the estate` : 'No LLM audits yet — run LLM audit'}
              tone="gold"
            />
            <Stat
              label="Gate"
              value={gate?.runs ? `${gate.passRate ?? 0}%` : 'n/a'}
              hint={gate?.runs ? `${gate.runs} recent gate runs · avg ${gate.avgScore ?? '—'}` : 'No compliance gate runs yet'}
              tone="moss"
            />
            <Stat
              label="Rank"
              value={rank?.latestTotal ?? '—'}
              hint={rank?.latestTopic ? `${rank.latestTopic} · ${rank.computed ?? 0} scores stored` : 'No ranking pass yet'}
            />
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderTop: `1px solid ${E.hairline}`, background: E.ivory,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {btn('Ingest knowledge', onIngest, 'navy', engineBusy && engineAction === 'ingest')}
          {btn('Run planner', onPlan, 'gold', engineBusy && engineAction === 'plan')}
          {btn('LLM audit', onLlm, 'violet', engineBusy && engineAction === 'llm')}
        </div>
        <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
          {engineBusy ? `params ${ENGINE_PARAMS[engineAction || 'ingest']}` : 'counts from live Supabase · realtime + 10s poll'}
        </div>
      </div>

      <div style={{ background: E.inkBlack, color: '#D6D3C9', fontFamily: E.mono, fontSize: 10, maxHeight: 168, overflowY: 'auto' }}>
        <div style={{
          padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9, color: E.goldSoft, fontWeight: 700,
        }}>
          {engineBusy ? `Streaming ${ENGINE_ACTION_LABEL[engineAction || 'ingest']}` : 'Recent engine runs'}
        </div>
        <div style={{ padding: '8px 14px 12px', lineHeight: 1.6 }}>
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
              const summary = r.summary && typeof r.summary === 'object'
                ? formatEngineRunSummary(r.summary as Record<string, unknown>)
                : ''
              const tone = status === 'success' ? '#86EFAC' : status === 'failed' ? '#FCA5A5' : status === 'partial' ? '#FCD34D' : '#A8A29A'
              return (
                <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 72, color: '#8A8476', flexShrink: 0 }}>{String(r.kind || 'run')}</span>
                  <span style={{ color: tone, fontWeight: 700 }}>{status}</span>
                  {summary && <span style={{ color: '#A8A29A' }}>{summary}</span>}
                  {r.started_at && <span style={{ marginLeft: 'auto', color: '#6B655A' }}>{fmtWhen(new Date(String(r.started_at)).getTime())}</span>}
                </div>
              )
            })
          ) : (
            <div style={{ color: '#8A8476', fontStyle: 'italic' }}>No engine runs yet. Ingest, plan, or run an LLM audit.</div>
          )}
        </div>
      </div>
    </section>
  )
}
