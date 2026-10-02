/**
 * ONE provider application for attorneys, regulated advisers and consultants.
 *
 *   provider_type      role         queue (existing admin UI + risk RPCs)
 *   attorney           attorney     attorney_applications
 *   regulated_adviser  attorney     attorney_applications  (RCIC, OISC/IAA, RMA)
 *   consultant         consultant   consultant_applications
 *
 * Flow: submit -> profile status 'pending' -> admin approves -> 'active'.
 * Re-submitting updates the open application in place (no duplicates) and
 * NEVER demotes an already-active provider.
 *
 * No schema migration is required: licence/register details the existing
 * tables have no column for are written as a structured, human-readable block
 * at the top of `notes` so admins see them in the current review UI.
 */
import { BAR_NUMBER_PATTERN, isValidBarNumber, normalizeBarNumber } from './barNumber'
import { normalizeProviderType, roleForProviderType, type ProviderRole, type ProviderType } from '../auth/roles'

export const PROVIDER_TERMS_VERSION = '2026-10'

export const REGULATORS: Record<ProviderType, readonly string[]> = {
  attorney: [
    'US state bar',
    'Solicitors Regulation Authority (England & Wales)',
    'Bar Standards Board (England & Wales)',
    'Law Society of Scotland',
    'Law Society of Northern Ireland',
    'Canadian provincial law society',
    'Australian state/territory law society or bar',
    'Other bar / law society',
  ],
  regulated_adviser: [
    'College of Immigration and Citizenship Consultants (RCIC, Canada)',
    'Immigration Advice Authority / OISC (UK)',
    'Office of the Migration Agents Registration Authority (RMA, Australia)',
    'Other immigration regulator',
  ],
  consultant: [],
}

export const CONSULTANT_TYPES = ['individual', 'firm', 'student'] as const

/**
 * Where a lawyer is admitted. US jurisdictions map to "US state bar"; the
 * non-US entries carry their own regulator + country so the short form never
 * has to ask for them separately. `Other` needs a free-text jurisdiction.
 */
export const US_BAR_JURISDICTIONS: readonly string[] = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
  'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming', 'Puerto Rico', 'Guam', 'U.S. Virgin Islands',
  'Northern Mariana Islands', 'American Samoa',
]

export const NON_US_BAR_JURISDICTIONS: readonly { value: string; regulator: string; country: string }[] = [
  { value: 'England & Wales (solicitor)', regulator: 'Solicitors Regulation Authority (England & Wales)', country: 'United Kingdom' },
  { value: 'England & Wales (barrister)', regulator: 'Bar Standards Board (England & Wales)', country: 'United Kingdom' },
  { value: 'Scotland', regulator: 'Law Society of Scotland', country: 'United Kingdom' },
  { value: 'Northern Ireland', regulator: 'Law Society of Northern Ireland', country: 'United Kingdom' },
  { value: 'Canada (provincial law society)', regulator: 'Canadian provincial law society', country: 'Canada' },
  { value: 'Australia (state/territory law society or bar)', regulator: 'Australian state/territory law society or bar', country: 'Australia' },
]

export const OTHER_JURISDICTION = 'Other'

/** Regulated immigration advisers: regulator -> country (for the derived country). */
export const ADVISER_REGULATOR_COUNTRY: Record<string, string> = {
  'College of Immigration and Citizenship Consultants (RCIC, Canada)': 'Canada',
  'Immigration Advice Authority / OISC (UK)': 'United Kingdom',
  'Office of the Migration Agents Registration Authority (RMA, Australia)': 'Australia',
}

/** Consultant credential bodies (the FAQ promises every consultant is credentialed). */
export const CONSULTANT_CREDENTIAL_BODIES: readonly string[] = [
  'CICC (RCIC, Canada)',
  'OISC / IAA (UK)',
  'MARA (Australia)',
  'ICEF (agency / counsellor)',
  'AIRC (certified agency)',
  'NACAC / IECA (education consultant)',
  'Career Development Institute / NCDA',
  'ICF (coaching)',
  'Chartered or professional body',
  'Other credential',
]

