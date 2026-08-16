'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import type { ContentJob } from './studio-ui-shared'
import { consumeSseStream } from '@/lib/seoFactory/sse'

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
    top100Probability: number | null
    top20Probability: number | null
    top10Probability: number | null
    top3Probability: number | null
    position1Probability: number | null
    clickProbability: number | null
    conversionProbability: number | null
    expectedLift: number
    expectedTrafficLift: number | null
    expectedValue: number | null
  }
  derived: {
    competitiveGap: number | null
    contentSuperiority: number | null
    informationGainAdvantage: number | null
    authorityGap: number | null
    linkGap: number | null
    freshnessAdvantage: number | null
    experienceAdvantage: number | null
    trustAdvantage: number | null
    intentFitAdvantage: number | null
    evidenceAdvantage: number | null
    optimizationHeadroom: number | null
  }
  governance: {
    confidence: number | null
    modelVersion: string
    caveats: string[]
  }
  adaptation?: { usedLearned: boolean }
  computedSignals: Array<{ id: string; label: string; subsystem: SubsystemId; value: number | null; computed: boolean }>
  contentQuality?: {
    score: number | null
    confidence: number | null
    missingSubtopics: string[]
    topCompetitorUrl: string | null
    topCompetitorDepthScore: number | null
  }
  semanticNlp?: {
    score: number | null
    confidence: number | null
    missingEntities: string[]
    topCompetitorUrl: string | null
    topCompetitorEntityCoverage: number | null
    flags?: string[]
  }
  trace: Array<{
    seq: number; phase: string; message: string; detail?: string
    tone: string; progress: number
  }>
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
 * Runs the 240+ signal engine over the selected job and surfaces:
 *  · composite grade + intent-conditioned weights
 *  · per-subsystem score vs SERP-consensus baseline (competitive deltas)
 *  · risk / eligibility gates (blockers vs warnings)
 *  · prioritized recommendations (Priority = Lift × Confidence × Value / Cost)
 *  · full ranking probability ladder (top-100 → #1) + click/conversion/EV
 *  · derived features (competitive gap, information-gain, headroom)
 *  · model governance (confidence + data caveats)
 *  · signal coverage report (which of the 240+ variables were computed)
 *  · adaptive learning status when historical outcomes are attached
 */
export function MasterEnginePanel({ job, notice }: { job: ContentJob | null; notice?: (msg: string) => void }) {
  const [report, setReport] = React.useState<MasterReport | null>(null)
  const [learn, setLearn] = React.useState<LearnSummary | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [streaming, setStreaming] = React.useState(false)
  const [liveTrace, setLiveTrace] = React.useState<MasterReport['trace']>([])
  const [error, setError] = React.useState<string | null>(null)

  async function run() {
    if (!job) {
      setError('Open a job first — the engine needs a topic, keyword and content to score.')
      return
    }
    setBusy(true)
    setError(null)
    setReport(null)
    setLearn(null)
    // Immediate feedback — the live feed renders the moment the run starts,
    // before the first SSE frame arrives, so a busy panel is never silent.
    setLiveTrace([{ seq: -1, phase: 'connect', message: 'Connecting…', tone: 'info', progress: 0 }])
    setStreaming(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const res = await fetch('/api/seo-engine/master/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ jobId: job.id }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `Engine returned ${res.status}`)
      }
      let finalReport: MasterReport | null = null
      let finalLearn: LearnSummary | null = null
      let fellBack = false
      try {
        await consumeSseStream(res.body, (ev) => {
          if (ev.type === 'progress' && ev.step) {
            const s = ev.step as MasterReport['trace'][number]
            setLiveTrace((prev) => [...prev, s])
          } else if (ev.type === 'done') {
            finalReport = (ev.report as MasterReport) ?? null
            finalLearn = (ev.learn as LearnSummary | null) ?? null
          } else if (ev.type === 'error') {
            throw new Error(String(ev.error || 'Engine stream failed'))
          }
        })
      } catch (streamErr) {
        // Stream aborted by our timeout — fall through to the JSON fallback.
        if (!(streamErr instanceof Error && streamErr.name === 'AbortError')) throw streamErr
      }
      if (!finalReport) {
        // Stream closed without a `done` event (worker killed mid-run, network
        // drop). Fall back to the plain JSON report instead of surfacing a
        // hard error — the engine result is identical, just not streamed.
        fellBack = true
        const fb = await fetch('/api/seo-engine/master', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        })
        const fbData = await fb.json().catch(() => ({})) as { error?: string; report?: MasterReport; learn?: LearnSummary | null }
        if (!fb.ok || !fbData.report) {
          throw new Error(fbData.error || `Engine fallback returned ${fb.status}`)
        }
        finalReport = fbData.report
        finalLearn = fbData.learn ?? null
      }
      setReport(finalReport)
      setLearn(finalLearn)
      notice?.(`Master Engine: ${finalReport.grade ?? '—'} (${finalReport.composite ?? '—'}/100) · ${finalReport.intentLabel}${fellBack ? ' · stream dropped, used JSON' : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Engine run failed')
    } finally {
      clearTimeout(timeout)
      setBusy(false)
      setStreaming(false)
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
            240+ signals · derived features · probability ladder · governance · risk gates
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

      {!report && !error && !streaming && (
        <div style={{ padding: '34px 18px', textAlign: 'center' }}>
          <div style={{ fontFamily: C.serif, fontStyle: 'italic', color: E.inkMuted, maxWidth: 520, margin: '0 auto', fontSize: 14 }}>
            {job
              ? `Score “${job.title || job.topic}” against the SERP consensus — click “Run full analysis” to see the layered report, competitive deltas and prioritized fixes.`
              : 'Select a draft in the Review stage, then run the engine to get a full competitive analysis of the article.'}
          </div>
        </div>
      )}

      {streaming && !report && (
        <div style={{ padding: '0 18px 18px' }}>
          <EngineLiveFeed trace={liveTrace} live />
        </div>
      )}

      {report && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Engine livestream — replays the captured trace with pacing */}
          <EngineLiveFeed trace={report.trace ?? []} onDone={() => notice?.('Master Engine analysis complete')} />

          {/* Composite + prediction row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, paddingTop: 14 }}>
            <Stat tile="Composite score" value={report.composite == null ? '—' : `${report.composite}/100`} accent={report.grade ? GRADE_COLOR[report.grade] : E.inkMuted} sub={`grade ${report.grade ?? '—'} · ${report.intentLabel}`} />
            <Stat tile="Predicted top-10" value={report.prediction.top10Probability == null ? '—' : `${report.prediction.top10Probability}%`} accent={E.blue} sub="logistic probability" />
            <Stat tile="Predicted top-3" value={report.prediction.top3Probability == null ? '—' : `${report.prediction.top3Probability}%`} accent={E.navy} sub="logistic probability" />
            <Stat tile="Expected lift" value={`+${report.prediction.expectedLift}%`} accent={E.mossGreen} sub={report.prediction.expectedTrafficLift == null ? 'close the deltas' : `≈ ${report.prediction.expectedTrafficLift} organic clicks`} />
            <Stat tile="Signal coverage" value={`${report.coverage.pct}%`} accent={E.gold} sub={`${report.coverage.computed} / ${report.coverage.total} computed`} />
          </div>

          {/* Ranking probability ladder */}
          <div style={{ border: `1px solid ${E.hairline}` }}>
            <SectionTitle>Ranking probability ladder</SectionTitle>
            <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {([
                ['top-100', report.prediction.top100Probability],
                ['top-20', report.prediction.top20Probability],
                ['top-10', report.prediction.top10Probability],
                ['top-3', report.prediction.top3Probability],
                ['#1', report.prediction.position1Probability],
              ] as Array<[string, number | null]>).map(([label, p]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 56, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  {bar((p ?? 0) / 100, p == null ? E.inkDim : p >= 60 ? E.mossGreen : p >= 25 ? E.blue : E.orange)}
                  <span style={{ width: 40, textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: p == null ? E.inkDim : E.ink }}>{p == null ? '—' : `${p}%`}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4, paddingTop: 8, borderTop: `1px dashed ${E.hairline}` }}>
                <LadderChip label="Click" value={report.prediction.clickProbability} />
                <LadderChip label="Convert" value={report.prediction.conversionProbability} />
                <LadderChip label="EV index" value={report.prediction.expectedValue} />
              </div>
            </div>
          </div>

          {/* Derived features */}
          <div style={{ border: `1px solid ${E.hairline}` }}>
            <SectionTitle>Derived features — higher-order math</SectionTitle>
            <div style={{ padding: '10px 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <DerivedTile label="Competitive gap" value={report.derived.competitiveGap} lowerIsBetter />
              <DerivedTile label="Content superiority" value={report.derived.contentSuperiority} />
              <DerivedTile label="Information-gain" value={report.derived.informationGainAdvantage} />
              <DerivedTile label="Authority gap" value={report.derived.authorityGap} lowerIsBetter />
              <DerivedTile label="Evidence advantage" value={report.derived.evidenceAdvantage} />
              <DerivedTile label="Trust advantage" value={report.derived.trustAdvantage} />
              <DerivedTile label="Freshness advantage" value={report.derived.freshnessAdvantage} />
              <DerivedTile label="Experience advantage" value={report.derived.experienceAdvantage} />
              <DerivedTile label="Intent-fit advantage" value={report.derived.intentFitAdvantage} />
              <DerivedTile label="Headroom" value={report.derived.optimizationHeadroom} neutral />
            </div>
          </div>

          {/* Model governance */}
          <div style={{ border: `1px solid ${E.hairline}` }}>
            <SectionTitle>Model governance · v{report.governance.modelVersion}</SectionTitle>
            <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 120, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</span>
                {bar(report.governance.confidence ?? 0, report.governance.confidence == null ? E.inkDim : report.governance.confidence >= 0.6 ? E.mossGreen : report.governance.confidence >= 0.35 ? E.gold : E.orange)}
                <span style={{ width: 40, textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: E.ink }}>{report.governance.confidence == null ? '—' : `${Math.round(report.governance.confidence * 100)}%`}</span>
              </div>
              {report.governance.caveats.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {report.governance.caveats.map((c) => (
                    <div key={c} style={{ fontFamily: C.mono, fontSize: 10, color: E.inkDim }}>· {c}</div>
                  ))}
                </div>
              )}
            </div>
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
                <span>weight: {report.adaptation?.usedLearned ? 'adaptive (learned)' : 'intent-conditioned'} ({report.intentLabel})</span>
              </div>
            </div>
          </div>

          {/* Content Quality module (Subsystem A) — LLM judgment delta badge + actions */}
          {report.contentQuality && report.contentQuality.score != null && (
            <div style={{ border: `1px solid ${E.hairline}` }}>
              <SectionTitle>Content quality · LLM judgment (Subsystem A)</SectionTitle>
              <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 120, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content depth</span>
                  {bar(report.contentQuality.score)}
                  <span style={{ width: 44, textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: E.ink }}>{Math.round(report.contentQuality.score * 100)}</span>
                  <span style={{ width: 58, textAlign: 'right', fontFamily: C.mono, fontSize: 10, color: report.deltas.content == null ? E.inkDim : report.deltas.content >= 0 ? E.mossGreen : E.orange }}>
                    {report.deltas.content == null ? '' : `${report.deltas.content >= 0 ? '+' : ''}${(report.deltas.content * 100).toFixed(0)}`}
                  </span>
                </div>
                {report.contentQuality.confidence != null && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: report.contentQuality.confidence >= 0.6 ? E.inkSoft : E.orange }}>
                    confidence {Math.round(report.contentQuality.confidence * 100)}%{report.contentQuality.confidence < 0.6 ? ' · below 0.6 → excluded from engine score (advisory only)' : ''}
                  </div>
                )}
                {report.contentQuality.topCompetitorUrl && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: E.orange }}>
                    👀 Top competitor: <b>{report.contentQuality.topCompetitorUrl}</b>
                    {report.contentQuality.topCompetitorDepthScore != null ? ` (${Math.round(report.contentQuality.topCompetitorDepthScore * 100)}/100 depth)` : ''}
                  </div>
                )}
                {report.contentQuality.missingSubtopics.length > 0 && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: E.inkSoft }}>
                    missing: {report.contentQuality.missingSubtopics.slice(0, 5).join(' · ')}{report.contentQuality.missingSubtopics.length > 5 ? ` (+${report.contentQuality.missingSubtopics.length - 5} more)` : ''}
                  </div>
                )}
                {report.recommendations.filter((r) => r.subsystem === 'content').slice(0, 3).map((r, i) => (
                  <div key={`cq-${i}`} style={{ fontSize: 11, color: E.inkSoft }}>→ {r.action}</div>
                ))}
              </div>
            </div>
          )}

          {/* Semantic/NLP module (Subsystem H) — LLM judgment delta badge + actions */}
          {report.semanticNlp && report.semanticNlp.score != null && (
            <div style={{ border: `1px solid ${E.hairline}` }}>
              <SectionTitle>Semantic coverage · LLM judgment (Subsystem H)</SectionTitle>
              <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 120, fontFamily: C.mono, fontSize: 9.5, color: E.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entity coverage</span>
                  {bar(report.semanticNlp.score)}
                  <span style={{ width: 44, textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, fontWeight: 700, color: E.ink }}>{Math.round(report.semanticNlp.score * 100)}</span>
                  <span style={{ width: 58, textAlign: 'right', fontFamily: C.mono, fontSize: 10, color: report.deltas.semantic == null ? E.inkDim : report.deltas.semantic >= 0 ? E.mossGreen : E.orange }}>
                    {report.deltas.semantic == null ? '' : `${report.deltas.semantic >= 0 ? '+' : ''}${(report.deltas.semantic * 100).toFixed(0)}`}
                  </span>
                </div>
                {report.semanticNlp.confidence != null && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: report.semanticNlp.confidence >= 0.6 ? E.inkSoft : E.orange }}>
                    confidence {Math.round(report.semanticNlp.confidence * 100)}%{report.semanticNlp.confidence < 0.6 ? ' · below 0.6 → excluded from engine score (advisory only)' : ''}
                  </div>
                )}
                {report.semanticNlp.flags?.includes('text_only_judgment') && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: E.orange }}>
                    ⚠ text-only judgment — no variable embedding-verified · confidence capped at 0.7
                  </div>
                )}
                {report.semanticNlp.topCompetitorUrl && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: E.orange }}>
                    👀 Top competitor: <b>{report.semanticNlp.topCompetitorUrl}</b>
                    {report.semanticNlp.topCompetitorEntityCoverage != null ? ` (${Math.round(report.semanticNlp.topCompetitorEntityCoverage * 100)}/100 entity coverage)` : ''}
                  </div>
                )}
                {report.semanticNlp.missingEntities.length > 0 && (
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: E.inkSoft }}>
                    missing: {report.semanticNlp.missingEntities.slice(0, 5).join(' · ')}{report.semanticNlp.missingEntities.length > 5 ? ` (+${report.semanticNlp.missingEntities.length - 5} more)` : ''}
                  </div>
                )}
                {report.recommendations.filter((r) => r.subsystem === 'semantic').slice(0, 3).map((r, i) => (
                  <div key={`sn-${i}`} style={{ fontSize: 11, color: E.inkSoft }}>→ {r.action}</div>
                ))}
              </div>
            </div>
          )}

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

// ═══ Engine livestream ════════════════════════════════════════════════════
//
// The engine computes synchronously in milliseconds — too fast to watch in
// real time. The report carries an ordered `trace` of every pipeline step
// (input → intent → weights → signals → deltas → risk → recommend → predict
// → done). This component REPLAYS that trace with realistic pacing, so you
// can watch the engine "think" — like a terminal livestream of the analysis.

const TONE_COLOR: Record<string, string> = {
  info: '#9fb6c9',
  ok: '#34d399',
  warn: '#fbbf24',
  err: '#f87171',
  accent: '#fbbf24',
}
const PHASE_PAD: Record<string, string> = {
  input: 'INPUT', intent: 'INTENT', weights: 'WEIGHTS', signals: 'SIGNALS',
  baseline: 'BASELINE', delta: 'DELTA', risk: 'RISK', recommend: 'RECOMMEND',
  predict: 'PREDICT', done: 'DONE',
}

function EngineLiveFeed({ trace, live = false, onDone }: { trace: MasterReport['trace']; live?: boolean; onDone?: () => void }) {
  const [count, setCount] = React.useState(0)
  const [playing, setPlaying] = React.useState(true)
  const [speed, setSpeed] = React.useState(1)
  const ref = React.useRef<HTMLDivElement>(null)
  const doneRef = React.useRef(false)

  const total = trace.length
  // In live mode the feed grows as the server streams; it is never "finished"
  // until the `done` event lands and the panel swaps to the full replay feed.
  const finished = live ? false : count >= total

  // Reset the replay whenever a new trace arrives (replay mode only).
  React.useEffect(() => {
    if (live) return
    setCount(0)
    setPlaying(true)
    doneRef.current = false
  }, [trace, live])

  // Autoscroll while streaming
  React.useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, trace, live])

  // The replay ticker (disabled in live mode — steps arrive from the server)
  React.useEffect(() => {
    if (live || !playing || finished) return
    const delay = Math.max(90, 320 / speed)
    const t = setTimeout(() => setCount((c) => Math.min(total, c + 1)), delay)
    return () => clearTimeout(t)
  }, [live, playing, finished, count, speed, total])

  // Fire onDone once the replay reaches the end
  React.useEffect(() => {
    if (live) return
    if (finished && !doneRef.current) {
      doneRef.current = true
      onDone?.()
    }
  }, [live, finished, onDone])

  const visible = live ? trace : trace.slice(0, count)
  const progress = total ? (live ? 1 : count / total) : 0
  const lastTone = trace[count - 1]?.tone

  return (
    <div style={{ border: `1px solid ${E.hairline}`, overflow: 'hidden' }}>
      {/* Feed header + controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        background: '#101418', borderBottom: `1px solid ${E.hairline}`,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: finished ? '#34d399' : '#f87171', textTransform: 'uppercase',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: finished ? '#34d399' : '#f87171',
            boxShadow: finished ? 'none' : '0 0 6px #f87171',
            animation: live ? 'studioPulse 1.2s infinite' : 'none',
          }} />
          {finished ? 'Analysis complete' : 'Engine live'}
        </span>
        <span style={{ flex: 1, fontFamily: C.mono, fontSize: 9, color: '#5b6b7b', letterSpacing: '0.06em' }}>
          {live
            ? `streaming · ${total} step${total === 1 ? '' : 's'}`
            : `step ${Math.min(count, total)}/${total} · ${Math.round(progress * 100)}%`}
        </span>
        {!live && (
          <>
            <button type="button" onClick={() => { setPlaying(!playing); if (finished) { setCount(0); setPlaying(true) } }}
              style={feedBtn}>
              {finished ? '↺ replay' : playing ? '❚❚ pause' : '▶ play'}
            </button>
            <button type="button" onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))} style={feedBtn}>
              {speed}×
            </button>
            {!finished && (
              <button type="button" onClick={() => setCount(total)} style={feedBtn}>
                skip ⏭
              </button>
            )}
          </>
        )}
      </div>

      {/* Terminal body */}
      <div
        ref={ref}
        data-testid="engine-live-feed"
        style={{
          background: '#0b0e12', color: '#c7d3dd', fontFamily: C.mono, fontSize: 10.5,
          lineHeight: 1.7, padding: '12px 14px', height: 220, overflowY: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      >
        {visible.map((s) => (
          <div key={s.seq} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ color: '#3d4c5c', width: 34, flexShrink: 0, textAlign: 'right' }}>
              {(s.progress * 100).toFixed(0).padStart(3)}%
            </span>
            <span style={{
              color: TONE_COLOR[s.tone] ?? '#9fb6c9', width: 88, flexShrink: 0,
              fontWeight: 700, letterSpacing: '0.04em',
            }}>
              {PHASE_PAD[s.phase] ?? s.phase.toUpperCase()}
            </span>
            <span style={{ color: '#dbe6ee' }}>{s.message}</span>
            {s.detail && <span style={{ color: '#5b6b7b' }}> · {s.detail}</span>}
          </div>
        ))}
        {!finished && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ color: '#3d4c5c', width: 34, flexShrink: 0, textAlign: 'right' }}>…</span>
            <span style={{ color: '#f87171' }}>▋</span>
            <span style={{ color: '#5b6b7b', fontStyle: 'italic' }}>
              {live ? 'awaiting next step…' : trace[count] ? trace[count].message.slice(0, 60) + '…' : 'computing…'}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: '#101418' }}>
        <div style={{
          width: live ? '100%' : `${Math.max(2, progress * 100)}%`,
          height: '100%',
          background: finished ? '#34d399' : (lastTone === 'err' ? '#f87171' : '#fbbf24'),
          transition: 'width 120ms linear',
          animation: live ? 'studioPulse 1.2s infinite' : 'none',
        }} />
      </div>
    </div>
  )
}

const feedBtn: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 2, border: '1px solid #2a3644',
  background: 'transparent', color: '#8fa3b3', fontFamily: C.mono, fontSize: 9,
  fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
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

function LadderChip({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, color: E.inkMuted }}>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: E.inkDim }}>{label}</span>{' '}
      <span style={{ color: E.ink, fontWeight: 700 }}>{value == null ? '—' : `${value}%`}</span>
    </span>
  )
}

function DerivedTile({ label, value, lowerIsBetter, neutral }: { label: string; value: number | null; lowerIsBetter?: boolean; neutral?: boolean }) {
  const pct = value == null ? null : Math.round(value * 100)
  const color = pct == null
    ? E.inkDim
    : neutral
      ? E.gold
      : lowerIsBetter
        ? pct <= 30 ? E.mossGreen : E.orange
        : pct >= 55 ? E.mossGreen : E.orange
  return (
    <div style={{ border: `1px solid ${E.hairline}`, background: E.cream, padding: '10px 12px' }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: E.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{pct == null ? '—' : pct}</span>
        {bar(value ?? 0, color)}
      </div>
    </div>
  )
}
