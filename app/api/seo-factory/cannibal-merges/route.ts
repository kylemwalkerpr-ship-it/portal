import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { clusterIdFromTerm } from '@/lib/seoFactory/cannibalMerge'

/**
 * GET /api/seo-factory/cannibal-merges
 * Shared merge-decision history (both sources) for the deployed Content Studio.
 * Returns the latest 100 decisions, newest first.
 *
 * POST /api/seo-factory/cannibal-merges
 * Upsert a merge decision into the shared cannibal_merges table.
 * Body: { term, winnerUrl, loserUrls?, redirectsCreated?, prUrl?, prNumber?,
 *         status?: 'merged'|'skipped', message?, source?: 'portal' }
 * The deterministic cluster id is derived from the term stem so both products
 * write/read the same key.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('cannibal_merges')
      .select(
        'cluster_id,source,stem,terms,winner_url,loser_urls,redirects_created,pr_url,pr_number,status,message,merged_at,resolution_type,follow_up_at,differentiation_plan',
      )
      .order('merged_at', { ascending: false })
      .limit(100)

    if (error) {
      if (/42P01|relation .* does not exist/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'cannibal_merges table does not exist yet',
            guidance:
              'Run supabase/migrations/20260808_cannibal_merges.sql once in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      console.error('[cannibal-merges]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      merges: (data ?? []).map((r) => ({
        clusterId: r.cluster_id,
        source: r.source,
        stem: r.stem,
        terms: Array.isArray(r.terms) ? r.terms : [],
        winnerUrl: r.winner_url,
        loserUrls: Array.isArray(r.loser_urls) ? r.loser_urls : [],
        redirectsCreated: r.redirects_created ?? 0,
        prUrl: r.pr_url ?? undefined,
        prNumber: r.pr_number ?? undefined,
        status: r.status,
        message: r.message ?? undefined,
        resolutionType: r.resolution_type ?? (r.status === 'merged' ? 'consolidate' : 'defer'),
        followUpAt: r.follow_up_at ? new Date(r.follow_up_at).getTime() : undefined,
        differentiationPlan: Array.isArray(r.differentiation_plan) ? r.differentiation_plan : undefined,
        recheckDue: Boolean(r.follow_up_at && new Date(r.follow_up_at).getTime() <= Date.now()),
        mergedAt: r.merged_at ? new Date(r.merged_at).getTime() : Date.now(),
      })),
    })
  } catch (err) {
    console.error('[cannibal-merges]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cannibal merges list failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    const resolutionType = ['consolidate', 'differentiate', 'defer'].includes(String(body.resolutionType))
      ? String(body.resolutionType)
      : 'consolidate'
    const winnerUrl = String(body.winnerUrl || '').trim()
    if (!term || (resolutionType === 'consolidate' && !winnerUrl)) {
      return NextResponse.json(
        { error: resolutionType === 'consolidate' ? 'term and winnerUrl are required to record a consolidation.' : 'term is required to record this resolution.' },
        { status: 400 },
      )
    }

    const loserUrls = Array.isArray(body.loserUrls)
      ? body.loserUrls.map(String).slice(0, 50)
      : []
    const status = body.status === 'differentiating'
      ? 'differentiating'
      : body.status === 'deferred'
        ? 'deferred'
        : body.status === 'skipped'
          ? 'skipped'
          : 'merged'
    const source = body.source === 'command_center' ? 'command_center' : 'portal'
    const prNumber = Number(body.prNumber) > 0 ? Number(body.prNumber) : null
    const followUpAt = body.followUpAt ? new Date(Number(body.followUpAt)).toISOString() : null

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('cannibal_merges')
      .upsert(
        {
          cluster_id: String(body.clusterId || clusterIdFromTerm(term)),
          source,
          stem: String(body.stem || '').trim().slice(0, 200) || clusterIdFromTerm(term),
          terms: JSON.stringify(
            Array.isArray(body.terms) && body.terms.length > 0
              ? body.terms.map(String).slice(0, 20)
              : [term],
          ),
          winner_url: winnerUrl,
          loser_urls: JSON.stringify(loserUrls),
          redirects_created: Number(body.redirectsCreated) > 0 ? Number(body.redirectsCreated) : 0,
          pr_url: String(body.prUrl || '').trim() || null,
          pr_number: prNumber,
          status,
          resolution_type: resolutionType,
          follow_up_at: followUpAt,
          differentiation_plan: Array.isArray(body.differentiationPlan) ? body.differentiationPlan : null,
          message: String(body.message || '').trim().slice(0, 500) || null,
          merged_at: new Date().toISOString(),
        },
        { onConflict: 'cluster_id,source' },
      )
      .select('cluster_id,source,status,winner_url,merged_at')
      .single()

    if (error) {
      if (/42P01|relation .* does not exist/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'cannibal_merges table does not exist yet',
            guidance:
              'Run supabase/migrations/20260808_cannibal_merges.sql once in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      console.error('[cannibal-merges]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, merge: data })
  } catch (err) {
    console.error('[cannibal-merges]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cannibal merges upsert failed' },
      { status: 500 },
    )
  }
}
