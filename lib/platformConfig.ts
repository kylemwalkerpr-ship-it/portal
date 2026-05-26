import { createSupabaseAdminClient } from './supabase'

export const SUPPORTED_CURRENCIES = ['usd', 'cad'] as const
export type PrimaryCurrency = typeof SUPPORTED_CURRENCIES[number]

/**
 * Verticals = which product the user is engaging with on the portal:
 *
 *   - 'study_abroad' is the original YouSafe Consultancy catalogue
 *     (visa consulting, university admissions, settlement support,
 *     mentorship). Surfaces on yousafeconsultancy.com / ca / usa.
 *
 *   - 'legal' is the document-prep + attorney-review catalogue
 *     surfaced on caseworks (legal.yousafeconsultancy.com).
 *
 * Profiles, services, and consultants all carry a vertical tag so the
 * admin can run both catalogues from a single backend.
 */
export const SUPPORTED_VERTICALS = ['study_abroad', 'legal'] as const
export type Vertical = typeof SUPPORTED_VERTICALS[number]

export function normalizeVertical(value: unknown): Vertical {
  return (SUPPORTED_VERTICALS as readonly string[]).includes(String(value || ''))
    ? (String(value) as Vertical)
    : 'study_abroad'
}

export const DEFAULT_PLATFORM_SETTINGS = {
  platform_fee_percent: 20,
  consultant_fee_percent: 80,
  // Attorney offers use additive (not split) pricing for ABA Rule 5.4
  // compliance: client pays attorney_fee + this percent on top, the attorney
  // gets the full attorney_fee, the platform keeps the percent as its
  // application fee. Adjust here or via the admin Settings panel.
  attorney_platform_fee_percent: 25,
  auto_release_days: 14,
  allow_admin_force_release: true,
  platform_name: 'YouSafe Consultancy',
  support_email: 'support@yousafeconsultancy.com',
  primary_currency: 'usd' as PrimaryCurrency,
  // Used by the storefront to display prices in the user's chosen currency.
  // Admin-controlled rather than auto-fetched: each service charges in its
  // own native currency at checkout, so this is purely a display conversion.
  usd_to_cad_rate: 1.37,
}

/**
 * @deprecated Read from getPlatformSettings().primary_currency at call sites
 * that need the live admin-controlled value. Kept for any caller still using it.
 */
export const CONNECT_CURRENCY = 'usd'

export function normalizePrimaryCurrency(value: unknown): PrimaryCurrency {
  const lower = typeof value === 'string' ? value.toLowerCase() : ''
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(lower) ? (lower as PrimaryCurrency) : 'usd'
}

export async function getPlatformSettings() {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'default')
    .single()

  if (error || !data?.value) return DEFAULT_PLATFORM_SETTINGS

  const merged = {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...(data.value as Record<string, unknown>),
  }
  // Always normalise primary_currency so downstream payment calls never see a
  // typo or wrong case.
  merged.primary_currency = normalizePrimaryCurrency(merged.primary_currency)
  const rate = Number(merged.usd_to_cad_rate)
  merged.usd_to_cad_rate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PLATFORM_SETTINGS.usd_to_cad_rate
  return merged
}
