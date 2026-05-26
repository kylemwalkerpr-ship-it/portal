import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'
import { clerkClient } from '@clerk/nextjs/server'

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
    .select('id, clerk_user_id, role, status, email, full_name')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error) return { error: error.message, status: 500 }
  if (!profile) return { error: 'Profile not found.', status: 404 }
  if (profile.status && profile.status !== 'active') return { error: 'Account is not active.', status: 403 }

  // Resolve email from Clerk if missing in the profiles row and backfill silently
  if (!profile.email) {
    try {
      const client = await clerkClient()
      const clerkUser = await client.users.getUser(clerkUserId)
      const clerkEmail =
        clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
        clerkUser.emailAddresses[0]?.emailAddress ||
        ''
      if (clerkEmail) {
        profile.email = clerkEmail
        void db.from('profiles').update({ email: clerkEmail }).eq('id', profile.id)
      }
    } catch { /* Clerk unavailable — proceed without email */ }
  }

  // Normalize legacy 'student' role to 'client'. The student dashboard
  // UI labels these users as "Student" but every downstream API check
  // (offers/accept, payments/charge, saved-gigs, checkout/order, etc.)
  // is written as `auth.role !== 'client'`. Without this normalisation,
  // older profiles provisioned with role='student' hit a cascade of
  // 403s on the dashboard (saved-gigs, balance, attorney-chats, etc.).
  // 'client' and 'student' represent the same buyer persona at the
  // back-end level; sellers (attorney/consultant) and admins still
  // travel through unchanged.
  const normalisedRole = profile.role === 'student' ? 'client' : String(profile.role || '')
  return { db, profile, profileId: profile.id, role: normalisedRole }
}

export async function requireAdminUser() {
  const ctx = await requirePortalUser()
  if ('error' in ctx) return ctx
  if (ctx.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return ctx
}

/**
 * Optional auth — returns the user context if signed in, null otherwise.
 * Never redirects. Use for public pages that want personalization when
 * the visitor happens to be logged in.
 */
export async function getOptionalPortalUser(): Promise<PortalUserContext | null> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return null

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, clerk_user_id, role, status, email, full_name')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !profile) return null
  if (profile.status && profile.status !== 'active') return null

  // Same student → client normalisation as requirePortalUser. Keeps
  // downstream `auth.role !== 'client'` checks working for both.
  const normalisedRole = profile.role === 'student' ? 'client' : String(profile.role || '')
  return { db, profile, profileId: profile.id, role: normalisedRole }
}
