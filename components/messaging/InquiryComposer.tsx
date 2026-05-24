'use client'

import React from 'react'
import {
  COUNTRIES,
  getCountry,
  getCaseType,
  recommendTier,
  URGENCY_QUESTION,
  PRIOR_DENIAL_QUESTION,
  type Question,
  type CountryConfig,
  type CaseType,
} from '@/lib/intake-questions'
import { safetyGuard } from '@/lib/safety'

function flagFromCountryCode(code: string | undefined | null): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1f1e6
  const A = 'A'.charCodeAt(0)
  return String.fromCodePoint(
    base + (code.toUpperCase().charCodeAt(0) - A),
    base + (code.toUpperCase().charCodeAt(1) - A),
  )
}

interface InquiryComposerProps {
  onClose: () => void
  onSubmit?: (result: { inquiry_id: string; status_id: string }) => void
}

export default function InquiryComposer({ onClose, onSubmit }: InquiryComposerProps) {
  const [step, setStep] = React.useState(0)
  const [country, setCountry] = React.useState<string | null>(null)
  const [caseType, setCaseType] = React.useState<string | null>(null)
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>({})
  const [headline, setHeadline] = React.useState('')
  const [summary, setSummary] = React.useState('')
  const [error, setError] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const countryObj = country ? getCountry(country as any) : undefined
  const caseTypeObj = country && caseType ? getCaseType(country as any, caseType) : undefined

  const stepThreeQuestions = React.useMemo(() => {
    if (!caseTypeObj) return []
    // Pickers only; exclude urgency/prior_denial since they are in step 4
    return caseTypeObj.questions.filter(
      (q) => (q.type === 'select' || q.type === 'multiselect') && q.id !== 'urgency' && q.id !== 'prior_denial',
    )
  }, [caseTypeObj])

  const stepFourQuestions = React.useMemo<Question[]>(() => {
    const q: Question[] = [URGENCY_QUESTION]
    if (caseType && !['tenancy', 'loan', 'other_us', 'other_uk', 'other_ca'].includes(caseType)) {
      q.push(PRIOR_DENIAL_QUESTION)
    }
    return q
  }, [caseType])

  React.useEffect(() => {
    if (caseTypeObj && !headline) setHeadline(caseTypeObj.label)
  }, [caseTypeObj, headline])

  const STEPS = [
    { id: 'country', label: 'Country', short: '01' },
    { id: 'case', label: 'Case type', short: '02' },
    { id: 'details', label: 'Details', short: '03' },
    { id: 'urgency', label: 'Urgency', short: '04' },
    { id: 'review', label: 'Review', short: '05' },
  ]

  const canGoNext = React.useCallback(() => {
    if (step === 0) return !!country
    if (step === 1) return !!caseType
    if (step === 2) {
      return stepThreeQuestions.filter((q) => q.required).every((q) => answers[q.id])
    }
    if (step === 3) {
      return stepFourQuestions.filter((q) => q.required).every((q) => answers[q.id])
    }
    return headline.trim().length >= 5
  }, [step, country, caseType, stepThreeQuestions, stepFourQuestions, answers, headline])

  const goNext = () => {
    setError('')
    if (!canGoNext()) {
      setError('Pick an option to continue.')
      return
    }
    let next = step + 1
    if (next === 2 && stepThreeQuestions.length === 0) next = 3
    if (next === 3 && stepFourQuestions.length === 0) next = 4
    if (next > 4) {
      handleSubmit()
      return
    }
    setStep(next)
  }

  const goBack = () => {
    setError('')
    let prev = step - 1
    if (prev === 3 && stepFourQuestions.length === 0) prev = 2
    if (prev === 2 && stepThreeQuestions.length === 0) prev = 1
    if (prev < 0) prev = 0
    setStep(prev)
  }

  const handleSubmit = async () => {
    if (!headline.trim() || headline.trim().length < 5) {
      setError('Give your inquiry a short headline.')
      setStep(4)
      return
    }
    const scan = safetyGuard(headline + ' ' + (summary || ''))
    if (!scan.ok) {
      setError(scan.error || "Contact info isn't allowed — keep it on Yousafe.")
      setStep(4)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const r = await fetch('/api/inquiries/with-status', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          case_type: caseType,
          case_type_label: caseTypeObj?.label,
          headline: headline.trim(),
          summary: summary.trim() || undefined,
          answers,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d?.error?.message || 'Submit failed. Please try again.')
        setStep(4)
        return
      }
      onSubmit?.(d?.data || d)
      onClose()
    } catch {
      setError('Network error. Please try again.')
      setStep(4)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 260,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 640,
          height: '100%',
          maxHeight: '100vh',
          background: 'var(--panel)',
          borderRadius: '14px 0 0 14px',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          cursor: 'default',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', letterSpacing: '0.04em' }}>
            New inquiry
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 2, padding: '14px 18px 0' }}>
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default',
                opacity: i > step ? 0.45 : 1,
                padding: '4px 0',
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-plex-mono), monospace',
                color: i === step ? 'var(--accent)' : i < step ? 'var(--text-mid)' : 'var(--dim)',
              }}>{s.short}</span>
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: i === step ? 'var(--text)' : i < step ? 'var(--text-mid)' : 'var(--dim)',
              }}>{s.label}</span>
              <div style={{
                width: '100%', height: 3, borderRadius: 2, marginTop: 4,
                background: i <= step ? 'var(--accent)' : 'var(--border)',
              }} />
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          {step === 0 && (
            <StepCountry value={country} onPick={(c) => { setCountry(c); setCaseType(null); setAnswers({}); setStep(1) }} />
          )}
          {step === 1 && (
            <StepCaseType country={countryObj} value={caseType} onPick={(c) => { setCaseType(c); setAnswers({}); setStep(2) }} />
          )}
          {step === 2 && (
            <StepQuestions questions={stepThreeQuestions} answers={answers} setAnswers={setAnswers} />
          )}
          {step === 3 && (
            <StepQuestions questions={stepFourQuestions} answers={answers} setAnswers={setAnswers} />
          )}
          {step === 4 && (
            <StepReview
              country={countryObj}
              caseType={caseTypeObj}
              answers={answers}
              headline={headline}
              setHeadline={setHeadline}
              summary={summary}
              setSummary={setSummary}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 18px',
            background: 'color-mix(in oklab, var(--brick) 8%, transparent)',
            color: 'var(--brick)',
            fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderTop: '1px solid var(--border-soft)',
          gap: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Posts as a 24h status so attorneys and consultants can see it instantly.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 ? (
              <button type="button" className="cl-pill" onClick={goBack} disabled={submitting}>Back</button>
            ) : (
              <button type="button" className="cl-pill" onClick={onClose} disabled={submitting}>Cancel</button>
            )}
            <button
              type="button"
              className="cl-pill on"
              onClick={goNext}
              disabled={submitting}
              style={{ background: 'var(--indigo)', color: '#fff', borderColor: 'var(--indigo)' }}
            >
              {submitting ? 'Posting…' : step < 4 ? 'Next' : 'Post inquiry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Step 1: country ── */
function StepCountry({ value, onPick }: { value: string | null; onPick: (c: string) => void }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Which country is your case in?</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
        Routing rules and the legal questions we ask next depend on your jurisdiction.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {COUNTRIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: 16, borderRadius: 10,
              border: `1.5px solid ${value === c.id ? 'var(--indigo)' : 'var(--border)'}`,
              background: value === c.id ? 'rgba(60,59,110,0.06)' : 'var(--panel)',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 28 }}>{flagFromCountryCode(c.flag)}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{c.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Step 2: case type ── */
function StepCaseType({ country, value, onPick }: { country?: CountryConfig; value: string | null; onPick: (c: string) => void }) {
  if (!country) return null
  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>What's the case about?</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
        Pick the closest match — you can add nuance on the next screen.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {country.caseTypes.map((ct) => (
          <button
            key={ct.id}
            type="button"
            onClick={() => onPick(ct.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: 14, borderRadius: 10,
              border: `1.5px solid ${value === ct.id ? 'var(--indigo)' : 'var(--border)'}`,
              background: value === ct.id ? 'rgba(60,59,110,0.06)' : 'var(--panel)',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>📋</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {ct.label}
                {ct.hot && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 999,
                    background: 'color-mix(in oklab, var(--brick) 12%, transparent)',
                    color: 'var(--brick)',
                  }}>Hot</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                {ct.questions.filter((q) => q.type === 'select' || q.type === 'multiselect').length} quick question{ct.questions.filter((q) => q.type === 'select' || q.type === 'multiselect').length === 1 ? '' : 's'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Generic picker step (used by step 3 + step 4) ── */
function StepQuestions({
  questions,
  answers,
  setAnswers,
}: {
  questions: Question[]
  answers: Record<string, string | string[]>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>
}) {
  if (!questions || questions.length === 0) {
    return (
      <div>
        <p style={{ fontSize: 13, color: 'var(--text-soft)' }}>Nothing to ask here. Tap Next.</p>
      </div>
    )
  }

  const setOne = (id: string, val: string | string[]) => {
    setAnswers((a) => ({ ...a, [id]: val }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {questions.map((q) => (
        <div key={q.id}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {q.label}
              {q.required && <span style={{ color: 'var(--brick)', marginLeft: 2 }}>*</span>}
            </span>
            {q.help && <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>{q.help}</div>}
          </div>
          {(q.type === 'select' || q.type === 'multiselect') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt) => {
                const selected =
                  q.type === 'multiselect'
                    ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.id)
                    : answers[q.id] === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (q.type === 'multiselect') {
                        const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : []
                        setOne(
                          q.id,
                          cur.includes(opt.id) ? cur.filter((x) => x !== opt.id) : [...cur, opt.id],
                        )
                      } else {
                        setOne(q.id, opt.id)
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1.5px solid ${selected ? 'var(--indigo)' : 'var(--border)'}`,
                      background: selected ? 'rgba(60,59,110,0.06)' : 'var(--panel)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: q.type === 'multiselect' ? 4 : '50%',
                      border: `2px solid ${selected ? 'var(--indigo)' : 'var(--border)'}`,
                      background: selected ? 'var(--indigo)' : 'transparent',
                      display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1,
                    }}>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{opt.label}</span>
                      {opt.help && <span style={{ fontSize: 12, color: 'var(--text-soft)', display: 'block', marginTop: 1 }}>{opt.help}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Step 5: review + headline ── */
function StepReview({
  country,
  caseType,
  answers,
  headline,
  setHeadline,
  summary,
  setSummary,
}: {
  country?: CountryConfig
  caseType?: CaseType
  answers: Record<string, string | string[]>
  headline: string
  setHeadline: (v: string) => void
  summary: string
  setSummary: (v: string) => void
}) {
  const tier = recommendTier(
    (country?.id || 'US') as any,
    caseType?.id || '',
    answers as any,
  )
  const tierTone = tier.tier === 'Professional' ? 'urgent' : tier.tier === 'Enhanced' ? 'standard' : 'easy'

  const allQuestions = [
    ...(caseType?.questions || []),
    URGENCY_QUESTION,
    PRIOR_DENIAL_QUESTION,
  ]
  const lines: Array<{ label: string; value: string }> = []
  const seen = new Set<string>()
  for (const q of allQuestions) {
    if (seen.has(q.id)) continue
    seen.add(q.id)
    const v = answers[q.id]
    if (!v) continue
    if (q.type === 'select' || q.type === 'multiselect') {
      const opt = q.options.find((o) => o.id === v)
      if (opt) lines.push({ label: q.label, value: opt.label })
    } else if (typeof v === 'string' && v.trim()) {
      lines.push({ label: q.label, value: v })
    }
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Review your inquiry</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
        Sellers see this exactly as you write it. Keep contact details out — they're auto-blocked.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-mid)' }}>Headline</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={caseType?.label || 'Short headline'}
              maxLength={120}
              style={{
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--panel)',
                fontSize: 14, color: 'var(--text)', outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>{headline.length}/120</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-mid)' }}>
              Short summary <span style={{ color: 'var(--dim)', fontWeight: 400 }}>(optional)</span>
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="2–3 sentences. The first attorney to reply gets the conversation."
              rows={3}
              maxLength={400}
              style={{
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--panel)',
                fontSize: 14, color: 'var(--text)', outline: 'none', resize: 'vertical',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>{summary.length}/400</span>
          </label>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            padding: 14, borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--panel)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>{flagFromCountryCode(country?.flag)}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{country?.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{caseType?.label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>{l.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{l.value}</span>
                </div>
              ))}
              {lines.length === 0 && <div style={{ fontSize: 12, color: 'var(--dim)' }}>No specifics yet.</div>}
            </div>
          </div>

          <div style={{
            padding: 14, borderRadius: 10,
            border: '1px solid var(--border)',
            background: tierTone === 'urgent'
              ? 'color-mix(in oklab, var(--brick) 6%, transparent)'
              : tierTone === 'standard'
                ? 'color-mix(in oklab, var(--indigo) 6%, transparent)'
                : 'color-mix(in oklab, var(--moss) 6%, transparent)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
              Suggested tier
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{tier.tier}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-mid)', marginTop: 1 }}>{tier.price}</div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4, lineHeight: 1.4 }}>{tier.description}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
