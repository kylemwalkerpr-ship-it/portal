// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'

export default function AttorneyApp({ onLogout, userName }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/attorney/profile', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) {
          setError(payload?.error || 'Could not load your profile.')
          return
        }
        setData(payload)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || 'Could not load your profile.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const profile = data?.profile
  const attorney = data?.attorney
  const application = data?.application
  const displayName = profile?.full_name || userName || ''

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'inherit', color: C.text }}>
      <header
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '18px' }}>YouSafe Attorney Panel</div>
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

      <main style={{ maxWidth: '880px', margin: '40px auto', padding: '0 32px 64px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
            Welcome{displayName ? `, ${displayName}` : ''}.
          </h1>
          <p style={{ color: C.textMuted, lineHeight: 1.6, fontSize: '14px', margin: 0 }}>
            This is your attorney profile. Students see a summary of this when picking representation.
          </p>
        </div>

        {loading && (
          <div style={{ color: C.textMuted, fontSize: '14px' }}>Loading your profile...</div>
        )}

        {error && (
          <div
            style={{
              background: 'rgba(220,38,38,0.10)',
              border: '1px solid rgba(220,38,38,0.25)',
              color: C.red,
              padding: '12px 14px',
              borderRadius: '10px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <Section title="Bio">
              <Field label="Name" value={profile?.full_name} />
              <Field label="Email" value={profile?.email} />
              {application?.phone && <Field label="Phone" value={application.phone} />}
              <Field label="Credential" value={application?.credential_type} />
              <Field label="Jurisdictions" value={attorney?.jurisdictions || application?.jurisdictions} />
              <Field
                label="Practice areas"
                value={attorney?.practice_areas || application?.practice_areas}
              />
              <Field label="Capacity" value={application?.capacity} />
              {application?.profile_url && (
                <Field label="Profile URL" value={application.profile_url} link />
              )}
              {application?.notes && (
                <Field label="Notes from application" value={application.notes} multiline />
              )}
              {attorney?.bio && <Field label="Public bio" value={attorney.bio} multiline />}
            </Section>

            <Section title="Verification">
              <Field label="Bar / roll number" value={application?.bar_number} />
              <Field
                label="Malpractice / PI insurance"
                value={application?.malpractice_insurance}
              />
              <p style={{ color: C.textDim, fontSize: '12px', margin: '4px 0 0' }}>
                Verification details are visible to administrators only and are not shown on your
                public profile.
              </p>
            </Section>

            <div
              style={{
                border: `1px dashed ${C.border}`,
                borderRadius: '12px',
                padding: '20px',
                color: C.textMuted,
                fontSize: '13px',
              }}
            >
              Coming soon: edit your public bio, manage availability, browse the open inquiry queue,
              claim cases, secure messaging with clients, and payout status.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '20px 22px',
      }}
    >
      <h2
        style={{
          fontSize: '16px',
          fontWeight: 700,
          margin: '0 0 14px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: C.textMuted,
        }}
      >
        {title}
      </h2>
      <div style={{ display: 'grid', gap: '12px' }}>{children}</div>
    </section>
  )
}

function Field({ label, value, link, multiline }) {
  if (!value) return null
  return (
    <div>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: C.textDim,
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          style={{ color: C.cyan, fontSize: '14px', wordBreak: 'break-all' }}
        >
          {value}
        </a>
      ) : (
        <div
          style={{
            fontSize: '14px',
            whiteSpace: multiline ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </div>
      )}
    </div>
  )
}
