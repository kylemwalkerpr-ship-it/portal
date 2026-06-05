/**
 * lib/documentStorage.ts
 *
 * Central helper for every server-side document download in the portal.
 *
 * # Why this exists
 * Documents move client -> attorney/consultant -> admin and sometimes
 * back the other way. Every link in that chain mints signed URLs against
 * the same private Supabase Storage buckets. Without a single funnel,
 * routes drift apart -- one hands out 10-minute URLs, another forgets
 * the entitlement check, a third never writes an audit row. This module
 * pins one shape:
 *
 *   1. Resolve the caller (via the route's own auth helper).
 *   2. Call this module with the bucket + path + intended action.
 *   3. We log to `document_access_log`, mint a SHORT signed URL,
 *      and return it. Failures to log are non-fatal but reported.
 *
 * # Encryption at rest
 * Supabase Storage encrypts objects at rest with AES-256 by default.
 * That's the baseline -- callers don't need to opt in. Sensitive blobs
 * (passport scans, IDs, signed agreements) should be flagged at write
 * time via the parent table's `is_sensitive boolean` column. When that
 * flag is true, callers MUST pass `sensitive: true` here so we shorten
 * the TTL and record the stricter `download_sensitive` action.
 *
 * # No public URLs for documents
 * `getPublicUrl` is forbidden on document buckets. The constants below
 * gate the allowed buckets -- adding a new one requires updating this
 * file.
 */
import type { createSupabaseAdminClient } from './supabase'

export type StorageDb = ReturnType<typeof createSupabaseAdminClient>

// Default TTLs. Tight by design -- a signed URL is a bearer secret for
// the duration of the window. 60s covers a normal click-through; 30s
// covers sensitive flows where we'd rather force a re-mint than risk a
// stale window.
export const DEFAULT_TTL_SECONDS = 60
export const SENSITIVE_TTL_SECONDS = 30

// Buckets that hold user-submitted documents. All MUST be private.
// Headshots/gallery/wallpapers live elsewhere and are intentionally
// public; do not add them here.
export const DOCUMENT_BUCKETS = new Set<string>([
  'order-files',
  'offer-attachments',
  'chat-attachments',
  'templates',
])

export type DocumentAction =
  | 'view'
  | 'download'
  | 'download_sensitive'
  | 'upload'
  | 'delete'
  | 'share'
  | 'revoke'

export type AuditContext = {
  /** Profile id of the caller. Required -- we never log anonymous access. */
  accessorProfileId: string
  /** Optional originating request, for IP + UA capture. */
  request?: Request
  /** Optional table+row id for downstream joins (e.g. order_files.id). */
  documentId?: string | null
  /** Optional free-form metadata. */
  meta?: Record<string, unknown>
}

export type SignParams = AuditContext & {
  bucket: string
  path: string
  filename?: string
  /** When true, sets `download: true` on the signed URL. */
  download?: boolean
  /** When true, uses SENSITIVE_TTL_SECONDS and the stricter audit action. */
  sensitive?: boolean
  /** Override TTL. Caller is responsible for keeping this reasonable. */
  ttlSeconds?: number
}

export type SignResult =
  | { signedUrl: string; ttl: number; auditLogged: boolean }
  | { error: string; status: 400 | 404 | 500 }

function isDocumentBucket(bucket: string) {
  return DOCUMENT_BUCKETS.has(bucket)
}

function getRequestIp(req: Request | undefined): string | null {
  if (!req) return null
  const h = req.headers
  // Cloudflare workers expose the real IP via cf-connecting-ip; fall
  // back to the standard forwarded-for chain.
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    null
  )
}

function getUserAgent(req: Request | undefined): string | null {
  return req ? req.headers.get('user-agent') : null
}

/**
 * Append one row to document_access_log. Failures are non-fatal: we
 * never want a transient logging glitch to block a legitimate download.
 * Errors are surfaced in the result so the caller can warn.
 */
