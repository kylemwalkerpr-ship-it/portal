'use client'

import React from 'react'
import { T, F } from './tokens'

export type DraftField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags' | 'requirements' | 'faq' | 'tier_features'

export interface TierSummary {
  tier?: 'basic' | 'standard' | 'premium' | string
  title?: string
  price?: number
  delivery_days?: number
  revisions?: number
  features?: string[]
}

export interface FaqEntry { question: string; answer: string }

interface KeywordSignal {
  term: string
  status: 'covered' | 'partial' | 'missing'
  source: 'category' | 'jurisdiction' | 'intent'
}
interface ResearchPayload {
  priorityKeywords: KeywordSignal[]
  coveredKeywords: string[]
  jurisdictionHint: string
}

export interface DraftContext {
  title?: string | null
  tagline?: string | null
  pitch?: string | null
  description?: string | null
  requirements?: string | null
  category?: string | null
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  faq?: FaqEntry[] | null
  tier?: TierSummary | null
  otherTiers?: TierSummary[] | null
}

interface AIDraftButtonProps {
  field: DraftField
  // Pull the latest context lazily, so the prompt always sees what the
  // seller has typed at click-time (not what was present at mount).
  getContext: () => DraftContext
  // Called only when the seller hits Save on the AI-drafted preview.
  // Until they click Save the field is untouched — keeping the AI
  // suggestion an opt-in change rather than an immediate overwrite.
  onApply: (value: string | string[] | FaqEntry[]) => void
  // Seller role — drives role-aware prompts on the server (attorney keeps
  // jurisdiction / USCIS / Home Office / IRCC anchors; consultant gets neutral
  // country/region + non-legal phrasing). The route also resolves from auth as
  // a safety net, but passing role explicitly avoids stale prompts when admins
  // edit on behalf of a seller.
  role?: 'attorney' | 'consultant'
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
  role = 'attorney',
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
  const [draftFaq, setDraftFaq] = React.useState<FaqEntry[]>([])
  // SEO research the backend grounded this draft in. Surfaced in the
  // preview so the seller can see WHY the AI chose specific keywords —
  // makes it visible that the assistant is SEO-led, not hallucinating.
  const [research, setResearch] = React.useState<ResearchPayload | null>(null)

  const panelRef = React.useRef<HTMLDivElement>(null)
  const isTagsField = field === 'tags'
  const isFaqField = field === 'faq'
  const isFeaturesField = field === 'tier_features'

