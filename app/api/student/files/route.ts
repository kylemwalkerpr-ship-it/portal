import { getCurrentStudent } from '@/lib/student'
import { mintSignedDocumentUrl, DEFAULT_TTL_SECONDS } from '@/lib/documentStorage'

const BUCKET = 'order-files'

export async function GET(req?: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile } = auth

  const { data: orders, error: ordersErr } = await db
    .from('orders')
    .select('id, created_at')
    .eq('client_id', profile.id)
    .order('created_at', { ascending: false })
  if (ordersErr) return Response.json({ error: ordersErr.message }, { status: 500 })

  const orderIds = (orders ?? []).map(o => o.id)
  if (orderIds.length === 0) return Response.json({ files: [] })

  const { data: items } = await db
    .from('order_items')
    .select('order_id, service_id')
    .in('order_id', orderIds)

  const serviceIds = Array.from(new Set((items ?? []).map(i => i.service_id).filter(Boolean)))
  const { data: services } = serviceIds.length > 0
    ? await db.from('services').select('id, title').in('id', serviceIds)
    : { data: [] as { id: string; title: string }[] }

  const serviceTitleByOrder = new Map<string, string>()
  for (const item of items ?? []) {
    const svc = (services ?? []).find(s => s.id === item.service_id)
    if (svc) serviceTitleByOrder.set(item.order_id, svc.title)
  }

  let { data: rows, error } = await db
    .from('order_files')
    .select('id, order_id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, is_sensitive, is_deleted, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })
  if (error && /column .*(is_sensitive|is_deleted).* does not exist/i.test(error.message || '')) {
    const fallback = await db
      .from('order_files')
      .select('id, order_id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
    rows = fallback.data as any
    error = fallback.error
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })
  rows = (rows ?? []).filter((r: any) => !r.is_deleted)

  const uploaderIds = Array.from(new Set((rows ?? []).map(r => r.uploader_id).filter(Boolean)))
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name, email').in('id', uploaderIds)
    for (const p of profiles ?? []) {
      uploaderNames.set(p.id, p.full_name || p.email || 'User')
    }
  }

  const files = await Promise.all(
    (rows ?? []).map(async (row: any) => {
      const sign = await mintSignedDocumentUrl(db, {
        bucket: BUCKET,
        path: row.storage_path,
        accessorProfileId: profile.id,
        filename: row.name,
        request: req,
        documentId: row.id,
        sensitive: !!row.is_sensitive,
        download: false,
      })
      return {
        id: row.id,
        order_id: row.order_id,
        order_title: serviceTitleByOrder.get(row.order_id) || 'Order',
        name: row.name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        uploader_id: row.uploader_id,
        uploader_role: row.uploader_role,
        uploader_name: uploaderNames.get(row.uploader_id) || 'User',
        is_sensitive: !!row.is_sensitive,
        created_at: row.created_at,
        url: 'signedUrl' in sign ? sign.signedUrl : null,
        url_ttl: 'ttl' in sign ? sign.ttl : DEFAULT_TTL_SECONDS,
        is_mine: row.uploader_id === profile.id,
      }
    }),
  )

  return Response.json({ files })
}
