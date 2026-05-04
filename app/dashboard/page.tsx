import { redirect } from 'next/navigation'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import DashboardClient from './client'

const SUPPORT_DASHBOARD_URL = 'https://support.yousafeconsultancy.com/dashboard'

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

  // Fetch profile — try with status column first, fall back without it
  let profile: { role: string; status: string; full_name: string | null; email: string } | null = null

  const { data: full, error: fullErr } = await db
    .from('profiles')
    .select('role, status, full_name, email')
    .eq('clerk_user_id', userId)
    .single()

  if (full) {
    profile = full
    if (profile.role === 'support' && profile.status === 'active') {
      redirect(SUPPORT_DASHBOARD_URL)
    }
  } else {
    // status column may not exist — try without it
    const { data: basic } = await db
      .from('profiles')
      .select('role, full_name, email')
      .eq('clerk_user_id', userId)
      .single()
    if (basic) profile = { ...basic, status: 'active' }
    else if (fullErr) console.error('[dashboard] fetch error:', fullErr.message)
  }

  // Profile not in DB yet — create it using real Clerk data
  if (!profile) {
    const { email, fullName } = await getClerkUserData(userId)

    if (email) {
      const { data: existingByEmail } = await db
        .from('profiles')
        .select('role, status, full_name, email')
        .eq('email', email)
        .maybeSingle()

      if (existingByEmail) {
        profile = {
          role: existingByEmail.role,
          status: existingByEmail.status ?? 'active',
          full_name: existingByEmail.full_name,
          email: existingByEmail.email,
        }
      }
    }

    // Try upsert with status
    const { data: c1 } = profile
      ? { data: null }
      : await db
          .from('profiles')
          .upsert(
            { clerk_user_id: userId, email, full_name: fullName || null, role: 'client', status: 'active' },
            { onConflict: 'clerk_user_id' }
          )
          .select('role, status, full_name, email')
          .single()

    if (c1) {
      profile = c1
    } else if (!profile) {
      // status column missing — upsert without it
      const { data: c2, error: c2Err } = await db
        .from('profiles')
        .upsert(
          { clerk_user_id: userId, email, full_name: fullName || null, role: 'client' },
          { onConflict: 'clerk_user_id' }
        )
        .select('role, full_name, email')
        .single()
      if (c2) profile = { ...c2, status: 'active' }
      else console.error('[dashboard] profile create error:', c2Err?.message)
    }
  }

  if (profile?.role === 'support' && profile.status === 'active') {
    redirect(SUPPORT_DASHBOARD_URL)
  }

  const role = profile?.role ?? 'client'
  const status = profile?.status ?? 'active'

  return <DashboardClient role={role} status={status} userName={profile?.full_name ?? profile?.email ?? ''} userId={userId} />
}
