import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const SALUTATIONS = new Set(['', 'Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Dr.', 'Prof.'])

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', userId)
    .single()

  if (error || !profile) return Response.json({ error: 'Profile not found.' }, { status: 404 })
  return Response.json({ profile })
}

export async function PATCH(req: Request) {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const firstName = clean(body.first_name)
  const lastName = clean(body.last_name)
  const salutation = clean(body.salutation, 20)
  const email = clean(body.email, 200).toLowerCase()
  const phone = clean(body.phone, 60)

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) return Response.json({ error: 'Profile not found.' }, { status: 404 })

  if (profile.role !== 'admin') {
    if (!firstName) return Response.json({ error: 'First name is required.' }, { status: 400 })
    if (!lastName) return Response.json({ error: 'Last name is required.' }, { status: 400 })
  }
  if (!SALUTATIONS.has(salutation)) return Response.json({ error: 'Choose a valid salutation.' }, { status: 400 })

  const fullName = [salutation, firstName, lastName].filter(Boolean).join(' ').trim()
  const payload: Record<string, unknown> = {}
  if (fullName) payload.full_name = fullName
  if (email) payload.email = email
  if (phone) payload.phone = phone

  if (Object.keys(payload).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  let result = await db
    .from('profiles')
    .update(payload)
    .eq('id', profile.id)
    .select('id, role, status, email, full_name')
    .single()

  if (result.error && /column .*phone/i.test(result.error.message)) {
    const { phone: _phone, ...fallback } = payload
    result = await db
      .from('profiles')
      .update(fallback)
      .eq('id', profile.id)
      .select('id, role, status, email, full_name')
      .single()
  }

  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  return Response.json({ profile: result.data })
}