export const CONSULTANT_SPECIALTIES: readonly string[] = [
  'Admissions & study abroad',
  'Visa & immigration support',
  'Career & employment',
  'Business & investor',
  'Settlement & relocation',
  'Mentorship',
  'Other',
]

export { BAR_NUMBER_PATTERN, isValidBarNumber, normalizeBarNumber }

/** Regulator + country implied by an attorney's bar jurisdiction (null for Other / unknown). */
export function barJurisdictionInfo(jurisdiction: string | null): { regulator: string; country: string } | null {
  if (!jurisdiction) return null
  if (US_BAR_JURISDICTIONS.includes(jurisdiction)) return { regulator: 'US state bar', country: 'United States' }
  const hit = NON_US_BAR_JURISDICTIONS.find((j) => j.value === jurisdiction)
  return hit ? { regulator: hit.regulator, country: hit.country } : null
}

export interface ProviderApplicationInput {
  provider_type: ProviderType
  full_name: string
  display_name: string | null
  country: string
  timezone: string | null
  phone: string | null
  languages: string[]
  practice_areas: string[]
  years_experience: string | null
  capacity: string
  profile_url: string | null
  notes: string | null
  terms_accepted: true
  // licensed (attorney / regulated_adviser)
  regulator: string | null
  licence_number: string | null
  /** Attorney: the bar jurisdiction picked on the short form (e.g. "New York"). */
  bar_state: string | null
  jurisdictions: string[]
  year_admitted: string | null
  register_url: string | null
  good_standing: boolean
  scope_certified: boolean
  insurance: string | null
  // consultant
  consultant_type: (typeof CONSULTANT_TYPES)[number]
  registration_number: string | null
  credential_body: string | null
  credential_url: string | null
}

export type ValidationResult =
  | { ok: true; data: ProviderApplicationInput; role: ProviderRole }
  | { ok: false; errors: Record<string, string> }

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, max) : null
}

function list(value: unknown, maxItems = 30, itemMax = 120): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const clean = item.trim().slice(0, itemMax)
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= maxItems) break
  }
  return out
}

function httpsUrl(value: unknown): string | null {
  const raw = str(value, 500)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === 'yes'
}

/**
 * Short-form validation. Required to apply:
 *   all:                provider type, full name, country (derived when the
 *                       bar / regulator implies it), one consent checkbox
 *   attorney:           bar jurisdiction + bar number (FAQ: bar-verified)
 *   regulated adviser:  regulator + licence number
 *   consultant:         primary specialty + credential body + credential number
 *                       (FAQ: every consultant is credentialed)
 * Everything else (practice areas, languages, capacity, bio, phone, display
 * name, insurance, links) is optional here and collected in the
 * post-approval profile wizard.
 *
 * `consent` is the single short-form checkbox: it attests good standing,
 * scope of licence and the provider terms in one tick. The legacy separate
 * `terms_accepted` / `good_standing` / `scope_certified` flags still work.
 */
