const MAX_BYTES = 25 * 1024 * 1024
const BUCKET = 'chat-attachments'

export function safeAttachmentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().slice(0, 120) || 'attachment'
}

export async function messageBodyFromRequest(
  req: Request,
  db: any,
  pathPrefix: string,
  uploaderId?: string,
) {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    const json = await req.json().catch(() => ({}))
    return typeof json.body === 'string' ? json.body.trim().slice(0, 4000) : ''
  }

  return messageBodyFromFormData(await req.formData(), db, pathPrefix, uploaderId)
}

export async function messageBodyFromFormData(
  form: FormData,
  db: any,
  pathPrefix: string,
  uploaderId?: string,
) {
  let body = typeof form.get('body') === 'string' ? String(form.get('body')).trim().slice(0, 4000) : ''
  const file = form.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      const error = new Error('File exceeds 25 MB limit.')
      ;(error as Error & { status?: number }).status = 413
      throw error
    }

    const safeName = safeAttachmentName(file.name || 'attachment')
    const path = `${pathPrefix}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

    const chatId = pathPrefix.split('/').filter(Boolean).pop() || pathPrefix
    const { data: attachment, error: attachErr } = await db
      .from('chat_attachments')
      .insert({
        chat_id: chatId,
        storage_bucket: BUCKET,
        storage_path: path,
        file_name: safeName,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploader_id: uploaderId || null,
        scan_status: 'pending',
      })
      .select('id, file_name, file_size, mime_type, scan_status')
      .single()
    if (attachErr || !attachment) throw new Error(`Attachment metadata failed: ${attachErr?.message || 'unknown error'}`)

    body = [
      body,
      `Attachment: ${safeName}\nAttachmentMeta: ${JSON.stringify({
        id: attachment.id,
        file_name: attachment.file_name,
        file_size: attachment.file_size,
        mime_type: attachment.mime_type,
        scan_status: attachment.scan_status,
      })}`,
    ].filter(Boolean).join('\n\n')
  }

  return body
}
