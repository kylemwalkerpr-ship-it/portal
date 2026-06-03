/**
 * GET /api/admin/wallets
 * Paginated list of every student wallet with profile join + activity stats.
 *
 * Query params:
 *   q            — search by full_name or email (post-filter on the page slice)
 *   min_balance  — minimum balance in cents
 *   max_balance  — maximum balance in cents
 *   sort         — balance_desc (default) | balance_asc | recent_activity | name
 *   page         — 1-indexed (default 1)
 *   page_size    — rows per page (default 25, max 100)
 *
 * Returns:
 *   { wallets: [...], total, page, page_size, total_pages }
 *
 * Self-heals if `currency` column is missing on student_wallets — falls back
 * to USD rather than 500-ing the route (mirrors the escrow route pattern).
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const SORTS = ['balance_desc', 'balance_asc', 'recent_activity', 'name'] as const
type SortKey = (typeof SORTS)[number]

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)
  const warnings: string[] = []

  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  const sortKey = (searchParams.get('sort') as SortKey) || 'balance_desc'
  const sort: SortKey = (SORTS as readonly string[]).includes(sortKey) ? sortKey : 'balance_desc'

  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const minBalance = searchParams.get('min_balance')
  const maxBalance = searchParams.get('max_balance')

  // ── 1. Pull wallets with optional balance filters ───────────────────────────
  let walletsQuery = db
    .from('student_wallets')
    .select('profile_id, balance_cents, currency, updated_at', { count: 'exact' })

  if (minBalance !== null && minBalance !== '' && !Number.isNaN(Number(minBalance))) {
    walletsQuery = walletsQuery.gte('balance_cents', Number(minBalance))
  }
  if (maxBalance !== null && maxBalance !== '' && !Number.isNaN(Number(maxBalance))) {
    walletsQuery = walletsQuery.lte('balance_cents', Number(maxBalance))
  }

  // Sort at the DB level when possible
  if (sort === 'balance_desc') walletsQuery = walletsQuery.order('balance_cents', { ascending: false })
  else if (sort === 'balance_asc') walletsQuery = walletsQuery.order('balance_cents', { ascending: true })
  else if (sort === 'recent_activity') walletsQuery = walletsQuery.order('updated_at', { ascending: false })
  // For 'name' we still pre-sort by balance_desc and re-sort after profile join.
  else walletsQuery = walletsQuery.order('balance_cents', { ascending: false })

  walletsQuery = walletsQuery.range((page - 1) * pageSize, page * pageSize - 1)

  let { data: walletsRaw, error: walletsErr, count: totalCount } = await walletsQuery as any

  // Self-heal: if `currency` column is missing, retry with reduced projection.
  if (walletsErr && /column .* does not exist/i.test(walletsErr.message || '')) {
    warnings.push('schema_partial — student_wallets.currency missing; defaulting to USD')
    let fb = db
      .from('student_wallets')
      .select('profile_id, balance_cents, updated_at', { count: 'exact' })
    if (minBalance) fb = fb.gte('balance_cents', Number(minBalance))
    if (maxBalance) fb = fb.lte('balance_cents', Number(maxBalance))
    if (sort === 'balance_desc') fb = fb.order('balance_cents', { ascending: false })
    else if (sort === 'balance_asc') fb = fb.order('balance_cents', { ascending: true })
    else if (sort === 'recent_activity') fb = fb.order('updated_at', { ascending: false })
    else fb = fb.order('balance_cents', { ascending: false })
    fb = fb.range((page - 1) * pageSize, page * pageSize - 1)
    const retry = await fb as any
    walletsRaw = retry.data
    walletsErr = retry.error
    totalCount = retry.count
  }

  if (walletsErr) return fail(walletsErr.message, 500)

  const wallets: any[] = walletsRaw ?? []
  const total = totalCount ?? 0

  if (wallets.length === 0) {
    return ok(
      {
        wallets: [],
        total,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize),
      },
      {},
      warnings.length ? { data_warnings: warnings } : {}
    )
  }

  const profileIds = wallets.map(w => w.profile_id)

  // ── 2. Join profiles ────────────────────────────────────────────────────────
  const profilesRes = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', profileIds)
  const profileMap: Record<string, any> = {}
  for (const p of (profilesRes.data ?? []) as any[]) profileMap[p.id] = p

  // ── 3. Pull last_txn_at + txn_count_30d in a SINGLE batched query ───────────
  const ago30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const lastTxnMap: Record<string, string | null> = {}
  const txnCount30Map: Record<string, number> = {}

  try {
    const { data: txnRows, error: txnErr } = await db
      .from('wallet_transactions')
      .select('profile_id, created_at')
      .in('profile_id', profileIds)
      .order('created_at', { ascending: false })
    if (txnErr) throw txnErr
    for (const t of (txnRows ?? []) as any[]) {
      if (!lastTxnMap[t.profile_id]) lastTxnMap[t.profile_id] = t.created_at
      if (t.created_at >= ago30) {
        txnCount30Map[t.profile_id] = (txnCount30Map[t.profile_id] || 0) + 1
      }
    }
  } catch (e: any) {
    warnings.push(`txn_stats_unavailable: ${e?.message || 'unknown'}`)
  }

  // ── 4. Enrich + post-filter for free-text q ─────────────────────────────────
  let enriched = wallets.map(w => {
    const p = profileMap[w.profile_id] || {}
    return {
      profile_id: w.profile_id,
      full_name: p.full_name || null,
      email: p.email || null,
      role: p.role || null,
      balance_cents: Number(w.balance_cents || 0),
      currency: w.currency || 'USD',
      updated_at: w.updated_at || null,
      last_txn_at: lastTxnMap[w.profile_id] || null,
      txn_count_30d: txnCount30Map[w.profile_id] || 0,
    }
  })

  if (q && q.length >= 2) {
    enriched = enriched.filter(w =>
      [w.full_name, w.email].some(v => v && String(v).toLowerCase().includes(q))
    )
  }

  if (sort === 'name') {
    enriched.sort((a, b) =>
      String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''))
    )
  }

  return ok(
    {
      wallets: enriched,
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    },
    {},
    warnings.length ? { data_warnings: warnings } : {}
  )
}
