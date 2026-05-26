/**
 * POST /api/messages/conversations/[id]/attach
 *
 * Multipart upload that drops a file (image, document, or voice note)
 * into the conversation as a real message row. The composer's paperclip
 * and microphone buttons both hit this endpoint; the only difference is
 * the MIME type of the uploaded blob.
 *
 * Body: multipart/form-data with one `file` field.
 *   For voice notes, the client also sets ?type=voice so the
 *   conversation_messages row carries type='voice' instead of 'attachment'
 *   — lets the inbox render an audio player UI vs. a generic file chip.
 *
 * Returns the inserted message row so the composer can optimistically
 * append it to the thread.
 */
import { requirePortalUser } from '@/lib/portalAuth'

const BUCKET = 'message-attachments'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

// Allow the common document + image + audio types we expect. Server-side
// allowlist; the composer also pre-filters via the file picker's accept=.
const ALLOWED = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  // Docs
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  // Audio (voice notes)
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
])

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const url = new URL(req.url)
  const requestedType = url.searchParams.get('type') === 'voice' ? 'voice' : 'attachment'

  // Ownership check before touching storage so we don't waste bandwidth.
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'file field is required' }, { status: 422 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: `File must be ${MAX_BYTES / 1024 / 1024} MB or less.` }, { status: 422 })
  }
  // For voice notes the browser usually sends 'audio/webm;codecs=opus' —
  // strip the codec suffix before the allowlist check so we don't reject
  // a perfectly valid recording.
  const baseType = (file.type || '').split(';')[0].trim()
  if (baseType && !ALLOWED.has(baseType)) {
    return Response.json({ error: `Unsupported file type: ${baseType}` }, { status: 422 })
  }

  const safeName = (file.name || (requestedType === 'voice' ? 'voice-note.webm' : 'attachment'))
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)
  const storagePath = `${id}/${profileId}/${crypto.randomUUID()}-${safeName}`

  const buf = await file.arrayBuffer()
  let upload = await db.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  // Self-heal: if the bucket doesn't exist yet, create it (public so the
  // public URL resolves in the browser) and retry the upload. Avoids the
  // chicken-and-egg "bucket not found" error on first ever attachment.
  // See supabase/message_attachments_bucket.sql for the canonical
  // migration; this is a runtime fallback for tenants that haven't
  // run it yet.
  if (upload.error && /bucket not found|does not exist/i.test(upload.error.message || '')) {
    const create = await db.storage.createBucket(BUCKET, { public: true })
    if (create.error && !/already exists/i.test(create.error.message || '')) {
      return Response.json({ error: `Could not create bucket: ${create.error.message}` }, { status: 500 })
    }
    upload = await db.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  }
  if (upload.error) {
    return Response.json({ error: upload.error.message }, { status: 500 })
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const attachmentUrl = pub?.publicUrl || storagePath

  const messageType = requestedType === 'voice' ? 'voice' : 'attachment'
  const body = requestedType === 'voice'
    ? '🎙 Voice message'
    : `📎 ${safeName}`

  const { data: message, error } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: id,
      sender_id:       profileId,
      type:            messageType,
      body,
      attachment_url:  attachmentUrl,
      attachment_name: safeName,
      metadata: {
        storage_path: storagePath,
        size:         file.size,
        mime:         baseType || file.type || null,
        is_voice:     requestedType === 'voice',
      },
    })
    .select('id, sender_id, type, body, attachment_url, attachment_name, metadata, created_at')
    .single()
  if (error || !message) {
    // Roll back the storage object on DB failure so we don't leak files.
    await db.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: error?.message || 'Could not save attachment.' }, { status: 500 })
  }

  // Best-effort bump of conversation last_message_at so the inbox sorts
  // correctly without waiting for the next list refresh.
  await db.from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', id)
    .then(() => null, () => null)

  return Response.json({ message }, { status: 201 })
}
