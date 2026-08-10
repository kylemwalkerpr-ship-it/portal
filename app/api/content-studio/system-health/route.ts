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
    const { data: gscTokens, error: gscError } = await supabase
      .from('gsc_tokens')
      .select('google_email, expires_at, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    const gscConnected = (!gscError && gscTokens && gscTokens.length > 0) ?? false
    const gscEmail = gscTokens?.[0]?.google_email ?? null
    const gscExpiresAt = gscTokens?.[0]?.expires_at ?? null
    const gscConnectedSince = gscTokens?.[0]?.created_at ?? null

    // ── Service account GSC connection ──
    const { count: saCount, error: saError } = await supabase
      .from('gsc_service_account_keys')
      .select('*', { count: 'exact', head: true })

    const gscMode = (!saError && saCount && saCount > 0)
      ? 'service_account'
      : gscConnected
        ? 'oauth'
        : null

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
