/**
 * GET /api/student/documents/stats
 * Counts + total size for the dashboard tiles.
 */
import { getCurrentStudent } from '@/lib/student'

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { data: orders } = await db.from('orders').select('id').eq('client_id', profile.id)
  const orderIds = (orders ?? []).map(o => o.id)
  if (!orderIds.length) {
    return Response.json({ stats: { total: 0, mine: 0, theirs: 0, totalBytes: 0, last7d: 0 } })
  }

  const { data: rows, error } = await db
    .from('order_files')
    .select('id, uploader_role, uploader_id, size_bytes, created_at')
    .in('order_id', orderIds)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const list = rows ?? []
  const sevenDaysAgo = Date.now() - 7 * 86_400_000

  return Response.json({
    stats: {
      total:      list.length,
      mine:       list.filter((r: any) => r.uploader_id === profile.id).length,
      theirs:     list.filter((r: any) => r.uploader_id !== profile.id).length,
      totalBytes: list.reduce((s: number, r: any) => s + Number(r.size_bytes || 0), 0),
      last7d:     list.filter((r: any) => new Date(r.created_at).getTime() >= sevenDaysAgo).length,
    },
  })
}
