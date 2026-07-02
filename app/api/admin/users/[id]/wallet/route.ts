/**
 * GET /api/admin/users/[id]/wallet
 * Per-student wallet detail for the admin drawer.
 * `id` is the profile_id (not Clerk user_id).
 *
 * Query params:
 *   page       — 1-indexed (default 1)
 *   page_size  — rows per page (default 50, max 200)
 *   type       — filter ledger by transaction type
 *                (topup | debit | refund | adjustment | purchase | all)
 *
 * Returns:
 *   { wallet: { balance_cents, currency, updated_at } | null,
 *     profile: { full_name, email, role },
 *     transactions: [...page slice, ledger],
 *     transactions_total, page, page_size, total_pages,
 *     totals: { lifetime_topup_cents, lifetime_debit_cents,
 *               lifetime_refund_cents, lifetime_adjustment_cents,
 *               lifetime_purchase_cents } }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const ALLOWED_TYPES = ['topup', 'debit', 'refund', 'adjustment', 'purchase', 'manual_credit']

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const { id: profileId } = await ctx.params
  if (!profileId) return fail('profile id is required.', 400)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))
  const typeFilter = (searchParams.get('type') || 'all').toLowerCase()

  const warnings: string[] = []

  // ── Profile ────────────────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', profileId)
    .single()
  if (profileErr || !profile) return fail('Profile not found.', 404)

  // ── Wallet (may not exist yet — that's fine, return null) ──────────────────
  let wallet: { balance_cents: number; currency: string; updated_at: string | null } | null = null
  try {
    const { data, error } = await db
      .from('student_wallets')
      .select('balance_cents, currency, updated_at')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error) {
      if (/column .* does not exist/i.test(error.message || '')) {
        warnings.push('schema_partial — student_wallets.currency missing; defaulting to USD')
        const fb = await db
          .from('student_wallets')
          .select('balance_cents, updated_at')
          .eq('profile_id', profileId)
          .maybeSingle()
        if (fb.data) {
          wallet = {
            balance_cents: Number((fb.data as any).balance_cents || 0),
            currency: 'USD',
            updated_at: (fb.data as any).updated_at || null,
          }
        }
      } else {
        warnings.push(`wallet_read_failed: ${error.message}`)
      }
    } else if (data) {
      wallet = {
        balance_cents: Number((data as any).balance_cents || 0),
        currency: (data as any).currency || 'USD',
        updated_at: (data as any).updated_at || null,
      }
    }
  } catch (e: any) {
    warnings.push(`wallet_read_failed: ${e?.message || 'unknown'}`)
  }

  // ── Lifetime totals (one query, group client-side by type) ─────────────────
  const totals: Record<string, number> = {
    lifetime_topup_cents: 0,
    lifetime_debit_cents: 0,
    lifetime_refund_cents: 0,
    lifetime_adjustment_cents: 0,
    lifetime_purchase_cents: 0,
    lifetime_manual_credit_cents: 0,
  }
  try {
    const { data: allTxns, error } = await db
      .from('wallet_transactions')
      .select('type, amount_cents, description, metadata')
      .eq('profile_id', profileId)
    if (error) throw error
    for (const t of (allTxns ?? []) as any[]) {
      if (!ALLOWED_TYPES.includes(t.type)) continue
      // Refunds ride the wallet_credit RPC and arrive typed 'topup' — the
      // truth is metadata.kind. Counting them as deposits inflated
      // lifetime_topup and made refunds look like money the customer paid in.
      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {}
      const isRefund = t.type === 'topup' && (meta.kind === 'refund' || !!meta.refund_method || /^\s*refund/i.test(String(t.description || '')))
      const isManualCredit = t.type === 'topup' && meta.kind === 'manual_credit'
      const bucket = isRefund ? 'refund' : isManualCredit ? 'manual_credit' : t.type
      totals[`lifetime_${bucket}_cents`] += Number(t.amount_cents || 0)
    }
  } catch (e: any) {
    warnings.push(`totals_unavailable: ${e?.message || 'unknown'}`)
  }

  // ── Paginated ledger ───────────────────────────────────────────────────────
  let txnQuery = db
    .from('wallet_transactions')
    .select(
      'id, profile_id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at',
      { count: 'exact' }
    )
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (typeFilter !== 'all' && ALLOWED_TYPES.includes(typeFilter)) {
    // manual_credit is stored as type='topup' with metadata->>'kind'='manual_credit' —
    // filter by metadata instead of the raw type column.
    if (typeFilter === 'manual_credit') {
      txnQuery = txnQuery.eq('type', 'topup').filter('metadata->>kind', 'eq', 'manual_credit')
    } else {
      txnQuery = txnQuery.eq('type', typeFilter)
    }
  }

  const { data: transactions, error: txnErr, count: txnTotal } = await txnQuery as any
  if (txnErr) return fail(txnErr.message, 500)

  // Enrich each transaction with a display_type that overrides the raw DB
  // type for entries that carry semantic metadata (e.g. wallet_credit RPC
  // stores everything as 'topup', but a manual-credit entry should show as
  // 'manual_credit' not 'topup'). The frontend uses t.display_type ?? t.type.
  const enriched = ((transactions ?? []) as any[]).map(t => {
    const meta = t.metadata && typeof t.metadata === 'object' ? (t.metadata as Record<string, string>) : {}
    let displayType: string | null = null
    if (t.type === 'topup' && meta.kind === 'manual_credit') displayType = 'manual_credit'
    return { ...t, display_type: displayType }
  })

  return ok(
    {
      wallet,
      profile: {
        full_name: profile.full_name || null,
        email: profile.email || null,
        role: profile.role || null,
      },
      transactions: enriched,
      transactions_total: txnTotal ?? 0,
      page,
      page_size: pageSize,
      total_pages: Math.ceil((txnTotal ?? 0) / pageSize),
      totals,
    },
    {},
    warnings.length ? { data_warnings: warnings } : {}
  )
}
