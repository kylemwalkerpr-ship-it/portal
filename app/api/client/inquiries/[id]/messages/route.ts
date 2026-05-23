import { requireClient } from '@/lib/clientAuth'
import { sendEmail, inquiryClientMessageEmail } from '@/lib/email'
import { safetyGuard } from '@/lib/safety'


export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
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

  const safety = safetyGuard(text)
  if (!safety.ok) return Response.json({ error: safety.error, violations: safety.violations }, { status: 422 })

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('email, client_profile_id, target_attorney_profile_id, claimed_by_attorney_id, status')
    .eq('id', id)
    .single()
  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })

  const owns = inquiry.client_profile_id === ctx.profileId || inquiry.email === ctx.email
  if (!owns) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const { data: msg, error: insErr } = await ctx.db
    .from('inquiry_messages')
    .insert({
      inquiry_id: id,
      sender_role: 'client',
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

  // Mirror into the unified inbox (best-effort).
  const counterpart = (inquiry as any).target_attorney_profile_id
  if (counterpart) {
    const { mirrorMessage } = await import('@/lib/conversations')
    await mirrorMessage(ctx.db, {
      participantA: ctx.profileId,
      participantB: counterpart,
      senderId:     ctx.profileId,
      body:         text,
      contextKind:  'inquiry',
      contextId:    id,
      refInquiryId: id,
      refMessageId: (msg as any).id,
    })
  }

  // Notify every attorney who has previously engaged with this inquiry.
  try {
    const { data: attorneyMessages } = await ctx.db
      .from('inquiry_messages')
      .select('sender_profile_id')
      .eq('inquiry_id', id)
      .eq('sender_role', 'attorney')
    const engagedProfileIds = Array.from(
      new Set((attorneyMessages ?? []).map((m) => m.sender_profile_id).filter(Boolean)),
    )
    if (engagedProfileIds.length > 0) {
      const { data: profiles } = await ctx.db
        .from('profiles')
        .select('id, email, full_name')
        .in('id', engagedProfileIds)
      for (const p of profiles ?? []) {
        if (!p.email) continue
        const tpl = inquiryClientMessageEmail({
          attorneyName: p.full_name,
          clientName: ctx.fullName,
          preview: text,
          inquiryId: id,
        })
        // Fire-and-forget; don't block response on email delivery.
        sendEmail({ to: p.email, subject: tpl.subject, html: tpl.html }).catch((e) =>
          console.error('[client/messages] notify-attorney failed', p.email, e),
        )
      }
    }
  } catch (e) {
    console.error('[client/messages] fan-out lookup failed', e)
  }

  return Response.json({ message: msg })
}
