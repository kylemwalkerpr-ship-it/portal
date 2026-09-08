/**
 * Client cancellation — shared eligibility model.
 *
 * The server-side RPC `client_cancel_order` (see
 * supabase/client_order_cancellation.sql) is the *authoritative* gate and does
 * ALL of the writing atomically. This module is the fast path the API and UI
 * use to decide whether to *offer* cancellation and how to explain the
 * financial outcome. The two must stay in lockstep — if you change the gates
 * here, update the SQL function too.
 *
 * Money units: `amount_paid` is integer CENTS, escrow/refund fields are
 * numeric DOLLARS. Refunds go to the client's wallet (existing escrow-admin
 * convention via `lib/wallet.refundToWallet`: ledger metadata `kind:'refund'`).
 */

/** Verified legacy unstarted statuses, including aliases. */
export const UNSTARTED_STATUSES = ['created', 'queued', 'pending', 'new'] as const

/** Terminal states that can never be resurrected or re-cancelled. */
export const TERMINAL_STATUSES = ['cancelled', 'refunded', 'completed', 'released'] as const

/** Payout states that mean money already left escrow toward the provider. */
const PAID_OUT_PAYOUT_STATUSES = ['transferred', 'paid', 'released']

/** Refund states that mean the money was already returned to the client. */
const ALREADY_REFUNDED_REFUND_STATUSES = ['succeeded', 'refunded', 'wallet_credit_complete']

export type CancellationOrder = {
  id?: string
  client_id?: string | null
  callerId?: string | null
  status?: string | null
  progress?: number | null
  currency?: string | null
  amount_paid?: number | null
  total_amount?: number | null
  escrow_status?: string | null
  escrow_amount?: number | null
  escrow_released_amount?: number | null
  escrow_refunded_amount?: number | null
  escrow_disputed_at?: string | null
  escrow_frozen_at?: string | null
  auto_release_eligible_at?: string | null
  cancelled_at?: string | null
  refunded_amount?: number | null
  refund_status?: string | null
  payout_status?: string | null
}

export type CancellationEvidence = {
  /** Owning-caller profile id; when supplied the order's client_id is enforced. */
  callerId?: string
  /** True when at least one milestone is past 'pending'/'cancelled'. */
  milestoneWork?: boolean
  /** True when a provider earning is already 'releasable' or 'paid'. */
  earningReleased?: boolean
}

export type CancellationVerdict =
  | {
      cancellable: true
      refundCents: number
      refundMethod: 'wallet'
    }
  | {
      cancellable: false
      code: string
      reason: string
    }

const deny = (code: string, reason: string): CancellationVerdict => ({
  cancellable: false,
  code,
  reason,
})

/**
 * Pure eligibility check. Mirrors the gates enforced inside the SQL RPC.
 * `callerId` optional — pass it to enforce ownership in server contexts;
 * the RPC always re-verifies ownership regardless of what this says.
 */
