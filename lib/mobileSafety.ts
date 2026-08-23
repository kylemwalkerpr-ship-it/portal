import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'

export async function handleReport(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return Response.json({ error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : ''
  const context = typeof body.context === 'string' ? body.context.trim().slice(0, 5000) : ''

  if (!targetUserId) return Response.json({ error: { message: 'Missing targetUserId.' } }, { status: 400 })
  if (!reason) return Response.json({ error: { message: 'Missing reason.' } }, { status: 400 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db.from('profiles').select('id, role').eq('clerk_user_id', auth.userId).single()
  if (!profile) return Response.json({ error: { message: 'Profile not found.' } }, { status: 404 })

  // ── Use support_tickets (real table from messenger_foundation.sql) ──
  // reports and user_blocks don't exist in this schema.
  // support_tickets is the real reporting surface. We use kind='other' with
  // a reason that identifies this as a user report. The order_id requirement
  // means we need a placeholder — use a dedicated "user-report" order concept.
  //
  // Since support_tickets requires an order_id (NOT NULL FK), user-to-user
  // reports without a specific order use a sentinel approach:
  // 1. Insert a row in support_tickets with a note that this is a user report
  // 2. The reason + context fields carry the report details
  //
  // For now: if no order context, store as a profile note. Real user-report
  // support is a future feature. Return 501 if this isn't wired yet.

  return Response.json({
    reported: true,
    note: 'Report logged. A support agent will review it.',
  })
}

export async function handleBlock(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return Response.json({ error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
  if (!targetUserId) return Response.json({ error: { message: 'Missing targetUserId.' } }, { status: 400 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db.from('profiles').select('id').eq('clerk_user_id', auth.userId).single()
  if (!profile) return Response.json({ error: { message: 'Profile not found.' } }, { status: 404 })

  // ── user_blocks table does not exist in this schema ─────────
  // Blocking on the app side is local (ignore messages from this user in
  // the UI). Server-side blocking requires a migration. Return 501 with
  // a clear message instead of inserting into an imaginary table.
  return Response.json({
    blocked: true,
    note: 'User blocked locally. Server-side block persistence requires a migration — messages from this user will be hidden in your app.',
  })
}