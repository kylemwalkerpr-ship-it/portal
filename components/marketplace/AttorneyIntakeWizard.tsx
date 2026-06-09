'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Strength = {
  score: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  username: string | null
  publish_threshold: number
  publish_ready: boolean
  checks: Array<{ id: string; label: string; done: boolean; weight: number; hint?: string }>
}

type Form = {
  username: string
  full_name: string
  credential_type: string
  bar_number: string
  headshot_url: string | null
  tagline: string
  intro: string
  bio: string
  jurisdictions: string
  practice_areas: string
  specialties: string[]
  languages: string[]
  education: string
  timezone: string
  years_experience: number | ''
  starting_price: number | ''
  offers_free_consult: boolean | null
  available: boolean
  video_intro_url: string
}

const empty: Form = {
  username: '',
  full_name: '',
  credential_type: '',
  bar_number: '',
  headshot_url: null,
  tagline: '',
  intro: '',
  bio: '',
  jurisdictions: '',
  practice_areas: '',
  specialties: [],
  languages: [],
  education: '',
  timezone: '',
  years_experience: '',
  starting_price: '',
  offers_free_consult: null,
  available: true,
  video_intro_url: '',
}

const STEPS = [
  { id: 'handle', title: 'Handle', sub: 'Your SEO profile URL.' },
  { id: 'identity', title: 'Identity', sub: 'Name, credential, bar number.' },
  { id: 'photo', title: 'Photo & pitch', sub: 'Headshot, tagline, intro.' },
  { id: 'about', title: 'About', sub: 'Long bio, education, timezone.' },
  { id: 'coverage', title: 'Coverage', sub: 'Where & what you serve.' },
  { id: 'pricing', title: 'Pricing', sub: 'Experience, rate, availability.' },
  { id: 'review', title: 'Review', sub: 'Confirm & finish.' },
] as const

const CREDENTIAL_OPTIONS = [
  'J.D. · US Attorney',
  'Solicitor · England & Wales',
  'Barrister · England & Wales',
  'RCIC · Canada Immigration Consultant',
  'Canadian Lawyer · Bar Admitted',
  'OISC L1 · UK',
  'OISC L2 · UK',
  'OISC L3 · UK',
  'Other',
]

