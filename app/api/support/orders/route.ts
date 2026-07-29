/**
 * GET /api/support/orders — order list visible to support agents and admins.
 * Filters: ?status=…  &q=<text> (order id prefix / party name fragment)
 *
 * Returns the most recent 100 by default. Pagination via ?before=<created_at>.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!['support', 'admin'].includes(auth.role)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const before = url.searchParams.get('before')
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100))

  let query = auth.db
    .from('orders')
    .select('id, status, escrow_status, client_id, attorney_id, consultant_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (before && /^\d{4}-\d{2}-\d{2}/.test(before)) query = query.lt('created_at', before)
  if (q && /^[0-9a-f-]{8,}/i.test(q)) query = query.gte('id', q).lte('id', q + 'ffff')

  const { data: orders, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Resolve party names in a single follow-up query so the support rail can
  // show "Aanya P · Renu N" instead of UUIDs.
  const partyIds = new Set<string>()
  for (const o of orders ?? []) {
    if (o.client_id) partyIds.add(o.client_id)
    if (o.attorney_id) partyIds.add(o.attorney_id)
    if (o.consultant_id) partyIds.add(o.consultant_id)
  }
  let nameById = new Map<string, string>()
  if (partyIds.size > 0) {
    const { data: profiles } = await auth.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(partyIds))
    nameById = new Map((profiles ?? []).map((p: any) => [p.id, (p.full_name as string) || (p.email as string) || 'Unknown']))
  }

  return Response.json({
    orders: (orders ?? []).map((o: any) => ({
      id:             o.id,
      status:         o.status,
      escrow_status:  o.escrow_status,
      created_at:     o.created_at,
      client:         { id: o.client_id, name: o.client_id ? nameById.get(o.client_id) ?? '—' : '—' },
      seller:         o.attorney_id
        ? { id: o.attorney_id, role: 'attorney', name: nameById.get(o.attorney_id) ?? '—' }
        : o.consultant_id
          ? { id: o.consultant_id, role: 'consultant', name: nameById.get(o.consultant_id) ?? '—' }
          : null,
    })),
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
