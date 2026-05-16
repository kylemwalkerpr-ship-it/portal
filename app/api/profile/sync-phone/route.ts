/**
 * POST /api/profile/sync-phone
 *
 * Pulls the signed-in user's current Clerk state and mirrors it into the
 * profiles row immediately. Called by the in-app PhoneVerificationCard
 * after a successful SMS OTP verification so the Settings page reflects
 * the new state without waiting for the next GET (which also syncs).
 *
 * Idempotent — always safe to call. Returns the resulting profile snapshot.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { readClerkSnapshot, mirrorClerkSnapshotToProfile } from '@/lib/clerkSync'

export async function POST() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 })

  const snap = await readClerkSnapshot()
  await mirrorClerkSnapshotToProfile(db, profile.id, snap)

  return Response.json({
    ok: true,
    phone:           snap.primary_phone,
    phone_verified:  snap.phone_verified,
    two_factor:      snap.two_factor,
    totp_enabled:    snap.totp_enabled,
  })
}
