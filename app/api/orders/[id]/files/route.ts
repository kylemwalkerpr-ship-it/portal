/**
 * GET  /api/orders/:id/files   — list an order's files (deliverables + uploads)
 * POST /api/orders/:id/files   — upload a file to the order
 *
 * Shared across order participants (client, consultant, attorney). Providers use
 * it to submit completed DELIVERABLES from the order-detail view; clients see
 * them here and in Documents. Files live in the `order-files` bucket and the
 * `order_files` table, served via short-lived signed URLs.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { mintSignedDocumentUrl, recordDocumentAccess, DEFAULT_TTL_SECONDS } from '@/lib/documentStorage'
import { validateUpload, safeDisplayName, DEFAULT_MAX_BYTES } from '@/lib/uploadAuth'

const BUCKET = 'order-files'

type Db = ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>

/** A participant is the order's client, its provider (consultant_id holds the
 *  provider profile for both consultants and attorneys), or an admin. */
async function loadOrderForParticipant(db: Db, orderId: string, profileId: string, role: string) {
  const { data: order } = await db
    .from('orders')
    .select('id, client_id, consultant_id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { error: 'Order not found', status: 404 as const }
  const isParticipant = order.client_id === profileId || order.consultant_id === profileId || role === 'admin'
  if (!isParticipant) return { error: 'Forbidden', status: 403 as const }
  return { order }
}

async function listOrderFilesWithUrls(db: Db, orderId: string, accessorProfileId: string, request?: Request) {
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
  if (res.error) throw new Error(res.error.message)

  const rows = (res.data ?? []).filter((r: any) => !r.is_deleted)
  const uploaderIds = Array.from(new Set(rows.map((r: any) => r.uploader_id).filter(Boolean)))
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name, email').in('id', uploaderIds as string[])
    for (const p of profiles ?? []) uploaderNames.set((p as any).id, (p as any).full_name || (p as any).email || 'User')
  }

  return Promise.all(
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
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params

  const guard = await loadOrderForParticipant(auth.db, id, auth.profileId, auth.role)
  if ('error' in guard) return Response.json({ error: guard.error }, { status: guard.status })

  try {
    const files = await listOrderFilesWithUrls(auth.db, id, auth.profileId, req)
    return Response.json({ files })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to list files' }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params

  const guard = await loadOrderForParticipant(auth.db, id, auth.profileId, auth.role)
  if ('error' in guard) return Response.json({ error: guard.error }, { status: guard.status })

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

  const displayName = safeDisplayName(file.name, 'deliverable')
  const path = `${id}/${validation.safeName}`

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, validation.bytes, {
    contentType: validation.mime,
    upsert: false,
  })
  if (uploadErr) return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })

  const baseRow = {
    order_id: id,
    uploader_id: auth.profileId,
    uploader_role: auth.role,
    name: displayName,
    mime_type: validation.mime,
    size_bytes: file.size,
    storage_path: path,
  }
  let row: any
  let insertErr: any
  {
    const res = await auth.db
      .from('order_files')
      .insert({ ...baseRow, is_sensitive: isSensitive })
      .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, is_sensitive, created_at')
      .single()
    row = res.data
    insertErr = res.error
    if (insertErr && /column .*is_sensitive.* does not exist/i.test(insertErr.message || '')) {
      const retry = await auth.db
        .from('order_files')
        .insert(baseRow)
        .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
        .single()
      row = retry.data
      insertErr = retry.error
    }
  }
  if (insertErr || !row) {
    await auth.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: 'Could not save the file.' }, { status: 500 })
  }

  await recordDocumentAccess(auth.db, {
    bucket: BUCKET,
    path,
    action: 'upload',
    accessorProfileId: auth.profileId,
    request: req,
    documentId: row.id,
  })

  const signed = await mintSignedDocumentUrl(auth.db, {
    bucket: BUCKET,
    path,
    accessorProfileId: auth.profileId,
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
      is_sensitive: !!row.is_sensitive,
      created_at: row.created_at,
      url: 'signedUrl' in signed ? signed.signedUrl : null,
      url_ttl: 'ttl' in signed ? signed.ttl : DEFAULT_TTL_SECONDS,
    },
  })
}
