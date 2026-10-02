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
  jurisdictions: string[]
  year_admitted: string | null
  register_url: string | null
  good_standing: boolean
  scope_certified: boolean
  insurance: string | null
  // consultant
  consultant_type: (typeof CONSULTANT_TYPES)[number]
  registration_number: string | null
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

export function validateProviderApplication(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const providerType = normalizeProviderType(body?.provider_type)
  if (!providerType) {
    return { ok: false, errors: { provider_type: 'Choose attorney, regulated adviser, or consultant.' } }
  }
  const licensed = providerType !== 'consultant'

  const data: ProviderApplicationInput = {
    provider_type: providerType,
    full_name: str(body.full_name, 200) ?? '',
    display_name: str(body.display_name, 200),
    country: str(body.country, 80) ?? '',
    timezone: str(body.timezone, 80),
    phone: str(body.phone, 60),
    languages: list(body.languages, 15, 60),
    practice_areas: list(body.practice_areas ?? body.specialties, 30, 80),
    years_experience: str(body.years_experience, 20),
    capacity: str(body.capacity, 200) ?? '',
    profile_url: httpsUrl(body.profile_url),
    notes: str(body.notes, 4000),
    terms_accepted: true,
    regulator: str(body.regulator, 200),
    licence_number: str(body.licence_number ?? body.bar_number, 120),
    jurisdictions: list(body.jurisdictions, 20, 120),
    year_admitted: str(body.year_admitted, 4),
    register_url: httpsUrl(body.register_url),
    good_standing: bool(body.good_standing),
    scope_certified: bool(body.scope_certified),
    insurance: str(body.insurance ?? body.malpractice_insurance, 400),
    consultant_type: (CONSULTANT_TYPES as readonly string[]).includes(String(body.consultant_type))
      ? (body.consultant_type as ProviderApplicationInput['consultant_type'])
      : 'individual',
    registration_number: str(body.registration_number, 120),
  }

  if (!data.full_name) errors.full_name = 'Full legal name is required.'
  if (!data.country) errors.country = 'Country is required.'
  if (data.practice_areas.length === 0) errors.practice_areas = licensed ? 'Add at least one practice area.' : 'Add at least one specialty.'
  if (!data.capacity) errors.capacity = 'Tell us your monthly capacity.'
  if (!bool(body.terms_accepted)) errors.terms_accepted = 'You must accept the provider terms.'
  if (body.profile_url && !data.profile_url) errors.profile_url = 'Enter a valid URL (https://...).'

  if (licensed) {
    if (!data.regulator) errors.regulator = 'Choose your regulator.'
    if (!data.licence_number) errors.licence_number = 'Licence / registration number is required.'
    if (data.jurisdictions.length === 0) errors.jurisdictions = 'Add at least one jurisdiction of admission.'
    if (!data.register_url) errors.register_url = 'Link to your entry on the official public register (https://...).'
    if (data.year_admitted && !/^(19|20)\d{2}$/.test(data.year_admitted)) errors.year_admitted = 'Use a four-digit year.'
    if (!data.good_standing) errors.good_standing = 'Confirm you are in good standing with your regulator.'
    if (!data.scope_certified) errors.scope_certified = 'Confirm you will only advise within the scope of your licence.'
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
    lines.push(`Licence / registration no.: ${data.licence_number}`)
    lines.push(`Jurisdictions of admission: ${data.jurisdictions.join(', ')}`)
    if (data.year_admitted) lines.push(`Year admitted: ${data.year_admitted}`)
    lines.push(`Public register URL: ${data.register_url}`)
    lines.push(`Good standing attested: ${data.good_standing ? 'yes' : 'no'}`)
    lines.push(`Scope-of-licence certification: ${data.scope_certified ? 'yes' : 'no'}`)
  } else if (data.registration_number) {
    lines.push(`Registration / membership no.: ${data.registration_number}`)
  }
  lines.push(`Country: ${data.country}`)
  if (data.display_name) lines.push(`Display name: ${data.display_name}`)
  if (data.languages.length) lines.push(`Languages: ${data.languages.join(', ')}`)
  if (data.years_experience) lines.push(`Years of experience: ${data.years_experience}`)
  if (data.timezone) lines.push(`Timezone: ${data.timezone}`)
  if (data.profile_url) lines.push(`Professional profile: ${data.profile_url}`)
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
        profile_url: data.profile_url,
        capacity: data.capacity,
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
      credential_type: data.regulator,
      jurisdictions: data.jurisdictions.join(', '),
      bar_number: data.licence_number,
      practice_areas: data.practice_areas.join(', '),
      malpractice_insurance: data.insurance,
      // The public register entry is what the admin verifies against.
      profile_url: data.register_url,
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
