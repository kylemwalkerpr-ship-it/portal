import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type StudentAuth =
  | { error: string; status: 401 | 403 | 404 }
  | { db: ReturnType<typeof createSupabaseAdminClient>; profile: Record<string, any> }

export async function getCurrentStudent(): Promise<StudentAuth> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile) return { error: 'Profile not found', status: 404 }
  if (profile.role !== 'client') return { error: 'Forbidden', status: 403 }
  if (profile.status === 'suspended') return { error: 'Account suspended', status: 403 }

  return { db, profile }
}
