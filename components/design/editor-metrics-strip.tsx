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
import { applyReadabilityFixes, computeEditorMetrics, expandMetaToBriefTarget, injectMissingBriefKeywords, missingBriefKeywords, listBriefKeywords, type EditorMetrics, type EditorSeoHint } from '@/lib/editorMetrics'
import { runHarperGrammar, fixHarperIssues, applyHarperProblem, harperKindAutofixable, type HarperLintSummary } from '@/lib/harperBrowser'
import { applyQuotedStyleFixes } from '@/lib/seoFactory/styleApply'
import { ENTRIM_DEEPSEEK_FLASH_PIN } from '@/lib/contentAiCatalog'

/** Style Review is Flash-only — ignore Genesis Review / other picker pins. */
function resolveStyleReviewPin(_reviewModel?: string): string {
  return ENTRIM_DEEPSEEK_FLASH_PIN
}

/**
 * Client abort must sit ABOVE the server route budget (40s) so a timed-out
 * provider still returns JSON ({ error }) instead of a bare AbortError.
 */
const STYLE_REVIEW_CLIENT_TIMEOUT_MS = 50_000

async function fetchStyleReview(init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = STYLE_REVIEW_CLIENT_TIMEOUT_MS, signal, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch('/api/content-studio/style-review', { ...rest, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const cancelled = Boolean(signal?.aborted)
      throw new Error(
        cancelled
          ? 'Style review cancelled'
          : `Style review timed out after ${Math.round(timeoutMs / 1000)}s — try again or switch the reviewing model.`,
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

type Props = {
  content: string
  hint?: EditorSeoHint
  reviewModel?: string
  busy?: boolean
  onApplied?: (content: string) => void
  /** After the ship gate is green, Harper auto-applies remaining grammar fixes. */
  shipReady?: boolean
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

function pillColor(score: number | null, pass?: boolean): string {
  if (score === null) return C.muted
  if (pass === true) return C.green
  if (score >= 80) return C.green
  if (score >= 50) return C.amber
  return C.red
}

function ScorePill({ label, score, sub, busy, onClick, pass }: {
  label: string
  score: number | null
  sub: string
  busy?: boolean
  pass?: boolean
  onClick?: () => void
}) {
  const color = pillColor(score, pass)
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

export default function EditorMetricsStrip({ content, hint, reviewModel, busy, onApplied, shipReady }: Props) {
  const [metrics, setMetrics] = React.useState<EditorMetrics | null>(null)
  const [harper, setHarper] = React.useState<HarperLintSummary | null>(null)
  const [harperBusy, setHarperBusy] = React.useState(false)
  const [harperEngineError, setHarperEngineError] = React.useState<string | null>(null)
  const [fixingHarper, setFixingHarper] = React.useState(false)
  const [harperFixNote, setHarperFixNote] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<'grammar' | 'readability' | 'seo' | 'style' | null>(null)
  const [styleItems, setStyleItems] = React.useState<Array<{ category: string; quote: string; issue: string; suggestion: string }>>([])
  const [styleBusy, setStyleBusy] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [styleError, setStyleError] = React.useState<string | null>(null)
  const [styleRawSnippet, setStyleRawSnippet] = React.useState<string | null>(null)
  const [styleReviewed, setStyleReviewed] = React.useState(false)
  const textRef = React.useRef('')
  textRef.current = content
  const hintRef = React.useRef(hint)
  hintRef.current = hint
  const autoFixKeyRef = React.useRef('')

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
      setHarperEngineError(null)
      try {
        const extra = listBriefKeywords(hintRef.current)
        const summary = await runHarperGrammar(content, undefined, hintRef.current?.region, extra)
        if (summary) {
          setHarper(summary)
          setHarperEngineError(null)
        } else {
          setHarper(null)
          setHarperEngineError('Harper could not start in this browser — click Retry.')
        }
      } catch (err) {
        setHarper(null)
        setHarperEngineError(err instanceof Error ? err.message : 'Harper could not start in this browser')
      } finally {
        setHarperBusy(false)
      }
    }, 1100)
    return () => clearTimeout(timer)
  }, [content, hint?.region])

  const styleReviewInFlightRef = React.useRef(false)
  const styleAbortRef = React.useRef<AbortController | null>(null)

  const runStyleReview = React.useCallback(async (apply: boolean) => {
    const h = hintRef.current
    styleAbortRef.current?.abort()
    const controller = new AbortController()
    styleAbortRef.current = controller
    styleReviewInFlightRef.current = true
    setStyleBusy(true)
    setStyleError(null)
    setStyleRawSnippet(null)
    try {
      const res = await fetchStyleReview({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        timeoutMs: STYLE_REVIEW_CLIENT_TIMEOUT_MS,
        body: JSON.stringify({
          content: textRef.current,
          primaryKeyword: h?.primaryKeyword || undefined,
          contentType: h?.contentType || undefined,
          reviewModel: resolveStyleReviewPin(reviewModel),
          apply,
        }),
      })
      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Style review returned an empty response' : `Style review failed (HTTP ${res.status})`)
      }
      setExpanded('style')
      if (!res.ok) {
        setStyleError(typeof data?.error === 'string' ? data.error : 'Style review failed')
        setStyleItems([])
        setStyleReviewed(true)
        return
      }
      const items = Array.isArray(data.items) ? data.items : []
      setStyleItems(items as Array<{ category: string; quote: string; issue: string; suggestion: string }>)
      setStyleReviewed(true)
      const snippet = typeof data.rawSnippet === 'string' && data.rawSnippet.trim() ? data.rawSnippet.trim() : null
      if (items.length === 0 && snippet) {
        setStyleRawSnippet(snippet)
        setStyleError('Style review did not return structured findings')
      }
      if (apply && data.applied && typeof data.content === 'string' && onApplied) {
        onApplied(data.content)
      }
      if (data.applied === false && typeof data.reason === 'string') setStyleError(`Apply incomplete: ${data.reason}`)
    } catch (err) {
      // A superseded run (aborted because a newer Review started) must not
      // clobber the newer run's UI state.
      if (styleAbortRef.current !== controller) return
      setStyleError(err instanceof Error ? err.message : 'Style review network error')
      setStyleReviewed(true)
      setStyleItems([])
    } finally {
      if (styleAbortRef.current === controller) {
        styleAbortRef.current = null
        styleReviewInFlightRef.current = false
        setStyleBusy(false)
      }
    }
  }, [reviewModel, onApplied])

  // Parent `busy` must NEVER drive styleBusy. Mirroring it left the Review button
  // stuck on "Reviewing…" whenever the editor was disabled/terminal or mid-pipeline,
  // and clearing it mid-fetch blanked in-flight reviews. styleBusy is owned only by
  // runStyleReview / Apply. The `busy` prop still soft-cues panel copy.
  React.useEffect(() => {
    return () => {
      styleAbortRef.current?.abort()
    }
  }, [])

  const readabilityLabel =
    !metrics ? '' :
    metrics.readability.score >= 70 ? 'plain, easy to scan' :
    metrics.readability.score >= 50 ? 'acceptable for a consumer audience' :
    'dense — shorten sentences and words'

  const runHarperAutofix = React.useCallback(async () => {
    setFixingHarper(true)
    setHarperFixNote(null)
    try {
      const result = await fixHarperIssues(textRef.current, undefined, hintRef.current?.region)
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

  React.useEffect(() => {
    if (!shipReady || !onApplied || harperBusy || fixingHarper) return
    if (!harper || harper.errors + harper.suggestions === 0) return
    const key = `${content.length}:${harper.errors}:${harper.suggestions}`
    if (autoFixKeyRef.current === key) return
    autoFixKeyRef.current = key
    void runHarperAutofix()
  }, [shipReady, harper, harperBusy, fixingHarper, onApplied, content.length, runHarperAutofix])

  const panel = (() => {
    if (!expanded) return null
    if (expanded === 'grammar') {
      const items = harper?.items || []
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.5 }}>
          {harperBusy && <span style={{ color: C.muted }}>Harper.js loading (on-device grammar)...</span>}
          {!harperBusy && harperEngineError && (
            <div style={{ color: C.red, marginBottom: 6 }}>
              {harperEngineError}{' '}
              <button
                type="button"
                onClick={() => {
                  setHarperEngineError(null)
                  setHarperBusy(true)
                  void runHarperGrammar(textRef.current, undefined, hintRef.current?.region)
                    .then((summary) => {
                      if (summary) setHarper(summary)
                      else setHarperEngineError('Harper could not start in this browser — click Retry.')
                    })
                    .catch((err) => setHarperEngineError(err instanceof Error ? err.message : 'Harper failed'))
                    .finally(() => setHarperBusy(false))
                }}
                style={{ padding: '1px 7px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}
          {!harperBusy && !harperEngineError && items.length === 0 && (
            <span style={{ color: C.green }}>No grammar issues detected.</span>
          )}
          {harperFixNote && <div style={{ color: C.green, marginBottom: 6 }}>{harperFixNote}</div>}
          {items.map((it, i) => (
            <div key={i} style={{ marginBottom: 5, color: C.text, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: pillColor(80), fontWeight: 600, fontFamily: C.mono }}>[{it.kind}]</span>{' '}
              <span style={{ background: '#FEF2F2', padding: '0 4px', borderRadius: 3 }}>“{it.problem}”</span>{' '}
              <span style={{ color: C.muted }}>{it.message}</span>
              {it.fix ? <span style={{ color: C.green }}> → {it.fix}</span> : null}
              {it.fix && harperKindAutofixable(it.kind) ? (
                <button
                  type="button"
                  disabled={fixingHarper || !onApplied}
                  onClick={async () => {
                    setFixingHarper(true)
                    try {
                      const result = await applyHarperProblem(textRef.current, it.problem, hintRef.current?.region)
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
              ) : (
                <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono }}>Manual / vocabulary — not auto-applied</span>
              )}
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
              Harper applies grammar/typo/punctuation on the markdown body (spans from the end). Vocabulary and acronyms stay.
            </span>
          </div>
        </div>
      )
    }
    if (expanded === 'readability') {
      const r = metrics?.readability
      const fixes = r?.fixes || []
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.6 }}>
          <div><strong>Flesch Reading Ease</strong> — {r ? `${r.score}/100` : readabilityLabel} {r ? (r.pass ? '(meets brief)' : `(need ≥${r.target} for this brief)`) : ''}.</div>
          <div style={{ color: C.muted }}>
            {r?.words.toLocaleString()} words · {r?.sentences} sentences · brief floor {r?.target ?? 50}
          </div>
          <div style={{ color: C.muted, marginTop: 3 }}>
            Brief: {hint?.contentType || 'article'} · {hint?.audience || hint?.tone || 'reader'} · {hint?.region || 'US'} · 15–22 word sentences, plain practitioner language.
          </div>
          {fixes.map((fx, i) => (
            <div key={i} style={{ marginTop: 8, color: C.text }}>
              <div style={{ color: C.muted }}>{fx.reason}</div>
              <div style={{ background: '#FEF2F2', padding: '2px 4px', borderRadius: 3, marginTop: 2 }}>“{fx.quote.slice(0, 160)}”</div>
              <div style={{ color: C.green, marginTop: 2 }}>→ {fx.suggestion.slice(0, 200)}</div>
              <button
                type="button"
                disabled={!onApplied}
                onClick={() => {
                  const local = applyReadabilityFixes(textRef.current, [fx])
                  if (local.applied > 0 && onApplied) onApplied(local.content)
                }}
                style={{ marginTop: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
              >
                Apply split
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!onApplied || fixes.length === 0}
            onClick={() => {
              const local = applyReadabilityFixes(textRef.current, fixes)
              if (local.applied > 0 && onApplied) {
                onApplied(local.content)
              }
            }}
            style={{
              marginTop: 8, padding: '4px 10px', borderRadius: 6, border: 'none',
              background: '#17365D', fontSize: 11, fontWeight: 600, color: '#fff',
              cursor: fixes.length && onApplied ? 'pointer' : 'not-allowed',
              opacity: fixes.length ? 1 : 0.55,
            }}
          >
            {fixes.length ? `Auto-fix ${fixes.length} readability issue${fixes.length === 1 ? '' : 's'}` : 'Auto-fix readability'}
          </button>
          {fixes.length === 0 && r?.pass && (
            <div style={{ color: C.green, marginTop: 6 }}>
              Flesch meets this brief (≥{r.target}). The pill is green — Harper grammar is a separate control and will not change this score.
            </div>
          )}
          {fixes.length === 0 && r && !r.pass && (
            <div style={{ color: C.muted, marginTop: 6 }}>
              Score is below the brief floor, but there is no safe auto-split or wording swap left. Shorten remaining jargon in AI Style.
            </div>
          )}
        </div>
      )
    }
    if (expanded === 'seo') {
      const pass = metrics?.seo.pass || []
      const fail = metrics?.seo.fail || []
      const warn = metrics?.seo.warn || []
      const metaNeedsExpand = fail.some((f) => /meta/i.test(f)) || warn.some((f) => /meta/i.test(f))
      const missingKw = missingBriefKeywords(textRef.current, hintRef.current)
      return (
        <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ color: C.muted, marginBottom: 4 }}>
            Local gate-aligned checks (not Harper) — ship uses Ahrefs 70–160; the brief asks 140–160 for the SERP snippet.
          </div>
          {fail.map((f, i) => (
            <div key={`f${i}`} style={{ color: pillColor(50) }}>✕ {f}</div>
          ))}
          {warn.map((w, i) => (
            <div key={`w${i}`} style={{ color: pillColor(60) }}>! {w}</div>
          ))}
          {fail.length === 0 && warn.length === 0 && <div style={{ color: C.green }}>All local SEO checks pass.</div>}
          {pass.map((p, i) => (
            <div key={`p${i}`} style={{ color: C.muted }}>✓ {p}</div>
          ))}
          {missingKw.length > 0 && (
            <div style={{ color: C.text, marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>
                Missing from the body (SEO check, not Harper grammar): {missingKw.slice(0, 12).join(' · ')}
              </div>
              <button
                type="button"
                disabled={!onApplied}
                onClick={() => {
                  const next = injectMissingBriefKeywords(textRef.current, hintRef.current)
                  if (next.applied > 0 && onApplied) onApplied(next.content)
                }}
                style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
              >
                Insert {missingKw.length} missing keyword{missingKw.length === 1 ? '' : 's'}
              </button>
            </div>
          )}
          {metaNeedsExpand && (
            <div style={{ color: C.text, marginTop: 6 }}>
              Meta description is YAML <code>description:</code> in Source view.
              <button
                type="button"
                disabled={!onApplied}
                onClick={() => {
                  const next = expandMetaToBriefTarget(textRef.current, hintRef.current)
                  if (next.applied && onApplied) onApplied(next.content)
                }}
                style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
              >
                Expand meta to 140–160
              </button>
            </div>
          )}
        </div>
      )
    }
    // 'style'
    return (
      <div style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 11, lineHeight: 1.5 }}>
        {styleError && <div style={{ color: C.red, marginBottom: 6 }}>{styleError}</div>}
        {styleRawSnippet && (
          <pre style={{
            color: C.text, marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: C.mono, fontSize: 10, background: '#F9FAFB', padding: 8, borderRadius: 4,
            maxHeight: 160, overflow: 'auto',
          }}>{styleRawSnippet}</pre>
        )}
        {!styleBusy && styleItems.length === 0 && !styleError && !styleRawSnippet && styleReviewed && (
          <div style={{ color: C.green, marginBottom: 6 }}>No style issues found</div>
        )}
        {styleItems.length === 0 && !styleError && !styleRawSnippet && !styleReviewed && (
          <div style={{ color: C.muted }}>
            {styleBusy
              ? (busy ? 'Editor busy — style Review is running or waiting on the pipeline…' : 'Reviewing style…')
              : 'Review the draft with the reviewing model — it critiques voice, clichés, forced keywords, AI-tells and hedging, then offers one-click apply.'}
          </div>
        )}
        {styleItems.map((it, i) => (
          <div key={i} style={{ marginBottom: 7, color: C.text }}>
            <span style={{ fontWeight: 600, fontFamily: C.mono, color: C.text }}>{it.category}</span>{' '}
            <span style={{ background: '#FFF7ED', padding: '0 4px', borderRadius: 3 }}>“{it.quote}”</span>
            <div style={{ color: C.muted }}>{it.issue}</div>
            <div style={{ color: C.green }}>→ {it.suggestion}</div>
            <button
              type="button"
              disabled={applying || !onApplied || !it.quote || !it.suggestion}
              onClick={() => {
                const local = applyQuotedStyleFixes(textRef.current, [it])
                if (local.applied > 0 && onApplied) {
                  onApplied(local.content)
                  setStyleItems((prev) => prev.filter((_, j) => j !== i))
                  setStyleError(null)
                } else {
                  setStyleError(`Could not find “${it.quote.slice(0, 80)}” in the document — edit that phrase by hand.`)
                }
              }}
              style={{ marginTop: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,0,0,0.12)', background: '#17365D', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
            >
              Replace
            </button>
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
              onClick={() => {
                setApplying(true)
                setStyleError(null)
                try {
                  const snapshot = [...styleItems]
                  const local = applyQuotedStyleFixes(textRef.current, snapshot)
                  if (local.applied > 0 && local.content && onApplied) {
                    onApplied(local.content)
                    setStyleItems(local.missed)
                    if (local.missed.length) {
                      setStyleError(`Applied ${local.applied}; ${local.missed.length} still need a hand edit (quote not found or already identical).`)
                    }
                    setApplying(false)
                    return
                  }
                  void (async () => {
                    try {
                      styleAbortRef.current?.abort()
                      const controller = new AbortController()
                      styleAbortRef.current = controller
                      const res = await fetchStyleReview({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        signal: controller.signal,
                        timeoutMs: STYLE_REVIEW_CLIENT_TIMEOUT_MS,
                        body: JSON.stringify({
                          content: textRef.current,
                          primaryKeyword: hintRef.current?.primaryKeyword || undefined,
                          contentType: hintRef.current?.contentType || undefined,
                          reviewModel: resolveStyleReviewPin(reviewModel),
                          apply: true,
                          items: snapshot,
                        }),
                      })
                      let data: Record<string, unknown> = {}
                      try {
                        data = await res.json()
                      } catch {
                        throw new Error(res.ok ? 'Style apply returned an empty response' : `Style apply failed (HTTP ${res.status})`)
                      }
                      if (!res.ok) {
                        setStyleError(typeof data?.error === 'string' ? data.error : 'Style apply failed')
                      } else if (typeof data?.content === 'string' && data.applied && onApplied) {
                        onApplied(data.content)
                        setStyleItems(
                          Array.isArray(data.items)
                            ? data.items.filter((it: { quote?: string; suggestion?: string; issue?: string; category?: string }) =>
                              Boolean(it?.quote && it?.suggestion && it?.issue),
                            )
                            : [],
                        )
                      } else {
                        setStyleError(
                          (typeof data?.reason === 'string' && data.reason)
                            || (typeof data?.error === 'string' && data.error)
                            || 'Could not replace those quotes in the document — edit by hand.',
                        )
                      }
                    } catch (err) {
                      setStyleError(err instanceof Error ? err.message : 'Style apply failed')
                    } finally {
                      setApplying(false)
                    }
                  })()
                } catch (err) {
                  setStyleError(err instanceof Error ? err.message : 'Style apply failed')
                  setApplying(false)
                }
              }}
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
          pass={metrics?.readability.pass}
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