/**
 * GET /api/admin/users/[id]/details
 *
 * The admin Users tab's single source of truth for EVERYTHING known about a
 * user: the full profiles row, the role-specific provider record
 * (attorneys / consultants), the original signup application (the form the
 * user filled at sign-up), wallet + spend summary, provider earnings
 * summary, and activity counts.
 *
 * Design: each section returns the WHOLE row (minus a denylist of noisy or
 * sensitive columns) so newly-added columns surface in the admin drawer
 * automatically — no per-column maintenance.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

// Columns that are internal plumbing or sensitive — never shown to admins
// in the generic key/value rendering.
const DENY = new Set([
  'clerk_user_id', // internal auth linkage; shown separately, truncated
  'vault_id',
  'embedding',
])

function scrub(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (DENY.has(k)) continue
    out[k] = v
  }
  return out
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const db = auth.db

  const { data: profile, error: profErr } = await db
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (profErr) return fail(profErr.message, 500)
  if (!profile) return fail('User not found.', 404)

  const role = profile.role as string

  // Parallel fan-out: role records, applications, wallet, activity.
  const [
    attorneyRes,
    consultantRes,
    attorneyAppRes,
    consultantAppRes,
    walletRes,
    walletTxRes,
    clientOrdersRes,
    providerOrdersRes,
    earningsRes,
    gigsRes,
    paymentMethodsRes,
  ] = await Promise.all([
    role === 'attorney'
      ? db.from('attorneys').select('*').eq('profile_id', id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    role === 'consultant'
      ? db.from('consultants').select('*').eq('profile_id', id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    role === 'attorney'
      ? db.from('attorney_applications').select('*').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    role === 'consultant'
      ? db.from('consultant_applications').select('*').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('student_wallets').select('balance_cents, currency, updated_at').eq('profile_id', id).maybeSingle(),
    db.from('wallet_transactions').select('type, signed_cents').eq('profile_id', id).limit(1000),
    db.from('orders').select('id, status, total_amount, created_at', { count: 'exact' }).eq('client_id', id).order('created_at', { ascending: false }).limit(5),
    db.from('orders').select('id, status, total_amount, created_at', { count: 'exact' }).eq('consultant_id', id).order('created_at', { ascending: false }).limit(5),
    ['attorney', 'consultant'].includes(role)
      ? db.from('provider_earnings').select('amount_cents, status').eq('provider_id', id).limit(1000)
      : Promise.resolve({ data: null, error: null }),
    ['attorney', 'consultant'].includes(role)
      ? db.from('gigs').select('id, title, status, order_count', { count: 'exact' }).eq('provider_id', id).limit(10)
      : Promise.resolve({ data: null, error: null, count: 0 }),
    db.from('student_payment_methods').select('brand, last4, gateway, created_at').eq('profile_id', id).limit(10),
  ])

  // Wallet lifetime aggregates from the ledger.
  const txs = (walletTxRes.data ?? []) as Array<{ type: string; signed_cents: number }>
  const lifetimeTopupCents = txs.filter((t) => t.signed_cents > 0).reduce((s, t) => s + t.signed_cents, 0)
  const lifetimeSpendCents = txs.filter((t) => t.signed_cents < 0).reduce((s, t) => s - t.signed_cents, 0)

  // Earnings aggregates for providers.
  const earnings = (earningsRes.data ?? []) as Array<{ amount_cents: number; status: string }>
  const earningsSummary = earnings.length
    ? {
        total_cents: earnings.reduce((s, e) => s + (e.amount_cents || 0), 0),
        owed_cents: earnings.filter((e) => e.status === 'owed' || e.status === 'releasable').reduce((s, e) => s + (e.amount_cents || 0), 0),
        paid_cents: earnings.filter((e) => e.status === 'paid').reduce((s, e) => s + (e.amount_cents || 0), 0),
        count: earnings.length,
      }
    : null

  return ok({
    profile: scrub(profile),
    clerk_user_id_hint: typeof profile.clerk_user_id === 'string' ? `${profile.clerk_user_id.slice(0, 12)}…` : null,
    provider_record: scrub((attorneyRes.data as Record<string, unknown> | null) ?? (consultantRes.data as Record<string, unknown> | null)),
    application: scrub((attorneyAppRes.data as Record<string, unknown> | null) ?? (consultantAppRes.data as Record<string, unknown> | null)),
    wallet: walletRes.data
      ? { ...walletRes.data, lifetime_topup_cents: lifetimeTopupCents, lifetime_spend_cents: lifetimeSpendCents }
      : null,
    payment_methods: (paymentMethodsRes.data ?? []).map((m: Record<string, unknown>) => ({
      brand: m.brand ?? 'card',
      last4: m.last4 ?? '????',
      gateway: m.gateway ?? null,
      added: m.created_at ?? null,
    })),
    activity: {
      orders_as_client: clientOrdersRes.count ?? 0,
      recent_client_orders: clientOrdersRes.data ?? [],
      orders_as_provider: providerOrdersRes.count ?? 0,
      recent_provider_orders: providerOrdersRes.data ?? [],
      gig_count: gigsRes.count ?? 0,
      gigs: gigsRes.data ?? [],
    },
    earnings: earningsSummary,
  })
}
