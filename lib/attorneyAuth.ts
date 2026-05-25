import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type AttorneyContext = {
  db: ReturnType<typeof createSupabaseAdminClient>
  profileId: string
  attorneyId: string
  email: string
  fullName: string | null
}

export async function requireAttorney(): Promise<{ ctx?: AttorneyContext; error?: string; status?: number }> {
  const userId = await getClerkUserId()
  if (!userId) return { error: 'Unauthenticated.', status: 401 }

  const db = createSupabaseAdminClient()

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) return { error: 'Profile not found.', status: 404 }
  if (profile.role !== 'attorney' || profile.status !== 'active') {
    return { error: 'Attorney account not active.', status: 403 }
  }

  let { data: attorney } = await db
    .from('attorneys')
    .select('id')
    .eq('profile_id', profile.id)
    .maybeSingle()

  // Self-heal: if the profile is active but the attorneys row is missing
  // (manual DB activation that bypassed the approve flow, or a partial
  // failure in the approve-application transaction), create it on first
  // read rather than locking the dashboard out with "Attorney record missing".
  if (!attorney) {
    const { data: application } = await db
      .from('attorney_applications')
      .select('id, jurisdictions, practice_areas')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: created, error: createErr } = await db
      .from('attorneys')
      .insert({
        profile_id: profile.id,
        application_id: application?.id ?? null,
        jurisdictions: application?.jurisdictions ?? null,
        practice_areas: application?.practice_areas ?? null,
      })
      .select('id')
      .single()

    if (createErr || !created) {
      console.error('[attorneyAuth] self-heal failed', createErr?.message)
      return { error: 'Attorney record missing.', status: 404 }
    }
    attorney = created
  }

  return {
    ctx: {
      db,
      profileId: profile.id,
      attorneyId: attorney.id,
      email: profile.email,
      fullName: profile.full_name,
    },
  }
}
