import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPlatformSettings } from '@/lib/platformConfig'

export async function GET() {
  const db = createSupabaseAdminClient()
  const [servicesRes, settings] = await Promise.all([
    db
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('title', { ascending: true }),
    getPlatformSettings(),
  ])

  if (servicesRes.error) return Response.json({ error: servicesRes.error.message }, { status: 500 })

  return Response.json({
    services: servicesRes.data ?? [],
    primaryCurrency: settings.primary_currency,
    rates: {
      usd_to_cad: Number(settings.usd_to_cad_rate),
    },
  })
}
