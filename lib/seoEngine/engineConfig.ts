/**
 * Key/value engine integration config (seo_engine_config).
 * Used for GA4 property wiring and the Ubersuggest MCP toggle.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function loadEngineConfig<T extends object = Record<string, unknown>>(key: string): Promise<T | null> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from('seo_engine_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    const value = (data as { value?: T } | null)?.value
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export async function saveEngineConfig(key: string, value: Record<string, unknown>, updatedBy = 'admin'): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from('seo_engine_config').upsert({
    key,
    value,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  })
  if (error && !/42P01|relation .* does not exist/i.test(error.message)) {
    throw new Error(error.message)
  }
}
