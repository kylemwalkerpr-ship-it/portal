import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchBacklinkSnapshot, isBacklinkProviderConfigured } from '@/lib/seoFactory/backlinkProvider'

export const runtime = 'edge'

/**
 * POST /api/seo-engine/backlinks
 *
 * Body: { url: string, jobId?: string }
 *
 * Fetches a live DataForSEO backlink snapshot for `url` and, when `jobId` is
 * given, persists it onto content_jobs.backlinks_json so the Master SEO
 * Engine's links subsystem lights up on the next analysis. Returns a 200
 * with `{ ok: false, reason }` (not an error) when the provider is not
 * configured or the fetch degrades — the engine treats missing backlink data
 * as dark measurement slots, never as a failure.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    let body: { url?: string; jobId?: string } = {}
    try {
      body = (await request.json()) as typeof body
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const url = (body.url || '').trim()
    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    if (!isBacklinkProviderConfigured()) {
      return NextResponse.json({
        ok: false,
        reason: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not configured — links measurement slots stay dark',
      })
    }

    const snapshot = await fetchBacklinkSnapshot(url)
    if (!snapshot) {
      return NextResponse.json({
        ok: false,
        reason: 'DataForSEO returned no usable data (check credentials / account balance)',
      })
    }

    if (body.jobId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { error } = await supabase
        .from('content_jobs')
        .update({ backlinks_json: snapshot, backlinks_fetched_at: snapshot.fetchedAt })
        .eq('id', body.jobId)
      if (error) {
        // Persisting failed but the snapshot is still usable — surface it.
        return NextResponse.json({ ok: true, snapshot, persistError: error.message })
      }
    }

    return NextResponse.json({ ok: true, snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Backlink fetch failed: ${message}` }, { status: 500 })
  }
}
