// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'

// ── Picker datasets ─────────────────────────────────────────────────────────
// Mirrors the choices the AttorneyIntakeWizard uses post-approval so the
// language is consistent end-to-end.

const CREDENTIAL_OPTIONS = [
  'J.D. · US Attorney',
  'Solicitor · England & Wales',
  'Barrister · England & Wales',
  'Solicitor · Scotland',
  'Solicitor · Northern Ireland',
  'RCIC · Canada Immigration Consultant',
  'Canadian Lawyer · Bar Admitted',
  'OISC L1 · UK',
  'OISC L2 · UK',
  'OISC L3 · UK',
  'Other',
]

const JURISDICTION_OPTIONS = [
  // US — top filing states for immigration / student visa work first.
  'New York, NY (USA)',
  'California (USA)',
  'Texas (USA)',
  'Florida (USA)',
  'Massachusetts (USA)',
  'Illinois (USA)',
  'New Jersey (USA)',
  'Pennsylvania (USA)',
  'Washington (USA)',
  'Georgia (USA)',
  'Virginia (USA)',
  'Arizona (USA)',
  // UK
  'England & Wales (UK)',
  'Scotland (UK)',
  'Northern Ireland (UK)',
  // Canada — most common immigration provinces.
  'Ontario (CA)',
  'British Columbia (CA)',
  'Quebec (CA)',
  'Alberta (CA)',
  'Manitoba (CA)',
  'Nova Scotia (CA)',
  // International
  'Ireland',
  'Australia',
  'New Zealand',
  'India',
  'UAE',
]

const PRACTICE_AREA_OPTIONS = [
  'Student visas (F-1, J-1)',
  'Study permits (Canada)',
  'Student Route (UK)',
  'OPT / STEM OPT',
  'CPT',
  'Post-graduation work permit (CA)',
  'H-1B / H-1B1',
  'Skilled Worker (UK)',
  'Express Entry / Federal Skilled Worker',
  'Provincial Nominee Program',
  'Green card / I-485',
  'Spousal sponsorship',
  'Family reunification',
  'EB-1 / O-1 / Extraordinary Ability',
  'Asylum & refugee',
  'Citizenship / Naturalization',
  'Housing & tenancy',
  'Tax (1040 / treaty positions)',
  'Banking & SSN',
  'Business immigration',
]

// Build a deduped, IANA-sorted timezone list. Falls back to the curated
// short list (matches AttorneyIntakeWizard) if the runtime doesn't
// expose Intl.supportedValuesOf — older Safari and some Cloudflare
// Workers builds notably do not.
const TIMEZONE_FALLBACK = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
]
function listTimezones() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      const all = Intl.supportedValuesOf('timeZone')
      if (Array.isArray(all) && all.length) return all
    }
  } catch { /* fall through */ }
  return TIMEZONE_FALLBACK
}
function guessTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

const CAPACITY_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 20, 30]

// ── Form ────────────────────────────────────────────────────────────────────

const empty = {
  full_name: '',
  phone: '',
  credential_type: '',
  credential_other: '',
  jurisdictions: [],          // multi-select array, serialized to "; "-joined string on submit
  bar_number: '',
  practice_areas: [],         // multi-select array, serialized to ", "-joined string on submit
  malpractice_insurance: '',
  profile_url: '',
  timezone: '',
  capacity: '',
  capacity_unit: 'cases / month',
  notes: '',
  headshot_url: '',
}

