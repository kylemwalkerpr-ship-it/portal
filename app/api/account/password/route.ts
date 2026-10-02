/**
 * POST /api/account/password — called by /account/change-password right after
 * the browser has rotated the password with Clerk `user.updatePassword()`.
 * Verifies with the Backend API that the password really changed after the
 * temporary one was issued, then clears `publicMetadata.mustChangePassword`
 * (server-side only; users cannot write publicMetadata). No email involved.
 */
import { getClerkUserId } from '@/lib/auth'
import { passwordChangeClearable } from '@/lib/auth/mustChangePassword'

export const dynamic = 'force-dynamic'

export async function POST() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return Response.json({ error: 'Not configured.' }, { status: 503 })

  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, { headers })
  if (!res.ok) return Response.json({ error: 'Could not load your account.' }, { status: 502 })
  const user = (await res.json()) as { password_last_updated_at?: number | null; public_metadata?: Record<string, unknown> }

  const verdict = passwordChangeClearable(user)
  if (verdict.ok === false) {
    if ((verdict as { reason: string }).reason === 'not_required') return Response.json({ ok: true, cleared: false })
    return Response.json({ error: 'Please set a new password first.' }, { status: 409 })
  }

  const patch = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/metadata`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      public_metadata: {
        mustChangePassword: false,
        passwordChangedAt: new Date().toISOString(),
        tempPasswordExpiresAt: null,
      },
    }),
  })
  if (!patch.ok) return Response.json({ error: 'Could not update your account.' }, { status: 502 })
  return Response.json({ ok: true, cleared: true })
}
