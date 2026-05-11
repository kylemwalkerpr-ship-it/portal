const MAX_BYTES = 25 * 1024 * 1024
const BUCKET = 'chat-attachments'

export function safeAttachmentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().slice(0, 120) || 'attachment'
}

export async function messageBodyFromRequest(
  req: Request,
  db: any,
  pathPrefix: string,
) {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    const json = await req.json().catch(() => ({}))
    return typeof json.body === 'string' ? json.body.trim().slice(0, 4000) : ''
  }

  return messageBodyFromFormData(await req.formData(), db, pathPrefix)
}

export async function messageBodyFromFormData(
  form: FormData,
  db: any,
  pathPrefix: string,
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

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
    body = [body, `Attachment: ${safeName}\n${pub?.publicUrl || ''}`].filter(Boolean).join('\n\n')
  }

  return body
}
