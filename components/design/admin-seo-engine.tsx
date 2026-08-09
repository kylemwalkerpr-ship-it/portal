'use client'
/**
 * SEO Master Engine — the Master Planner panel for the Command Center.
 *
 * One glanceable surface that embodies the full engine concept:
 *   Lifecycle map  → (stage × country) coverage of the immigrant journey
 *   Knowledge feed → fresh policy/trend intel ingested daily (verifiable sources)
 *   Plan queue     → ranked cluster plans with AEO/GEO/YMYL compliance scores
 *   Engine health  → run audit trail + source registry (accountable)
 *
 * Every CTA is explicit and manual — the engine plans, humans command.
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

const STAGES = ['intent', 'schools', 'work', 'housing', 'visa', 'settlement', 'citizenship', 'family', 'relatives']
const STAGE_LABELS: Record<string, string> = {
  intent: 'Intent', schools: 'Schools', work: 'Work', housing: 'Housing', visa: 'Visa/Legal',
  settlement: 'Settlement', citizenship: 'PR & Citizenship', family: 'Family', relatives: 'Relatives',
}
const COUNTRIES = ['US', 'UK', 'CA', 'AU']

const KIND_META: Record<string, { icon: string; color: string; label: string }> = {
  policy: { icon: '🏛', color: C.navy, label: 'Policy' },
  guidance: { icon: '📘', color: C.blue, label: 'Guidance' },
  trend: { icon: '📈', color: C.violet, label: 'Trend' },
  signal: { icon: '📡', color: C.green, label: 'Signal' },
  competitor: { icon: '👀', color: C.orange, label: 'Competitor' },
  manual: { icon: '✍️', color: C.gold, label: 'Manual' },
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  planned: { label: 'PLANNED', bg: '#DBEAFE', fg: '#1E40AF' },
  briefed: { label: 'BRIEFED', bg: '#FEF3C7', fg: '#92400E' },
  launched: { label: 'LAUNCHED', bg: '#D1FAE5', fg: '#065F46' },
  done: { label: 'DONE', bg: '#E5E7EB', fg: '#374151' },
  skipped: { label: 'SKIPPED', bg: '#FEE2E2', fg: '#991B1B' },
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

function fmtN(n: number | null | undefined): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

interface Props {
  onBrief?: (plan: Record<string, unknown>) => void
  onIngest?: (result: { stored: number; fetched: number; aiSummarized: number }) => void
}

export default function SeoMasterEngine({ onBrief, onIngest }: Props) {
  const [lifecycle, setLifecycle] = React.useState<Record<string, unknown>[] | null>(null)
  const [knowledge, setKnowledge] = React.useState<{ items: Array<Record<string, unknown>>; sources: Array<Record<string, unknown>> } | null>(null)
  const [plans, setPlans] = React.useState<{ plans: Array<Record<string, unknown>>; coverage: Array<Record<string, unknown>> } | null>(null)
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [activePlan, setActivePlan] = React.useState<Record<string, unknown> | null>(null)
  const [stageFilter, setStageFilter] = React.useState<string>('all')
  const [countryFilter, setCountryFilter] = React.useState<string>('all')

  const loadAll = React.useCallback(async () => {
    setError(null)
    const [life, kn, pl, st] = await Promise.all([
      fetch('/api/seo-engine/lifecycle').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/knowledge').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/plan').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/status').then((r) => r.json()).catch(() => ({ ok: false })),
    ])
    if (life.ok && Array.isArray(life.stages)) setLifecycle(life.stages)
    if (kn.ok) setKnowledge(kn)
    if (pl.ok) setPlans(pl)
    if (st.ok) setStatus(st)
    if (!life.ok || !kn.ok || !pl.ok || !st.ok) setError('Some engine surfaces are unreachable — is the seo_master_engine migration applied?')
  }, [])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  const runIngest = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitPerSource: 8, maxAiItems: 8 }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'ingestion failed')
      onIngest?.({ stored: data.itemsStored || 0, fetched: data.itemsFetched || 0, aiSummarized: data.aiSummarized || 0 })
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ingestion failed')
    } finally {
      setBusy(false)
    }
  }

  const runPlan = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: stageFilter === 'all' ? undefined : stageFilter, country: countryFilter === 'all' ? undefined : countryFilter, limit: 20 }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'planning failed')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'planning failed')
    } finally {
      setBusy(false)
    }
  }

  const seedLifecycle = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: true }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'seed failed')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'seed failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Lifecycle coverage matrix ──
  const coverageMap = new Map<string, number>()
  for (const c of plans?.coverage || []) coverageMap.set(String(c.cell || ''), Number(c.topScore) || 0)

  const lifecycleCells = lifecycle || []
  const seededCount = lifecycleCells.length

  const badge = (label: string, bg: string, fg: string) => (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: bg, color: fg, whiteSpace: 'nowrap' }}>{label}</span>
  )

  return (
    <div>
      {/* ── Engine status strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Lifecycle cells', value: String(seededCount || '—'), sub: '9 stages × 4 countries', color: C.cyan2 },
          { label: 'Knowledge items', value: fmtN((status?.knowledge as { total?: number } | undefined)?.total ?? (knowledge?.items?.length ?? 0)), sub: 'fresh intel ingested', color: C.violet },
          { label: 'Cluster plans', value: String((status?.plans as { total?: number } | undefined)?.total ?? plans?.plans?.length ?? 0), sub: 'master planner queue', color: C.green },
          { label: 'Last run', value: (status?.runs as Array<Record<string, unknown>> | undefined)?.[0] ? timeAgo(String(((status?.runs as Array<Record<string, unknown>>)[0] as Record<string, unknown>).started_at)) : '—', sub: 'engine audit trail', color: C.orange },
        ].map((k) => (
          <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: '10px 12px', boxShadow: C.shadowCard }}>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: C.mono, margin: '2px 0 0' }}>{k.value}</div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: C.radiusSm, background: C.redSoft, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 11, marginBottom: 14, fontFamily: C.mono }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Lifecycle map ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🗺 Immigrant Life-cycle Map</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>The full journey — intent → schools → work → housing → visa → settlement → citizenship → family → relatives. Coverage = plans per cell.</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {seededCount === 0 && (
              <button type="button" onClick={seedLifecycle} disabled={busy} style={{ padding: '6px 12px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                {busy ? '…' : 'Seed ontology'}
              </button>
            )}
          </div>
        </div>
        <div style={{ overflowX: 'auto', padding: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.textDim, fontFamily: C.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage</th>
                {COUNTRIES.map((c) => (
                  <th key={c} style={{ textAlign: 'center', padding: '6px 8px', color: C.navy, fontFamily: C.mono, fontSize: 11, fontWeight: 800 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAGES.map((stage) => {
                const cellRow = lifecycleCells.filter((c) => String(c.stage) === stage)
                return (
                  <tr key={stage} style={{ borderTop: `1px solid ${C.border2}` }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
                      {STAGE_LABELS[stage] || stage}
                      <span style={{ marginLeft: 6, fontSize: 9, color: C.textDim, fontFamily: C.mono }}>
                        {cellRow.map((c) => c.ymyl_level === 'critical' ? '🛡' : '').join('')}
                      </span>
                    </td>
                    {COUNTRIES.map((country) => {
                      const cell = cellRow.find((c) => String(c.country) === country)
                      const score = coverageMap.get(`${stage}|${country.toLowerCase()}`) || 0
                      const hasPlan = score > 0
                      const ymyl = cell ? String(cell.ymyl_level) : ''
                      return (
                        <td key={country} style={{ textAlign: 'center', padding: '6px 8px' }}>
                          <div
                            title={hasPlan ? `Plans: ${score} — opportunity score` : cell ? `${STAGE_LABELS[stage]} · ${country}: not yet planned` : 'not seeded'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                              minWidth: 64, padding: '5px 8px', borderRadius: C.radiusXs,
                              background: hasPlan ? (ymyl === 'critical' ? C.goldSoft : C.greenSoft) : C.surface2,
                              border: `1px solid ${hasPlan ? (ymyl === 'critical' ? C.goldBorder : C.greenBorder) : C.border2}`,
                              color: hasPlan ? (ymyl === 'critical' ? C.gold : C.green) : C.textDim,
                              fontFamily: C.mono, fontWeight: 700, fontSize: 10,
                            }}
                          >
                            {hasPlan ? `★ ${score}` : ymyl === 'critical' ? '🛡' : '·'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Knowledge feed ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🌐 Knowledge Radar</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Fresh policy, guidance & trend intel — ingested daily from official sources.</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={runIngest} disabled={busy} style={{ padding: '6px 12px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer', background: C.navy, color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
              {busy ? '…' : '⚡ Ingest now'}
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {(knowledge?.items || []).length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
              No knowledge ingested yet — hit “⚡ Ingest now” to pull USCIS, Home Office, IRCC, Home Affairs & Google Trends.
            </div>
          )}
          {(knowledge?.items || []).slice(0, 30).map((it) => {
            const kind = KIND_META[String(it.kind || 'policy')] || KIND_META.policy
            const countries = (it.countries as string[]) || []
            const stages = (it.stages as string[]) || []
            return (
              <div key={String(it.id)} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{kind.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                    {badge(kind.label, C.surface2, kind.color)}
                    {countries.map((c) => badge(c.toUpperCase(), C.blueSoft, C.blue))}
                    {stages.map((s) => badge(STAGE_LABELS[s] || s, C.violetSoft, C.violet))}
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{timeAgo(String(it.fetched_at || it.published_at))}</span>
                  </div>
                  <a href={String(it.url)} target="_blank" rel="noreferrer" style={{ color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', wordBreak: 'break-word' }}>
                    {String(it.title)}
                  </a>
                  {Boolean(it.ai_summary || it.summary) && (
                    <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.5, marginTop: 3 }}>{String(it.ai_summary || it.summary).slice(0, 260)}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Plan queue ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard, marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🧭 Master Planner</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Ranked cluster missions — GSC demand × knowledge bias × lifecycle priority.</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ padding: '5px 8px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'inherit', background: C.surface, color: C.text }}>
              <option value="all">All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ padding: '5px 8px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'inherit', background: C.surface, color: C.text }}>
              <option value="all">All countries</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={runPlan} disabled={busy} style={{ padding: '6px 12px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer', background: C.gold, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
              {busy ? '…' : '🧭 Run planner'}
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {(plans?.plans || []).length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
              No cluster plans yet — run the planner to rank GSC demand into lifecycle missions.
            </div>
          )}
          {(plans?.plans || []).slice(0, 25).map((p) => {
            const score = Number(p.compliance_score) || 0
            const st = String(p.status || 'planned')
            const stMeta = STATUS_META[st] || STATUS_META.planned
            const open = activePlan === p
            return (
              <div key={String(p.cluster_id)} style={{ borderBottom: `1px solid ${C.border2}` }}>
                <div
                  style={{ padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => setActivePlan(open ? null : p)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      {badge(stMeta.label, stMeta.bg, stMeta.fg)}
                      {badge(String(p.country), C.blueSoft, C.blue)}
                      {badge(STAGE_LABELS[String(p.stage)] || String(p.stage), C.cyanSoft, C.cyan2)}
                      {String(p.ymyl) === 'critical' && badge('YMYL', C.goldSoft, C.gold)}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{String(p.primary_term)}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginTop: 2 }}>
                      ★ {fmtN(Number(p.opportunity_score))} · {fmtN(Number(p.est_monthly_impressions))} imp/mo · {fmtN(Number(p.est_monthly_clicks))} clicks · pos #{Math.round(Number(p.position) || 0)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>COMPLIANCE</span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: C.mono, color: score >= 85 ? C.green : score >= 70 ? C.orange : C.red }}>{score}</span>
                    </div>
                    <div style={{ width: 90, height: 5, borderRadius: 999, background: C.surface3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, score)}%`, height: '100%', borderRadius: 999, background: score >= 85 ? C.green : score >= 70 ? C.orange : C.red }} />
                    </div>
                    {onBrief && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onBrief(p) }}
                        style={{ padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', background: C.navy, color: '#fff', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', marginTop: 4 }}
                      >
                        ⚡ Brief
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div style={{ padding: '0 18px 14px' }}>
                    <div style={{ background: C.surface2, borderRadius: C.radiusSm, padding: 12, fontSize: 11, color: C.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
                      {String(p.rationale || '')}
                      {p.brief ? <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border2}` }}>{String(p.brief)}</div> : null}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Content blueprint</div>
                        <div style={{ fontSize: 10.5, color: C.text }}>
                          Pillar: <strong>{String((p.plan as Record<string, unknown>)?.pillar || p.primary_term)}</strong>
                        </div>
                        {((p.plan as Record<string, unknown>)?.spokes as string[] | undefined)?.length ? (
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                            Spokes: {((p.plan as Record<string, unknown>).spokes as string[]).slice(0, 3).join(' · ')}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Distribution</div>
                        {((p.distribution as Array<Record<string, unknown>>) || []).map((d, i) => (
                          <div key={i} style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, wordBreak: 'break-all' }}>→ {String(d.repo)}/{String(d.path)}</div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Interlinks</div>
                        {((p.interlinks as string[]) || []).slice(0, 4).map((l, i) => (
                          <div key={i} style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>↔ {l}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Engine health / sources ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>⚙️ Engine Health</h2>
        </div>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Intelligence sources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {((status?.sources as Array<Record<string, unknown>>) || []).map((s) => (
                <div key={String(s.id)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.textMuted, padding: '3px 0', borderBottom: `1px solid ${C.border2}` }}>
                  <span>{(KIND_META[String(s.kind)] || KIND_META.policy).icon} {String(s.label)}</span>
                  <span style={{ fontFamily: C.mono, color: C.textDim }}>{((s.countries as string[]) || []).join('/')}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Run audit trail</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {((status?.runs as Array<Record<string, unknown>>) || []).slice(0, 8).map((r) => (
                <div key={String(r.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: C.textMuted, padding: '3px 0', borderBottom: `1px solid ${C.border2}` }}>
                  <span>
                    <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.text }}>{String(r.kind)}</span>
                    <span style={{ marginLeft: 6 }}>{timeAgo(String(r.started_at))}</span>
                  </span>
                  {badge(String(r.status).toUpperCase(), r.status === 'success' ? C.greenSoft : r.status === 'failed' ? C.redSoft : C.goldSoft, r.status === 'success' ? C.green : r.status === 'failed' ? C.red : C.gold)}
                </div>
              ))}
              {!((status?.runs as Array<Record<string, unknown>> | undefined)?.length) && (
                <div style={{ fontSize: 10.5, color: C.textDim, fontFamily: C.mono, padding: '6px 0' }}>No runs yet — every ingest/plan is logged here for full accountability.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
