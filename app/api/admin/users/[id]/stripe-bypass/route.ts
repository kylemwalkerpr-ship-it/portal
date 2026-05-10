import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

// PATCH /api/admin/users/[id]/stripe-bypass  body: { enabled: boolean }
//
// Flips the `stripe_bypass` flag on the consultant or attorney row that
// matches the given profile id. The bypass lets the panelist work — be
// assigned orders, send paid offers — even before their Stripe Connect
// account is fully verified. The actual transfer still requires Connect; the
// payout will be marked `pending` and ops can complete it once the account
// lands. Use this for whitelisted panelists only.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id: profileId } = await context.params
  const body = await req.json().catch(() => ({}))
  const enabled = Boolean(body?.enabled)

  const { data: profile } = await auth.db
    .from('profiles')
    .select('id, role, email')
    .eq('id', profileId)
    .single()

  if (!profile) return Response.json({ error: 'User not found.' }, { status: 404 })
  if (!['consultant', 'attorney'].includes(String(profile.role))) {
    return Response.json(
      { error: 'Stripe bypass only applies to consultants and attorneys.' },
      { status: 400 },
    )
  }

  const table = profile.role === 'attorney' ? 'attorneys' : 'consultants'

  // Resolve the underlying record. Both tables join via profile_id; consultants
  // also fall back to user_id and email for legacy rows.
  let recordId: string | null = null
  {
    const { data: byProfile } = await auth.db
      .from(table)
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (byProfile?.id) recordId = byProfile.id
  }
  if (!recordId && profile.role === 'consultant') {
    const { data: byUser } = await auth.db
      .from('consultants')
      .select('id')
      .eq('user_id', profileId)
      .maybeSingle()
    if (byUser?.id) recordId = byUser.id
  }
  if (!recordId && profile.email) {
    const { data: byEmail } = await auth.db
      .from(table)
      .select('id')
      .eq('email', profile.email)
      .maybeSingle()
    if (byEmail?.id) recordId = byEmail.id
  }

  if (!recordId) {
    return Response.json(
      { error: `No ${profile.role} record found for this user.` },
      { status: 404 },
    )
  }

  const { error: updErr } = await auth.db
    .from(table)
    .update({ stripe_bypass: enabled })
    .eq('id', recordId)

  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  return Response.json({ ok: true, role: profile.role, stripe_bypass: enabled })
}
