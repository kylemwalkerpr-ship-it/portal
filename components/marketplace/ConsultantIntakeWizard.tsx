'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { T, F } from './tokens'
import ProfileAIDraftButton from '@/components/profile/ProfileAIDraftButton'
import { resizeAvatarFile } from '@/lib/imageResize'

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
  headshot_url: string | null
  tagline: string
  intro: string
  bio: string
  subjects: string
  industries: string
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
  username: '', full_name: '', headshot_url: null,
  tagline: '', intro: '', bio: '',
  subjects: '', industries: '',
  specialties: [], languages: [],
  education: '', timezone: '',
  years_experience: '', starting_price: '',
  offers_free_consult: null, available: true, video_intro_url: '',
}

const STEPS = [
  { id: 'handle', title: 'Handle', sub: 'Your SEO profile URL.' },
  { id: 'photo', title: 'Photo & pitch', sub: 'Headshot, tagline, intro.' },
  { id: 'about', title: 'About', sub: 'Long bio, education, timezone.' },
  { id: 'coverage', title: 'Coverage', sub: 'Where & what you serve.' },
  { id: 'pricing', title: 'Pricing', sub: 'Experience, rate, availability.' },
  { id: 'review', title: 'Review', sub: 'Confirm & finish.' },
] as const

const TIMEZONE_OPTIONS = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Dublin',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  'Australia/Sydney',
]
const SPECIALTY_SUGGESTIONS = [
  'MBA admissions', 'STEM SOPs', 'Scholarship essays', 'Resume writing',
  'Career pivot', 'Copy-editing', 'Business plan review', 'Tax filings',
  'Brand strategy', 'Language tutoring', 'Settlement orientation',
  'University admissions', 'Interview prep', 'Thesis editing',
  'Grant writing', 'LinkedIn optimization', 'Credential evaluation', 'Life coaching',
]
const LANGUAGE_SUGGESTIONS = ['English', 'Spanish', 'French', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'German', 'Korean', 'Tagalog']

