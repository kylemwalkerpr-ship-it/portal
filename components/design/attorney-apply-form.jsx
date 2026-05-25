// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'

const FIELDS = [
  { name: 'full_name', label: 'Full legal name', required: true, placeholder: 'Jane Doe' },
  { name: 'phone', label: 'Phone (optional)', required: false, placeholder: '+1 555 555 5555' },
  {
    name: 'credential_type',
    label: 'Credential type',
    required: true,
    placeholder: 'e.g. Attorney, Solicitor, Barrister',
  },
  {
    name: 'jurisdictions',
    label: 'Jurisdictions',
    required: true,
    placeholder: 'e.g. England & Wales; New York',
  },
  { name: 'bar_number', label: 'Bar / roll number', required: true, placeholder: 'Reference number' },
  {
    name: 'practice_areas',
    label: 'Practice areas',
    required: true,
    placeholder: 'e.g. Immigration, Family, Housing',
  },
  {
    name: 'malpractice_insurance',
    label: 'Malpractice / PI insurance (optional)',
    required: false,
    placeholder: 'Insurer + policy reference',
  },
  {
    name: 'profile_url',
    label: 'Profile URL',
    required: true,
    placeholder: 'LinkedIn / firm bio / regulator listing',
  },
  {
    name: 'capacity',
    label: 'Capacity per month',
    required: true,
    placeholder: 'e.g. 5 cases / month',
  },
  { name: 'notes', label: 'Notes (optional)', required: false, multiline: true, placeholder: 'Anything else we should know.' },
]

export default function AttorneyApplyForm({ onLogout, defaultFullName, onSubmitted }) {
  const [values, setValues] = React.useState(() => {
    const init = Object.fromEntries(FIELDS.map((f) => [f.name, '']))
    if (defaultFullName) init.full_name = defaultFullName
    return init
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  function update(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')

    for (const f of FIELDS) {
      if (f.required && !values[f.name].trim()) {
        setError(`${f.label} is required.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/attorney/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not submit application.')
      }
      if (typeof onSubmitted === 'function') onSubmitted()
      else window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'inherit' }}>
      <header
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '18px', color: C.text }}>YouSafe Attorney Application</div>
        <button
          onClick={onLogout}
          style={{
            color: C.textDim,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '720px', margin: '40px auto', padding: '0 32px 64px' }}>
        <h1 style={{ color: C.text, fontSize: '26px', fontWeight: 700, marginBottom: '8px' }}>
          Apply to join the panel
        </h1>
        <p style={{ color: C.textMuted, lineHeight: 1.6, marginBottom: '28px', fontSize: '14px' }}>
          We use these details to verify your credentials and to populate your profile that students see when picking
          an attorney. You can edit your profile after approval.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {FIELDS.map((f) => (
            <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>
                {f.label}
                {f.required && <span style={{ color: C.red, marginLeft: '4px' }}>*</span>}
              </span>
              {f.multiline ? (
                <textarea
                  rows={4}
                  value={values[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              ) : (
                <input
                  type="text"
                  value={values[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              )}
            </label>
          ))}

          {error && (
            <div
              style={{
                background: 'rgba(220,38,38,0.10)',
                border: '1px solid rgba(220,38,38,0.25)',
                color: C.red,
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              alignSelf: 'flex-start',
              background: C.cyan,
              color: '#000',
              border: 'none',
              borderRadius: '999px',
              padding: '10px 22px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit application'}
          </button>
        </form>
      </main>
    </div>
  )
}

const inputStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  padding: '10px 12px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
  resize: 'vertical',
}
