import { redirect } from 'next/navigation'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeVertical } from '@/lib/platformConfig'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import { findOrLinkProfile, isProviderRole, mirrorProfileToClerk, type ProfileRow } from '@/lib/auth/roles'
import { PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { CHANGE_PASSWORD_PATH } from '@/lib/auth/mustChangePassword'
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

async function latestApplicationStatus(
  db: ReturnType<typeof createSupabaseAdminClient>,
  role: string,
  profileId: string,
): Promise<string | null> {
  const table = role === 'consultant' ? 'consultant_applications' : role === 'attorney' ? 'attorney_applications' : null
  if (!table) return null
  try {
    const { data } = await db
      .from(table)
      .select('status')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as { status?: string } | null)?.status ?? null
  } catch {
    return null
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
        applicationStatus={null}
        errorState
      />
    )
  }
}

/**
 * The dashboard renders by the DATABASE role only. The retired `?lane=`
 * parameter, the `ys_requested_lane` cookie and Clerk `unsafeMetadata` are no
 * longer role inputs, and a "wrong lane" no longer signs the user out (that
 * sign-in/sign-out switch was a Cloudflare 1102 amplifier). A signed-in user
 * without a profile is sent to /onboarding to choose a role.
 */
async function renderDashboardPage(searchParams: Promise<{ lane?: string; vertical?: string }>) {
  const params = await searchParams
  const requestedVertical = params.vertical ? normalizeVertical(params.vertical) : null
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in')

  const identity = await getVerifiedClerkIdentity(userId)

  // App-level forced password change (works even before the session-token
  // claim is configured in the Clerk dashboard). Flag absent -> no-op.
  if (identity?.mustChangePassword) {
    redirect(`${CHANGE_PASSWORD_PATH}?return_to=${encodeURIComponent(`${PORTAL_ORIGIN}/dashboard`)}`)
  }

  const db = createSupabaseAdminClient()
  let profile: ProfileRow | null = await findOrLinkProfile(db, userId, identity?.email)

  // Admin recovery: the admin role is never inferred from a URL or metadata;
  // this only re-selects an already-existing row whose role is exactly
  // 'admin' and whose email matches the VERIFIED Clerk email.
  if (identity?.email && profile?.role !== 'admin') {
    const { data: adminByEmail } = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, full_name, email, username')
      .ilike('email', identity.email)
      .eq('role', 'admin')
      .maybeSingle()
    if (adminByEmail && adminByEmail.id !== profile?.id) {
      const { data: linked } = await db
        .from('profiles')
        .update({ clerk_user_id: userId })
        .eq('id', adminByEmail.id)
        .select('id, clerk_user_id, role, status, full_name, email, username')
        .single()
      if (linked) profile = linked as ProfileRow
    }
  }

  if (!profile) {
    const onboarding = new URL('/onboarding', PORTAL_ORIGIN)
    const destination = new URL('/dashboard', PORTAL_ORIGIN)
    if (requestedVertical) {
      destination.searchParams.set('vertical', requestedVertical)
      onboarding.searchParams.set('vertical', requestedVertical)
    }
    onboarding.searchParams.set('return_to', destination.toString())
    redirect(onboarding.toString())
  }

  // Hydrate blank identity fields from the verified Clerk identity. Role and
  // status are never inferred or changed here.
  if (identity && (!profile.full_name?.trim() || !profile.email?.trim())) {
    const identityPatch: Record<string, string> = {}
    if (!profile.full_name?.trim() && identity.fullName) identityPatch.full_name = identity.fullName
    if (!profile.email?.trim() && identity.email) identityPatch.email = identity.email
    if (Object.keys(identityPatch).length > 0) {
      profile = { ...profile, ...identityPatch }
      try {
        await db.from('profiles').update(identityPatch).eq('id', profile.id)
      } catch {
        // best-effort
      }
    }
  }

  if (requestedVertical) {
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

  // Keep Clerk publicMetadata (and therefore the session-token role claim) in
  // step with the DB. Only fires when they differ; 1.5 s cap; never throws.
  if (identity && (identity.publicRole !== profile.role || identity.publicStatus !== (profile.status ?? 'active'))) {
    await mirrorProfileToClerk(userId, { role: profile.role, status: profile.status ?? 'active' })
  }

  if (profile.role === 'support' && profile.status === 'active') {
    redirect('/dashboard/support')
  }

  const role = profile.role ?? 'client'
  const status = profile.status ?? 'active'

  // One provider application for attorneys, regulated advisers and
  // consultants. A provider who has not applied yet goes to it (this replaces
  // the consultant "Application Under Review" dead end that had no
  // application behind it).
  let applicationStatus: string | null = null
  if (isProviderRole(role) && status !== 'active') {
    applicationStatus = await latestApplicationStatus(db, role, profile.id)
    const needsApplication = status === 'incomplete' || (status === 'pending' && !applicationStatus)
    if (needsApplication) {
      redirect(`/onboarding/provider?type=${role === 'consultant' ? 'consultant' : 'attorney'}`)
    }
  }

  return (
    <DashboardClient
      role={role}
      status={status}
      userName={profile.full_name ?? ''}
      userId={userId}
      expectedRole={null}
      applicationStatus={applicationStatus}
      errorState={null}
    />
  )
}
