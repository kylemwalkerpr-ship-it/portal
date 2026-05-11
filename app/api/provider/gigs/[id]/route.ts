import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireProvider() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db.from('profiles').select('id, role').eq('clerk_user_id', clerkUserId).single()
  if (!profile || !['attorney', 'consultant'].includes(String(profile.role))) return { error: 'Forbidden', status: 403 as const }
  return { db, profile }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireProvider()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['title', 'summary', 'category', 'image_url', 'status']) {
    if (key in body) update[key] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  }
  if (Array.isArray(body.tags)) update.tags = body.tags.map(String).slice(0, 10)

  const { data, error } = await auth.db
    .from('provider_gigs')
    .update(update)
    .eq('id', id)
    .eq('provider_profile_id', auth.profile.id)
    .select('*')
    .single()
  if (error || !data) return Response.json({ error: error?.message || 'Gig not found.' }, { status: 404 })
  return Response.json({ gig: data })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireProvider()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  const { error } = await auth.db
    .from('provider_gigs')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('provider_profile_id', auth.profile.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
