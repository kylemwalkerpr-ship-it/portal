import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return Response.json({ error: 'CLERK_SECRET_KEY missing on server.' }, { status: 500 })

  const { id } = await context.params
  const res = await fetch(`https://api.clerk.com/v1/invitations/${id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return Response.json({ error: `Clerk ${res.status}: ${text}` }, { status: 502 })
  }
  return Response.json({ ok: true })
}
