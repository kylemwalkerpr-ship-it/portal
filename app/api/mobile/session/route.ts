import { verifyMobileBearer } from '@/lib/mobileAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * POST /api/mobile/session
 *
 * Native-app session resolver. Reads `Authorization: Bearer <Clerk session
 * JWT>`, verifies it, and returns the caller's portal profile in an envelope
 * the iOS app maps straight into `Profile`.
 *
 * Cookieless by design — the native app does not share the browser's Clerk
 * cookies, so this route must not rely on getClerkUserId()/cookie auth.
 * Missing/invalid tokens are 401 (not the `{ profile: null }` shape used by
 * the cookie-based GET /api/profile).
 */
export async function POST(req: Request) {
  const authResult = await verifyMobileBearer(req.headers.get('authorization'))
  if (authResult.status !== 'authenticated') {
    const message =
      authResult.reason === 'missing'
        ? 'Missing session token. User must sign in.'
        : 'Invalid session token. User must sign in.'
    return Response.json({ error: { message }, signInRequired: true }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  let { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name, country_code, phone')
    .eq('clerk_user_id', authResult.userId)
    .single()

  // Self-heal: country_code / phone columns may not exist in every
  // environment yet — retry with the base column set, same as GET /api/profile.
  if (error && /column .*(country_code|phone)/i.test(error.message || '')) {
    const retry = await db
      .from('profiles')
      .select('id, role, status, email, full_name')
      .eq('clerk_user_id', authResult.userId)
      .single()
    profile = retry.data as typeof profile
    error = retry.error
  }

  if (error || !profile) {
    return Response.json({ error: { message: 'Profile not found.' } }, { status: 404 })
  }

  return Response.json({
    data: {
      id: profile.id,
      role: profile.role,
      status: profile.status,
      email: profile.email,
      full_name: profile.full_name,
      country_code: profile.country_code ?? '',
      phone: profile.phone ?? null,
    },
  })
}
