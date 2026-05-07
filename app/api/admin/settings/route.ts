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
  const consultantFee = Math.min(95, Math.max(5, Number(body.consultant_fee_percent ?? DEFAULT_PLATFORM_SETTINGS.consultant_fee_percent)))
  const platformFee = 100 - consultantFee
  const autoReleaseDays = body.auto_release_days === 'never'
    ? 'never'
    : Math.min(90, Math.max(1, Number(body.auto_release_days ?? DEFAULT_PLATFORM_SETTINGS.auto_release_days)))

  const settings = {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...body,
    consultant_fee_percent: consultantFee,
    platform_fee_percent: platformFee,
    auto_release_days: autoReleaseDays,
    allow_admin_force_release: Boolean(body.allow_admin_force_release),
    primary_currency: normalizePrimaryCurrency(body.primary_currency ?? DEFAULT_PLATFORM_SETTINGS.primary_currency),
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
