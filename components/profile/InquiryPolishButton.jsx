// @ts-nocheck
'use client'
import React from 'react'
import { C } from '../design/shared'

// AI polish button for the student inquiry intake form. Different intent
// from ProfileAIDraftButton: this one DOES NOT generate text from scratch —
// it only reshapes what the student already wrote. The model is forbidden
// from inventing facts (see lib/inquirySuggest.ts), and the button is
// disabled until the draft has at least ~10 characters.
//
// Props:
//   field:        'case_description' | 'notes'
//   getDraft:     () => string         — lazy fetch of current textarea value
//   getContext:   () => { country, case_type, question_label, question_help }
//   onApply:      (polished: string) => void
//   label?:       button label (default "Polish with AI")

const SPARKLE = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5L9.5 5.5L13.5 7L9.5 8.5L8 12.5L6.5 8.5L2.5 7L6.5 5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

export default function InquiryPolishButton({ field, getDraft, getContext, onApply, label = 'Polish with AI' }) {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState('input')
  const [hint, setHint] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [polished, setPolished] = React.useState('')
  const [original, setOriginal] = React.useState('')

  const panelRef = React.useRef(null)

  const resetAll = React.useCallback(() => {
    setOpen(false)
    setStage('input')
    setHint('')
    setError('')
    setPolished('')
    setOriginal('')
  }, [])

  React.useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) resetAll()
    }
    const esc = (e) => { if (e.key === 'Escape') resetAll() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open, resetAll])

  async function runPolish() {
    setBusy(true); setError('')
    try {
      const draft = String(getDraft() || '').trim()
      setOriginal(draft)
      const ctx = typeof getContext === 'function' ? (getContext() || {}) : {}
      const res = await fetch('/api/inquiry/suggest', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          context: { ...ctx, draft },
          hint: hint || undefined,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = payload?.error?.message || payload?.error || `Request failed (${res.status})`
        throw new Error(typeof msg === 'string' ? msg : 'Request failed')
      }
      const data = payload?.data ?? payload
      setPolished(String(data?.value || ''))
      setStage('preview')
    } catch (e) {
      setError(e?.message || 'AI polish failed.')
    } finally {
      setBusy(false)
    }
  }

  function accept() {
    const cleaned = polished.trim()
    if (!cleaned) { setError('Polished draft is empty — try again or edit before saving.'); return }
    onApply(cleaned)
    resetAll()
  }

  const indigo = C.cyan
  const indigoSoft = C.cyanGlow || 'rgba(60,59,110,0.10)'

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => { if (open) resetAll(); else setOpen(true) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          height: '24px', padding: '0 9px',
          borderRadius: '6px',
          background: open ? indigo : indigoSoft,
          color: open ? '#FFFFFF' : indigo,
          border: `1px solid ${indigo}`,
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.01em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {SPARKLE}
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Polish your inquiry with AI"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)', right: 0,
            background: '#FFFFFF',
            border: `1px solid ${indigo}33`,
            borderRadius: '10px',
            boxShadow: '0 10px 30px rgba(15,23,42,0.14), 0 3px 10px rgba(15,23,42,0.06)',
            padding: '12px',
            width: '420px',
            maxHeight: '70vh',
            overflowY: 'auto',
            zIndex: 50,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: indigo, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {stage === 'input' ? 'Polish with AI' : 'Review polished draft'}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stage === 'input' ? indigo : C.border }} />
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stage === 'preview' ? indigo : C.border }} />
            </div>
          </div>

          {stage === 'input' && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '11px', color: C.textMuted, lineHeight: 1.5 }}>
                The AI reshapes what <em>you wrote</em> into clearer prose for an attorney. It never invents dates,
                documents, or facts you didn't include. Type a few sentences in the field below first, then click Polish.
              </p>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Optional — anything specific to fix? (e.g. 'make it shorter', 'organize chronologically')"
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${C.border2}`,
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: C.text, outline: 'none', resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              {error && (
                <div style={{ marginTop: '8px', padding: '6px 9px', borderRadius: '6px', background: 'rgba(220,38,38,0.10)', color: C.red, fontSize: '11px', fontWeight: 600, lineHeight: 1.45 }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetAll}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    background: 'transparent', color: C.textMuted,
                    border: `1px solid ${C.border2}`,
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={runPolish}
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    background: busy ? C.border : indigo, color: '#FFFFFF',
                    border: 'none', fontSize: '12px', fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {SPARKLE}
                  {busy ? 'Polishing…' : 'Polish'}
                </button>
              </div>
            </>
          )}

          {stage === 'preview' && (
            <>
              <p style={{ margin: '0 0 6px', fontSize: '11px', color: C.textMuted }}>
                Compare your original vs. the polished version. Edit freely before saving.
              </p>
              {original && (
                <details style={{ marginBottom: '8px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: C.textMuted }}>
                    Show your original
                  </summary>
                  <div style={{ marginTop: '6px', padding: '8px 10px', background: C.surface2, borderRadius: '6px', fontSize: '12px', color: C.textMuted, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {original}
                  </div>
                </details>
              )}
              <textarea
                value={polished}
                onChange={(e) => setPolished(e.target.value)}
                autoFocus
                rows={field === 'case_description' ? 10 : 5}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${indigo}33`,
                  background: `${indigoSoft}`,
                  fontSize: '13px',
                  color: C.text, outline: 'none', resize: 'vertical',
                  lineHeight: 1.55,
                }}
              />
              <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.textMuted }}>
                <span>AI polish — edit before saving</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{polished.length} chars</span>
              </div>
              {error && (
                <div style={{ marginTop: '8px', padding: '6px 9px', borderRadius: '6px', background: 'rgba(220,38,38,0.10)', color: C.red, fontSize: '11px', fontWeight: 600 }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => { setStage('input'); setError('') }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    background: 'transparent', color: indigo,
                    border: `1px solid ${indigo}55`,
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Re-polish
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={resetAll}
                    style={{
                      padding: '6px 12px', borderRadius: '6px',
                      background: 'transparent', color: C.textMuted,
                      border: `1px solid ${C.border2}`,
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={accept}
                    style={{
                      padding: '6px 14px', borderRadius: '6px',
                      background: indigo, color: '#FFFFFF',
                      border: 'none', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Save to field
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
