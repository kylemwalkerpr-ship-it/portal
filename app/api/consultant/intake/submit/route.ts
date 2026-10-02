/**
 * POST /api/consultant/intake/submit
 * Final-step submit for the consultant intake wizard. Inserts a
 * consultant_applications row (status=pending) and flips the profile to
 * status='pending' so the admin-review gate has effect. Idempotent: an open
 * application is updated in place (only with fields actually sent). An
 * already-active consultant is never demoted and gets no empty application.
 * New applicants should use the unified /onboarding/provider form.
 */
import { getCurrentConsultant } from '@/lib/consultant'
import { OPEN_APPLICATION_STATUSES, profileStatusAfterSubmit } from '@/lib/provider/application'

interface IntakeBody {
  consultant_type?: string
  jurisdictions?: string
  registration_number?: string
  specialties?: string[]
  malpractice_insurance?: string
  profile_url?: string
  capacity?: string
  notes?: string
  phone?: string
}

const VALID_TYPES = ['individual', 'firm', 'student'] as const

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function cleanArr(v: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim().slice(0, itemMax))
    .filter(Boolean)
    .slice(0, max)
}

export async function POST(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile, consultant } = auth

  let body: IntakeBody = {}
  try { body = await req.json() } catch {}

  const consultantType = typeof body.consultant_type === 'string' && (VALID_TYPES as readonly string[]).includes(body.consultant_type)
    ? body.consultant_type
    : 'individual'

  // Pull through any wizard-collected fields the consultants/profiles row
  // already has, so the application snapshot reflects what the wizard saw.
  const fallbackSpecialties = Array.isArray((consultant as Record<string, unknown>).specialties)
    ? ((consultant as Record<string, unknown>).specialties as string[])
    : []

  const specialties = cleanArr(body.specialties, 30, 80)
  const provided: Record<string, unknown> = {
    phone: cleanStr(body.phone, 60),
    consultant_type: typeof body.consultant_type === 'string' && (VALID_TYPES as readonly string[]).includes(body.consultant_type)
      ? consultantType
      : null,
    jurisdictions: cleanStr(body.jurisdictions, 400),
    registration_number: cleanStr(body.registration_number, 120),
    specialties: specialties.length ? specialties : null,
    malpractice_insurance: cleanStr(body.malpractice_insurance, 400),
    profile_url: cleanStr(body.profile_url, 400),
    capacity: cleanStr(body.capacity, 200),
    notes: cleanStr(body.notes, 2000),
  }
  // Only fields the caller actually sent are written: the wizard's final step
  // posts `{}`, which must never wipe what the applicant entered earlier.
  const patch = Object.fromEntries(Object.entries(provided).filter(([, v]) => v !== null))

  // Look for an existing application for this profile; if one is still open
  // refresh it in place (no duplicates in the admin queue).
  const { data: existing } = await db
    .from('consultant_applications')
    .select('id, status')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const profileStatus = (profile as { status?: string | null }).status ?? null
  let applicationId: string | null = null
  if (existing && OPEN_APPLICATION_STATUSES.includes(existing.status)) {
    if (Object.keys(patch).length > 0) {
      const { data, error } = await db
        .from('consultant_applications')
        .update(patch)
        .eq('id', existing.id)
        .select('id')
        .single()
      if (error) return Response.json({ error: error.message }, { status: 500 })
      applicationId = data?.id ?? existing.id
    } else {
      applicationId = existing.id
    }
  } else if (profileStatus === 'active') {
    // Approved consultant finishing (or re-running) the profile wizard: there
    // is nothing to review and they must NOT be demoted to pending.
    return Response.json({ ok: true, application_id: existing?.id ?? null, status: 'active' })
  } else {
    const payload = {
      profile_id: profile.id,
      email: profile.email,
      full_name: profile.full_name || profile.email,
      consultant_type: consultantType,
      specialties: specialties.length ? specialties : fallbackSpecialties,
      ...patch,
      status: 'pending',
    }
    const { data, error } = await db
      .from('consultant_applications')
      .insert(payload)
      .select('id')
      .single()
    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return Response.json({ error: 'Consultant applications table not provisioned yet. Contact admin.' }, { status: 503 })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }
    applicationId = data?.id ?? null
  }

  // Gate the profile until the admin reviews — but never demote an active
  // (approved) consultant, and never lift a suspension.
  const nextStatus = profileStatusAfterSubmit(profileStatus)
  if (nextStatus !== profileStatus) {
    await db.from('profiles').update({ status: nextStatus }).eq('id', profile.id)
  }

  return Response.json({ ok: true, application_id: applicationId, status: nextStatus })
}
