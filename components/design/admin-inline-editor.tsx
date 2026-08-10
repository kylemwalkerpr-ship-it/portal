'use client'
import React, { useState, useCallback, useRef, useEffect } from 'react'

const C = {
  surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', red: '#DC2626', green: '#166534',
  orange: '#D97706', blue: '#2563EB', purple: '#7C3AED',
  text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  gold: '#9A7B3B', navy: '#0F172A',
  serif: "var(--portal-font-display, Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', monospace)",
} as const

/** Fetch with a hard timeout + external abort signal so long AI fixes can never hang the UI. */
async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 260_000, signal, ...init } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const cancelled = Boolean(signal?.aborted)
      throw new Error(
        cancelled
          ? 'AI fix cancelled — your draft was auto-saved.'
          : `AI fix timed out after ${Math.round(timeoutMs / 1000)}s — your draft was auto-saved. Click Re-audit to see the latest state, then try Fix again.`,
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function fmtElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export type InlineAnnotation = {
  id: string; line: number; col: number; endLine: number; endCol: number
  length: number; severity: 'blocker' | 'warning'; code: string
  message: string; fix: string; highlightedText: string
}

export type DraftVersion = {
  id: string; jobId: string; content: string
  createdAt: string; wordCount: number; diffSummary?: string
}

type Props = {
  content: string; jobId: string; onChange: (v: string) => void
  disabled?: boolean; onScoreChange?: (s: number | null) => void
}

function scoreColor(s: number) { return s >= 70 ? C.green : s >= 50 ? C.orange : C.red }

function severityBadge(s: 'blocker' | 'warning') {
  return {
    background: s === 'blocker' ? '#FEE2E2' : '#FFF7ED',
    color: s === 'blocker' ? C.red : C.orange,
  }
}

export default function AdminInlineEditor({ content, jobId, onChange, disabled, onScoreChange }: Props) {
  const [annotations, setAnnotations] = useState<InlineAnnotation[]>([])
  const [auditResult, setAuditResult] = useState<{ ok: boolean; score: number; summary: string; blockers: number; warnings: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fixingAll, setFixingAll] = useState(false)
  const [fixingOne, setFixingOne] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [drafts, setDrafts] = useState<DraftVersion[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [fixElapsed, setFixElapsed] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fixAbortRef = useRef<AbortController | null>(null)
  const fixSeqRef = useRef(0)

  // Abort any in-flight AI fix when the editor unmounts.
  useEffect(() => () => { fixAbortRef.current?.abort() }, [])

  // Auto-save (debounced 2s)
  useEffect(() => {
    if (!dirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/content-studio/drafts', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, content }),
        })
        setLastSaved(new Date().toLocaleTimeString())
        setDirty(false)
      } catch { /* silent */ }
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [content, dirty, jobId])

  // Explicit save
  const handleSave = useCallback(async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/content-studio/drafts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, content }),
      })
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
      setDirty(false)
      setLastSaved(new Date().toLocaleTimeString())
      setNotice('Draft saved')
      setTimeout(() => setNotice(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }, [content, jobId])

  // Re-audit
  const handleReaudit = useCallback(async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/content-studio/reaudit', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      // Deterministic repairs (disclaimer / TOC / dashes) come back as
      // fixedContent — apply them so the editor matches the audited draft and
      // the blocker is visibly cleared, not stuck at "100/100 but blocked".
      if (data.fixedContent && data.fixedContent !== content) {
        onChange(data.fixedContent)
        setDirty(true)
      }
      setAuditResult(data)
      setAnnotations(data.annotations || [])
      setShowAnnotations(true)
      onScoreChange?.(data.score)
      const repairs = Array.isArray(data.appliedRepairs) && data.appliedRepairs.length
        ? ` · auto-fixed: ${data.appliedRepairs.join(', ')}`
        : ''
      setNotice(`Score ${data.score}/100 - ${data.blockers} blocker(s), ${data.warnings} warning(s) - ${data.ok ? 'PASSED' : 'BLOCKED'}${repairs}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-audit failed')
    } finally { setBusy(false) }
  }, [content, onChange, onScoreChange])

  // Fix ALL annotations via AI (clicking again while running cancels the request)
  const handleFixAll = useCallback(async () => {
    if (!annotations.length) return
    if (fixingAll) {
      fixAbortRef.current?.abort()
      return
    }
    const seq = ++fixSeqRef.current
    const controller = new AbortController()
    fixAbortRef.current = controller
    setFixingAll(true); setError(null); setNotice(null); setFixElapsed(0)
    const startedAt = Date.now()
    const tick = setInterval(() => setFixElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    try {
      const res = await fetchWithTimeout('/api/content-studio/reaudit', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        timeoutMs: 260_000,
        body: JSON.stringify({ action: 'fix_all', content, annotations }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (seq !== fixSeqRef.current) return
      if (data.fixedContent) {
        onChange(data.fixedContent); setDirty(true)
      }
      setAuditResult(data)
      setAnnotations(data.annotations || [])
      onScoreChange?.(data.score)
      setNotice(`AI fix applied - new score ${data.score}/100 - ${data.ok ? 'PASSED' : 'BLOCKED'}`)
    } catch (err) {
      if (seq !== fixSeqRef.current) return
      setError(err instanceof Error ? err.message : 'AI fix failed')
    } finally {
      clearInterval(tick)
      if (seq === fixSeqRef.current) {
        fixAbortRef.current = null
        setFixingAll(false)
        setFixElapsed(0)
      }
    }
  }, [content, annotations, fixingAll, onChange, onScoreChange])

  // Fix ONE annotation via AI (clicking again while running cancels the request)
  const handleFixOne = useCallback(async (annotation: InlineAnnotation) => {
    if (fixingOne === annotation.id) {
      fixAbortRef.current?.abort()
      return
    }
    const seq = ++fixSeqRef.current
    const controller = new AbortController()
    fixAbortRef.current = controller
    setFixingOne(annotation.id); setError(null); setNotice(null); setFixElapsed(0)
    const startedAt = Date.now()
    const tick = setInterval(() => setFixElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    try {
      const res = await fetchWithTimeout('/api/content-studio/reaudit', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        timeoutMs: 140_000,
        body: JSON.stringify({ action: 'fix_one', content, annotation }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (seq !== fixSeqRef.current) return
      if (data.fixedContent) {
        onChange(data.fixedContent); setDirty(true)
      }
      setAuditResult(data)
      setAnnotations(data.annotations || [])
      onScoreChange?.(data.score)
      setNotice(`Fixed "${annotation.code}" - new score ${data.score}/100`)
    } catch (err) {
      if (seq !== fixSeqRef.current) return
      setError(err instanceof Error ? err.message : 'Fix failed')
    } finally {
      clearInterval(tick)
      if (seq === fixSeqRef.current) {
        fixAbortRef.current = null
        setFixingOne(null)
        setFixElapsed(0)
      }
    }
  }, [content, fixingOne, onChange, onScoreChange])

  // Jump to annotation line
  const jumpToAnnotation = useCallback((a: InlineAnnotation) => {
    setActiveAnnotationId(a.id)
    if (textareaRef.current) {
      const before = content.split('\n').slice(0, a.line - 1).join('\n')
      const pos = before.length + (a.line > 1 ? 1 : 0) + (a.col - 1)
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos + a.highlightedText.length)
    }
  }, [content])

  // Load draft history
  const handleLoadHistory = useCallback(async () => {
    setShowHistory(!showHistory)
    if (!showHistory) {
      setLoadingDrafts(true)
      try {
        const res = await fetch(`/api/content-studio/drafts?jobId=${encodeURIComponent(jobId)}`, { credentials: 'same-origin' })
        const data = await res.json().catch(() => ({})) as any
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setDrafts(data.drafts || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drafts')
      } finally { setLoadingDrafts(false) }
    }
  }, [showHistory, jobId])

  const handleRestoreDraft = useCallback((d: DraftVersion) => {
    onChange(d.content); setDirty(true)
    setNotice(`Restored from ${new Date(d.createdAt).toLocaleString()}`)
  }, [onChange])

  const sc = auditResult ? scoreColor(auditResult.score) : C.textMuted

  const allBusy = busy || fixingAll || disabled

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Score bar */}
      {auditResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          borderRadius: 10, background: auditResult.ok ? '#F0FDF4' : '#FFF7ED',
          border: `1px solid ${auditResult.ok ? '#BBF7D0' : '#FED7AA'}`, fontSize: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24, background: sc, color: '#FFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18, fontFamily: C.mono, flexShrink: 0,
            boxShadow: `0 2px 8px ${sc}33`,
          }}>{auditResult.score}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>
              {auditResult.ok ? 'PASS: Quality gate passed' : 'FAIL: Quality gate blocked'}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {auditResult.blockers} blocker(s) - {auditResult.warnings} warning(s)
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, textAlign: 'right' }}>
            {auditResult.summary}
          </div>
        </div>
      )}

      {/* Primary Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Re-audit */}
        <button type="button" disabled={allBusy || !content.trim()} onClick={handleReaudit}
          style={btnStyle({ bg: '#EFF6FF', border: C.blue, color: C.blue, disabled: allBusy || !content.trim() })}>
          {busy ? 'Auditing...' : 'Re-audit'}
        </button>

        {/* Fix All — while running, the button becomes a live progress/cancel control */}
        {annotations.length > 0 && (
          <button type="button" disabled={busy || disabled} onClick={handleFixAll}
            style={btnStyle({
              bg: fixingAll ? '#FEE2E2' : '#F3E8FF',
              border: fixingAll ? C.red : C.purple,
              color: fixingAll ? C.red : C.purple,
              disabled: busy || disabled,
            })}>
            {fixingAll
              ? `Fixing all… ${fixElapsed > 0 ? fmtElapsed(fixElapsed) : ''}(click to cancel)`
              : `Fix all (${annotations.length})`}
          </button>
        )}

        {/* Toggle annotations */}
        {annotations.length > 0 && (
          <button type="button" disabled={allBusy} onClick={() => setShowAnnotations(!showAnnotations)}
            style={btnStyle({ bg: showAnnotations ? C.surface2 : C.surface, border: C.border, color: C.textMuted, disabled: allBusy })}>
            {showAnnotations ? 'Hide issues' : `${annotations.length} issue${annotations.length !== 1 ? 's' : ''}`}
          </button>
        )}

        {/* Draft history */}
        <button type="button" disabled={allBusy} onClick={handleLoadHistory}
          style={btnStyle({ bg: showHistory ? C.surface2 : C.surface, border: C.border, color: C.textMuted, disabled: allBusy })}>
          {showHistory ? 'Hide history' : 'Draft history'}
        </button>

        {/* Explicit Save */}
        <button type="button" disabled={saving || allBusy} onClick={handleSave}
          style={btnStyle({ bg: '#FFFBEB', border: C.gold, color: C.gold, disabled: saving || allBusy })}>
          {saving ? 'Saving...' : 'Save'}
        </button>

        {/* Status indicators */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && (
            <span style={{ fontSize: 10, color: C.orange, fontFamily: C.mono, fontWeight: 600 }}>
              Unsaved
            </span>
          )}
          {lastSaved && !dirty && (
            <span style={{ fontSize: 10, color: C.green, fontFamily: C.mono }}>
              Saved {lastSaved}
            </span>
          )}
        </div>
      </div>

      {/* Error / Notice */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 16, lineHeight: 1 }}>&times;</button>
        </div>
      )}
      {notice && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: C.green, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.green, fontSize: 16, lineHeight: 1 }}>&times;</button>
        </div>
      )}

      {/* Editor + Sidebars */}
      <div style={{ display: 'flex', gap: 12, minHeight: 320 }}>
        {/* Editor */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <textarea
            ref={textareaRef} value={content}
            onChange={(e) => { onChange(e.target.value); setDirty(true) }}
            disabled={disabled || allBusy}
            placeholder="The generated draft will appear here. Edit freely or use Re-audit to check quality..."
            spellCheck
            style={{
              width: '100%', height: '100%', minHeight: 320, resize: 'vertical',
              boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 14, fontFamily: C.mono, fontSize: 12, lineHeight: 1.75,
              color: C.text, background: '#FFFEFC', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.blue }}
            onBlur={(e) => { e.currentTarget.style.borderColor = C.border }}
          />
          {/* Gutter markers */}
          {annotations.length > 0 && (
            <div style={{ position: 'absolute', top: 0, left: 4, width: 6, height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
              {annotations.map((a) => (
                <div key={a.id} title={a.message} style={{
                  position: 'absolute', top: `${Math.max(0, (a.line - 1) * 21)}px`,
                  width: 6, height: 5, borderRadius: 3,
                  background: a.severity === 'blocker' ? C.red : C.orange,
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Annotation sidebar */}
        {showAnnotations && annotations.length > 0 && (
          <div style={{ width: 300, maxHeight: 420, overflow: 'auto', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8, flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
              fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              position: 'sticky', top: 0, background: C.surface, zIndex: 1 }}>
              Issues ({annotations.length})
            </div>
            {annotations.map((a) => (
              <div key={a.id} style={{
                padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                background: activeAnnotationId === a.id ? '#F0F7FF' : 'transparent',
                transition: 'background 0.15s',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 9,
                    fontWeight: 700, fontFamily: C.mono, textTransform: 'uppercase',
                    ...severityBadge(a.severity),
                  }}>{a.severity}</span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>L{a.line}</span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, flex: 1 }}>{a.code}</span>
                </div>
                {/* Message */}
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.45, marginBottom: 4 }}>{a.message}</div>
                {/* Highlighted text */}
                {a.highlightedText && (
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, fontFamily: C.mono,
                    background: C.surface2, borderRadius: 4, padding: '4px 8px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderLeft: `3px solid ${a.severity === 'blocker' ? C.red : C.orange}` }}>
                    &ldquo;{a.highlightedText.slice(0, 80)}{a.highlightedText.length > 80 ? '...' : ''}&rdquo;
                  </div>
                )}
                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => jumpToAnnotation(a)}
                    style={smallBtnStyle({ bg: C.blue, color: '#FFF' })}>
                    Jump to line
                  </button>
                  <button type="button"
                    disabled={allBusy || (fixingOne !== null && fixingOne !== a.id)}
                    onClick={() => handleFixOne(a)}
                    style={smallBtnStyle({
                      bg: fixingOne === a.id ? '#FEE2E2' : C.purple,
                      color: '#FFF',
                      disabled: allBusy || (fixingOne !== null && fixingOne !== a.id),
                    })}>
                    {fixingOne === a.id
                      ? `Cancel · ${fixElapsed > 0 ? fmtElapsed(fixElapsed) : ''}`
                      : 'AI Fix'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Draft history */}
        {showHistory && (
          <div style={{ width: 280, maxHeight: 420, overflow: 'auto', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8, flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
              fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              position: 'sticky', top: 0, background: C.surface, zIndex: 1 }}>
              Draft history {lastSaved && <span style={{ fontWeight: 400, color: C.textDim }}>(auto-saves)</span>}
            </div>
            {loadingDrafts ? (
              <div style={{ padding: 20, fontSize: 11, color: C.textDim, textAlign: 'center' }}>Loading...</div>
            ) : drafts.length === 0 ? (
              <div style={{ padding: 20, fontSize: 11, color: C.textDim, textAlign: 'center', lineHeight: 1.6 }}>
                No saved drafts yet.<br />Edits auto-save every 2 seconds.<br />Use <strong>Save</strong> to snapshot.
              </div>
            ) : (
              drafts.slice().reverse().map((d) => (
                <div key={d.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, fontWeight: 600 }}>
                    {new Date(d.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, display: 'flex', gap: 6 }}>
                    <span>{d.wordCount} words</span>
                    {d.diffSummary && (
                      <span style={{
                        color: d.diffSummary.startsWith('+') ? C.green : d.diffSummary.startsWith('-') ? C.red : C.textDim,
                        fontWeight: 600,
                      }}>{d.diffSummary}</span>
                    )}
                  </div>
                  <button type="button" onClick={() => handleRestoreDraft(d)}
                    style={{ marginTop: 6, ...smallBtnStyle({ bg: '#FFFBEB', color: C.gold, border: C.gold }) }}>
                    Restore
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function btnStyle({ bg, border, color, disabled }: { bg: string; border: string; color: string; disabled?: boolean }) {
  return {
    padding: '7px 16px', borderRadius: 8, border: `1px solid ${border}`,
    background: bg, color, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  }
}

function smallBtnStyle({ bg, color, border, disabled }: { bg: string; color: string; border?: string; disabled?: boolean }) {
  return {
    padding: '3px 10px', borderRadius: 5,
    border: border ? `1px solid ${border}` : 'none',
    background: bg, color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  }
}
