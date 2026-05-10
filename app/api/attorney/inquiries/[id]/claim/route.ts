import { requireAttorney } from '@/lib/attorneyAuth'


export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  // Atomic claim — only update if currently unclaimed and open.
  const { data: claimed, error: updErr } = await ctx.db
    .from('inquiries')
    .update({
      claimed_by_attorney_id: ctx.attorneyId,
      claimed_at: new Date().toISOString(),
      status: 'claimed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('claimed_by_attorney_id', null)
    .eq('status', 'open')
    .select('id')
    .single()

  if (updErr || !claimed) {
    return Response.json({ error: 'Inquiry already claimed or no longer open.' }, { status: 409 })
  }

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: id,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: `${ctx.fullName ?? 'An attorney'} claimed this inquiry.`,
  })

  return Response.json({ ok: true })
}
