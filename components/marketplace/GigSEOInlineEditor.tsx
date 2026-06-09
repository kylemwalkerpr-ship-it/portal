'use client'

import React from 'react'
import { T, F } from './tokens'

export type EditableField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'description' | 'tags'
  | 'category' | 'jurisdiction'

const AI_ELIGIBLE: EditableField[] = ['title', 'seo_title', 'seo_description', 'pitch', 'description', 'tags']

interface FieldConfig {
  label: string
  helper: string
  control: 'input' | 'textarea' | 'tags' | 'select'
  rows?: number
  softMin?: number
  softMax?: number
  hardMax?: number
  options?: Array<{ value: string; label: string }>
}

const FIELDS: Record<EditableField, FieldConfig> = {
  title: {
    label: 'Service title',
    helper: 'Customers see this first in search results. Keep it 20–80 characters and lead with “I will”.',
    control: 'input', softMin: 20, softMax: 80, hardMax: 80,
  },
  seo_title: {
    label: 'SEO title',
    helper: 'Shown in Google search results. Keep under 60 characters so it isn’t truncated.',
    control: 'input', softMax: 60, hardMax: 70,
  },
  seo_description: {
    label: 'SEO description',
    helper: 'The meta description Google shows under the title. 120–160 characters is the sweet spot.',
    control: 'textarea', rows: 3, softMin: 120, softMax: 160, hardMax: 200,
  },
  pitch: {
    label: 'Pitch / tagline',
    helper: 'A single-sentence summary shown on cards. 40–160 characters.',
    control: 'textarea', rows: 2, softMin: 40, softMax: 160, hardMax: 200,
  },
  description: {
    label: 'Long description',
    helper: 'Full sales copy on the gig page. Aim for 300+ characters of substantive prose.',
    control: 'textarea', rows: 10, softMin: 300, hardMax: 6000,
  },
  tags: {
    label: 'Tags',
    helper: 'Up to 5 keywords customers might search. Comma-separated, lowercase.',
    control: 'tags',
  },
  category: {
    label: 'Category',
    helper: 'Pick the closest parent category. Sub-categories live in the full gig editor.',
    control: 'select',
    options: [
      { value: 'immigration', label: 'Immigration' },
      { value: 'education',   label: 'Education' },
      { value: 'legal',       label: 'Legal' },
      { value: 'settlement',  label: 'Settlement' },
      { value: 'career',      label: 'Career' },
      { value: 'business',    label: 'Business' },
      { value: 'credentials', label: 'Credentials' },
      { value: 'mentorship',  label: 'Mentorship' },
    ],
  },
  jurisdiction: {
    label: 'Jurisdiction',
    helper: 'Customers filter by jurisdiction. Pick the country your service is for.',
    control: 'select',
    options: [
      { value: 'us', label: 'United States' },
      { value: 'uk', label: 'United Kingdom' },
      { value: 'ca', label: 'Canada' },
      { value: 'au', label: 'Australia' },
    ],
  },
}

interface GigSEOInlineEditorProps {
  gigId: string
  field: EditableField
  initialValue: string | string[]
  hintFromCheck?: string
  // When supplied, pre-fills the optional AI hint input. Used by the
  // holistic audit modal so "Apply AI fix" buttons that target a
  // specific cluster keyword arrive in the editor with the keyword
  // already typed in.
  prefillHint?: string
  // Auto-trigger the AI draft once on mount. The audit modal sets
  // this when the seller clicked "Apply AI fix" — they shouldn't have
  // to hit the Draft button a second time.
  autoDraft?: boolean
  onSaved: () => void
  onCancel: () => void
}

function countLen(value: string | string[]): number {
  return Array.isArray(value) ? value.length : value.length
}

