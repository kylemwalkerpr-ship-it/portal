import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPlatformSettings } from '@/lib/platformConfig'

export async function GET() {
  const db = createSupabaseAdminClient()
  const [{ data: templates, error }, settings] = await Promise.all([
    db
      .from('services')
      .select('*')
      .eq('product_type', 'template')
      .eq('status', 'active')
      .eq('is_active', true)
      .order('region', { ascending: true })
      .order('title', { ascending: true }),
    getPlatformSettings(),
  ])

  if (error) {
    if (/product_type|status|schema cache|column/i.test(error.message)) {
      return Response.json({
        templates: [],
        primaryCurrency: settings.primary_currency,
        rates: { usd_to_cad: Number(settings.usd_to_cad_rate), usd_to_gbp: Number((settings as any).usd_to_gbp_rate || 0.79), usd_to_aud: Number((settings as any).usd_to_aud_rate || 1.52) },
      })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    templates: (templates ?? []).map((template) => ({
      ...template,
      product_type: 'template',
      category: 'template',
      catalogue_category: 'Templates',
      price_usd: Number(template.usd_price ?? template.price ?? 0),
      currency_base: template.currency_base || 'USD',
      delivery_type: template.delivery_type || 'Digital Template',
    })),
    primaryCurrency: settings.primary_currency,
    rates: { usd_to_cad: Number(settings.usd_to_cad_rate), usd_to_gbp: Number((settings as any).usd_to_gbp_rate || 0.79), usd_to_aud: Number((settings as any).usd_to_aud_rate || 1.52) },
  })
}
