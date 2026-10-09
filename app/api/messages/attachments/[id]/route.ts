/**
 * GET /api/messages/attachments/[id]
 *
 * Opens a messenger attachment (file or voice note) stored in the PRIVATE
 * `message-attachments` bucket. [id] is the conversation_messages row id.
 *
 * 1. Caller must be signed in (portal session).
 * 2. Caller must be a participant of the message's conversation, or
 *    support/admin. Non-parties get the same 404 as a missing row so we
 *    never reveal that an attachment exists.
 * 3. We redirect to a short-lived signed URL. The URL itself is a bearer
 *    secret: never log it, never cache this response.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { recordDocumentAccess } from '@/lib/documentStorage'
import {
  MESSAGE_ATTACHMENTS_BUCKET,
  canOpenConversationAttachment,
  resolveMessageAttachmentPath,
  signMessageAttachment,
} from '@/lib/messengerAttachmentAccess'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NO_STORE = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

function notFound() {
  return Response.json({ error: 'Attachment not found' }, { status: 404, headers: NO_STORE })
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  const { db, profileId } = auth
  const { id } = await context.params
  if (!UUID_RE.test(id || '')) return notFound()

  const { data: message } = await db
    .from('conversation_messages')
    .select('id, conversation_id, attachment_url, attachment_name, metadata')
    .eq('id', id)
    .maybeSingle()
  if (!message?.conversation_id) return notFound()

  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', message.conversation_id)
    .maybeSingle()
  if (!canOpenConversationAttachment(conv, { profileId, role: auth.role })) return notFound()

  const path = resolveMessageAttachmentPath(message)
  // The object path always starts with the conversation id; refuse rows
  // whose metadata points somewhere else.
  if (!path || !path.startsWith(`${message.conversation_id}/`)) return notFound()

  const url = new URL(req.url)
  const wantsDownload = url.searchParams.get('download') === '1'
  const signed = await signMessageAttachment(db, path, {
    downloadName: wantsDownload ? message.attachment_name || 'attachment' : null,
  })
  if (!signed) return notFound()

  await recordDocumentAccess(db, {
    bucket: MESSAGE_ATTACHMENTS_BUCKET,
    path,
    action: wantsDownload ? 'download' : 'view',
    accessorProfileId: profileId,
    request: req,
    documentId: message.id,
  }).catch(() => null)

  return new Response(null, { status: 302, headers: { ...NO_STORE, Location: signed } })
}
