import { createSupabaseAdminClient } from './supabase'

export async function isActiveClient(clerkUserId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  return profile?.role === 'client' && profile.status === 'active'
}