export default function AttorneyApplyForm({ onLogout, defaultFullName, onSubmitted }) {
  const [values, setValues] = React.useState(() => ({
    ...empty,
    full_name: defaultFullName || '',
    timezone: guessTimezone(),
  }))
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const [uploadingHeadshot, setUploadingHeadshot] = React.useState(false)
  const fileInputRef = React.useRef(null)

  function update(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function toggleArrayValue(name, item) {
    setValues((prev) => {
      const list = Array.isArray(prev[name]) ? prev[name] : []
      const exists = list.includes(item)
      return { ...prev, [name]: exists ? list.filter((x) => x !== item) : [...list, item] }
    })
  }

  async function handleHeadshotPick(e) {
    const file = e.target?.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 5 * 1024 * 1024) { setError('Headshot must be 5 MB or less.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Headshot must be JPG, PNG, or WEBP.'); return
    }
    setError('')
    setUploadingHeadshot(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/attorney/profile/headshot', { method: 'POST', credentials: 'same-origin', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not upload headshot.')
      update('headshot_url', data.url)
    } catch (err) {
      setError(err?.message || 'Headshot upload failed.')
    } finally {
      setUploadingHeadshot(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')

    // Required-field guard.
    if (!values.full_name.trim()) return setError('Full legal name is required.')
    if (!values.credential_type) return setError('Pick a credential type.')
    if (values.credential_type === 'Other' && !values.credential_other.trim()) {
      return setError('Tell us which credential applies under "Other".')
    }
    if (!values.jurisdictions.length) return setError('Pick at least one jurisdiction where you practise.')
    if (!values.bar_number.trim()) return setError('Bar or roll number is required.')
    if (!values.practice_areas.length) return setError('Pick at least one practice area.')
    if (!values.profile_url.trim()) return setError('A LinkedIn / firm / regulator URL is required.')
    if (!/^https?:\/\//i.test(values.profile_url.trim())) {
      return setError('Profile URL must start with http:// or https://.')
    }
    if (!values.capacity) return setError('Pick your monthly capacity.')

    // Serialize multi-selects on the way out so the existing API stays
    // a plain text payload — the wizard later parses these back into
    // arrays. This keeps the application route untouched.
    const capacityValue = `${values.capacity} ${values.capacity_unit}`
    const credentialType = values.credential_type === 'Other'
      ? `Other · ${values.credential_other.trim()}`
      : values.credential_type
    const submitPayload = {
      full_name: values.full_name.trim(),
      phone: values.phone.trim(),
      credential_type: credentialType,
      jurisdictions: values.jurisdictions.join('; '),
      bar_number: values.bar_number.trim(),
      practice_areas: values.practice_areas.join(', '),
      malpractice_insurance: values.malpractice_insurance.trim(),
      profile_url: values.profile_url.trim(),
      capacity: capacityValue,
      timezone: values.timezone || guessTimezone() || '',
      notes: values.notes.trim(),
      headshot_url: values.headshot_url || undefined,
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/attorney/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitPayload),
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

  const timezones = React.useMemo(() => listTimezones(), [])

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

      <main style={{ maxWidth: '760px', margin: '40px auto', padding: '0 32px 64px' }}>
        <h1 style={{ color: C.text, fontSize: '28px', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.01em' }}>
          Apply to join the panel
        </h1>
        <p style={{ color: C.textMuted, lineHeight: 1.6, marginBottom: '28px', fontSize: '14px' }}>
          We use these details to verify your credentials and to populate the profile that students see when picking
          an attorney. You can refine everything after approval.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Identity */}
          <Section title="Identity">
            <FieldGrid>
              <TextField
                label="Full legal name" required
                value={values.full_name}
                placeholder="Jane Doe"
                onChange={(v) => update('full_name', v)}
              />
              <TextField
                label="Phone (optional)" type="tel"
                value={values.phone}
                placeholder="+1 555 555 5555"
                onChange={(v) => update('phone', v)}
              />
            </FieldGrid>
            <p style={{ margin: 0, color: C.textDim, fontSize: '12px', lineHeight: 1.5 }}>
              You'll add your headshot, bio, and pricing after your application
              is approved — the next-step wizard handles that.
            </p>
          </Section>

          {/* Credentials */}
          <Section title="Credentials">
            <FieldGrid>
              <SelectField
                label="Credential type" required
                value={values.credential_type}
                options={CREDENTIAL_OPTIONS}
                placeholder="Pick a credential…"
                onChange={(v) => update('credential_type', v)}
              />
              <TextField
                label="Bar / roll number" required
                value={values.bar_number}
                placeholder="Reference number"
                onChange={(v) => update('bar_number', v)}
              />
            </FieldGrid>
            {values.credential_type === 'Other' && (
              <TextField
                label="Specify your credential" required
                value={values.credential_other}
                placeholder="e.g. Notary public, ACR, ICCRC senior member"
                onChange={(v) => update('credential_other', v)}
              />
            )}
            <ChipMultiSelect
              label="Jurisdictions" required
              help="Where you're admitted to practise. Pick all that apply."
              options={JURISDICTION_OPTIONS}
              values={values.jurisdictions}
              onToggle={(item) => toggleArrayValue('jurisdictions', item)}
              allowCustom
            />
            <ChipMultiSelect
              label="Practice areas" required
              help="The intake categories you'd accept inquiries on."
              options={PRACTICE_AREA_OPTIONS}
              values={values.practice_areas}
              onToggle={(item) => toggleArrayValue('practice_areas', item)}
              allowCustom
            />
            <TextField
              label="Malpractice / PI insurance (optional)"
              value={values.malpractice_insurance}
              placeholder="Insurer + policy reference"
              onChange={(v) => update('malpractice_insurance', v)}
            />
          </Section>

          {/* Presence */}
          <Section title="Presence">
            <TextField
              label="Profile URL" required type="url"
              help="Public-facing bio so we can verify you (LinkedIn, firm page, or regulator listing)."
              value={values.profile_url}
              placeholder="https://www.linkedin.com/in/..."
              onChange={(v) => update('profile_url', v)}
            />
            <FieldGrid>
              <SearchableSelect
                label="Timezone"
                help="So we can match working-hour expectations with students."
                value={values.timezone}
                options={timezones}
                placeholder="Search… e.g. America/New_York"
                onChange={(v) => update('timezone', v)}
              />
              <CapacityField
                label="Capacity per month" required
                value={values.capacity}
                unit={values.capacity_unit}
                onChange={(v) => update('capacity', v)}
                onUnitChange={(u) => update('capacity_unit', u)}
              />
            </FieldGrid>
            <TextField
              label="Notes (optional)" multiline
              value={values.notes}
              placeholder="Anything else we should know — e.g. specialties, languages, fee model."
              onChange={(v) => update('notes', v)}
            />
          </Section>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
            <button
              type="submit"
              disabled={submitting || uploadingHeadshot}
              style={{
                background: C.cyan,
                color: '#000',
                border: 'none',
                borderRadius: '999px',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting || uploadingHeadshot ? 0.6 : 1,
              }}
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
            <span style={{ color: C.textDim, fontSize: '12px' }}>
              We typically reply within one business day.
            </span>
          </div>
        </form>
      </main>
    </div>
  )
}

// ── Layout primitives ────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div
        style={{
          color: C.textMuted,
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function FieldGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
      }}
    >
      {children}
    </div>
  )
}

