'use client'
/**
 * RANKING MODEL — Command Center → Engine → 📊 Ranking
 *
 * Five panels over the seo-ranking-model-v1 engine:
 *   📡 Radar          — composite family scores per topic/page/plan
 *   📈 Forecast       — 30/60/90-day projections with explicit assumptions
 *   🧬 Lineage        — full job → regeneration timeline (nodes + events)
 *   🎁 Rewards        — outcome ledger, calibration history, weight deltas
 *   🎯 Execution      — forecast vs actual (GSC deltas) per topic; flags where
 *                       the model over/under-predicted
 *
 * Everything is read from /api/seo-engine/{rank,forecast,rewards,lineage,tracker}
 * and written through the same endpoints — deterministic, auditable, no AI in
 * the score.
 */
import React from 'react'

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
  radius: 12, radiusSm: 8, radiusXs: 6,
}

const FAMILY_LABELS: Record<string, { label: string; color: string }> = {
  demand: { label: 'Demand', color: '#1D4ED8' },
  intent: { label: 'Intent', color: '#6D28D9' },
  topicalAuthority: { label: 'Topical auth', color: '#0F766E' },
  aeoGeo: { label: 'AEO / GEO', color: '#B45309' },
  eeat: { label: 'E-E-A-T', color: '#065F46' },
  linkEquity: { label: 'Link equity', color: '#9A7B3B' },
  behavioral: { label: 'Behavioral', color: '#DB2777' },
  indexability: { label: 'Indexability', color: '#475569' },
}
const FAMILY_ORDER = ['demand', 'intent', 'topicalAuthority', 'aeoGeo', 'eeat', 'linkEquity', 'behavioral', 'indexability']

const VERDICT_META: Record<string, { label: string; bg: string; fg: string }> = {
  over_predicted: { label: 'OVER', bg: '#FEF2F2', fg: '#991B1B' },
  under_predicted: { label: 'UNDER', bg: '#EFF6FF', fg: '#1D4ED8' },
  on_track: { label: 'ON TRACK', bg: '#ECFDF5', fg: '#065F46' },
  mixed: { label: 'MIXED', bg: '#FEF3C7', fg: '#9A7B3B' },
  no_data: { label: 'NO DATA', bg: '#EBEDF0', fg: '#6B7280' },
}
const HORIZONS: Array<'30' | '60' | '90'> = ['30', '60', '90']

function badge(label: string, bg: string, fg: string) {
  return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: bg, color: fg, whiteSpace: 'nowrap' }}>{label}</span>
}
function timeAgo(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts).getTime()
  if (!Number.isFinite(d)) return '—'
  const s = Math.max(0, Math.round((Date.now() - d) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
function fmtN(n: number | string | null | undefined): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}
const btnSolid = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '7px 13px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: bg, color: fg, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
})
const btnGhost: React.CSSProperties = {
  padding: '7px 13px', borderRadius: C.radiusXs, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
}
const inputStyle: React.CSSProperties = {
  padding: '7px 11px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 12, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

function FamilyBars({ families }: { families: Record<string, { score: number }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {FAMILY_ORDER.map((fam) => {
        const meta = FAMILY_LABELS[fam] || { label: fam, color: C.textDim }
        const score = families?.[fam]?.score ?? 0
        return (
          <div key={fam} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 74, fontSize: 8.5, color: C.textMuted, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{meta.label}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 999, background: C.surface3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, Math.min(100, score))}%`, height: '100%', borderRadius: 999, background: meta.color, transition: 'width 0.4s' }} />
            </div>
            <span style={{ width: 26, fontSize: 9, fontWeight: 800, fontFamily: C.mono, color: meta.color, textAlign: 'right' }}>{Math.round(score)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ForecastChart({ forecast }: { forecast: any }) {
  if (!forecast?.points?.length) {
    return <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>No forecast — compute a score or run the planner.</div>
  }
  const pts = forecast.points as Array<{ horizonDays: number; projectedPosition: number; projectedImpressions: number; projectedClicks: number; probabilityOfTop10: number }>
  const W = 320, H = 150, padL = 30, padR = 12, padT = 14, padB = 22
  const positions = pts.map((p) => p.projectedPosition)
  const maxPos = Math.max(10, ...positions)
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW
  const y = (p: number) => padT + (p / maxPos) * plotH
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.projectedPosition).toFixed(1)}`).join(' ')
  const area = `${padL},${padT + plotH} ${line} ${x(pts.length - 1).toFixed(1)},${padT + plotH}`
  const color = '#1D4ED8'
  return (
    <div>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
        {[1, 5, 10].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke={C.border2} strokeWidth={1} />
            <text x={padL - 4} y={y(g) + 3} textAnchor="end" fontSize={8} fill={C.textDim} fontFamily={C.mono}>#{g}</text>
          </g>
        ))}
        <polygon points={area} fill={color} opacity={0.08} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={p.horizonDays}>
            <circle cx={x(i)} cy={y(p.projectedPosition)} r={4} fill={color} stroke="#fff" strokeWidth={1.2} />
            <text x={x(i)} y={y(p.projectedPosition) - 8} textAnchor="middle" fontSize={9} fill={C.text} fontFamily={C.mono} fontWeight={700}>#{Math.round(p.projectedPosition)}</text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={8.5} fill={C.textDim} fontFamily={C.mono}>d{p.horizonDays}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {pts.map((p) => (
          <div key={p.horizonDays} style={{ fontSize: 9, color: C.textMuted, fontFamily: C.mono, lineHeight: 1.5 }}>
            <div style={{ color: C.text, fontWeight: 700 }}>{fmtN(p.projectedImpressions)} imp</div>
            <div>{fmtN(p.projectedClicks)} clicks</div>
            <div style={{ color: C.green }}>P(top10) {Math.round(p.probabilityOfTop10 * 100)}%</div>
          </div>
        ))}
      </div>
      {(forecast.assumptions || []).slice(0, 2).map((a: string, i: number) => (
        <div key={i} style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono, marginTop: 4 }}>· {a}</div>
      ))}
    </div>
  )
}

