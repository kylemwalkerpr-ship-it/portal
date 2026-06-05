import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { mintSignedDocumentUrl, DEFAULT_TTL_SECONDS } from '@/lib/documentStorage'

async function canAccess(auth: any, chatId: string) {
  if (auth.role === 'admin') return true
  const { data: order } = await auth.db.from('orders').select('client_id, consultant_id').eq('id', chatId).maybeSingle()
  if (order) return order.client_id === auth.profileId || order.consultant_id === auth.profileId
  const { data: inquiry } = await auth.db
    .from('inquiries')
    .select('client_profile_id, email, target_attorney_profile_id')
    .eq('id', chatId)
    .maybeSingle()
  if (!inquiry) return false
  if (auth.role === 'client') return inquiry.client_profile_id === auth.profileId || inquiry.email === auth.profile.email
  if (auth.role === 'attorney') return inquiry.target_attorney_profile_id === auth.profileId || !inquiry.target_attorney_profile_id
  return false
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params

  const { data: attachment, error } = await auth.db
    .from('chat_attachments')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !attachment) return fail(error?.message || 'Attachment not found.', 404)
  // Generic 403 -- never reveal whether the attachment exists for a
  // non-party. Same shape as the audit endpoint.
  if (!(await canAccess(auth, attachment.chat_id))) return fail('Forbidden.', 403)

  if (attachment.scan_status !== 'clean') {
    return ok({
      attachment: {
        id: attachment.id,
        file_name: attachment.file_name,
        file_size: attachment.file_size,
        mime_type: attachment.mime_type,
        scan_status: attachment.scan_status,
      },
      signed_url: null,
    }, { status: 202 })
  }

  // Use the central minter so we get the audit row + tight TTL
  // automatically. Falls back to the chat-attachments bucket if the
  // attachment row didn't pin one explicitly (legacy behaviour).
  const bucket = attachment.storage_bucket || 'chat-attachments'
  const result = await mintSignedDocumentUrl(auth.db, {
    bucket,
    path: attachment.storage_path,
    accessorProfileId: auth.profileId,
    filename: attachment.file_name,
    request: req,
    documentId: attachment.id,
    sensitive: !!attachment.is_sensitive,
    download: true,
  })
  if ('error' in result) return fail(result.error, result.status)

  return ok({
    attachment: {
      id: attachment.id,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      mime_type: attachment.mime_type,
      scan_status: attachment.scan_status,
    },
    signed_url: result.signedUrl,
    expires_in: result.ttl ?? DEFAULT_TTL_SECONDS,
  })
}