export function validateProviderApplication(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const providerType = normalizeProviderType(body?.provider_type)
  if (!providerType) {
    return { ok: false, errors: { provider_type: 'Choose attorney, regulated adviser, or consultant.' } }
  }
  const licensed = providerType !== 'consultant'
  const consent = bool(body.consent)

  const jurisdictionsInput = list(body.jurisdictions, 20, 120)
  const barState = providerType === 'attorney' ? str(body.bar_state, 120) : null
  const barStateOther = str(body.bar_state_other, 120)
  // Legacy payloads (old long form) send `jurisdictions` + `regulator` only.
  const fallbackJurisdiction = providerType === 'attorney' && !barState ? jurisdictionsInput[0] ?? null : null
  const barJurisdiction = barState === OTHER_JURISDICTION ? barStateOther : barState ?? fallbackJurisdiction
  const barInfo = barJurisdictionInfo(barJurisdiction)

  let regulator = str(body.regulator, 200)
  if (providerType === 'attorney') {
    regulator = barInfo?.regulator ?? regulator ?? (barJurisdiction ? 'Other bar / law society' : null)
  }
  const derivedCountry =
    providerType === 'attorney' ? barInfo?.country ?? null
      : providerType === 'regulated_adviser' ? ADVISER_REGULATOR_COUNTRY[regulator ?? ''] ?? null
        : null

  const jurisdictions = barJurisdiction
    ? [barJurisdiction, ...jurisdictionsInput.filter((j) => j.toLowerCase() !== barJurisdiction.toLowerCase())]
    : jurisdictionsInput

  const specialty = str(body.specialty, 80)
  const practiceAreas = list(body.practice_areas ?? body.specialties, 30, 80)
  const practice_areas = specialty
    ? [specialty, ...practiceAreas.filter((p) => p.toLowerCase() !== specialty.toLowerCase())]
    : practiceAreas

  const rawLicence = body.licence_number ?? body.bar_number
  const credentialUrlRaw = body.credential_url

  const data: ProviderApplicationInput = {
    provider_type: providerType,
    full_name: str(body.full_name, 200) ?? '',
    display_name: str(body.display_name, 200),
    country: str(body.country, 80) ?? derivedCountry ?? '',
    timezone: str(body.timezone, 80),
    phone: str(body.phone, 60),
    languages: list(body.languages, 15, 60),
    practice_areas,
    years_experience: str(body.years_experience, 20),
    capacity: str(body.capacity, 200) ?? '',
    profile_url: httpsUrl(body.profile_url),
    notes: str(body.notes, 4000),
    terms_accepted: true,
    regulator,
    licence_number: licensed ? normalizeBarNumber(rawLicence) : null,
    bar_state: barJurisdiction,
    jurisdictions,
    year_admitted: str(body.year_admitted, 4),
    register_url: httpsUrl(body.register_url),
    good_standing: consent || bool(body.good_standing),
    scope_certified: consent || bool(body.scope_certified),
    insurance: str(body.insurance ?? body.malpractice_insurance, 400),
    consultant_type: (CONSULTANT_TYPES as readonly string[]).includes(String(body.consultant_type))
      ? (body.consultant_type as ProviderApplicationInput['consultant_type'])
      : 'individual',
    registration_number: providerType === 'consultant' ? str(body.registration_number ?? body.credential_number, 120) : null,
    credential_body: providerType === 'consultant' ? str(body.credential_body, 120) : null,
    credential_url: providerType === 'consultant' ? httpsUrl(credentialUrlRaw) : null,
  }

  if (!data.full_name) errors.full_name = 'Full legal name is required.'
  if (!data.country) errors.country = 'Country is required.'
  if (!(consent || bool(body.terms_accepted))) {
    errors.consent = licensed
      ? 'Please confirm your good standing and accept the provider terms.'
      : 'Please confirm your credentials and accept the provider terms.'
  }
  if (body.profile_url && !data.profile_url) errors.profile_url = 'Enter a valid URL (https://...).'
  if (body.register_url && !data.register_url) errors.register_url = 'Enter a valid URL (https://...).'

  if (providerType === 'attorney') {
    if (barState === OTHER_JURISDICTION && !barStateOther) errors.bar_state_other = 'Tell us the jurisdiction / bar you are admitted to.'
    else if (!barJurisdiction) errors.bar_state = 'Choose the state or jurisdiction where you are admitted.'
    if (!data.licence_number) errors.bar_number = 'Bar number is required — we verify it with the bar before approval.'
    else if (!BAR_NUMBER_PATTERN.test(data.licence_number)) {
      errors.bar_number = 'Enter your bar number as issued (3–20 letters/digits, may include - . /).'
    }
  } else if (providerType === 'regulated_adviser') {
    if (!data.regulator) errors.regulator = 'Choose your regulator.'
    if (!data.licence_number) errors.licence_number = 'Licence / registration number is required.'
    else if (!BAR_NUMBER_PATTERN.test(data.licence_number)) {
      errors.licence_number = 'Enter your number as issued (3–20 letters/digits, may include - . /).'
    }
  } else {
    if (data.practice_areas.length === 0) errors.specialty = 'Choose your main specialty.'
    if (!data.credential_body) errors.credential_body = 'Choose the body that issued your credential.'
    if (!data.registration_number) errors.registration_number = 'Credential / membership number is required — we verify it before approval.'
    else if (data.registration_number.length < 2) errors.registration_number = 'Enter your credential / membership number as issued.'
    if (credentialUrlRaw && !data.credential_url) errors.credential_url = 'Enter a valid URL (https://...).'
  }
  if (data.year_admitted && !/^(19|20)\d{2}$/.test(data.year_admitted)) errors.year_admitted = 'Use a four-digit year.'
  if (licensed && !errors.consent && !(data.good_standing && data.scope_certified)) {
    errors.consent = 'Please confirm your good standing and that you will only advise within the scope of your licence.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data, role: roleForProviderType(providerType) }
}

const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  attorney: 'Licensed lawyer (attorney / solicitor / barrister)',
  regulated_adviser: 'Regulated immigration adviser',
  consultant: 'Consultant (non-legal)',
}

