import { requireClient } from '@/lib/clientAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
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

  const updates: Record<string, unknown> = {
    archived_at: null,
    archived_by_role: null,
    archived_reason: null,
    updated_at: new Date().toISOString(),
  }

  if (inquiry.status === 'archived') {
    updates.status = 'open'
  }
  // if status === 'converted', leave it

  const { data: updated, error: updErr } = await ctx.db
    .from('inquiries')
    .update(updates)
    .eq('id', id)
    .select('id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, created_at, updated_at')
    .single()

  if (updErr || !updated) {
    return fail(updErr?.message || 'Unarchive failed.', 500)
  }

  return ok({ unarchived: true, inquiry: updated })
}
