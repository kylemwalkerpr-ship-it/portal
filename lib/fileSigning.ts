/**
 * lib/fileSigning.ts
 *
 * Thin compatibility shim for older call sites. New code should use
 * `lib/documentStorage.ts` directly. This file preserves the old
 * `signOrderFileUrl` helper so existing routes can be migrated in
 * small steps without breaking the green build.
 */
import { mintSignedDocumentUrl, type StorageDb } from './documentStorage'

const ORDER_FILES_BUCKET = 'order-files'

export type SignOptions = {
  accessorProfileId: string
  filename?: string
  request?: Request
  documentId?: string | null
  sensitive?: boolean
  download?: boolean
}

/**
 * Mint a signed URL for one order_files row. Writes an audit entry.
 * Routes that just want a URL with no extra ceremony can call this
 * instead of touching the storage client directly.
 */
export async function signOrderFileUrl(
  db: StorageDb,
  storagePath: string,
  opts: SignOptions,
): Promise<string | null> {
  const result = await mintSignedDocumentUrl(db, {
    bucket: ORDER_FILES_BUCKET,
    path: storagePath,
    accessorProfileId: opts.accessorProfileId,
    filename: opts.filename,
    request: opts.request,
    documentId: opts.documentId ?? null,
    sensitive: opts.sensitive ?? false,
    download: opts.download ?? false,
  })
  if ('error' in result) return null
  return result.signedUrl
}
