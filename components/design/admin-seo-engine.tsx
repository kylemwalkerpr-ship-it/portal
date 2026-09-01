'use client'
/**
 * SEO MASTER ENGINE — v2 redesign
 *
 * One brain, six precise surfaces. No guesswork, no ambiguity:
 *
 *   🗺  Lifecycle        — (stage × country) coverage of the immigrant journey
 *   🌐  Knowledge Radar  — fresh policy/trend/guidance intel (verifiable sources)
 *   🧭  Master Planner   — ranked cluster missions with compliance scores
 *   🔗  Auto-Interlink   — generated link graph (who links to whom, why, score)
 *   🤖  LLM Visibility   — share of voice in ChatGPT/Perplexity/AI Overview audits
 *   🛡  Compliance Gate  — AEO/GEO/YMYL enforcement with explicit blockers
 *
 * Every button is dedicated and labeled. Every number is explained in its sub.
 * The engine plans and measures; humans command.
 */
import React from 'react'
import AdminRankingModel from './admin-ranking-model'
import { StudioModelHostSelect } from './studio-model-host-select'
import { FUNNEL_ACTION_LABELS } from '@/lib/seoEngine/rankingModel'

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

const TABS = [
  { key: 'lifecycle', icon: '🗺', label: 'Lifecycle' },
  { key: 'knowledge', icon: '🌐', label: 'Knowledge' },
  { key: 'planner', icon: '🧭', label: 'Planner' },
  { key: 'interlink', icon: '🔗', label: 'Interlinks' },
  { key: 'llm', icon: '🤖', label: 'LLM Voice' },
  { key: 'rank', icon: '📊', label: 'Ranking' },
  { key: 'gate', icon: '🛡', label: 'Compliance' },
] as const
type TabKey = (typeof TABS)[number]['key']

const KIND_META: Record<string, { icon: string; color: string; label: string }> = {
  policy: { icon: '🏛', color: C.navy, label: 'Policy' },
  guidance: { icon: '📘', color: C.blue, label: 'Guidance' },
  trend: { icon: '📈', color: C.violet, label: 'Trend' },
  signal: { icon: '📡', color: C.green, label: 'Signal' },
  competitor: { icon: '👀', color: C.orange, label: 'Competitor' },
  manual: { icon: '✍️', color: C.gold, label: 'Manual' },
}

