// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn } from './shared'

const COUNTRIES = [
  { id: 'US', label: 'United States' },
  { id: 'UK', label: 'United Kingdom' },
  { id: 'CA', label: 'Canada' },
]

const URGENCY_OPTIONS = [
  { id: 'urgent', label: 'Urgent (within 7 days)' },
  { id: 'soon', label: 'Soon (within a month)' },
  { id: 'planning', label: 'Planning ahead' },
]

export default function IntakeForm({ onCancel, onSubmitted, defaultEmail, defaultName }) {
  const [country, setCountry] = React.useState('US')
  const [caseTypeLabel, setCaseTypeLabel] = React.useState('')
  const [urgency, setUrgency] = React.useState('soon')
  const [summary, setSummary] = React.useState('')
  const [fullName, setFullName] = React.useState(defaultName || '')
  const [email, setEmail] = React.useState(defaultEmail || '')
  const [phone, setPhone] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')

    if (!fullName.trim()) return setError('Full name is required.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('A valid email is required.')
    if (!caseTypeLabel.trim()) return setError('Tell us what kind of case this is.')
    if (!summary.trim()) return setError('Add a brief summary of your situation.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
          country,
          case_type: caseTypeLabel.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80),
          case_type_label: caseTypeLabel.trim(),
          urgency,
          source: 'portal',
          answers: { summary: summary.trim() },
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Could not submit your inquiry.')
      onSubmitted()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: '720px' }}>
      <button
        onClick={onCancel}
        type="button"
        style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', marginBottom: '12px' }}
      >
        ← Cancel
      </button>

      <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 4px' }}>New Inquiry</h2>
      <p style={{ color: C.textMuted, fontSize: '13px', margin: '0 0 20px' }}>
        Tell us about your case. Approved attorneys see your inquiry and can respond with a chat
        message and a custom offer.
      </p>

      <form onSubmit={submit} style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Labeled label="Full name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
          </Labeled>
          <Labeled label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </Labeled>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Labeled label="Phone (optional)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </Labeled>
          <Labeled label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
              {COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Labeled>
        </div>

        <Labeled label="Case type / what you need">
          <input
            value={caseTypeLabel}
            onChange={(e) => setCaseTypeLabel(e.target.value)}
            placeholder="e.g. F-1 reinstatement, marriage green card, tenancy dispute"
            style={inputStyle}
          />
        </Labeled>

        <Labeled label="Urgency">
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
            {URGENCY_OPTIONS.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Summary of your situation">
          <textarea
            rows={6}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Outline the facts, key dates, what's at stake, and what you've already tried. Don't include sensitive ID numbers in this initial summary."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Labeled>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', color: C.red, padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn variant="primary" size="md" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit inquiry'}
          </Btn>
          <Btn variant="ghost" size="md" type="button" onClick={onCancel}>
            Cancel
          </Btn>
        </div>
      </form>
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  padding: '10px 12px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
}