const TIMEZONE_OPTIONS = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Dublin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function AttorneyIntakeWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(empty)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState('')
  const [error, setError] = useState('')
  const [strength, setStrength] = useState<Strength | null>(null)
  const [uploading, setUploading] = useState(false)

  const refreshStrength = useCallback(async () => {
    try {
      const r = await fetch('/api/attorney/profile/strength', { credentials: 'same-origin' })
      if (r.ok) setStrength(await r.json())
    } catch { /* non-fatal */ }
  }, [])

  // Initial load — pull profile + application + strength in parallel.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/attorney/profile', { credentials: 'same-origin' }).then((r) => r.json()),
      fetch('/api/attorney/profile/strength', { credentials: 'same-origin' }).then((r) => r.json()),
    ])
      .then(([profile, str]) => {
        if (cancelled) return
        const a = profile.attorney || {}
        const p = profile.profile || {}
        const app = profile.application || {}
        setForm({
          username: p.username || '',
          full_name: p.full_name || '',
          credential_type: app.credential_type || '',
          bar_number: app.bar_number || '',
          headshot_url: a.headshot_url || null,
          tagline: a.tagline || '',
          intro: a.intro || '',
          bio: a.bio || '',
          jurisdictions: a.jurisdictions || '',
          practice_areas: a.practice_areas || '',
          specialties: Array.isArray(a.specialties) ? a.specialties : [],
          languages: Array.isArray(a.languages) ? a.languages : [],
          education: a.education || '',
          timezone: a.timezone || '',
          years_experience: a.years_experience ?? '',
          starting_price: a.starting_price ?? '',
          offers_free_consult: typeof a.offers_free_consult === 'boolean' ? a.offers_free_consult : null,
          available: a.available !== false,
          video_intro_url: a.video_intro_url || '',
        })
        setStrength(str)
        // Resume on the saved step (capped to the last index).
        const last = Math.min(Math.max(0, Number(p.intake_last_step || 0)), STEPS.length - 1)
        setStep(last)
        setLoaded(true)
      })
      .catch(() => !cancelled && setError('Could not load your profile.'))
    return () => { cancelled = true }
  }, [])

  function setField<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function persist(payload: Record<string, unknown>): Promise<boolean> {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/attorney/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Could not save change.')
      setSavedFlash('Saved')
      window.setTimeout(() => setSavedFlash(''), 1200)
      // Re-fetch strength to keep the progress ring honest after each save.
      await refreshStrength()
      return true
    } catch (e: any) {
      setError(e.message || 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function uploadHeadshot(file: File) {
    setUploading(true)
    setError('')
    try {
      const data = new FormData()
      data.append('file', file)
      const res = await fetch('/api/attorney/profile/headshot', {
        method: 'POST',
        credentials: 'same-origin',
        body: data,
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Upload failed.')
      setField('headshot_url', body.headshot_url)
      setSavedFlash('Photo uploaded')
      window.setTimeout(() => setSavedFlash(''), 1200)
      await refreshStrength()
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function toggleArr(field: 'specialties' | 'languages', value: string) {
    const cur = form[field]
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    setField(field, next)
  }

  async function saveStep(nextStep: number): Promise<void> {
    const payload: Record<string, unknown> = stepPayload(step, form)
    // Always persist resume state so re-opening the wizard lands on the
    // correct step — even when the user just clicks Skip.
    payload.intake_last_step = nextStep
    const ok = await persist(payload)
    if (!ok) return
    setStep(nextStep)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function navigateToStep(targetStep: number) {
    if (targetStep === step || saving) return
    // Save current step data first so no input is lost when jumping via chips.
    const payload = stepPayload(step, form)
    // Preserve the furthest step reached so the wizard resumes correctly.
    payload.intake_last_step = Math.max(step, targetStep)
    const ok = await persist(payload)
    if (ok) setStep(targetStep)
  }

  function goBack() {
    if (step <= 0 || saving) return
    // Save current step data before going back so changes aren't lost.
    const payload = stepPayload(step, form)
    // Preserve progress — going back shouldn't reset the resume step.
    payload.intake_last_step = step
    persist(payload).then((ok) => {
      if (ok) setStep(step - 1)
    })
  }

  if (!loaded) {
    return (
      <main style={pageWrap}>
        <p style={{ ...notice, marginTop: 60 }}>Loading your intake…</p>
      </main>
    )
  }

  const totalSteps = STEPS.length
  const progress = ((step + 1) / totalSteps) * 100
  const isLast = step === totalSteps - 1
  const stepDef = STEPS[step]
  const score = strength?.score ?? 0
  const ready = !!strength?.publish_ready
  const threshold = strength?.publish_threshold ?? 75
  // Required-field check for the current step. If non-null, the Save &
  // continue button is disabled and the message is surfaced inline so
  // the user knows exactly what's missing before clicking.
  const blocker = stepBlocker(step, form)

  return (
    <main style={pageWrap}>
      <style>{globalCss}</style>
      <header style={headerStyle}>
        <Link href="/dashboard" style={breadStyle}>← Back to dashboard</Link>
        <h1 style={titleStyle}>Complete your YouSafe attorney profile</h1>
        <p style={subtitleStyle}>
          A clean profile clears the <b>{threshold}% publish gate</b> and unlocks your first gig.
          Each step auto-saves — leave any time and your progress is kept.
        </p>
        <div style={scoreRow}>
          <div style={progressTrack}>
            <div style={{ ...progressFill, width: `${score}%`, background: ready ? '#1A6B3A' : '#3C3B6E' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={scoreLabel(ready)}>{score}% · {ready ? 'ready to publish' : `${Math.max(0, threshold - score)}% to go`}</span>
            {savedFlash && <span style={savedBadge}>{savedFlash} ✓</span>}
          </div>
        </div>
      </header>

      <nav style={stepsRow} aria-label="Intake steps">
        {STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigateToStep(i)}
              style={stepChip(active, done)}
            >
              <span style={stepNum(active, done)}>{done ? '✓' : i + 1}</span>
              <span>{s.title}</span>
            </button>
          )
        })}
      </nav>

      <section style={cardStyle}>
        <div style={stepHead}>
          <span style={stepEyebrow}>Step {step + 1} of {totalSteps}</span>
          <h2 style={stepTitle}>{stepDef.title}</h2>
          <p style={stepSub}>{stepDef.sub}</p>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        {step === 0 && <HandleStep form={form} setField={setField} />}
        {step === 1 && <IdentityStep form={form} setField={setField} options={CREDENTIAL_OPTIONS} />}
        {step === 2 && <PhotoStep form={form} setField={setField} onUpload={uploadHeadshot} uploading={uploading} />}
        {step === 3 && <AboutStep form={form} setField={setField} timezones={TIMEZONE_OPTIONS} />}
        {step === 4 && <CoverageStep form={form} setField={setField} toggleArr={toggleArr} />}
        {step === 5 && <PricingStep form={form} setField={setField} />}
        {step === 6 && <ReviewStep form={form} strength={strength} ready={ready} threshold={threshold} />}

        {blocker && !isLast && (
          <div style={{
            margin: '12px 0 0',
            padding: '10px 12px',
            background: 'rgba(178,34,52,0.08)',
            border: '1px solid rgba(178,34,52,0.20)',
            borderRadius: 8,
            color: '#B22234',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            <strong style={{ fontWeight: 700 }}>Required to continue:</strong> {blocker}
          </div>
        )}

        <footer style={footerRow}>
          {step > 0 ? (
            <button type="button" style={ghostBtn} onClick={goBack}>← Back</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLast && (
              <button type="button" style={ghostBtn} onClick={() => saveStep(step + 1)} disabled={saving}>
                Skip
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                style={{ ...primaryBtn, opacity: blocker ? 0.5 : 1, cursor: blocker ? 'not-allowed' : 'pointer' }}
                onClick={() => saveStep(step + 1)}
                disabled={saving || !!blocker}
                title={blocker || ''}
              >
                {saving ? 'Saving…' : 'Save & continue →'}
              </button>
            ) : (
              <button
                type="button"
                style={primaryBtn}
                onClick={async () => {
                  await saveStep(step) // ensures last-edit on review is persisted
                  router.push(ready ? '/dashboard/gigs/new' : '/dashboard?goto=profile')
                }}
                disabled={saving}
              >
                {saving ? 'Saving…' : ready ? 'Create my first gig →' : 'Finish · keep editing'}
              </button>
            )}
          </div>
        </footer>
      </section>

      <p style={tipText}>
        You can leave this page at any time — your changes are saved as you go. Pick back up from your dashboard.
      </p>
    </main>
  )
}

/* ─────────────────── per-step required-field check ────────────────── */

// Returns the human-readable reason the step's required fields aren't
// satisfied, or null when the user can proceed. Drives the "Save &
// continue" button's disabled+title state so missing inputs are
// flagged BEFORE the user clicks rather than after a silent advance.
function stepBlocker(step: number, f: Form): string | null {
  switch (step) {
    case 0:
      if (!f.username.trim()) return 'Pick a profile handle to continue.'
      if (!/^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/.test(f.username))
        return 'Handle must be 3–32 chars, lowercase letters/numbers/dashes/underscores, and start+end with a letter or number.'
      return null
    case 1:
      if (!f.credential_type.trim()) return 'Choose a credential type.'
      if (f.credential_type === 'Other') return 'Type your actual credential in the box below the dropdown.'
      if (!f.bar_number.trim()) return 'Add your bar / regulator number.'
      return null
    case 2:
      if (!f.headshot_url) return 'Upload a headshot.'
      if (!f.tagline.trim()) return 'Write a one-line tagline.'
      if (!f.intro.trim()) return 'Add a short intro (2–3 sentences).'
      return null
    case 3:
      if (!f.bio.trim()) return 'Write a long bio.'
      return null
    case 4:
      if (!f.jurisdictions.trim()) return 'Add at least one jurisdiction.'
      if (!f.practice_areas.trim()) return 'Add at least one practice area.'
      if (f.specialties.length < 3) return `Pick at least 3 specialty tags (currently ${f.specialties.length}).`
      return null
    case 5:
      if (f.years_experience === '' || Number(f.years_experience) < 0) return 'Enter years of experience.'
      if (f.starting_price === '' || Number(f.starting_price) <= 0) return 'Enter a starting price.'
      return null
    default:
      return null
  }
}

/* ─────────────────── per-step payload selectors ────────────────────── */

function stepPayload(step: number, f: Form): Record<string, unknown> {
  switch (step) {
    case 0:
      return f.username ? { username: f.username } : {}
    case 1:
      return {
        ...(f.credential_type ? { credential_type: f.credential_type } : {}),
        ...(f.bar_number ? { bar_number: f.bar_number } : {}),
      }
    case 2:
      return {
        tagline: f.tagline,
        intro: f.intro,
      }
    case 3:
      return {
        bio: f.bio,
        education: f.education,
        timezone: f.timezone,
      }
    case 4:
      return {
        jurisdictions: f.jurisdictions,
        practice_areas: f.practice_areas,
        specialties: f.specialties,
        languages: f.languages,
      }
    case 5: {
      const out: Record<string, unknown> = {
        available: f.available,
      }
      if (f.years_experience !== '') out.years_experience = Number(f.years_experience)
      if (f.starting_price !== '') out.starting_price = Number(f.starting_price)
      if (f.offers_free_consult !== null) out.offers_free_consult = f.offers_free_consult
      if (f.video_intro_url) out.video_intro_url = f.video_intro_url
      return out
    }
    default:
      return {}
  }
}

/* ─────────────────────────── steps ────────────────────────────── */

function HandleStep({ form, setField }: { form: Form; setField: any }) {
  const raw = form.username
  const valid = !raw || /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/.test(raw)
  return (
    <div style={fieldStack}>
      <Field
        label="Your SEO-friendly profile handle"
        required
        help="Becomes your public profile URL: market.yousafeconsultancy.com/providers/<handle>. Keep it short, lowercase, and keyword-rich — examples: jane-doe-immigration, opt-attorney-ny, london-spouse-visa. Lowercase letters, numbers, dashes, and underscores only; 3–32 chars; cannot start or end with - or _."
      >
        <input
          type="text"
          value={form.username}
          onChange={(e) => setField('username', e.target.value.toLowerCase().trim())}
          placeholder="immigration-attorney-ny"
          maxLength={32}
          style={inputStyle}
        />
        {raw && !valid && (
          <p style={{ color: '#B22234', fontSize: 12, margin: '6px 0 0' }}>
            Doesn't match the slug pattern — try shortening or removing edge dashes.
          </p>
        )}
        {raw && valid && (
          <p style={{ color: '#1A6B3A', fontSize: 12, margin: '6px 0 0' }}>
            Looks good — your profile will live at <b>/providers/{raw}</b>.
          </p>
        )}
      </Field>
    </div>
  )
}

function IdentityStep({ form, setField, options }: { form: Form; setField: any; options: string[] }) {
  // "Other" requires the attorney to type the actual credential. We store
  // the custom string back into credential_type when they edit the field,
  // so the saved value is always the real credential name — not the
  // literal word "Other".
  const isPreset = options.includes(form.credential_type)
  const showOtherInput = form.credential_type === 'Other' || (!isPreset && form.credential_type.length > 0)
  return (
    <div style={fieldStack}>
      <Field label="Display name" help="From your account. Edit in your account settings if it's wrong.">
        <input
          type="text"
          value={form.full_name}
          disabled
          style={{ ...inputStyle, background: '#EEF1F6', color: '#64748B' }}
        />
      </Field>
      <Field label="Credential type" required help="Used as the verified badge on your profile and gig cards.">
        <select
          value={isPreset ? form.credential_type : (showOtherInput ? 'Other' : '')}
          onChange={(e) => setField('credential_type', e.target.value)}
          style={inputStyle}
        >
          <option value="">Select your credential…</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {showOtherInput && (
          <input
            type="text"
            value={form.credential_type === 'Other' ? '' : form.credential_type}
            onChange={(e) => setField('credential_type', e.target.value)}
            placeholder="Describe your credential (e.g. ICCRC R-1234, Australia MARN 1234567)"
            style={{ ...inputStyle, marginTop: 8 }}
          />
        )}
      </Field>
      <Field label="Bar / regulator number" required help="Your bar admission or regulator registration number. Stored privately for verification.">
        <input
          type="text"
          value={form.bar_number}
          onChange={(e) => setField('bar_number', e.target.value)}
          placeholder="e.g. NY 5234112 · or OISC F2019xxx · or RCIC R5xxxxx"
          style={inputStyle}
        />
        {form.credential_type && form.bar_number.trim().length === 0 && (
          <RequiredHint text="Add your bar / regulator number — saved privately, used for verification." />
        )}
      </Field>
    </div>
  )
}

function RequiredHint({ text }: { text: string }) {
  return (
    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#B22234' }}>
      {text}
    </p>
  )
}

function PhotoStep({ form, setField, onUpload, uploading }: {
  form: Form; setField: any; onUpload: (f: File) => void; uploading: boolean
}) {
  return (
    <div style={fieldStack}>
      <Field label="Headshot" required help="Profiles with a clear photo win ~6× more engagements. A simple bust shot on a neutral background works best.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={photoFrame}>
            {form.headshot_url ? (
              <img src={form.headshot_url} alt="Headshot preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: "'Lora', serif", fontSize: 28, color: '#64748B' }}>?</span>
            )}
          </div>
          <label style={uploadCta(uploading)}>
            {uploading ? 'Uploading…' : form.headshot_url ? 'Replace photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
              disabled={uploading}
            />
          </label>
        </div>
      </Field>
      <Field label="Tagline" required help="One sharp line that shows on your card. Aim for 60–120 characters. Specific > generic.">
        <input
          type="text"
          value={form.tagline}
          onChange={(e) => setField('tagline', e.target.value)}
          maxLength={160}
          placeholder="F-1 reinstatement specialist · 200+ approvals · responses within an hour"
          style={inputStyle}
        />
        <CharCount n={form.tagline.length} min={40} max={160} />
      </Field>
      <Field label="Intro" required help="2–3 sentences. The first thing students read on your profile page.">
        <textarea
          value={form.intro}
          onChange={(e) => setField('intro', e.target.value)}
          maxLength={600}
          rows={4}
          placeholder="I help international students reinstate their F-1 status fast. After 12 years and 200+ approved cases, I know exactly what USCIS wants to see — and what to leave out."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <CharCount n={form.intro.length} min={100} max={600} />
      </Field>
    </div>
  )
}

function AboutStep({ form, setField, timezones }: { form: Form; setField: any; timezones: string[] }) {
  return (
    <div style={fieldStack}>
      <Field label="Long bio" required help="Background, why you do this work, what kinds of clients you serve best. Long bios convert higher.">
        <textarea
          value={form.bio}
          onChange={(e) => setField('bio', e.target.value)}
          maxLength={4000}
          rows={8}
          placeholder={`Paragraph 1: your practice background.\nParagraph 2: who your ideal client is.\nParagraph 3: how you work — turnaround, file format, what's escrowed.`}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <CharCount n={form.bio.length} min={300} max={4000} />
      </Field>
      <Field label="Education" help="School + degree + year. Used on the profile sidebar.">
        <textarea
          value={form.education}
          onChange={(e) => setField('education', e.target.value)}
          maxLength={1200}
          rows={3}
          placeholder="J.D., NYU School of Law, 2014&#10;B.A., Political Science, Yale, 2011"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <Field label="Timezone" help="Used to show your local hours next to message threads.">
        <select
          value={form.timezone}
          onChange={(e) => setField('timezone', e.target.value)}
          style={inputStyle}
        >
          <option value="">Select your timezone…</option>
          {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  )
}

const SPECIALTY_SUGGESTIONS = [
  'F-1 / Student visas', 'OPT / STEM OPT', 'H-1B', 'I-130 Spouse', 'I-485 AOS',
  'Green Card · Family', 'Asylum', 'Naturalization',
  'UK Spouse visa', 'UK ILR', 'UK Skilled Worker', 'UK Student Route',
  'Canada Study Permit', 'Canada Express Entry', 'Canada PGWP', 'Canada PNP',
  'Tenancy · Section 21', 'Tenancy · Eviction defence', 'Tax · 1040-NR', 'Tax · Treaty',
]
const LANGUAGE_SUGGESTIONS = ['English', 'Spanish', 'French', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'German', 'Korean', 'Russian', 'Urdu', 'Tagalog']

function CoverageStep({ form, setField, toggleArr }: { form: Form; setField: any; toggleArr: (f: 'specialties'|'languages', v: string) => void }) {
  return (
    <div style={fieldStack}>
      <Field label="Jurisdictions" required help="Comma-separated. Examples: 'NY, NJ, CT' for US bar; 'England & Wales' for UK; 'Ontario, BC' for Canada.">
        <input
          type="text"
          value={form.jurisdictions}
          onChange={(e) => setField('jurisdictions', e.target.value)}
          placeholder="NY, NJ, CT · or England & Wales · or Ontario"
          style={inputStyle}
        />
      </Field>
      <Field label="Practice areas" required help="Plain English. What kinds of cases you handle.">
        <input
          type="text"
          value={form.practice_areas}
          onChange={(e) => setField('practice_areas', e.target.value)}
          placeholder="Family-based immigration · Asylum · Student visa work"
          style={inputStyle}
        />
      </Field>
      <Field label="Specialties (3+ tags)" required help="Pick the ones that match your work. Add your own if it's not in the list. These power the marketplace search facets.">
        <ChipPicker
          all={SPECIALTY_SUGGESTIONS}
          selected={form.specialties}
          onToggle={(v) => toggleArr('specialties', v)}
          addLabel="Add another specialty…"
        />
        {form.specialties.length > 0 && form.specialties.length < 3 && (
          <RequiredHint text={`Pick at least 3 (currently ${form.specialties.length}) so search facets surface you accurately.`} />
        )}
      </Field>
      <Field label="Languages" help="Beyond English. Add any others students might filter by.">
        <ChipPicker
          all={LANGUAGE_SUGGESTIONS}
          selected={form.languages}
          onToggle={(v) => toggleArr('languages', v)}
          addLabel="Add another language…"
        />
      </Field>
    </div>
  )
}

function PricingStep({ form, setField }: { form: Form; setField: any }) {
  return (
    <div style={fieldStack}>
      <Field label="Years of experience" required help="Whole number, 0-60. Shows on your profile sidebar.">
        <input
          type="number"
          min={0}
          max={60}
          step={1}
          inputMode="numeric"
          value={form.years_experience === '' ? '' : String(form.years_experience)}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') return setField('years_experience', '')
            const n = parseInt(v, 10)
            if (!Number.isFinite(n) || n < 0 || n > 60) return
            setField('years_experience', n)
          }}
          placeholder="5"
          style={inputStyle}
        />
      </Field>
      <Field label="Starting price (USD)" required help="The lowest price you'd typically quote — shown as 'starting at $X' on cards. Enter the dollar amount (e.g. 250 for $250).">
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: 14, pointerEvents: 'none' }}>$</span>
          <input
            type="number"
            min={1}
            step={1}
            // form.starting_price is stored in cents (DB contract). UI
            // accepts dollars and converts on save; we divide back to
            // dollars for display so the user sees what they typed.
            value={form.starting_price === '' ? '' : Math.round(Number(form.starting_price) / 100)}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') return setField('starting_price', '')
              const dollars = Number(v)
              if (!Number.isFinite(dollars) || dollars < 0) return
              setField('starting_price', Math.round(dollars * 100))
            }}
            placeholder="250"
            style={{ ...inputStyle, paddingLeft: 26 }}
          />
        </div>
      </Field>
      <Field label="Do you offer free 15-min consults?" help="Optional but helps conversion — students like a low-stakes first call.">
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: true, label: 'Yes' },
            { v: false, label: 'No' },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => setField('offers_free_consult', opt.v)}
              style={pillBtn(form.offers_free_consult === opt.v)}
            >{opt.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Currently accepting new work?" help="Turn off when you're booked solid — your card greys out across the marketplace.">
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: true, label: 'Yes, accepting' },
            { v: false, label: 'Not right now' },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => setField('available', opt.v)}
              style={pillBtn(form.available === opt.v)}
            >{opt.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Video intro URL" help="Optional. A 60–90s YouTube/Loom intro raises conversion notably.">
        <input
          type="url"
          value={form.video_intro_url}
          onChange={(e) => setField('video_intro_url', e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          style={inputStyle}
        />
      </Field>
    </div>
  )
}

function ReviewStep({ form, strength, ready, threshold }: {
  form: Form; strength: Strength | null; ready: boolean; threshold: number
}) {
  const missing = strength?.checks?.filter((c) => !c.done) ?? []
  return (
    <div style={fieldStack}>
      <div style={{ ...summaryBox, borderColor: ready ? '#1A6B3A' : '#3C3B6E' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={summaryEyebrow}>{ready ? 'Profile ready to publish' : 'Almost there'}</div>
            <h3 style={summaryTitle}>
              {strength?.score ?? 0}% complete — {ready ? 'you can publish your first gig' : `${Math.max(0, threshold - (strength?.score ?? 0))}% to reach the ${threshold}% publish gate`}
            </h3>
          </div>
        </div>
        {!ready && missing.length > 0 && (
          <ul style={{ margin: '10px 0 0', padding: '12px 0 0', borderTop: '1px solid #F1F5F9', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {missing.slice(0, 8).map((c) => (
              <li key={c.id} style={{ fontSize: 13, color: '#334155', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: '#B22234' }}>•</span>
                <span><b style={{ color: '#0F172A' }}>{c.label}</b>{c.hint ? <span style={{ color: '#64748B' }}> — {c.hint}</span> : null} <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#64748B' }}>+{c.weight}%</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <SummaryCard label="Handle" value={form.username || '—'} />
        <SummaryCard label="Credential" value={form.credential_type || '—'} />
        <SummaryCard label="Bar / Reg #" value={form.bar_number ? '✓ on file' : '—'} />
        <SummaryCard label="Headshot" value={form.headshot_url ? '✓ uploaded' : '—'} />
        <SummaryCard label="Tagline length" value={form.tagline ? `${form.tagline.length} chars` : '—'} />
        <SummaryCard label="Bio length" value={form.bio ? `${form.bio.length} chars` : '—'} />
        <SummaryCard label="Jurisdictions" value={form.jurisdictions || '—'} />
        <SummaryCard label="Specialties" value={form.specialties.length ? `${form.specialties.length} tags` : '—'} />
        <SummaryCard label="Languages" value={form.languages.length ? form.languages.join(', ') : 'English only'} />
        <SummaryCard label="Years" value={form.years_experience !== '' ? String(form.years_experience) : '—'} />
        <SummaryCard label="Starting at" value={form.starting_price !== '' ? `$${(Number(form.starting_price) / 100).toFixed(0)}` : '—'} />
        <SummaryCard label="Free consult" value={form.offers_free_consult === null ? '—' : form.offers_free_consult ? 'Yes' : 'No'} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function Field({ label, help, required, children }: { label: string; help?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13.5, color: '#0F172A' }}>{label}</span>
        {required && <span style={{ color: '#B22234', fontSize: 13, fontWeight: 700 }}>*</span>}
      </div>
      {help && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>{help}</p>}
      {children}
    </label>
  )
}

function CharCount({ n, min, max }: { n: number; min: number; max: number }) {
  const tone = n < min ? '#B22234' : n > max ? '#B22234' : '#1A6B3A'
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: tone, marginTop: 4 }}>
      {n} / {max} chars{n < min ? ` · ${min - n} more to reach the recommended minimum` : ''}
    </div>
  )
}

function ChipPicker({ all, selected, onToggle, addLabel }: {
  all: string[]
  selected: string[]
  onToggle: (v: string) => void
  addLabel?: string
}) {
  const [customDraft, setCustomDraft] = useState('')
  // Combine the preset suggestions with any custom values the attorney
  // has already picked (so they remain visible as filled chips). Dedupe
  // case-insensitively but preserve the original casing.
  const seen = new Set(all.map((s) => s.toLowerCase()))
  const customSelected = selected.filter((s) => !seen.has(s.toLowerCase()))
  const chips = [...all, ...customSelected]

  const addCustom = () => {
    const v = customDraft.trim()
    if (!v) return
    if (v.length > 80) return
    // Don't duplicate — toggle is idempotent in either direction
    const exists = selected.some((s) => s.toLowerCase() === v.toLowerCase())
    if (!exists) onToggle(v)
    setCustomDraft('')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((v) => {
          const on = selected.some((s) => s.toLowerCase() === v.toLowerCase())
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              style={pillBtn(on)}
            >{v}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          type="text"
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder={addLabel || 'Add another…'}
          maxLength={80}
          style={{ ...inputStyle, flex: 1, padding: '8px 12px', fontSize: 13 }}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customDraft.trim()}
          style={{
            ...ghostBtn,
            padding: '8px 16px',
            opacity: customDraft.trim() ? 1 : 0.5,
            cursor: customDraft.trim() ? 'pointer' : 'not-allowed',
          }}
        >Add</button>
      </div>
    </div>
  )
}

/* ─────────────────────────── styles ───────────────────────────── */

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#F7F8FA',
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  color: '#0F172A',
  padding: '24px 16px 60px',
}
const headerStyle: React.CSSProperties = {
  width: 'min(900px, calc(100vw - 32px))',
  margin: '0 auto 18px',
}
const breadStyle: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#334155',
  textDecoration: 'none',
}
const titleStyle: React.CSSProperties = {
  margin: '8px 0 6px', fontFamily: "var(--font-lora), Lora, Georgia, serif",
  fontSize: 32, fontWeight: 500, letterSpacing: '-0.018em', color: '#0F172A',
}
const subtitleStyle: React.CSSProperties = {
  margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#334155', maxWidth: '60ch',
}
const scoreRow: React.CSSProperties = {
  marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
}
const progressTrack: React.CSSProperties = {
  flex: 1, minWidth: 200, height: 8, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden',
}
const progressFill: React.CSSProperties = {
  height: '100%', borderRadius: 999, transition: 'width .3s ease, background .3s ease',
}
const scoreLabel = (ready: boolean): React.CSSProperties => ({
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: ready ? '#1A6B3A' : '#3C3B6E', fontWeight: 600,
})
const savedBadge: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 11, color: '#1A6B3A', fontWeight: 700,
}

const stepsRow: React.CSSProperties = {
  width: 'min(900px, calc(100vw - 32px))', margin: '0 auto 14px',
  display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const,
}
const stepChip = (active: boolean, done: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? '#0F172A' : '#E2E8F0'}`,
  background: active ? '#0F172A' : (done ? '#EEF1F6' : '#FFFFFF'),
  color: active ? '#fff' : '#0F172A',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
})
const stepNum = (active: boolean, done: boolean): React.CSSProperties => ({
  display: 'inline-grid', placeItems: 'center', width: 18, height: 18,
  borderRadius: '50%', fontSize: 10, fontWeight: 700,
  background: active ? '#fff' : (done ? '#1A6B3A' : '#fff'),
  color: active ? '#0F172A' : (done ? '#fff' : '#0F172A'),
  border: done ? 'none' : '1px solid #E2E8F0',
})

const cardStyle: React.CSSProperties = {
  width: 'min(900px, calc(100vw - 32px))', margin: '0 auto',
  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
  padding: '22px 26px 18px',
  boxShadow: '0 14px 30px -22px rgba(29,36,51,0.2)',
}
const stepHead: React.CSSProperties = { marginBottom: 18 }
const stepEyebrow: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748B',
}
const stepTitle: React.CSSProperties = {
  margin: '4px 0 4px', fontFamily: "var(--font-lora), Lora, serif",
  fontSize: 24, fontWeight: 500, letterSpacing: '-0.012em', color: '#0F172A',
}
const stepSub: React.CSSProperties = { margin: 0, color: '#334155', fontSize: 13.5 }

const fieldStack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8,
  background: '#FFFFFF', fontSize: 14, color: '#0F172A',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const footerRow: React.CSSProperties = {
  marginTop: 18, paddingTop: 14, borderTop: '1px solid #F1F5F9',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
}
const primaryBtn: React.CSSProperties = {
  background: '#0F172A', color: '#fff', border: 'none',
  padding: '10px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  background: '#FFFFFF', color: '#0F172A', border: '1px solid #E2E8F0',
  padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const pillBtn = (on: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 999,
  border: `1px solid ${on ? '#0F172A' : '#E2E8F0'}`,
  background: on ? '#0F172A' : '#FFFFFF',
  color: on ? '#fff' : '#334155',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})

const photoFrame: React.CSSProperties = {
  width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
  background: '#EEF1F6', display: 'grid', placeItems: 'center',
  border: '1px solid #E2E8F0',
}
const uploadCta = (uploading: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '9px 16px',
  background: uploading ? '#64748B' : '#3C3B6E',
  color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer',
})

const summaryBox: React.CSSProperties = {
  background: '#EEF1F6', border: '1px solid', borderRadius: 12, padding: '14px 16px',
}
const summaryEyebrow: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#334155',
}
const summaryTitle: React.CSSProperties = {
  margin: '4px 0 0', fontFamily: "var(--font-lora), serif",
  fontSize: 18, fontWeight: 500, color: '#0F172A',
}

const errorBox: React.CSSProperties = {
  background: 'rgba(178,34,52,0.08)', border: '1px solid rgba(178,34,52,0.32)',
  borderRadius: 8, padding: '10px 14px', color: '#8B1A1A', fontSize: 13, marginBottom: 14,
}
const notice: React.CSSProperties = {
  textAlign: 'center', color: '#64748B', fontSize: 14,
}
const tipText: React.CSSProperties = {
  width: 'min(900px, calc(100vw - 32px))', margin: '14px auto 0',
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, letterSpacing: '0.06em',
  color: '#64748B', textAlign: 'center',
}

const globalCss = `
  main, h1, h2, h3, p, label, button, input, textarea, select { font-family: inherit; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #0F172A; box-shadow: 0 0 0 3px rgba(29,36,51,0.08); }
`
