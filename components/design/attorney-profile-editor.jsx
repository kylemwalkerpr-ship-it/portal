// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn } from './shared'
import ProfileAIDraftButton from '../profile/ProfileAIDraftButton'

// Editable Fiverr-style profile builder for the signed-in attorney.
// Headshot, tagline, intro, bio, languages, years of experience, education,
// specialties, free-consult flag, starting price, optional video link.
// Auto-saves field-by-field on blur to keep edits frictionless.
export default function AttorneyProfileEditor({ onSaved } = {}) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [savedFlash, setSavedFlash] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef(null)

  React.useEffect(() => {
    fetch('/api/attorney/profile', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          setError(payload?.error || 'Could not load your profile.')
          return
        }
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function patchLocal(field, value) {
    setData((d) => ({ ...d, attorney: { ...(d.attorney || {}), [field]: value } }))
  }

  // Save now THROWS on failure so callers (AI button) can await the
  // round-trip and decide whether to close their popover or surface the
  // error. Returns the merged attorney row on success.
  async function save(field, value) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/attorney/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ [field]: value }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || `Could not save change (${res.status}).`)
      // For application-only fields (bar_number, credential_type), the API
      // returns attorney:null because the update went to attorney_applications.
      // Patch local state from the value we sent so the editor shows the
      // change immediately without a round-trip refetch.
      setData((d) => {
        const next = { ...d }
        if (payload?.attorney) {
          next.attorney = { ...(d.attorney || {}), ...payload.attorney }
        } else {
          // Reflect the just-saved field locally for the application-row case.
          next.attorney = { ...(d.attorney || {}) }
          if (field !== 'bar_number' && field !== 'credential_type') {
            next.attorney[field] = value
          }
        }
        if (field === 'bar_number' || field === 'credential_type') {
          next.application = { ...(d.application || {}), [field]: value }
        }
        if (field === 'username') {
          next.profile = { ...(d.profile || {}), username: payload?.username ?? value }
        }
        return next
      })
      setSavedFlash('Saved')
      window.setTimeout(() => setSavedFlash(''), 1400)
      // Notify parent so the strength sidebar refreshes its score.
      try { onSaved && onSaved() } catch { /* ignore */ }
      return true
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setSaving(false)
    }
  }

  async function uploadHeadshot(file) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/attorney/profile/headshot', { method: 'POST', credentials: 'same-origin', body: form })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Upload failed.')
      patchLocal('headshot_url', payload.headshot_url)
      patchLocal('headshot_path', payload.headshot_path)
      setSavedFlash('Profile photo updated')
      window.setTimeout(() => setSavedFlash(''), 1400)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function removeHeadshot() {
    if (!confirm('Remove your profile photo?')) return
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/attorney/profile/headshot', { method: 'DELETE', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Remove failed.')
      patchLocal('headshot_url', null)
      patchLocal('headshot_path', null)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div style={notice}>Loading your profile...</div>
  if (error && !data) return <div style={errorBox}>{error}</div>
  if (!data) return null

  const a = data.attorney || {}
  const profile = data.profile || {}
  const application = data.application || {}
  const rating = data.rating || { count: 0, avg: null }

  const initial = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={{ padding: '24px 28px', maxWidth: '880px', display: 'grid', gap: '20px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={eyebrowStyle}>Your public profile</div>
          <h2 style={pageTitle}>How students see you.</h2>
          <p style={pageSub}>
            Treat this like a Fiverr seller profile. A clear profile photo, a sharp tagline, and concrete
            specialties dramatically improve your conversion when students compare offers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '24px' }}>
          {savedFlash && <span style={{ color: C.green, fontSize: '12px', fontWeight: 700 }}>{savedFlash} ✓</span>}
          {saving && !savedFlash && <span style={{ color: C.textDim, fontSize: '12px' }}>Saving…</span>}
        </div>
      </header>

      {error && <div style={errorBox}>{error}</div>}

      {/* Headshot + identity row */}
      <Card>
        <div id="profile-field-headshot" data-field="headshot" style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', scrollMarginTop: '24px' }}>
          <div style={{ position: 'relative' }}>
            {a.headshot_url ? (
              <img
                src={a.headshot_url}
                alt={profile.full_name || 'Profile photo'}
                style={{ width: '112px', height: '112px', borderRadius: '50%', objectFit: 'cover', border: `3px solid ${C.surface}` }}
              />
            ) : (
              <div
                style={{
                  width: '112px',
                  height: '112px',
                  borderRadius: '50%',
                  background: C.surface2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: C.serif,
                  fontSize: '44px',
                  color: C.cyan,
                }}
              >
                {initial}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontFamily: C.serif, fontSize: '24px', color: C.text, lineHeight: 1.2 }}>
              {profile.full_name || profile.email}
            </div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '2px' }}>
              {application.credential_type || 'Attorney'}
              {a.years_experience ? ` · ${a.years_experience} yrs experience` : ''}
            </div>
            <div style={{ marginTop: '10px', fontSize: '13px', color: C.textMuted }}>
              {rating.count > 0 ? (
                <span><span style={{ color: '#f5b400' }}>★</span> {rating.avg} ({rating.count} review{rating.count === 1 ? '' : 's'})</span>
              ) : (
                <span>No reviews yet</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => uploadHeadshot(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
            <Btn variant="primary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : a.headshot_url ? 'Change profile photo' : 'Upload profile photo'}
            </Btn>
            {a.headshot_url && (
              <Btn variant="ghost" size="sm" onClick={removeHeadshot} disabled={uploading}>
                Remove
              </Btn>
            )}
          </div>
        </div>
      </Card>

      {/* Public profile handle (SEO) */}
      <Card>
        <SectionLabel>Public profile handle</SectionLabel>
        <EditableField
          fieldId="username"
          label="Username (SEO slug)"
          help="REQUIRED before publishing gigs. Becomes your public profile URL (market.yousafeconsultancy.com/providers/<handle>). Keep it short, lowercase, and keyword-rich — e.g. immigration-attorney-ny, or jane-doe-immigration. Lowercase letters, numbers, dashes, underscores only; 3–32 chars; cannot start or end with - or _."
          value={profile.username || ''}
          maxLength={32}
          placeholder="immigration-attorney-ny"
          onSave={(v) => save('username', String(v || '').toLowerCase().trim())}
        />
      </Card>

      {/* Tagline + intro */}
      <Card>
        <SectionLabel>Pitch</SectionLabel>
        <EditableField
          fieldId="tagline"
          label="Tagline"
          help="One sharp line that shows on your card in search results. Aim for 60–120 characters."
          value={a.tagline}
          maxLength={160}
          placeholder="e.g. F-1 reinstatement specialist · 200+ approvals · responses within an hour"
          onSave={(v) => save('tagline', v)}
          aiField="tagline"
        />
        <EditableField
          fieldId="intro"
          label="Intro / byline"
          help="2–3 sentences that establish credibility and warmth. The first thing students read on your profile."
          value={a.intro}
          maxLength={600}
          multiline
          placeholder="I help international students reinstate their F-1 status fast. After 12 years and 200+ approved cases, I know exactly what USCIS wants to see — and what to leave out."
          onSave={(v) => save('intro', v)}
          aiField="intro"
        />
      </Card>

      {/* Bio */}
      <Card>
        <SectionLabel>Long bio</SectionLabel>
        <EditableField
          fieldId="bio"
          label="About you"
          help="The full story. Background, why you do this work, what kinds of clients you serve best."
          value={a.bio}
          maxLength={4000}
          multiline
          rows={8}
          placeholder="Open with a paragraph about your practice. Then write a second paragraph about who your ideal client is, and a third about how you work."
          onSave={(v) => save('bio', v)}
          aiField="bio"
        />
      </Card>

      {/* Hard credentials */}
      <Card>
        <SectionLabel>Credentials & coverage</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <EditableField
            fieldId="years"
            label="Years of experience"
            type="number"
            value={a.years_experience}
            onSave={(v) => save('years_experience', Number(v) || 0)}
          />
          <EditableField
            fieldId="starting_price"
            label="Starting price (USD)"
            help="Enter whole dollars (e.g. 250 for $250). Lowest price you'd typically quote — shown as 'starting at $X' on cards."
            type="number"
            // starting_price is stored in cents (DB contract — see the gig
            // builder + marketplace renderers, all of which divide by 100).
            // Display dollars; convert on save so the value the user typed
            // matches what shows up on their profile card.
            value={a.starting_price == null ? '' : Math.round(Number(a.starting_price) / 100)}
            onSave={(v) => {
              const dollars = Number(v)
              if (!Number.isFinite(dollars) || dollars <= 0) return save('starting_price', null)
              return save('starting_price', Math.round(dollars * 100))
            }}
          />
          <EditableField
            fieldId="timezone"
            label="Timezone"
            placeholder="e.g. America/New_York"
            value={a.timezone}
            onSave={(v) => save('timezone', v)}
          />
        </div>
        <div style={{ marginTop: '14px' }}>
          <EditableField
            fieldId="education"
            label="Education"
            help="Schools and degrees, one per line. JD first."
            value={a.education}
            multiline
            rows={3}
            placeholder="JD, Harvard Law School, 2012\nBA Government, Yale, 2009"
            onSave={(v) => save('education', v)}
          />
        </div>
        <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
          <EditableField
            fieldId="jurisdictions"
            label="Jurisdictions"
            help="Where you're admitted to practice. Comma-separated."
            value={a.jurisdictions}
            placeholder="New York, California, England & Wales"
            onSave={(v) => save('jurisdictions', v)}
          />
          <EditableField
            fieldId="practice_areas"
            label="Practice areas"
            help="Top-level practice categories. Comma-separated."
            value={a.practice_areas}
            placeholder="Immigration, Family, Housing"
            onSave={(v) => save('practice_areas', v)}
            aiField="practice_areas"
          />
        </div>
      </Card>

      {/* Verified credential — bar / registration number + credential type.
          Both fields live on attorney_applications (vetted at application
          time) but the PATCH /api/attorney/profile endpoint accepts edits
          via { bar_number, credential_type } and writes through to the
          latest application row. Without these here, the profile-strength
          checklist points to checks the user can't address. */}
      <Card>
        <SectionLabel>Verified credential</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <EditableField
            fieldId="credential"
            label="Credential type"
            help="e.g. JD (US Attorney), Solicitor (England & Wales), Avocat (France). Shown on your public card."
            value={application.credential_type || ''}
            maxLength={120}
            placeholder="JD · US Attorney"
            onSave={(v) => save('credential_type', v)}
          />
          <EditableField
            fieldId="bar"
            label="Bar / registration number"
            help="Required for a verified listing. Shown on your profile and used in disputes."
            value={application.bar_number || ''}
            maxLength={120}
            placeholder="e.g. NY 1234567"
            onSave={(v) => save('bar_number', v)}
          />
        </div>
      </Card>

      {/* Tags */}
      <Card>
        <SectionLabel>Specialties & languages</SectionLabel>
        <TagEditor
          fieldId="specialties"
          label="Specialties"
          help="More granular than practice areas — these are the things you're best at."
          values={a.specialties || []}
          placeholder="Add a specialty…"
          onChange={(arr) => save('specialties', arr)}
          aiField="specialties"
        />
        <div style={{ height: '14px' }} />
        <TagEditor
          fieldId="languages"
          label="Languages"
          help="Languages you can advise in fluently."
          values={a.languages || []}
          placeholder="Add a language…"
          onChange={(arr) => save('languages', arr)}
          aiField="languages"
        />
      </Card>

      {/* Toggles + video */}
      <Card>
        <SectionLabel>Engagement options</SectionLabel>
        <ToggleRow
          fieldId="free_consult"
          label="Offer a free 15-minute consult"
          help="Strongly improves click-through. No payment processing fee is charged for the consult itself."
          value={Boolean(a.offers_free_consult)}
          onChange={(v) => save('offers_free_consult', v)}
        />
        {/* Booking URL — only collected when the free consult toggle is
            on. When set, the public card's "Free 15-min consult" badge
            becomes a clickable link that opens the booking page in a
            new tab. Without it, the badge stays static (informational
            only) so the seller can flip the toggle on without yet
            having a scheduling tool wired up. */}
        {a.offers_free_consult && (
          <div style={{ marginTop: '12px' }}>
            <EditableField
              label="Free consult booking link"
              help="Calendly / Cal.com / Google Calendar appointments link. Paste the public URL. When set, students can book a 15-min slot directly from your card."
              value={a.consult_booking_url}
              placeholder="https://calendly.com/your-handle/15min"
              onSave={(v) => save('consult_booking_url', v)}
            />
          </div>
        )}
        <ToggleRow
          fieldId="available"
          label="Currently accepting new clients"
          help="Turn off if your queue is full. Profile stays visible but cards show 'Limited'."
          value={a.available !== false}
          onChange={(v) => save('available', v)}
        />
        <div style={{ marginTop: '12px' }}>
          <EditableField
            fieldId="video"
            label="Intro video URL (optional)"
            help="A 30-second YouTube or Vimeo link. Public-facing."
            value={a.video_intro_url}
            placeholder="https://youtube.com/watch?v=…"
            onSave={(v) => save('video_intro_url', v)}
          />
        </div>
      </Card>

      {/* Explicit save bar. Fields already auto-save on blur, but the
          button gives users a single, deliberate action so they can
          confirm everything is committed before leaving the page. It
          dispatches a `submit` event that bubbles to whatever input
          currently has focus — that forces any unblurred draft to
          commit via EditableField's onBlur path — and then re-fetches
          the canonical profile so the displayed values match the DB. */}
      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: '12px',
          padding: '14px 0 18px', background: `linear-gradient(180deg, transparent, ${C.surface} 28%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}
      >
        <div style={{ fontSize: '12px', color: C.textDim }}>
          Changes auto-save when you click away from a field.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {savedFlash && <span style={{ color: C.green, fontSize: '12px', fontWeight: 700 }}>{savedFlash} ✓</span>}
          <Btn
            type="button"
            disabled={saving}
            onClick={async () => {
              // Force any focused input to blur so its draft commits via
              // EditableField's onBlur handler before we re-fetch.
              const el = typeof document !== 'undefined' ? document.activeElement : null
              if (el && typeof (el).blur === 'function') (el).blur()
              setSaving(true)
              setError('')
              try {
                const res = await fetch('/api/attorney/profile', { credentials: 'same-origin' })
                const payload = await res.json().catch(() => null)
                if (!res.ok) throw new Error(payload?.error || 'Could not refresh profile.')
                setData(payload)
                setSavedFlash('Profile saved')
                window.setTimeout(() => setSavedFlash(''), 1600)
              } catch (e) {
                setError(e.message)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <section
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '22px 24px',
      }}
    >
      {children}
    </section>
  )
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        color: C.textMuted,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        marginBottom: '14px',
      }}
    >
      {children}
    </div>
  )
}

function EditableField({ label, help, value, onSave, multiline, rows = 3, placeholder, type = 'text', maxLength, aiField, fieldId }) {
  const [draft, setDraft] = React.useState(value ?? '')
  const [focused, setFocused] = React.useState(false)
  const inputRef = React.useRef(null)
  React.useEffect(() => setDraft(value ?? ''), [value])

  const dirty = String(draft ?? '') !== String(value ?? '')
  const commit = () => {
    if (!dirty) return
    onSave(draft)
  }

  const inputProps = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); commit() },
    placeholder,
    maxLength,
    ref: inputRef,
    style: {
      ...inputBase,
      borderColor: focused ? C.cyan : C.border2,
    },
  }

  return (
    <label
      id={fieldId ? `profile-field-${fieldId}` : undefined}
      data-field={fieldId || undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', scrollMarginTop: '24px' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={fieldLabelStyle}>{label}</span>
        {aiField && (
          <ProfileAIDraftButton
            field={aiField}
            onApply={async (v) => {
              // Optimistic: drop into input first so the user sees the
              // change instantly. THEN await the PATCH; if it fails the
              // AI button will surface the error and we'll need to roll
              // back the draft. The dirty check ensures we never
              // double-save the same value.
              const prev = draft
              setDraft(v)
              try {
                await onSave(v)
              } catch (e) {
                setDraft(prev)
                throw e
              }
            }}
          />
        )}
      </span>
      {multiline ? (
        <textarea rows={rows} {...inputProps} style={{ ...inputProps.style, resize: 'vertical' }} />
      ) : (
        <input type={type} {...inputProps} />
      )}
      {help && <span style={fieldHelpStyle}>{help}</span>}
    </label>
  )
}

function TagEditor({ label, help, values, placeholder, onChange, aiField, fieldId }) {
  const [draft, setDraft] = React.useState('')
  function addFromDraft() {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    const next = [...values, v]
    onChange(next)
    setDraft('')
  }
  function remove(tag) {
    onChange(values.filter((v) => v !== tag))
  }
  return (
    <div
      id={fieldId ? `profile-field-${fieldId}` : undefined}
      data-field={fieldId || undefined}
      style={{ scrollMarginTop: '24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={fieldLabelStyle}>{label}</span>
        {aiField && (
          <ProfileAIDraftButton
            field={aiField}
            onApply={async (v) => {
              // onChange wraps a parent save() — return its promise so the
              // AI popover awaits the PATCH and surfaces failures inline.
              await onChange(Array.isArray(v) ? v : [])
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 10px' }}>
        {values.length === 0 && <span style={{ color: C.textDim, fontSize: '13px' }}>No {label.toLowerCase()} added yet.</span>}
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: '999px',
              padding: '4px 10px',
              fontSize: '12px',
              color: C.text,
            }}
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              aria-label={`Remove ${v}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: '14px', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addFromDraft()
            }
          }}
          placeholder={placeholder}
          style={{ ...inputBase, flex: 1 }}
        />
        <Btn variant="ghost" size="sm" onClick={addFromDraft}>Add</Btn>
      </div>
      {help && <div style={{ ...fieldHelpStyle, marginTop: '6px' }}>{help}</div>}
    </div>
  )
}

