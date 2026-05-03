import { redirect } from 'next/navigation'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import DashboardClient from './client'

async function getClerkUserData(userId: string): Promise<{ email: string; fullName: string }> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return { email: '', fullName: '' }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!res.ok) return { email: '', fullName: '' }
    const user = await res.json()
    const email = user.email_addresses?.[0]?.email_address ?? ''
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return { email, fullName }
  } catch {
    return { email: '', fullName: '' }
  }
}

export default async function DashboardPage() {
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in')

  const db = createSupabaseAdminClient()
  const { data: existing, error } = await db
    .from('profiles')
    .select('role, status, full_name, email')
    .eq('clerk_user_id', userId)
    .single()

  if (error) console.error('[dashboard] profile fetch error:', error.message)

  let profile = existing

  if (!profile) {
    const { email, fullName } = await getClerkUserData(userId)
    const { data: created } = await db
      .from('profiles')
      .upsert(
        { clerk_user_id: userId, email, full_name: fullName || null, role: 'client', status: 'active' },
        { onConflict: 'clerk_user_id' }
      )
      .select('role, status, full_name, email')
      .single()
    profile = created
  }

  const role = profile?.role ?? 'client'
  const status = profile?.status ?? 'active'

  return <DashboardClient role={role} status={status} userName={profile?.full_name ?? profile?.email ?? ''} userId={userId} />
}
