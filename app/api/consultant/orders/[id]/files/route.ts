import { getCurrentConsultant } from '@/lib/consultant'

const BUCKET = 'order-files'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const SIGNED_URL_TTL = 60 * 10 // 10 minutes

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'file'
}

async function listOrderFilesWithUrls(db: ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>, orderId: string) {
  const { data, error } = await db
    .from('order_files')
    .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const uploaderIds = Array.from(new Set(rows.map(r => r.uploader_id).filter(Boolean)))
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name, email').in('id', uploaderIds)
    for (const p of profiles ?? []) {
      uploaderNames.set(p.id, p.full_name || p.email || 'User')
    }
  }

  const signed = await Promise.all(
    rows.map(async row => {
      const { data: link } = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL)
      return {
        id: row.id,
        name: row.name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        uploader_id: row.uploader_id,
        uploader_role: row.uploader_role,
        uploader_name: uploaderNames.get(row.uploader_id) || 'User',
        created_at: row.created_at,
        url: link?.signedUrl ?? null,
      }
    }),
  )
  return signed
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('id, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

  try {
    const files = await listOrderFilesWithUrls(auth.db, id)
    return Response.json({ files })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to list files' }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('id, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
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
  if (file.size === 0) return Response.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit` }, { status: 413 })

  const cleanName = safeFileName(file.name || 'upload')
  const path = `${id}/${crypto.randomUUID()}_${cleanName}`
  const buf = await file.arrayBuffer()

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadErr) {
    return Response.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: row, error: insertErr } = await auth.db
    .from('order_files')
    .insert({
      order_id: id,
      uploader_id: auth.profile.id,
      uploader_role: 'consultant',
      name: file.name || cleanName,
      mime_type: file.type || null,
      size_bytes: file.size,
      storage_path: path,
    })
    .select('id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
    .single()
  if (insertErr) {
    await auth.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  const { data: link } = await auth.db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)

  return Response.json({
    file: {
      id: row.id,
      name: row.name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      uploader_id: row.uploader_id,
      uploader_role: row.uploader_role,
      uploader_name: auth.profile.full_name || auth.profile.email || 'You',
      created_at: row.created_at,
      url: link?.signedUrl ?? null,
    },
  })
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const url = new URL(req.url)
  const fileId = url.searchParams.get('fileId')
  if (!fileId) return Response.json({ error: 'fileId is required' }, { status: 400 })

  const { data: order } = await auth.db
    .from('orders')
    .select('id, consultant_id')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
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

  await auth.db.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await auth.db.from('order_files').delete().eq('id', fileId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
