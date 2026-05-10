import { requireClient } from '@/lib/clientAuth'

function clean(value: unknown, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(req: Request) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  let body: { attorneyId?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const attorneyId = clean(body.attorneyId, 80)
  const message = clean(body.message)
  if (!attorneyId) return Response.json({ error: 'Attorney is required.' }, { status: 400 })
  if (!message) return Response.json({ error: 'Write a message first.' }, { status: 400 })
  if (!ctx.fullName?.trim()) return Response.json({ error: 'Add your first and last name before messaging an attorney.' }, { status: 400 })

  const { data: attorney } = await ctx.db
    .from('attorneys')
    .select('id, profile_id')
    .eq('id', attorneyId)
    .single()

  if (!attorney) return Response.json({ error: 'Attorney not found.' }, { status: 404 })

  const { data: inquiry, error: inquiryErr } = await ctx.db
    .from('inquiries')
    .insert({
      client_profile_id: ctx.profileId,
      email: ctx.email,
      full_name: ctx.fullName,
      case_type: 'attorney_chat',
      case_type_label: 'Attorney profile chat',
      urgency: 'normal',
      answers: { initial_message: message },
      meta: { started_from: 'attorney_profile_message', pre_intake: true },
      source: 'portal_attorney_chat',
      target_attorney_profile_id: attorney.profile_id,
      status: 'engaged',
    })
    .select('id')
    .single()

  if (inquiryErr || !inquiry) {
    return Response.json({ error: inquiryErr?.message || 'Could not start the conversation.' }, { status: 500 })
  }

  const { error: msgErr } = await ctx.db.from('inquiry_messages').insert({
    inquiry_id: inquiry.id,
    sender_role: 'client',
    sender_profile_id: ctx.profileId,
    body: message,
  })

  if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 })
  return Response.json({ chatId: inquiry.id, inquiryId: inquiry.id, ok: true })
}
