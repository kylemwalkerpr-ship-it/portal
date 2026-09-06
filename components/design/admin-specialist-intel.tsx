'use client'
/**
 * Content Studio — Specialist Intel panel.
 *
 * Lists open specialist signals (Policy Desk, Competitor Radar, Overnight Ops,
 * Authority Multiplexer, Support Triage, Marketplace Scout, Lead Desk) and lets
 * an operator queue or dismiss them. Minimal surface — reuses the Configure
 * tab's editorial design tokens; no new design system.
 *
 * API: GET/PATCH /api/content-studio/specialist-signals
 */
import React from 'react'
import { studioTokens as E } from './studio-tokens'

type SpecialistRole =
  | 'policy_desk'
  | 'competitor_radar'
  | 'overnight_ops'
  | 'authority_multiplexer'
  | 'support_triage'
  | 'marketplace_scout'
  | 'lead_desk'

type SignalStatus = 'new' | 'queued' | 'consumed' | 'dismissed'

interface SpecialistSignal {
  id: string
  role: SpecialistRole | string
  region?: string | null
  priority: number
  payload: Record<string, unknown>
  status: SignalStatus
  relatedJobId?: string | null
  created_at?: string
  consumed_at?: string | null
}

const ROLE_LABEL: Record<string, string> = {
  policy_desk: 'Policy Desk',
  competitor_radar: 'Competitor Radar',
  overnight_ops: 'Overnight Ops',
  authority_multiplexer: 'Authority Multiplexer',
  support_triage: 'Support Triage',
  marketplace_scout: 'Marketplace Scout',
  lead_desk: 'Lead Desk',
}

const STATUS_LABEL: Record<SignalStatus, string> = {
  new: 'NEW',
  queued: 'QUEUED',
  consumed: 'CONSUMED',
  dismissed: 'DISMISSED',
}

const STATUS_COLOR: Record<SignalStatus, string> = {
  new: '#D97706',
  queued: '#2563EB',
  consumed: '#3F6F3F',
  dismissed: '#9CA3AF',
}

