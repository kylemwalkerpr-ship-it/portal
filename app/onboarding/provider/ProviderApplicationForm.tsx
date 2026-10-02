'use client'
import { useState } from 'react'
import { YS_BRAND } from '@/lib/auth/ysClerkAppearance'

type ProviderType = 'attorney' | 'regulated_adviser' | 'consultant'

const TYPES: { value: ProviderType; title: string; body: string }[] = [
  { value: 'attorney', title: 'Licensed lawyer', body: 'Attorney, solicitor or barrister admitted to a bar / law society.' },
  { value: 'regulated_adviser', title: 'Regulated immigration adviser', body: 'RCIC (CICC), OISC / IAA level 1–3, or Australian RMA.' },
  { value: 'consultant', title: 'Consultant', body: 'Non-legal: academic, career, business, settlement or mentorship.' },
]

const label: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: YS_BRAND.ink }
const input: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: `1px solid ${YS_BRAND.rule}`,
  background: YS_BRAND.cream, color: YS_BRAND.ink, fontSize: 16, boxSizing: 'border-box', font: 'inherit',
}
const hint: React.CSSProperties = { color: YS_BRAND.inkSoft, fontSize: 13, marginTop: 4 }
const err: React.CSSProperties = { color: YS_BRAND.red, fontSize: 13, marginTop: 4 }