const REASON_META: Record<string, { icon: string; label: string }> = {
  ontology_neighbor: { icon: '🧩', label: 'Ontology neighbor' },
  marketplace_cta: { icon: '🛒', label: 'Marketplace CTA' },
  cluster_related: { icon: '🧲', label: 'Cluster related' },
  journey_next: { icon: '➡️', label: 'Journey next' },
  journey_prev: { icon: '⬅️', label: 'Journey prev' },
  cross_country: { icon: '🌍', label: 'Cross-country' },
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

export default function SeoMasterEngine({ onBrief, onIngest }: Props) {
  const [tab, setTab] = React.useState<TabKey>('lifecycle')
  const [lifecycle, setLifecycle] = React.useState<Record<string, unknown>[] | null>(null)
  const [knowledge, setKnowledge] = React.useState<{ items: Array<Record<string, unknown>>; sources: Array<Record<string, unknown>> } | null>(null)
  const [plans, setPlans] = React.useState<{ plans: Array<Record<string, unknown>>; coverage: Array<Record<string, unknown>> } | null>(null)
  const [interlinks, setInterlinks] = React.useState<Record<string, unknown> | null>(null)
  const [visibility, setVisibility] = React.useState<Record<string, unknown> | null>(null)
  const [gate, setGate] = React.useState<Record<string, unknown> | null>(null)
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expandedPlan, setExpandedPlan] = React.useState<string | null>(null)
  const [stageFilter, setStageFilter] = React.useState<string>('all')
  const [countryFilter, setCountryFilter] = React.useState<string>('all')
  // Discover-stage engine pin for the planner narrative briefs — the engine
  // pair (Claude Opus 5 lead + Grok complement) is the default; Qwen3.6 27B
  // via Entrim and other command-host pins are selectable.
  const [engineModelPin, setEngineModelPin] = React.useState<string>('')
  const [ilStage, setIlStage] = React.useState<string>('visa')
  const [ilCountry, setIlCountry] = React.useState<string>('CA')
  const [gateDraft, setGateDraft] = React.useState<string>('')
  const [gateVerdict, setGateVerdict] = React.useState<Record<string, unknown> | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const loadAll = React.useCallback(async () => {
    setError(null)
    const [life, kn, pl, il, vis, gt, st] = await Promise.all([
      fetch('/api/seo-engine/lifecycle').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/knowledge').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/plan').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/interlink').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/llm-visibility').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/gate').then((r) => r.json()).catch(() => ({ ok: false })),
      fetch('/api/seo-engine/status').then((r) => r.json()).catch(() => ({ ok: false })),
    ])
    if (life.ok && Array.isArray(life.stages)) setLifecycle(life.stages)
    if (kn.ok) setKnowledge(kn)
    if (pl.ok) setPlans(pl)
    if (il.ok) setInterlinks(il)
    if (vis.ok) setVisibility(vis)
    if (gt.ok) setGate(gt)
    if (st.ok) setStatus(st)
    if (!st.ok) setError('Some engine surfaces are unreachable — is the seo_master_engine migration applied?')
  }, [])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 5000)
  }

  const runIngest = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitPerSource: 8, maxAiItems: 8 }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'ingestion failed')
      onIngest?.({ stored: data.itemsStored || 0, fetched: data.itemsFetched || 0, aiSummarized: data.aiSummarized || 0 })
      flash(`Ingested ${data.itemsStored} items from ${data.sourcesRun} sources`)
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
      const res = await fetch('/api/seo-engine/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: stageFilter === 'all' ? undefined : stageFilter, country: countryFilter === 'all' ? undefined : countryFilter, limit: 20, aiProvider: engineModelPin }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'planning failed')
      flash(`Planner produced ${data.count} ranked cluster missions`)
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
      flash(`Ontology seeded: ${data.total} life-cycle cells`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'seed failed')
    } finally {
      setBusy(false)
    }
  }

  const generateInterlinks = async () => {
    setBusy(true); setError(null)
    try {
      const slug = `seo-${ilStage}-${ilCountry.toLowerCase()}`
      const res = await fetch('/api/seo-engine/interlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        sourceSlug: slug, stage: ilStage, country: ilCountry,
        contentType: ilStage === 'visa' || ilStage === 'citizenship' || ilStage === 'family' ? 'marketplace_landing' : 'regional_page',
      }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'interlink failed')
      flash(`Generated ${data.edges?.length || 0} interlink edges for ${STAGE_LABELS[ilStage]} · ${ilCountry}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'interlink generation failed')
    } finally {
      setBusy(false)
    }
  }

  const runLlmAudit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/llm-visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxAudits: 10 }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'audit failed')
      flash(`LLM audit: ${data.cited}/${data.total} queries cited the estate (${data.shareOfVoice}% share of voice)`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LLM audit failed')
    } finally {
      setBusy(false)
    }
  }

  const runFanOutAudit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/llm-visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fanOut: true, planLimit: 10, maxPerPlan: 6, maxAudits: 18 }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'fan-out audit failed')
      flash(`Fan-out audit: ${data.cited}/${data.total} sub-queries across ${data.clusters} clusters cited the estate (${data.shareOfVoice}%)`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fan-out audit failed')
    } finally {
      setBusy(false)
    }
  }

  const runGateOnDraft = async () => {
    if (!gateDraft.trim() || gateDraft.trim().length < 60) {
      setError('Paste at least 60 characters of draft content to run the gate.')
      return
    }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/seo-engine/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        subjectType: 'draft', stage: 'visa', country: 'CA', draft: gateDraft, title: 'Compliance gate draft check',
      }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'gate failed')
      setGateVerdict(data)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'gate enforcement failed')
    } finally {
      setBusy(false)
    }
  }

  const coverageMap = new Map<string, number>()
  for (const c of plans?.coverage || []) coverageMap.set(String(c.cell || ''), Number(c.topScore) || 0)
  const seededCount = lifecycle?.length || 0

  const badge = (label: string, bg: string, fg: string) => (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700, fontFamily: C.mono, background: bg, color: fg, whiteSpace: 'nowrap' }}>{label}</span>
  )

  const Kpi = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: '10px 12px', boxShadow: C.shadowCard }}>
      <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: C.mono, margin: '2px 0 0' }}>{value}</div>
      <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{sub}</div>
    </div>
  )

  return (
    <div>
      {/* ── Engine identity + command strip ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, fontFamily: C.serif, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧠 SEO Master Engine <span style={{ fontSize: 9, fontFamily: C.mono, fontWeight: 600, color: C.gold, background: C.goldSoft, padding: '2px 8px', borderRadius: 999 }}>v2 · seven brains</span>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
            Life-cycle ontology · daily intel · auto-interlink · LLM share-of-voice · ranking model · compliance enforcement
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={seedLifecycle} disabled={busy} style={btnGhost} title="Upsert the 36 life-cycle cells into Supabase">
            🗺 Seed ontology
          </button>
          <button type="button" onClick={runIngest} disabled={busy} style={{ ...btnSolid(C.navy) }} title="Scrape all intelligence sources now">
            {busy ? '⏳ Working…' : '🌐 Ingest knowledge'}
          </button>
          <button type="button" onClick={runPlan} disabled={busy} style={{ ...btnSolid(C.gold) }} title="Rank GSC demand into cluster missions">
            {busy ? '⏳ Working…' : '🧭 Run planner'}
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ padding: '9px 14px', borderRadius: C.radiusSm, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontWeight: 600, marginBottom: 12 }}>✓ {notice}</div>
      )}
      {error && (
        <div style={{ padding: '9px 14px', borderRadius: C.radiusSm, background: C.redSoft, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 11, fontFamily: C.mono, marginBottom: 12 }}>⚠ {error}</div>
      )}

      {/* ── KPI strip (six brains) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Kpi label="Lifecycle" value={String(seededCount || '—')} sub="cells seeded (36 max)" color={C.cyan2} />
        <Kpi label="Knowledge" value={fmtN((status?.knowledge as { total?: number } | undefined)?.total ?? (knowledge?.items?.length ?? 0))} sub="intel items stored" color={C.violet} />
        <Kpi label="Plans" value={String((status?.plans as { total?: number } | undefined)?.total ?? plans?.plans?.length ?? 0)} sub="cluster missions" color={C.green} />
        <Kpi label="Interlinks" value={String((status?.interlinks as { planned?: number } | undefined)?.planned ?? 0)} sub={`${(status?.interlinks as { applied?: number } | undefined)?.applied ?? 0} applied`} color={C.blue} />
        <Kpi label="LLM voice" value={`${(status?.llmVisibility as { shareOfVoice?: number } | undefined)?.shareOfVoice ?? 0}%`} sub="share of voice" color={C.violet} />
        <Kpi label="Model" value={`${(status?.rankingModel as { latestTotal?: number } | undefined)?.latestTotal ?? '—'}`} sub={`${(status?.rankingModel as { computed?: number } | undefined)?.computed ?? 0} scored`} color={C.gold} />
        <Kpi label="Gate" value={`${(status?.gate as { passRate?: number } | undefined)?.passRate ?? 0}%`} sub={`avg ${(status?.gate as { avgScore?: number } | undefined)?.avgScore ?? 0}/100`} color={C.orange} />
      </div>

      {/* ── Tab navigation (dedicated surfaces) ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              background: tab === t.key ? C.navy : C.surface, color: tab === t.key ? '#fff' : C.textMuted,
              border: `1px solid ${tab === t.key ? C.navy : C.border}`, transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ 1 · LIFECYCLE ══════════════ */}
      {tab === 'lifecycle' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🗺 Immigrant Life-cycle Map</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Every page we produce belongs to exactly one cell. Coverage = number of plans in that cell.</p>
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
                  const cellRow = (lifecycle || []).filter((c) => String(c.stage) === stage)
                  return (
                    <tr key={stage} style={{ borderTop: `1px solid ${C.border2}` }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
                        {STAGE_LABELS[stage] || stage}
                        {cellRow.some((c) => c.ymyl_level === 'critical') && (
                          <span title="YMYL-critical stage — gate threshold 85" style={{ marginLeft: 6, cursor: 'help' }}>🛡</span>
                        )}
                      </td>
                      {COUNTRIES.map((country) => {
                        const cell = cellRow.find((c) => String(c.country) === country)
                        const score = coverageMap.get(`${stage}|${country.toLowerCase()}`) || 0
                        const hasPlan = score > 0
                        const ymyl = cell ? String(cell.ymyl_level) : ''
                        return (
                          <td key={country} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            <div
                              title={hasPlan ? `Plans: ${score} (opportunity score)` : cell ? `${STAGE_LABELS[stage]} · ${country}: not yet planned` : 'not seeded'}
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
      )}

      {/* ══════════════ 2 · KNOWLEDGE ══════════════ */}
      {tab === 'knowledge' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🌐 Knowledge Radar</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Fresh policy, guidance & trend intel — official sources + Google News fallbacks.</p>
            </div>
            <button type="button" onClick={runIngest} disabled={busy} style={{ ...btnSolid(C.navy) }}>
              {busy ? '⏳ Ingesting…' : '⚡ Ingest now'}
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {(knowledge?.items || []).length === 0 && (
              <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                No knowledge ingested yet — hit “⚡ Ingest now” to pull USCIS, Home Office, IRCC, Home Affairs, Google Search Central & Trends.
              </div>
            )}
            {(knowledge?.items || []).slice(0, 40).map((it) => {
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
                      <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.5, marginTop: 3 }}>{String(it.ai_summary || it.summary).slice(0, 280)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════ 3 · PLANNER ══════════════ */}
      {tab === 'planner' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🧭 Master Planner Queue</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Ranked missions: GSC demand × knowledge bias × lifecycle priority. ⚡ Brief hands one to the composer.</p>
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
              <StudioModelHostSelect
                lane="command"
                pin={engineModelPin || 'runbios-claude-opus'}
                onPinChange={setEngineModelPin}
                modelAriaLabel="Discover planner AI model"
                hostAriaLabel="Discover planner AI provider"
                selectStyle={{ padding: '5px 8px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: C.mono, background: C.surface, color: C.text }}
              />
              <button type="button" onClick={runPlan} disabled={busy} style={{ ...btnSolid(C.gold) }}>
                {busy ? '⏳ Planning…' : '🧭 Run planner'}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {(plans?.plans || []).length === 0 && (
              <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                No cluster plans yet — run the planner to rank GSC demand into lifecycle missions.
              </div>
            )}
            {(plans?.plans || []).slice(0, 25).map((p) => {
              const score = Number(p.compliance_score) || 0
              const st = String(p.status || 'planned')
              const stMeta = STATUS_META[st] || STATUS_META.planned
              const open = expandedPlan === String(p.cluster_id)
              // Phase D — plan→composer handoff: honor a TitleLab candidate as
              // the card title, and surface mission economics (est. $/mo +
              // funnel action) as mono badges next to it. The ⚡ Brief payload
              // keeps p.titleCandidates / p.expectedRevenue / p.actionType so
              // the composer threads them into the drafter contract.
              const rawCands = p.titleCandidates as unknown
              let firstCandidate = ''
              if (Array.isArray(rawCands) && rawCands.length) {
                const head = rawCands[0]
                firstCandidate = typeof head === 'string' ? String(head) : String((head as Record<string, unknown>)?.title || '')
              } else if (typeof rawCands === 'string') {
                firstCandidate = String(rawCands)
              }
              const cardTitle = String(
                firstCandidate || (p.plan as Record<string, unknown>)?.pillar || p.pillar || p.title || p.primary_term,
              )
              const expRev = p.expectedRevenue as { usdPerMonth?: number } | number | undefined
              const revUsd = expRev == null ? 0 : Math.round(typeof expRev === 'number' ? expRev : Number(expRev?.usdPerMonth) || 0)
              const actLabel = p.actionType
                ? (FUNNEL_ACTION_LABELS[p.actionType as keyof typeof FUNNEL_ACTION_LABELS] || String(p.actionType))
                : ''
              return (
                <div key={String(p.cluster_id)} style={{ borderBottom: `1px solid ${C.border2}` }}>
                  <div style={{ padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setExpandedPlan(open ? null : String(p.cluster_id))}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                        {badge(stMeta.label, stMeta.bg, stMeta.fg)}
                        {badge(String(p.country), C.blueSoft, C.blue)}
                        {badge(STAGE_LABELS[String(p.stage)] || String(p.stage), C.cyanSoft, C.cyan2)}
                        {String(p.ymyl) === 'critical' && badge('YMYL', C.goldSoft, C.gold)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{cardTitle}</div>
                        {revUsd > 0 && (
                          <span title="Expected USD/month from winning this position battle (ranking-model estimate)" style={{ padding: '2px 7px', borderRadius: 999, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, color: C.green, fontFamily: C.mono, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            💷 ~${fmtN(revUsd)}/mo
                          </span>
                        )}
                        {actLabel && (
                          <span title="Funnel action assigned by the planner" style={{ padding: '2px 7px', borderRadius: 999, background: C.violetSoft, border: `1px solid #DDD6FE`, color: C.violet, fontFamily: C.mono, fontSize: 9, fontWeight: 700 }}>
                            {actLabel}
                          </span>
                        )}
                      </div>
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
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {onBrief && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); onBrief(p) }} style={{ ...btnSolid(C.navy), padding: '4px 10px' }} title={`Pre-fill the brief composer with this mission${revUsd > 0 ? ` · 💷 ~$${fmtN(revUsd)}/mo` : ''}${actLabel ? ` · ${actLabel}` : ''}`}>
                            ⚡ Brief
                          </button>
                        )}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedPlan(open ? null : String(p.cluster_id)) }} style={{ ...btnGhost, padding: '4px 10px' }}>
                          {open ? '▲ Hide' : '▼ Details'}
                        </button>
                      </div>
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
                          <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Blueprint</div>
                          <div style={{ fontSize: 10.5, color: C.text }}>Pillar: <strong>{String((p.plan as Record<string, unknown>)?.pillar || p.primary_term)}</strong></div>
                          {Boolean(((p.plan as Record<string, unknown>)?.spokes as string[] | undefined)?.length) && (
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Spokes: {((p.plan as Record<string, unknown>).spokes as string[]).slice(0, 3).join(' · ')}</div>
                          )}
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
      )}

      {/* ══════════════ 4 · AUTO-INTERLINK ══════════════ */}
      {tab === 'interlink' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, padding: 16, boxShadow: C.shadowCard }}>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif, marginBottom: 4 }}>🔗 Auto-Interlink Generator</h2>
            <p style={{ margin: 0, fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
              Pick a life-cycle cell and the engine builds a scored link graph: journey neighbors, cross-country comparisons, marketplace CTA and cluster siblings — with anchors and H2 placement.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, textTransform: 'uppercase' }}>Stage</label>
              <select value={ilStage} onChange={(e) => setIlStage(e.target.value)} style={{ padding: '6px 10px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'inherit', background: C.surface, color: C.text }}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
              <label style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, textTransform: 'uppercase' }}>Country</label>
              <select value={ilCountry} onChange={(e) => setIlCountry(e.target.value)} style={{ padding: '6px 10px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'inherit', background: C.surface, color: C.text }}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={generateInterlinks} disabled={busy} style={{ ...btnSolid(C.navy) }}>
                {busy ? '⏳ Generating…' : '🔗 Generate interlink plan'}
              </button>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                {(status?.interlinks as { planned?: number; applied?: number } | undefined)?.planned ?? 0} planned · {(status?.interlinks as { applied?: number } | undefined)?.applied ?? 0} applied
              </span>
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>Link graph ({interlinks?.edges ? (interlinks.edges as unknown[]).length : 0} edges)</h2>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {(!interlinks?.edges || (interlinks.edges as unknown[]).length === 0) && (
                <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                  No interlink edges yet — generate a plan above, and every future article can embed it.
                </div>
              )}
              {(interlinks?.edges as Array<Record<string, unknown>> | undefined)?.map((e) => {
                const reason = REASON_META[String(e.reason)] || { icon: '🔗', label: String(e.reason) }
                return (
                  <div key={String(e.id)} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13, width: 20, textAlign: 'center', flexShrink: 0 }}>{reason.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
                        {badge(reason.label, C.cyanSoft, C.cyan2)}
                        {badge(String(e.status).toUpperCase(), e.status === 'applied' ? C.greenSoft : C.goldSoft, e.status === 'applied' ? C.green : C.gold)}
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>score {Number(e.score).toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text }}>{String(e.anchor_text)}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, wordBreak: 'break-all' }}>
                        {String(e.source_slug)} → <a href={String(e.target_url)} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none' }}>{String(e.target_url)}</a>
                      </div>
                      {Boolean(e.context_h2) && <div style={{ fontSize: 10, color: C.textDim }}>Place in: “{String(e.context_h2)}”</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 5 · LLM VISIBILITY ══════════════ */}
      {tab === 'llm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, padding: 16, boxShadow: C.shadowCard }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif, marginBottom: 4 }}>🤖 LLM / AEO Visibility</h2>
                <p style={{ margin: 0, fontSize: 11, color: C.textMuted, maxWidth: 560 }}>
                  Prompt audits: the engine asks an LLM to answer real estate queries with sources, then checks whether yousafeconsultancy.com was cited. Share of voice = cited ÷ audited.
                </p>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={runLlmAudit} disabled={busy} style={{ ...btnSolid(C.violet) }}>
                  {busy ? '⏳ Auditing…' : '🤖 Run audit batch (10 queries)'}
                </button>
                <button type="button" onClick={runFanOutAudit} disabled={busy} style={{ ...btnGhost, color: C.violet, borderColor: C.violetSoft }} title="Build sub-queries from the top cluster plans (FAQ + related terms) and audit each for estate citations — the results feed the aeoGeo family score">
                  {busy ? '⏳ Auditing…' : '🕸 Fan-out audits (per cluster)'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 14 }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', position: 'relative', background: `conic-gradient(${C.violet} ${(visibility?.shareOfVoice as number) || 0}%, ${C.surface3} 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: C.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: C.mono, color: C.violet }}>{(visibility?.shareOfVoice as number) || 0}%</div>
                  <div style={{ fontSize: 8, color: C.textDim, fontFamily: C.mono, textTransform: 'uppercase' }}>share of voice</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: C.text }}><strong>{(visibility?.total as number) || 0}</strong> audits · <strong style={{ color: C.green }}>{(visibility?.cited as number) || 0}</strong> cited the estate</div>
                {Object.entries((visibility?.byStage as Record<string, number>) || {}).map(([stage, count]) => (
                  <div key={stage} style={{ fontSize: 10.5, color: C.textMuted, display: 'flex', gap: 6 }}>
                    <span style={{ fontFamily: C.mono }}>{STAGE_LABELS[stage] || stage}</span>
                    <span style={{ color: C.text, fontFamily: C.mono }}>{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fan-out share-of-voice per cluster — feeds the aeoGeo family */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>🕸 Fan-out voice by cluster</h2>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted }}>
                Measured sub-query citations per top cluster — the ranking model's aeoGeo family consumes exactly this (cited ÷ total).
              </p>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: '10px 18px' }}>
              {!visibility?.byCluster || Object.keys((visibility.byCluster as Record<string, unknown>) || {}).length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>
                  No fan-out audits yet — run “🕸 Fan-out audits” to measure per-cluster answer-engine voice.
                </div>
              ) : (
                Object.entries((visibility.byCluster as Record<string, { cited: number; total: number }>) || {}).slice(0, 20).map(([cid, cell]) => {
                  const rate = cell.total ? Math.round((cell.cited / cell.total) * 100) : 0
                  const plan = (plans?.plans || []).find((p) => String(p.cluster_id) === cid)
                  return (
                    <div key={cid} style={{ padding: '7px 0', borderBottom: `1px solid ${C.border2}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cid}>
                          {String(plan?.primary_term || cid)}
                        </span>
                        <span style={{ fontSize: 9.5, fontFamily: C.mono, color: C.textMuted, flexShrink: 0 }}>
                          {cell.cited}/{cell.total} · <b style={{ color: rate >= 50 ? C.green : rate > 0 ? C.orange : C.red }}>{rate}%</b>
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: C.surface3, overflow: 'hidden' }}>
                        <div style={{ width: `${rate}%`, height: '100%', borderRadius: 999, background: rate >= 50 ? C.violet : rate > 0 ? C.gold : C.red, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>Audit trail ({(visibility?.audits as unknown[] | undefined)?.length || 0})</h2>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {(!visibility?.audits || (visibility.audits as unknown[]).length === 0) && (
                <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                  No audits yet — run a batch to see your share of voice in generative engines.
                </div>
              )}
              {(visibility?.audits as Array<Record<string, unknown>> | undefined)?.map((a) => (
                <div key={String(a.id)} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{a.cited ? '✅' : '❌'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
                      {badge(a.cited ? 'CITED' : 'NOT CITED', a.cited ? C.greenSoft : C.redSoft, a.cited ? C.green : C.red)}
                      {a.fan_out ? badge(`FAN-OUT ${String(a.source_field || '').toUpperCase()}`, C.violetSoft, C.violet) : null}
                      {Number(a.share_of_voice) > 0 ? badge(`SOV ${Math.round(Number(a.share_of_voice) * 100)}%`, C.violetSoft, C.violet) : null}
                      {a.stage ? badge(STAGE_LABELS[String(a.stage)] || String(a.stage), C.cyanSoft, C.cyan2) : null}
                      {a.country ? badge(String(a.country), C.blueSoft, C.blue) : null}
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{String(a.engine)} · {timeAgo(String(a.created_at))}</span>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text }}>{String(a.query)}</div>
                    {Boolean((a.cited_urls as string[] | undefined)?.length) && (
                      <div style={{ fontSize: 10, color: C.green, fontFamily: C.mono, wordBreak: 'break-all', marginTop: 2 }}>
                        {(a.cited_urls as string[]).join(' · ')}
                      </div>
                    )}
                    {Boolean(a.snippet) && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>“{String(a.snippet).slice(0, 220)}{String(a.snippet).length > 220 ? '…' : ''}”</div>}
                    {Boolean(a.top_competitor) && (
                      <div style={{ fontSize: 10, color: C.orange, marginTop: 3 }}>
                        👀 Top competitor: <b>{String(a.top_competitor)}</b>
                        {Number(a.competitor_share) > 0 ? ` (${Math.round(Number(a.competitor_share) * 100)}% of engines)` : ''}
                        {Number(a.share_of_voice) > 0 ? ` · estate ${Math.round(Number(a.share_of_voice) * 100)}%` : ''}
                      </div>
                    )}
                    {Boolean((a.competitor_domains as string[] | undefined)?.length) && (
                      <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>
                        competitors: {(a.competitor_domains as string[]).join(' · ')}
                      </div>
                    )}
                    {Boolean((a.actions as unknown[] | undefined)?.length) && (
                      <div style={{ marginTop: 4, padding: '5px 8px', borderRadius: C.radiusSm, background: C.violetSoft }}>
                        {(a.actions as Array<{ action: string }>).slice(0, 3).map((act) => (
                          <div key={act.action} style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>→ {act.action}</div>
                        ))}
                        {!a.cited && (
                          <a
                            href={`/dashboard/admin/content?tab=research&aeo=${encodeURIComponent(String(a.id || ''))}`}
                            style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontFamily: C.mono, fontWeight: 700, color: C.violet, textDecoration: 'none' }}
                          >
                            Fix on matching URL →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 6 · RANKING MODEL ══════════════ */}
      {tab === 'rank' && <AdminRankingModel />}

      {/* ══════════════ 7 · COMPLIANCE GATE ══════════════ */}
      {tab === 'gate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, padding: 16, boxShadow: C.shadowCard }}>
            <h2 style={{ margin: 0, fontSize: 16, color: C.navy, fontWeight: 700, fontFamily: C.serif, marginBottom: 4 }}>🛡 AEO / GEO / YMYL Compliance Gate</h2>
            <p style={{ margin: 0, fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
              Paste a draft and the gate deterministically scans evidence — statistics, statutes, disclaimers, author bylines, question headings, internal links — then scores it.
              YMYL-critical stages (visa · citizenship · family) require ≥85 and never pass without a statutory anchor + disclaimer.
            </p>
            <textarea
              value={gateDraft}
              onChange={(e) => setGateDraft(e.target.value)}
              placeholder="Paste draft content here (at least 60 characters) to run the compliance gate…"
              style={{ width: '100%', minHeight: 140, padding: 10, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, fontSize: 11.5, fontFamily: C.mono, resize: 'vertical', background: C.surface, color: C.text, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={runGateOnDraft} disabled={busy || gateDraft.trim().length < 60} style={{ ...btnSolid(C.navy) }}>
                {busy ? '⏳ Scanning…' : '🛡 Run compliance gate'}
              </button>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                Gate runs so far: {((status?.gate as { runs?: number } | undefined)?.runs ?? gate?.runs ? (gate.runs as unknown[]).length : 0)} · pass rate {(status?.gate as { passRate?: number } | undefined)?.passRate ?? 0}%
              </span>
            </div>

            {gateVerdict && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {gateVerdict.passed
                    ? badge('PASSED', C.greenSoft, C.green)
                    : badge('BLOCKED', C.redSoft, C.red)}
                  <span style={{ fontSize: 24, fontWeight: 800, fontFamily: C.mono, color: Number(gateVerdict.score) >= 85 ? C.green : Number(gateVerdict.score) >= 70 ? C.orange : C.red }}>
                    {Number(gateVerdict.score)}/100
                  </span>
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>threshold {Number(gateVerdict.threshold)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
                  {Object.entries((gateVerdict.compliance as { byCategory?: Record<string, { met: number; total: number; score: number }> })?.byCategory || {}).map(([cat, v]) => (
                    <div key={cat} style={{ padding: 8, borderRadius: C.radiusXs, background: C.surface2, fontSize: 10.5 }}>
                      <div style={{ fontFamily: C.mono, textTransform: 'uppercase', color: C.textDim, letterSpacing: '0.04em' }}>{cat}</div>
                      <div style={{ fontWeight: 700, color: Number(v.score) >= 80 ? C.green : Number(v.score) >= 60 ? C.orange : C.red, fontFamily: C.mono }}>
                        {Number(v.met)}/{Number(v.total)} <span style={{ color: C.textDim, fontWeight: 500 }}>({Number(v.score)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
                {Boolean((gateVerdict.blockers as string[] | undefined)?.length) && (
                  <div>
                    <div style={{ fontSize: 10, color: C.red, fontFamily: C.mono, fontWeight: 700, marginBottom: 4 }}>MISSING ({((gateVerdict.blockers as string[] | undefined) || []).length}):</div>
                    {((gateVerdict.blockers as string[]) || []).slice(0, 12).map((b, i) => (
                      <div key={i} style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.6 }}>• {b}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden', boxShadow: C.shadowCard }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700, fontFamily: C.serif }}>Recent gate runs</h2>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {(!gate?.runs || (gate.runs as unknown[]).length === 0) && (
                <div style={{ padding: 22, textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>
                  No gate runs yet — every draft and plan check is recorded here for full accountability.
                </div>
              )}
              {(gate?.runs as Array<Record<string, unknown>> | undefined)?.map((r) => (
                <div key={String(r.id)} style={{ padding: '9px 18px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                  {r.passed ? badge('PASS', C.greenSoft, C.green) : badge('BLOCK', C.redSoft, C.red)}
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.text }}>
                    <span style={{ fontWeight: 700 }}>{Number(r.score)}</span>
                    <span style={{ color: C.textDim, fontFamily: C.mono }}>/{Number(r.threshold)}</span>
                    <span style={{ color: C.textMuted }}> · {String(r.subject_type)}</span>
                    {r.stage ? <span style={{ color: C.textDim, fontFamily: C.mono }}> · {STAGE_LABELS[String(r.stage)] || String(r.stage)}</span> : null}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, flexShrink: 0 }}>{timeAgo(String(r.created_at))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Engine health footer ── */}
      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: C.radiusSm, background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
          Last run: {(status?.runs as Array<Record<string, unknown>> | undefined)?.[0]
            ? `${String(((status?.runs as Array<Record<string, unknown>>)[0] as Record<string, unknown>).kind)} · ${timeAgo(String(((status?.runs as Array<Record<string, unknown>>)[0] as Record<string, unknown>).started_at))}`
            : 'no runs yet'}
        </span>
        <button type="button" onClick={loadAll} style={btnGhost} title="Refresh all six engine surfaces">
          ↻ Refresh all surfaces
        </button>
      </div>
    </div>
  )
}
