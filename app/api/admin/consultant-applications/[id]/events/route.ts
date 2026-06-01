/**
 * GET /api/admin/consultant-applications/[id]/events
 * Returns the audit timeline for one application. Falls back to an empty list
 * if the events table hasn't been migrated yet.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params

  const { data, error } = await db
    .from('consultant_application_events')
    .select('id, event_type, from_status, to_status, notes, metadata, actor_id, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return Response.json({ events: [], warnings: ['events_table_missing — run supabase/consultant_applications.sql'] })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ events: data ?? [] })
}