/** Structured details block written at the top of `notes`. */
export function applicationDetailsBlock(data: ProviderApplicationInput, submittedAt: string): string {
  const lines = [
    `[YouSafe provider application v2 · terms ${PROVIDER_TERMS_VERSION}]`,
    `Provider type: ${PROVIDER_TYPE_LABEL[data.provider_type]}`,
  ]
  if (data.provider_type !== 'consultant') {
    lines.push(`Regulator: ${data.regulator}`)
    if (data.provider_type === 'attorney' && data.bar_state) lines.push(`Bar jurisdiction: ${data.bar_state}`)
    lines.push(`${data.provider_type === 'attorney' ? 'Bar number' : 'Licence / registration no.'}: ${data.licence_number}`)
    if (data.jurisdictions.length) lines.push(`Jurisdictions of admission: ${data.jurisdictions.join(', ')}`)
    if (data.year_admitted) lines.push(`Year admitted: ${data.year_admitted}`)
    lines.push(`Public register URL: ${data.register_url ?? 'not provided (verify via the regulator\'s public search)'}`)
    lines.push(`Good standing attested: ${data.good_standing ? 'yes' : 'no'}`)
    lines.push(`Scope-of-licence certification: ${data.scope_certified ? 'yes' : 'no'}`)
  } else {
    if (data.credential_body) lines.push(`Credential body: ${data.credential_body}`)
    if (data.registration_number) lines.push(`Credential / membership no.: ${data.registration_number}`)
    if (data.credential_url) lines.push(`Credential verification URL: ${data.credential_url}`)
  }
  lines.push(`Country: ${data.country}`)
  if (data.display_name) lines.push(`Display name: ${data.display_name}`)
  if (data.languages.length) lines.push(`Languages: ${data.languages.join(', ')}`)
  if (data.years_experience) lines.push(`Years of experience: ${data.years_experience}`)
  if (data.timezone) lines.push(`Timezone: ${data.timezone}`)
  if (data.profile_url) lines.push(`Professional profile: ${data.profile_url}`)
  if (!data.practice_areas.length || !data.capacity) {
    lines.push('Profile details (practice areas, languages, capacity, bio) are completed after approval.')
  }
  lines.push(`Terms accepted: ${PROVIDER_TERMS_VERSION} at ${submittedAt}`)
  const block = lines.join('\n')
  return data.notes ? `${block}\n---\n${data.notes}` : block
}

