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

export default function AdminInlineEditor({ content, jobId, onChange, disabled, onScoreChange }: Props) {
  const [annotations, setAnnotations] = useState<InlineAnnotation[]>([])
  const [auditResult, setAuditResult] = useState<{ ok: boolean; score: number; summary: string; blockers: number; warnings: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [drafts, setDrafts] = useState<DraftVersion[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setDirty(false)
      } catch { /* silent */ }
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [content, dirty, jobId])

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
      setAuditResult(data)
      setAnnotations(data.annotations || [])
      setShowAnnotations(true)
      onScoreChange?.(data.score)
      setNotice(`Score ${data.score}/100 - ${data.blockers} blocker(s), ${data.warnings} warning(s) - ${data.ok ? 'PASSED' : 'BLOCKED'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-audit failed')
    } finally { setBusy(false) }
  }, [content, onScoreChange])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Score bar */}
      {auditResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          borderRadius: 8, background: auditResult.ok ? '#F0FDF4' : '#FFF7ED',
          border: `1px solid ${auditResult.ok ? '#BBF7D0' : '#FED7AA'}`, fontSize: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: sc, color: '#FFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, fontFamily: C.mono, flexShrink: 0,
          }}>{auditResult.score}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: C.text }}>
              {auditResult.ok ? 'PASS: Quality gate passed' : 'FAIL: Quality gate blocked'}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
              {auditResult.blockers} blocker(s) - {auditResult.warnings} warning(s) - {auditResult.summary}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={busy || disabled || !content.trim()} onClick={handleReaudit}
          style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.blue}`,
            background: '#EFF6FF', color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
          {busy ? 'Auditing...' : 'Re-audit'}
        </button>

        {annotations.length > 0 && (
          <button type="button" disabled={busy || disabled} onClick={() => setShowAnnotations(!showAnnotations)}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: showAnnotations ? C.surface2 : C.surface, color: C.textMuted,
              cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit' }}>
            {showAnnotations ? 'Hide' : 'Show'} {annotations.length} issue{annotations.length !== 1 ? 's' : ''}
          </button>
        )}

        <button type="button" disabled={busy || disabled} onClick={handleLoadHistory}
          style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: showHistory ? C.surface2 : C.surface, color: C.textMuted,
            cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit' }}>
          {showHistory ? 'Hide' : 'Draft'} history
        </button>

        {dirty && (
          <span style={{ fontSize: 10, color: C.orange, fontFamily: C.mono }}>* Unsaved</span>
        )}
      </div>

      {/* Error / Notice */}
      {error && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: C.red }}>{error}</div>}
      {notice && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: C.green }}>{notice}</div>}

      {/* Editor + Sidebars */}
      <div style={{ display: 'flex', gap: 12, minHeight: 300 }}>
        {/* Editor */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <textarea
            ref={textareaRef} value={content}
            onChange={(e) => { onChange(e.target.value); setDirty(true) }}
            disabled={disabled || busy}
            placeholder="The generated draft will appear here..."
            spellCheck
            style={{
              width: '100%', height: '100%', minHeight: 300, resize: 'vertical',
              boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 12, fontFamily: C.mono, fontSize: 11, lineHeight: 1.7,
              color: C.text, background: '#FFFEFC', outline: 'none',
            }}
          />
          {/* Gutter markers */}
          {annotations.length > 0 && (
            <div style={{ position: 'absolute', top: 0, left: 4, width: 6, height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
              {annotations.map((a) => (
                <div key={a.id} title={a.message} style={{
                  position: 'absolute', top: `${Math.max(0, (a.line - 1) * 18.7)}px`,
                  width: 6, height: 4, borderRadius: 2,
                  background: a.severity === 'blocker' ? C.red : C.orange, opacity: 0.7,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Annotation sidebar */}
        {showAnnotations && annotations.length > 0 && (
          <div style={{ width: 280, maxHeight: 400, overflow: 'auto', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8, flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`,
              fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Issues ({annotations.length})
            </div>
            {annotations.map((a) => (
              <div key={a.id} onClick={() => jumpToAnnotation(a)} style={{
                padding: '8px 12px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                background: activeAnnotationId === a.id ? '#F0F7FF' : 'transparent', transition: 'background 0.15s',
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9,
                    fontWeight: 700, fontFamily: C.mono, textTransform: 'uppercase',
                    background: a.severity === 'blocker' ? '#FEE2E2' : '#FFF7ED',
                    color: a.severity === 'blocker' ? C.red : C.orange, flexShrink: 0 }}>
                    {a.severity}
                  </span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>L{a.line}</span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>{a.code}</span>
                </div>
                <div style={{ fontSize: 10, color: C.text, marginTop: 3, lineHeight: 1.4 }}>{a.message}</div>
                {a.highlightedText && (
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2, fontFamily: C.mono,
                    background: C.surface2, borderRadius: 3, padding: '2px 5px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    &ldquo;{a.highlightedText.slice(0, 60)}{a.highlightedText.length > 60 ? '...' : ''}&rdquo;
                  </div>
                )}
                <div style={{ marginTop: 5 }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); jumpToAnnotation(a) }}
                    style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: C.blue,
                      color: '#FFF', cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit' }}>
                    Jump to line
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Draft history */}
        {showHistory && (
          <div style={{ width: 260, maxHeight: 400, overflow: 'auto', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8, flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`,
              fontSize: 10, fontWeight: 700, color: C.textMuted, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Draft history
            </div>
            {loadingDrafts ? (
              <div style={{ padding: 16, fontSize: 11, color: C.textDim }}>Loading...</div>
            ) : drafts.length === 0 ? (
              <div style={{ padding: 16, fontSize: 11, color: C.textDim }}>
                No saved drafts yet. Edits auto-save every 2 seconds.
              </div>
            ) : (
              drafts.slice().reverse().map((d) => (
                <div key={d.id} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
                    {new Date(d.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                    {d.wordCount} words
                    {d.diffSummary && (
                      <span style={{ marginLeft: 6, color: d.diffSummary.startsWith('+') ? C.green : C.red }}>
                        {d.diffSummary}
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => handleRestoreDraft(d)} style={{
                    marginTop: 5, padding: '2px 8px', borderRadius: 4,
                    border: `1px solid ${C.gold}`, background: '#FFFBEB', color: C.gold,
                    cursor: 'pointer', fontSize: 9, fontWeight: 600, fontFamily: 'inherit',
                  }}>Restore</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
