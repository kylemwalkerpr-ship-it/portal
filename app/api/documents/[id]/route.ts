/**
 * DELETE /api/documents/[id]
 *
 * Owner or admin can soft-delete an order_files row. Writes a `delete`
 * audit entry and removes the storage object so the bytes go but the
 * audit history stays queryable.
 *
 * Why "soft": GDPR-style content removal without losing the record of
 * who accessed it before deletion. The row stays with is_deleted=true.
 *
 * Why no GET on /api/documents/[id]: per-role list/url routes already
 * cover the read path with role-aware entitlement checks. A generic
 * GET would either duplicate that logic or weaken it.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { recordDocumentAccess } from '@/lib/documentStorage'

const BUCKET = 'order-files'

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  if (!id) return fail('id is required.', 400)

  const { data: row, error } = await auth.db
    .from('order_files')
    .select('id, storage_path, uploader_id, order_id')
    .eq('id', id)
    .single()
  if (error || !row) {
    // Generic 404 -- never confirm whether the row exists for a non-owner.
    return fail('File not found.', 404)
  }

  // Owner or admin only. Other parties on the order (e.g. the consultant
  // looking at a client-uploaded passport scan) MUST NOT be able to
  // delete it -- they can only view it.
  const isOwner = row.uploader_id === auth.profileId
  if (!isOwner && auth.role !== 'admin') {
    return fail('Forbidden.', 403)
  }

  // Soft-delete with audit columns; fall back to hard delete on legacy
  // schemas. Either way the storage object goes.
  const soft = await auth.db
    .from('order_files')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: auth.profileId,
    })
    .eq('id', id)
  if (soft.error && /column .*(is_deleted|deleted_at|deleted_by).* does not exist/i.test(soft.error.message || '')) {
    await auth.db.from('order_files').delete().eq('id', id)
  }

  await auth.db.storage.from(BUCKET).remove([row.storage_path])

  await recordDocumentAccess(auth.db, {
    bucket: BUCKET,
    path: row.storage_path,
    action: 'delete',
    accessorProfileId: auth.profileId,
    request: req,
    documentId: id,
  })

  return ok({ ok: true })
}
