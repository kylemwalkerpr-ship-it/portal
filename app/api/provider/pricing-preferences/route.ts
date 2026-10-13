import { requirePortalUser } from '@/lib/portalAuth'
import { validateProviderPricingPreferences } from '@/lib/yqaaProviderControls'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const COLUMNS = 'provider_id, negotiation_enabled, auto_accept_pct, flex_pct, approval_band_pct, max_auto_concessions, prefer_accept, updated_at'

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!PROVIDER_ROLES.has(auth.role)) return Response.json({ error: 'Provider account required.' }, { status: 403 })
  const { data, error } = await auth.db.from('provider_pricing_preferences').select(COLUMNS).eq('provider_id', auth.profileId).maybeSingle()
  if (error) {
    if (/provider_pricing_preferences|relation .* does not exist/i.test(error.message || '')) {
      return Response.json({ preferences: null, available: false })
    }
    return Response.json({ error: 'Could not load pricing preferences.' }, { status: 500 })
  }
  return Response.json({ preferences: data, available: true })
}

export async function PUT(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!PROVIDER_ROLES.has(auth.role)) return Response.json({ error: 'Provider account required.' }, { status: 403 })
  const parsed = validateProviderPricingPreferences(await req.json().catch(() => null))
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
  const { data, error } = await auth.db.from('provider_pricing_preferences').upsert({
    provider_id: auth.profileId,
    ...parsed.value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider_id' }).select(COLUMNS).single()
  if (error) {
    const unavailable = /provider_pricing_preferences|relation .* does not exist/i.test(error.message || '')
    return Response.json({ error: unavailable ? 'Pricing preferences are not available until the additive YQAA migration is applied.' : 'Could not save pricing preferences.' }, { status: unavailable ? 503 : 500 })
  }
  return Response.json({ preferences: data, available: true })
}
