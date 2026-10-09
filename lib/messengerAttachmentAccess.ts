/**
 * lib/messengerAttachmentAccess.ts
 *
 * Messenger attachments (paperclip uploads + voice notes) live in the
 * PRIVATE `message-attachments` bucket. Nothing in the app may hand out a
 * public object URL for it. Instead every message row stores a stable,
 * same-origin proxy path (`/api/messages/attachments/<messageId>`). That
 * route re-checks that the caller is a conversation participant (or
 * support/admin) and then redirects to a short-lived signed URL.
 *
 * Legacy rows that still carry a `/storage/v1/object/public/...` URL are
 * resolved through `metadata.storage_path` or by parsing the old URL, so
 * they keep working once the bucket is private.
 */
export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments'

/** Signed URL lifetime. Long enough for an <audio> element to buffer a
 *  voice note, short enough that a leaked URL dies quickly. */
export const MESSAGE_ATTACHMENT_SIGNED_TTL_SECONDS = 300

/** Roles that may open any conversation attachment (moderation/support). */
const STAFF_ROLES = new Set(['admin', 'support'])

const PROXY_PREFIX = '/api/messages/attachments/'
const LEGACY_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/message-attachments\/([^?#]+)/

export function messageAttachmentProxyPath(messageId: string): string {
  return `${PROXY_PREFIX}${encodeURIComponent(messageId)}`
}

export function isMessageAttachmentProxyPath(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PROXY_PREFIX)
}

function cleanPath(raw: string): string | null {
  let path = raw
  try {
    path = decodeURIComponent(raw)
  } catch {
    /* keep raw */
  }
  path = path.replace(/^\/+/, '')
  if (!path || path.includes('..') || path.includes('\\') || path.includes('\0')) return null
  return path
}

/** Resolve the object path inside the bucket for a conversation_messages row. */
export function resolveMessageAttachmentPath(row: {
  attachment_url?: string | null
  metadata?: Record<string, any> | null
}): string | null {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null
  const fromMeta = typeof meta?.storage_path === 'string' ? meta.storage_path : ''
  if (fromMeta) return cleanPath(fromMeta)
  const url = typeof row?.attachment_url === 'string' ? row.attachment_url : ''
  const m = url.match(LEGACY_URL_RE)
  return m ? cleanPath(m[1]) : null
}

/** True when the row's attachment lives in the message-attachments bucket. */
export function isMessageAttachmentRow(row: {
  attachment_url?: string | null
  metadata?: Record<string, any> | null
}): boolean {
  const url = typeof row?.attachment_url === 'string' ? row.attachment_url : ''
  if (!url) return false
  return isMessageAttachmentProxyPath(url) || LEGACY_URL_RE.test(url)
}

export function canOpenConversationAttachment(
  conv: { participant_a?: string | null; participant_b?: string | null } | null | undefined,
  caller: { profileId: string; role?: string | null },
): boolean {
  if (!conv || !caller?.profileId) return false
  if (caller.role && STAFF_ROLES.has(caller.role)) return true
  return conv.participant_a === caller.profileId || conv.participant_b === caller.profileId
}

export async function signMessageAttachment(
  db: any,
  path: string,
  opts: { ttlSeconds?: number; downloadName?: string | null } = {},
): Promise<string | null> {
  const ttl = opts.ttlSeconds ?? MESSAGE_ATTACHMENT_SIGNED_TTL_SECONDS
  const signOpts = opts.downloadName ? { download: opts.downloadName } : undefined
  const { data, error } = await db.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, ttl, signOpts as any)
  if (error || !data?.signedUrl) return null
  return data.signedUrl as string
}

/**
 * For API payloads consumed by clients that cannot send the portal session
 * cookie (the native mobile app), swap each message-attachments URL for a
 * freshly signed one. Call ONLY after the caller's participant check passed.
 */
export async function withSignedMessageAttachmentUrls<T extends Record<string, any>>(
  db: any,
  messages: T[],
): Promise<T[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (!isMessageAttachmentRow(m)) return m
      const path = resolveMessageAttachmentPath(m)
      if (!path) return { ...m, attachment_url: null }
      const signed = await signMessageAttachment(db, path).catch(() => null)
      return { ...m, attachment_url: signed }
    }),
  )
}

/** Server-side byte fetch (AI summaries). Never exposes a URL. */
export async function downloadMessageAttachment(db: any, path: string): Promise<ArrayBuffer | null> {
  try {
    const { data, error } = await db.storage.from(MESSAGE_ATTACHMENTS_BUCKET).download(path)
    if (error || !data) return null
    return await data.arrayBuffer()
  } catch {
    return null
  }
}
