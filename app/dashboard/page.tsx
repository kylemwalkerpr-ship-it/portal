import { redirect } from 'next/navigation'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeAuthLane, type AuthLane } from '@/lib/roleLanes'
import { normalizeVertical } from '@/lib/platformConfig'
import DashboardClient from './client'

const SUPPORT_DASHBOARD_URL = 'https://support.yousafeconsultancy.com/dashboard'

async function getClerkUserData(userId: string): Promise<{ email: string; fullName: string; requestedRole: AuthLane | null }> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return { email: '', fullName: '', requestedRole: null }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!res.ok) return { email: '', fullName: '', requestedRole: null }
    const user = await res.json()
    const email = user.email_addresses?.[0]?.email_address ?? ''
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    const metadataRole = user.unsafe_metadata?.requestedRole ?? user.unsafe_metadata?.role
    return {
      email,
      fullName,
      requestedRole: metadataRole ? normalizeAuthLane(metadataRole) : null,
    }
  } catch {
    return { email: '', fullName: '', requestedRole: null }
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lane?: string; vertical?: string }>
}) {
  try {
    return await renderDashboardPage(searchParams)
  } catch (error) {
    const digest = typeof error === 'object' && error && 'digest' in error ? String(error.digest) : ''
    if (digest.startsWith('NEXT_REDIRECT') || digest === 'DYNAMIC_SERVER_USAGE') throw error

    console.error('[dashboard] account recovery fallback', error)
    return (
      <DashboardClient
        role="client"
        status="active"
        userName=""
        userId=""
        expectedRole={null}
        errorState
      />
    )
  }
}

async function renderDashboardPage(searchParams: Promise<{ lane?: string; vertical?: string }>) {
  const params = await searchParams
  let requestedRole = normalizeAuthLane(params.lane)
  // Verticals let one portal serve study-abroad consultancy + legal document
  // prep. The wizard on caseworks deep-links here with ?vertical=legal so we
  // can tag the freshly-created profile.
  const requestedVertical = params.vertical ? normalizeVertical(params.vertical) : null
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in/student')

  const db = createSupabaseAdminClient()
  const clerkData = await getClerkUserData(userId)
  requestedRole = params.lane ? requestedRole : clerkData.requestedRole ?? requestedRole

  // Fetch profile — try with status column first, fall back without it
  let profile: { id?: string; clerk_user_id?: string | null; role: string; status: string; full_name: string | null; email: string } | null = null

  if (clerkData.email) {
    const { data: existingByEmail } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, full_name, email')
      .eq('email', clerkData.email)
      .maybeSingle()

    if (existingByEmail) {
      const shouldRelink =
        existingByEmail.clerk_user_id !== userId &&
        (existingByEmail.role === requestedRole || existingByEmail.role === 'admin')

      if (shouldRelink) {
        const { data: linked } = await db
          .from('profiles')
          .update({ clerk_user_id: userId })
          .eq('id', existingByEmail.id)
          .select('id, clerk_user_id, role, status, full_name, email')
          .single()

        profile = linked ?? existingByEmail
      } else {
        profile = existingByEmail
      }
    }
  }

  if (!profile) {
    const { data: full, error: fullErr } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, full_name, email')
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
        .select('id, clerk_user_id, role, full_name, email')
        .eq('clerk_user_id', userId)
        .single()
      if (basic) profile = { ...basic, status: 'active' }
      else if (fullErr) console.error('[dashboard] fetch error:', fullErr.message)
    }
  }

  // Profile not in DB yet — create it using real Clerk data
  if (!profile) {
    const defaultStatus = requestedRole === 'client' ? 'active' : 'pending'
    const baseRow: Record<string, unknown> = {
      clerk_user_id: userId,
      email: clerkData.email,
      full_name: clerkData.fullName || null,
      role: requestedRole,
      status: defaultStatus,
    }
    if (requestedVertical) baseRow.vertical = requestedVertical

    let createResult = await db
      .from('profiles')
      .upsert(baseRow, { onConflict: 'clerk_user_id' })
      .select('role, status, full_name, email')
      .single()

    // Older databases may not have status / vertical columns yet — peel them
    // off and retry until we land on a payload that fits the live schema.
    if (createResult.error && /column .*vertical/i.test(createResult.error.message)) {
      const { vertical: _v, ...row } = baseRow
      createResult = await db
        .from('profiles')
        .upsert(row, { onConflict: 'clerk_user_id' })
        .select('role, status, full_name, email')
        .single()
    }
    if (createResult.error && /column .*status/i.test(createResult.error.message)) {
      const { status: _s, vertical: _v, ...row } = baseRow
      const fallback = await db
        .from('profiles')
        .upsert(row, { onConflict: 'clerk_user_id' })
        .select('role, full_name, email')
        .single()
      if (fallback.data) {
        profile = { ...fallback.data, status: 'active' }
      } else {
        console.error('[dashboard] profile create error:', fallback.error?.message)
      }
    } else if (createResult.data) {
      profile = createResult.data
    } else if (createResult.error) {
      console.error('[dashboard] profile create error:', createResult.error.message)
    }
  } else if (requestedVertical) {
    // Existing profile arriving with ?vertical=legal — promote them to that
    // vertical so the storefront knows which catalogue they belong to. Soft
    // update; ignore failures (column may not exist yet).
    db
      .from('profiles')
      .update({ vertical: requestedVertical })
      .eq('id', profile.id)
      .then(({ error }) => {
        if (error && !/column .*vertical/i.test(error.message)) {
          console.error('[dashboard] vertical update error:', error.message)
        }
      })
  }

  if (profile && profile.role !== 'admin' && profile.role !== requestedRole) {
    return (
      <DashboardClient
        role={profile.role}
        status={profile.status ?? 'active'}
        userName={profile.full_name ?? profile.email ?? ''}
        userId={userId}
        expectedRole={requestedRole}
        errorState={null}
      />
    )
  }

  if (profile?.role === 'support' && profile.status === 'active') {
    redirect(SUPPORT_DASHBOARD_URL)
  }

  const role = profile?.role ?? 'client'
  const status = profile?.status ?? 'active'

  return <DashboardClient role={role} status={status} userName={profile?.full_name ?? profile?.email ?? ''} userId={userId} expectedRole={null} errorState={null} />
}
