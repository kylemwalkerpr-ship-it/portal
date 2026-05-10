import { requireClient } from '@/lib/clientAuth'

const MAX_BYTES = 25 * 1024 * 1024
const BUCKET = 'chat-attachments'

async function ensureOwnsChat(ctx: any, id: string) {
  const { data: chat } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id, source')
    .eq('id', id)
    .single()
  if (!chat || chat.source !== 'portal_attorney_chat') return { error: 'Chat not found.', status: 404 }
  if (chat.client_profile_id !== ctx.profileId && chat.email !== ctx.email) return { error: 'Forbidden.', status: 403 }
  return { chat }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })
  const { id } = await context.params
  const own = await ensureOwnsChat(ctx, id)
  if ('error' in own) return Response.json({ error: own.error }, { status: own.status })

  const contentType = req.headers.get('content-type') || ''
  let body = ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    body = typeof form.get('body') === 'string' ? String(form.get('body')).trim().slice(0, 4000) : ''
    const file = form.get('file')
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return Response.json({ error: 'File exceeds 25 MB limit.' }, { status: 413 })
      const safeName = file.name.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'attachment'
      const path = `${id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadErr } = await ctx.db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (uploadErr) return Response.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
      const { data: pub } = ctx.db.storage.from(BUCKET).getPublicUrl(path)
      body = [body, `Attachment: ${safeName}\n${pub?.publicUrl || ''}`].filter(Boolean).join('\n\n')
    }
  } else {
    const json = await req.json().catch(() => ({}))
    body = typeof json.body === 'string' ? json.body.trim().slice(0, 4000) : ''
  }

  if (!body) return Response.json({ error: 'Message body or file required.' }, { status: 400 })

  const { data: msg, error: insErr } = await ctx.db
    .from('inquiry_messages')
    .insert({ inquiry_id: id, sender_role: 'client', sender_profile_id: ctx.profileId, body })
    .select('id, sender_role, sender_profile_id, body, created_at')
    .single()
  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send message.' }, { status: 500 })

  await ctx.db.from('inquiries').update({ updated_at: new Date().toISOString() }).eq('id', id)
  return Response.json({ message: msg })
}