function lengthBadge(value: string | string[], cfg: FieldConfig): { text: string; color: string } {
  const len = countLen(value)
  if (cfg.control === 'tags') {
    const ok = len >= 3 && len <= 5
    return { text: `${len}/5`, color: ok ? T.moss : len > 5 ? T.brick : '#D97706' }
  }
  const min = cfg.softMin ?? 0
  const max = cfg.softMax ?? cfg.hardMax ?? Infinity
  const within = len >= min && (cfg.softMax ? len <= cfg.softMax : true)
  const displayMax = cfg.softMax ?? cfg.hardMax
  return {
    text: displayMax ? `${len}/${displayMax}` : `${len} chars`,
    color: within ? T.moss : len < min ? '#D97706' : T.brick,
  }
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

async function patchJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = payload?.error?.message || payload?.error || `Save failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : 'Save failed')
  }
  return payload?.data ?? payload
}

export default function GigSEOInlineEditor({
  gigId, field, initialValue, hintFromCheck, prefillHint, autoDraft, onSaved, onCancel,
}: GigSEOInlineEditorProps) {
  const cfg = FIELDS[field]
  const [value, setValue] = React.useState<string | string[]>(initialValue)
  const [tagDraft, setTagDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [aiBusy, setAiBusy] = React.useState(false)
  const [aiHint, setAiHint] = React.useState(prefillHint || '')
  const [error, setError] = React.useState<string | null>(null)
  const [aiNote, setAiNote] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const autoFiredRef = React.useRef(false)

  React.useEffect(() => {
    // Autofocus the text input when the editor mounts so click-to-fix
    // feels truly inline.
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const canAi = AI_ELIGIBLE.includes(field)

  const handleAi = async () => {
    setAiBusy(true); setError(null); setAiNote(null)
    try {
      const data = await postJson(`/api/gigs/${gigId}/seo-suggest`, {
        field,
        hint: aiHint || hintFromCheck || '',
      })
      const next = (data as { value: string | string[] }).value
      setValue(next)
      setAiNote('Generated. Review and edit before saving.')
    } catch (e) {
      const status = (e as Error & { status?: number }).status
      const message = e instanceof Error ? e.message : 'AI suggestion failed.'
      if (status === 503) setError('AI is not configured for this site. You can still edit manually.')
      else setError(message)
    } finally {
      setAiBusy(false)
    }
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const patchBody: Record<string, unknown> = { [field]: value }
      await patchJson(`/api/gigs/${gigId}`, patchBody)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  // Auto-fire the AI draft once on mount when the parent (the holistic
  // audit modal) asked for it. Guarded by autoFiredRef so React 18
  // strict-mode double-mount doesn't double-charge the AI provider.
  React.useEffect(() => {
    if (!autoDraft || autoFiredRef.current || !canAi) return
    autoFiredRef.current = true
    void handleAi()
    // We deliberately depend only on autoDraft + canAi here; handleAi
    // is recreated every render but the autoFiredRef guard ensures it
    // only ever runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft, canAi])

  const addTagFromDraft = () => {
    const raw = tagDraft.trim().toLowerCase()
    if (!raw) return
    const next = Array.isArray(value) ? value : []
    if (next.includes(raw)) { setTagDraft(''); return }
    if (next.length >= 5) return
    setValue([...next, raw])
    setTagDraft('')
  }

  const removeTag = (t: string) => {
    if (!Array.isArray(value)) return
    setValue(value.filter((x) => x !== t))
  }

  const badge = lengthBadge(value, cfg)
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${T.rule}`,
    borderRadius: '8px',
    fontFamily: F.ui,
    fontSize: '13px',
    color: T.ink,
    background: '#FFFFFF',
    outline: 'none',
    lineHeight: 1.55,
    resize: 'vertical' as const,
  }

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '14px 16px',
        background: '#FFFFFF',
        border: `1px solid ${T.indigo}33`,
        borderRadius: '10px',
        boxShadow: `0 4px 16px ${T.indigoSoft}`,
        fontFamily: F.ui,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
        <span style={{ fontWeight: 700, fontSize: '12px', color: T.indigo, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Fix · {cfg.label}
        </span>
        {cfg.control !== 'select' && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, fontVariantNumeric: 'tabular-nums' }}>
            {badge.text}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: T.inkSoft, lineHeight: 1.5 }}>
        {cfg.helper}
      </p>

      {/* The actual field */}
      {cfg.control === 'input' && (
        <input
          ref={(el) => { inputRef.current = el }}
          type="text"
          value={typeof value === 'string' ? value : ''}
          maxLength={cfg.hardMax}
          onChange={(e) => setValue(e.target.value)}
          placeholder={cfg.label}
          style={inputStyle}
        />
      )}

      {cfg.control === 'textarea' && (
        <textarea
          ref={(el) => { inputRef.current = el }}
          rows={cfg.rows ?? 4}
          value={typeof value === 'string' ? value : ''}
          maxLength={cfg.hardMax}
          onChange={(e) => setValue(e.target.value)}
          placeholder={cfg.label}
          style={inputStyle}
        />
      )}

      {cfg.control === 'select' && (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setValue(e.target.value)}
          style={{ ...inputStyle, height: '38px', padding: '6px 10px' }}
        >
          <option value="">Select…</option>
          {cfg.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {cfg.control === 'tags' && (
        <div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px',
            padding: '8px', border: `1px solid ${T.rule}`, borderRadius: '8px',
            background: '#FFFFFF', minHeight: '40px',
          }}>
            {(Array.isArray(value) ? value : []).map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '4px 8px 4px 10px', borderRadius: '999px',
                  background: `${T.indigo}10`, color: T.indigo,
                  fontSize: '12px', fontWeight: 600,
                }}
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => removeTag(tag)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: T.indigo, padding: 0, fontSize: '14px', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={(el) => { inputRef.current = el as HTMLInputElement | null }}
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value.replace(/,/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagFromDraft() }
                else if (e.key === 'Backspace' && !tagDraft && Array.isArray(value) && value.length) {
                  setValue(value.slice(0, -1))
                }
              }}
              onBlur={addTagFromDraft}
              placeholder={Array.isArray(value) && value.length >= 5 ? '' : 'Add a tag and press Enter'}
              disabled={Array.isArray(value) && value.length >= 5}
              style={{
                flex: '1 1 140px', minWidth: '120px',
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: F.ui, fontSize: '12px', color: T.ink,
              }}
            />
          </div>
        </div>
      )}

      {/* AI controls — only for fields where it makes sense */}
      {canAi && (
        <div style={{ marginTop: '10px', padding: '10px', background: `${T.indigo}06`, border: `1px solid ${T.indigo}20`, borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
              type="text"
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder="Optional: add a hint (e.g. ‘mention 5-day delivery’)"
              style={{
                flex: 1,
                padding: '7px 10px',
                border: `1px solid ${T.rule}`,
                borderRadius: '6px',
                fontFamily: F.ui, fontSize: '12px', color: T.ink,
                background: '#FFFFFF', outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleAi}
              disabled={aiBusy}
              style={{
                padding: '7px 14px', borderRadius: '6px',
                background: aiBusy ? T.rule : T.indigo,
                color: '#FFFFFF', border: 'none',
                fontSize: '12px', fontWeight: 700, cursor: aiBusy ? 'wait' : 'pointer',
                fontFamily: F.ui, whiteSpace: 'nowrap' as const,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1.5L9.5 5.5L13.5 7L9.5 8.5L8 12.5L6.5 8.5L2.5 7L6.5 5.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              {aiBusy ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>
          {aiNote && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: T.moss, fontWeight: 600 }}>
              {aiNote}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
          background: `${T.brick}10`, color: T.brick,
          fontSize: '12px', fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: '6px',
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
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '7px 16px', borderRadius: '6px',
            background: saving ? T.rule : T.ink, color: '#FFFFFF',
            border: 'none',
            fontSize: '12px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            fontFamily: F.ui,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
