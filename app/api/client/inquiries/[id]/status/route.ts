import { requireClient } from '@/lib/clientAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id')
    .eq('id', id)
    .single()

  if (!inquiry) return fail('Inquiry not found.', 404)

  const owns = inquiry.client_profile_id === ctx.profileId || inquiry.email === ctx.email
  if (!owns) return fail('Forbidden.', 403)

  const { data: existing } = await ctx.db
    .from('inquiry_statuses')
    .select('id')
    .eq('inquiry_id', id)
    .eq('person_id', ctx.profileId)

  const rowCount = existing?.length ?? 0

  if (rowCount > 0) {
    const { error: delErr } = await ctx.db
      .from('inquiry_statuses')
      .delete()
      .eq('inquiry_id', id)
      .eq('person_id', ctx.profileId)

    if (delErr) {
      return fail(delErr.message, 500)
    }
  }

  return ok({ deleted: rowCount })
}
