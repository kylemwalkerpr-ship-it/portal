/**
 * POST /api/admin/attorney-applications/[id]/revoke
 * Revoke an already-approved attorney. Flips the application to declined,
 * suspends the profile, pauses the attorney's gigs (matching the suspend
 * cascade in PATCH /api/admin/users/[id]), writes an audit event, and emails
 * the attorney that access has been revoked.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail, attorneyDeclineEmail } from '@/lib/email'

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
  return { db, adminProfileId: profile.id }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, adminProfileId } = auth
  const { id } = await context.params

  let body: { notes?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Empty body is allowed.
  }
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null

  const { data: application, error: fetchErr } = await db
    .from('attorney_applications')
    .select('id, profile_id, email, full_name, status')
    .eq('id', id)
    .single()
  if (fetchErr || !application) {
    return Response.json({ error: 'Application not found.' }, { status: 404 })
  }
  if (application.status !== 'approved') {
    return Response.json({ error: `Application is ${application.status}; only approved applications can be revoked.` }, { status: 409 })
  }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from('attorney_applications')
    .update({
      status: 'declined',
      decided_at: now,
      decided_by: adminProfileId,
      decision_notes: notes,
      last_reviewed_at: now,
      last_reviewed_by: adminProfileId,
    })
    .eq('id', id)
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  if (application.profile_id) {
    await db.from('profiles').update({ status: 'suspended' }).eq('id', application.profile_id)
    // Pause any currently-active gigs to match the suspend cascade.
    await db.from('gigs').update({ status: 'paused' }).eq('provider_id', application.profile_id).eq('status', 'active')
  }

  await db.from('attorney_application_events').insert({
    application_id: application.id,
    actor_id: adminProfileId,
    event_type: 'revoke',
    from_status: 'approved',
    to_status: 'declined',
    notes,
  }).then(() => null, () => null)

  try {
    const email = attorneyDeclineEmail(application.full_name)
    await sendEmail({
      to: application.email,
      subject: 'Your YouSafe attorney access has been revoked',
      html: email.html,
    })
  } catch (err) {
    console.error('[attorney-applications/revoke] email failed', err)
  }

  return Response.json({ ok: true, status: 'declined' })
}
