'use client'

import React from 'react'
import Link from 'next/link'
import type { ComplianceItem, ComplianceStatus } from '@/lib/complianceItems'
import { PhoneVerificationCard } from '@/components/PhoneVerificationCard'
import { TwoFactorCard } from '@/components/TwoFactorCard'

const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

interface SellerComplianceViewProps {
  role: 'attorney' | 'consultant'
}

interface ComplianceResponse {
  items: ComplianceItem[]
  role: 'attorney' | 'consultant'
  profileStrength: { score: number; completed: number; total: number }
}

const STATUS_STYLES: Record<ComplianceStatus, { bg: string; ring: string; mark: string; markColor: string }> = {
  ok:      { bg: '#EAF5EE', ring: 'rgba(26,107,69,0.22)',  mark: '✓', markColor: '#1A6B45' },
  pending: { bg: '#FEF5E4', ring: 'rgba(139,94,10,0.25)',  mark: '!', markColor: '#8B5E0A' },
  missing: { bg: '#FEF5E4', ring: 'rgba(139,94,10,0.25)',  mark: '!', markColor: '#8B5E0A' },
  paused:  { bg: '#FAEAEA', ring: 'rgba(139,26,26,0.22)',  mark: '⏸', markColor: '#8B1A1A' },
}

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin', ...options,
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }
      : options.headers,
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

// Compliance items that can be auto-drafted by the AI. Mirrors the
// `editable` flag in lib/coherentFix.ts — keep these in lockstep.
const AI_DRAFTABLE_ITEMS = new Set([
  'credential_type', 'bar_number', 'malpractice', 'jurisdictions',
])

// Persist unsaved drafts to localStorage so the seller never loses what
// the AI wrote if they refresh before pasting into their application.
// Key is namespaced by item id; we cap to a single value per item.
function loadDraftFromLocal(itemId: string): string {
  if (typeof window === 'undefined') return ''
  try { return window.localStorage.getItem(`compliance_drafts:${itemId}`) || '' } catch { return '' }
}
function saveDraftToLocal(itemId: string, draft: string): void {
  if (typeof window === 'undefined') return
  try {
    if (draft) window.localStorage.setItem(`compliance_drafts:${itemId}`, draft)
    else window.localStorage.removeItem(`compliance_drafts:${itemId}`)
  } catch { /* storage disabled — silent fail */ }
}

