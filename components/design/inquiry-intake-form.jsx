// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn } from './shared'
import { COUNTRIES, recommendTier } from '@/lib/intake-questions'

const DRAFT_KEY = 'yousafe-inquiry-draft-v1'

// Multi-step intake wizard. Mirrors the rich question model used on
// legal.yousafeconsultancy.com so attorneys see the same structured context
// regardless of where the student submitted from. Auto-saves draft to
// localStorage so a refresh doesn't lose work.
export default function IntakeForm({ onCancel, onSubmitted, defaultEmail, defaultName, defaultPhone }) {
  const [country, setCountry] = React.useState(null)
  const [caseTypeId, setCaseTypeId] = React.useState('')
  const [answers, setAnswers] = React.useState({})
  const [questionIdx, setQuestionIdx] = React.useState(0)
  const [phase, setPhase] = React.useState('country') // country | case | questions | contact | review
  const [contact, setContact] = React.useState({
    full_name: defaultName || '',
    email: defaultEmail || '',
    phone: defaultPhone || '',
    notes: '',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  // Restore draft on mount.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.country) setCountry(draft.country)
      if (draft.caseTypeId) setCaseTypeId(draft.caseTypeId)
      if (draft.answers) setAnswers(draft.answers)
      if (draft.questionIdx) setQuestionIdx(draft.questionIdx)
      if (draft.phase) setPhase(draft.phase)
      if (draft.contact) setContact((c) => ({ ...c, ...draft.contact }))
    } catch {
      /* ignore */
    }
  }, [])

  // Persist draft on change.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ country, caseTypeId, answers, questionIdx, phase, contact }),
      )
    } catch {
      /* ignore */
    }
  }, [country, caseTypeId, answers, questionIdx, phase, contact])

  const countryConfig = React.useMemo(() => COUNTRIES.find((c) => c.id === country), [country])
  const caseType = React.useMemo(
    () => countryConfig?.caseTypes.find((c) => c.id === caseTypeId) ?? null,
    [countryConfig, caseTypeId],
  )
  const questions = caseType?.questions ?? []
  const currentQuestion = questions[questionIdx] ?? null
  const recommended = React.useMemo(
    () => (country && caseType ? recommendTier(country, caseType.id, answers) : null),
    [answers, caseType, country],
  )

  function setAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  function next() {
    setError('')
    if (phase === 'country') {
      if (!country) return setError('Pick where this matters first.')
      setPhase('case')
    } else if (phase === 'case') {
      if (!caseTypeId) return setError('Pick the type that matches your situation.')
      setPhase('questions')
      setQuestionIdx(0)
    } else if (phase === 'questions') {
      if (currentQuestion?.required && !hasAnswer(answers[currentQuestion.id])) {
        return setError('This one is required.')
      }
      if (questionIdx + 1 < questions.length) setQuestionIdx(questionIdx + 1)
      else setPhase('contact')
    } else if (phase === 'contact') {
      const v = contactValidation(contact)
      if (v) return setError(v)
      setPhase('review')
    }
  }

  function back() {
    setError('')
    if (phase === 'review') setPhase('contact')
    else if (phase === 'contact') {
      setPhase('questions')
      setQuestionIdx(Math.max(0, questions.length - 1))
    } else if (phase === 'questions') {
      if (questionIdx > 0) setQuestionIdx(questionIdx - 1)
      else setPhase('case')
    } else if (phase === 'case') setPhase('country')
  }

  async function submit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: contact.email.trim(),
          full_name: contact.full_name.trim(),
          phone: contact.phone.trim() || undefined,
          country,
          case_type: caseType.id,
          case_type_label: caseType.label,
          urgency: typeof answers.urgency === 'string' ? answers.urgency : undefined,
          recommended_tier: recommended?.tier,
          answers: { ...answers, _intake_notes: contact.notes.trim() },
          source: 'portal',
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Could not submit your inquiry.')
      try {
        window.localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      onSubmitted()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Progress bar ──
  const totalSteps = 4 + (questions.length || 0)
  const currentStep =
    phase === 'country' ? 1
    : phase === 'case' ? 2
    : phase === 'questions' ? 3 + questionIdx
    : phase === 'contact' ? 3 + questions.length
    : phase === 'review' ? 4 + questions.length
    : 1
  const progressPct = Math.min(100, Math.round((currentStep / totalSteps) * 100))

  return (
    <div style={{ padding: '24px 28px', maxWidth: '760px' }}>
      <button onClick={onCancel} type="button" style={backBtnStyle}>
        ← Back to my inquiries
      </button>

      <div style={{ marginBottom: '24px' }}>
        <div style={eyebrow}>Free legal intake</div>
        <h2 style={pageTitle}>Tell us about your case.</h2>
        <p style={pageSub}>
          We pre-screen your matter so an attorney can give you a useful first response without
          a 30-minute discovery call. Anything you put here is shared only with attorneys on the
          panel.
        </p>
      </div>

      <ProgressBar pct={progressPct} step={currentStep} total={totalSteps} />

      <div style={cardStyle}>
        {phase === 'country' && (
          <CountryPicker country={country} onPick={(c) => { setCountry(c); setCaseTypeId(''); setAnswers({}) }} />
        )}

        {phase === 'case' && countryConfig && (
          <CasePicker country={countryConfig} value={caseTypeId} onPick={(id) => { setCaseTypeId(id); setQuestionIdx(0); setAnswers({ ...answers }) }} />
        )}

        {phase === 'questions' && currentQuestion && (
          <QuestionScreen
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={(v) => setAnswer(currentQuestion.id, v)}
            indexLabel={`${questionIdx + 1} of ${questions.length}`}
          />
        )}

        {phase === 'contact' && (
          <ContactScreen contact={contact} setContact={setContact} />
        )}

        {phase === 'review' && (
          <ReviewScreen
            country={countryConfig}
            caseType={caseType}
            answers={answers}
            contact={contact}
            recommended={recommended}
            onJumpToQuestion={(i) => { setQuestionIdx(i); setPhase('questions') }}
            onJumpToCase={() => setPhase('case')}
            onJumpToContact={() => setPhase('contact')}
          />
        )}

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <Btn variant="ghost" size="md" onClick={back} disabled={phase === 'country'}>
            ← Back
          </Btn>
          {phase === 'review' ? (
            <Btn variant="primary" size="md" onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit inquiry'}
            </Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={next}>
              Next →
            </Btn>
          )}
        </div>
      </div>

      {recommended && phase !== 'country' && phase !== 'case' && (
        <div style={tierStyle}>
          <span style={{ color: C.textDim, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '8px' }}>
            Suggested tier
          </span>
          <strong style={{ color: C.text }}>{recommended.tier}</strong>
          <span style={{ color: C.textMuted, marginLeft: '8px', fontSize: '13px' }}>
            {recommended.description}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Phase components ───────────────────────────────────────────────────────

function CountryPicker({ country, onPick }) {
  return (
    <div>
      <h3 style={sectionHeading}>Where does this matter?</h3>
      <p style={sectionSub}>The jurisdiction sets which attorneys can review your case.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
        {COUNTRIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            style={{
              ...optionCard,
              borderColor: country === c.id ? C.cyan : C.border,
              background: country === c.id ? `${C.cyanGlow}` : C.surface,
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{c.flag}</div>
            <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ color: C.textMuted, fontSize: '12px', lineHeight: 1.5 }}>{c.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function CasePicker({ country, value, onPick }) {
  return (
    <div>
      <h3 style={sectionHeading}>What kind of matter is this?</h3>
      <p style={sectionSub}>{country.label} cases the panel handles. Pick the closest fit; you can add detail next.</p>
      <div style={{ display: 'grid', gap: '8px', marginTop: '20px' }}>
        {country.caseTypes.map((ct) => (
          <button
            key={ct.id}
            type="button"
            onClick={() => onPick(ct.id)}
            style={{
              ...listOptionCard,
              borderColor: value === ct.id ? C.cyan : C.border,
              background: value === ct.id ? C.cyanGlow : C.surface,
            }}
          >
            <span style={{ flex: 1, color: C.text, fontSize: '14px' }}>{ct.label}</span>
            {ct.hot && (
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', background: C.orange, color: '#fff', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                Popular
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuestionScreen({ question, value, onChange, indexLabel }) {
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: '6px' }}>Question {indexLabel}</div>
      <h3 style={sectionHeading}>{question.label}</h3>
      {question.help && <p style={sectionSub}>{question.help}</p>}
      <div style={{ marginTop: '20px' }}>
        <QuestionInput question={question} value={value} onChange={onChange} />
      </div>
    </div>
  )
}

function QuestionInput({ question, value, onChange }) {
  if (question.type === 'select') {
    return (
      <div style={{ display: 'grid', gap: '8px' }}>
        {question.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              ...listOptionCard,
              borderColor: value === opt.id ? C.cyan : C.border,
              background: value === opt.id ? C.cyanGlow : C.surface,
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ color: C.text, fontSize: '14px', fontWeight: value === opt.id ? 600 : 500 }}>{opt.label}</span>
            {opt.help && <span style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>{opt.help}</span>}
          </button>
        ))}
      </div>
    )
  }

  if (question.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div style={{ display: 'grid', gap: '8px' }}>
        {question.options.map((opt) => {
          const active = arr.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(active ? arr.filter((x) => x !== opt.id) : [...arr, opt.id])}
              style={{
                ...listOptionCard,
                borderColor: active ? C.cyan : C.border,
                background: active ? C.cyanGlow : C.surface,
              }}
            >
              <span style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${active ? C.cyan : C.border2}`, background: active ? C.cyan : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', flexShrink: 0 }}>
                {active ? '✓' : ''}
              </span>
              <span style={{ color: C.text, fontSize: '14px', textAlign: 'left' }}>{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'long_text') {
    return (
      <textarea
        rows={6}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || 'Your answer...'}
        style={{ ...inputStyle, resize: 'vertical', minHeight: '140px' }}
      />
    )
  }

  if (question.type === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  if (question.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || ''}
        style={inputStyle}
      />
    )
  }

  return (
    <input
      type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder || ''}
      style={inputStyle}
    />
  )
}

function ContactScreen({ contact, setContact }) {
  const update = (k, v) => setContact((c) => ({ ...c, [k]: v }))
  return (
    <div>
      <h3 style={sectionHeading}>How do attorneys reach you?</h3>
      <p style={sectionSub}>We use these to email you when an attorney responds. Phone is optional.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
        <Field label="Full name">
          <input value={contact.full_name} onChange={(e) => update('full_name', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Email">
          <input type="email" value={contact.email} onChange={(e) => update('email', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Phone (optional)">
          <input value={contact.phone} onChange={(e) => update('phone', e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ marginTop: '12px' }}>
        <Field label="Anything else (optional)">
          <textarea
            rows={3}
            value={contact.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Anything urgent, prior counsel, or context that doesn't fit above."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
      </div>
    </div>
  )
}

function ReviewScreen({ country, caseType, answers, contact, recommended, onJumpToQuestion, onJumpToCase, onJumpToContact }) {
  return (
    <div>
      <h3 style={sectionHeading}>Last look — does this match your situation?</h3>
      <p style={sectionSub}>You can edit anything before submitting. Attorneys see exactly what's listed here.</p>

      <ReviewSection title="Jurisdiction" onEdit={onJumpToCase}>
        {country?.label} · {caseType?.label}
      </ReviewSection>

      {(caseType?.questions ?? []).map((q, i) => (
        <ReviewSection key={q.id} title={q.label} onEdit={() => onJumpToQuestion(i)}>
          {formatAnswer(q, answers[q.id])}
        </ReviewSection>
      ))}

      <ReviewSection title="Contact" onEdit={onJumpToContact}>
        <div>{contact.full_name}</div>
        <div style={{ color: C.textMuted, fontSize: '13px' }}>{contact.email}{contact.phone ? ` · ${contact.phone}` : ''}</div>
        {contact.notes && <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{contact.notes}</div>}
      </ReviewSection>

      {recommended && (
        <div style={{ marginTop: '16px', padding: '12px 14px', background: C.cyanGlow, border: `1px solid ${C.cyan}33`, borderRadius: '8px' }}>
          <div style={{ color: C.cyan, fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Suggested tier · {recommended.tier}
          </div>
          <div style={{ color: C.text, fontSize: '13px' }}>{recommended.description}</div>
        </div>
      )}
    </div>
  )
}

function ReviewSection({ title, onEdit, children }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
            {title}
          </div>
          <div style={{ color: C.text, fontSize: '14px' }}>{children || <span style={{ color: C.textDim }}>Not answered</span>}</div>
        </div>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
          Edit
        </button>
      </div>
    </div>
  )
}

function ProgressBar({ pct, step, total }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: C.textMuted, fontSize: '12px' }}>
        <span>Step {step} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: C.surface3, borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: C.cyan, transition: 'width 200ms ease' }} />
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasAnswer(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

function contactValidation(contact) {
  if (!contact.full_name?.trim()) return 'Add your full name.'
  if (!/^\S+@\S+\.\S+$/.test(contact.email?.trim() || '')) return 'A valid email is required.'
  return null
}

function formatAnswer(question, value) {
  if (!hasAnswer(value)) return null
  if (question.type === 'select') {
    return question.options.find((o) => o.id === value)?.label ?? String(value)
  }
  if (question.type === 'multiselect' && Array.isArray(value)) {
    return value.map((v) => question.options.find((o) => o.id === v)?.label ?? v).join(', ')
  }
  return String(value)
}

// ── Styles ──────────────────────────────────────────────────────────────────

const eyebrow = {
  color: C.textMuted,
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
  marginBottom: '8px',
}
const pageTitle = { fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, margin: '0 0 10px', letterSpacing: '-0.012em' }
const pageSub = { color: C.textMuted, fontSize: '14px', lineHeight: 1.6, margin: 0 }
const sectionHeading = { fontFamily: C.serif, fontSize: '24px', fontWeight: 500, color: C.text, margin: '0 0 8px', letterSpacing: '-0.01em' }
const sectionSub = { color: C.textMuted, fontSize: '13px', lineHeight: 1.6, margin: 0 }

const cardStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '14px',
  padding: '28px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
}

const optionCard = {
  textAlign: 'left',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  padding: '18px 16px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 140ms, background 140ms',
}

const listOptionCard = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '10px',
  padding: '12px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 140ms, background 140ms',
  textAlign: 'left',
}

const inputStyle = {
  background: C.surface,
  border: `1px solid ${C.border2}`,
  borderRadius: '8px',
  padding: '10px 12px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
  width: '100%',
}

const errorBox = {
  marginTop: '16px',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.20)',
  color: C.red,
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: '13px',
}

const tierStyle = {
  marginTop: '14px',
  padding: '10px 14px',
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
}

const backBtnStyle = {
  background: 'none',
  border: 'none',
  color: C.textMuted,
  cursor: 'pointer',
  fontSize: '13px',
  marginBottom: '12px',
  fontFamily: 'inherit',
}
