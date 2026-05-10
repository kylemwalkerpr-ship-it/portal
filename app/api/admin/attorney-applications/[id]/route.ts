import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail, attorneyApprovalEmail, attorneyDeclineEmail } from '@/lib/email'

export const runtime = 'edge'

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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, adminProfileId } = auth
  const { id } = await context.params

  let body: { action?: 'approve' | 'decline'; notes?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (body.action !== 'approve' && body.action !== 'decline') {
    return Response.json({ error: 'action must be "approve" or "decline".' }, { status: 400 })
  }

  const { data: application, error: fetchErr } = await db
    .from('attorney_applications')
    .select('id, profile_id, email, full_name, jurisdictions, practice_areas, status')
    .eq('id', id)
    .single()

  if (fetchErr || !application) {
    return Response.json({ error: 'Application not found.' }, { status: 404 })
  }
  if (application.status !== 'pending') {
    return Response.json({ error: `Application already ${application.status}.` }, { status: 409 })
  }

  const decisionNotes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null

  if (body.action === 'approve') {
    const { error: updateAppErr } = await db
      .from('attorney_applications')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: adminProfileId,
        decision_notes: decisionNotes,
      })
      .eq('id', id)
    if (updateAppErr) return Response.json({ error: updateAppErr.message }, { status: 500 })

    if (application.profile_id) {
      await db.from('profiles').update({ status: 'active' }).eq('id', application.profile_id)
      await db
        .from('attorneys')
        .upsert(
          {
            profile_id: application.profile_id,
            application_id: application.id,
            jurisdictions: application.jurisdictions,
            practice_areas: application.practice_areas,
          },
          { onConflict: 'profile_id' },
        )
    }

    try {
      const email = attorneyApprovalEmail(application.full_name)
      await sendEmail({ to: application.email, subject: email.subject, html: email.html })
    } catch (err) {
      console.error('[attorney-applications] approval email failed', err)
    }

    return Response.json({ ok: true, status: 'approved' })
  }

  // decline
  const { error: updateAppErr } = await db
    .from('attorney_applications')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: adminProfileId,
      decision_notes: decisionNotes,
    })
    .eq('id', id)
  if (updateAppErr) return Response.json({ error: updateAppErr.message }, { status: 500 })

  if (application.profile_id) {
    await db.from('profiles').update({ status: 'declined' }).eq('id', application.profile_id)
  }

  try {
    const email = attorneyDeclineEmail(application.full_name)
    await sendEmail({ to: application.email, subject: email.subject, html: email.html })
  } catch (err) {
    console.error('[attorney-applications] decline email failed', err)
  }

  return Response.json({ ok: true, status: 'declined' })
}
