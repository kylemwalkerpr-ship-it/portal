/**
 * GET /api/student/documents
 * Paginated, filterable file list across all the student's orders.
 *
 * Query params:
 *   order_id   — limit to one order
 *   uploader   — client | consultant | all
 *   type       — pdf | image | doc | other | all (matched on mime_type / extension)
 *   q          — search filename
 *   from       — ISO date
 *   to         — ISO date
 *   sort       — created_at | name | size_bytes
 *   dir        — asc | desc
 *   page       — 1-indexed (default 1)
 *   page_size  — default 25, max 100
 *
 * The endpoint deliberately does NOT pre-sign URLs — signing costs a Supabase
 * Storage round trip per file, which scales linearly with page size. Use
 * /api/student/documents/:id/url to mint a signed URL on demand.
 */
import { getCurrentStudent } from '@/lib/student'

const TYPE_MATCHERS: Record<string, (mime: string, name: string) => boolean> = {
  pdf:   (m, n) => /pdf/i.test(m) || /\.pdf$/i.test(n),
  image: (m, n) => /^image\//i.test(m) || /\.(jpe?g|png|gif|webp|heic|svg)$/i.test(n),
  doc:   (m, n) => /(word|msword|officedocument|opendocument|rtf)/i.test(m) || /\.(docx?|odt|rtf|pages)$/i.test(n),
  sheet: (m, n) => /(excel|spreadsheetml|opendocument.spreadsheet)/i.test(m) || /\.(xlsx?|ods|numbers|csv)$/i.test(n),
}

export async function GET(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { searchParams } = new URL(req.url)
  const orderId    = searchParams.get('order_id') || ''
  const uploader   = searchParams.get('uploader') || 'all'
  const type       = searchParams.get('type')     || 'all'
  const q          = searchParams.get('q')?.trim() || ''
  const fromISO    = searchParams.get('from')     || ''
  const toISO      = searchParams.get('to')       || ''
  const sort       = ['created_at', 'name', 'size_bytes'].includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'created_at'
  const dir        = searchParams.get('dir') === 'asc'
  const page       = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize   = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Step 1 — resolve the student's order ids (so the file query is bounded).
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, requirements, created_at')
    .eq('client_id', profile.id)
    .order('created_at', { ascending: false })
  const orderRows = orders ?? []
  const orderIds = orderRows.map(o => o.id)
  if (!orderIds.length) {
    return Response.json({ files: [], total: 0, page: 1, page_size: pageSize, total_pages: 1, has_more: false, orders: [] })
  }

  // Step 2 — service titles (for order labels)
  const { data: items } = await db.from('order_items').select('order_id, service_id').in('order_id', orderIds)
  const serviceIds = Array.from(new Set((items ?? []).map((i: any) => i.service_id).filter(Boolean)))
  const { data: services } = serviceIds.length
    ? await db.from('services').select('id, title').in('id', serviceIds)
    : { data: [] }
  const serviceTitleByOrder = new Map<string, string>()
  for (const it of items ?? []) {
    const svc = (services ?? []).find((s: any) => s.id === (it as any).service_id)
    if (svc) serviceTitleByOrder.set((it as any).order_id, (svc as any).title)
  }
  const orderInfo = orderRows.map(o => ({
    id: o.id,
    order_number: o.order_number || null,
    title: serviceTitleByOrder.get(o.id) || o.requirements || 'Order',
  }))

  // Step 3 — query files. Server-side filter what we can; type filter is
  // applied client-side after the page is read (we'd otherwise need an
  // OR-chain across mime + name).
  let qb = db
    .from('order_files')
    .select('id, order_id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, is_sensitive, is_deleted, created_at', { count: 'exact' })
    .in('order_id', orderIds)
    .order(sort, { ascending: dir })

  if (orderId) qb = qb.eq('order_id', orderId)
  if (uploader !== 'all') qb = qb.eq('uploader_role', uploader)
  if (q) qb = qb.ilike('name', `%${q}%`)
  if (fromISO) qb = qb.gte('created_at', fromISO)
  if (toISO) qb = qb.lte('created_at', new Date(new Date(toISO).getTime() + 86_400_000).toISOString())

  // We can't easily paginate when also applying a JS-side type filter, so when
  // a type filter is active we pull a larger window and filter+paginate in JS.
  if (type === 'all') {
    qb = qb.range((page - 1) * pageSize, page * pageSize - 1)
  } else {
    qb = qb.limit(500) // upper bound — covers ~500 files of any type
  }

  let { data: rows, error, count } = await qb
  // Self-heal: drop is_sensitive/is_deleted from the SELECT if the
  // migration hasn't been applied yet so the route doesn't 500.
  if (error && /column .*(is_sensitive|is_deleted).* does not exist/i.test(error.message || '')) {
    let qb2 = db
      .from('order_files')
      .select('id, order_id, name, mime_type, size_bytes, storage_path, uploader_id, uploader_role, created_at', { count: 'exact' })
      .in('order_id', orderIds)
      .order(sort, { ascending: dir })
    if (orderId) qb2 = qb2.eq('order_id', orderId)
    if (uploader !== 'all') qb2 = qb2.eq('uploader_role', uploader)
    if (q) qb2 = qb2.ilike('name', `%${q}%`)
    if (fromISO) qb2 = qb2.gte('created_at', fromISO)
    if (toISO) qb2 = qb2.lte('created_at', new Date(new Date(toISO).getTime() + 86_400_000).toISOString())
    if (type === 'all') qb2 = qb2.range((page - 1) * pageSize, page * pageSize - 1)
    else qb2 = qb2.limit(500)
    const retry = await qb2
    rows = retry.data as any
    error = retry.error
    count = retry.count
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let list = (rows ?? []).filter((r: any) => !r.is_deleted)
  if (type !== 'all') {
    const matcher = TYPE_MATCHERS[type] || (() => true)
    list = list.filter((r: any) => matcher(r.mime_type || '', r.name || ''))
  }
  const total = type === 'all' ? (count ?? 0) : list.length
  const paged = type === 'all' ? list : list.slice((page - 1) * pageSize, page * pageSize)

  // Hydrate uploader names (page-scope only)
  const uploaderIds = Array.from(new Set(paged.map((r: any) => r.uploader_id).filter(Boolean)))
  const uploaderNames = new Map<string, string>()
  if (uploaderIds.length) {
    const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', uploaderIds)
    for (const p of profs ?? []) uploaderNames.set((p as any).id, (p as any).full_name || (p as any).email || 'User')
  }

  const files = paged.map((row: any) => ({
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
    is_mine: row.uploader_id === profile.id,
  }))

  return Response.json({
    files,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    orders: orderInfo,
  })
}
