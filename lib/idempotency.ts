/**
 * Idempotency guard for money-moving POST endpoints.
 *
 * Usage in a route handler:
 *   const claim = await claimIdempotencyKey(db, profileId, key)
 *   if (claim.kind === 'replay')  return Response.json(claim.response, { status: claim.statusCode })
 *   if (claim.kind === 'in_flight') return 409
 *   ... do the charge ...
 *   await completeIdempotencyKey(db, profileId, key, { ... }, 200, orderId)
 *
 * Schema: supabase/checkout_idempotency.sql
 */

type Db = ReturnType<typeof import('./supabase').createSupabaseAdminClient>

const STALE_PENDING_MS = 10 * 60 * 1000 // reclaim keys from crashed workers

export type IdempotencyClaim =
  | { kind: 'fresh' }
  | { kind: 'replay'; response: Record<string, unknown>; statusCode: number }
  | { kind: 'in_flight' }

export function extractIdempotencyKey(req: Request, body?: Record<string, unknown>): string | null {
  const header = req.headers.get('idempotency-key')
  const raw = header || (body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null)
  if (!raw) return null
  const key = String(raw).trim()
  // UUID-ish or any opaque token 16–128 chars; reject junk.
  if (key.length < 16 || key.length > 128 || !/^[A-Za-z0-9_-]+$/.test(key)) return null
  return key
}

export async function claimIdempotencyKey(db: Db, profileId: string, key: string): Promise<IdempotencyClaim> {
  const { error } = await db
    .from('checkout_idempotency_keys')
    .insert({ key, profile_id: profileId, status: 'pending' })

  if (!error) return { kind: 'fresh' }

  // 23505 = unique_violation → key already used; inspect prior outcome.
  if (error.code !== '23505') throw new Error(`Idempotency claim failed: ${error.message}`)

  const { data: existing, error: readErr } = await db
    .from('checkout_idempotency_keys')
    .select('status, response, created_at')
    .eq('profile_id', profileId)
    .eq('key', key)
    .single()

  if (readErr || !existing) throw new Error('Idempotency key conflict but row unreadable.')

  if (existing.status === 'completed' || existing.status === 'failed') {
    const stored = (existing.response ?? {}) as Record<string, unknown>
    const statusCode = typeof stored.__status === 'number' ? (stored.__status as number) : existing.status === 'completed' ? 200 : 500
    const { __status: _omit, ...response } = stored
    return { kind: 'replay', response, statusCode }
  }

  // Pending: either a concurrent request is mid-flight, or a worker died.
  const age = Date.now() - new Date(existing.created_at as string).getTime()
  if (age < STALE_PENDING_MS) return { kind: 'in_flight' }

  // Stale — reclaim it (best effort; if another request reclaims first we
  // treat ours as in-flight).
  const { data: reclaimed } = await db
    .from('checkout_idempotency_keys')
    .update({ created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('key', key)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - STALE_PENDING_MS).toISOString())
    .select('key')
  return reclaimed && reclaimed.length > 0 ? { kind: 'fresh' } : { kind: 'in_flight' }
}

export async function completeIdempotencyKey(
  db: Db,
  profileId: string,
  key: string,
  response: Record<string, unknown>,
  statusCode: number,
  orderId?: string | null,
): Promise<void> {
  const { error } = await db
    .from('checkout_idempotency_keys')
    .update({
      status: statusCode < 400 ? 'completed' : 'failed',
      response: { ...response, __status: statusCode },
      order_id: orderId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId)
    .eq('key', key)
  if (error) console.error('[idempotency] failed to persist outcome:', error.message)
}

/** Record a money-moved-but-follow-up-failed incident for reconciliation. */
export async function recordPaymentIncident(
  db: Db,
  incident: {
    profileId?: string | null
    kind: 'charge_without_order' | 'debit_without_order' | 'refund_failed' | 'earning_credit_failed'
    gateway?: string | null
    transactionId?: string | null
    amountCents?: number | null
    context?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await db.from('payment_incidents').insert({
    profile_id: incident.profileId ?? null,
    kind: incident.kind,
    gateway: incident.gateway ?? null,
    transaction_id: incident.transactionId ?? null,
    amount_cents: incident.amountCents ?? null,
    context: incident.context ?? null,
  })
  if (error) console.error('[idempotency] failed to record payment incident:', error.message)
}
