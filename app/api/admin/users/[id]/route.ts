import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json()
  const payload: Record<string, unknown> = {}
  if ('status' in body) {
    if (!['active', 'pending', 'suspended'].includes(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }
    payload.status = body.status
  }
  if ('role' in body) {
    const role = body.role === 'student' ? 'client' : body.role
    if (!['client', 'consultant', 'support', 'admin'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 })
    }
    payload.role = role
  }
  if ('full_name' in body) payload.full_name = body.full_name
  if ('country' in body) payload.country = body.country

  const { data, error } = await auth.db.from('profiles').update(payload).eq('id', id).select('*').single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ user: data })
}
