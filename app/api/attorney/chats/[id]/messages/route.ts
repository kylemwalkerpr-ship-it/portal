import { requireAttorney } from '@/lib/attorneyAuth'
import { messageBodyFromRequest } from '@/lib/messageAttachments'
import { safetyGuard } from '@/lib/safety'

async function ensureOwnsChat(ctx: any, id: string) {
  const { data: chat } = await ctx.db
    .from('inquiries')
    .select('id, target_attorney_profile_id, client_profile_id, source')
    .eq('id', id)
    .single()
  if (!chat || chat.source !== 'portal_attorney_chat') return { error: 'Chat not found.', status: 404 }
  if (chat.target_attorney_profile_id !== ctx.profileId) return { error: 'Forbidden.', status: 403 }
  return { chat }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })
  const { id } = await context.params
  const own = await ensureOwnsChat(ctx, id)
  if ('error' in own) return Response.json({ error: own.error }, { status: own.status })

  let body = ''
  try {
    body = await messageBodyFromRequest(req, ctx.db, `attorney-chats/${id}`, ctx.profileId)
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 500
    return Response.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, { status })
  }

  if (!body) return Response.json({ error: 'Message body or file required.' }, { status: 400 })

  {
    const s = safetyGuard(body)
    if (!s.ok) return Response.json({ error: s.error, violations: s.violations }, { status: 422 })
  }

  const { data: msg, error: insErr } = await ctx.db
    .from('inquiry_messages')
    .insert({ inquiry_id: id, sender_role: 'attorney', sender_profile_id: ctx.profileId, body })
    .select('id, sender_role, sender_profile_id, body, created_at')
    .single()
  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send message.' }, { status: 500 })

  await ctx.db.from('inquiries').update({ updated_at: new Date().toISOString() }).eq('id', id)

  const counterpart = (own.chat as any).client_profile_id
  if (counterpart) {
    const { mirrorMessage } = await import('@/lib/conversations')
    await mirrorMessage(ctx.db, {
      participantA: ctx.profileId,
      participantB: counterpart,
      senderId:     ctx.profileId,
      body,
      contextKind:  'inquiry',
      contextId:    id,
      refInquiryId: id,
      refMessageId: (msg as any).id,
    })
  }

  return Response.json({ message: msg })
}
