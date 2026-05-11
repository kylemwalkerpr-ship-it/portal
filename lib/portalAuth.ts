import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type PortalUserContext = {
  db: ReturnType<typeof createSupabaseAdminClient>
  profile: Record<string, any>
  profileId: string
  role: string
}

export async function requirePortalUser(): Promise<
  | PortalUserContext
  | { error: string; status: 401 | 403 | 404 | 500 }
> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 }

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error) return { error: error.message, status: 500 }
  if (!profile) return { error: 'Profile not found.', status: 404 }
  if (profile.status && profile.status !== 'active') return { error: 'Account is not active.', status: 403 }

  return { db, profile, profileId: profile.id, role: String(profile.role || '') }
}

export async function requireAdminUser() {
  const ctx = await requirePortalUser()
  if ('error' in ctx) return ctx
  if (ctx.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return ctx
}
