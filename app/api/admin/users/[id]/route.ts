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
    const { data: target } = await auth.db
      .from('profiles')
      .select('email, role')
      .eq('id', id)
      .single()

    if (target?.role && target.role !== role) {
      return Response.json(
        { error: 'Roles are independent. Create a separate account through the correct role-specific signup route.' },
        { status: 409 }
      )
    }

    if (target?.email) {
      const { data: duplicate } = await auth.db
        .from('profiles')
        .select('id, role')
        .eq('email', target.email)
        .neq('id', id)
        .maybeSingle()
      if (duplicate && duplicate.role !== role) {
        return Response.json(
          { error: 'This email address already belongs to another role' },
          { status: 409 }
        )
      }
    }
    payload.role = role
  }
  if ('full_name' in body) payload.full_name = body.full_name
  if ('country' in body) payload.country = body.country

  const { data, error } = await auth.db.from('profiles').update(payload).eq('id', id).select('*').single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ user: data })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: me } = await auth.db
    .from('profiles')
    .select('id')
    .eq('clerk_user_id', await getClerkUserId())
    .single()

  if (me?.id === id) {
    return Response.json({ error: 'Admins cannot delete their own account' }, { status: 400 })
  }

  const { data: target } = await auth.db.from('profiles').select('role, email').eq('id', id).single()
  if (!target || !['consultant', 'support'].includes(target.role)) {
    return Response.json(
      { error: 'Only consultant and support staff accounts can be deleted here' },
      { status: 403 }
    )
  }

  await auth.db.from('orders').update({ consultant_id: null, status: 'queued' }).eq('consultant_id', id)
  await auth.db.from('chat_conversations').update({ assigned_to_id: null }).eq('assigned_to_id', id)
  await auth.db.from('support_presence').delete().eq('profile_id', id)
  await auth.db.from('notifications').delete().eq('user_id', id)
  await auth.db.from('consultants').delete().eq('profile_id', id)
  await auth.db.from('consultants').delete().eq('user_id', id)
  if (target.email) await auth.db.from('consultants').delete().eq('email', target.email)
  const { error } = await auth.db.from('profiles').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
