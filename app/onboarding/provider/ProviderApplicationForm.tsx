'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { YS_BRAND } from '@/lib/auth/ysClerkAppearance'
import { BAR_NUMBER_PATTERN, normalizeBarNumber } from '@/lib/provider/barNumber'

type ProviderType = 'attorney' | 'regulated_adviser' | 'consultant'
type Values = Record<string, string>

const TYPES: { value: ProviderType; title: string; body: string }[] = [
  { value: 'attorney', title: 'Licensed lawyer', body: 'Attorney, solicitor or barrister admitted to a bar / law society.' },
  { value: 'regulated_adviser', title: 'Regulated immigration adviser', body: 'RCIC (CICC), OISC / IAA level 1–3, or Australian RMA.' },
  { value: 'consultant', title: 'Consultant', body: 'Non-legal: academic, career, business, settlement or mentorship.' },
]

/** Provider journey shown at the top of the form and on the pending page. */
export const PROVIDER_STEPS = ['Create account', 'Apply', 'Under review', 'Approval & profile'] as const

const OTHER = 'Other'
const ADVISER_REGULATOR_WITH_COUNTRY = new Set([
  'College of Immigration and Citizenship Consultants (RCIC, Canada)',
  'Immigration Advice Authority / OISC (UK)',
  'Office of the Migration Agents Registration Authority (RMA, Australia)',
])

const label: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: YS_BRAND.ink }
const input: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: `1px solid ${YS_BRAND.rule}`,
  background: YS_BRAND.cream, color: YS_BRAND.ink, fontSize: 16, boxSizing: 'border-box', font: 'inherit',
}
const hint: React.CSSProperties = { color: YS_BRAND.inkSoft, fontSize: 13, marginTop: 4 }
const err: React.CSSProperties = { color: YS_BRAND.red, fontSize: 13, marginTop: 4 }

export function StepIndicator({ current }: { current: number }) {
  return (
    <ol aria-label="Application progress" style={{ listStyle: 'none', display: 'flex', gap: 6, padding: 0, margin: '0 0 18px', flexWrap: 'wrap' }}>
      {PROVIDER_STEPS.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={step} aria-current={active ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: active ? 800 : 600, color: active ? YS_BRAND.navy : done ? YS_BRAND.ink : YS_BRAND.inkSoft }}>
            <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: done ? YS_BRAND.navy : active ? '#EEF0FA' : '#F1F5F9', color: done ? '#fff' : YS_BRAND.navy, border: `1px solid ${active || done ? YS_BRAND.navy : YS_BRAND.rule}` }}>
              {done ? '✓' : i + 1}
            </span>
            <span>{step}</span>
            {i < PROVIDER_STEPS.length - 1 && <span aria-hidden style={{ color: YS_BRAND.rule, margin: '0 2px' }}>—</span>}
          </li>
        )
      })}
    </ol>
  )
}

function guessCountry(): string {
  try {
    const region = (navigator.language || '').split('-')[1]
    if (!region || typeof Intl === 'undefined' || !(Intl as any).DisplayNames) return ''
    return new (Intl as any).DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase()) ?? ''
  } catch {
    return ''
  }
}