function ToggleRow({ label, help, value, onChange, fieldId }) {
  return (
    <div
      id={fieldId ? `profile-field-${fieldId}` : undefined}
      data-field={fieldId || undefined}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}`, gap: '12px', scrollMarginTop: '24px' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ color: C.text, fontSize: '14px', fontWeight: 600 }}>{label}</div>
        {help && <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>{help}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        style={{
          width: '46px',
          height: '26px',
          borderRadius: '999px',
          border: 'none',
          background: value ? C.cyan : C.surface3,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 160ms',
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: value ? '23px' : '3px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: 'left 160ms',
          }}
        />
      </button>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const eyebrowStyle = {
  color: C.textMuted,
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
  marginBottom: '8px',
}

const pageTitle = { fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, margin: '0 0 10px', letterSpacing: '-0.012em' }
const pageSub = { color: C.textMuted, fontSize: '14px', lineHeight: 1.6, margin: 0, maxWidth: '600px' }
const fieldLabelStyle = { color: C.text, fontSize: '12px', fontWeight: 600 }
const fieldHelpStyle = { color: C.textMuted, fontSize: '12px', lineHeight: 1.45 }

const inputBase = {
  background: C.surface,
  border: `1px solid ${C.border2}`,
  borderRadius: '8px',
  padding: '9px 11px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
  width: '100%',
  outline: 'none',
  transition: 'border-color 140ms',
}

const notice = { padding: '24px 28px', color: C.textMuted, fontSize: '14px' }
const errorBox = {
  padding: '12px 14px',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.20)',
  color: C.red,
  borderRadius: '8px',
  fontSize: '13px',
}
