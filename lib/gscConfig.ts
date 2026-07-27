/**
 * Resolves the Google Search Console OAuth connection.
 *
 * Source of truth is the public.gsc_connection row (populated by the in-app
 * "Connect Search Console" flow). Falls back to GSC_* env vars so an
 * env-configured deployment keeps working. Read with the service-role key —
 * the table has RLS on with no policies, so it's server-only.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface GscConfig {
  clientId: string | null
  clientSecret: string | null
  refreshToken: string | null
  siteUrl: string | null
}

export async function getGscConfig(): Promise<GscConfig> {
  let row: any = null
  try {
    const db = createSupabaseAdminClient()
    const { data } = await db.from('gsc_connection').select('*').eq('id', 1).maybeSingle()
    row = data
  } catch { /* fall through to env */ }

  return {
    clientId:
      row?.client_id ||
      process.env.GSC_OAUTH_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      null,
    clientSecret:
      row?.client_secret ||
      process.env.GSC_OAUTH_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
      null,
    refreshToken: row?.refresh_token || process.env.GSC_OAUTH_REFRESH_TOKEN || null,
    siteUrl: row?.site_url || process.env.GSC_SITE_URL || null,
  }
}

export async function saveGscConnection(fields: {
  refresh_token?: string
  site_url?: string
  connected_email?: string
}): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from('gsc_connection').upsert({
    id: 1,
    ...fields,
    connected_at: new Date().toISOString(),
  })
}
