/**
 * GET /api/student/documents/[id]/url
 * Mints a fresh 10-minute signed URL for one file. Ownership-checked.
 * Called on-demand from the UI so we don't sign URLs for files the user
 * never actually opens.
 */
import { getCurrentStudent } from '@/lib/student'

const BUCKET = 'order-files'
const TTL = 60 * 10

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { id } = await context.params
  if (!id) return Response.json({ error: 'File id required' }, { status: 400 })

  // Verify the file belongs to one of the student's own orders.
  const { data: file, error } = await db
    .from('order_files')
    .select('id, order_id, storage_path, name, mime_type')
    .eq('id', id)
    .single()
  if (error || !file) return Response.json({ error: 'File not found' }, { status: 404 })

  const { data: order } = await db
    .from('orders')
    .select('client_id')
    .eq('id', file.order_id)
    .single()
  if (!order || order.client_id !== profile.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: signed, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, TTL)
  if (signErr || !signed?.signedUrl) {
    return Response.json({ error: signErr?.message || 'Failed to sign URL' }, { status: 500 })
  }

  return Response.json({ url: signed.signedUrl, name: file.name, mime_type: file.mime_type, expires_in: TTL })
}
