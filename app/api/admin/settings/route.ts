import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { DEFAULT_PLATFORM_SETTINGS, normalizePrimaryCurrency } from '@/lib/platformConfig'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data } = await auth.db
    .from('platform_settings')
    .select('value')
    .eq('key', 'default')
    .single()

  return Response.json({ settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(data?.value || {}) } })
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const consultantFee = Math.min(100, Math.max(0, Number(body.consultant_fee_percent ?? DEFAULT_PLATFORM_SETTINGS.consultant_fee_percent)))
  const platformFee = 100 - consultantFee
  // Attorney platform fee is additive (on top of attorney's fee) for ABA 5.4
  // compliance, so it follows different bounds than the consultant split.
  const rawAttorneyFee = Number(
    body.attorney_platform_fee_percent ??
      (DEFAULT_PLATFORM_SETTINGS as Record<string, unknown>).attorney_platform_fee_percent ??
      25,
  )
  const attorneyPlatformFee = Number.isFinite(rawAttorneyFee)
    ? Math.min(50, Math.max(0, Math.round(rawAttorneyFee)))
    : 25
  const autoReleaseDays = body.auto_release_days === 'never'
    ? 'never'
    : Math.min(90, Math.max(1, Number(body.auto_release_days ?? DEFAULT_PLATFORM_SETTINGS.auto_release_days)))

  const sanitizeRate = (raw: unknown, fallback: number) => {
    const n = Number(raw ?? fallback)
    return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(0.1, Number(n.toFixed(4)))) : fallback
  }
  const usdToCadRate = sanitizeRate(body.usd_to_cad_rate, DEFAULT_PLATFORM_SETTINGS.usd_to_cad_rate)
  const usdToGbpRate = sanitizeRate(body.usd_to_gbp_rate, DEFAULT_PLATFORM_SETTINGS.usd_to_gbp_rate)
  const usdToAudRate = sanitizeRate(body.usd_to_aud_rate, DEFAULT_PLATFORM_SETTINGS.usd_to_aud_rate)

  const settings = {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...body,
    consultant_fee_percent: consultantFee,
    platform_fee_percent: platformFee,
    attorney_platform_fee_percent: attorneyPlatformFee,
    auto_release_days: autoReleaseDays,
    allow_admin_force_release: Boolean(body.allow_admin_force_release),
    // Card top-ups: only disabled when explicitly false (fail-open so a
    // missing field never silently kills billing).
    wallet_topup_enabled: body.wallet_topup_enabled !== false,
    primary_currency: normalizePrimaryCurrency(body.primary_currency ?? DEFAULT_PLATFORM_SETTINGS.primary_currency),
    usd_to_cad_rate: usdToCadRate,
    usd_to_gbp_rate: usdToGbpRate,
    usd_to_aud_rate: usdToAudRate,
  }

  const { data, error } = await auth.db
    .from('platform_settings')
    .upsert({
      key: 'default',
      value: settings,
      updated_at: new Date().toISOString(),
    })
    .select('value')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ settings: data.value })
}