/** Row for the queue table that matches this provider type. */
export function applicationRow(
  data: ProviderApplicationInput,
  profile: { id: string; email: string | null },
  submittedAt: string,
): { table: 'attorney_applications' | 'consultant_applications'; row: Record<string, unknown> } {
  const notes = applicationDetailsBlock(data, submittedAt)
  if (data.provider_type === 'consultant') {
    return {
      table: 'consultant_applications',
      row: {
        profile_id: profile.id,
        email: profile.email ?? '',
        full_name: data.full_name,
        phone: data.phone,
        consultant_type: data.consultant_type,
        jurisdictions: data.jurisdictions.join(', ') || null,
        registration_number: data.registration_number,
        specialties: data.practice_areas,
        malpractice_insurance: data.insurance,
        profile_url: data.credential_url ?? data.profile_url,
        capacity: data.capacity || null,
        notes,
        status: 'pending',
      },
    }
  }
  return {
    table: 'attorney_applications',
    row: {
      profile_id: profile.id,
      email: profile.email ?? '',
      full_name: data.full_name,
      phone: data.phone,
      credential_type: data.regulator ?? '',
      jurisdictions: data.jurisdictions.join(', '),
      bar_number: data.licence_number,
      // NOT NULL text columns: optional on the short form, so '' until the
      // post-approval profile step fills them (no schema migration needed).
      practice_areas: data.practice_areas.join(', '),
      malpractice_insurance: data.insurance,
      // The public register entry is what the admin verifies against.
      profile_url: data.register_url ?? '',
      capacity: data.capacity,
      notes,
      status: 'pending',
    },
  }
}

/** Open application statuses that are updated in place on re-submit. */
export const OPEN_APPLICATION_STATUSES: readonly string[] = ['pending', 'waitlist', 'needs_info']

/**
 * Next profile status after a submit. Active stays active (no demotion);
 * suspended stays suspended; everything else becomes pending review.
 */
export function profileStatusAfterSubmit(currentStatus: string | null | undefined): string {
  if (currentStatus === 'active') return 'active'
  if (currentStatus === 'suspended') return 'suspended'
  return 'pending'
}

export type ProviderFormValues = Partial<Record<
  | 'full_name' | 'country' | 'bar_state' | 'bar_state_other' | 'bar_number' | 'register_url'
  | 'regulator' | 'licence_number' | 'specialty' | 'credential_body' | 'registration_number' | 'credential_url',
  string
>>

function noteLine(notes: unknown, labelText: string): string | null {
  if (typeof notes !== 'string') return null
  const prefix = `${labelText}: `
  const line = notes.split('\n').find((l) => l.startsWith(prefix))
  return line ? line.slice(prefix.length).trim() || null : null
}

/** Prefill values for "Review or update application" from the open queue row. */
export function formValuesFromApplication(
  table: 'attorney_applications' | 'consultant_applications',
  row: Record<string, unknown> | null | undefined,
): ProviderFormValues {
  if (!row) return {}
  const out: ProviderFormValues = {}
  const set = (key: keyof ProviderFormValues, value: unknown) => {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  }
  set('full_name', row.full_name)
  set('country', noteLine(row.notes, 'Country'))
  if (table === 'attorney_applications') {
    const barJurisdiction = noteLine(row.notes, 'Bar jurisdiction') ?? String(row.jurisdictions ?? '').split(',')[0]?.trim()
    if (barJurisdiction && barJurisdictionInfo(barJurisdiction)) set('bar_state', barJurisdiction)
    else if (barJurisdiction) { out.bar_state = OTHER_JURISDICTION; set('bar_state_other', barJurisdiction) }
    set('bar_number', row.bar_number)
    set('licence_number', row.bar_number)
    set('regulator', row.credential_type)
    set('register_url', row.profile_url)
  } else {
    const specialties = Array.isArray(row.specialties) ? row.specialties : []
    set('specialty', specialties[0])
    set('credential_body', noteLine(row.notes, 'Credential body'))
    set('registration_number', row.registration_number)
    set('credential_url', row.profile_url)
  }
  return out
}
