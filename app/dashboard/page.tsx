import { redirect } from 'next/navigation'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import DashboardClient from './client'

export default async function DashboardPage() {
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in')

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, status, full_name, email')
    .eq('clerk_user_id', userId)
    .single()

  // Auto-create profile if first visit from portal
  if (!profile) {
    await db.from('profiles').insert({ clerk_user_id: userId, email: '', role: 'client' })
  }

  const role = profile?.role ?? 'client'
  const status = profile?.status ?? 'active'

  return <DashboardClient role={role} status={status} userName={profile?.full_name ?? profile?.email ?? ''} userId={userId} />
}
