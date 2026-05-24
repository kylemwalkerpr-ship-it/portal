import { requireClient } from '@/lib/clientAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id, archived_at, status')
    .eq('id', id)
    .single()

  if (!inquiry) return fail('Inquiry not found.', 404)

  const owns = inquiry.client_profile_id === ctx.profileId || inquiry.email === ctx.email
  if (!owns) return fail('Forbidden.', 403)

  if (inquiry.archived_at) {
    return fail('Inquiry is already archived.', 409, { reason: 'already_archived' })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : null

  const { data: updated, error: updErr } = await ctx.db
    .from('inquiries')
    .update({
      archived_at: new Date().toISOString(),
      archived_by_role: 'client',
      archived_reason: reason,
      status: inquiry.status === 'converted' ? inquiry.status : 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, created_at, updated_at')
    .single()

  if (updErr || !updated) {
    return fail(updErr?.message || 'Archive failed.', 500)
  }

  // Kill the broadcast
  await ctx.db.from('inquiry_statuses').delete().eq('inquiry_id', id)

  return ok({ archived: true, inquiry: updated })
}