function readDraft(key: string): { type: ProviderType | null; values: Values; savedAt: string } | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function ProviderApplicationForm({
  initialType, defaultFullName, email, draftKey, initialValues, hasOpenApplication, regulators,
  usBarJurisdictions, nonUsBarJurisdictions, credentialBodies, specialties, doneUrl,
}: {
  initialType: ProviderType | null
  defaultFullName: string
  email: string | null
  draftKey: string
  initialValues: Values
  hasOpenApplication: boolean
  regulators: Record<ProviderType, readonly string[]>
  usBarJurisdictions: readonly string[]
  nonUsBarJurisdictions: readonly string[]
  credentialBodies: readonly string[]
  specialties: readonly string[]
  doneUrl: string
}) {
  const [type, setType] = useState<ProviderType | null>(initialType)
  const [choosingType, setChoosingType] = useState(!initialType)
  const [values, setValues] = useState<Values>({ full_name: defaultFullName, ...initialValues })
  const [consent, setConsent] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const hydrated = useRef(false)
  const licensed = type === 'attorney' || type === 'regulated_adviser'

  // Restore saved progress (this device), then guess country if still empty.
  useEffect(() => {
    const draft = readDraft(draftKey)
    if (draft?.values) {
      setValues((v) => ({ ...v, ...draft.values }))
      if (!initialType && draft.type) { setType(draft.type); setChoosingType(false) }
      setSavedAt(draft.savedAt ?? null)
    }
    setValues((v) => (v.country ? v : { ...v, country: guessCountry() }))
    hydrated.current = true
  }, [draftKey, initialType])

  // Save progress on every change.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      const at = new Date().toISOString()
      window.localStorage.setItem(draftKey, JSON.stringify({ type, values, savedAt: at }))
      setSavedAt(at)
    } catch { /* storage disabled — form still works */ }
  }, [draftKey, type, values])

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors(({ [name]: _drop, ...rest }) => rest)
  }

  const needsCountry = useMemo(() => {
    if (type === 'attorney') return values.bar_state === OTHER
    if (type === 'regulated_adviser') return !ADVISER_REGULATOR_WITH_COUNTRY.has(values.regulator ?? '')
    return true
  }, [type, values.bar_state, values.regulator])

  const numberField = type === 'attorney' ? 'bar_number' : 'licence_number'

  function checkNumber() {
    if (!licensed) return
    const n = normalizeBarNumber(values[numberField])
    if (n && !BAR_NUMBER_PATTERN.test(n)) {
      setErrors((e) => ({ ...e, [numberField]: 'Use your number as issued: 3–20 letters/digits, may include - . / (must contain a digit).' }))
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    const body: Record<string, unknown> = { provider_type: type, consent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    const keys = ['full_name', 'country']
    if (type === 'attorney') keys.push('bar_state', 'bar_state_other', 'bar_number', 'register_url')
    if (type === 'regulated_adviser') keys.push('regulator', 'licence_number', 'register_url')
    if (type === 'consultant') keys.push('specialty', 'credential_body', 'registration_number', 'credential_url')
    for (const k of keys) if (values[k]) body[k] = values[k]
    if (!needsCountry) delete body.country
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
      try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ }
      window.location.assign(doneUrl)
    } catch {
      setFormError('Network error — please try again. Your progress is saved on this device.')
      setBusy(false)
    }
  }

  const text = (name: string, title: string, opts: { required?: boolean; placeholder?: string; help?: string; type?: string; onBlur?: () => void; autoComplete?: string } = {}) => (
    <div>
      <label style={label} htmlFor={name}>{title}{opts.required ? ' *' : ''}</label>
      <input
        id={name} name={name} type={opts.type ?? 'text'} required={opts.required} placeholder={opts.placeholder}
        autoComplete={opts.autoComplete} value={values[name] ?? ''} onChange={set(name)} onBlur={opts.onBlur}
        aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] ? `${name}-error` : undefined} style={input}
      />
      {opts.help && <div style={hint}>{opts.help}</div>}
      {errors[name] && <div id={`${name}-error`} style={err}>{errors[name]}</div>}
    </div>
  )

  const select = (name: string, title: string, children: React.ReactNode, opts: { required?: boolean; help?: string } = {}) => (
    <div>
      <label style={label} htmlFor={name}>{title}{opts.required ? ' *' : ''}</label>
      <select id={name} name={name} required={opts.required} value={values[name] ?? ''} onChange={set(name)} aria-invalid={errors[name] ? true : undefined} style={input}>
        <option value="" disabled={opts.required}>{opts.required ? 'Choose…' : 'None / not applicable'}</option>
        {children}
      </select>
      {opts.help && <div style={hint}>{opts.help}</div>}
      {errors[name] && <div style={err}>{errors[name]}</div>}
    </div>
  )

  const typeInfo = TYPES.find((t) => t.value === type)

  return (
    <main style={{ minHeight: '100vh', background: YS_BRAND.paper, padding: '32px 16px 160px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 16, border: `1px solid ${YS_BRAND.rule}`, padding: 28, boxShadow: '0 24px 70px rgba(29,36,51,0.10)' }}>
        <div style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${YS_BRAND.navy} 0 50%, ${YS_BRAND.red} 50% 100%)`, marginBottom: 20 }} />
        <StepIndicator current={1} />
        <h1 style={{ margin: '0 0 6px', fontSize: 26, color: YS_BRAND.ink }}>{hasOpenApplication ? 'Update your application' : 'Provider application'}</h1>
        <p style={{ margin: '0 0 14px', color: YS_BRAND.inkSoft, lineHeight: 1.6 }}>
          Takes about 2 minutes. We only ask what we need to verify you; your public profile (practice areas, languages, capacity, bio) comes after approval.
        </p>

        {email && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: `1px solid ${YS_BRAND.rule}`, fontSize: 14, color: YS_BRAND.ink }}>
            Signed in as <strong data-testid="applicant-email">{email}</strong>. We&apos;ll email your confirmation and decision here.
          </div>
        )}

        {choosingType || !type ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={label}>I am a… *</legend>
            <div style={{ display: 'grid', gap: 10 }}>
              {TYPES.map((t) => (
                <label key={t.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10, cursor: 'pointer', border: `1px solid ${type === t.value ? YS_BRAND.navy : YS_BRAND.rule}`, background: type === t.value ? '#EEF0FA' : '#fff' }}>
                  <input type="radio" name="provider_type_choice" value={t.value} checked={type === t.value} onChange={() => { setType(t.value); setChoosingType(false) }} />
                  <span><strong>{t.title}</strong><br /><span style={{ color: YS_BRAND.inkSoft, fontSize: 14 }}>{t.body}</span></span>
                </label>
              ))}
            </div>
            {errors.provider_type && <div style={err}>{errors.provider_type}</div>}
          </fieldset>
        ) : (
          <p style={{ margin: '14px 0 0', fontSize: 14, color: YS_BRAND.ink }}>
            Applying as <strong data-testid="provider-type">{typeInfo?.title}</strong>{' '}
            <button type="button" onClick={() => setChoosingType(true)} style={{ border: 0, background: 'none', color: YS_BRAND.navy, textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>
              change
            </button>
          </p>
        )}

        {type && !choosingType && (
          <form onSubmit={onSubmit} noValidate>
            {text('full_name', 'Full legal name', { required: true, autoComplete: 'name', help: email ? 'From your account — as it appears on your licence or credential.' : undefined })}

            {type === 'attorney' && (
              <>
                {select('bar_state', 'State / jurisdiction of bar admission', (
                  <>
                    <optgroup label="United States">
                      {usBarJurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
                    </optgroup>
                    <optgroup label="Outside the US">
                      {nonUsBarJurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
                    </optgroup>
                    <option value={OTHER}>Other bar / law society</option>
                  </>
                ), { required: true, help: 'Admitted in several? Pick your primary one — add the rest on your profile after approval.' })}
                {values.bar_state === OTHER && text('bar_state_other', 'Which bar / law society?', { required: true, placeholder: 'e.g. Bar Council of India, Delhi' })}
                {text('bar_number', 'Bar number', { required: true, placeholder: 'e.g. 4567890', onBlur: checkNumber, help: 'As issued by your bar. We verify it with the bar before approval.' })}
              </>
            )}

            {type === 'regulated_adviser' && (
              <>
                {select('regulator', 'Regulator', regulators.regulated_adviser.map((r) => <option key={r} value={r}>{r}</option>), { required: true })}
                {text('licence_number', 'Licence / registration number', { required: true, placeholder: 'e.g. R512345', onBlur: checkNumber, help: 'We verify it on the official register before approval.' })}
              </>
            )}

            {type === 'consultant' && (
              <>
                {select('specialty', 'Main specialty', specialties.map((s) => <option key={s} value={s}>{s}</option>), { required: true, help: 'Add more specialties on your profile after approval.' })}
                {select('credential_body', 'Credential issued by (optional)', credentialBodies.map((b) => <option key={b} value={b}>{b}</option>))}
                {text('registration_number', 'Credential / membership number (optional)', { placeholder: 'e.g. ICEF 12345', help: 'Not required for consultants. If you hold one, we verify it before approval.' })}
              </>
            )}

            {needsCountry && text('country', type === 'consultant' ? 'Country you work from' : 'Country of practice', { required: true, autoComplete: 'country-name' })}

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: YS_BRAND.navy }}>Optional: speed up verification</summary>
              {licensed
                ? text('register_url', 'Link to your entry on the official public register', { type: 'url', placeholder: 'https://…' })
                : text('credential_url', 'Link where we can verify your credential', { type: 'url', placeholder: 'https://…' })}
            </details>

            <label style={{ display: 'flex', gap: 8, marginTop: 18, fontSize: 14, lineHeight: 1.5 }}>
              <input type="checkbox" name="consent" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors(({ consent: _c, ...rest }) => rest) }} />
              <span>
                {licensed
                  ? 'I confirm I am in good standing with my bar / regulator and will only advise within the scope of my licence, and I accept the YouSafe provider terms and privacy policy. *'
                  : 'I confirm my credential details are accurate and I accept the YouSafe provider terms and privacy policy. *'}
              </span>
            </label>
            {errors.consent && <div style={err}>{errors.consent}</div>}

            {formError && <p role="alert" style={{ ...err, fontSize: 14, marginTop: 16 }}>{formError}</p>}
            <button type="submit" disabled={busy} style={{ marginTop: 22, width: '100%', padding: 14, borderRadius: 10, border: 0, background: YS_BRAND.navy, color: '#fff', fontWeight: 800, fontSize: 16, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Submitting…' : hasOpenApplication ? 'Update application' : 'Submit application'}
            </button>
            <p style={{ ...hint, textAlign: 'center', marginTop: 10 }} aria-live="polite">
              {savedAt ? 'Progress saved on this device.' : ' '} Next: we review within 1–2 business days and email you.
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
