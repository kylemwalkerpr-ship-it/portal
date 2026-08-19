/**
 * GET /api/content-studio/system-health
 *
 * Aggregates system health metrics for the Configure tab's summary card:
 * - Total API keys configured (from ai_provider_keys)
 * - GSC connection status (from gsc_tokens + service account)
 * - Site scan last-run timestamp (from content_jobs audit activity)
 * - Interlink registry size (from seo_interlinks)
 *
 * Admin-only. Returns lightweight aggregate counts — no row data.
 */

import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscConfig } from '@/lib/gscConfig'
import { loadGa4Config } from '@/lib/seoEngine/ga4'
import { loadUbersuggestConfig } from '@/lib/seoEngine/ubersuggest'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // ── API keys configured ──
    const { count: apiKeysCount, error: keysError } = await supabase
      .from('ai_provider_keys')
      .select('*', { count: 'exact', head: true })
      .eq('enabled', true)
      .not('api_key', 'is', null)

    // ── GSC connection ──
    // Source of truth is the same one the rest of the studio uses:
    // public.gsc_connection (single row) + GSC_* env vars, resolved by
    // lib/gscConfig. The legacy gsc_tokens / gsc_service_account_keys
    // tables were never the runtime source (gsc_tokens has no site_url
    // column), so reading them left this card stuck on "Offline · no token"
    // even while the Worker had a service-account key synced.
    const gscCfg = await getGscConfig()
    const gscMode =
      gscCfg.refreshToken && gscCfg.clientId && gscCfg.clientSecret
        ? 'oauth'
        : gscCfg.serviceAccountKey
          ? 'service_account'
          : null
    const gscConnected = gscMode !== null && Boolean(gscCfg.siteUrl)
    const gscEmail = gscCfg.connectedEmail ?? null
    const gscExpiresAt = null
    const gscConnectedSince = gscCfg.connectedAt ?? null
    const ga4Cfg = await loadGa4Config().catch(() => ({ enabled: false, propertyId: '' }))
    const uberCfg = await loadUbersuggestConfig().catch(() => ({ enabled: false, accessToken: '' }))
    const ga4Connected = Boolean(ga4Cfg.enabled && ga4Cfg.propertyId)
    const ubersuggestConnected = Boolean(uberCfg.enabled && uberCfg.accessToken)

    // ── Interlink registry size ──
    const { count: interlinkCount, error: interlinkError } = await supabase
      .from('seo_interlinks')
      .select('*', { count: 'exact', head: true })

    // Active interlinks (status = 'active' or 'live')
    const { count: activeInterlinks, error: activeError } = await supabase
      .from('seo_interlinks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    // ── Site scan last-run ──
    // Track the most recent job audit or site health activity as a proxy
    // for when the site was last scanned.
    const { data: lastAudit, error: auditError } = await supabase
      .from('content_jobs')
      .select('updated_at, audit_json')
      .not('audit_json', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)

    const lastSiteScan = (!auditError && lastAudit && lastAudit.length > 0)
      ? lastAudit[0].updated_at
      : null

    // ── Total jobs shipped ──
    const { count: shippedCount, error: shippedError } = await supabase
      .from('content_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'merged')

    return NextResponse.json({
      ok: true,
      apiKeysConfigured: (!keysError ? apiKeysCount : null) ?? 0,
      gscConnected,
      gscMode,
      ga4Connected,
      ubersuggestConnected,
      gscEmail,
      gscExpiresAt,
      gscConnectedSince,
      interlinkTotal: (!interlinkError ? interlinkCount : null) ?? 0,
      interlinkActive: (!activeError ? activeInterlinks : null) ?? 0,
      lastSiteScan,
      totalShipped: (!shippedError ? shippedCount : null) ?? 0,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
