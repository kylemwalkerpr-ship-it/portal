/**
 * GET /api/student/documents/[id]/url
 *
 * Mints a fresh short-lived signed URL for one file. Ownership-checked
 * against the parent order, audited, and -- when the file is flagged
 * sensitive -- minted with a 30s TTL and the `download_sensitive`
 * audit action.
 *
 * Optional query params:
 *   download=1  -- force a Content-Disposition: attachment response
 */
import { getCurrentStudent } from '@/lib/student'
import { mintSignedDocumentUrl } from '@/lib/documentStorage'

const BUCKET = 'order-files'

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { id } = await context.params
  if (!id) return Response.json({ error: 'File id required' }, { status: 400 })

  // Pull is_sensitive when the migration has run; fall back gracefully.
  let file: any
  {
    const res = await db
      .from('order_files')
      .select('id, order_id, storage_path, name, mime_type, is_sensitive, is_deleted')
      .eq('id', id)
      .single()
    if (res.error && /column .*(is_sensitive|is_deleted).* does not exist/i.test(res.error.message || '')) {
      const fallback = await db
        .from('order_files')
        .select('id, order_id, storage_path, name, mime_type')
        .eq('id', id)
        .single()
      file = fallback.data
    } else {
      file = res.data
    }
  }
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 })
  if (file.is_deleted) return Response.json({ error: 'File not found' }, { status: 404 })

  const { data: order } = await db
    .from('orders')
    .select('client_id')
    .eq('id', file.order_id)
    .single()
  if (!order || order.client_id !== profile.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const download = url.searchParams.get('download') === '1'

  const result = await mintSignedDocumentUrl(db, {
    bucket: BUCKET,
    path: file.storage_path,
    accessorProfileId: profile.id,
    filename: file.name,
    request: req,
    documentId: file.id,
    sensitive: !!file.is_sensitive,
    download,
  })
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({
    url: result.signedUrl,
    name: file.name,
    mime_type: file.mime_type,
    expires_in: result.ttl,
    is_sensitive: !!file.is_sensitive,
  })
}