export function getClientCancellationEligibility(
  order: CancellationOrder | null | undefined,
  evidence: CancellationEvidence = {},
): CancellationVerdict {
  if (!order) return deny('not_found', 'Order not found.')
  if (evidence.callerId && order.client_id && order.client_id !== evidence.callerId) {
    return deny('forbidden', 'Only the owning client can cancel this order.')
  }

  const status = String(order.status || '')
  if (status && (TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return deny('already_cancelled', `Order is already ${status} and cannot be cancelled.`)
  }
  if (!(UNSTARTED_STATUSES as readonly string[]).includes(status)) {
    return deny('not_unstarted', `Work has started on this order, so it cannot be cancelled (status ${status || 'unknown'}).`)
  }

  if (Number(order.progress || 0) > 0) {
    return deny('work_started', 'Work has started on this order, so it cannot be cancelled.')
  }
  if ((PAID_OUT_PAYOUT_STATUSES as string[]).includes(String(order.payout_status || ''))) {
    return deny('already_paid_out', 'Funds have already been paid out, so this order cannot be cancelled.')
  }

  const escrowStatus = String(order.escrow_status || '')
  if (escrowStatus !== 'held') {
    // Null, refunded, partial — anything that isn't verified HELD gives no
    // reconciliable balance; fail safely rather than guess.
    return deny('escrow_not_held', `Escrow must be held to cancel; current escrow status is ${escrowStatus || 'null'}.`)
  }
  if (Number(order.escrow_released_amount || 0) > 0) {
    return deny('released_funds', 'Escrow funds have already been released, so this order cannot be cancelled.')
  }
  if (
    Number(order.escrow_refunded_amount || 0) > 0 ||
    Number(order.refunded_amount || 0) > 0 ||
    (ALREADY_REFUNDED_REFUND_STATUSES as string[]).includes(String(order.refund_status || '')) ||
    order.cancelled_at
  ) {
    return deny('already_refunded', 'This order has already been refunded and cannot be cancelled again.')
  }
  // escrow_status 'disputed'/'frozen' is already denied by the held
  // requirement above; these columns are cross-cutting dispute/freeze evidence.
  if (order.escrow_disputed_at || order.escrow_frozen_at) {
    return deny('disputed_or_frozen', 'This order is disputed or frozen and must be resolved before it can be cancelled.')
  }
  if (order.auto_release_eligible_at) {
    return deny('in_auto_release', 'This order is in the auto-release window and cannot be cancelled.')
  }
  if (evidence.milestoneWork) {
    return deny('work_started', 'Milestone work has begun on this order, so it cannot be cancelled.')
  }
  if (evidence.earningReleased) {
    return deny('work_started', 'A provider payout is pending or already paid, so this order cannot be cancelled.')
  }

  const refundCents = Math.round(Number(order.amount_paid || 0))
  if (refundCents <= 0) {
    if (Number(order.total_amount || 0) > 0) {
      return deny('inconsistent_money', 'Order has no captured amount (amount_paid) to refund — refusing to fabricate a refund.')
    }
    return deny('no_funds', 'There are no paid funds on this order to refund.')
  }

  // Verified held escrow: balance must be positive and an EXACT cent-for-cent
  // match of the captured amount (no one-cent tolerance). A null/zero/negative
  // balance fails safely — we never fabricate one from a default.
  const escrowAmount = Number(order.escrow_amount || 0)
  if (escrowAmount <= 0) {
    return deny('invalid_escrow', 'Order has no verified escrow balance to refund — failed safely without fabricating a balance.')
  }
  if (Math.round(escrowAmount * 100) !== refundCents) {
    return deny('escrow_mismatch', `Escrow balance does not exactly match captured funds (${refundCents}¢) — refusing to fabricate a refund.`)
  }

  // Currency: the wallet ledger is USD-only. A NULL order currency is ambiguous
  // (the DB 'usd' default cannot certify legacy provenance), and a known
  // non-USD order cannot be refunded through the USD wallet.
  const currency = String(order.currency || '').trim().toLowerCase()
  if (!currency) {
    return deny('currency_unknown', 'Order currency is not recorded — refused to credit a wallet in an uncertain currency.')
  }
  if (currency !== 'usd') {
    return deny('unsupported_currency', `Refunds are only supported in USD; order currency is ${currency}.`)
  }

  return { cancellable: true, refundCents, refundMethod: 'wallet' }
}

/** Map a cancellation denial code to an HTTP status the API can return. */
export function cancellationHttpStatus(code: string): number {
  switch (code) {
    case 'bad_request':
      return 400
    case 'not_found':
      return 404
    case 'forbidden':
      return 403
    case 'inconsistent_money':
    case 'no_funds':
    case 'invalid_escrow':
    case 'escrow_mismatch':
    case 'currency_unknown':
    case 'unsupported_currency':
    case 'wallet_currency_mismatch':
      return 422
    default:
      return 409 // already_cancelled / not_unstarted / work_started / escrow/refund states
  }
}