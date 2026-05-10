import { requireAttorney } from '@/lib/attorneyAuth'


export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data, error: updErr } = await ctx.db
    .from('attorney_offers')
    .update({ status: 'withdrawn', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('attorney_id', ctx.attorneyId)
    .eq('status', 'sent')
    .select('id, inquiry_id')
    .single()

  if (updErr || !data) {
    return Response.json({ error: 'Offer not found or already decided.' }, { status: 409 })
  }

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: data.inquiry_id,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: 'Attorney withdrew their offer.',
  })

  return Response.json({ ok: true })
}
