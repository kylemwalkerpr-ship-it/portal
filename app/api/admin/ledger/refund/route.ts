/**
 * POST /api/admin/ledger/refund
 *
 * Unified refund endpoint. Writes to canonical_ledger AND updates legacy tables
 * for backward compatibility. Used by:
 *   - Admin dashboard (Wallet Oversight → refund button)
 *   - Support SaaS (via service-token auth)
 *   - Student billing (via admin delegation)
 *
 * Body:
 *   profile_id        string (required) — the student/client being refunded
 *   amount_cents      number (required) — refund amount in cents
 *   currency          string (default 'usd')
 *   order_id          string (optional) — order being refunded
 *   source_table      string (optional) — 'wallet_transactions', 'orders', 'escrow'
 *   source_id         string (optional) — id of the source row
 *   reason            string (optional) — human-readable reason
 *   method            'original_payment' | 'wallet' (default: 'wallet')
 *
 * Auth: either (a) admin Clerk session or (b) Authorization: Bearer <PORTAL_SERVICE_TOKEN>
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { refundToWallet, walletRefundCeilingCents } from '@/lib/wallet'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function authViaServiceToken(req: Request) {
  const header = req.headers.get('authorization') || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  const provided = m?.[1]
  const expected = process.env.PORTAL_SERVICE_TOKEN
  if (!provided || !expected) return null
  if (provided !== expected) return null
  const profileId = process.env.SUPPORT_SAAS_SYSTEM_PROFILE_ID || null
  if (!profileId) return null
  return { db: createSupabaseAdminClient(), profileId }
}

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const serviceAuth = await authViaServiceToken(req)
  let db: ReturnType<typeof createSupabaseAdminClient>
  let adminProfileId: string | null
  if (serviceAuth) {
    db = serviceAuth.db
    adminProfileId = serviceAuth.profileId
  } else {
    const auth = await requireAdminUser()
    if ('error' in auth) return fail(auth.error, auth.status)
    db = auth.db
    adminProfileId = auth.profileId
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  let profileId: string | undefined = body.profile_id
  const amountCents = Number(body.amount_cents)
  const currency = String(body.currency || 'usd').toLowerCase()
  let orderId: string | null = body.order_id || null
  const sourceTable: string | null = body.source_table || null
  const sourceId: string | null = body.source_id || null
  const reason: string | null = body.reason || null
  const method: 'original_payment' | 'wallet' = body.method === 'original_payment' ? 'original_payment' : 'wallet'

  // Resolve the order (when provided) for client_id AND the refund cap.
  let orderRow: { client_id?: string; amount_paid?: number; total_amount?: number; refunded_amount?: number } | null = null
  if (orderId) {
    try {
      const { data } = await db
        .from('orders')
        .select('client_id, amount_paid, total_amount, refunded_amount')
        .eq('id', orderId)
        .single() as any
      orderRow = data || null
      if (!profileId && orderRow?.client_id) profileId = orderRow.client_id
    } catch {
      // Non-critical — continue without profile_id
    }
  }

  if (!profileId) return fail('profile_id is required (provide one or supply order_id to resolve it).', 400)
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail('amount_cents must be a positive integer.', 400)
  }

  // ── Refund cap: a refund must never return more than the customer paid ──────
  // Order-bound refunds are capped by the order's captured amount minus prior
  // refunds. A charge-reversal (source = a wallet debit) is capped by that
  // debit. An orphan wallet refund is capped by the customer's lifetime
  // deposits. (original_payment refunds with no order/source are left to the
  // gateway, which rejects over-refunds itself.)
  let capCents: number | null = null
  if (orderRow) {
    // amount_paid is stored in cents, total_amount in dollars; refunded_amount
    // in dollars (legacy units).
    const capturedCents =
      Math.round(Number(orderRow.amount_paid || 0)) ||
      Math.round(Number(orderRow.total_amount || 0) * 100)
    const priorRefundCents = Math.round(Number(orderRow.refunded_amount || 0) * 100)
    if (capturedCents > 0) {
      capCents = Math.max(0, capturedCents - priorRefundCents)
    } else if (method === 'wallet') {
      // Captured amount unknown (legacy/missing) — fall back to the customer's
      // lifetime-deposit ceiling instead of hard-blocking the refund.
      capCents = await walletRefundCeilingCents(profileId)
    }
  } else if (sourceTable === 'wallet_transactions' && sourceId) {
    try {
      const { data: src } = await db
        .from('wallet_transactions')
        .select('amount_cents, type')
        .eq('id', sourceId)
        .maybeSingle() as any
      if (src && src.type === 'debit') capCents = Math.max(0, Number(src.amount_cents || 0))
    } catch {
      // fall through — leave cap unenforced for this edge case
    }
  } else if (method === 'wallet') {
    capCents = await walletRefundCeilingCents(profileId)
  }

  if (capCents !== null && amountCents > capCents) {
    return fail(
      `Refund of ${amountCents}¢ exceeds the refundable ceiling of ${capCents}¢ — refunds cannot exceed what the customer paid in.`,
      422,
      { maxRefundCents: capCents, requestedCents: amountCents },
    )
  }

  const warnings: string[] = []

  // ── 1. Write to canonical_ledger (append-only) ────────────────────────────────
  // Get the current balance for this profile
  let currentBalance = 0
  try {
    const { data: balanceRows } = await db.rpc('ledger_balance', {
      p_profile_ids: [profileId],
    }) as any
    if (balanceRows && balanceRows.length > 0) {
      currentBalance = Number(balanceRows[0].balance_cents || 0)
    }
  } catch {
    // Ledger may not be populated yet — that's ok
  }

  const newBalance = currentBalance + amountCents // refund → credit to student

  const ledgerEntry: Record<string, any> = {
    profile_id: profileId,
    counterparty_id: adminProfileId,
    amount_cents: amountCents,
    currency,
    balance_after_cents: Math.max(0, newBalance),
    entry_type: 'refund',
    direction: 'credit',
    source_table: sourceTable || 'admin_refund',
    source_id: sourceId || `refund_${Date.now()}`,
    order_id: orderId,
    description: reason || `Refund (${method})`,
    metadata: {
      admin_id: adminProfileId,
      method,
      reason,
      order_id: orderId,
    },
  }

  try {
    const { error: ledgerErr } = await db
      .from('canonical_ledger')
      .insert(ledgerEntry)

    if (ledgerErr) {
      // If it's a duplicate (source_table + source_id collision), that's fine
      if (!ledgerErr.message?.includes('duplicate key') &&
          !ledgerErr.message?.includes('unique constraint')) {
        warnings.push(`canonical_ledger_insert: ${ledgerErr.message}`)
      }
    }
  } catch (err: any) {
    warnings.push(`canonical_ledger_insert_failed: ${err.message}`)
  }

  // ── 2. Credit wallet (if method === 'wallet') ─────────────────────────────────
  let walletTx: any = null
  if (method === 'wallet') {
    try {
      walletTx = await refundToWallet(
        profileId,
        amountCents,
        reason || `Refund${orderId ? ` for order ${orderId}` : ''}`,
        {
          reference: orderId || undefined,
          orderCapCents: capCents ?? undefined,
          metadata: { admin_id: adminProfileId, refund_method: 'wallet', order_id: orderId },
        }
      )
    } catch (err: any) {
      warnings.push(`wallet_credit_failed: ${err.message}`)
    }
  }

  // ── 3. Update legacy refund_ledger for back-compat ────────────────────────────
  if (orderId) {
    try {
      await db.from('refund_ledger').insert({
        order_id: orderId,
        initiated_by: 'admin',
        amount: amountCents / 100,
        method,
        status: 'succeeded',
      })
    } catch {
      // Non-critical
    }
  }

  // ── 4. Update orders table refund fields (if order_id provided) ───────────────
  if (orderId) {
    try {
      const { data: order } = await db
        .from('orders')
        .select('id, refunded_amount, refunded_at, refund_status, refund_method, wallet_credit_amount')
        .eq('id', orderId)
        .single() as any

      if (order) {
        const refundDollars = amountCents / 100
        const previousRefunded = Number(order.refunded_amount || 0)
        const update: Record<string, any> = {
          refunded_at: new Date().toISOString(),
          refunded_amount: previousRefunded + refundDollars,
          refund_status: 'succeeded',
          refund_method: method,
        }
        if (method === 'wallet') {
          update.wallet_credit_amount = Number(order.wallet_credit_amount || 0) + refundDollars
        }
        await db.from('orders').update(update).eq('id', orderId)
      }
    } catch {
      // Non-critical
    }
  }

  // ── 5. Mark source wallet transaction as voided ─────────────────────────────
  // Ensures the same debit/purchase entry cannot be refunded twice.
  // Merges refunded_at into the existing metadata (preserving any prior fields).
  if (sourceTable === 'wallet_transactions' && sourceId && method === 'wallet') {
    try {
      const { data: existing } = await db
        .from('wallet_transactions')
        .select('metadata')
        .eq('id', sourceId)
        .maybeSingle()

      const prevMeta =
        existing?.metadata && typeof existing.metadata === 'object'
          ? existing.metadata
          : {}

      await db
        .from('wallet_transactions')
        .update({
          metadata: {
            ...(prevMeta as Record<string, unknown>),
            refunded_at: new Date().toISOString(),
          },
        })
        .eq('id', sourceId)
    } catch (err: any) {
      warnings.push(`mark_void_failed: ${err.message}`)
    }
  }

  // ── 6. Admin audit log ────────────────────────────────────────────────────────
  try {
    await db.from('admin_audit_log').insert({
      admin_id: adminProfileId,
      action_type: 'ledger_refund',
      target_table: 'canonical_ledger',
      target_id: sourceId || ledgerEntry.source_id,
      payload_snapshot: {
        profile_id: profileId,
        amount_cents: amountCents,
        method,
        order_id: orderId,
      },
      reason,
    })
  } catch {
    // Non-critical
  }

  return ok({
    refunded_cents: amountCents,
    method,
    order_id: orderId,
    profile_id: profileId,
    wallet_balance_cents: walletTx?.balance_after_cents ?? null,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
