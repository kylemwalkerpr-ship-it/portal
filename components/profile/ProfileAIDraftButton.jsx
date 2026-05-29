// @ts-nocheck
'use client'
import React from 'react'
import { C } from '../design/shared'

// Two-stage AI draft button for profile editor fields.
//   Stage 1: optional hint input → Generate
//   Stage 2: editable preview → Save (commits into the field via onApply)
//
// Save is opt-in: until the seller clicks Save, the field stays untouched.
// Closing the popover before Save discards the draft.
//
// Props:
//   field:        'tagline' | 'intro' | 'bio' | 'specialties' | 'practice_areas' | 'languages'
//   onApply:      (value: string | string[]) => void
//   label?:       button label (default "Draft with AI")

const LIST_FIELDS = new Set(['specialties', 'languages'])

const SPARKLE = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5L9.5 5.5L13.5 7L9.5 8.5L8 12.5L6.5 8.5L2.5 7L6.5 5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

export default function ProfileAIDraftButton({ field, onApply, label = 'Draft with AI' }) {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState('input')
  const [hint, setHint] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [draftText, setDraftText] = React.useState('')
  const [draftList, setDraftList] = React.useState([])

  const panelRef = React.useRef(null)
  const isList = LIST_FIELDS.has(field)

  const resetAll = React.useCallback(() => {
    setOpen(false)
    setStage('input')
    setHint('')
    setError('')
    setDraftText('')
    setDraftList([])
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

  async function runGenerate() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/profile/suggest', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, hint: hint || undefined }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = payload?.error?.message || payload?.error || `Request failed (${res.status})`
        throw new Error(typeof msg === 'string' ? msg : 'Request failed')
      }
      const data = payload?.data ?? payload
      const value = data?.value
      if (isList && Array.isArray(value)) {
        setDraftList(value)
      } else {
        setDraftText(String(value ?? ''))
      }
      setStage('preview')
    } catch (e) {
      setError(e?.message || 'AI suggestion failed.')
    } finally {
      setBusy(false)
    }
  }

  async function acceptDraft() {
    let valueToApply
    if (isList) {
      valueToApply = draftList
        .map((t) => String(t || '').trim())
        .filter((t) => t.length > 0 && t.length <= 48)
        .slice(0, 8)
      if (!valueToApply.length) { setError('Add at least one item before saving.'); return }
    } else {
      valueToApply = draftText.trim()
      if (!valueToApply) { setError('Draft is empty — generate again or edit before saving.'); return }
    }
    // Await the apply (which awaits the PATCH) so we can show "Saved"
    // on success or surface the error inline. Without awaiting, a
    // silent 401 / network failure looked like "the field didn't stick"
    // because the popover closed and the user got no feedback.
    setSaving(true)
    setError('')
    try {
      await onApply(valueToApply)
      resetAll()
    } catch (e) {
      setError(e?.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // Regenerate re-runs the AI with the same hint and replaces the current
  // draft in place — it stays on the preview stage. Previously it dumped
  // the user back to the hint-input stage, which read as "the draft
  // vanished / the popover closed" instead of producing a fresh draft.
  function regenerate() {
    setError('')
    setDraftText('')
    setDraftList([])
    runGenerate()
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
          aria-label={`Draft ${field} with AI`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)', right: 0,
            background: '#FFFFFF',
            border: `1px solid ${indigo}33`,
            borderRadius: '10px',
            boxShadow: '0 10px 30px rgba(15,23,42,0.14), 0 3px 10px rgba(15,23,42,0.06)',
            padding: '12px',
            width: stage === 'preview' && field === 'bio' ? '420px' : '340px',
            maxHeight: stage === 'preview' && field === 'bio' ? '70vh' : 'none',
            overflowY: stage === 'preview' && field === 'bio' ? 'auto' : 'visible',
            zIndex: 50,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: indigo, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {stage === 'input' ? 'Draft with AI' : 'Review draft'} · {field.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stage === 'input' ? indigo : C.border }} />
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stage === 'preview' ? indigo : C.border }} />
            </div>
          </div>

          {stage === 'input' && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '11px', color: C.textMuted, lineHeight: 1.45 }}>
                The AI uses your saved profile context — credentials, years, and existing prose.
                It will not invent identifiers, case counts, or outcome promises.
              </p>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Optional hint — e.g. warm tone, mention years of experience, highlight a specific specialty"
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
                  onClick={runGenerate}
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    background: busy ? C.border : indigo, color: '#FFFFFF',
                    border: 'none', fontSize: '12px', fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {SPARKLE}
                  {busy ? 'Drafting…' : 'Generate'}
                </button>
              </div>
            </>
          )}

          {stage === 'preview' && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '11px', color: C.textMuted, lineHeight: 1.45 }}>
                Edit freely. <strong>Save</strong> drops this into the field — the editor auto-saves your profile from there.
              </p>
              {isList ? (
                <ListPreview items={draftList} onChange={setDraftList} />
              ) : (
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  autoFocus
                  rows={field === 'bio' ? 12 : field === 'intro' ? 5 : 3}
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
              )}
              {!isList && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.textMuted }}>
                  <span>AI draft — edit before saving</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{draftText.length} chars</span>
                </div>
              )}
              {error && (
                <div style={{ marginTop: '8px', padding: '6px 9px', borderRadius: '6px', background: 'rgba(220,38,38,0.10)', color: C.red, fontSize: '11px', fontWeight: 600 }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={busy || saving}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    background: 'transparent', color: indigo,
                    border: `1px solid ${indigo}55`,
                    fontSize: '12px', fontWeight: 600,
                    cursor: busy || saving ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {SPARKLE}
                  {busy ? 'Regenerating…' : 'Regenerate'}
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={resetAll}
                    disabled={busy || saving}
                    style={{
                      padding: '6px 12px', borderRadius: '6px',
                      background: 'transparent', color: C.textMuted,
                      border: `1px solid ${C.border2}`,
                      fontSize: '12px', fontWeight: 600,
                      cursor: busy || saving ? 'wait' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={acceptDraft}
                    disabled={busy || saving}
                    style={{
                      padding: '6px 14px', borderRadius: '6px',
                      background: busy || saving ? C.border : indigo, color: '#FFFFFF',
                      border: 'none', fontSize: '12px', fontWeight: 700,
                      cursor: busy || saving ? 'wait' : 'pointer',
                    }}
                  >
                    {saving ? 'Saving…' : 'Save to field'}
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

function ListPreview({ items, onChange }) {
  const [draft, setDraft] = React.useState('')
  function add() {
    const v = draft.trim()
    if (!v) return
    if (items.includes(v)) { setDraft(''); return }
    onChange([...items, v])
    setDraft('')
  }
  function remove(idx) {
    onChange(items.filter((_, i) => i !== idx))
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
        {items.length === 0 && (
          <span style={{ color: C.textDim, fontSize: '12px' }}>No items yet.</span>
        )}
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: '999px', padding: '3px 9px',
              fontSize: '11px', color: C.text,
            }}
          >
            {it}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${it}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: '13px', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder="Add one and press Enter…"
          style={{
            flex: 1, padding: '6px 9px', borderRadius: '6px',
            border: `1px solid ${C.border2}`, background: '#FFFFFF',
            fontSize: '12px', color: C.text, outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={add}
          style={{
            padding: '6px 10px', borderRadius: '6px',
            background: 'transparent', color: C.cyan,
            border: `1px solid ${C.cyan}55`,
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