function FieldLabel({ children, required, help }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>
        {children}
        {required && <span style={{ color: C.red, marginLeft: '4px' }}>*</span>}
      </span>
      {help && <span style={{ color: C.textDim, fontSize: '12px', lineHeight: 1.5 }}>{help}</span>}
    </div>
  )
}

// ── Inputs ───────────────────────────────────────────────────────────────────

const inputStyle = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  padding: '10px 12px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

function TextField({ label, required, help, type = 'text', value, placeholder, onChange, multiline }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <FieldLabel required={required} help={help}>{label}</FieldLabel>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  )
}

function SelectField({ label, required, help, value, options, placeholder, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <FieldLabel required={required} help={help}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, paddingRight: '28px' }}
      >
        <option value="">{placeholder || 'Select…'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  )
}

// Combobox / searchable select used for the timezone picker. Native
// <select> works but with ~400 timezones it's awful to scroll; this
// gives us a filterable list + free typing.
function SearchableSelect({ label, required, help, value, options, placeholder, onChange }) {
  const [query, setQuery] = React.useState(value || '')
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { setQuery(value || '') }, [value])
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 60)
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 60)
  }, [query, options])

  return (
    <label style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <FieldLabel required={required} help={help}>{label}</FieldLabel>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px',
            maxHeight: '260px', overflowY: 'auto', zIndex: 30,
            boxShadow: '0 10px 32px rgba(15,23,42,0.18)',
          }}
        >
          {filtered.map((opt) => (
            <button
              key={opt} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setQuery(opt); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', fontSize: '13px',
                background: opt === value ? C.surface2 : 'transparent',
                color: C.text, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </label>
  )
}

function ChipMultiSelect({ label, required, help, options, values, onToggle, allowCustom }) {
  const [draft, setDraft] = React.useState('')
  const addCustom = () => {
    const v = draft.trim()
    if (!v) return
    if (!values.includes(v)) onToggle(v)
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <FieldLabel required={required} help={help}>{label}</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {options.map((opt) => {
          const active = values.includes(opt)
          return (
            <button
              key={opt} type="button" onClick={() => onToggle(opt)}
              style={{
                background: active ? C.cyan : C.bg,
                color: active ? '#000' : C.text,
                border: `1px solid ${active ? C.cyan : C.border}`,
                borderRadius: '999px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                lineHeight: 1.3,
              }}
            >
              {active ? '✓ ' : ''}{opt}
            </button>
          )
        })}
      </div>
      {/* Show extra (custom-added) chips that aren't in the canonical list. */}
      {values.filter((v) => !options.includes(v)).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {values.filter((v) => !options.includes(v)).map((v) => (
            <span
              key={v}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: '999px', padding: '4px 10px', fontSize: '12.5px',
                color: C.text,
              }}
            >
              {v}
              <button
                type="button" onClick={() => onToggle(v)} aria-label={`Remove ${v}`}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
      )}
      {allowCustom && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={draft}
            placeholder="Add another…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
          />
          <button
            type="button" onClick={addCustom}
            style={{
              background: C.surface, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: '8px',
              padding: '8px 14px', fontSize: '12.5px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Add</button>
        </div>
      )}
    </div>
  )
}

function CapacityField({ label, required, value, unit, onChange, onUnitChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, width: '120px' }}
        >
          <option value="">—</option>
          {CAPACITY_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value="cases / month">cases / month</option>
          <option value="consultations / month">consultations / month</option>
          <option value="hours / month">hours / month</option>
        </select>
      </div>
    </div>
  )
}

function HeadshotPicker({ url, uploading, onPick, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div
        style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: C.bg, border: `1px solid ${C.border}`,
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {url ? (
          <img src={url} alt="Headshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '24px', color: C.textDim }}>👤</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>Headshot (optional)</span>
        <span style={{ color: C.textDim, fontSize: '12px', lineHeight: 1.5 }}>
          JPG, PNG, or WEBP up to 5 MB. Square crop renders best.
        </span>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button" onClick={onPick} disabled={uploading}
            style={{
              background: C.surface, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: '8px',
              padding: '6px 12px', fontSize: '12.5px', fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >{uploading ? 'Uploading…' : (url ? 'Replace photo' : 'Upload photo')}</button>
          {url && !uploading && (
            <button
              type="button" onClick={onClear}
              style={{
                background: 'none', color: C.textDim,
                border: 'none', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'inherit',
              }}
            >Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}
