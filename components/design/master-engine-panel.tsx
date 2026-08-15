'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import type { ContentJob } from './studio-ui-shared'

const C = E

// ── Types mirroring lib/seoFactory/masterEngine.ts (kept local for the UI) ──
type SubsystemId =
  | 'intent' | 'content' | 'semantic' | 'technical' | 'links'
  | 'eeat' | 'schema' | 'serp' | 'freshness' | 'experience'

interface MasterReport {
  generatedAt: string
  intent: string
  intentLabel: string
  composite: number | null
  grade: string | null
  weights: Record<SubsystemId, number>
  subsystems: Record<SubsystemId, { score: number | null; coverage: number }>
  deltas: Record<SubsystemId, number | null>
  baseline: Record<SubsystemId, number>
  coverage: { computed: number; total: number; pct: number }
  risks: Array<{ code: string; severity: string; message: string }>
  recommendations: Array<{
    priority: number; subsystem: SubsystemId; action: string
    lift: number; confidence: number; effort: string; value: number
  }>
  prediction: {
    top10Probability: number | null; top3Probability: number | null
    expectedLift: number; expectedTrafficLift: number | null
  }
  computedSignals: Array<{ id: string; label: string; subsystem: SubsystemId; value: number | null; computed: boolean }>
}

interface LearnSummary {
  models: Array<{
    intent: string; n: number; confidence: number
    diagnostics: { accuracy: number | null; brier: number | null; calibration: number | null; stability: number | null }
    weights: Record<SubsystemId, number>
  }>
  driftWarnings: string[]
}

const SUBSYSTEM_ORDER: SubsystemId[] = [
  'intent', 'content', 'semantic', 'technical', 'links',
  'eeat', 'schema', 'serp', 'freshness', 'experience',
]
const SUBSYSTEM_SHORT: Record<SubsystemId, string> = {
  intent: 'Intent', content: 'Content', semantic: 'Semantic', technical: 'Technical',
  links: 'Links', eeat: 'E-E-A-T', schema: 'Schema', serp: 'SERP',
  freshness: 'Freshness', experience: 'Experience',
}
const GRADE_COLOR: Record<string, string> = {
  A: '#166534', B: '#3F6F3F', C: '#B45309', D: '#C2410C', F: '#DC2626',
}

