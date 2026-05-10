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

  const { data: attorney } = await db
    .from('attorneys')
    .select('id')
    .eq('profile_id', profile.id)
    .single()

  if (!attorney) return { error: 'Attorney record missing.', status: 404 }

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
