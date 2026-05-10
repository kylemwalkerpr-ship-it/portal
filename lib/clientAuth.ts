import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type ClientContext = {
  db: ReturnType<typeof createSupabaseAdminClient>
  profileId: string
  email: string
  fullName: string | null
}

export async function requireClient(): Promise<{ ctx?: ClientContext; error?: string; status?: number }> {
  const userId = await getClerkUserId()
  if (!userId) return { error: 'Unauthenticated.', status: 401 }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) return { error: 'Profile not found.', status: 404 }
  if (profile.role !== 'client' || profile.status !== 'active') {
    return { error: 'Client account not active.', status: 403 }
  }

  return {
    ctx: {
      db,
      profileId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
    },
  }
}