  const resetAll = React.useCallback(() => {
    setOpen(false)
    setStage('input')
    setHint('')
    setError(null)
    setDraftText('')
    setDraftTags([])
    setDraftFaq([])
    setResearch(null)
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

  // Snapshot of the current preview so Regenerate can tell the server to
  // produce a DISTINCT alternative. Without this the prompt is byte-
  // identical and the LLM (temperature 0.4) returns the same text.
  const currentDraftSnapshot = (): string | undefined => {
    if (isFaqField && draftFaq.length) {
      return draftFaq.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n')
    }
    if ((isTagsField || isFeaturesField) && draftTags.length) {
      return draftTags.join(', ')
    }
    if (draftText) return draftText
    return undefined
  }

  const runGenerate = async (opts: { regenerate?: boolean } = {}) => {
    setBusy(true); setError(null)
    try {
      const data = await postJson('/api/seo-suggest', {
        field,
        role,
        context: getContext(),
        hint: hint || undefined,
        // Only send the previous value when this is an explicit regeneration;
        // first-time generations have nothing to dedup against.
        previousValue: opts.regenerate ? currentDraftSnapshot() : undefined,
      })
      const payload = data as { value: string | string[] | FaqEntry[]; research?: ResearchPayload }
      const value = payload.value
      if (payload.research) setResearch(payload.research)
      if (isFaqField && Array.isArray(value)) {
        setDraftFaq(value as FaqEntry[])
      } else if (Array.isArray(value)) {
        setDraftTags(value as string[])
      } else {
        setDraftText(String(value))
      }
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
    if (isFaqField) {
      const cleaned = draftFaq
        .map((e) => ({ question: e.question.trim(), answer: e.answer.trim() }))
        .filter((e) => e.question.length > 0 && e.answer.length > 0)
        .slice(0, 10)
      if (!cleaned.length) { setError('Keep at least one complete Q&A before saving.'); return }
      onApply(cleaned)
    } else if (isTagsField) {
      const cleaned = draftTags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 32)
        .slice(0, 5)
      if (!cleaned.length) { setError('Add at least one tag before saving.'); return }
      onApply(cleaned)
    } else if (isFeaturesField) {
      const cleaned = draftTags
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 120)
        .slice(0, 7)
      if (!cleaned.length) { setError('Add at least one feature bullet before saving.'); return }
      onApply(cleaned)
    } else {
      const cleaned = draftText.trim()
      if (!cleaned) { setError('Draft is empty — generate again or edit before saving.'); return }
      onApply(cleaned)
    }
    resetAll()
  }

  // Re-fire the draft against the API with the CURRENT draft sent as
  // `previousValue`, so the server prompt asks the LLM to vary the output.
  // The previous implementation just reset the popover back to the input
  // screen (no API call), which is why "Regenerate" appeared to do nothing
  // and the second draft read identically to the first.
  const regenerate = () => {
    setError(null)
    void runGenerate({ regenerate: true })
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
            width: stage === 'preview' ? (isFaqField ? '460px' : '380px') : '320px',
            maxHeight: isFaqField && stage === 'preview' ? '70vh' : 'none',
            overflowY: isFaqField && stage === 'preview' ? 'auto' : 'visible',
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
                  // Wrap so React's MouseEvent doesn't satisfy runGenerate's
                  // new { regenerate?: boolean } first arg — the bare
                  // onClick={runGenerate} form passed the event through and
                  // failed type-check on CI.
                  onClick={() => { void runGenerate() }}
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
              {research && research.priorityKeywords.length > 0 && (
                <div style={{
                  marginBottom: '10px',
                  padding: '8px 10px',
                  background: '#FFFFFF',
                  border: `1px solid ${T.indigo}22`,
                  borderRadius: '8px',
                }}>
                  <div style={{
                    fontSize: '9px', fontWeight: 700, color: T.indigo,
                    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                    marginBottom: '4px',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M6 3v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    SEO research used
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
                    {research.priorityKeywords.slice(0, 8).map((kw) => {
                      const tone = kw.status === 'covered' ? T.moss : kw.status === 'partial' ? '#8B5E0A' : T.indigo
                      return (
                        <span
                          key={kw.term}
                          title={`${kw.source} keyword — currently ${kw.status} in your gig`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            padding: '2px 7px', borderRadius: '4px',
                            fontSize: '10px', fontWeight: 600,
                            background: `${tone}10`, color: tone,
                            border: `1px solid ${tone}30`,
                          }}
                        >
                          {kw.term}
                          {kw.status === 'covered' && <span aria-hidden>✓</span>}
                        </span>
                      )
                    })}
                  </div>
                  {research.jurisdictionHint && (
                    <p style={{ margin: '6px 0 0', fontSize: '10px', color: T.inkSoft, lineHeight: 1.4 }}>
                      {research.jurisdictionHint}
                    </p>
                  )}
                </div>
              )}
              {isFaqField ? (
                <FaqPreview entries={draftFaq} onChange={setDraftFaq} />
              ) : isFeaturesField ? (
                <FeaturesPreview features={draftTags} onChange={setDraftTags} />
              ) : isTagsField ? (
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
              {!isTagsField && !isFaqField && !isFeaturesField && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: T.inkSoft }}>
                  <span>AI draft — edit before saving</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{draftText.length} chars</span>
                </div>
              )}
              {isFeaturesField && (
                <div style={{ marginTop: '6px', fontSize: '10px', color: T.inkSoft }}>
                  {draftTags.length} bullet{draftTags.length === 1 ? '' : 's'} · max 7 — edit, remove, reorder before saving
                </div>
              )}
              {isFaqField && (
                <div style={{ marginTop: '6px', fontSize: '10px', color: T.inkSoft }}>
                  {draftFaq.length} question{draftFaq.length === 1 ? '' : 's'} — edit, remove, or reorder before saving
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

function FaqPreview({
  entries, onChange,
}: { entries: FaqEntry[]; onChange: (next: FaqEntry[]) => void }) {
  const setQuestion = (i: number, value: string) => {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, question: value } : e)))
  }
  const setAnswer = (i: number, value: string) => {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, answer: value } : e)))
  }
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...entries]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const addBlank = () => onChange([...entries, { question: '', answer: '' }])

  const card: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${T.indigo}33`,
    background: `${T.indigo}05`,
    marginBottom: '8px',
  }
  const label: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: T.indigo,
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    marginBottom: '3px', display: 'block',
  }
  const input: React.CSSProperties = {
    width: '100%',
    padding: '7px 9px',
    borderRadius: '6px',
    border: `1px solid ${T.rule}`,
    background: '#FFFFFF',
    fontFamily: F.ui, fontSize: '12.5px',
    color: T.ink, outline: 'none',
    lineHeight: 1.45,
  }
  const iconBtn: React.CSSProperties = {
    width: '22px', height: '22px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: `1px solid ${T.rule}`,
    borderRadius: '4px', cursor: 'pointer',
    color: T.inkSoft, padding: 0, fontSize: '12px',
  }
  return (
    <div>
      {entries.map((entry, i) => (
        <div key={i} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '5px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: T.indigo, letterSpacing: '0.06em' }}>
              Q&A {i + 1}
            </span>
            <div style={{ display: 'inline-flex', gap: '4px' }}>
              <button type="button" aria-label="Move up"   onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
              <button type="button" aria-label="Move down" onClick={() => move(i, 1)}  disabled={i === entries.length - 1} style={{ ...iconBtn, opacity: i === entries.length - 1 ? 0.4 : 1 }}>↓</button>
              <button type="button" aria-label="Remove"    onClick={() => remove(i)} style={{ ...iconBtn, color: T.brick, borderColor: `${T.brick}40` }}>×</button>
            </div>
          </div>
          <label style={label}>Question</label>
          <input
            type="text"
            value={entry.question}
            onChange={(e) => setQuestion(i, e.target.value)}
            maxLength={200}
            style={{ ...input, marginBottom: '6px' }}
          />
          <label style={label}>Answer</label>
          <textarea
            value={entry.answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            rows={3}
            maxLength={600}
            style={{ ...input, resize: 'vertical' as const }}
          />
        </div>
      ))}
      {entries.length < 10 && (
        <button
          type="button"
          onClick={addBlank}
          style={{
            width: '100%', padding: '8px',
            borderRadius: '6px', cursor: 'pointer',
            background: 'transparent', color: T.indigo,
            border: `1px dashed ${T.indigo}55`,
            fontSize: '12px', fontWeight: 600,
            fontFamily: F.ui,
          }}
        >
          + Add empty Q&A
        </button>
      )}
    </div>
  )
}

function FeaturesPreview({
  features, onChange,
}: { features: string[]; onChange: (next: string[]) => void }) {
  const setAt = (i: number, value: string) => {
    onChange(features.map((f, idx) => (idx === i ? value : f)))
  }
  const remove = (i: number) => onChange(features.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...features]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const addBlank = () => onChange([...features, ''])
  const iconBtn: React.CSSProperties = {
    width: '22px', height: '22px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: `1px solid ${T.rule}`,
    borderRadius: '4px', cursor: 'pointer',
    color: T.inkSoft, padding: 0, fontSize: '12px',
  }
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      {features.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 8px',
            borderRadius: '7px',
            border: `1px solid ${T.indigo}33`,
            background: `${T.indigo}05`,
          }}
        >
          <span style={{
            fontSize: '10px', fontWeight: 700, color: T.indigo,
            minWidth: '14px', textAlign: 'center' as const,
          }}>
            {i + 1}
          </span>
          <input
            type="text"
            value={f}
            onChange={(e) => setAt(i, e.target.value)}
            maxLength={120}
            placeholder="e.g. Document review and feedback"
            style={{
              flex: 1, minWidth: 0,
              padding: '6px 8px',
              borderRadius: '5px',
              border: `1px solid ${T.rule}`,
              background: '#FFFFFF',
              fontFamily: F.ui, fontSize: '12.5px',
              color: T.ink, outline: 'none',
              lineHeight: 1.4,
            }}
          />
          <button type="button" aria-label="Move up"   onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
          <button type="button" aria-label="Move down" onClick={() => move(i, 1)}  disabled={i === features.length - 1} style={{ ...iconBtn, opacity: i === features.length - 1 ? 0.4 : 1 }}>↓</button>
          <button type="button" aria-label="Remove"    onClick={() => remove(i)} style={{ ...iconBtn, color: T.brick, borderColor: `${T.brick}40` }}>×</button>
        </div>
      ))}
      {features.length < 7 && (
        <button
          type="button"
          onClick={addBlank}
          style={{
            width: '100%', padding: '7px',
            borderRadius: '6px', cursor: 'pointer',
            background: 'transparent', color: T.indigo,
            border: `1px dashed ${T.indigo}55`,
            fontSize: '12px', fontWeight: 600,
            fontFamily: F.ui,
          }}
        >
          + Add empty bullet
        </button>
      )}
    </div>
  )
}
