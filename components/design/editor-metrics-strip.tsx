'use client'
/**
 * EditorMetricsStrip — live quality feedback above the article editor.
 *
 *  Grammar       ● 92/100   (Harper.js on-device WASM — lazy-loaded)
 *  Readability   ● 87/100   (Flesch Reading Ease on extracted prose)
 *  SEO           ● 94/100   (deterministic gate-aligned checks)
 *  AI Style      ● Review   (cascade LLM critique + optional apply)
 *
 * Scores recompute on debounce as the human types. The strip is advisory —
 * the shipping gates stay the authority — but it gives the operator the
 * same signal set the audit uses, live.
 */

import * as React from 'react'
import { computeEditorMetrics, type EditorMetrics, type EditorSeoHint } from '@/lib/editorMetrics'
import { runHarperGrammar, fixHarperIssues, applyHarperProblem, type HarperLintSummary } from '@/lib/harperBrowser'

type Props = {
  content: string
  hint?: EditorSeoHint
  reviewModel?: string
  busy?: boolean
  onApplied?: (content: string) => void
}

const C = {
  green: '#0F7B3E',
  amber: '#B45309',
  red: '#B91C1C',
  muted: '#6B7280',
  border: 'rgba(0,0,0,0.08)',
  surface: '#FAFAFB',
  text: '#1F2937',
  mono: 'var(--portal-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
}

function pillColor(score: number | null): string {
  if (score === null) return C.muted
  if (score >= 80) return C.green
  if (score >= 50) return C.amber
  return C.red
}

function ScorePill({ label, score, sub, busy, onClick }: {
  label: string
  score: number | null
  sub: string
  busy?: boolean
  onClick?: () => void
}) {
  const color = pillColor(score)
  return (
    <div
      onClick={onClick}
      title={sub}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 7, padding: '5px 10px',
        borderRadius: 999, background: C.surface, border: `1px solid ${C.border}`,
        cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>
        {label}
      </span>
      {busy ? (
        <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono }}>…</span>
      ) : score === null ? (
        <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono }}>—</span>
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: C.mono }}>
          ● {score}/100
        </span>
      )}
    </div>
  )
}

