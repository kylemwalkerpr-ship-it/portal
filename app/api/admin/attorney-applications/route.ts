import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'


async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, adminProfileId: profile.id }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.db
    .from('attorney_applications')
    .select('id, profile_id, email, full_name, phone, credential_type, jurisdictions, bar_number, practice_areas, malpractice_insurance, profile_url, capacity, notes, status, decided_at, decision_notes, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ applications: data ?? [] })
}
