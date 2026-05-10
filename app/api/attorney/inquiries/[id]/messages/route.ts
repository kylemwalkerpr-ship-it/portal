import { requireAttorney } from '@/lib/attorneyAuth'

export const runtime = 'edge'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  let body: { body?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''
  if (!text) return Response.json({ error: 'Message body required.' }, { status: 400 })

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('claimed_by_attorney_id, status')
    .eq('id', id)
    .single()
  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })
  if (inquiry.claimed_by_attorney_id !== ctx.attorneyId) {
    return Response.json({ error: 'Claim the inquiry before sending messages.' }, { status: 403 })
  }

  const { data: msg, error: insErr } = await ctx.db
    .from('inquiry_messages')
    .insert({
      inquiry_id: id,
      sender_role: 'attorney',
      sender_profile_id: ctx.profileId,
      body: text,
    })
    .select('id, sender_role, sender_profile_id, body, created_at')
    .single()

  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send message.' }, { status: 500 })

  await ctx.db
    .from('inquiries')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return Response.json({ message: msg })
}
