import { ok, fail } from '@/lib/apiEnvelope'
import { getPaymentSettingsForApi } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const settings = await getPaymentSettingsForApi()
  return ok({
    minimum_offer_amount_cents: settings.minimum_offer_amount_cents,
    maximum_offer_amount_cents: settings.maximum_offer_amount_cents,
    minimum_gig_price_cents: settings.minimum_gig_price_cents,
    maximum_gig_price_cents: settings.maximum_gig_price_cents,
    platform_fee_percent: settings.platform_fee_percent,
    attorney_platform_fee_percent: settings.attorney_platform_fee_percent,
    consultant_fee_percent: settings.consultant_fee_percent,
    primary_currency: settings.primary_currency,
    allowed_currencies: settings.allowed_currencies,
  })
}
