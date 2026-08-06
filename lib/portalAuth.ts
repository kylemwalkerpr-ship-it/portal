import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'
import { clerkClient } from '@clerk/nextjs/server'
import { headers as nextHeaders } from 'next/headers'
import { extractCountryFromRequest } from './countryDetection'

export type PortalUserContext = {
  db: ReturnType<typeof createSupabaseAdminClient>
  profile: Record<string, any>
  profileId: string
  role: string
}

// Cached probe so we don't repeatedly issue UPDATEs that hit a "column does
// not exist" error in environments where the country migration hasn't been
// run yet. Re-checks once per worker isolate, which is sufficient because
// schema changes prompt a redeploy.
let COUNTRY_COLUMNS_AVAILABLE: boolean | null = null

/**
 * Best-effort backfill of `country_code` from the current request's
 * `cf-ipcountry` header. Runs lazily on the first authed call once we know
 * the profile exists. Never throws — a partially-migrated DB (no
 * country_code column) is detected and remembered so subsequent calls skip
 * the update entirely.
 */
async function backfillCountryFromIp(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profile: Record<string, any>,
): Promise<void> {
  if (COUNTRY_COLUMNS_AVAILABLE === false) return
  if (profile.country_code) return

  let detected: string | null = null
  try {
    const hdrs = await nextHeaders()
    detected = extractCountryFromRequest(hdrs as any)
  } catch {
    // headers() can throw outside a request scope — silently bail.
    return
  }
  if (!detected) return

  const { error } = await db
    .from('profiles')
    .update({ country_code: detected, country_source: 'ip' })
    .eq('id', profile.id)
    .is('country_code', null)

  if (error) {
    if (/column .*(country_code|country_source).*does not exist/i.test(error.message || '')) {
      COUNTRY_COLUMNS_AVAILABLE = false
    }
    return
  }
  COUNTRY_COLUMNS_AVAILABLE = true
  profile.country_code = detected
  profile.country_source = 'ip'
}

export async function requirePortalUser(): Promise<
  | PortalUserContext
  | { error: string; status: 401 | 403 | 404 | 500 }
> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 }

  const db = createSupabaseAdminClient()
  let profileRes = await db
    .from('profiles')
    .select('id, clerk_user_id, role, status, email, full_name, country_code, country_source')
    .eq('clerk_user_id', clerkUserId)
    .single()

  // Self-heal for environments that haven't run the country migration yet —
  // fall back to the legacy SELECT so existing endpoints keep working.
  if (profileRes.error && /column .*(country_code|country_source)/i.test(profileRes.error.message || '')) {
    COUNTRY_COLUMNS_AVAILABLE = false
    profileRes = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, email, full_name')
      .eq('clerk_user_id', clerkUserId)
      .single()
  }
  let { data: profile, error } = profileRes

  // Verified Clerk identity recovery for stale profile links. Admin deep links
  // and protected API routes use requirePortalUser directly, so they cannot
  // rely on the dashboard page's separate recovery path. If a profile's
  // clerk_user_id changed but its verified email is unchanged, relink that
  // existing row. Never promote a role or create an admin from a URL; only an
  // already-existing profile row is eligible for this repair.
  if ((!profile || error) && clerkUserId) {
    try {
      const clerk = await clerkClient()
      const clerkUser = await clerk.users.getUser(clerkUserId)
      const clerkEmail = (
        clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress
        ?? ''
      ).trim().toLowerCase()

      if (clerkEmail) {
        const byEmail = await db
          .from('profiles')
          .select('id, clerk_user_id, role, status, email, full_name, country_code, country_source')
          .ilike('email', clerkEmail)
          .maybeSingle()

        if (byEmail.data && (!byEmail.data.clerk_user_id || byEmail.data.clerk_user_id === clerkUserId)) {
          if (!byEmail.data.clerk_user_id) {
            const linked = await db
              .from('profiles')
              .update({ clerk_user_id: clerkUserId })
              .eq('id', byEmail.data.id)
              .is('clerk_user_id', null)
              .select('id, clerk_user_id, role, status, email, full_name, country_code, country_source')
              .single()
            profile = linked.data ?? byEmail.data
            error = linked.error
          } else {
            profile = byEmail.data
            error = null
          }
        }
      }
    } catch (recoveryError) {
      console.error('[portalAuth] verified email recovery failed:', recoveryError)
    }
  }

  if (error) return { error: error.message, status: 500 }
  if (!profile) return { error: 'Profile not found.', status: 404 }
  if (profile.status && profile.status !== 'active') return { error: 'Account is not active.', status: 403 }

  // Fire-and-forget country backfill on the first authed hit. Awaited so the
  // in-memory `profile` object reflects the new code before downstream
  // callers read it, but errors never propagate.
  await backfillCountryFromIp(db, profile)

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
  let profileRes = await db
    .from('profiles')
    .select('id, clerk_user_id, role, status, email, full_name, country_code, country_source')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profileRes.error && /column .*(country_code|country_source)/i.test(profileRes.error.message || '')) {
    profileRes = await db
      .from('profiles')
      .select('id, clerk_user_id, role, status, email, full_name')
      .eq('clerk_user_id', clerkUserId)
      .single()
  }
  const { data: profile, error } = profileRes

  if (error || !profile) return null
  if (profile.status && profile.status !== 'active') return null

  // Same student → client normalisation as requirePortalUser. Keeps
  // downstream `auth.role !== 'client'` checks working for both.
  const normalisedRole = profile.role === 'student' ? 'client' : String(profile.role || '')
  return { db, profile, profileId: profile.id, role: normalisedRole }
}