export default function ProviderApplicationForm({
  initialType, defaultFullName, regulators, doneUrl,
}: {
  initialType: ProviderType | null
  defaultFullName: string
  regulators: Record<ProviderType, readonly string[]>
  doneUrl: string
}) {
  const [type, setType] = useState<ProviderType | null>(initialType)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const licensed = type === 'attorney' || type === 'regulated_adviser'
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    const form = new FormData(event.currentTarget)
    const body: Record<string, unknown> = { provider_type: type }
    form.forEach((value, key) => { body[key] = typeof value === 'string' ? value : '' })
    for (const key of ['terms_accepted', 'good_standing', 'scope_certified']) body[key] = form.get(key) === 'on'
    setBusy(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await fetch('/api/provider/apply', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(json?.fields ?? {})
        setFormError(json?.error ?? 'Could not submit your application.')
        setBusy(false)
        return
      }
      window.location.assign(doneUrl)
    } catch {
      setFormError('Network error — please try again.')
      setBusy(false)
    }
  }

  const field = (name: string, text: string, opts: { required?: boolean; placeholder?: string; help?: string; type?: string; defaultValue?: string } = {}) => (
    <div>
      <label style={label} htmlFor={name}>{text}{opts.required ? ' *' : ''}</label>
      <input id={name} name={name} type={opts.type ?? 'text'} required={opts.required} placeholder={opts.placeholder} defaultValue={opts.defaultValue} style={input} />
      {opts.help && <div style={hint}>{opts.help}</div>}
      {errors[name] && <div style={err}>{errors[name]}</div>}
    </div>
  )

  return (
    <main style={{ minHeight: '100vh', background: YS_BRAND.paper, padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 16, border: `1px solid ${YS_BRAND.rule}`, padding: 28, boxShadow: '0 24px 70px rgba(29,36,51,0.10)' }}>
        <div style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${YS_BRAND.navy} 0 50%, ${YS_BRAND.red} 50% 100%)`, marginBottom: 20 }} />
        <h1 style={{ margin: '0 0 6px', fontSize: 26, color: YS_BRAND.ink }}>Provider application</h1>
        <p style={{ margin: '0 0 18px', color: YS_BRAND.inkSoft, lineHeight: 1.6 }}>
          One application for every provider. We verify licensed providers against the official public register before your profile and gigs go live.
        </p>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ ...label, marginTop: 0 }}>I am a… *</legend>
          <div style={{ display: 'grid', gap: 10 }}>
            {TYPES.map((t) => (
              <label key={t.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10, cursor: 'pointer', border: `1px solid ${type === t.value ? YS_BRAND.navy : YS_BRAND.rule}`, background: type === t.value ? '#EEF0FA' : '#fff' }}>
                <input type="radio" name="provider_type_choice" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
                <span><strong>{t.title}</strong><br /><span style={{ color: YS_BRAND.inkSoft, fontSize: 14 }}>{t.body}</span></span>
              </label>
            ))}
          </div>
          {errors.provider_type && <div style={err}>{errors.provider_type}</div>}
        </fieldset>

        {type && (
          <form onSubmit={onSubmit} noValidate>
            {field('full_name', 'Full legal name', { required: true, defaultValue: defaultFullName })}
            {field('display_name', 'Public display name', { help: 'Optional — how clients will see you.' })}
            {field('country', 'Country of practice', { required: true })}
            {field('phone', 'Phone', { type: 'tel', help: 'Optional, international format (+1 …).' })}
            <input type="hidden" name="timezone" value={timezone} />

            {licensed && (
              <>
                <div>
                  <label style={label} htmlFor="regulator">Regulator *</label>
                  <select id="regulator" name="regulator" required style={input} defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {regulators[type].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {errors.regulator && <div style={err}>{errors.regulator}</div>}
                </div>
                {field('licence_number', type === 'attorney' ? 'Bar / licence number' : 'Licence / registration number', { required: true })}
                {field('jurisdictions', 'Jurisdictions of admission', { required: true, placeholder: 'e.g. New York, England & Wales', help: 'Comma-separated.' })}
                {field('year_admitted', 'Year admitted / licensed', { placeholder: 'YYYY' })}
                {field('register_url', 'Link to your entry on the official public register', { required: true, type: 'url', placeholder: 'https://…', help: 'We verify against this register before approval.' })}
                {field('insurance', 'Professional indemnity / malpractice insurance', { help: 'Optional — insurer, or “firm-wide cover”.' })}
              </>
            )}

            {type === 'consultant' && (
              <>
                <div>
                  <label style={label} htmlFor="consultant_type">Consultant type</label>
                  <select id="consultant_type" name="consultant_type" style={input} defaultValue="individual">
                    <option value="individual">Individual</option>
                    <option value="firm">Firm / agency</option>
                    <option value="student">Student / graduate mentor</option>
                  </select>
                </div>
                {field('registration_number', 'Professional registration / membership number', { help: 'Optional (e.g. ICEF, NACAC, chartered body).' })}
                {field('jurisdictions', 'Countries you serve', { placeholder: 'e.g. USA, Canada, UK', help: 'Comma-separated.' })}
              </>
            )}

            {field('practice_areas', licensed ? 'Practice areas' : 'Specialties', { required: true, placeholder: licensed ? 'e.g. Immigration, Student visas' : 'e.g. Admissions, Career coaching', help: 'Comma-separated.' })}
            {field('languages', 'Languages', { placeholder: 'e.g. English, Arabic' })}
            {field('years_experience', 'Years of experience', { type: 'number' })}
            {field('capacity', 'Capacity (new clients per month)', { required: true, placeholder: 'e.g. 10' })}
            {field('profile_url', 'Professional profile (LinkedIn / firm page)', { type: 'url', placeholder: 'https://…' })}
            <div>
              <label style={label} htmlFor="notes">Anything else we should know?</label>
              <textarea id="notes" name="notes" rows={4} style={{ ...input, resize: 'vertical' }} />
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              {licensed && (
                <>
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="good_standing" /> <span>I confirm I am currently in good standing with my regulator. *</span></label>
                  {errors.good_standing && <div style={err}>{errors.good_standing}</div>}
                  <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="scope_certified" /> <span>I will only advise within the scope of my licence / registration. *</span></label>
                  {errors.scope_certified && <div style={err}>{errors.scope_certified}</div>}
                </>
              )}
              <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="terms_accepted" /> <span>I accept the YouSafe provider terms and privacy policy. *</span></label>
              {errors.terms_accepted && <div style={err}>{errors.terms_accepted}</div>}
            </div>

            {formError && <p role="alert" style={{ ...err, fontSize: 14, marginTop: 16 }}>{formError}</p>}
            <button type="submit" disabled={busy} style={{ marginTop: 22, width: '100%', padding: 14, borderRadius: 10, border: 0, background: YS_BRAND.navy, color: '#fff', fontWeight: 800, fontSize: 16, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