function bar(v: number, color: string = E.gold): React.ReactElement {
  return (
    <div style={{ flex: 1, height: 6, background: E.surface3, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(2, Math.min(100, v * 100))}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

/**
 * MASTER SEO ENGINE panel — the Review-stage brain.
 *
 * Runs the 130+ signal engine over the selected job and surfaces:
 *  · composite grade + intent-conditioned weights
 *  · per-subsystem score vs SERP-consensus baseline (competitive deltas)
 *  · risk / eligibility gates (blockers vs warnings)
 *  · prioritized recommendations (Priority = Lift × Confidence × Value / Cost)
 *  · predicted top-10 / top-3 probabilities + expected lift
 *  · signal coverage report (which of the 130+ variables were computed)
 *  · adaptive learning status when historical outcomes are attached
 */
export function MasterEnginePanel({ job, notice }: { job: ContentJob | null; notice?: (msg: string) => void }) {
  const [report, setReport] = React.useState<MasterReport | null>(null)
  const [learn, setLearn] = React.useState<LearnSummary | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function run() {
    if (!job) {
      setError('Open a job first — the engine needs a topic, keyword and content to score.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/seo-engine/master', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; error?: string; report?: MasterReport; learn?: LearnSummary | null
      }
      if (!res.ok || !data.report) {
        throw new Error(data.error || `Engine returned ${res.status}`)
      }
      setReport(data.report)
      setLearn(data.learn ?? null)
      notice?.(`Master Engine: ${data.report.grade ?? '—'} (${data.report.composite ?? '—'}/100) · ${data.report.intentLabel}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Engine run failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="studio-master-engine" style={{ background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${E.hairline}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20 }}>🧠</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: C.serif, fontSize: 17, color: E.ink, fontWeight: 700 }}>Master SEO Engine</div>
          <div style={{ fontFamily: C.mono, fontSize: 9.5, color: E.inkDim, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
            130+ signals · intent-conditioned weights · competitive deltas · risk gates · prediction
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !job}
          style={{
            padding: '8px 16px', borderRadius: 0, border: `1px solid ${E.gold}`,
            background: busy ? E.goldSoft : E.gold, color: busy ? E.goldDeep : '#FFFFFF',
            fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Running…' : 'Run full analysis'}
        </button>
      </div>

      {error && (
        <div style={{ margin: '12px 18px 0', padding: '10px 14px', background: E.redSoft, border: `1px solid ${E.redBorder}`, color: E.red, fontFamily: C.mono, fontSize: 11 }}>
          ⛔ {error}
        </div>
      )}

      {!report && !error && (
        <div style={{ padding: '34px 18px', textAlign: 'center' }}>
          <div style={{ fontFamily: C.serif, fontStyle: 'italic', color: E.inkMuted, maxWidth: 520, margin: '0 auto', fontSize: 14 }}>
            {job
              ? `Score “${job.title || job.topic}” against the SERP consensus — click “Run full analysis” to see the layered report, competitive deltas and prioritized fixes.`
              : 'Select a draft in the Review stage, then run the engine to get a full competitive analysis of the article.'}
          </div>
        </div>
      )}

      {report && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Composite + prediction row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, paddingTop: 14 }}>
            <Stat tile="Composite score" value={report.composite == null ? '—' : `${report.composite}/100`} accent={report.grade ? GRADE_COLOR[report.grade] : E.inkMuted} sub={`grade ${report.grade ?? '—'} · ${report.intentLabel}`} />
            <Stat tile="Predicted top-10" value={report.prediction.top10Probability == null ? '—' : `${report.prediction.top10Probability}%`} accent={E.blue} sub="logistic probability" />
            <Stat tile="Predicted top-3" value={report.prediction.top3Probability == null ? '—' : `${report.prediction.top3Probability}%`} accent={E.navy} sub="logistic probability" />
            <Stat tile="Expected lift" value={`+${report.prediction.expectedLift}%`} accent={E.mossGreen} sub={report.prediction.expectedTrafficLift == null ? 'close the deltas' : `≈ ${report.prediction.expectedTrafficLift} organic clicks`} />
            <Stat tile="Signal coverage" value={`${report.coverage.pct}%`} accent={E.gold} sub={`${report.coverage.computed} / ${report.coverage.total} computed`} />
          </div>

          {/* Risk gates */}
          {report.risks.length > 0 && (
            <div style={{ border: `1px solid ${E.hairline}`, background: E.cream }}>
              <SectionTitle>Risk &amp; eligibility gates</SectionTitle>
              <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {report.risks.map((r) => (
                  <div key={r.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, fontFamily: C.mono }}>
                    <span style={{ color: r.severity === 'blocker' ? E.red : E.orange, fontWeight: 700 }}>
                      {r.severity === 'blocker' ? '⛔' : '⚠'}
                    </span>
                    <span style={{ color: r.severity === 'blocker' ? E.red : E.inkSoft }}>{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.risks.length === 0 && (
            <div style={{ padding: '10px 14px', border: `1px solid ${E.hairline}`, background: E.greenSoft, color: E.green, fontFamily: C.mono, fontSize: 11.5 }}>
              ✅ No risk gates tripped — page is eligible for indexing and ranking.
            </div>
          )}

          {/* Subsystem scores + deltas */}
          <div style={{ border: `1px solid ${E.hairline}` }}>
            <SectionTitle>Subsystem scores vs SERP consensus</SectionTitle>
            <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {SUBSYSTEM_ORDER.map((s) => {
                const sub = report.subsystems[s]
                const delta = report.deltas[s]
                const score = sub?.score
                const pct = score == null ? null : Math.round(score * 100)
                const deltaColor = delta == null ? E.inkDim : delta >= 0 ? E.mossGreen : E.orange
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 84, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {SUBSYSTEM_SHORT[s]}
                    </span>
                    {bar(score ?? 0, score == null ? E.inkDim : pct! >= 70 ? E.mossGreen : pct! >= 50 ? E.gold : E.orange)}
                    <span style={{ width: 46, textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: score == null ? E.inkDim : E.ink }}>
                      {pct == null ? '—' : pct}
                    </span>
                    <span style={{ width: 58, textAlign: 'right', fontFamily: C.mono, fontSize: 10, color: deltaColor }}>
                      {delta == null ? '' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}`}
                    </span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 14, marginTop: 4, fontFamily: C.mono, fontSize: 9, color: E.inkDim }}>
                <span><span style={{ color: E.mossGreen }}>■</span> vs SERP baseline</span>
                <span>delta = page − consensus</span>
                <span>weight: intent-conditioned ({report.intentLabel})</span>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div style={{ border: `1px solid ${E.hairline}` }}>
            <SectionTitle>Prioritized recommendations · Priority = Lift × Confidence × Value / Cost</SectionTitle>
            <div style={{ padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {report.recommendations.length === 0 && (
                <div style={{ padding: '8px 0', color: E.green, fontFamily: C.mono, fontSize: 11.5 }}>✅ No recommendations — the page clears every subsystem bar.</div>
              )}
              {report.recommendations.map((r, i) => (
                <div key={`${r.subsystem}-${i}`} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < report.recommendations.length - 1 ? `1px dashed ${E.hairline}` : 'none', alignItems: 'center' }}>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, color: E.goldDeep, fontWeight: 700, width: 30 }}>#{i + 1}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, width: 74, textTransform: 'uppercase' }}>{SUBSYSTEM_SHORT[r.subsystem]}</span>
                  <span style={{ flex: 1, fontSize: 11.5, color: E.inkSoft }}>{r.action}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, color: E.inkDim, width: 40, textAlign: 'right' }}>+{Math.round(r.lift * 100)}%</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, color: r.effort === 'low' ? E.mossGreen : r.effort === 'medium' ? E.orange : E.red, width: 44, textAlign: 'right', textTransform: 'uppercase' }}>{r.effort}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, color: E.goldDeep, width: 40, textAlign: 'right', fontWeight: 700 }}>{r.priority}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Adaptive learning */}
          {learn && (
            <div style={{ border: `1px solid ${E.hairline}` }}>
              <SectionTitle>Adaptive learning — weights retrained from {learn.models.reduce((a, m) => a + m.n, 0)} historical outcome(s)</SectionTitle>
              <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {learn.driftWarnings.map((w) => (
                  <div key={w} style={{ fontFamily: C.mono, fontSize: 10.5, color: E.orange }}>⚠ {w}</div>
                ))}
                {learn.models.map((m) => (
                  <div key={m.intent} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontFamily: C.mono }}>
                    <span style={{ color: E.goldDeep, fontWeight: 700, width: 90 }}>{m.intent.toUpperCase()}</span>
                    <span style={{ color: E.inkMuted }}>n={m.n} · conf {(m.confidence * 100).toFixed(0)}%</span>
                    <span style={{ color: E.inkMuted }}>acc {m.diagnostics.accuracy == null ? '—' : (m.diagnostics.accuracy * 100).toFixed(0)}%</span>
                    <span style={{ color: E.inkMuted }}>stability {m.diagnostics.stability == null ? '—' : (m.diagnostics.stability * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, textAlign: 'right' }}>
            analyzed {new Date(report.generatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px', borderBottom: `1px solid ${E.hairline}`,
      fontFamily: C.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: E.inkMuted, background: E.surface2,
    }}>
      {children}
    </div>
  )
}

function Stat({ tile, value, accent, sub }: { tile: string; value: string; accent: string; sub: string }) {
  return (
    <div style={{ border: `1px solid ${E.hairline}`, padding: '12px 14px', background: E.cream }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{tile}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: C.serif, color: accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: E.inkMuted, marginTop: 4, fontFamily: C.mono }}>{sub}</div>
    </div>
  )
}
