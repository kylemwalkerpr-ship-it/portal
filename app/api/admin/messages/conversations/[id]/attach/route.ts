/**
 * POST /api/admin/messages/conversations/[id]/attach
 * Admin-only attachment / voice-note send for Master Chats.
 * Keeps participant auth separate while writing into the shared conversation.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { setConversationAiMode } from '@/lib/messengerAi'

const BUCKET = 'message-attachments'
const MAX_BYTES = 25 * 1024 * 1024
const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const CLIENT_ROLES = new Set(['client', 'student'])
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
])

function shapeProfile(p: any, fallbackId?: string | null) {
  if (!p && !fallbackId) return null
  if (!p) return { id: fallbackId, name: 'Unknown', email: null, avatar_url: null, role: null }
  return {
    id: p.id,
    name: p.full_name || p.email || 'User',
    email: p.email,
    avatar_url: p.avatar_url,
    role: p.role === 'student' ? 'client' : p.role,
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const url = new URL(req.url)
  const requestedType = url.searchParams.get('type') === 'voice' ? 'voice' : 'attachment'
  const directedTo = url.searchParams.get('to') === 'provider' ? 'provider' : 'client'

  const { data: conv, error: convError } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, status')
    .eq('id', id)
    .single()
  if (convError || !conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.status === 'archived') return Response.json({ error: 'Conversation is archived' }, { status: 400 })

  const { data: profiles } = await db
    .from('profiles')
    .select('id, role, full_name, email, avatar_url')
    .in('id', [conv.participant_a, conv.participant_b].filter(Boolean))

  const normalized = (profiles || []).map((p: any) => ({ ...p, normalizedRole: p.role === 'student' ? 'client' : String(p.role || '') }))
  const provider = normalized.find((p: any) => PROVIDER_ROLES.has(p.normalizedRole)) || null
  const client = normalized.find((p: any) => CLIENT_ROLES.has(p.role) || p.normalizedRole === 'client') || null
  const target = directedTo === 'provider' ? provider : client
  if (!target) return Response.json({ error: `No ${directedTo} participant in this conversation` }, { status: 400 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'file field is required' }, { status: 422 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'File must be 25 MB or less.' }, { status: 422 })

  const baseType = (file.type || '').split(';')[0].trim()
  if (baseType && !ALLOWED.has(baseType)) return Response.json({ error: `Unsupported file type: ${baseType}` }, { status: 422 })

  const safeName = (file.name || (requestedType === 'voice' ? 'voice-note.webm' : 'attachment'))
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)
  const storagePath = `${id}/admin-${profileId}/${crypto.randomUUID()}-${safeName}`
  const buffer = await file.arrayBuffer()

  let upload = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upload.error && /bucket not found|does not exist/i.test(upload.error.message || '')) {
    const create = await db.storage.createBucket(BUCKET, { public: true })
    if (create.error && !/already exists/i.test(create.error.message || '')) {
      return Response.json({ error: `Could not create bucket: ${create.error.message}` }, { status: 500 })
    }
    upload = await db.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  }
  if (upload.error) return Response.json({ error: upload.error.message }, { status: 500 })

  const { data: publicUrl } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const attachmentUrl = publicUrl?.publicUrl || storagePath
  const messageType = requestedType === 'voice' ? 'voice' : 'attachment'
  const body = requestedType === 'voice' ? '🎙 Voice message' : `📎 ${safeName}`

  const metadata = {
    admin_message: true,
    admin_directed_to: directedTo,
    admin_directed_to_id: target.id,
    admin_directed_to_name: target.full_name || target.email || directedTo,
    storage_path: storagePath,
    size: file.size,
    mime: baseType || file.type || null,
    is_voice: requestedType === 'voice',
  }

  const { data: message, error } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: id,
      sender_id: profileId,
      type: messageType,
      body,
      attachment_url: attachmentUrl,
      attachment_name: safeName,
      metadata,
    })
    .select('id, sender_id, type, body, attachment_url, attachment_name, metadata, created_at')
    .single()

  if (error || !message) {
    await db.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: error?.message || 'Could not save attachment.' }, { status: 500 })
  }

  await db.from('conversations')
    .update({ last_message_at: message.created_at || new Date().toISOString(), last_message_id: message.id })
    .eq('id', id)
    .then(() => null, () => null)

  try {
    await setConversationAiMode(db, id, 'paused', {
      ai_paused_reason: 'admin_attachment',
      ai_mode_set_by: profileId,
      ai_mode_set_role: 'admin',
    })
  } catch (e) {
    console.warn('[admin/messages/attach] ai pause failed', e instanceof Error ? e.message : e)
  }

  const sender = shapeProfile({
    id: profileId,
    full_name: auth.profile?.full_name,
    email: auth.profile?.email,
    avatar_url: (auth.profile as any)?.avatar_url,
    role: 'admin',
  }, profileId)

  return Response.json({
    message: {
      ...message,
      sender,
      is_admin_message: true,
    },
    ai_mode: 'paused',
  }, { status: 201 })
}
