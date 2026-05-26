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
  // Accept both 'client' and 'student' — legacy provisioning paths
  // labelled buyer profiles 'student'; the UI still does so in the
  // sidebar, but every back-end gate has standardised on 'client'.
  // Without this widening, anyone whose profile row was created via
  // the older sign-up path hits a cascade of 403s on the student
  // dashboard (home, balance, saved-gigs, attorney-chats, etc.) and
  // sees the red "Client account not active." banner above an
  // otherwise functional UI.
  const isBuyer = profile.role === 'client' || profile.role === 'student'
  if (!isBuyer || profile.status !== 'active') {
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
