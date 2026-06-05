import { getCurrentStudent } from '@/lib/student'
import { mintSignedDocumentUrl, recordDocumentAccess, DEFAULT_TTL_SECONDS } from '@/lib/documentStorage'
import { validateUpload, safeDisplayName, DEFAULT_MAX_BYTES } from '@/lib/uploadAuth'

const BUCKET = 'order-files'

async function listOrderFilesWithUrls(
  db: ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>,
  orderId: string,
  accessorProfileId: string,
  request?: Request,
) {
  // Self-heal for environments where the security migration hasn't
  // been applied yet -- fall back to the legacy SELECT.
  // Self-heal: drop the new columns from the SELECT when the migration
  // hasn't been applied yet, so the route never 500s for missing fields.
  let res: any = await db
    .from('order_files')
    .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, is_sensitive, is_deleted, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (res.error && /column .*(is_sensitive|is_deleted).* does not exist/i.test(res.error.message || '')) {
    res = await db
      .from('order_files')
      .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
  }
  const data = res.data
  const error = res.error
  if (error) throw new Error(error.message)

  const rows = (data ?? []).filter((r: any) => !r.is_deleted)
  const uploaderIds = Array.from(new Set(rows.map((r: any) => r.uploader_id).filter(Boolean)))
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name, email').in('id', uploaderIds)
    for (const p of profiles ?? []) {
      uploaderNames.set(p.id, p.full_name || p.email || 'User')
    }
  }

  const signed = await Promise.all(
    rows.map(async (row: any) => {
      const result = await mintSignedDocumentUrl(db, {
        bucket: BUCKET,
        path: row.storage_path,
        accessorProfileId,
        filename: row.name,
        request,
        documentId: row.id,
        sensitive: !!row.is_sensitive,
        download: false,
      })
      return {
        id: row.id,
        name: row.name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        uploader_id: row.uploader_id,
        uploader_role: row.uploader_role,
        uploader_name: uploaderNames.get(row.uploader_id) || 'User',
        is_sensitive: !!row.is_sensitive,
        created_at: row.created_at,
        url: 'signedUrl' in result ? result.signedUrl : null,
        url_ttl: 'ttl' in result ? result.ttl : DEFAULT_TTL_SECONDS,
      }
    }),
  )
  return signed
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id')
    .eq('id', id)
    .eq('client_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  try {
    const files = await listOrderFilesWithUrls(auth.db, id, auth.profile.id, req)
    return Response.json({ files })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to list files' }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id')
    .eq('id', id)
    .eq('client_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file field is required' }, { status: 400 })

  const isSensitive = form.get('sensitive') === 'true'
  const validation = await validateUpload(file, { maxBytes: DEFAULT_MAX_BYTES })
  if (!validation.ok) {
    const v = validation as { ok: false; error: string; status: 400 | 413 | 415 | 422 }
    return Response.json({ error: v.error }, { status: v.status })
  }

  const displayName = safeDisplayName(file.name, 'upload')
  const path = `${id}/${validation.safeName}`

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, validation.bytes, {
    contentType: validation.mime,
    upsert: false,
  })
  if (uploadErr) {
    // Never echo the raw upstream error -- it can leak bucket-config details.
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  let row: any
  let insertErr: any
  {
    const res = await auth.db
      .from('order_files')
      .insert({
        order_id: id,
        uploader_id: auth.profile.id,
        uploader_role: 'client',
        name: displayName,
        mime_type: validation.mime,
        size_bytes: file.size,
        storage_path: path,
        is_sensitive: isSensitive,
      })
      .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, is_sensitive, created_at')
      .single()
    row = res.data
    insertErr = res.error
    // Self-heal: drop is_sensitive if the column doesn't exist yet.
    if (insertErr && /column .*is_sensitive.* does not exist/i.test(insertErr.message || '')) {
      const retry = await auth.db
        .from('order_files')
        .insert({
          order_id: id,
          uploader_id: auth.profile.id,
          uploader_role: 'client',
          name: displayName,
          mime_type: validation.mime,
          size_bytes: file.size,
          storage_path: path,
        })
        .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
        .single()
      row = retry.data
      insertErr = retry.error
    }
  }
  if (insertErr || !row) {
    await auth.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: 'Could not save attachment.' }, { status: 500 })
  }

  await recordDocumentAccess(auth.db, {
    bucket: BUCKET,
    path,
    action: 'upload',
    accessorProfileId: auth.profile.id,
    request: req,
    documentId: row.id,
  })

  const signed = await mintSignedDocumentUrl(auth.db, {
    bucket: BUCKET,
    path,
    accessorProfileId: auth.profile.id,
    filename: displayName,
    request: req,
    documentId: row.id,
    sensitive: isSensitive,
    download: false,
  })

  return Response.json({
    file: {
      id: row.id,
      name: row.name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      uploader_id: row.uploader_id,
      uploader_role: row.uploader_role,
      uploader_name: auth.profile.full_name || auth.profile.email || 'You',
      is_sensitive: !!row.is_sensitive || isSensitive,
      created_at: row.created_at,
      url: 'signedUrl' in signed ? signed.signedUrl : null,
      url_ttl: 'ttl' in signed ? signed.ttl : DEFAULT_TTL_SECONDS,
    },
  })
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const url = new URL(req.url)
  const fileId = url.searchParams.get('fileId')
  if (!fileId) return Response.json({ error: 'fileId is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id')
    .eq('id', id)
    .eq('client_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  const { data: row } = await auth.db
    .from('order_files')
    .select('id, storage_path, uploader_id')
    .eq('id', fileId)
    .eq('order_id', id)
    .single()
  if (!row) return Response.json({ error: 'File not found' }, { status: 404 })
  if (row.uploader_id !== auth.profile.id) {
    return Response.json({ error: 'You can only delete files you uploaded' }, { status: 403 })
  }

  // Soft-delete first so the audit trail keeps the row queryable. If
  // the column hasn't been added yet, fall back to a hard delete.
  const soft = await auth.db
    .from('order_files')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: auth.profile.id })
    .eq('id', fileId)
  if (soft.error && /column .*(is_deleted|deleted_at|deleted_by).* does not exist/i.test(soft.error.message || '')) {
    await auth.db.from('order_files').delete().eq('id', fileId)
  }

  // Remove the storage object regardless -- the row stays for audit
  // but the bytes go. This is the right trade-off: GDPR-style removal
  // of contents, no full forgetting of the access record.
  await auth.db.storage.from(BUCKET).remove([row.storage_path])

  await recordDocumentAccess(auth.db, {
    bucket: BUCKET,
    path: row.storage_path,
    action: 'delete',
    accessorProfileId: auth.profile.id,
    request: req,
    documentId: fileId,
  })

  return Response.json({ ok: true })
}