export default function AdminRankingModel() {
  const [scores, setScores] = React.useState<Array<Record<string, any>>>([])
  const [forecasts, setForecasts] = React.useState<Array<Record<string, any>>>([])
  const [rewards, setRewards] = React.useState<Record<string, any> | null>(null)
  const [tracker, setTracker] = React.useState<Record<string, any> | null>(null)
  const [trackerHorizon, setTrackerHorizon] = React.useState<'30' | '60' | '90' | 'all'>('all')
  const [trackerBusy, setTrackerBusy] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [topicInput, setTopicInput] = React.useState('')
  const [lineageJob, setLineageJob] = React.useState('')
  const [lineage, setLineage] = React.useState<Array<Record<string, any>> | null>(null)
  const [lineageBusy, setLineageBusy] = React.useState(false)

  // Reward form
  const [rwUrl, setRwUrl] = React.useState('')
  const [rwAction, setRwAction] = React.useState('refresh')
  const [rwImp, setRwImp] = React.useState('')
  const [rwClicks, setRwClicks] = React.useState('')
  const [rwPos, setRwPos] = React.useState('')

  const flash = (msg: string, kind: 'success' | 'error' = 'success') => {
    setNotice(msg)
    setError(kind === 'error' ? msg : null)
    window.setTimeout(() => setNotice(null), 6000)
  }

  const loadAll = React.useCallback(async () => {
    setError(null)
    const [sc, fc, rw, tr] = await Promise.all([
      fetch('/api/seo-engine/rank?limit=12').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/forecast?limit=24').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/rewards?limit=30').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/tracker?horizon=all&limit=200').then((r) => r.json()).catch(() => ({ ok: false })),
    ])
    if (sc.ok && Array.isArray(sc.scores)) setScores(sc.scores)
    if (fc.ok && Array.isArray(fc.forecasts)) setForecasts(fc.forecasts)
    if (rw.ok) setRewards(rw)
    if (tr.ok) setTracker(tr)
  }, [])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  const computeTopic = async () => {
    if (!topicInput.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/rank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicInput.trim(), scope: 'topic', gsc: { impressions: 0, clicks: 0, position: 100 } }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'rank failed')
      flash(`Modeled “${data.score.topic}” → ${Math.round(data.score.total)}/100`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rank failed')
    } finally {
      setBusy(false)
    }
  }

  const computePlans = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/rank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'plans', limit: 12, persist: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || 'plan pass failed')
      flash(`Ranking model ran over ${data.computed ?? 0} planner missions`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'plan pass failed')
    } finally {
      setBusy(false)
    }
  }

  const loadLineage = async () => {
    const q = lineageJob.trim()
    if (!q) return
    setLineageBusy(true); setError(null)
    try {
      const target = /^[0-9a-f-]{20,}$/i.test(q) ? `jobId=${encodeURIComponent(q)}` : `topic=${encodeURIComponent(q)}`
      const res = await fetch(`/api/seo-engine/lineage?${target}`, { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'lineage failed')
      setLineage(Array.isArray(data.timeline) ? data.timeline : [])
      flash(`Lineage: ${(data.nodes || []).length} node(s) · ${(data.events || []).length} event(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'lineage failed')
    } finally {
      setLineageBusy(false)
    }
  }

  const recordReward = async () => {
    if (!rwUrl.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: rwUrl.trim(),
          action: rwAction,
          deltaImpressions: rwImp ? Number(rwImp) : undefined,
          deltaClicks: rwClicks ? Number(rwClicks) : undefined,
          deltaPosition: rwPos ? Number(rwPos) : undefined,
          recalibrate: true,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'reward failed')
      flash(`Reward ${data.event.reward} credited to ${data.event.action}${data.recalibrated ? ' · weights recalibrated' : ''}`)
      setRwUrl(''); setRwImp(''); setRwClicks(''); setRwPos('')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reward failed')
    } finally {
      setBusy(false)
    }
  }

  const loadTracker = async (horizon: '30' | '60' | '90' | 'all') => {
    setTrackerHorizon(horizon)
    setTrackerBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/seo-engine/tracker?horizon=${horizon}&limit=200`, { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok || data.ok === false) throw new Error(data.error || 'tracker failed')
      setTracker(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'tracker failed')
    } finally {
      setTrackerBusy(false)
    }
  }

  const weights = (rewards?.weights as Record<string, number>) || {}
  const calibration = (rewards?.calibration as Array<Record<string, any>>) || []
  const trackerRows = (tracker?.rows as Array<Record<string, any>>) || []
  const trackerSummary = (tracker?.summary as Record<string, any>) || null
  // Client-side filter mirrors the server-side horizon filter; it also guards
  // against a loadAll()/loadTracker() fetch race overwriting the fresh horizon
  // slice with the all-horizon snapshot.
  const trackerFiltered = trackerHorizon === 'all' ? trackerRows : trackerRows.filter((r) => String(r.horizonDays) === trackerHorizon)
  const trackerEvaluated = trackerFiltered.filter((r) => r.matured && r.actual?.source !== 'none')
  const trackerInFlight = trackerFiltered.filter((r) => !r.matured)
  const trackerNoData = trackerFiltered.filter((r) => r.matured && r.actual?.source === 'none')

  const deltaColor = (v: number | null, worseWhenPositive: boolean): string => {
    if (v == null) return C.textDim
    return (worseWhenPositive ? v > 0 : v < 0) ? C.red : (worseWhenPositive ? v < 0 : v > 0) ? C.green : C.textDim
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {notice && <div style={{ padding: '9px 14px', borderRadius: C.radiusSm, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontWeight: 600 }}>✓ {notice}</div>}
      {error && <div style={{ padding: '9px 14px', borderRadius: C.radiusSm, background: C.redSoft, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 11, fontFamily: C.mono }}>⚠ {error}</div>}

      {/* ══ 1 · RANKING RADAR ══ */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>📡 Ranking Radar</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
              Composite model <span style={{ fontFamily: C.mono }}>v1</span> — demand · intent · topical authority · AEO/GEO · E-E-A-T · links · behavior · indexability. Deterministic, no AI in the score.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={topicInput} onChange={(e) => setTopicInput(e.target.value)} placeholder="Model a topic…" style={{ ...inputStyle, width: 200 }} onKeyDown={(e) => e.key === 'Enter' && computeTopic()} />
            <button type="button" onClick={computeTopic} disabled={busy || !topicInput.trim()} style={btnGhost} title="Compute + persist the composite score for a topic">📡 Model topic</button>
            <button type="button" onClick={computePlans} disabled={busy} style={{ ...btnSolid(C.navy) }} title="Run the ranking model over the top planner missions">🧭 Score top plans</button>
          </div>
        </div>
        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {scores.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
              No ranking scores yet — model a topic or run “Score top plans”.
            </div>
          )}
          {scores.map((s) => (
            <div key={String(s.subject_key || s.id)} style={{ padding: '11px 18px', borderBottom: `1px solid ${C.border2}` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                    {badge(String(s.intent_primary || 'topic').toUpperCase(), C.cyanSoft, C.cyan2)}
                    {s.country ? badge(String(s.country), C.blueSoft, C.blue) : null}
                    {s.stage ? badge(String(s.stage), C.violetSoft, C.violet) : null}
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{timeAgo(String(s.computed_at))}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{String(s.topic)}</div>
                  <FamilyBars families={(s.families as Record<string, { score: number }>) || {}} />
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: C.mono, color: Number(s.total) >= 70 ? C.green : Number(s.total) >= 45 ? C.orange : C.red }}>{Math.round(Number(s.total))}</div>
                  <div style={{ fontSize: 8, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase' }}>/100 · conf {Math.round((Number(s.confidence) || 0) * 100)}%</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {(s.recommended_actions as string[] | undefined || []).slice(0, 2).map((a, i) => (
                  <div key={i} style={{ fontSize: 9.5, color: C.orange, fontFamily: C.mono }}>→ {String(a)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 2 · FORECAST + 3 · LINEAGE ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        {/* Forecast */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>📈 Forecast (30/60/90d)</h2>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted }}>Latest projections with explicit assumptions — decision support, not a guarantee.</p>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', padding: 12 }}>
            {(forecasts || []).length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>No forecasts yet — they are generated with every ranking score.</div>
            )}
            {(forecasts || []).slice(0, 6).map((f, i) => (
              <div key={String(f.id || i)} style={{ padding: 10, borderRadius: C.radiusSm, background: C.surface2, marginBottom: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.text, marginBottom: 2 }}>{String(f.topic)} <span style={{ color: C.textDim, fontFamily: C.mono, fontWeight: 500 }}>· d{f.horizon_days}</span></div>
                <div style={{ fontSize: 9.5, color: C.textMuted, fontFamily: C.mono, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>pos #{Math.round(Number(f.projected_position))}</span>
                  <span>{fmtN(f.projected_impressions)} imp</span>
                  <span>{fmtN(f.projected_clicks)} clicks</span>
                  <span style={{ color: C.green }}>P(top10) {Math.round((Number(f.probability_top10) || 0) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lineage */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🧬 Lineage Timeline</h2>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted }}>Every regeneration chain, from original job → refresh/expand/resume, with gate events.</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={lineageJob} onChange={(e) => setLineageJob(e.target.value)} placeholder="Job ID or topic…" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && loadLineage()} />
              <button type="button" onClick={loadLineage} disabled={lineageBusy || !lineageJob.trim()} style={btnGhost}>Show</button>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: '10px 18px' }}>
            {!lineage && <div style={{ padding: 14, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>Enter a job ID or topic to walk its regeneration lineage.</div>}
            {lineage && lineage.length === 0 && <div style={{ padding: 14, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>No lineage found.</div>}
            {lineage && lineage.length > 0 && (
              <div style={{ position: 'relative', paddingLeft: 18 }}>
                <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: C.border2 }} />
                {lineage.map((entry, i) => (
                  <div key={`${entry.id}-${i}`} style={{ position: 'relative', padding: '7px 0 7px 12px' }}>
                    <div style={{ position: 'absolute', left: -16, top: 12, width: 8, height: 8, borderRadius: 999, background: entry.kind === 'node' ? (entry.mode ? C.gold : C.navy) : (entry.status === 'blocked' || entry.status === 'failed' ? C.red : C.green), border: `2px solid ${C.surface}` }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 1 }}>
                      {entry.kind === 'node' ? badge('JOB', C.cyanSoft, C.cyan2) : badge(String(entry.actor || 'system').toUpperCase(), C.surface3, C.textMuted)}
                      {entry.mode ? badge(`↻ ${String(entry.mode).toUpperCase()}`, C.goldSoft, C.gold) : null}
                      {entry.status ? badge(String(entry.status).toUpperCase(), C.surface2, C.textMuted) : null}
                      <span style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono }}>{timeAgo(entry.ts ? new Date(entry.ts).toISOString() : null)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.text, lineHeight: 1.45 }}>{String(entry.label)}</div>
                    {entry.reason && <div style={{ fontSize: 9, color: C.orange, fontFamily: C.mono }}>why: {String(entry.reason)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ 4 · REWARDS ══ */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🎁 Reward Loop & Calibration</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted }}>Outcome ledger → bounded weight recalibration. The model learns from what the estate actually experiences.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <input value={rwUrl} onChange={(e) => setRwUrl(e.target.value)} placeholder="Shipped page URL…" style={{ ...inputStyle, width: 240 }} />
            <select value={rwAction} onChange={(e) => setRwAction(e.target.value)} style={{ ...inputStyle, width: 130 }}>
              {['refresh', 'depth', 'schema', 'interlink', 'new_page', 'backlink', 'geo_fix', 'ctr_rewrite'].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={rwImp} onChange={(e) => setRwImp(e.target.value)} placeholder="Δ imp" style={{ ...inputStyle, width: 70 }} />
            <input value={rwClicks} onChange={(e) => setRwClicks(e.target.value)} placeholder="Δ clicks" style={{ ...inputStyle, width: 80 }} />
            <input value={rwPos} onChange={(e) => setRwPos(e.target.value)} placeholder="Δ pos (-5)" style={{ ...inputStyle, width: 80 }} />
            <button type="button" onClick={recordReward} disabled={busy || !rwUrl.trim()} style={{ ...btnSolid(C.gold) }}>🎁 Credit outcome</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, padding: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Current weights</div>
            {FAMILY_ORDER.map((fam) => {
              const meta = FAMILY_LABELS[fam] || { label: fam, color: C.textDim }
              const w = Number(weights[fam]) || 0
              return (
                <div key={fam} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ width: 84, fontSize: 8.5, color: C.textMuted, fontFamily: C.mono, textTransform: 'uppercase' }}>{meta.label}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 999, background: C.surface3, overflow: 'hidden' }}>
                    <div style={{ width: `${w * 100}%`, height: '100%', background: meta.color }} />
                  </div>
                  <span style={{ width: 38, fontSize: 9, fontFamily: C.mono, color: C.textMuted, textAlign: 'right' }}>{(w * 100).toFixed(1)}%</span>
                </div>
              )
            })}
            <div style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono, marginTop: 6 }}>
              events: {(rewards?.summary as any)?.events ?? 0} · avg reward {(rewards?.summary as any)?.avgReward ?? 0} · total {(rewards?.summary as any)?.totalReward ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Recent reward events</div>
            {((rewards?.ledger as Array<Record<string, any>>) || []).slice(0, 8).map((r) => (
              <div key={String(r.id)} style={{ padding: '6px 8px', borderRadius: C.radiusXs, background: C.surface2, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                {badge(String(r.action).toUpperCase(), Number(r.reward) >= 0.5 ? C.greenSoft : C.goldSoft, Number(r.reward) >= 0.5 ? C.green : C.gold)}
                <div style={{ flex: 1, minWidth: 0, fontSize: 10, color: C.textMuted, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.page_url)}>
                  {String(r.page_url)}
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, fontFamily: C.mono, color: C.text }}>{Number(r.reward)}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Calibration history</div>
            {calibration.length === 0 && <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>No recalibrations yet — credit an outcome to see bounded weight shifts.</div>}
            {calibration.map((c) => (
              <div key={String(c.id)} style={{ padding: '6px 8px', borderRadius: C.radiusXs, background: C.surface2, marginBottom: 4, fontSize: 9.5, fontFamily: C.mono, color: C.textMuted }}>
                <span style={{ color: C.gold, fontWeight: 700 }}>↻ recalibrated</span> · {Number(c.events_count)} events · {timeAgo(String(c.recalibrated_at))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 5 · EXECUTION TRACKER ══ */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🎯 Execution Tracker · forecast vs actual</h2>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted }}>
                Matured 30/60/90-day forecasts vs what GSC actually delivered — deltas per topic, and where the model over- or under-predicted. Only matured runs get a verdict; snapshot actuals preferred, live 90d window flagged as approximate.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['all', '30', '60', '90'] as const).map((h) => (
                <button key={h} type="button" onClick={() => loadTracker(h)} disabled={trackerBusy}
                  style={{
                    padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: C.mono,
                    border: `1px solid ${trackerHorizon === h ? C.navy : C.border}`,
                    background: trackerHorizon === h ? C.navy : C.surface,
                    color: trackerHorizon === h ? '#fff' : C.textMuted,
                  }}>
                  {h === 'all' ? 'All horizons' : `d${h}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, padding: 12, background: C.surface2, borderBottom: `1px solid ${C.border2}` }}>
          {[
            { label: 'Evaluated', value: String(trackerSummary?.evaluated ?? 0), sub: `+${trackerSummary?.inFlight ?? 0} in flight · ${trackerSummary?.noData ?? 0} no data`, color: C.text },
            { label: 'On-track rate', value: `${trackerSummary?.onTrackRate ?? 0}%`, sub: 'within tolerance bands', color: C.green },
            { label: 'Over-predicted', value: String((trackerSummary?.byVerdict as any)?.over_predicted ?? 0), sub: 'model promised more', color: C.red },
            { label: 'Under-predicted', value: String((trackerSummary?.byVerdict as any)?.under_predicted ?? 0), sub: 'reality beat the model', color: C.blue },
            { label: 'Pos bias', value: `${trackerSummary?.positionBias ?? 0}`, sub: 'avg Δ rank (+ = optimistic)', color: Number(trackerSummary?.positionBias) > 2 ? C.orange : C.textMuted },
            { label: 'Avg pos err', value: `±${trackerSummary?.avgPositionError ?? 0}`, sub: `imp err ${Math.round((Number(trackerSummary?.avgImpressionError) || 0) * 100)}%`, color: C.textMuted },
          ].map((k) => (
            <div key={k.label} style={{ padding: '8px 10px', borderRadius: C.radiusSm, background: C.surface, border: `1px solid ${C.border2}` }}>
              <div style={{ fontSize: 8, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: C.mono, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 8, color: C.textDim, fontFamily: C.mono }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Per-horizon hit rates */}
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {HORIZONS.map((h) => {
            const ph = trackerSummary?.perHorizon?.[h] as Record<string, any> | undefined
            const vc = (ph?.byVerdict as Record<string, number>) || {}
            return (
              <div key={h} style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: C.mono, color: C.textMuted, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>d{h}</span>
                  <span>{ph?.evaluated ?? 0} evaluated · <span style={{ color: C.green, fontWeight: 700 }}>{ph?.onTrackRate ?? 0}% on-track</span></span>
                </div>
                <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: C.surface3 }}>
                  <div style={{ width: `${(vc.over_predicted ?? 0) / Math.max(1, ph?.evaluated ?? 1) * 100}%`, background: C.red }} title={`over ${vc.over_predicted ?? 0}`} />
                  <div style={{ width: `${(vc.under_predicted ?? 0) / Math.max(1, ph?.evaluated ?? 1) * 100}%`, background: C.blue }} title={`under ${vc.under_predicted ?? 0}`} />
                  <div style={{ width: `${(vc.on_track ?? 0) / Math.max(1, ph?.evaluated ?? 1) * 100}%`, background: C.green }} title={`on-track ${vc.on_track ?? 0}`} />
                  <div style={{ width: `${(vc.mixed ?? 0) / Math.max(1, ph?.evaluated ?? 1) * 100}%`, background: C.gold }} title={`mixed ${vc.mixed ?? 0}`} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {trackerFiltered.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
              {trackerBusy ? 'Loading tracker…' : 'No forecast runs yet — forecasts are persisted with every ranking score / daily cron.'}
            </div>
          )}
          {trackerEvaluated.map((r) => {
            const vm = VERDICT_META[String(r.overall)] || VERDICT_META.no_data
            const p = (r.projected as Record<string, any>) || {}
            const a = (r.actual as Record<string, any>) || {}
            const d = (r.deltas as Record<string, any>) || {}
            return (
              <div key={`${r.topic}-${r.horizonDays}-${r.runDate}`} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{String(r.topic)}</span>
                      {badge(`d${r.horizonDays}`, C.cyanSoft, C.cyan2)}
                      {badge(a.source === 'snapshot' ? `SNAP ${String(a.asOf).slice(5)}` : a.source === 'live' ? 'LIVE ~' : '—', C.surface3, C.textMuted)}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 9.5 }}>
                      <span style={{ color: C.textDim }}>proj <b style={{ color: C.text }}>#{Math.round(Number(p.position) || 100)}</b> → act <b style={{ color: deltaColor(d.position, true) }}>{a.position != null ? `#${Math.round(Number(a.position))}` : '—'}</b> <span style={{ color: deltaColor(d.position, true) }}>{d.position != null ? `${d.position > 0 ? '+' : ''}${d.position}` : ''}</span></span>
                      <span style={{ color: C.textDim }}>imp {fmtN(p.impressions)} → <b style={{ color: deltaColor(d.impressions, false) }}>{a.impressions != null ? fmtN(a.impressions) : '—'}</b> <span style={{ color: deltaColor(d.impressions, false) }}>{d.impressions != null ? `${d.impressions > 0 ? '+' : ''}${fmtN(d.impressions)}` : ''}</span></span>
                      <span style={{ color: C.textDim }}>clicks {fmtN(p.clicks)} → <b style={{ color: deltaColor(d.clicks, false) }}>{a.clicks != null ? fmtN(a.clicks) : '—'}</b></span>
                      <span style={{ color: C.textDim }}>run {String(r.runDate).slice(5)} · mature {String(r.maturityDate).slice(5)}</span>
                    </div>
                    {(r.flags as string[] | undefined || []).slice(0, 2).map((f, i) => (
                      <div key={i} style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>· {String(f)}</div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      {badge(vm.label, vm.bg, vm.fg)}
                      <span style={{ fontSize: 10, fontWeight: 800, fontFamily: C.mono, color: C.textMuted }}>{(Number(r.magnitude) * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ width: 120, height: 4, borderRadius: 999, background: C.surface3, overflow: 'hidden', marginTop: 4, marginLeft: 'auto' }}>
                      <div style={{ width: `${Math.min(100, Number(r.magnitude) * 100)}%`, height: '100%', background: Number(r.magnitude) > 0.5 ? C.red : Number(r.magnitude) > 0.25 ? C.orange : C.green }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {trackerInFlight.length > 0 && (
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, background: C.surface2 }}>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>In flight — {trackerInFlight.length} run(s) not yet matured</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {trackerInFlight.slice(0, 24).map((r) => (
                  <span key={`${r.topic}-${r.horizonDays}`} style={{ padding: '3px 8px', borderRadius: 999, background: C.surface, border: `1px solid ${C.border2}`, fontSize: 9, fontFamily: C.mono, color: C.textMuted }}>
                    {String(r.topic).slice(0, 26)} · d{r.horizonDays} · {r.daysToMaturity}d left
                  </span>
                ))}
              </div>
            </div>
          )}
          {trackerNoData.length > 0 && (
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, background: C.orangeSoft }}>
              <div style={{ fontSize: 9, color: C.orange, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Matured but unverifiable — {trackerNoData.length} run(s) with no GSC data near maturity</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {trackerNoData.slice(0, 24).map((r) => (
                  <span key={`${r.topic}-${r.horizonDays}`} title={(r.flags as string[] | undefined || []).join(' · ')} style={{ padding: '3px 8px', borderRadius: 999, background: C.surface, border: `1px solid ${C.goldBorder}`, fontSize: 9, fontFamily: C.mono, color: C.orange }}>
                    {String(r.topic).slice(0, 26)} · d{r.horizonDays} · mature {String(r.maturityDate).slice(5)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Worst misses / best surprises */}
        {(trackerSummary?.worstMisses?.length || trackerSummary?.bestSurprises?.length) ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, padding: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Worst misses · model most optimistic</div>
              {((trackerSummary?.worstMisses as Array<Record<string, any>>) || []).map((m, i) => (
                <div key={i} style={{ padding: '6px 8px', borderRadius: C.radiusXs, background: C.redSoft, marginBottom: 4, fontSize: 9.5, fontFamily: C.mono, color: C.textMuted }}>
                  <b style={{ color: C.text }}>{String(m.topic).slice(0, 34)}</b> · d{m.horizonDays} · proj #{Math.round(Number(m.projected?.position))} → act {m.actual?.position != null ? `#${Math.round(Number(m.actual.position))}` : '—'} · {(Number(m.magnitude) * 100).toFixed(0)}%
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Best surprises · reality beat the model</div>
              {((trackerSummary?.bestSurprises as Array<Record<string, any>>) || []).map((m, i) => (
                <div key={i} style={{ padding: '6px 8px', borderRadius: C.radiusXs, background: C.blueSoft, marginBottom: 4, fontSize: 9.5, fontFamily: C.mono, color: C.textMuted }}>
                  <b style={{ color: C.text }}>{String(m.topic).slice(0, 34)}</b> · d{m.horizonDays} · proj #{Math.round(Number(m.projected?.position))} → act {m.actual?.position != null ? `#${Math.round(Number(m.actual.position))}` : '—'} · {(Number(m.magnitude) * 100).toFixed(0)}%
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
