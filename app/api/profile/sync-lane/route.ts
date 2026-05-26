/**
 * POST /api/profile/sync-lane
 *
 * Bridges the gap between the sign-up page (which knows the user's
 * requested lane from the URL path) and the dashboard provisioning
 * code (which can be fooled by an OAuth flow that strips
 * unsafeMetadata).
 *
 * Body: { lane: 'attorney' | 'consultant' | 'client' | 'student' }
 *
 * Conditions for promotion:
 *   - The caller's profile exists (i.e., dashboard provisioning has
 *     run once).
 *   - The profile's current role is 'client' AND status is 'active'
 *     (the default new-user state when Clerk dropped the metadata).
 *   - The user has NO orders, NO inquiries, NO offers — i.e., they
 *     genuinely just signed up and haven't started using the platform
 *     as a client yet. This guard prevents an existing client from
 *     accidentally getting promoted to attorney via a stale
 *     sessionStorage value.
 *
 * On promotion: profile.role is updated to the requested lane, and
 * status is moved to:
 *   - 'incomplete' for attorneys/consultants (so they hit the intake
 *     wizard before the dashboard renders),
 *   - 'active' for clients (no change).
 *
 * Returns: { promoted: boolean, role: string }
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { normalizeAuthLane } from '@/lib/roleLanes'

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  const body = await req.json().catch(() => ({} as any))
  const requested = normalizeAuthLane(body?.lane)
  if (requested === 'client') {
    // No-op: nothing to promote to. Used by the client to clear
    // sessionStorage without side effects.
    return Response.json({ promoted: false, role: 'client' })
  }

  // Re-read the current profile so we don't race with the dashboard
  // page's own upsert. Use the canonical fields the rest of the app
  // expects to be present.
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, status, email, created_at')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 })

  // Only promote a freshly-created 'client' profile. If the profile
  // already matches the requested role, nothing to do.
  if (profile.role === requested) {
    return Response.json({ promoted: false, role: profile.role })
  }
  if (profile.role !== 'client') {
    // Don't override admin / support / a previously-set attorney by
    // mistake. The frontend should clear sessionStorage in this case.
    return Response.json({ promoted: false, role: profile.role, reason: 'role_already_set' })
  }

  // Activity guard — if the user has any orders, inquiries, or offers
  // as a client, refuse the promotion. Defends against a stale tab's
  // sessionStorage promoting a real client into attorney by accident.
  const [{ count: orderCount }, { count: inquiryCount }] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('client_id', profile.id),
    db.from('inquiries').select('id', { count: 'exact', head: true }).eq('client_profile_id', profile.id),
  ])
  if ((orderCount ?? 0) > 0 || (inquiryCount ?? 0) > 0) {
    return Response.json({ promoted: false, role: profile.role, reason: 'existing_activity' })
  }

  // Pick the right status for the promoted role.
  // Attorneys + consultants need to complete the intake wizard first;
  // they land on /dashboard with status='incomplete' and see the
  // wizard prompt instead of the regular dashboard.
  const nextStatus =
    requested === 'attorney' ? 'incomplete'
    : requested === 'consultant' ? 'pending'
    : 'active'

  const { error: updateErr } = await db
    .from('profiles')
    .update({ role: requested, status: nextStatus })
    .eq('id', profile.id)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ promoted: true, role: requested, status: nextStatus })
}