export function ConsultantIntakeWizard() {
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
      const r = await fetch('/api/consultant/profile/strength', { credentials: 'same-origin' })
      if (r.ok) setStrength(await r.json())
    } catch { /* noop */ }
  }, [])

  // Initial load — pull profile + strength, restore the saved step.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/consultant/profile', { credentials: 'same-origin' }).then((r) => r.json()),
      fetch('/api/consultant/profile/strength', { credentials: 'same-origin' }).then((r) => r.json()),
    ])
      .then(([profile, str]) => {
        if (cancelled) return
        const c = profile.consultant || {}
        const p = profile.profile || {}
        setForm({
          username: p.username || '',
          full_name: p.full_name || '',
          headshot_url: c.headshot_url || null,
          tagline: c.tagline || '',
          intro: c.intro || '',
          bio: c.bio || '',
          subjects: c.subjects ?? '',
          industries: c.industries ?? '',
          specialties: Array.isArray(c.specialties) ? c.specialties : [],
          languages: Array.isArray(c.languages) ? c.languages : [],
          education: c.education || '',
          timezone: c.timezone || '',
          years_experience: c.years_experience ?? '',
          starting_price: c.starting_price ?? '',
          offers_free_consult: typeof c.offers_free_consult === 'boolean' ? c.offers_free_consult : null,
          available: c.available !== false,
          video_intro_url: c.video_intro_url || '',
        })
        setStrength(str)
        // Resume on saved step, but cap to last index.
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
      const res = await fetch('/api/consultant/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Could not save change.')
      setSavedFlash('Saved')
      window.setTimeout(() => setSavedFlash(''), 1200)
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
      const resized = await resizeAvatarFile(file)
      const data = new FormData()
      data.append('file', resized)
      const res = await fetch('/api/consultant/profile/avatar', {
        method: 'POST',
        credentials: 'same-origin',
        body: data,
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Upload failed.')
      setField('headshot_url', body.headshot_url || body.avatar_url || body.url)
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
    // Always persist resume state.
    payload.intake_last_step = nextStep
    const ok = await persist(payload)
    if (!ok) return
    setStep(nextStep)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!loaded) {
    return (
      <main style={pageWrap}>
        <p style={{ ...notice, marginTop: 60 }}>Loading your intake…</p>
      </main>
    )
  }

  const totalSteps = STEPS.length
  const isLast = step === totalSteps - 1
  const stepDef = STEPS[step]
  const score = strength?.score ?? 0
  const ready = !!strength?.publish_ready
  const threshold = strength?.publish_threshold ?? 75

  return (
    <main style={pageWrap}>
      <style>{globalCss}</style>
      <header style={headerStyle}>
        <Link href="/dashboard" style={breadStyle}>← Back to dashboard</Link>
        <h1 style={titleStyle}>Complete your YouSafe consultant profile</h1>
        <p style={subtitleStyle}>
          A clean profile clears the <b>{threshold}% publish gate</b> and unlocks your first gig.
          Each step auto-saves — leave any time and your progress is kept.
        </p>
        <div style={scoreRow}>
          <div style={progressTrack}>
            <div style={{ ...progressFill, width: `${score}%`, background: ready ? T.moss : T.indigo }} />
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
            <button key={s.id} type="button" onClick={() => setStep(i)} style={stepChip(active, done)}>
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
        {step === 1 && <PhotoStep form={form} setField={setField} onUpload={uploadHeadshot} uploading={uploading} />}
        {step === 2 && <AboutStep form={form} setField={setField} timezones={TIMEZONE_OPTIONS} />}
        {step === 3 && <CoverageStep form={form} setField={setField} toggleArr={toggleArr} />}
        {step === 4 && <PricingStep form={form} setField={setField} />}
        {step === 5 && <ReviewStep form={form} strength={strength} ready={ready} threshold={threshold} />}

        <footer style={footerRow}>
          {step > 0 ? (
            <button type="button" style={ghostBtn} onClick={() => setStep(step - 1)}>← Back</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLast && (
              <button type="button" style={ghostBtn} onClick={() => saveStep(step + 1)} disabled={saving}>
                Skip
              </button>
            )}
            {!isLast ? (
              <button type="button" style={primaryBtn} onClick={() => saveStep(step + 1)} disabled={saving}>
                {saving ? 'Saving…' : 'Save & continue →'}
              </button>
            ) : (
              <button
                type="button"
                style={primaryBtn}
                onClick={async () => {
                  await saveStep(step)
                  // Submit the formal application row so the admin review queue
                  // sees this consultant. Best-effort — even on failure we still
                  // route the user forward; the admin can re-pull from /sync.
                  try {
                    await fetch('/api/consultant/intake/submit', {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({}),
                    })
                  } catch {}
                  router.push(ready ? '/dashboard/gigs/new' : '/dashboard?goto=settings')
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
        Auto-saved as you go — pick back up any time from your dashboard.
      </p>
    </main>
  )
}

function stepPayload(step: number, f: Form): Record<string, unknown> {
  switch (step) {
    case 0: return f.username ? { username: f.username } : {}
    case 1: return { tagline: f.tagline, intro: f.intro }
    case 2: return { bio: f.bio, education: f.education, timezone: f.timezone }
    case 3: return {
      subjects: f.subjects,
      industries: f.industries,
      specialties: f.specialties,
      languages: f.languages,
    }
    case 4: {
      const out: Record<string, unknown> = { available: f.available }
      if (f.years_experience !== '') out.years_experience = Number(f.years_experience)
      if (f.starting_price !== '') out.starting_price = Number(f.starting_price)
      if (f.offers_free_consult !== null) out.offers_free_consult = f.offers_free_consult
      if (f.video_intro_url) out.video_intro_url = f.video_intro_url
      return out
    }
    default: return {}
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
        help="Becomes your public profile URL: market.yousafeconsultancy.com/providers/<handle>. Keep it short, lowercase, and keyword-rich — e.g. admissions-mentor-uk, career-coach-toronto, sop-editor-london. Lowercase letters, numbers, dashes, underscores; 3–32 chars."
        right={
          // AI suggest — same component used on bio/tagline/intro elsewhere.
          // The server-side draftProfileField now grounds the slug on the
          // seller's subjects + specialties + name (see lib/profileSuggest.ts)
          // and the normalizer guarantees the result fits the handle regex.
          <ProfileAIDraftButton
            field="username"
            label="Suggest with AI"
            onApply={(v) => setField('username', String(v || '').toLowerCase().trim())}
          />
        }
      >
        <input
          type="text"
          value={form.username}
          onChange={(e) => setField('username', e.target.value.toLowerCase().trim())}
          placeholder="study-permit-consultant-tor"
          maxLength={32}
          style={inputStyle}
        />
        {raw && !valid && <p style={{ color: T.brick, fontSize: 12, margin: '6px 0 0' }}>Doesn't match the slug pattern.</p>}
        {raw && valid && <p style={{ color: T.moss, fontSize: 12, margin: '6px 0 0' }}>Your profile will live at <b>/providers/{raw}</b>.</p>}
      </Field>
    </div>
  )
}

function PhotoStep({ form, setField, onUpload, uploading }: { form: Form; setField: any; onUpload: (f: File) => void; uploading: boolean }) {
  return (
    <div style={fieldStack}>
      <Field label="Headshot" required help="A clear bust shot on a neutral background works best.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={photoFrame}>
            {form.headshot_url
              ? <img src={form.headshot_url} alt="Headshot preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: "'Lora', serif", fontSize: 28, color: T.inkSoft }}>?</span>}
          </div>
          <label style={uploadCta(uploading)}>
            {uploading ? 'Uploading…' : form.headshot_url ? 'Replace photo' : 'Upload photo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} disabled={uploading} />
          </label>
        </div>
      </Field>
      <Field label="Tagline" required help="One sharp line. Aim for 60–120 characters.">
        <input type="text" value={form.tagline} onChange={(e) => setField('tagline', e.target.value)} maxLength={160}
          placeholder="MBA admissions strategist · 200+ clients · top-10 placements" style={inputStyle} />
        <CharCount n={form.tagline.length} min={40} max={160} />
        <ProfileAIDraftButton field="tagline" onApply={(v) => setField('tagline', String(v))} />
      </Field>
      <Field label="Intro" required help="2–3 sentences. First thing students read.">
        <textarea value={form.intro} onChange={(e) => setField('intro', e.target.value)} maxLength={600} rows={4}
          placeholder="I help applicants craft compelling SOPs and scholarship essays for top graduate programs. With 8 years in EdTech admissions, I know what committees actually read for — and how to make your story stand out."
          style={{ ...inputStyle, resize: 'vertical' }} />
        <CharCount n={form.intro.length} min={100} max={600} />
        <ProfileAIDraftButton field="intro" onApply={(v) => setField('intro', String(v))} />
      </Field>
    </div>
  )
}

function AboutStep({ form, setField, timezones }: { form: Form; setField: any; timezones: string[] }) {
  return (
    <div style={fieldStack}>
      <Field label="Long bio" required help="Background, how you work, who you serve best. Long bios convert higher.">
        <textarea value={form.bio} onChange={(e) => setField('bio', e.target.value)} maxLength={4000} rows={8}
          style={{ ...inputStyle, resize: 'vertical' }} />
        <CharCount n={form.bio.length} min={300} max={4000} />
        <ProfileAIDraftButton field="bio" onApply={(v) => setField('bio', String(v))} />
      </Field>
      <Field label="Education / training" help="Schools, degrees, or relevant certifications (e.g. Certified Resume Writer, TESOL, PMP).">
        <textarea value={form.education} onChange={(e) => setField('education', e.target.value)} maxLength={1200} rows={3}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>
      <Field label="Timezone">
        <select value={form.timezone} onChange={(e) => setField('timezone', e.target.value)} style={inputStyle}>
          <option value="">Select your timezone…</option>
          {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  )
}

function CoverageStep({ form, setField, toggleArr }: { form: Form; setField: any; toggleArr: any }) {
  return (
    <div style={fieldStack}>
      <Field label="Subjects you teach / advise on" required help="Comma-separated. What topics do you cover? e.g. 'MBA admissions, STEM SOPs, scholarship essays'.">
        <input type="text" value={form.subjects} onChange={(e) => setField('subjects', e.target.value)}
          placeholder="MBA admissions, STEM SOPs, scholarship essays" style={inputStyle} />
        <ProfileAIDraftButton field="subjects" onApply={(v) => setField('subjects', String(v))} />
      </Field>
      <Field label="Industries / sectors" required help="Plain English. What industries or sectors you serve.">
        <input type="text" value={form.industries} onChange={(e) => setField('industries', e.target.value)}
          placeholder="Higher education, EdTech, career services" style={inputStyle} />
        <ProfileAIDraftButton field="industries" onApply={(v) => setField('industries', String(v))} />
      </Field>
      <Field label="Specialties (3+ tags)" required help="These power marketplace search filters.">
        <ChipPicker all={SPECIALTY_SUGGESTIONS} selected={form.specialties} onToggle={(v) => toggleArr('specialties', v)} />
      </Field>
      <Field label="Languages" help="Beyond English. Students filter by language.">
        <ChipPicker all={LANGUAGE_SUGGESTIONS} selected={form.languages} onToggle={(v) => toggleArr('languages', v)} />
      </Field>
    </div>
  )
}

function PricingStep({ form, setField }: { form: Form; setField: any }) {
  return (
    <div style={fieldStack}>
      <Field label="Years of experience" required>
        <input type="number" min={0} max={60} value={form.years_experience}
          onChange={(e) => setField('years_experience', e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
      </Field>
      <Field label="Starting price (USD cents)" required help="Lowest price you'd typically quote. $150 = 15000.">
        <input type="number" min={100} step={100} value={form.starting_price}
          onChange={(e) => setField('starting_price', e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="15000" style={inputStyle} />
      </Field>
      <Field label="Do you offer free 15-min consults?">
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ v: true, label: 'Yes' }, { v: false, label: 'No' }].map((opt) => (
            <button key={String(opt.v)} type="button" onClick={() => setField('offers_free_consult', opt.v)}
              style={pillBtn(form.offers_free_consult === opt.v)}>{opt.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Currently accepting new work?">
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ v: true, label: 'Yes, accepting' }, { v: false, label: 'Not right now' }].map((opt) => (
            <button key={String(opt.v)} type="button" onClick={() => setField('available', opt.v)}
              style={pillBtn(form.available === opt.v)}>{opt.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Video intro URL" help="Optional but high-impact.">
        <input type="url" value={form.video_intro_url} onChange={(e) => setField('video_intro_url', e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…" style={inputStyle} />
      </Field>
    </div>
  )
}

function ReviewStep({ form, strength, ready, threshold }: { form: Form; strength: Strength | null; ready: boolean; threshold: number }) {
  const missing = strength?.checks?.filter((c) => !c.done) ?? []
  return (
    <div style={fieldStack}>
      <div style={{ ...summaryBox, borderColor: ready ? T.moss : T.indigo }}>
        <div style={summaryEyebrow}>{ready ? 'Profile ready to publish' : 'Almost there'}</div>
        <h3 style={summaryTitle}>
          {strength?.score ?? 0}% complete — {ready ? 'you can publish your first gig' : `${Math.max(0, threshold - (strength?.score ?? 0))}% to reach the ${threshold}% publish gate`}
        </h3>
        {!ready && missing.length > 0 && (
          <ul style={{ margin: '10px 0 0', padding: '12px 0 0', borderTop: '1px solid #F1F5F9', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {missing.slice(0, 8).map((c) => (
              <li key={c.id} style={{ fontSize: 13, color: T.inkMid, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: T.brick }}>•</span>
                <span><b style={{ color: T.ink }}>{c.label}</b>{c.hint ? <span style={{ color: T.inkSoft }}> — {c.hint}</span> : null}{' '}
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.inkSoft }}>+{c.weight}%</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <SummaryCard label="Handle" value={form.username || '—'} />
        <SummaryCard label="Headshot" value={form.headshot_url ? '✓ uploaded' : '—'} />
        <SummaryCard label="Tagline" value={form.tagline ? `${form.tagline.length} chars` : '—'} />
        <SummaryCard label="Bio" value={form.bio ? `${form.bio.length} chars` : '—'} />
        <SummaryCard label="Subjects" value={form.subjects || '—'} />
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
    <div style={{ background: T.vellum, border: '1px solid #F1F5F9', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function Field({ label, help, required, children, right }: { label: string; help?: string; required?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  // `right` is an optional slot for an inline-end action — currently used by
  // HandleStep to dock the ProfileAIDraftButton next to the label. We use
  // <div> instead of <label> so the right slot's interactive children don't
  // get hijacked by the surrounding label's click target.
  const TagName: 'label' | 'div' = right ? 'div' : 'label'
  return (
    <TagName style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13.5, color: T.ink }}>{label}</span>
          {required && <span style={{ color: T.brick, fontSize: 13, fontWeight: 700 }}>*</span>}
        </div>
        {right}
      </div>
      {help && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>{help}</p>}
      {children}
    </TagName>
  )
}
function CharCount({ n, min, max }: { n: number; min: number; max: number }) {
  const tone = n < min ? T.brick : n > max ? T.brick : T.moss
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: tone, marginTop: 4 }}>
      {n} / {max} chars{n < min ? ` · ${min - n} more to reach the recommended minimum` : ''}
    </div>
  )
}
function ChipPicker({ all, selected, onToggle }: { all: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {all.map((v) => {
        const on = selected.includes(v)
        return <button key={v} type="button" onClick={() => onToggle(v)} style={pillBtn(on)}>{v}</button>
      })}
    </div>
  )
}

/* ─────────────────────────── styles ───────────────────────────── */

const pageWrap: React.CSSProperties = { minHeight: '100vh', background: T.cream, fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", color: T.ink, padding: '24px 16px 60px' }
const headerStyle: React.CSSProperties = { width: 'min(900px, calc(100vw - 32px))', margin: '0 auto 18px' }
const breadStyle: React.CSSProperties = { fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.inkMid, textDecoration: 'none' }
const titleStyle: React.CSSProperties = { margin: '8px 0 6px', fontFamily: "var(--font-lora), Lora, Georgia, serif", fontSize: 32, fontWeight: 500, letterSpacing: '-0.018em', color: T.ink }
const subtitleStyle: React.CSSProperties = { margin: 0, fontSize: 14.5, lineHeight: 1.55, color: T.inkMid, maxWidth: '60ch' }
const scoreRow: React.CSSProperties = { marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }
const progressTrack: React.CSSProperties = { flex: 1, minWidth: 200, height: 8, background: T.ruleSoft, borderRadius: 999, overflow: 'hidden' }
const progressFill: React.CSSProperties = { height: '100%', borderRadius: 999, transition: 'width .3s ease, background .3s ease' }
const scoreLabel = (ready: boolean): React.CSSProperties => ({ fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace", fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: ready ? T.moss : T.indigo, fontWeight: 600 })
const savedBadge: React.CSSProperties = { fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace", fontSize: 11, color: T.moss, fontWeight: 700 }
const stepsRow: React.CSSProperties = { width: 'min(900px, calc(100vw - 32px))', margin: '0 auto 14px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const }
const stepChip = (active: boolean, done: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? T.ink : T.rule}`, background: active ? T.ink : (done ? T.cream : T.vellum), color: active ? '#fff' : T.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' })
const stepNum = (active: boolean, done: boolean): React.CSSProperties => ({ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, background: active ? '#fff' : (done ? T.moss : '#fff'), color: active ? T.ink : (done ? '#fff' : T.ink), border: done ? 'none' : '1px solid #E2E8F0' })
const cardStyle: React.CSSProperties = { width: 'min(900px, calc(100vw - 32px))', margin: '0 auto', background: T.vellum, border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 26px 18px', boxShadow: '0 14px 30px -22px rgba(29,36,51,0.2)' }
const stepHead: React.CSSProperties = { marginBottom: 18 }
const stepEyebrow: React.CSSProperties = { fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.inkSoft }
const stepTitle: React.CSSProperties = { margin: '4px 0 4px', fontFamily: "var(--font-lora), Lora, serif", fontSize: 24, fontWeight: 500, letterSpacing: '-0.012em', color: T.ink }
const stepSub: React.CSSProperties = { margin: 0, color: T.inkMid, fontSize: 13.5 }
const fieldStack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: T.vellum, fontSize: 14, color: T.ink, fontFamily: 'inherit', boxSizing: 'border-box' }
const footerRow: React.CSSProperties = { marginTop: 18, paddingTop: 14, borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
const primaryBtn: React.CSSProperties = { background: T.ink, color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const ghostBtn: React.CSSProperties = { background: T.vellum, color: T.ink, border: '1px solid #E2E8F0', padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const pillBtn = (on: boolean): React.CSSProperties => ({ padding: '6px 14px', borderRadius: 999, border: `1px solid ${on ? T.ink : T.rule}`, background: on ? T.ink : T.vellum, color: on ? '#fff' : T.inkMid, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const photoFrame: React.CSSProperties = { width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', background: T.cream, display: 'grid', placeItems: 'center', border: '1px solid #E2E8F0' }
const uploadCta = (uploading: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', padding: '9px 16px', background: uploading ? T.inkSoft : T.indigo, color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' })
const summaryBox: React.CSSProperties = { background: T.cream, border: '1px solid', borderRadius: 12, padding: '14px 16px' }
const summaryEyebrow: React.CSSProperties = { fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.inkMid }
const summaryTitle: React.CSSProperties = { margin: '4px 0 0', fontFamily: "var(--font-lora), serif", fontSize: 18, fontWeight: 500, color: T.ink }
const errorBox: React.CSSProperties = { background: 'rgba(178,34,52,0.08)', border: '1px solid rgba(178,34,52,0.32)', borderRadius: 8, padding: '10px 14px', color: '#8B1A1A', fontSize: 13, marginBottom: 14 }
const notice: React.CSSProperties = { textAlign: 'center', color: T.inkSoft, fontSize: 14 }
const tipText: React.CSSProperties = { width: 'min(900px, calc(100vw - 32px))', margin: '14px auto 0', fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, letterSpacing: '0.06em', color: T.inkSoft, textAlign: 'center' }
const globalCss = `
  main, h1, h2, h3, p, label, button, input, textarea, select { font-family: inherit; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #0F172A; box-shadow: 0 0 0 3px rgba(29,36,51,0.08); }
`
