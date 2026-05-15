/**
 * POST /api/admin/attorney-applications/bulk
 * Body: { ids: string[], action: 'approve' | 'decline' | 'waitlist' | 'assign' | 'prioritise', notes?: string, assignee_id?: string, priority?: string }
 * Idempotent — already-decided applications are silently skipped (and reported in the response).
 *
 * Designed for queue clearing — admins can select up to 200 applications and
 * apply the same action. We loop server-side rather than relying on PostgREST's
 * single-statement update so we still send the per-applicant email + sync the
 * profiles + attorneys side effects.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail, attorneyApprovalEmail, attorneyDeclineEmail } from '@/lib/email'

const VALID_ACTIONS = ['approve', 'decline', 'waitlist', 'assign', 'prioritise'] as const
type Action = typeof VALID_ACTIONS[number]

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const ids: string[]    = Array.isArray(body.ids) ? body.ids.slice(0, 200) : []
  const action: Action   = body.action
  const notes: string    = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : ''
  const assigneeId       = typeof body.assignee_id === 'string' ? body.assignee_id : null
  const priority         = ['normal','high','urgent'].includes(body.priority) ? body.priority : null

  if (!ids.length)                       return Response.json({ error: 'No application ids provided.' }, { status: 400 })
  if (!VALID_ACTIONS.includes(action))   return Response.json({ error: 'Invalid action.' }, { status: 400 })

  const { data: apps, error: loadErr } = await db
    .from('attorney_applications')
    .select('id, profile_id, email, full_name, jurisdictions, practice_areas, status')
    .in('id', ids)
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 })

  const results: { id: string; ok: boolean; status?: string; reason?: string }[] = []
  const now = new Date().toISOString()

  for (const app of apps ?? []) {
    // Skip non-pending unless this is an assign/prioritise (which can apply at any state)
    if (['approve', 'decline', 'waitlist'].includes(action) && app.status !== 'pending') {
      results.push({ id: app.id, ok: false, reason: `already ${app.status}` })
      continue
    }

    try {
      if (action === 'approve') {
        await db.from('attorney_applications').update({
          status: 'approved', decided_at: now, decided_by: profile.id, decision_notes: notes || null, last_reviewed_at: now,
        }).eq('id', app.id)
        if (app.profile_id) {
          await db.from('profiles').update({ status: 'active' }).eq('id', app.profile_id)
          await db.from('attorneys').upsert({
            profile_id: app.profile_id,
            application_id: app.id,
            jurisdictions: app.jurisdictions,
            practice_areas: app.practice_areas,
          }, { onConflict: 'profile_id' })
        }
        try {
          const e = attorneyApprovalEmail(app.full_name)
          await sendEmail({ to: app.email, subject: e.subject, html: e.html })
        } catch {}
        await db.from('attorney_application_events').insert({
          application_id: app.id, actor_id: profile.id,
          event_type: 'approve', from_status: app.status, to_status: 'approved', notes,
        }).then(() => null, () => null)
        results.push({ id: app.id, ok: true, status: 'approved' })
      } else if (action === 'decline') {
        await db.from('attorney_applications').update({
          status: 'declined', decided_at: now, decided_by: profile.id, decision_notes: notes || null, last_reviewed_at: now,
        }).eq('id', app.id)
        if (app.profile_id) await db.from('profiles').update({ status: 'declined' }).eq('id', app.profile_id)
        try {
          const e = attorneyDeclineEmail(app.full_name)
          await sendEmail({ to: app.email, subject: e.subject, html: e.html })
        } catch {}
        await db.from('attorney_application_events').insert({
          application_id: app.id, actor_id: profile.id,
          event_type: 'decline', from_status: app.status, to_status: 'declined', notes,
        }).then(() => null, () => null)
        results.push({ id: app.id, ok: true, status: 'declined' })
      } else if (action === 'waitlist') {
        await db.from('attorney_applications').update({
          status: 'waitlist', decision_notes: notes || null, last_reviewed_at: now,
        }).eq('id', app.id)
        await db.from('attorney_application_events').insert({
          application_id: app.id, actor_id: profile.id,
          event_type: 'waitlist', from_status: app.status, to_status: 'waitlist', notes,
        }).then(() => null, () => null)
        results.push({ id: app.id, ok: true, status: 'waitlist' })
      } else if (action === 'assign') {
        await db.from('attorney_applications').update({ assigned_to: assigneeId, last_reviewed_at: now }).eq('id', app.id)
        await db.from('attorney_application_events').insert({
          application_id: app.id, actor_id: profile.id, event_type: 'assign',
          notes, metadata: { assignee_id: assigneeId },
        }).then(() => null, () => null)
        results.push({ id: app.id, ok: true })
      } else if (action === 'prioritise' && priority) {
        await db.from('attorney_applications').update({ priority, last_reviewed_at: now }).eq('id', app.id)
        await db.from('attorney_application_events').insert({
          application_id: app.id, actor_id: profile.id, event_type: 'prioritise',
          notes, metadata: { priority },
        }).then(() => null, () => null)
        results.push({ id: app.id, ok: true })
      }
    } catch (e: any) {
      results.push({ id: app.id, ok: false, reason: e?.message || 'update failed' })
    }
  }

  const successCount = results.filter(r => r.ok).length
  return Response.json({
    requested:  ids.length,
    processed:  results.length,
    successful: successCount,
    skipped:    results.length - successCount,
    results,
  })
}
