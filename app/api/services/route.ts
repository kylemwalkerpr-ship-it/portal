import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPlatformSettings, normalizeVertical } from '@/lib/platformConfig'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const verticalParam = url.searchParams.get('vertical')
  // Only filter when the caller asked for a specific vertical. If absent we
  // return every active service so the admin and existing storefront keep
  // working exactly as before.
  const vertical = verticalParam ? normalizeVertical(verticalParam) : null

  const db = createSupabaseAdminClient()
  let query = db
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('title', { ascending: true })

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const [{ data: services, error }, settings] = await Promise.all([
    query,
    getPlatformSettings(),
  ])

  if (error) {
    // Older databases may not have the vertical column yet — retry without
    // the filter so the storefront degrades gracefully until the migration
    // runs.
    if (vertical && /column .*vertical/i.test(error.message)) {
      const { data: legacyServices, error: legacyErr } = await db
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('title', { ascending: true })
      if (legacyErr) return Response.json({ error: legacyErr.message }, { status: 500 })
      return Response.json({
        services: (legacyServices ?? []).map((service) => ({ ...service, currency: 'usd' })),
        primaryCurrency: settings.primary_currency,
        rates: { usd_to_cad: Number(settings.usd_to_cad_rate) },
        vertical,
      })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    services: (services ?? []).map((service) => ({ ...service, currency: 'usd' })),
    primaryCurrency: settings.primary_currency,
    rates: { usd_to_cad: Number(settings.usd_to_cad_rate) },
    vertical,
  })
}
