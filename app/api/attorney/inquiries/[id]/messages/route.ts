import { requireAttorney } from '@/lib/attorneyAuth'
import { sendEmail, inquiryAttorneyEngagedEmail } from '@/lib/email'
import { messageBodyFromFormData } from '@/lib/messageAttachments'

// Multi-attorney model: any approved attorney can message any open inquiry.
// Their messages are tagged with sender_profile_id so the student UI can
// group messages into per-attorney threads.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const contentType = req.headers.get('content-type') || ''
  let text = ''
  let form: FormData | null = null
  if (contentType.includes('multipart/form-data')) {
    try {
      form = await req.formData()
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Expected multipart/form-data' }, { status: 400 })
    }
  } else {
    const body = await req.json().catch(() => ({}))
    text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''
  }
  if (!form && !text) return Response.json({ error: 'Message body or file required.' }, { status: 400 })

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, case_type_label, status')
    .eq('id', id)
    .single()
  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })
  if (inquiry.status === 'converted' || inquiry.status === 'closed' || inquiry.status === 'cancelled') {
    return Response.json({ error: `Inquiry is ${inquiry.status}.` }, { status: 409 })
  }

  if (form) {
    try {
      text = await messageBodyFromFormData(form, ctx.db, `inquiries/${id}`)
    } catch (err) {
      const status = (err as Error & { status?: number }).status || 500
      return Response.json({ error: err instanceof Error ? err.message : 'Upload failed.' }, { status })
    }
    if (!text) return Response.json({ error: 'Message body or file required.' }, { status: 400 })
  }

  // First-message detection BEFORE inserting (so we know whether to email).
  const { count: priorAttorneyMessages } = await ctx.db
    .from('inquiry_messages')
    .select('id', { count: 'exact', head: true })
    .eq('inquiry_id', id)
    .eq('sender_role', 'attorney')
    .eq('sender_profile_id', ctx.profileId)

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

  // Mark the inquiry as engaged the first time any attorney replies.
  if (inquiry.status === 'open') {
    await ctx.db.from('inquiries').update({ status: 'engaged', updated_at: new Date().toISOString() }).eq('id', id)
  } else {
    await ctx.db.from('inquiries').update({ updated_at: new Date().toISOString() }).eq('id', id)
  }

  // Notify the client only on this attorney's FIRST message in the inquiry,
  // to avoid spamming them on every back-and-forth.
  if ((priorAttorneyMessages ?? 0) === 0 && inquiry.email) {
    try {
      const tpl = inquiryAttorneyEngagedEmail({
        clientName: inquiry.full_name,
        attorneyName: ctx.fullName ?? 'An attorney',
        caseLabel: inquiry.case_type_label ?? '',
        inquiryId: id,
      })
      await sendEmail({ to: inquiry.email, subject: tpl.subject, html: tpl.html })
    } catch (e) {
      console.error('[attorney/messages] notify-client failed', e)
    }
  }

  return Response.json({ message: msg })
}
