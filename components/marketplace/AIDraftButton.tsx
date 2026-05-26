'use client'

import React from 'react'
import { T, F } from './tokens'

export type DraftField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags'

export interface DraftContext {
  title?: string | null
  tagline?: string | null
  pitch?: string | null
  description?: string | null
  category?: string | null
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
}

interface AIDraftButtonProps {
  field: DraftField
  // Pull the latest context lazily, so the prompt always sees what the
  // seller has typed at click-time (not what was present at mount).
  getContext: () => DraftContext
  // Called only when the seller hits Save on the AI-drafted preview.
  // Until they click Save the field is untouched — keeping the AI
  // suggestion an opt-in change rather than an immediate overwrite.
  onApply: (value: string | string[]) => void
  label?: string
  size?: 'inline' | 'compact'
  minimalContext?: boolean
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = payload?.error?.message || payload?.error || `Request failed (${res.status})`
    const err = new Error(typeof msg === 'string' ? msg : 'Request failed') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return payload?.data ?? payload
}

const SPARKLE = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5L9.5 5.5L13.5 7L9.5 8.5L8 12.5L6.5 8.5L2.5 7L6.5 5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

type Stage = 'input' | 'preview'

export default function AIDraftButton({
  field, getContext, onApply,
  label = 'Draft with AI',
  size = 'inline',
  minimalContext = false,
}: AIDraftButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState<Stage>('input')
  const [hint, setHint] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Preview state — what the AI returned, editable by the seller
  // before they commit it into the form via Save.
  const [draftText, setDraftText] = React.useState('')
  const [draftTags, setDraftTags] = React.useState<string[]>([])

  const panelRef = React.useRef<HTMLDivElement>(null)
  const isTagsField = field === 'tags'

  const resetAll = React.useCallback(() => {
    setOpen(false)
    setStage('input')
    setHint('')
    setError(null)
    setDraftText('')
    setDraftTags([])
  }, [])

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Closing the popover before Save is a hard reset — the draft
        // is discarded. If the seller wants to keep an AI draft they
        // must explicitly Save it into the field first.
        resetAll()
      }
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') resetAll() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open, resetAll])

  const runGenerate = async () => {
    setBusy(true); setError(null)
    try {
      const data = await postJson('/api/seo-suggest', {
        field,
        context: getContext(),
        hint: hint || undefined,
      })
      const value = (data as { value: string | string[] }).value
      if (Array.isArray(value)) setDraftTags(value)
      else setDraftText(String(value))
      setStage('preview')
    } catch (e) {
      const status = (e as Error & { status?: number }).status
      const msg = e instanceof Error ? e.message : 'AI suggestion failed.'
      if (status === 503) setError('AI is not configured for this site yet — you can still draft manually.')
      else setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const acceptDraft = () => {
    if (isTagsField) {
      const cleaned = draftTags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 32)
        .slice(0, 5)
      if (!cleaned.length) { setError('Add at least one tag before saving.'); return }
      onApply(cleaned)
    } else {
      const cleaned = draftText.trim()
      if (!cleaned) { setError('Draft is empty — generate again or edit before saving.'); return }
      onApply(cleaned)
    }
    resetAll()
  }

  const regenerate = () => {
    setStage('input')
    setError(null)
    // Keep the hint so the seller can tweak it; clear only the draft.
    setDraftText('')
    setDraftTags([])
  }

  const btnHeight = size === 'compact' ? '24px' : '26px'
  const btnPad = size === 'compact' ? '0 8px' : '0 10px'
  const btnFont = size === 'compact' ? '11px' : '12px'

  return (
    <div ref={panelRef} style={{ position: 'relative' as const, display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => { if (open) resetAll(); else setOpen(true) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          height: btnHeight, padding: btnPad,
          borderRadius: '6px',
          background: open ? T.indigo : `${T.indigo}10`,
          color: open ? '#FFFFFF' : T.indigo,
          border: `1px solid ${T.indigo}30`,
          fontSize: btnFont, fontWeight: 700, letterSpacing: '0.01em',
          cursor: 'pointer', fontFamily: F.ui,
          whiteSpace: 'nowrap' as const,
          transition: 'background 0.12s, color 0.12s',
        }}
      >
        {SPARKLE}
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Draft with AI"
          style={{
            position: 'absolute' as const,
            top: 'calc(100% + 6px)', right: 0,
            background: '#FFFFFF',
            border: `1px solid ${T.indigo}33`,
            borderRadius: '10px',
            boxShadow: '0 10px 30px rgba(15,23,42,0.14), 0 3px 10px rgba(15,23,42,0.06)',
            padding: '12px',
            width: stage === 'preview' ? '380px' : '320px',
            zIndex: 50,
            fontFamily: F.ui,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: T.indigo, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {stage === 'input' ? 'Draft with AI' : 'Review draft'} · {field.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: stage === 'input' ? T.indigo : T.rule,
              }} />
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: stage === 'preview' ? T.indigo : T.rule,
              }} />
            </div>
          </div>

          {/* STAGE 1 — hint input */}
          {stage === 'input' && (
            <>
              {minimalContext && (
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: T.inkSoft, lineHeight: 1.45 }}>
                  Tip: fill out a working title first so the AI has something to build on.
                </p>
              )}
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Optional hint — e.g. mention 5-day delivery, USCIS focus, no guarantees"
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${T.rule}`,
                  background: '#FFFFFF',
                  fontFamily: F.ui, fontSize: '12px',
                  color: T.ink, outline: 'none', resize: 'vertical' as const,
                  lineHeight: 1.5,
                }}
              />
              {error && (
                <div style={{ marginTop: '8px', padding: '6px 9px', borderRadius: '6px', background: `${T.brick}10`, color: T.brick, fontSize: '11px', fontWeight: 600, lineHeight: 1.45 }}>
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
                    background: 'transparent', color: T.inkSoft,
                    border: `1px solid ${T.rule}`,
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: F.ui,
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
                    background: busy ? T.rule : T.indigo, color: '#FFFFFF',
                    border: 'none', fontSize: '12px', fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                    fontFamily: F.ui,
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  {SPARKLE}
                  {busy ? 'Drafting…' : 'Generate'}
                </button>
              </div>
            </>
          )}

          {/* STAGE 2 — editable preview + Save */}
          {stage === 'preview' && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '11px', color: T.inkSoft, lineHeight: 1.45 }}>
                Review before saving. Edit freely — Save drops this into the form. Click <strong>Update Gig</strong> at the bottom of the wizard to persist.
              </p>
              {isTagsField ? (
                <TagsPreview tags={draftTags} onChange={setDraftTags} />
              ) : (
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  autoFocus
                  rows={field === 'description' ? 10 : field === 'seo_description' || field === 'pitch' || field === 'tagline' ? 4 : 2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${T.indigo}33`,
                    background: `${T.indigo}05`,
                    fontFamily: F.ui, fontSize: '13px',
                    color: T.ink, outline: 'none', resize: 'vertical' as const,
                    lineHeight: 1.55,
                  }}
                />
              )}
              {!isTagsField && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: T.inkSoft }}>
                  <span>AI draft — edit before saving</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{draftText.length} chars</span>
                </div>
              )}
              {error && (
                <div style={{ marginTop: '8px', padding: '6px 9px', borderRadius: '6px', background: `${T.brick}10`, color: T.brick, fontSize: '11px', fontWeight: 600, lineHeight: 1.45 }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={regenerate}
                  style={{
                    padding: '6px 10px', borderRadius: '6px',
                    background: 'transparent', color: T.indigo,
                    border: `1px solid ${T.indigo}33`,
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: F.ui,
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  ↻ Regenerate
                </button>
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={resetAll}
                    style={{
                      padding: '6px 12px', borderRadius: '6px',
                      background: 'transparent', color: T.inkSoft,
                      border: `1px solid ${T.rule}`,
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      fontFamily: F.ui,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={acceptDraft}
                    style={{
                      padding: '6px 14px', borderRadius: '6px',
                      background: T.ink, color: '#FFFFFF',
                      border: 'none', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: F.ui,
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
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

function TagsPreview({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = React.useState('')
  const add = () => {
    const t = draft.trim().toLowerCase()
    if (!t || tags.includes(t) || tags.length >= 5) { setDraft(''); return }
    onChange([...tags, t])
    setDraft('')
  }
  const remove = (t: string) => onChange(tags.filter((x) => x !== t))
  return (
    <div style={{
      padding: '8px',
      borderRadius: '8px',
      border: `1px solid ${T.indigo}33`,
      background: `${T.indigo}05`,
      minHeight: '60px',
      display: 'flex', flexWrap: 'wrap' as const, gap: '5px',
      alignItems: 'flex-start',
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '4px 9px', borderRadius: '999px',
          background: '#FFFFFF', border: `1px solid ${T.indigo}40`,
          fontSize: '12px', fontWeight: 600, color: T.indigo,
        }}>
          {t}
          <button
            type="button"
            onClick={() => remove(t)}
            aria-label={`Remove ${t}`}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: T.indigo, padding: 0, fontSize: '14px', lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      {tags.length < 5 && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/,/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
            else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
          }}
          onBlur={add}
          placeholder={tags.length === 0 ? 'Type a tag, Enter to add' : 'Add another'}
          style={{
            flex: '1 1 120px', minWidth: '100px',
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: F.ui, fontSize: '12px', color: T.ink,
          }}
        />
      )}
    </div>
  )
}
