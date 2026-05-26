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
  onApply: (value: string | string[]) => void
  // Caption shown next to the sparkle icon. Defaults to "Draft with AI".
  label?: string
  // Layout — "inline" sits next to a label; "compact" is a tighter row variant.
  size?: 'inline' | 'compact'
  // True when the seller hasn't filled out enough fields yet (e.g. no
  // title). Click is still allowed, but we warn before sending so the
  // model isn't asked to invent everything from scratch.
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

export default function AIDraftButton({
  field, getContext, onApply,
  label = 'Draft with AI',
  size = 'inline',
  minimalContext = false,
}: AIDraftButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [hint, setHint] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const data = await postJson('/api/seo-suggest', {
        field,
        context: getContext(),
        hint: hint || undefined,
      })
      const value = (data as { value: string | string[] }).value
      onApply(value)
      setOpen(false)
      setHint('')
    } catch (e) {
      const status = (e as Error & { status?: number }).status
      const msg = e instanceof Error ? e.message : 'AI suggestion failed.'
      if (status === 503) setError('AI is not configured for this site yet — you can still draft manually.')
      else setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const btnHeight = size === 'compact' ? '24px' : '26px'
  const btnPad = size === 'compact' ? '0 8px' : '0 10px'
  const btnFont = size === 'compact' ? '11px' : '12px'

  return (
    <div ref={panelRef} style={{ position: 'relative' as const, display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
            width: '320px',
            zIndex: 50,
            fontFamily: F.ui,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: T.indigo, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Draft with AI · {field.replace(/_/g, ' ')}
          </div>
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
              onClick={() => { setOpen(false); setHint(''); setError(null) }}
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
              onClick={run}
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
        </div>
      )}
    </div>
  )
}
