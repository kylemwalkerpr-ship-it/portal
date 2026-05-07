import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { normalizeVertical } from '@/lib/platformConfig'

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

function servicePayload(body: Record<string, unknown>) {
  return {
    title: String(body.title ?? '').trim(),
    category: String(body.category ?? '').trim() || 'General',
    price: Number(body.price ?? 0),
    delivery_days: Number(body.delivery_days ?? 7),
    is_active: Boolean(body.is_active),
    vertical: normalizeVertical(body.vertical),
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const payload = servicePayload(await req.json())
  if (!payload.title || !Number.isFinite(payload.price) || payload.price < 0) {
    return Response.json({ error: 'Invalid service payload' }, { status: 400 })
  }

  let result = await auth.db.from('services').update(payload).eq('id', id).select('*').single()
  if (result.error && /column .*vertical/i.test(result.error.message)) {
    const { vertical: _v, ...legacy } = payload
    result = await auth.db.from('services').update(legacy).eq('id', id).select('*').single()
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  return Response.json({ service: result.data })
}