export default function EditorMetricsStrip({ content, hint, reviewModel, busy, onApplied }: Props) {
  const [metrics, setMetrics] = React.useState<EditorMetrics | null>(null)
  const [harper, setHarper] = React.useState<HarperLintSummary | null>(null)
  const [harperBusy, setHarperBusy] = React.useState(false)
  const [fixingHarper, setFixingHarper] = React.useState(false)
  const [harperFixNote, setHarperFixNote] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<'grammar' | 'readability' | 'seo' | 'style' | null>(null)
  const [styleItems, setStyleItems] = React.useState<Array<{ category: string; quote: string; issue: string; suggestion: string }>>([])
  const [styleBusy, setStyleBusy] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [styleError, setStyleError] = React.useState<string | null>(null)
  const textRef = React.useRef('')
  textRef.current = content

  // Local metrics (readability + SEO) — cheap, recompute on debounce.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setMetrics(computeEditorMetrics(content, [], hint))
    }, 400)
    return () => clearTimeout(timer)
  }, [content, hint])

  // Harper grammar — lazy WASM, debounced.
  React.useEffect(() => {
    if (String(content).trim().length < 120) return
    const timer = setTimeout(async () => {
      setHarperBusy(true)
      const summary = await runHarperGrammar(content)
      setHarperBusy(false)
      if (summary) setHarper(summary)
    }, 1100)
    return () => clearTimeout(timer)
  }, [content])

  const hintRef = React.useRef(hint)
  hintRef.current = hint

  const runStyleReview = React.useCallback(async (apply: boolean) => {
    const h = hintRef.current
    setStyleBusy(true)
    setStyleError(null)
    try {
      const res = await fetch('/api/content-studio/style-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          content: textRef.current,
          primaryKeyword: h?.primaryKeyword || undefined,
          reviewModel: reviewModel || undefined,
          apply,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStyleError(data?.error || 'Style review failed')
        setStyleBusy(false)
        return
      }
      setStyleItems(data.items || [])
      if (apply && data.applied && data.content && onApplied) {
        onApplied(data.content)
      }
      if (data.applied === false && data.reason) setStyleError(`Apply incomplete: ${data.reason}`)
    } catch (err) {
      setStyleError(err instanceof Error ? err.message : 'Style review network error')
    } finally {
      setStyleBusy(false)
    }
  }, [reviewModel, onApplied])

  React.useEffect(() => {
    if (busy && expanded === 'style') setStyleBusy(true)
  }, [busy, expanded])

  const readabilityLabel =
    !metrics ? '' :
    metrics.readability.score >= 70 ? 'plain, easy to scan' :
    metrics.readability.score >= 50 ? 'acceptable for a consumer audience' :
    'dense — shorten sentences and words'

  const runHarperAutofix = React.useCallback(async () => {
    setFixingHarper(true)
    setHarperFixNote(null)
    try {
      const result = await fixHarperIssues(textRef.current)
      if (result.applied > 0 && result.content && onApplied) {
        onApplied(result.content)
        setHarperFixNote(`Harper applied ${result.applied} fix${result.applied === 1 ? '' : 'es'}.`)
        setHarper(null)
      } else {
        setHarperFixNote('Nothing to autofix — remaining findings are suggestions or vocabulary.')
      }
    } catch (err) {
      setHarperFixNote(err instanceof Error ? err.message : 'Harper autofix failed')
    } finally {
      setFixingHarper(false)
    }
  }, [onApplied])

  const panel = (() => {
    if (!expanded) return null
    if (expanded === 'grammar') {
      const items = harper?.items || []
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.5 }}>
          {harperBusy && <span style={{ color: C.muted }}>Harper.js loading (on-device grammar)...</span>}
          {!harperBusy && items.length === 0 && (
            <span style={{ color: C.green }}>No grammar issues detected{harper ? '' : ' — engine not available in this browser'}.</span>
          )}
          {harperFixNote && <div style={{ color: C.green, marginBottom: 6 }}>{harperFixNote}</div>}
          {items.map((it, i) => (
            <div key={i} style={{ marginBottom: 5, color: C.text, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: pillColor(80), fontWeight: 600, fontFamily: C.mono }}>[{it.kind}]</span>{' '}
              <span style={{ background: '#FEF2F2', padding: '0 4px', borderRadius: 3 }}>“{it.problem}”</span>{' '}
              <span style={{ color: C.muted }}>{it.message}</span>
              {it.fix ? <span style={{ color: C.green }}> → {it.fix}</span> : null}
              <button
                type="button"
                disabled={fixingHarper || !onApplied}
                onClick={async () => {
                  setFixingHarper(true)
                  try {
                    const result = await applyHarperProblem(textRef.current, it.problem)
                    if (result.applied > 0 && result.content && onApplied) {
                      onApplied(result.content)
                      setHarperFixNote(`Applied ${it.kind}: “${it.problem}”.`)
                      setHarper(null)
                    } else {
                      setHarperFixNote('Could not apply that suggestion automatically — use Auto-fix or edit the phrase.')
                    }
                  } catch (err) {
                    setHarperFixNote(err instanceof Error ? err.message : 'Harper apply failed — document unchanged')
                  } finally {
                    setFixingHarper(false)
                  }
                }}
                style={{ padding: '1px 7px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <button
              type="button"
              disabled={harperBusy || fixingHarper || !harper || harper.errors + harper.suggestions === 0}
              onClick={runHarperAutofix}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
                background: '#17365D', fontSize: 11, fontWeight: 600, color: '#fff',
                cursor: fixingHarper ? 'wait' : harper ? 'pointer' : 'not-allowed',
                opacity: harper && !harperBusy ? 1 : 0.5,
              }}
            >
              {fixingHarper ? 'Fixing…' : `Auto-fix ${harper ? harper.errors + harper.suggestions : 0} issue${harper && harper.errors + harper.suggestions === 1 ? '' : 's'}`}
            </button>
            <span style={{ fontSize: 10, color: C.muted }}>
              Spelling · grammar · punctuation — applies only secure, non-case suggestions on-device
            </span>
          </div>
        </div>
      )
    }
    if (expanded === 'readability') {
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.6 }}>
          <div><strong>Flesch Reading Ease</strong> — {readabilityLabel}.</div>
          <div style={{ color: C.muted }}>
            {metrics?.readability.words.toLocaleString()} words · {metrics?.readability.sentences} sentences
          </div>
          <div style={{ color: C.muted, marginTop: 3 }}>
            Target flow: short sentences (15–20 words), plain practitioner language, one idea per paragraph.
          </div>
        </div>
      )
    }
    if (expanded === 'seo') {
      const pass = metrics?.seo.pass || []
      const fail = metrics?.seo.fail || []
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ color: C.muted, marginBottom: 4 }}>
            Local gate-aligned checks (not Harper) — the shipping gate re-verifies every one.
          </div>
          {fail.map((f, i) => (
            <div key={`f${i}`} style={{ color: pillColor(50) }}>✕ {f}</div>
          ))}
          {fail.length === 0 && <div style={{ color: C.green }}>All local SEO checks pass.</div>}
          {pass.map((p, i) => (
            <div key={`p${i}`} style={{ color: C.muted }}>✓ {p}</div>
          ))}
          {metrics?.seo.fail.some((f) => /meta/i.test(f)) && (
            <div style={{ color: C.text, marginTop: 4 }}>
              Meta description lives in the frontmatter — edit it in Source view or let Audit &amp; Fix rebuild it.
            </div>
          )}
        </div>
      )
    }
    // 'style'
    return (
      <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.5 }}>
        {styleError && <div style={{ color: C.red, marginBottom: 6 }}>{styleError}</div>}
        {!styleBusy && styleItems.length === 0 && !styleError && (
          <div style={{ color: C.muted }}>
            Review the draft with the reviewing model — it critiques voice, clichés, forced keywords, AI-tells and hedging, then offers one-click apply.
          </div>
        )}
        {styleItems.map((it, i) => (
          <div key={i} style={{ marginBottom: 7, color: C.text }}>
            <span style={{ fontWeight: 600, fontFamily: C.mono, color: C.text }}>{it.category}</span>{' '}
            <span style={{ background: '#FFF7ED', padding: '0 4px', borderRadius: 3 }}>“{it.quote}”</span>
            <div style={{ color: C.muted }}>{it.issue}</div>
            <div style={{ color: C.green }}>→ {it.suggestion}</div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            disabled={styleBusy || applying}
            onClick={() => runStyleReview(false)}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff', fontSize: 11, fontWeight: 600, color: C.text, cursor: styleBusy ? 'wait' : 'pointer',
            }}
          >
            {styleBusy ? 'Reviewing…' : 'Review'}
          </button>
          {styleItems.length > 0 && (
            <button
              type="button"
              disabled={styleBusy || applying}
              onClick={() => runStyleReview(true)}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
                background: '#17365D', fontSize: 11, fontWeight: 600, color: '#fff', cursor: applying ? 'wait' : 'pointer',
              }}
            >
              {applying ? 'Applying…' : `Apply ${styleItems.length} fixes`}
            </button>
          )}
        </div>
      </div>
    )
  })()

  const grammarScore = harper ? harper.score : null
  return (
    <div style={{ marginBottom: 6, position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <ScorePill
          label="Grammar" score={grammarScore}
          sub={harper ? `${harper.errors} errors · ${harper.suggestions} suggestions (Harper.js on-device)` : 'Harper.js on-device grammar (lazy) — click to see issues'}
          busy={harperBusy} onClick={() => setExpanded(expanded === 'grammar' ? null : 'grammar')}
        />
        <ScorePill
          label="Readability" score={metrics ? metrics.readability.score : null}
          sub={readabilityLabel}
          onClick={() => setExpanded(expanded === 'readability' ? null : 'readability')}
        />
        <ScorePill
          label="SEO" score={metrics ? metrics.seo.score : null}
          sub={metrics ? `${metrics.seo.pass.length} pass · ${metrics.seo.fail.length} fail` : 'local gate-aligned checks'}
          onClick={() => setExpanded(expanded === 'seo' ? null : 'seo')}
        />
        <ScorePill
          label="AI Style" score={null}
          sub="Review with the reviewing model (voice, clichés, forced keywords, humanization)"
          busy={styleBusy}
          onClick={() => setExpanded(expanded === 'style' ? null : 'style')}
        />
        {hint?.primaryKeyword && (
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 4, fontFamily: C.mono }}>
            kw: {hint.primaryKeyword.slice(0, 42)}
          </span>
        )}
      </div>
      {panel}
    </div>
  )
}