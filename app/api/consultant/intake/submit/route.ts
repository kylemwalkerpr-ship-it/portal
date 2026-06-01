/**
 * POST /api/consultant/intake/submit
 * Final-step submit for the consultant intake wizard. Inserts a
 * consultant_applications row (status=pending) and flips the profile to
 * status='pending' so the new admin-review gate has effect. Idempotent: if
 * an application already exists for this profile we update it in place rather
 * than creating a duplicate, so re-submits don't pollute the queue.
 */
import { getCurrentConsultant } from '@/lib/consultant'

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

  const payload = {
    profile_id: profile.id,
    email: profile.email,
    full_name: profile.full_name || profile.email,
    phone: cleanStr(body.phone, 60),
    consultant_type: consultantType,
    jurisdictions: cleanStr(body.jurisdictions, 400),
    registration_number: cleanStr(body.registration_number, 120),
    specialties: cleanArr(body.specialties, 30, 80).length
      ? cleanArr(body.specialties, 30, 80)
      : fallbackSpecialties,
    malpractice_insurance: cleanStr(body.malpractice_insurance, 400),
    profile_url: cleanStr(body.profile_url, 400),
    capacity: cleanStr(body.capacity, 200),
    notes: cleanStr(body.notes, 2000),
    status: 'pending',
  }

  // Look for an existing application for this profile; if one exists and is
  // still pending (or waitlist), refresh it in place; otherwise insert a new
  // one so the admin sees a fresh review row.
  const { data: existing } = await db
    .from('consultant_applications')
    .select('id, status')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let applicationId: string | null = null
  if (existing && (existing.status === 'pending' || existing.status === 'waitlist')) {
    const { data, error } = await db
      .from('consultant_applications')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    applicationId = data?.id ?? null
  } else {
    const { data, error } = await db
      .from('consultant_applications')
      .insert(payload)
      .select('id')
      .single()
    if (error) {
      // Self-heal: if the table is missing, return a friendly error rather
      // than crashing the wizard.
      if (/relation .* does not exist/i.test(error.message || '')) {
        return Response.json({ error: 'Consultant applications table not provisioned yet. Contact admin.' }, { status: 503 })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }
    applicationId = data?.id ?? null
  }

  // Gate the profile until the admin reviews. The wizard previously left
  // profile.status untouched (or 'active' on legacy sign-ups); we flip it to
  // 'pending' so the consultant cannot transact while review is in flight.
  // Already-active consultants (re-applying) get the same gate.
  await db.from('profiles').update({ status: 'pending' }).eq('id', profile.id)

  return Response.json({ ok: true, application_id: applicationId, status: 'pending' })
}
