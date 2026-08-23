import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'

async function resolveAndCheck(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return { kind: 'unauth' as const, response: Response.json(
      { error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true },
      { status: 401 }
    )}
  }

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db.from('profiles').select('id, role, email, full_name').eq('clerk_user_id', auth.userId).single()
  if (error || !profile) {
    return { kind: 'response' as const, response: Response.json({ error: { message: 'Profile not found.' } }, { status: 404 }) }
  }

  return { kind: 'ok' as const, db, profile }
}

export async function handleAccountDelete(req: Request) {
  const resolved = await resolveAndCheck(req)
  if (resolved.kind !== 'ok') return resolved.response

  const { db, profile } = resolved

  // ── Refuse delete if ANY non-terminal order exists ──────────
  // Not just escrow — a created / in_progress / under_review / disputed
  // order is an active financial relationship. Do not cascade-wipe.
  const TERMINAL = new Set(['completed', 'cancelled', 'refunded'])
  const { data: orders, error: orderErr } = await db.from('orders')
    .select('id, status, escrow_status')
    .or(`client_id.eq.${profile.id},consultant_id.eq.${profile.id}`)

  if (orderErr) {
    console.error('[mobile/account/delete] orders query failed:', orderErr.message)
    return Response.json({ error: { message: 'Could not verify order state.' } }, { status: 500 })
  }

  const nonTerminal = (orders ?? []).filter((o: any) => !TERMINAL.has(o.status))
  if (nonTerminal.length > 0) {
    return Response.json({
      error: { message: `You have ${nonTerminal.length} active order(s). All orders must be completed, cancelled, or refunded before deleting your account.` }
    }, { status: 409 })
  }

  // ── Anonymise instead of delete ─────────────────────────────
  // profiles may have FK references from financial tables (orders, ledger,
  // conversations, etc.). Deleting the row could cascade-wipe financial
  // records. Anonymise the profile so the Clerk user is disassociated but
  // financial history remains intact.
  const anonymised = {
    full_name: `Deleted User ${profile.id.slice(0, 8)}`,
    email: `deleted-${profile.id.slice(0, 8)}@anonymised.yousafeconsultancy.com`,
    clerk_user_id: null,                 // break the Clerk link
    status: 'deleted',
    phone: null,
    avatar_url: null,
    country_code: null,
    role: 'client',                      // downgrade
  }

  const { error: updateErr } = await db.from('profiles').update(anonymised).eq('id', profile.id)
  if (updateErr) {
    console.error('[mobile/account/delete] anonymise failed:', updateErr.message)

    // If anonymise fails (e.g. unique constraint on email), try a fallback:
    // just null out PII fields and set status='deleted'.
    const { error: fallbackErr } = await db.from('profiles').update({
      full_name: null,
      clerk_user_id: null,
      status: 'deleted',
      phone: null,
      avatar_url: null,
    }).eq('id', profile.id)

    if (fallbackErr) {
      console.error('[mobile/account/delete] fallback anonymise ALSO failed:', fallbackErr.message)
      return Response.json({ error: { message: 'Account anonymisation failed. Please contact support.' } }, { status: 500 })
    }
  }

  return Response.json({ deleted: true, anonymised: true })
}

export async function handleAccountExport(req: Request) {
  const resolved = await resolveAndCheck(req)
  if (resolved.kind !== 'ok') return resolved.response

  const { db, profile } = resolved

  // Collect profile-owned data (explicit columns only, no select('*'))
  const [profileData, orders, conversations] = await Promise.all([
    db.from('profiles').select('id, role, status, email, full_name, country_code, created_at').eq('id', profile.id).single(),
    db.from('orders').select('id, order_number, status, escrow_status, requirements, total_amount, created_at, delivery_deadline').or(`client_id.eq.${profile.id},consultant_id.eq.${profile.id}`).order('created_at', { ascending: false }).limit(500),
    db.from('conversation_messages').select('id, body, type, created_at').eq('sender_id', profile.id).order('created_at', { ascending: false }).limit(5000),
  ])

  const data = {
    exported_at: new Date().toISOString(),
    profile: (profileData as any).data,
    orders: ((orders as any).data ?? []),
    messages: ((conversations as any).data ?? []),
  }

  return Response.json({ data })
}