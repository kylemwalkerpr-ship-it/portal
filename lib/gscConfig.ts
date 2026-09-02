/**
 * Resolves the Google Search Console OAuth connection.
 *
 * Source of truth is the public.gsc_connection row (populated by the in-app
 * "Connect Search Console" flow). Falls back to GSC_* env vars so an
 * env-configured deployment keeps working. Read with the service-role key —
 * the table has RLS on with no policies, so it's server-only.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { isLegacyJwtKey } from '@/lib/supabaseKey'

export interface GscConfig {
  clientId: string | null
  clientSecret: string | null
  refreshToken: string | null
  serviceAccountKey: string | null
  siteUrl: string | null
  connectedEmail: string | null
  connectedAt: string | null
}

export async function getGscConfig(): Promise<GscConfig> {
  let row: any = null
  // The newer `sb_secret_…` service-role key isn't accepted by supabase-js v2
  // ("Unregistered API key"), so skip the server-only gsc_connection read and
  // fall straight through to the GSC_* env vars. Only a legacy `eyJ…` JWT
  // (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_JWT) can read that row
  // (see isLegacyJwtKey). This keeps an env-configured deployment (or local
  // machine with the new key format) working via GSC_SERVICE_ACCOUNT_JSON +
  // GSC_SITE_URL without a doomed DB round-trip.
  const canReadGscRow =
    isLegacyJwtKey(process.env.SUPABASE_SERVICE_ROLE_JWT) ||
    isLegacyJwtKey(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (canReadGscRow) {
    try {
      const db = createSupabaseAdminClient()
      const { data } = await db.from('gsc_connection').select('*').eq('id', 1).maybeSingle()
      row = data
    } catch { /* fall through to env */ }
  }

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
    serviceAccountKey:
      row?.service_account_key ||
      process.env.GSC_SERVICE_ACCOUNT_JSON ||
      process.env.GSC_SERVICE_ACCOUNT_KEY ||
      null,
    siteUrl: row?.site_url || process.env.GSC_SITE_URL || null,
    connectedEmail: row?.connected_email || null,
    connectedAt: row?.connected_at || null,
  }
}

export async function saveGscConnection(fields: {
  refresh_token?: string
  site_url?: string
  connected_email?: string
  service_account_key?: string
}): Promise<void> {
  // Never lie: if the upsert fails (e.g. only an anon key is usable and the
  // table has no anon policies), the connect UI must see the failure.
  const db = createSupabaseAdminClient()
  const { error } = await db.from('gsc_connection').upsert({
    id: 1,
    ...fields,
    connected_at: new Date().toISOString(),
  })
  if (error) {
    throw new Error(
      `saveGscConnection failed (${error.message}). If SUPABASE_SERVICE_ROLE_KEY is the new sb_secret_ format, set SUPABASE_SERVICE_ROLE_JWT (legacy service-role JWT) so in-app GSC connections can persist.`,
    )
  }
}
