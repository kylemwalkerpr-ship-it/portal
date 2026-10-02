/**
 * PATCH /api/admin/consultant-applications/:id  { action: 'approve' | 'decline', notes? }
 * One-click decision. Side effects (profiles role/status, provider row,
 * listings, Clerk metadata, applicant email, event log) live in
 * lib/provider/decision.ts, shared with the bulk route.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { decideProviderApplication } from '@/lib/provider/decision'

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

  const result = await decideProviderApplication(db, {
    lane: 'consultant',
    applicationId: id,
    action: body.action,
    adminProfileId,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if (result.ok === false) {
    const failed = result as Extract<typeof result, { ok: false }>
    return Response.json({ error: failed.error }, { status: failed.httpStatus })
  }
  return Response.json(result)
}