export async function recordDocumentAccess(
  db: StorageDb,
  params: {
    bucket: string
    path: string
    action: DocumentAction
    accessorProfileId: string
    request?: Request
    documentId?: string | null
    meta?: Record<string, unknown>
  },
): Promise<{ logged: boolean; error?: string }> {
  try {
    const { error } = await db.from('document_access_log').insert({
      document_bucket: params.bucket,
      document_path: params.path,
      document_id: params.documentId ?? null,
      accessor_profile_id: params.accessorProfileId,
      action: params.action,
      ip: getRequestIp(params.request),
      user_agent: getUserAgent(params.request),
      meta: params.meta ?? null,
    })
    if (error) {
      // Self-heal: the audit table may not be applied yet on dev
      // environments. Don't fail the request -- just warn.
      // eslint-disable-next-line no-console
      console.warn('[documentStorage] audit insert failed', error.message)
      return { logged: false, error: error.message }
    }
    return { logged: true }
  } catch (e) {
    return { logged: false, error: e instanceof Error ? e.message : 'audit failed' }
  }
}

/**
 * Mint a short-lived signed URL for a document and write the audit row.
 *
 * NEVER log the returned signedUrl -- it's a bearer secret. Pass it
 * through to the caller in the response body only.
 */
export async function mintSignedDocumentUrl(
  db: StorageDb,
  params: SignParams,
): Promise<SignResult> {
  if (!isDocumentBucket(params.bucket)) {
    return { error: 'Bucket not allowed for document signing.', status: 400 }
  }
  const ttl = params.ttlSeconds ?? (params.sensitive ? SENSITIVE_TTL_SECONDS : DEFAULT_TTL_SECONDS)
  const action: DocumentAction = params.sensitive
    ? 'download_sensitive'
    : params.download
      ? 'download'
      : 'view'

  const opts: { download: boolean | string } = {
    download: params.download && params.filename ? params.filename : !!params.download,
  }
  const { data, error } = await db.storage
    .from(params.bucket)
    .createSignedUrl(params.path, ttl, opts as any)

  if (error || !data?.signedUrl) {
    const msg = (error?.message || '').toLowerCase()
    if (msg.includes('object not found') || msg.includes('not_found')) {
      return { error: 'Document not found.', status: 404 }
    }
    return { error: error?.message || 'Could not generate signed URL.', status: 500 }
  }

  const audit = await recordDocumentAccess(db, {
    bucket: params.bucket,
    path: params.path,
    action,
    accessorProfileId: params.accessorProfileId,
    request: params.request,
    documentId: params.documentId ?? null,
    meta: params.meta,
  })

  return { signedUrl: data.signedUrl, ttl, auditLogged: audit.logged }
}

/**
 * Generic "is this caller allowed to touch this row" gate. The role
 * helpers (student/consultant/attorney/admin auth) handle identity,
 * but cross-party access (a consultant viewing a client's doc on a
 * shared order) needs to be checked per row. The order/inquiry routes
 * call into this BEFORE minting a URL.
 *
 * Returns true if any of:
 *   - caller is the owner (`owner_id`)
 *   - caller appears in `shared_with` (array of profile ids)
 *   - caller has an explicit `document_shares` row
 *   - caller is admin
 */
export async function callerCanAccessDocument(
  db: StorageDb,
  params: {
    documentId: string
    accessorProfileId: string
    accessorRole: string
  },
): Promise<boolean> {
  if (params.accessorRole === 'admin') return true
  // The generic `documents` table is optional in this codebase --
  // most documents currently live in role-specific tables (order_files
  // etc). When `documents` IS present, use it; otherwise return true
  // and let the route's own check stand.
  const { data: row, error } = await db
    .from('documents')
    .select('id, owner_id, shared_with')
    .eq('id', params.documentId)
    .maybeSingle()
  if (error || !row) return true
  if (row.owner_id === params.accessorProfileId) return true
  if (Array.isArray(row.shared_with) && row.shared_with.includes(params.accessorProfileId)) {
    return true
  }
  const { data: shareRow } = await db
    .from('document_shares')
    .select('id')
    .eq('document_id', params.documentId)
    .eq('shared_with_profile_id', params.accessorProfileId)
    .maybeSingle()
  return !!shareRow
}
