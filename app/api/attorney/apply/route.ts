import { NextResponse } from 'next/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'


type ApplyBody = {
  full_name?: string
  phone?: string
  credential_type?: string
  jurisdictions?: string
  bar_number?: string
  practice_areas?: string
  malpractice_insurance?: string
  profile_url?: string
  capacity?: string
  notes?: string
}

const REQUIRED_FIELDS: (keyof ApplyBody)[] = [
  'full_name',
  'credential_type',
  'jurisdictions',
  'bar_number',
  'practice_areas',
  'malpractice_insurance',
  'profile_url',
  'capacity',
]

function clean(value: unknown, max = 1000): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

export async function POST(req: Request) {
  const userId = await getClerkUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })

  let body: ApplyBody
  try {
    body = (await req.json()) as ApplyBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const fields = {
    full_name: clean(body.full_name, 200),
    phone: clean(body.phone, 60),
    credential_type: clean(body.credential_type, 120),
    jurisdictions: clean(body.jurisdictions, 500),
    bar_number: clean(body.bar_number, 120),
    practice_areas: clean(body.practice_areas, 500),
    malpractice_insurance: clean(body.malpractice_insurance, 500),
    profile_url: clean(body.profile_url, 500),
    capacity: clean(body.capacity, 200),
    notes: clean(body.notes, 4000),
  }

  for (const f of REQUIRED_FIELDS) {
    if (!fields[f]) return NextResponse.json({ error: `${f.replace(/_/g, ' ')} is required.` }, { status: 400 })
  }

  const db = createSupabaseAdminClient()

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, email, role, status')
    .eq('clerk_user_id', userId)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }
  if (profile.role !== 'attorney') {
    return NextResponse.json({ error: 'This account is not an attorney account.' }, { status: 403 })
  }
  if (profile.status === 'active') {
    return NextResponse.json({ error: 'Application already approved.' }, { status: 409 })
  }

  const { error: insertErr } = await db.from('attorney_applications').insert({
    profile_id: profile.id,
    email: profile.email,
    full_name: fields.full_name,
    phone: fields.phone || null,
    credential_type: fields.credential_type,
    jurisdictions: fields.jurisdictions,
    bar_number: fields.bar_number,
    practice_areas: fields.practice_areas,
    malpractice_insurance: fields.malpractice_insurance,
    profile_url: fields.profile_url,
    capacity: fields.capacity,
    notes: fields.notes || null,
    status: 'pending',
  })

  if (insertErr) {
    console.error('[attorney/apply] insert failed', insertErr.message)
    return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
  }

  await db.from('profiles').update({ status: 'pending', full_name: fields.full_name }).eq('id', profile.id)

  return NextResponse.json({ ok: true }, { status: 200 })
}
