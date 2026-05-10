import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const VALID_ROLES = new Set(['client', 'student', 'consultant', 'attorney', 'support', 'admin'])
const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, profile }
}

function laneSegment(role: string): string {
  if (role === 'client' || role === 'student') return 'student'
  if (role === 'admin') return 'admin'
  return role // consultant, attorney, support
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return Response.json({ error: 'CLERK_SECRET_KEY missing on server.' }, { status: 500 })

  let body: { email?: string; role?: string; full_name?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  const role = (body.role || '').trim().toLowerCase()
  const fullName = (body.full_name || '').trim().slice(0, 200)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Valid email required.' }, { status: 400 })
  if (!VALID_ROLES.has(role)) return Response.json({ error: 'Invalid role.' }, { status: 400 })

  const lane = laneSegment(role)
  const redirectUrl = `${PORTAL_URL}/sign-up/${lane}`

  const inviteRes = await fetch('https://api.clerk.com/v1/invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_address: email,
      redirect_url: redirectUrl,
      public_metadata: { invitedRole: role, invitedBy: auth.profile.email },
      notify: true,
    }),
  })

  const inviteJson: unknown = await inviteRes.json().catch(() => null)
  const inviteData = inviteJson as { id?: string; status?: string; errors?: { message?: string; long_message?: string }[] } | null
  if (!inviteRes.ok) {
    const msg = inviteData?.errors?.[0]?.long_message || inviteData?.errors?.[0]?.message || `Clerk responded ${inviteRes.status}`
    return Response.json({ error: msg }, { status: 502 })
  }

  // Pre-create a placeholder profile row so the user lands in the right lane
  // immediately on first sign-in (rather than defaulting to 'client').
  const { data: existing } = await auth.db
    .from('profiles')
    .select('id, role, status')
    .eq('email', email)
    .maybeSingle()

  if (!existing) {
    const defaultStatus = role === 'client' || role === 'student' ? 'active' : role === 'admin' ? 'active' : 'pending'
    await auth.db
      .from('profiles')
      .insert({
        email,
        full_name: fullName || null,
        role: role === 'student' ? 'client' : role,
        status: defaultStatus,
      })
  }

  return Response.json({
    ok: true,
    invitation_id: inviteData?.id,
    status: inviteData?.status,
    redirect_url: redirectUrl,
  })
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return Response.json({ error: 'CLERK_SECRET_KEY missing on server.' }, { status: 500 })

  const res = await fetch('https://api.clerk.com/v1/invitations?status=pending&limit=50', {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const errs = (json as { errors?: { message?: string }[] } | null)?.errors
    return Response.json({ error: errs?.[0]?.message || `Clerk ${res.status}` }, { status: 502 })
  }
  // Clerk returns either an array directly or a paginated envelope.
  const list = Array.isArray(json) ? json : (json as { data?: unknown }).data ?? []
  return Response.json({ invitations: list })
}
