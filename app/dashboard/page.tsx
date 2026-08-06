import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeAuthLane, type AuthLane } from '@/lib/roleLanes'
import { normalizeVertical } from '@/lib/platformConfig'
import DashboardClient from './client'

// Force dynamic rendering — this page reads cookies, Clerk auth, and
// Supabase on every request. Never cache the HTML so the browser always
// gets the latest JS chunk URLs after a deploy; otherwise Cloudflare's
// edge cache can serve a stale page referencing old chunk URLs, causing
// the admin sidebar to show pre-deploy navigation items.
export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

// Build-version meta tag is read by admin.jsx on mount to detect stale JS
// chunks after a deploy. Must match the BUILD_VERSION constant in admin.jsx.
export const metadata = {
  other: { 'build-version': '2026-06-08' },
}

const SUPPORT_DASHBOARD_URL = 'https://support.yousafeconsultancy.com/dashboard'
type DashboardRole = AuthLane | 'admin'

function normalizeDashboardRole(value: unknown): DashboardRole {
  return value === 'admin' ? 'admin' : normalizeAuthLane(value)
}

async function getClerkUserData(userId: string): Promise<{ email: string; fullName: string; requestedRole: DashboardRole | null }> {
  // Prefer Clerk's server SDK. It uses the verified session context and is
  // more reliable than the REST fallback during Clerk key rotation or a
  // transient API failure. In particular, losing this lookup must never
  // turn a known admin email into a newly-created client profile.
  try {
    const clerk = await currentUser()
    if (clerk && clerk.id === userId) {
      const email =
        clerk.emailAddresses.find((entry) => entry.id === clerk.primaryEmailAddressId)?.emailAddress
        ?? clerk.emailAddresses[0]?.emailAddress
        ?? ''
      const metadata = (clerk.unsafeMetadata ?? {}) as Record<string, unknown>
      const metadataRole = metadata.requestedRole ?? metadata.role
      return {
        email,
        fullName: [clerk.firstName, clerk.lastName].filter(Boolean).join(' '),
        requestedRole: metadataRole ? normalizeDashboardRole(metadataRole) : null,
      }
    }
  } catch {
    // Fall through to the REST lookup for older Clerk runtime configurations.
  }

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
      requestedRole: metadataRole ? normalizeDashboardRole(metadataRole) : null,
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
  // Admin is a valid dashboard intent, but it is only a recovery hint.
  // We never provision an admin profile from a URL; an existing admin row
  // must be found by the verified Clerk identity/email below.
  let requestedRole: DashboardRole = normalizeDashboardRole(params.lane)
  // SignUpClient writes `ys_requested_lane` as a SameSite=Lax cookie
  // before kicking off OAuth. That cookie survives every Clerk
  // round-trip mode (popup, top-level redirect, new tab) and is the
  // only durable signal we have when both Clerk's unsafeMetadata AND
  // the `?lane=` query string are lost across the OAuth callback.
  // Prefer it over the URL hint so a stale URL can't override a fresh
  // sign-up attempt — but still allow the URL value to win when the
  // cookie hasn't been set (existing users, deep links, etc).
  let cookieLane: AuthLane | null = null
  try {
    const jar = await cookies()
    const raw = jar.get('ys_requested_lane')?.value
    if (raw) {
      const decoded = decodeURIComponent(raw)
      if (decoded && decoded !== 'client') {
        cookieLane = normalizeAuthLane(decoded)
      }
    }
  } catch { /* cookies() can throw in some prerendering contexts; non-fatal */ }
  if (cookieLane && !params.lane) {
    requestedRole = cookieLane
  }
  // Verticals let one portal serve study-abroad consultancy + legal document
  // prep. The wizard on caseworks deep-links here with ?vertical=legal so we
  // can tag the freshly-created profile.
  const requestedVertical = params.vertical ? normalizeVertical(params.vertical) : null
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in/student')

  const db = createSupabaseAdminClient()

  // Fetch profile — try with status column first, fall back without it
  let profile: { id?: string; clerk_user_id?: string | null; role: string; status: string; full_name: string | null; email: string } | null = null

  const { data: full, error: fullErr } = await db
    .from('profiles')
    .select('id, clerk_user_id, role, status, full_name, email')
    .eq('clerk_user_id', userId)
    .single()

  if (full) {
    profile = full
    if (profile.role === 'support' && profile.status === 'active') {
      redirect('/dashboard/support')
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

  if (profile && !params.lane) {
    requestedRole = normalizeDashboardRole(profile.role)
  }

  let clerkData: Awaited<ReturnType<typeof getClerkUserData>> | null = null
  if (!profile) {
    clerkData = await getClerkUserData(userId)
    // Priority chain when there's no profile row yet:
    //   1. Clerk unsafe_metadata.requestedRole (lossy through OAuth)
    //   2. ys_requested_lane cookie (the durable bridge written by
    //      SignUpClient before OAuth — only set when lane !== client)
    //   3. URL `?lane=` hint
    //
    // Clerk's metadata is authoritative WHEN PRESENT, but Google OAuth
    // first-time consent reliably drops it. The cookie picks up that
    // slack: it was set on /sign-up/attorney before the user was
    // redirected away, survives the full OAuth round-trip including
    // popup contexts, and is read here at the very first server
    // render — so the profile is created with role='attorney' on
    // line 1 instead of waiting on a client-side reload bridge.
    if (clerkData.requestedRole) {
      requestedRole = clerkData.requestedRole
    } else if (cookieLane) {
      requestedRole = cookieLane
    }
  }

  // Resolve the verified identity before deciding which profile is canonical.
  // Direct dashboard visits do not carry ?lane=admin, and an auth-provider
  // migration can leave the current Clerk ID attached to a client row while
  // the pre-existing, verified-email-matched row remains the administrator.
  // The admin role is never inferred from a URL or metadata: this branch only
  // selects an already-existing database row whose role is exactly 'admin'.
  if (!clerkData) clerkData = await getClerkUserData(userId)
  if (clerkData?.email && profile?.role !== 'admin') {
    const { data: adminByEmail } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, full_name, email')
      .ilike('email', clerkData.email.trim())
      .eq('role', 'admin')
      .maybeSingle()

    if (adminByEmail) {
      if (profile && profile.id !== adminByEmail.id && profile.clerk_user_id === userId) {
        await db.from('profiles').update({ clerk_user_id: null }).eq('id', profile.id).eq('clerk_user_id', userId)
      }
      const { data: linked } = await db
        .from('profiles')
        .update({ clerk_user_id: userId })
        .eq('id', adminByEmail.id)
        .select('id, clerk_user_id, role, status, full_name, email')
        .single()
      if (linked) profile = linked
    }
  }

  // Hydrate existing profiles from the verified Clerk identity as well as
  // newly-created profiles. A profile row can survive an auth-provider or
  // Clerk-ID change with a blank full_name; without this repair every role
  // falls into the same Student Profile gate even when Clerk has the user's
  // first and last name. Role/status are never inferred or changed here.
  if (profile && (!profile.full_name?.trim() || !profile.email?.trim())) {
    clerkData ??= await getClerkUserData(userId)
    const identityPatch: Record<string, string> = {}
    if (!profile.full_name?.trim() && clerkData.fullName.trim()) {
      identityPatch.full_name = clerkData.fullName.trim()
    }
    if (!profile.email?.trim() && clerkData.email.trim()) {
      identityPatch.email = clerkData.email.trim().toLowerCase()
    }
    if (Object.keys(identityPatch).length > 0) {
      profile = { ...profile, ...identityPatch }
      try {
        const { data: hydrated } = await db
          .from('profiles')
          .update(identityPatch)
          .eq('id', profile.id)
          .select('id, clerk_user_id, role, status, full_name, email')
          .single()
        if (hydrated) profile = hydrated
      } catch {
        // Keep the verified local values for this render even if the
        // best-effort persistence hits a legacy schema or transient DB error.
      }
    }
  }

  if (!profile && clerkData?.email) {
    const { data: existingByEmail } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, full_name, email')
      .ilike('email', clerkData.email.trim())
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

  // An explicit admin sign-in must never silently create a client profile.
  // If the verified Clerk email did not match an existing admin row, send the
  // user back through the admin lane rather than weakening role boundaries.
  if (params.lane === 'admin' && profile?.role !== 'admin') {
    // Never show the student/client profile gate for an admin-lane login.
    // A missing admin row needs operational repair, not a privilege guess.
    redirect('/sign-in/admin?return_to=/dashboard')
  }

  // Profile not in DB yet — create it using real Clerk data
  if (!profile) {
    if (!clerkData) clerkData = await getClerkUserData(userId)
    const defaultStatus =
      requestedRole === 'client' ? 'active'
      : requestedRole === 'attorney' ? 'incomplete'
      : 'pending'
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
        userName={profile.full_name ?? ''}
        userId={userId}
        expectedRole={requestedRole}
        errorState={null}
      />
    )
  }

  if (profile?.role === 'support' && profile.status === 'active') {
    redirect('/dashboard/support')
  }

  const role = profile?.role ?? 'client'
  const status = profile?.status ?? 'active'

  return <DashboardClient role={role} status={status} userName={profile?.full_name ?? ''} userId={userId} expectedRole={null} errorState={null} />
}
