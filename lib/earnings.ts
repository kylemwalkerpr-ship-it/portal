/**
 * Earnings service — all read/write of provider_earnings + provider_payouts.
 * All money mutation routes through here. Admin and provider routes both use it.
 */

import { createSupabaseAdminClient } from './supabase'

export type ProviderEarning = {
  id: string
  provider_id: string
  order_id: string
  source: 'gig' | 'offer' | 'service'
  amount_cents: number
  fee_cents: number
  currency: string
  status: 'owed' | 'releasable' | 'paid' | 'refunded' | 'cancelled'
  released_at: string | null
  payout_id: string | null
  created_at: string
  updated_at: string
}

export type ProviderPayout = {
  id: string
  provider_id: string
  amount_cents: number
  currency: string
  method: string
  reference: string | null
  notes: string | null
  marked_paid_at: string
  marked_by: string | null
  created_at: string
}

const db = () => createSupabaseAdminClient()

export async function creditEarning(opts: {
  providerId: string
  orderId: string
  source: 'gig' | 'offer' | 'service'
  amountCents: number
  feeCents?: number
}): Promise<ProviderEarning> {
  const { data, error } = await db()
    .rpc('credit_earning', {
      p_provider_id: opts.providerId,
      p_order_id: opts.orderId,
      p_source: opts.source,
      p_amount_cents: opts.amountCents,
      p_fee_cents: opts.feeCents ?? 0,
    })
    .single()

  if (error) throw new Error(`Credit earning failed: ${error.message}`)
  return data as ProviderEarning
}

export async function releaseEarningsForOrder(orderId: string): Promise<ProviderEarning[]> {
  const { data, error } = await db()
    .rpc('release_earnings_for_order', { p_order_id: orderId })

  if (error) throw new Error(`Release earnings failed: ${error.message}`)
  return (data ?? []) as ProviderEarning[]
}

export async function listEarnings(
  providerId: string,
  filter?: { status?: string; limit?: number; offset?: number }
): Promise<ProviderEarning[]> {
  let q = db()
    .from('provider_earnings')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })

  if (filter?.status) q = q.eq('status', filter.status)
  const limit = Math.min(500, Math.max(1, filter?.limit ?? 100))
  const offset = Math.max(0, filter?.offset ?? 0)
  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error) throw new Error(`List earnings failed: ${error.message}`)
  return (data ?? []) as ProviderEarning[]
}

export async function summary(providerId: string): Promise<{
  owedCents: number
  releasableCents: number
  paidCents: number
}> {
  const { data, error } = await db()
    .from('provider_earnings')
    .select('status, amount_cents')
    .eq('provider_id', providerId)

  if (error) throw new Error(`Earnings summary failed: ${error.message}`)

  const rows = (data ?? []) as { status: string; amount_cents: number }[]
  return {
    owedCents: rows.filter(r => r.status === 'owed').reduce((a, r) => a + Number(r.amount_cents), 0),
    releasableCents: rows.filter(r => r.status === 'releasable').reduce((a, r) => a + Number(r.amount_cents), 0),
    paidCents: rows.filter(r => r.status === 'paid').reduce((a, r) => a + Number(r.amount_cents), 0),
  }
}

export async function recordPayout(
  providerId: string,
  opts: {
    amountCents: number
    method: string
    reference?: string
    notes?: string
    markedBy: string
    earningIds: string[]
  }
): Promise<ProviderPayout> {
  const { data, error } = await db()
    .rpc('record_payout', {
      p_provider_id: providerId,
      p_amount_cents: opts.amountCents,
      p_method: opts.method,
      p_reference: opts.reference ?? '',
      p_notes: opts.notes ?? '',
      p_marked_by: opts.markedBy,
      p_earning_ids: opts.earningIds,
    })
    .single()

  if (error) throw new Error(`Record payout failed: ${error.message}`)
  return data as ProviderPayout
}

export async function listPayouts(providerId: string): Promise<ProviderPayout[]> {
  const { data, error } = await db()
    .from('provider_payouts')
    .select('*')
    .eq('provider_id', providerId)
    .order('marked_paid_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`List payouts failed: ${error.message}`)
  return (data ?? []) as ProviderPayout[]
}

// Admin: list all providers with releasable earnings
export async function listReleasableByProvider(): Promise<
  {
    provider_id: string
    provider_name: string | null
    provider_email: string | null
    total_cents: number
    count: number
    oldest: string
  }[]
> {
  const { data, error } = await db().rpc('list_releasable_earnings_by_provider')
  if (error) throw new Error(`List releasable failed: ${error.message}`)
  return (data ?? []) as any
}
