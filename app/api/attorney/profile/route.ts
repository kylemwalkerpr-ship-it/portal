import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'


export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  const db = createSupabaseAdminClient()

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, email, full_name, role, status')
    .eq('clerk_user_id', userId)
    .single()

  if (profileErr || !profile) return Response.json({ error: 'Profile not found.' }, { status: 404 })
  if (profile.role !== 'attorney') return Response.json({ error: 'Not an attorney account.' }, { status: 403 })

  const [{ data: attorney }, { data: application }] = await Promise.all([
    db
      .from('attorneys')
      .select('id, jurisdictions, practice_areas, bio, available, application_id')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    db
      .from('attorney_applications')
      .select('id, credential_type, jurisdictions, bar_number, practice_areas, malpractice_insurance, profile_url, capacity, notes, phone, status, created_at, decided_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return Response.json({
    profile: { id: profile.id, email: profile.email, full_name: profile.full_name, status: profile.status },
    attorney: attorney ?? null,
    application: application ?? null,
  })
}
