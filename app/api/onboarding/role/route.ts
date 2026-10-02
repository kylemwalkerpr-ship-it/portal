/**
 * POST /api/onboarding/role  { role: 'client' }
 *
 * Self-service role selection for a brand-new account on /onboarding. Only the
 * client role can be self-assigned; providers go through POST
 * /api/provider/apply (pending -> admin approval). An existing profile is
 * never changed here (DB is the source of truth).
 */
import { NextResponse } from 'next/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import { createProfile, findOrLinkProfile, mirrorProfileToClerk } from '@/lib/auth/roles'
import { normalizeVertical } from '@/lib/platformConfig'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const userId = await getClerkUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { role?: string; vertical?: string }
  if (body.role !== 'client') {
    return NextResponse.json({ error: 'Providers apply via /onboarding/provider.' }, { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const identity = await getVerifiedClerkIdentity(userId)
  const existing = await findOrLinkProfile(db, userId, identity?.email)
  if (existing) {
    return NextResponse.json({ ok: true, role: existing.role, status: existing.status, existing: true })
  }

  const profile = await createProfile(db, {
    clerkUserId: userId,
    email: identity?.email ?? null,
    fullName: identity?.fullName || null,
    role: 'client',
    status: 'active',
    vertical: body.vertical ? normalizeVertical(body.vertical) : null,
  })
  if (!profile) return NextResponse.json({ error: 'Could not create your profile.' }, { status: 500 })
  await mirrorProfileToClerk(userId, { role: 'client', status: 'active' })
  return NextResponse.json({ ok: true, role: 'client', status: 'active' })
}