export default function SellerComplianceView({ role }: SellerComplianceViewProps) {
  const [data, setData] = React.useState<ComplianceResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [explanations, setExplanations] = React.useState<Record<string, string>>({})
  const [explainBusyId, setExplainBusyId] = React.useState<string | null>(null)
  const [explainError, setExplainError] = React.useState<Record<string, string>>({})
  // AI-drafted "next step" text per item. The seller can edit it in
  // a textarea before saving — that's what the inline expansion exposes.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [draftBusyId, setDraftBusyId] = React.useState<string | null>(null)
  const [draftError, setDraftError] = React.useState<Record<string, string>>({})
  const [draftSeeds, setDraftSeeds] = React.useState<Record<string, number>>({})
  const [savedDraftId, setSavedDraftId] = React.useState<string | null>(null)
  const [checklist, setChecklist] = React.useState<string[] | null>(null)
  const [checklistBusy, setChecklistBusy] = React.useState(false)
  const [checklistError, setChecklistError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await requestJson('/api/compliance') as ComplianceResponse
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load compliance status.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  // Row click expands the inline panel. The 2-sentence "why this
  // matters" explanation is fetched lazily from /api/compliance/guide
  // (unchanged). For AI-draftable rows we also restore any saved
  // localStorage draft so a refresh doesn't lose the seller's text.
  const handleRowClick = (item: ComplianceItem) => {
    if (expandedId === item.id) { setExpandedId(null); return }
    setExpandedId(item.id)
    if (!explanations[item.id] && explainBusyId !== item.id) {
      void loadExplanation(item)
    }
    if (AI_DRAFTABLE_ITEMS.has(item.id) && !drafts[item.id]) {
      const saved = loadDraftFromLocal(item.id)
      if (saved) setDrafts((prev) => ({ ...prev, [item.id]: saved }))
    }
  }

  const loadExplanation = async (item: ComplianceItem) => {
    setExplainBusyId(item.id)
    setExplainError((prev) => ({ ...prev, [item.id]: '' }))
    try {
      const res = await requestJson('/api/compliance/guide', {
        method: 'POST',
        body: JSON.stringify({ mode: 'explain', itemId: item.id }),
      }) as { text: string }
      setExplanations((prev) => ({ ...prev, [item.id]: res.text }))
    } catch (e) {
      const err = e as Error & { status?: number }
      const msg = err.status === 503
        ? 'AI guidance isn\'t configured for this site yet.'
        : err.message || 'Could not load guidance.'
      setExplainError((prev) => ({ ...prev, [item.id]: msg }))
    } finally {
      setExplainBusyId(null)
    }
  }

  // Draft (or re-roll) the AI's next-step text for an editable
  // compliance item. Hits /api/compliance/coherent-fix which returns
  // a ready-to-paste paragraph with [BRACKETED] placeholders wherever
  // a real identifier (bar number, policy number, carrier) would go.
  const handleDraft = async (item: ComplianceItem) => {
    const nextSeed = (draftSeeds[item.id] ?? 0) + 1
    setDraftSeeds((prev) => ({ ...prev, [item.id]: nextSeed }))
    setDraftBusyId(item.id)
    setDraftError((prev) => ({ ...prev, [item.id]: '' }))
    try {
      const res = await requestJson('/api/compliance/coherent-fix', {
        method: 'POST',
        body: JSON.stringify({
          issueId: item.id,
          issueLabel: item.label,
          seed: nextSeed,
        }),
      }) as { draft: string; rationale: string }
      setDrafts((prev) => ({ ...prev, [item.id]: res.draft }))
      saveDraftToLocal(item.id, res.draft)
    } catch (e) {
      const err = e as Error & { status?: number }
      const msg = err.status === 503
        ? 'AI drafting isn\'t configured for this site yet.'
        : err.message || 'Could not draft the next step.'
      setDraftError((prev) => ({ ...prev, [item.id]: msg }))
    } finally {
      setDraftBusyId(null)
    }
  }

  // Persist the draft locally. No backend endpoint exists today for
  // patching arbitrary application/profile fields from this surface,
  // so we stash to localStorage and the seller pastes into the
  // existing intake / profile form via the row's primary action
  // button. The "Save draft" CTA is the fallback the spec calls for.
  const handleSaveDraft = (item: ComplianceItem) => {
    saveDraftToLocal(item.id, drafts[item.id] ?? '')
    setSavedDraftId(item.id)
    window.setTimeout(() => {
      setSavedDraftId((current) => current === item.id ? null : current)
    }, 2500)
  }

  const handleChecklist = async () => {
    setChecklistBusy(true); setChecklistError('')
    try {
      const res = await requestJson('/api/compliance/guide', {
        method: 'POST',
        body: JSON.stringify({ mode: 'checklist' }),
      }) as { items: string[] }
      setChecklist(res.items)
    } catch (e) {
      const err = e as Error & { status?: number }
      const msg = err.status === 503
        ? 'AI guidance isn\'t configured for this site yet.'
        : err.message || 'Could not draft the checklist.'
      setChecklistError(msg)
    } finally {
      setChecklistBusy(false)
    }
  }

  const okCount = data?.items.filter((i) => i.status === 'ok').length ?? 0
  const total = data?.items.length ?? 0

  return (
    <div style={{ display: 'grid', gap: '20px', fontFamily: sans }}>

      {/* Compliance status card */}
      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '10px',
          padding: '20px 22px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' as const, marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontFamily: serif, fontSize: '22px', fontWeight: 600, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
              Compliance status
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#5C6070' }}>
              {loading ? 'Checking…' : `${okCount} of ${total} compliance items in good standing`}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              padding: '6px 12px', borderRadius: '6px',
              background: 'transparent', color: '#5C6070',
              border: '1px solid #DDD8CE',
              fontSize: '12px', fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: sans,
              display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: '6px', background: '#FAEAEA', color: '#8B1A1A', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: '52px', background: '#F2EFE9', borderRadius: '8px' }} />
            ))}
          </div>
        ) : data ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {data.items.map((item) => {
              const s = STATUS_STYLES[item.status]
              const isOpen = expandedId === item.id
              const isDraftable = AI_DRAFTABLE_ITEMS.has(item.id)
              return (
                <div key={item.id} style={{ borderRadius: '8px', background: s.bg, border: `1px solid ${s.ring}`, overflow: 'hidden' }}>
                  {/* Row header — the entire div is the click target. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(item)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(item) } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px',
                      cursor: 'pointer', outline: 'none',
                      transition: 'background 0.15s ease',
                    }}
                    title="Click for AI guidance + a draft of the next step"
                  >
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: '#FFFFFF', color: s.markColor,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '13px', flexShrink: 0,
                      border: `1px solid ${s.ring}`,
                    }}>
                      {s.mark}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', color: '#5C6070', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {item.detail}
                      </div>
                    </div>
                    <div style={{ display: 'inline-flex', gap: '6px', flexShrink: 0 }}>
                      {/* Toggle pill — duplicate of the row click target,
                          kept for affordance + accessible button parity. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRowClick(item) }}
                        title="Open AI guidance + draft"
                        style={{
                          padding: '5px 10px', borderRadius: '5px',
                          background: 'transparent', color: '#3C3B6E',
                          border: '1px solid rgba(60,59,110,0.30)',
                          fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: sans,
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          whiteSpace: 'nowrap' as const,
                        }}
                      >
                        <span aria-hidden style={{ fontSize: '11px' }}>✦</span>
                        {isOpen ? 'Hide' : 'Explain'}
                      </button>
                      {item.actionHref && item.actionLabel && (
                        // Same-page hash links: /dashboard/compliance#phone,
                        // /dashboard/compliance#two-factor, etc. The Next.js
                        // Link component swallows the scroll on same-route
                        // navigation; a plain <a> respects the hash.
                        item.actionHref.includes('#') && item.actionHref.startsWith('/dashboard/compliance') ? (
                          <a
                            onClick={(e) => e.stopPropagation()}
                            href={`#${item.actionHref.split('#')[1] || ''}`}
                            style={{
                              padding: '5px 10px', borderRadius: '5px',
                              background: '#0F172A', color: '#FFFFFF',
                              fontSize: '11px', fontWeight: 700,
                              textDecoration: 'none', whiteSpace: 'nowrap' as const,
                            }}
                          >
                            {item.actionLabel}
                          </a>
                        ) : (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={item.actionHref}
                              style={{
                                padding: '5px 10px', borderRadius: '5px',
                                background: '#0F172A', color: '#FFFFFF',
                                fontSize: '11px', fontWeight: 700,
                                textDecoration: 'none', whiteSpace: 'nowrap' as const,
                              }}
                            >
                              {item.actionLabel}
                            </Link>
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Inline expansion — explanation + (for editable
                      rows) AI draft + textarea + Save draft CTA. */}
                  {isOpen && (
                    <div style={{ padding: '10px 14px 14px 50px', borderTop: `1px solid ${s.ring}`, background: '#FFFFFF' }}>
                      {/* Why this matters (2-sentence AI explanation) */}
                      {explainBusyId === item.id ? (
                        <div style={{ fontSize: '12px', color: '#5C6070' }}>Asking the assistant…</div>
                      ) : explainError[item.id] ? (
                        <div style={{ fontSize: '12px', color: '#8B1A1A' }}>{explainError[item.id]}</div>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#0F172A', lineHeight: 1.55, whiteSpace: 'pre-wrap' as const }}>
                          {explanations[item.id]}
                        </div>
                      )}

                      {/* AI draft + textarea + Save draft. Editable
                          rows only — for email/phone/2FA the explanation
                          above is enough, the row's primary action
                          button takes them to the real workflow. */}
                      {isDraftable && (
                        <div style={{ marginTop: '12px' }}>
                          {drafts[item.id] ? (
                            <>
                              <label style={{
                                display: 'block', fontSize: '11px', fontWeight: 700,
                                color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em',
                                marginBottom: '4px',
                              }}>
                                Draft for {item.label} — edit before submitting
                              </label>
                              <textarea
                                value={drafts[item.id] ?? ''}
                                onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                rows={5}
                                style={{
                                  width: '100%', padding: '8px 10px', borderRadius: '6px',
                                  border: '1px solid #DDD8CE', fontSize: '13px',
                                  fontFamily: sans, color: '#0F172A', background: '#FAFAF7',
                                  lineHeight: 1.55, resize: 'vertical' as const,
                                  boxSizing: 'border-box',
                                }}
                              />
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' as const }}>
                                <button
                                  type="button"
                                  onClick={() => handleSaveDraft(item)}
                                  style={{
                                    padding: '6px 12px', borderRadius: '5px',
                                    background: '#3C3B6E', color: '#FFFFFF',
                                    border: 'none', fontSize: '11px', fontWeight: 700,
                                    cursor: 'pointer', fontFamily: sans,
                                  }}
                                >
                                  Save draft locally
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDraft(item)}
                                  disabled={draftBusyId === item.id}
                                  style={{
                                    padding: '6px 12px', borderRadius: '5px',
                                    background: 'transparent', color: '#3C3B6E',
                                    border: '1px solid rgba(60,59,110,0.30)',
                                    fontSize: '11px', fontWeight: 700,
                                    cursor: draftBusyId === item.id ? 'wait' : 'pointer',
                                    fontFamily: sans,
                                  }}
                                >
                                  {draftBusyId === item.id ? 'Re-rolling…' : 'Re-roll'}
                                </button>
                                {savedDraftId === item.id && (
                                  <span style={{ fontSize: '11px', color: '#1A6B45', alignSelf: 'center', fontWeight: 600 }}>
                                    Saved locally. Paste into your application.
                                  </span>
                                )}
                              </div>
                            </>
                          ) : draftBusyId === item.id ? (
                            <div style={{ fontSize: '12px', color: '#5C6070', fontStyle: 'italic' }}>
                              Drafting next step with AI…
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDraft(item)}
                              disabled={draftBusyId === item.id}
                              style={{
                                marginTop: '4px',
                                padding: '7px 14px', borderRadius: '5px',
                                background: '#3C3B6E', color: '#FFFFFF',
                                border: 'none', fontSize: '12px', fontWeight: 700,
                                cursor: 'pointer', fontFamily: sans,
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                              }}
                            >
                              <span aria-hidden style={{ fontSize: '11px' }}>✦</span>
                              Draft my next step
                            </button>
                          )}
                          {draftError[item.id] && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#8B1A1A' }}>
                              {draftError[item.id]}
                            </div>
                          )}
                        </div>
                      )}

                      <p style={{ marginTop: '8px', fontSize: '10px', color: '#9097A8', lineHeight: 1.5 }}>
                        Guidance only — the AI never fills in your real credentials, bar numbers, or policy details. Replace bracketed placeholders with your actual values before submitting.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      {/* Phone verification card — anchored so the compliance list's
          "Verify" link scrolls here. PhoneVerificationCard drives the
          full SMS-OTP flow via Clerk; on success it pokes
          /api/profile/sync-phone which updates the profiles row this
          compliance endpoint reads. We refresh on mount of the success
          state so the "Phone verified" row flips green without a manual
          page reload. */}
      <section id="phone" style={{ scrollMarginTop: '80px' }}>
        <PhoneVerificationCard />
      </section>

      {/* Two-factor authentication card — same pattern as phone:
          Clerk owns enrolment, /api/profile/sync-phone mirrors the
          two_factor_enabled flag into profiles after success so the
          compliance row above flips to ✓ Enabled. */}
      <section id="two-factor" style={{ scrollMarginTop: '80px' }}>
        <TwoFactorCard />
        <button
          type="button"
          onClick={load}
          style={{
            marginTop: '8px', padding: '5px 10px',
            background: 'transparent', color: '#5C6070',
            border: '1px solid #DDD8CE', borderRadius: '5px',
            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            fontFamily: sans,
          }}
          title="Refresh compliance status after verifying phone or enabling 2FA"
        >
          ↻ Refresh status after verifying
        </button>
      </section>

      {/* Document upload card */}
      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '10px',
          padding: '20px 22px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' as const }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h2 style={{ fontFamily: serif, fontSize: '22px', fontWeight: 600, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
              Document upload
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#5C6070', lineHeight: 1.55 }}>
              Coming soon — upload bar admission cards, malpractice certificates, and licensure renewals.
              Today, send these to <a href="mailto:admin@yousafeconsultancy.com" style={{ color: '#3C3B6E', textDecoration: 'underline' }}>admin@yousafeconsultancy.com</a>.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#9097A8', lineHeight: 1.55 }}>
              Once enabled, expiring documents will alert you 30 days in advance, and the Compliance tile on your dashboard will warn before suspension.
            </p>
          </div>
          <button
            type="button"
            onClick={handleChecklist}
            disabled={checklistBusy}
            style={{
              padding: '8px 14px', borderRadius: '6px',
              background: '#3C3B6E', color: '#FFFFFF',
              border: 'none',
              fontSize: '12px', fontWeight: 700,
              cursor: checklistBusy ? 'wait' : 'pointer',
              fontFamily: sans, whiteSpace: 'nowrap' as const,
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              alignSelf: 'flex-start',
            }}
          >
            <span aria-hidden style={{ fontSize: '11px' }}>✦</span>
            {checklistBusy ? 'Drafting…' : 'Draft my document checklist'}
          </button>
        </div>

        {checklistError && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '6px', background: '#FAEAEA', color: '#8B1A1A', fontSize: '12px' }}>
            {checklistError}
          </div>
        )}

        {checklist && checklist.length > 0 && (
          <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(60,59,110,0.05)', borderRadius: '8px', border: '1px solid rgba(60,59,110,0.20)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#3C3B6E', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '8px' }}>
              Documents you&apos;ll need to upload
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' as const, display: 'grid', gap: '6px' }}>
              {checklist.map((it, i) => (
                <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#0F172A', lineHeight: 1.5 }}>
                  <span style={{ color: '#3C3B6E', flexShrink: 0 }}>—</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: '10px', fontSize: '10px', color: '#9097A8', lineHeight: 1.5 }}>
              Document names only — the AI does not fabricate numbers, dates, or carriers. Bring your own real documents.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

