import { createSupabaseAdminClient } from './supabase'

export const DEFAULT_PLATFORM_SETTINGS = {
  platform_fee_percent: 20,
  consultant_fee_percent: 80,
  auto_release_days: 14,
  allow_admin_force_release: true,
  platform_name: 'Yousafe Consultancy',
  support_email: 'support@yousafeconsultancy.com',
}

export const CONNECT_CURRENCY = 'usd'

export async function getPlatformSettings() {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'default')
    .single()

  if (error || !data?.value) return DEFAULT_PLATFORM_SETTINGS

  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...(data.value as Record<string, unknown>),
  }
}