function blob(payload: Record<string, unknown>): string {
  return Object.values(payload)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summary(s: SpecialistSignal, max = 150): string {
  const b = blob(s.payload)
  const label = ROLE_LABEL[s.role] || String(s.role)
  return `${label}${s.region ? ` · ${s.region}` : ''}${b ? ` — ${b.slice(0, max)}` : ''}`
}

const kickerStyle: React.CSSProperties = { ...E.kicker }
const panelCard: React.CSSProperties = {
  padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow,
}

export default function AdminSpecialistIntel() {
  const [signals, setSignals] = React.useState<SpecialistSignal[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [roleFilter, setRoleFilter] = React.useState<string>('')
  const [statusFilter, setStatusFilter] = React.useState<'open' | 'all'>('open')
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ status: statusFilter })
      if (roleFilter) qs.set('role', roleFilter)
      const res = await fetch(`/api/content-studio/specialist-signals?${qs.toString()}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`signals ${res.status}`)
      const json = (await res.json()) as { signals?: SpecialistSignal[]; count?: number }
      setSignals(json.signals ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load specialist signals')
      setSignals([])
    } finally {
      setLoading(false)
    }
  }, [roleFilter, statusFilter])

  React.useEffect(() => {
    void load()
  }, [load])

  const setStatus = React.useCallback(
    async (id: string, status: 'queued' | 'dismissed') => {
      setBusyId(id)
      setNotice(null)
      try {
        const res = await fetch('/api/content-studio/specialist-signals', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, status }),
        })
        const json = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || !json.ok) throw new Error(json.error || `signals ${res.status}`)
        setNotice(status === 'queued' ? 'Signal queued — it will fold into briefs and the opportunity queue.' : 'Signal dismissed.')
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Update failed')
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  const openCount = signals.filter((s) => s.status === 'new' || s.status === 'queued').length

  return (
    <section style={panelCard}>
      <div style={{ ...kickerStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>🛰</span>SPECIALIST INTEL
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            aria-label="Filter by specialist role"
            value={roleFilter}
            onChange={(ev) => setRoleFilter(ev.target.value)}
            style={{
              fontFamily: E.mono, fontSize: 10, padding: '4px 8px', borderRadius: 0,
              border: `1px solid ${E.hairline}`, background: E.paper, color: E.ink,
            }}
          >
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(ev) => setStatusFilter(ev.target.value === 'all' ? 'all' : 'open')}
            style={{
              fontFamily: E.mono, fontSize: 10, padding: '4px 8px', borderRadius: 0,
              border: `1px solid ${E.hairline}`, background: E.paper, color: E.ink,
            }}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => void load()}
            style={{
              fontFamily: E.mono, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 0,
              border: `1px solid ${E.gold}`, background: 'transparent', color: E.gold,
              cursor: 'pointer', letterSpacing: '0.06em',
            }}
          >
            ↻ REFRESH
          </button>
        </span>
      </div>

      {notice && (
        <div style={{ fontSize: 11, color: E.mossGreen, fontFamily: E.mono, marginBottom: 10 }}>
          ✓ {notice}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: E.red, fontFamily: E.mono, marginBottom: 10 }}>
          {error} {/does not exist|relation/i.test(error) ? '— run studio_specialist_signals.sql' : ''}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: E.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
          Loading specialist feeds…
        </div>
      ) : signals.length === 0 ? (
        <div style={{ fontFamily: E.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
          No {statusFilter === 'open' ? 'open' : ''} specialist signals. Specialists stay dull until they
          surface a brief as a lean JSON signal.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: E.inkDim, fontFamily: E.mono }}>
            {openCount} open · {signals.length} shown
          </div>
          {signals.map((s) => {
            const status = s.status as SignalStatus
            const isOpen = status === 'new' || status === 'queued'
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 12px', border: `1px solid ${E.hairlineSoft}`,
                  background: E.cream,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '2px 7px', background: E.goldSoft, color: E.goldDeep,
                    }}>
                      {ROLE_LABEL[s.role] || s.role}
                    </span>
                    {s.region && (
                      <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>
                        {s.region}
                      </span>
                    )}
                    <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
                      P{s.priority}
                    </span>
                    <span style={{
                      fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      color: STATUS_COLOR[status],
                    }}>
                      {STATUS_LABEL[status]}
                    </span>
                    {s.relatedJobId && (
                      <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
                        job {s.relatedJobId.slice(0, 8)}
                      </span>
                    )}
                    <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
                      {s.created_at ? new Date(s.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: E.ink, lineHeight: 1.45, marginTop: 4 }}>
                    {summary(s)}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {status === 'new' && (
                      <button
                        disabled={busyId === s.id}
                        onClick={() => void setStatus(s.id, 'queued')}
                        style={{
                          fontFamily: E.mono, fontSize: 9.5, fontWeight: 700, padding: '4px 9px', borderRadius: 0,
                          border: `1px solid ${E.gold}`, background: E.gold, color: '#fff',
                          cursor: 'pointer', letterSpacing: '0.06em',
                        }}
                      >
                        QUEUE
                      </button>
                    )}
                    <button
                      disabled={busyId === s.id}
                      onClick={() => void setStatus(s.id, 'dismissed')}
                      style={{
                        fontFamily: E.mono, fontSize: 9.5, fontWeight: 700, padding: '4px 9px', borderRadius: 0,
                        border: `1px solid ${E.hairline}`, background: 'transparent', color: E.inkMuted,
                        cursor: 'pointer', letterSpacing: '0.06em',
                      }}
                    >
                      DISMISS
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 9, color: E.inkDim, fontFamily: E.mono, marginTop: 10 }}>
        Signal contract: POST /api/content-studio/specialist-signals · statuses new → queued → consumed | dismissed · PAIN excluded
      </div>
    </section>
  )
}